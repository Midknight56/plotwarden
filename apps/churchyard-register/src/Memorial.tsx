// The words on a stone: the reading, its status, and the private photos that go with it.
// The wording keeps every line break. Nothing here reaches a visitor or a committee file.
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { livePhotos } from "../../../template/src/notes";
import { useBlobUrl } from "../../../template/src/ui/blobUrl";
import { Button, ButtonLink, RadioGroup, TextArea, TextField } from "../../../template/src/ui/controls";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { useIntent, useChurch } from "./intent";
import type { Burial } from "./types";

function Photo({ blobId, alt }: { blobId: string; alt: string }) {
  const open = useChurch();
  const url = useBlobUrl(open.site.id, blobId);
  return url === undefined ? null : <img className="photo" src={url} alt={alt} />;
}

export function StoneSection({ burial }: { burial: Burial }) {
  const { t, newId } = useShell();
  const open = useChurch();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const memorial = Object.values(open.state.memorials).find((m) => m.burialId === burial.burialId);
  const [reading, setReading] = useState(memorial?.reading ?? "");
  const [status, setStatus] = useState<"clear" | "unclear">(memorial?.unclear === true ? "unclear" : "clear");
  const [pageRef, setPageRef] = useState(memorial?.pageRef ?? "");
  const memorialId = useRef(memorial?.memorialId ?? newId());
  const photos = burial.plotId === undefined ? [] : livePhotos(open.state.notes, burial.plotId);
  const linked = photos.filter((p) => memorial?.photoIds.includes(p.photoId) === true);
  const unlinked = photos.filter((p) => memorial?.photoIds.includes(p.photoId) !== true);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    await intent.send(
      [{ type: "save_reading", memorialId: memorialId.current, burialId: burial.burialId, reading, unclear: status === "unclear", ...(pageRef.trim() === "" ? {} : { pageRef }) }],
      { done: t("readingSaved") },
    );
  };

  return (
    <section className="card stack" aria-labelledby="stone-heading">
      <h2 id="stone-heading">{t("wordsOnStone")}</h2>
      {memorial === undefined ? <p>{t("noReadingYet")}</p> : <p className="inscription">{memorial.reading}</p>}
      {memorial?.unclear === true ? <p className="notice info">{t("markedForReading")}</p> : null}
      <form ref={form} className="stack" onSubmit={(e) => void save(e)} noValidate>
        <TextArea label={t("wordsOnStone")} hint={t("keepLineBreaks")} value={reading} onChange={setReading} error={intent.fieldErrors["reading"]} rows={6} spellCheck={false} />
        <RadioGroup
          legend={t("readingStatus")}
          name="reading-status"
          value={status}
          onChange={(v) => setStatus(v as "clear" | "unclear")}
          options={[
            { value: "clear", label: t("readingClear") },
            { value: "unclear", label: t("unclearLetters") },
          ]}
        />
        <TextField label={t("pageLabel")} value={pageRef} onChange={setPageRef} autoComplete="off" />
        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
        <div className="actions">
          <Button primary type="submit" disabled={intent.busy}>
            {t("saveReading")}
          </Button>
          {memorial?.unclear === true ? (
            <Button
              disabled={intent.busy}
              onClick={() => {
                setStatus("clear");
                void intent.send([{ type: "settle_reading", memorialId: memorial.memorialId }], { done: t("readingSettled") });
              }}
            >
              {t("reviewReading")}
            </Button>
          ) : null}
        </div>
      </form>

      <h3>{t("stonePhoto")}</h3>
      {burial.plotId === undefined ? null : (
        <div className="actions">
          <ButtonLink href={`#/r/${open.site.id}/plot/${burial.plotId}`}>{t("addStonePhoto")}</ButtonLink>
        </div>
      )}
      {photos.length === 0 ? <p>{t("noStonePhotos")}</p> : null}
      {memorial !== undefined && unlinked.length > 0 ? (
        <ul className="plain stack">
          {unlinked.map((p) => (
            <li key={p.photoId} className="stack">
              <Photo blobId={p.blobId} alt={"text" in p.caption ? p.caption.text : t("stonePhoto")} />
              <div className="actions">
                <Button disabled={intent.busy} onClick={() => void intent.send([{ type: "link_stone_photo", memorialId: memorial.memorialId, photoId: p.photoId }], { done: t("photoLinked") })}>
                  {t("choosePhoto")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {linked.length === 0 ? null : (
        <section className="stack" aria-label={t("comparePhoto")}>
          <h3>{t("comparePhoto")}</h3>
          {linked.map((p) => (
            <div key={p.photoId} className="stack">
              <Photo blobId={p.blobId} alt={"text" in p.caption ? p.caption.text : t("stonePhoto")} />
              <p className="inscription">{memorial?.reading}</p>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
