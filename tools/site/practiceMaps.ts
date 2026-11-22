// The two practice maps of the hub, as inline SVG text. Each is drawn by the shared sheet (`buildSheet` and
// `SheetSvg`, the same two that draw the map inside a register) from the plots and states of the invented practice
// registers, Lantern Fold and Thimble Beds, as the real adapters build them. No clock and no random value, so the
// same call gives the same bytes. The site may not import the registers, so this file is where the two meet.
// `scripts/build-practice-maps.mjs` writes the result to `site/src/practiceMaps.ts`, and a test holds that file
// equal to a fresh build.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SITE_COPY } from "../../site/src/copy";
import { buildSheet } from "../../template/src/map/sheet";
import { plotSummaryAt } from "../../template/src/status";
import { ShellContext, type ShellValue } from "../../template/src/ui/shellContext";
import { SheetSvg } from "../../template/src/ui/SiteMap";
import { fixture } from "../inspector/fixtures";
import type { FixtureId } from "../inspector/fixtures";

export interface PracticeMaps {
  church: string;
  garden: string;
}

/** The width of the drawing. A card on a 360 px phone holds 284 px, and the frame takes 4, so the text is never drawn smaller than 12 px. */
const WIDTH = 272;

const natural = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

function drawPractice(id: FixtureId, label: string): string {
  const built = fixture(id);
  const state = built.state as unknown as { core: Parameters<typeof plotSummaryAt>[0]; map: Parameters<typeof buildSheet>[0]["map"] };
  const plots = Object.values(state.core.plots)
    .map((plot) => {
      const summary = plotSummaryAt(state.core, plot.plotId, built.asOf);
      return { plotId: plot.plotId, code: plot.code, mark: { ...(summary?.primary === undefined ? {} : { state: summary.primary }), needsChecking: summary?.needsChecking ?? false } };
    })
    .sort((a, b) => natural(a.code, b.code));
  const model = buildSheet({ map: state.map, plots }, { width: WIDTH, zoom: 1 });
  // SheetSvg reads one thing from the shell: the shape of a plot. Nothing else of the shell is needed to draw.
  const shell = { app: { adapter: { theme: { plotShape: built.adapter.theme.plotShape } } } } as unknown as ShellValue;
  const markup = renderToStaticMarkup(createElement(ShellContext.Provider, { value: shell }, createElement(SheetSvg, { model, label })));
  // A view box lets the drawing shrink with its card. Its own width and height stay as the natural size.
  return markup.replace(/ width="([\d.]+)" height="([\d.]+)"/, ' width="$1" height="$2" viewBox="0 0 $1 $2"');
}

export function buildPracticeMaps(): PracticeMaps {
  return {
    church: drawPractice("lantern-fold", SITE_COPY.churchyardMapLabel),
    garden: drawPractice("thimble-beds", SITE_COPY.allotmentMapLabel),
  };
}
