// The worn stone of the practice register. The picture is a file of the app's artwork (`assets/stone-face.webp`),
// shown on the keeper's burial screen for the one practice burial it belongs to. It is not a stored photo: no
// event, backup, family file or committee file holds it, and a register the keeper started never shows it.
import type { Burial } from "./types";

/** The address of the picture, a file served with the app. */
// The address is read as a URL, as the stylesheets read the other pictures of `assets/`, so the build keeps the file and
// names it by its content. It is not a code import.
export const PRACTICE_STONE_URL: string = new URL("../../../assets/stone-face.webp", import.meta.url).href;

/** The source ref of the burial of Mirel Quillmoss in Lantern Fold. */
const PRACTICE_STONE_REF = "LF-07A";

/** The picture for a burial, or undefined. Only the practice register has one, and only for that one burial. */
export function practiceStoneFor(workspace: string, burial: Pick<Burial, "sourceRef">): string | undefined {
  return workspace === "walkthrough" && burial.sourceRef === PRACTICE_STONE_REF ? PRACTICE_STONE_URL : undefined;
}
