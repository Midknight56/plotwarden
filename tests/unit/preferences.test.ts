// T29 (spec 06, task 6.2): device preferences. Reduced motion from the system or from the app, the app
// choice winning when it is set, high contrast, damaged storage, one device key with no private value, and
// a reset that touches one register only. Requirements Z2 and R23.3.
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { allotRegister } from "../../apps/allotment-register/src/adapter";
import { thimbleBeds } from "../../apps/allotment-register/src/walkthrough";
import { churchRegister } from "../../apps/churchyard-register/src/adapter";
import { lanternFold } from "../../apps/churchyard-register/src/walkthrough";
import { openRegisterDb } from "../../template/src/data/db";
import { restartWalkthrough, seedWalkthrough } from "../../template/src/data/seed";
import { removeSite } from "../../template/src/data/siteAdmin";
import { listSites, readEvents, readSite, saveNewSite } from "../../template/src/data/transaction";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
  parseSettings,
  resolveMotion,
  saveSettings,
  serializeSettings,
  themeAttributes,
} from "../../template/src/preferences";
import type { Settings, SettingsStorage } from "../../template/src/preferences";
import { createSite, mintId } from "../../template/src/site";

function memoryStorage(initial: Record<string, string> = {}): SettingsStorage & { keys(): string[]; map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    keys: () => [...map.keys()],
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });

describe("the defaults", () => {
  it("follow the device, standard contrast, A4 paper", () => {
    expect(DEFAULT_SETTINGS).toEqual({ motion: "follow", contrast: "standard", paper: "A4" });
  });
});

describe("resolved motion: the app choice wins when it is set", () => {
  // The table is typed from the rule: reduce is a choice of the keeper, follow hands the choice to the system.
  const table: [Settings["motion"], boolean, "reduce" | "allow"][] = [
    ["follow", false, "allow"],
    ["follow", true, "reduce"],
    ["reduce", false, "reduce"],
    ["reduce", true, "reduce"],
  ];
  for (const [motion, system, expected] of table) {
    it(`app ${motion}, system ${system ? "asks for less" : "no preference"} gives ${expected}`, () => {
      expect(resolveMotion(settings({ motion }), system)).toBe(expected);
    });
  }
});

describe("the page attributes", () => {
  it("draw the mist only when motion is allowed and contrast is standard", () => {
    expect(themeAttributes(settings(), false)).toEqual({ motion: "allow", motionSetting: "follow", contrast: "standard", mist: true });
  });

  it("hide the mist and say reduce when the system asks for less motion and the app follows it", () => {
    expect(themeAttributes(settings(), true)).toEqual({ motion: "reduce", motionSetting: "follow", contrast: "standard", mist: false });
  });

  it("hide the mist when the app says reduce, even if the system has no preference", () => {
    expect(themeAttributes(settings({ motion: "reduce" }), false)).toMatchObject({ motion: "reduce", mist: false });
  });

  it("hide the mist in high contrast, even when motion is allowed", () => {
    expect(themeAttributes(settings({ contrast: "high" }), false)).toEqual({ motion: "allow", motionSetting: "follow", contrast: "high", mist: false });
  });

  it("follow a change of the system setting at once while the app follows the device", () => {
    const s = settings();
    expect(themeAttributes(s, false).motion).toBe("allow");
    expect(themeAttributes(s, true).motion).toBe("reduce");
    expect(themeAttributes(s, false).motion).toBe("allow");
  });
});

