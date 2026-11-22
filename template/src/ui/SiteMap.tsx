// The site map: the shared sheet on a screen, with its key directly below and the plot list one press away.
// The overview has no button per plot. A plot is chosen from the list, which holds the same plots.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { buildSheet } from "../map/sheet";
import type { KeyState, SheetModel, SheetPlot } from "../map/sheet";
import { Button, ButtonLink, Notice, SelectField } from "./controls";
import { plotCountText, plotRows } from "./plotView";
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
  const room = Math.max(0, Math.min(box.width, box.height - (plot.label === undefined ? 0 : 18)));
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

/** A strip of short slanted strokes along the north edge of a bed. */
function hatchPath(box: { x: number; y: number; width: number; height: number }): string {
  const strokes: string[] = [];
  const f = (n: number): number => Math.round(n * 10) / 10;
  for (let x = box.x + 4; x + 8 <= box.x + box.width - 2; x += 6) strokes.push(`M${f(x)} ${f(box.y + 10)}L${f(x + 8)} ${f(box.y + 3)}`);
  return strokes.join("");
}

/** Draw a sheet model. The screen and the print page use this one drawing. */
export function SheetSvg({
  model,
  label,
  image,
  onSurface,
  extra,
}: {
  model: SheetModel;
  label: string;
  image?: { href: string };
  onSurface?: (event: React.MouseEvent<SVGSVGElement>) => void;
  extra?: ReactNode;
}) {
  const { north } = model;
  const { app } = useShell();
  const arched = app.adapter.theme.plotShape === "arch";
  const bedded = app.adapter.theme.plotShape === "bed";
  return (
    <svg
      className="sheet"
      role="img"
      aria-label={label}
      width={model.width}
      height={model.height}
      onClick={onSurface}
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
      {model.sections.map((s) =>
        s.points === undefined ? null : (
          <g key={s.sectionId}>
            <polygon className="section-outline" points={pointsOf(s.points)} />
            <text className="label" x={s.label.x} y={s.label.y} fontSize={s.label.size} textAnchor={s.label.anchor}>
              {s.label.text}
            </text>
          </g>
        ),
      )}
      {model.paths.map((p) => (
        <g key={p.pathId}>
          <polyline className="path" points={pointsOf(p.points)} />
          <polyline className="path-line" points={pointsOf(p.points)} />
          <text className="label" x={p.label.x} y={p.label.y} fontSize={p.label.size} textAnchor={p.label.anchor}>
            {p.label.text}
          </text>
        </g>
      ))}
      {model.plots.map((plot) => (
        <g key={plot.plotId}>
          {arched ? (
            <>
              {plot.selected ? <path className="plot-selected-outer" d={archPath(plot.box, 3)} /> : null}
              <path className={`plot${plot.mark.needsChecking ? " checking" : ""}${plot.selected ? " selected" : ""}`} d={archPath(plot.box)} />
              {plot.box.width >= 22 ? <path className="arch-inner" d={archPath({ x: plot.box.x + 3, y: plot.box.y + 3, width: plot.box.width - 6, height: plot.box.height - 4 })} /> : null}
              {plot.selected ? <path className="plot-selected-inner" d={archPath(plot.box, 1)} /> : null}
            </>
          ) : (
            <>
              {plot.selected ? <polygon className="plot-selected-outer" points={pointsOf(plot.points)} /> : null}
              <polygon className={`plot${bedded ? " bed" : ""}${plot.mark.needsChecking ? " checking" : ""}${plot.selected ? " selected" : ""}`} points={pointsOf(plot.points)} />
              {bedded && isRectangle(plot.points) && plot.box.width >= 24 && plot.box.height >= 24 ? <path className="hatch" d={hatchPath(plot.box)} /> : null}
              {bedded && plot.label !== undefined && !(plot.selected && model.tab !== undefined) ? (
                <rect className="peg" x={plot.label.x - (plot.label.text.length * 7.4 + 10) / 2} y={plot.label.y - 14} width={plot.label.text.length * 7.4 + 10} height={20} />
              ) : null}
              {plot.selected ? <polygon className="plot-selected-inner" points={pointsOf(plot.points)} /> : null}
            </>
          )}
          <Mark plot={plot} />
          {plot.label === undefined || (plot.selected && model.tab !== undefined) ? null : (
            <text className="label" x={plot.label.x} y={plot.label.y} fontSize={plot.label.size} textAnchor={plot.label.anchor}>
              {plot.label.text}
            </text>
          )}
        </g>
      ))}
      {model.gate === undefined ? null : (
        <g>
          <rect className="gate" x={model.gate.x - 6} y={model.gate.y - 6} width={12} height={12} />
          <text className="label" x={model.gate.label.x} y={model.gate.label.y} fontSize={model.gate.label.size} textAnchor={model.gate.label.anchor}>
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
          <text className="label tab-text" x={model.tab.x + model.tab.width / 2} y={model.tab.y + 20} fontSize={model.tab.size} textAnchor="middle">
            {model.tab.code}
          </text>
        </g>
      )}
      {extra}
    </svg>
  );
}

