// The app the browser host runs: the paper test adapter on the shared shell.
// The real apps come in the app specs. Test helper. The template never imports it.
import type { RegisterApp } from "../../template/src/ui/shellContext";
import { burialsImporter, paperAdapter } from "../helpers/paperKind";
import type { PaperCommand, PaperEvent, PaperState } from "../helpers/paperKind";

export const paperApp: RegisterApp<PaperState, PaperCommand, PaperEvent> = {
  adapter: paperAdapter,
  title: "Paper Register",
  importers: [burialsImporter],
  records: (state) =>
    Object.values(state.burials).map((b) => ({
      ...(b.plotId === undefined ? {} : { plotId: b.plotId }),
      name: { recordId: b.burialId, display: b.name, sourceRef: b.sourceRef, source: `Page ${b.page}`, date: b.dateText },
    })),
};