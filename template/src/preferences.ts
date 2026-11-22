// Device preferences: motion, contrast and print paper. Pure.
// The app has two motion choices. "Reduce motion" is a choice of the keeper, so it holds whatever the
// system says. "Follow device motion" hands the choice to the system. The app never overrides a system
// request for less motion.

export interface Settings {
  motion: "follow" | "reduce";
  contrast: "standard" | "high";
  paper: "A4" | "Letter";
}

export const DEFAULT_SETTINGS: Settings = { motion: "follow", contrast: "standard", paper: "A4" };

/** The one local storage key of the app. It holds the three choices and no private value. */
export const SETTINGS_KEY = "plotwarden.settings";

/** The part of `Storage` that settings use. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Read stored text. Any damage falls back to the default of that one choice. */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return { ...DEFAULT_SETTINGS };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_SETTINGS };
  const v = value as Record<string, unknown>;
  return {
    motion: v["motion"] === "reduce" ? "reduce" : "follow",
    contrast: v["contrast"] === "high" ? "high" : "standard",
    paper: v["paper"] === "Letter" ? "Letter" : "A4",
  };
}

/** Write exactly the three choices, in a fixed order. */
export function serializeSettings(settings: Settings): string {
  return JSON.stringify({ motion: settings.motion, contrast: settings.contrast, paper: settings.paper });
}

export function loadSettings(storage: SettingsStorage | undefined): Settings {
  if (storage === undefined) return { ...DEFAULT_SETTINGS };
  try {
    return parseSettings(storage.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** True when the value was stored. A refusing store is not an error: the setting still holds for the page. */
export function saveSettings(storage: SettingsStorage | undefined, settings: Settings): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(SETTINGS_KEY, serializeSettings(settings));
    return true;
  } catch {
    return false;
  }
}

/** The motion the page runs after the app choice and the system request are combined. */
export function resolveMotion(settings: Settings, systemReduces: boolean): "reduce" | "allow" {
  return settings.motion === "reduce" || systemReduces ? "reduce" : "allow";
}

export interface ThemeAttributes {
  motion: "reduce" | "allow";
  motionSetting: Settings["motion"];
  contrast: Settings["contrast"];
  /** The decorative mist is drawn. */
  mist: boolean;
}

export function themeAttributes(settings: Settings, systemReduces: boolean): ThemeAttributes {
  const motion = resolveMotion(settings, systemReduces);
  return { motion, motionSetting: settings.motion, contrast: settings.contrast, mist: motion === "allow" && settings.contrast === "standard" };
}
