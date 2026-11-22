// The two sample visitor files of the site, built in memory by the real adapters from the invented fixtures
// Lantern Fold and Thimble Beds. The same builders that the registers call when a keeper downloads a file. No
// clock and no random value: the public IDs come from a counter, so the same call gives the same bytes.
import { availabilityWords } from "../../apps/allotment-register/src/copy";
import { buildAvailabilityFile } from "../../apps/allotment-register/src/projection";
import { familyWords } from "../../apps/churchyard-register/src/copy";
import { buildFamilyFile } from "../../apps/churchyard-register/src/projection";
import { availabilityFileName, buildAvailabilityHtml } from "../../template/src/output/availabilityHtml";
import { buildFamilyHtml, visitorFileName } from "../../template/src/output/visitorHtml";
import { fixture } from "../inspector/fixtures";

export interface VisitorFile {
  /** `family-map-2026-04-20.html`. The kind and the date only. */
  fileName: string;
  html: string;
}

export interface VisitorFiles {
  family: VisitorFile;
  seeker: VisitorFile;
}

function publicIds(): () => string {
  let n = 0;
  return () => `p${(++n).toString(16).padStart(12, "0")}`;
}

export function buildVisitorFiles(): VisitorFiles {
  const lantern = fixture("lantern-fold");
  const family = buildFamilyFile(lantern.state as Parameters<typeof buildFamilyFile>[0], { asOf: lantern.asOf, revision: lantern.revision, newPublicId: publicIds() });
  if (!family.ok) throw new Error(`The family file was refused: ${family.missing.join(", ")}`);

  const thimble = fixture("thimble-beds");
  const seeker = buildAvailabilityFile(thimble.state as Parameters<typeof buildAvailabilityFile>[0], { asOf: thimble.asOf, revision: thimble.revision, newPublicId: publicIds() });
  if (!seeker.ok) throw new Error(`The availability file was refused: ${seeker.missing.join(", ")}`);

  return {
    family: { fileName: visitorFileName("family", lantern.asOf), html: buildFamilyHtml(family.file, familyWords()) },
    seeker: { fileName: availabilityFileName(thimble.asOf), html: buildAvailabilityHtml(seeker.file, availabilityWords()) },
  };
}