const KEY_WORDS: Record<KeyState, { word: string; shape: string }> = {
  free: { word: "legendFree", shape: "free" },
  reserved: { word: "legendReserved", shape: "reserved" },
  taken: { word: "legendTaken", shape: "taken" },
  unusable: { word: "legendUnusable", shape: "unusable" },
  checking: { word: "legendChecking", shape: "checking" },
};

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
              <path className={`plot${state === "checking" ? " checking" : ""}`} d={archPath({ x: 5, y: 3, width: 18, height: 22 })} />
            ) : (
              <>
                <rect className={`plot${arched ? "" : bedded ? " bed" : ""}${state === "checking" ? " checking" : ""}`} x="3" y="3" width="22" height="22" />
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
  const { t, route, navigate } = useShell();
  const open = useRegister();
  const base = `#/r/${open.site.id}`;
  const selected = route.query.get("plot") ?? "";
  const [zoom, setZoom] = useState(1);
  const [printStatus, setPrintStatus] = useState<"idle" | "preparing" | "ready">("idle");
  const holder = useRef<HTMLDivElement>(null);
  const width = useElementWidth(holder);

  const rows = useMemo(() => plotRows(open, t), [open, t]);
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

  const print = () => {
    setPrintStatus("preparing");
    window.setTimeout(() => {
      window.print();
      setPrintStatus("ready");
    }, 0);
  };

  return (
    <section className="stack">
      <h1>{t("siteMap")}</h1>
      <div className="actions no-print">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/list${selected === "" ? "" : `?plot=${selected}`}`} primary>
          {t("openPlotList")}
        </ButtonLink>
        <ButtonLink href={`${base}/map/edit`}>{t("editMap")}</ButtonLink>
      </div>

      {sheet.empty ? <p>{t("noMapYet")}</p> : null}
      <div ref={holder} className="sheet-scroll" role="region" aria-label={t("siteMap")} tabIndex={0}>
        <SheetSvg model={sheet} label={t("mapDescription")} />
      </div>
      <MapKey />

      <div className="no-print stack">
        <SelectField
          label={t("choosePlot")}
          value={selected}
          onChange={(value) => navigate(`/r/${open.site.id}/map${value === "" ? "" : `?plot=${value}`}`, { replace: true })}
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
      </div>

      <div className="actions no-print">
        <Button onClick={print}>{t("printSiteMap")}</Button>
      </div>
      {printStatus === "preparing" ? <Notice>{t("preparingPrint")}</Notice> : null}
      {printStatus === "ready" ? <Notice tone="good">{t("printPreviewReady")}</Notice> : null}

      <section className="print-only stack" aria-hidden="false">
        <h2>{t("plotCodesHeading")}</h2>
        <p>{t("asAt", { date: open.today })}</p>
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
