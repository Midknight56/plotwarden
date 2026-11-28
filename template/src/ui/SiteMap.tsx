// The site map: the shared sheet on a screen, with its key directly below and the plot list one press away.
// A click or tap on a plot opens its record. The keyboard reaches the plots with one tab stop and the arrow keys, and the list holds the same plots.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { codeWidth } from "../map/labels";
import { pickPlot, pickRadius } from "../map/pick";
import { CODE_PAD, LABEL_BAND, LABEL_SIZE, buildSheet } from "../map/sheet";
import type { KeyState, SheetModel, SheetPlot } from "../map/sheet";
import { AsAtField, AsAtHeading } from "./AsAtField";
import { Button, ButtonLink, Notice, SelectField } from "./controls";
import { asAtOf, claimFloorFor, plotCountText, plotRows, queryOf } from "./plotView";
import { useRegister, useShell } from "./shellContext";

/** The width of an element, kept up to date. The sheet is built for this width. */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 320): number {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const read = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setWidth(w);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** The mark of one plot, drawn inside its box. Free is an open outline, so it draws nothing. */
function Mark({ plot }: { plot: SheetPlot }) {
  const { box, symbolCenter } = plot;
  const [cx, cy] = symbolCenter;
  const room = Math.max(0, Math.min(box.width, box.height - (plot.label === undefined ? 0 : LABEL_BAND)));
  const half = Math.max(3, room / 4);
  switch (plot.mark.state) {
    case "reserved":
      return <line className="mark" x1={cx - half} y1={cy + half} x2={cx + half} y2={cy - half} />;
    case "taken":
      return <circle className="mark solid" cx={cx} cy={cy} r={Math.max(2.5, room / 6)} />;
    case "unusable":
      return (
        <g className="mark">
          <line x1={cx - half} y1={cy - half} x2={cx + half} y2={cy + half} />
          <line x1={cx - half} y1={cy + half} x2={cx + half} y2={cy - half} />
        </g>
      );
    default:
      return null;
  }
}

const pointsOf = (points: readonly (readonly [number, number])[]): string => points.map((p) => `${p[0]},${p[1]}`).join(" ");

/** A small arch inside a box: a rounded top and a flat base. The box is kept at least 6 px wide. */
function archPath(box: { x: number; y: number; width: number; height: number }, grow = 0): string {
  const w = Math.max(6, box.width) + grow * 2;
  const x0 = box.x - (w - box.width) / 2;
  const x1 = x0 + w;
  const y0 = box.y - grow;
  const y1 = box.y + box.height + grow;
  const r = Math.min(w / 2, (y1 - y0) * 0.6);
  const f = (n: number): number => Math.round(n * 10) / 10;
  return `M${f(x0)} ${f(y1)}L${f(x0)} ${f(y0 + r)}A${f(w / 2)} ${f(r)} 0 0 1 ${f(x1)} ${f(y0 + r)}L${f(x1)} ${f(y1)}Z`;
}

/** True when a footprint is a rectangle whose sides run along the two axes. */
function isRectangle(points: readonly (readonly [number, number])[]): boolean {
  if (points.length !== 4) return false;
  return new Set(points.map((p) => Math.round(p[0] * 10))).size === 2 && new Set(points.map((p) => Math.round(p[1] * 10))).size === 2;
}

/** The classes of a plot: its shape, its state as a word, whether it needs checking, and whether it is the chosen one. A fill repeats what the mark says and adds nothing. */
function plotClass(plot: SheetPlot, bedded: boolean): string {
  const state = plot.mark.state;
  return ["plot", bedded ? "bed" : "", state ?? "", plot.mark.needsChecking ? "checking" : "", plot.selected ? "selected" : ""].filter((c) => c !== "").join(" ");
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The turf under the foot of an arch: an ellipse a little wider than the arch, its lower edge 3 px under the plot. */
function Turf({ box }: { box: SheetPlot["box"] }) {
  const w = Math.max(6, box.width);
  const rx = w / 2 + Math.min(11, Math.max(4, w * 0.2));
  const ry = Math.max(4, box.height * 0.17);
  return <ellipse className="turf" cx={round1(box.x + box.width / 2)} cy={round1(box.y + box.height + 3 - ry)} rx={round1(rx)} ry={round1(ry)} />;
}

/**
 * The base at the foot of an arch, behind its code: up to 5 percent wider on each side, 27 percent of the arch high and
 * never under the code band. It stands out on a side only as far as half the gap to a plot beside it, so the bases of
 * plots that stand edge to edge touch and never overlap. A taken plot that is not the chosen one has a stone base.
 */
function Base({ plot, plots }: { plot: SheetPlot; plots: readonly SheetPlot[] }) {
  const { box } = plot;
  const w = Math.max(6, box.width);
  const height = Math.max(LABEL_BAND, box.height * 0.27);
  const top = box.y + box.height - height;
  const bottom = box.y + box.height;
  let room = w * 0.05;
  for (const other of plots) {
    if (other.plotId === plot.plotId) continue;
    // Only a plot that stands beside this base, at the height of the base, limits it.
    if (other.box.y + other.box.height <= top || other.box.y >= bottom) continue;
    const right = other.box.x - (box.x + box.width);
    const left = box.x - (other.box.x + other.box.width);
    if (right >= -0.01) room = Math.min(room, right / 2);
    if (left >= -0.01) room = Math.min(room, left / 2);
  }
  room = Math.max(0, room);
  const stone = plot.mark.state === "taken" && !plot.selected;
  return <rect className={stone ? "base taken" : "base"} x={round1(box.x + box.width / 2 - w / 2 - room)} y={round1(top)} width={round1(w + room * 2)} height={round1(height)} />;
}

/** The two patterns of a bed, drawn once in a sheet. A taken bed is planted and any other bed is bare soil. Their colours come from the theme. */
function BedPatterns() {
  return (
    <defs>
      <pattern id="crops" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect className="soil" width="12" height="12" fill="none" />
        <circle className="crop" cx="6" cy="6" r="3.5" fill="none" />
      </pattern>
      <pattern id="furrows" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect className="soil" width="12" height="12" fill="none" />
        <rect className="furrow" y="8" width="12" height="2" fill="none" />
      </pattern>
    </defs>
  );
}

/** A strip of short slanted strokes along the north edge of a bed. */
function hatchPath(box: { x: number; y: number; width: number; height: number }): string {
  const strokes: string[] = [];
  const f = (n: number): number => Math.round(n * 10) / 10;
  for (let x = box.x + 4; x + 8 <= box.x + box.width - 2; x += 6) strokes.push(`M${f(x)} ${f(box.y + 10)}L${f(x + 8)} ${f(box.y + 3)}`);
  return strokes.join("");
}

/** The thin line from a name or a tab to what it names, with a small dot on the feature. Presentation attributes make it draw alone in print and on the hub. */
function Leader({ line }: { line: readonly (readonly [number, number])[] | undefined }) {
  if (line === undefined || line.length < 2) return null;
  const first = line[0] as readonly [number, number];
  return (
    <g className="leader-group">
      <polyline className="leader" points={pointsOf(line)} fill="none" stroke="currentColor" strokeWidth={1} />
      <circle className="leader-dot" cx={first[0]} cy={first[1]} r={2.5} fill="currentColor" />
    </g>
  );
}

/** Draw a sheet model. The screen and the print page use this one drawing. */
export function SheetSvg({
  model,
  label,
  image,
  onSurface,
  onSurfaceDown,
  extra,
  plotAction,
}: {
  model: SheetModel;
  label: string;
  image?: { href: string };
  onSurface?: (event: React.MouseEvent<SVGSVGElement>) => void;
  onSurfaceDown?: (event: React.PointerEvent<SVGSVGElement>) => void;
  extra?: ReactNode;
  /** When set, each plot is a button with one roving tab stop. Without it the sheet is a picture, as in print. */
  plotAction?: {
    tabId: string;
    nameOf: (plotId: string) => string;
    onKey: (event: React.KeyboardEvent<SVGGElement>, plotId: string) => void;
    onFocusPlot: (plotId: string) => void;
    register: (plotId: string, el: SVGGElement | null) => void;
  };
}) {
  const { north } = model;
  const { app } = useShell();
  const arched = app.adapter.theme.plotShape === "arch";
  const bedded = app.adapter.theme.plotShape === "bed";
  return (
    <svg
      className="sheet"
      role={plotAction === undefined ? "img" : "group"}
      aria-label={label}
      width={model.width}
      height={model.height}
      onClick={onSurface}
      onPointerDown={onSurfaceDown}
    >
      {model.backdrop !== undefined && image !== undefined ? (
        <image
          href={image.href}
          width={model.backdrop.width}
          height={model.backdrop.height}
          opacity={model.backdrop.opacity}
          transform={`matrix(${model.backdrop.matrix.join(" ")})`}
          preserveAspectRatio="none"
        />
      ) : null}
      {bedded ? <BedPatterns /> : null}
      {model.sections.map((s) =>
        s.points === undefined ? null : (
          <g key={s.sectionId}>
            <polygon className="section-outline" points={pointsOf(s.points)} />
            <text className="label" data-kind="section" x={s.label.x} y={s.label.y} fontSize={s.label.size} textAnchor={s.label.anchor}>
              {s.label.text}
            </text>
          </g>
        ),
      )}
      {model.paths.map((p) => (
        <g key={p.pathId}>
          <polyline className="path-edge" points={pointsOf(p.points)} />
          <polyline className="path" points={pointsOf(p.points)} />
          <polyline className="path-line" points={pointsOf(p.points)} />
          {p.label === undefined ? null : (
            <text className="label" data-kind="path" x={p.label.x} y={p.label.y} fontSize={p.label.size} textAnchor={p.label.anchor}>
              {p.label.text}
            </text>
          )}
        </g>
      ))}
      {model.plots.map((plot) => (
        <g
          key={plot.plotId}
          data-plot-id={onSurface === undefined ? undefined : plot.plotId}
          {...(plotAction === undefined
            ? {}
            : {
                role: "button",
                tabIndex: plot.plotId === plotAction.tabId ? 0 : -1,
                "aria-label": plotAction.nameOf(plot.plotId),
                onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => plotAction.onKey(event, plot.plotId),
                onFocus: () => plotAction.onFocusPlot(plot.plotId),
                ref: (el: SVGGElement | null) => plotAction.register(plot.plotId, el),
              })}
        >
          {arched ? (
            <>
              <Turf box={plot.box} />
              {plot.selected ? <path className="plot-selected-outer" d={archPath(plot.box, 3)} /> : null}
              <path className={plotClass(plot, false)} d={archPath(plot.box)} />
              {plot.box.width >= 22 ? <path className="arch-inner" d={archPath({ x: plot.box.x + 3, y: plot.box.y + 3, width: plot.box.width - 6, height: plot.box.height - 4 })} /> : null}
              {plot.label === undefined ? null : <Base plot={plot} plots={model.plots} />}
              {plot.selected ? <path className="plot-selected-inner" d={archPath(plot.box, 1)} /> : null}
            </>
          ) : (
            <>
              {plot.selected ? <polygon className="plot-selected-outer" points={pointsOf(plot.points)} /> : null}
              <polygon className={plotClass(plot, bedded)} points={pointsOf(plot.points)} />
              {bedded && isRectangle(plot.points) && plot.box.width >= 24 && plot.box.height >= 24 ? <path className="hatch" d={hatchPath(plot.box)} /> : null}
              {bedded && plot.label !== undefined && !(plot.selected && model.tab !== undefined) ? (
                <rect className="peg" x={round1(plot.label.x - (codeWidth(plot.label.text, LABEL_SIZE) + CODE_PAD) / 2)} y={round1(plot.label.y - LABEL_SIZE - 1)} width={round1(codeWidth(plot.label.text, LABEL_SIZE) + CODE_PAD)} height={LABEL_SIZE + 5} />
              ) : null}
              {plot.selected ? <polygon className="plot-selected-inner" points={pointsOf(plot.points)} /> : null}
            </>
          )}
          <Mark plot={plot} />
          {plot.label === undefined || (plot.selected && model.tab !== undefined) ? null : (
            <text className="label" data-kind="plot" x={plot.label.x} y={plot.label.y} fontSize={plot.label.size} textAnchor={plot.label.anchor}>
              {plot.label.text}
            </text>
          )}
        </g>
      ))}
      {model.sections.map((s) => (s.points === undefined ? null : <Leader key={`lead-${s.sectionId}`} line={s.label.leader} />))}
      {model.paths.map((p) => (p.label === undefined ? null : <Leader key={`lead-${p.pathId}`} line={p.label.leader} />))}
      {model.gate === undefined ? null : <Leader line={model.gate.label.leader} />}
      {model.tab === undefined ? null : <Leader line={model.tab.leader} />}
      {model.gate === undefined ? null : (
        <g>
          <rect className="gate" x={model.gate.x - 6} y={model.gate.y - 6} width={12} height={12} />
          <text className="label" data-kind="gate" x={model.gate.label.x} y={model.gate.label.y} fontSize={model.gate.label.size} textAnchor={model.gate.label.anchor}>
            {model.gate.label.text}
          </text>
        </g>
      )}
      <g transform={`translate(${north.x} ${north.y}) rotate(${north.degrees})`} className="north">
        <path d="M0 -14 L6 8 L0 3 L-6 8 Z" />
      </g>
      {model.tab === undefined ? null : (
        <g>
          <rect className="tab" x={model.tab.x} y={model.tab.y} width={model.tab.width} height={model.tab.height} />
          <text className="label tab-text" data-kind="tab" x={model.tab.x + model.tab.width / 2} y={model.tab.y + 20} fontSize={model.tab.size} textAnchor="middle">
            {model.tab.code}
          </text>
        </g>
      )}
      {extra}
    </svg>
  );
}

/** A pointer that moves further than this between going down and coming up is a drag, not a tap. */
const DRAG_LIMIT = 8;

const KEY_WORDS: Record<KeyState, { word: string; shape: string }> = {
  free: { word: "legendFree", shape: "free" },
  reserved: { word: "legendReserved", shape: "reserved" },
  taken: { word: "legendTaken", shape: "taken" },
  unusable: { word: "legendUnusable", shape: "unusable" },
  checking: { word: "legendChecking", shape: "checking" },
};

/** The classes of a key swatch. They are the classes of a plot in the drawing, so the same rules fill both. */
function swatchClass(state: KeyState, bedded: boolean): string {
  return ["plot", bedded ? "bed" : "", state].filter((c) => c !== "").join(" ");
}

/** A small drawing of each mark, beside its word. The word always appears with its symbol. */
export function MapKey() {
  const { t, app } = useShell();
  const arched = app.adapter.theme.plotShape === "arch";
  const bedded = app.adapter.theme.plotShape === "bed";
  const order: KeyState[] = ["free", "reserved", "taken", "unusable", "checking"];
  return (
    <ul className="map-key plain" aria-label={t("mapKey")}>
      {order.map((state) => (
        <li key={state}>
          <svg width="28" height="28" aria-hidden="true" className="swatch">
            {arched ? (
              <path className={swatchClass(state, false)} d={archPath({ x: 5, y: 3, width: 18, height: 22 })} />
            ) : (
              <>
                <rect className={swatchClass(state, bedded)} x="3" y="3" width="22" height="22" />
                {bedded ? <path className="hatch" d="M6 9L11 5M11 9L16 5M16 9L21 5" /> : null}
              </>
            )}
            {state === "reserved" ? <line className="mark" x1="7" y1="21" x2="21" y2="7" /> : null}
            {state === "taken" ? <circle className="mark solid" cx="14" cy="14" r="5" /> : null}
            {state === "unusable" ? (
              <g className="mark">
                <line x1="8" y1="8" x2="20" y2="20" />
                <line x1="8" y1="20" x2="20" y2="8" />
              </g>
            ) : null}
          </svg>
          <span>{t(KEY_WORDS[state].word)}</span>
        </li>
      ))}
    </ul>
  );
}

export function SiteMap() {
  const { t, app, route, navigate } = useShell();
  const open = useRegister();
  const base = `#/r/${open.site.id}`;
  const selected = route.query.get("plot") ?? "";
  // The view date is in the address as `asAt`, a date and nothing else. Today has no `asAt`.
  const asAt = asAtOf(route.query, open.today);
  const viewDate = asAt ?? open.today;
  const [zoom, setZoom] = useState(1);
  const [printStatus, setPrintStatus] = useState<"idle" | "preparing" | "ready">("idle");
  const holder = useRef<HTMLDivElement>(null);
  const width = useElementWidth(holder);

  const floor = useMemo(() => claimFloorFor(app, open.state), [app, open.state]);
  const rows = useMemo(() => plotRows(open, t, viewDate, floor), [open, t, viewDate, floor]);
  const sheet = useMemo(
    () =>
      buildSheet(
        {
          map: open.state.map,
          plots: rows.map((r) => ({ plotId: r.plot.plotId, code: r.plot.code, mark: { ...(r.summary.primary === undefined ? {} : { state: r.summary.primary }), needsChecking: r.summary.needsChecking } })),
          ...(selected === "" ? {} : { selectedPlotId: selected }),
        },
        { width, zoom },
      ),
    [open.state.map, rows, selected, width, zoom],
  );
  const chosen = rows.find((r) => r.plot.plotId === selected);

  const byId = useMemo(() => new Map(rows.map((r) => [r.plot.plotId, r])), [rows]);
  const [focusId, setFocusId] = useState("");
  const nodes = useRef(new Map<string, SVGGElement>());
  // The one tab stop is the focused plot, else the chosen plot, else the first plot in reading order.
  const reading = useMemo(() => [...sheet.plots].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x), [sheet.plots]);
  const tabId = [focusId, selected, reading[0]?.plotId ?? ""].find((id) => id !== "" && byId.has(id) && reading.some((p) => p.plotId === id)) ?? "";

  /** The same choice as the list makes: the plot goes into the address with the date kept, and nothing is saved. */
  const choose = (plotId: string) => navigate(`/r/${open.site.id}/map${queryOf({ plot: plotId, asAt })}`, { replace: true, search: route.search });

  // Where the pointer went down, so that a drag is not read as a tap.
  const down = useRef<{ x: number; y: number; type: string } | null>(null);
  const pressed = (event: React.PointerEvent<SVGSVGElement>) => {
    down.current = { x: event.clientX, y: event.clientY, type: event.pointerType };
  };
  /** A tap or a click on a drawn plot chooses it. A drag, a tap on ground or a path, or a tap between plots changes nothing. */
  const tapped = (event: React.MouseEvent<SVGSVGElement>) => {
    const start = down.current;
    down.current = null;
    if (start !== null && Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_LIMIT) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    const kind = start?.type ?? (event.nativeEvent as Partial<PointerEvent>).pointerType ?? "";
    const at: [number, number] = [((event.clientX - bounds.left) * sheet.width) / bounds.width, ((event.clientY - bounds.top) * sheet.height) / bounds.height];
    const shape = app.adapter.theme.plotShape === "arch" ? "arch" : "polygon";
    const picked = pickPlot(sheet.plots, at, { shape, radius: pickRadius(kind) });
    if (picked !== undefined) openRecord(picked);
  };

  /** One press opens the plot's own record. The map entry keeps the chosen plot and the date, so Back returns to them. */
  function openRecord(plotId: string) {
    if (plotId !== selected) choose(plotId);
    navigate(`/r/${open.site.id}/plot/${plotId}`);
  }

  const moveFocus = (from: string, key: string) => {
    const here = sheet.plots.find((p) => p.plotId === from);
    if (here === undefined) return;
    let next: string | undefined;
    if (key === "Home") next = reading[0]?.plotId;
    else if (key === "End") next = reading[reading.length - 1]?.plotId;
    else {
      const [ux, uy] = key === "ArrowRight" ? [1, 0] : key === "ArrowLeft" ? [-1, 0] : key === "ArrowDown" ? [0, 1] : [0, -1];
      const cx = here.box.x + here.box.width / 2;
      const cy = here.box.y + here.box.height / 2;
      let best = Infinity;
      for (const p of sheet.plots) {
        if (p.plotId === from) continue;
        const dx = p.box.x + p.box.width / 2 - cx;
        const dy = p.box.y + p.box.height / 2 - cy;
        const along = dx * ux + dy * uy;
        if (along <= 0) continue;
        const score = along + 2 * Math.abs(dx * uy - dy * ux);
        if (score < best) {
          best = score;
          next = p.plotId;
        }
      }
    }
    if (next === undefined) return;
    setFocusId(next);
    nodes.current.get(next)?.focus();
  };
  const plotAction = {
    tabId,
    nameOf: (id: string) => t("openPlotNamed", { line: byId.get(id)?.line ?? "" }),
    onFocusPlot: setFocusId,
    register: (id: string, el: SVGGElement | null) => {
      if (el === null) nodes.current.delete(id);
      else nodes.current.set(id, el);
    },
    onKey: (event: React.KeyboardEvent<SVGGElement>, id: string) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openRecord(id);
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        moveFocus(id, event.key);
      }
    },
  };

  const print = () => {
    setPrintStatus("preparing");
    window.setTimeout(() => {
      window.print();
      setPrintStatus("ready");
    }, 0);
  };

  return (
    <section className="stack page">
      <div className="page-head on-ground">
        <h1>{t("siteMap")}</h1>
        <div className="actions no-print">
          <ButtonLink href={base} quiet>
            {t("backToRegister")}
          </ButtonLink>
          <ButtonLink href={`${base}/list${queryOf({ plot: selected, asAt })}`} primary>
            {t("openPlotList")}
          </ButtonLink>
          <ButtonLink href={`${base}/map/edit`}>{t("editMap")}</ButtonLink>
        </div>
      </div>

      <AsAtHeading date={viewDate} today={open.today} />

      {sheet.empty ? <p>{t("noMapYet")}</p> : null}
      <div className="map-layout">
        <div className="stack map-main">
          <div ref={holder} className="sheet-scroll" role="region" aria-label={t("siteMap")} tabIndex={0}>
            <SheetSvg model={sheet} label={t("mapDescriptionOpen")} onSurface={tapped} onSurfaceDown={pressed} plotAction={plotAction} />
          </div>
          <MapKey />
        </div>

        <div className="card stack map-side no-print">
          <AsAtField
            withHeading={false}
            date={viewDate}
            today={open.today}
            onChange={(date) => navigate(`/r/${open.site.id}/map${queryOf({ plot: selected, asAt: date === open.today ? undefined : date })}`, { search: route.search })}
          />
          <SelectField
            label={t("choosePlot")}
            value={selected}
            onChange={choose}
            options={[{ value: "", label: t("noPlotChosen") }, ...rows.map((r) => ({ value: r.plot.plotId, label: r.line }))]}
          />
          {chosen === undefined ? null : (
            <section className="card stack" aria-label={t("selectedPlot")}>
              <p>{chosen.line}</p>
              <div className="actions">
                <ButtonLink href={`${base}/plot/${chosen.plot.plotId}`}>{t("openPlot")}</ButtonLink>
              </div>
            </section>
          )}
          <p>{t("zoomLevel", { percent: Math.round(zoom * 100) })}</p>
          <div className="actions">
            <Button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} disabled={zoom >= 4}>
              {t("zoomIn")}
            </Button>
            <Button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1}>
              {t("zoomOut")}
            </Button>
            <Button onClick={() => setZoom(1)} disabled={zoom === 1}>
              {t("fitSite")}
            </Button>
          </div>
          <div className="actions">
            <Button onClick={print}>{t("printSiteMap")}</Button>
          </div>
          {printStatus === "preparing" ? <Notice>{t("preparingPrint")}</Notice> : null}
          {printStatus === "ready" ? <Notice tone="good">{t("printPreviewReady")}</Notice> : null}
        </div>
      </div>
      <section className="print-only stack" aria-hidden="false">
        <h2>{t("plotCodesHeading")}</h2>
        <p>{t("asAt", { date: viewDate })}</p>
        <p>{plotCountText(rows.length, t)}</p>
        <ul className="plain print-index">
          {rows.map((r) => (
            <li key={r.plot.plotId}>
              {r.plot.code} · {r.sectionName ?? t("noSection")} · {r.stateText}
              {r.plot.priorCodes.length === 0 ? null : ` · ${r.plot.priorCodes.map((c) => t("wasCode", { code: c })).join(" · ")}`}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