describe("reading stored settings", () => {
  it("gives the defaults for no value", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("round trips a saved value", () => {
    const s = settings({ motion: "reduce", contrast: "high", paper: "Letter" });
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it("falls back to the default for the whole value when it is not JSON, an array or null", () => {
    for (const raw of ["", "{", "[]", "null", "42", '"high"']) expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to the default for one unknown choice and keeps the others", () => {
    expect(parseSettings(JSON.stringify({ motion: "sparkle", contrast: "high", paper: "Letter" }))).toEqual({ motion: "follow", contrast: "high", paper: "Letter" });
    expect(parseSettings(JSON.stringify({ motion: "reduce", contrast: 7, paper: "A3" }))).toEqual({ motion: "reduce", contrast: "standard", paper: "A4" });
  });

  it("ignores any other key, so a private value cannot ride along", () => {
    const raw = JSON.stringify({ motion: "reduce", contrast: "high", paper: "A4", lastSite: "Lantern Fold", name: "Mirel Quillmoss" });
    const read = parseSettings(raw);
    expect(Object.keys(read).sort()).toEqual(["contrast", "motion", "paper"]);
    expect(serializeSettings(read)).not.toContain("Lantern");
    expect(serializeSettings(read)).not.toContain("Quillmoss");
  });
});

describe("saving settings", () => {
  it("uses one device key and holds only the three choices", () => {
    const storage = memoryStorage();
    expect(saveSettings(storage, settings({ motion: "reduce", paper: "Letter" }))).toBe(true);
    expect(storage.keys()).toEqual([SETTINGS_KEY]);
    expect(SETTINGS_KEY).toBe("plotwarden.settings");
    expect(JSON.parse(storage.map.get(SETTINGS_KEY) as string)).toEqual({ motion: "reduce", contrast: "standard", paper: "Letter" });
  });

  it("is read back by the next load", () => {
    const storage = memoryStorage();
    saveSettings(storage, settings({ contrast: "high" }));
    expect(loadSettings(storage)).toEqual(settings({ contrast: "high" }));
  });

  it("says false and does not throw when storage refuses, and loads the defaults with no storage at all", () => {
    const refusing: SettingsStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(saveSettings(refusing, settings())).toBe(false);
    expect(loadSettings(refusing)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(undefined, settings())).toBe(false);
  });
});

describe("a reset touches one register only", () => {
  let db: IDBDatabase;
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${(0x700000 + ++n).toString(16).padStart(12, "0")}`;

  beforeEach(async () => {
    n = 0;
    const opened = await openRegisterDb(new IDBFactory());
    if (!opened.ok) throw new Error("storage");
    db = opened.value;
  });

  async function own(kind: string, title: string) {
    const made = createSite({ id: mintId(), lineageId: mintId(), siteKey: mintId(), kind, title, zone: "Europe/London", createdAt: "2026-01-01T00:00:00.000Z" });
    if (!made.ok) throw new Error("site");
    await saveNewSite(db, made.value);
    return made.value;
  }

  /** Everything stored for a set of sites, as plain text, so two snapshots can be compared. */
  async function snapshot(ids: string[]): Promise<string> {
    const out: unknown[] = [];
    for (const id of ids) out.push(await readSite(db, id), await readEvents(db, id));
    return JSON.stringify(out);
  }

  it("restarting one practice register changes no setting, no own register and not the other app's practice register", async () => {
    const storage = memoryStorage();
    saveSettings(storage, settings({ motion: "reduce", contrast: "high", paper: "Letter" }));
    const storedBefore = storage.map.get(SETTINGS_KEY);

    const ownChurch = await own("churchyard", "St Aldhelm's Churchyard");
    const ownGarden = await own("allotment", "Orchard Close Allotments");
    const fold = await seedWalkthrough(db, churchRegister() as never, lanternFold, { newId });
    const beds = await seedWalkthrough(db, allotRegister() as never, thimbleBeds, { newId });
    if (!fold.ok || !beds.ok) throw new Error("seed");

    const keep = await snapshot([ownChurch.id, ownGarden.id, beds.value.id]);
    const again = await restartWalkthrough(db, churchRegister() as never, lanternFold, { newId });
    expect(again.ok).toBe(true);
    if (!again.ok) return;

    expect(again.value.id).not.toBe(fold.value.id);
    expect(await readSite(db, fold.value.id)).toBeUndefined();
    expect(await snapshot([ownChurch.id, ownGarden.id, beds.value.id])).toBe(keep);
    expect(storage.map.get(SETTINGS_KEY)).toBe(storedBefore);
    expect(loadSettings(storage)).toEqual(settings({ motion: "reduce", contrast: "high", paper: "Letter" }));
    expect((await listSites(db)).map((s) => s.title).sort()).toEqual(["Lantern Fold", "Orchard Close Allotments", "St Aldhelm's Churchyard", "Thimble Beds"]);
  });

  it("removing one own register leaves the other registers and the settings as they were", async () => {
    const storage = memoryStorage();
    saveSettings(storage, settings({ motion: "reduce" }));
    const a = await own("churchyard", "Yew Lane Churchyard");
    const b = await own("churchyard", "Hill Churchyard");
    const beds = await seedWalkthrough(db, allotRegister() as never, thimbleBeds, { newId });
    if (!beds.ok) throw new Error("seed");
    const keep = await snapshot([b.id, beds.value.id]);
    const removed = await removeSite(db, a.id, a.title);
    expect(removed.ok).toBe(true);
    expect(await readSite(db, a.id)).toBeUndefined();
    expect(await snapshot([b.id, beds.value.id])).toBe(keep);
    expect(loadSettings(storage).motion).toBe("reduce");
  });
});
