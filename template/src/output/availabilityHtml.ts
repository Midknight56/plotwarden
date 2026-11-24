// The availability file as one self contained page. Pure text. The page is built from the visitor object
// alone: it holds the object as closed JSON, lists each free plot as plain text so browser Find works with
// script off, and has one small script that filters the list by section and marks a plot on the map.
// A policy seals it: no network, no form, no remote font, no image but a data address.
import { escapeHtml, fillWords, jsonForScript, legendHtml } from "./familyMap";
import { availabilityMapSvg } from "./availabilityMap";
import type { AvailabilityFile } from "./privacy";
import { CSP } from "./visitorHtml";
import type { PageTheme } from "./visitorHtml";

export const AVAILABILITY_WORD_KEYS = [
  "pageTitle",
  "availablePlots",
  "chooseSection",
  "allSections",
  "showLocation",
  "askSecretary",
  "entrance",
  "section",
  "plot",
  "printMap",
  "asAt",
  "noPlots",
  "mapLabel",
  "selected",
  "sheet",
  "sections",
] as const;

export type AvailabilityWords = Readonly<Record<(typeof AVAILABILITY_WORD_KEYS)[number], string>>;
export type AvailabilityTheme = PageTheme;

const DEFAULT_THEME: AvailabilityTheme = { ink: "#1B312A", paper: "#F7F5E8", sky: "#CFE7DF", tab: "#BFE0EA" };

/** The leaf green of the allotment main action. It is the line under the header band. */
const LEAF = "#2F6B4F";

/** Check that every word is given, so a missing word never becomes a blank on the page. */
export function checkAvailabilityWords(words: AvailabilityWords): void {
  for (const key of AVAILABILITY_WORD_KEYS) {
    if (typeof words[key] !== "string" || words[key] === "") throw new Error(`The word ${key} is missing`);
  }
}

/** `availability-map-2026-04-20.html`. The kind and the date only, never a private value. */
export function availabilityFileName(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("A file name takes a date and nothing else");
  return `availability-map-${date}.html`;
}

function viewerCss(theme: AvailabilityTheme): string {
  const { ink, paper, sky, tab } = theme;
  return `
*{box-sizing:border-box}
html{background:${paper};color:${ink};font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-text-size-adjust:100%}
body{margin:0}
h1,h2,h3{margin:0;line-height:1.25}
h1{font-size:clamp(26px,1vw + 20px,34px);line-height:1.15}h2{font-size:22px}h3{font-size:18px;line-height:1.3}
p,ul{margin:0}
.day{padding:clamp(14px,1.6vw,22px) clamp(16px,2.8vw,40px);background:${sky};color:${ink};border-bottom:4px solid ${LEAF}}
.day p{margin-top:4px}
.in{max-width:1160px;margin:0 auto}
main{max-width:1240px;margin:0 auto;padding:clamp(18px,2vw,28px) clamp(16px,2.8vw,40px) 40px}
.cols{display:flex;flex-wrap:wrap;align-items:flex-start;gap:24px clamp(24px,3.4vw,48px)}
.col-find{flex:1 1 320px;min-width:0;display:flex;flex-direction:column;gap:24px}
.col-map{flex:1.5 1 420px;min-width:0}
section{display:flex;flex-direction:column;gap:12px;min-width:0}
label{font-size:14px;font-weight:700}
select{width:100%;min-height:48px;padding:0 12px;border:2px solid ${ink};border-radius:10px;background:#FFFEF6;color:${ink};font:inherit}
button{min-height:46px;min-width:44px;padding:0 16px;border:2px solid ${ink};border-radius:10px;background:#FFFEF6;color:${ink};font:inherit;font-weight:600;cursor:pointer}
button:hover{background:#E7EEDA}
button:active{background:#D5E0C2}
:focus-visible{outline:3px solid #0B4FAF;outline-offset:2px}
.row{display:flex;flex-wrap:wrap;gap:12px}
ul.list{list-style:none;padding:0;display:flex;flex-direction:column;gap:12px}
ul.list li{display:flex;flex-direction:column;gap:6px;padding:12px 16px 16px;overflow:hidden;border:2px solid ${ink};border-radius:14px;background:#FFFEF6}
ul.list li::before{content:"";display:block;height:8px;margin:-12px -16px 4px;background:repeating-linear-gradient(-45deg,#A6C580 0 2px,#E6D6B4 2px 8px)}
ul.list li[hidden]{display:none}
ul.list li.on{background:${tab}}
.name{font-size:20px;font-weight:700}
.code-tab{display:inline-block;padding:0 7px;border:2px solid ${ink};background:${tab};line-height:1.4}
.js-only{display:none}
.js-block{display:none}
html.has-script .js-only{display:inline-flex;align-items:center;justify-content:center}
html.has-script .js-block{display:flex;flex-direction:column;gap:6px}
.frame{max-width:680px;container-type:inline-size}
.map{display:block;width:100%;height:auto;border:2px solid ${ink};border-bottom:0;border-radius:12px 12px 0 0;background:#EFE6CC}
.map[data-view="wide"]{display:none}
@container (min-width:600px){.map[data-view="narrow"]{display:none}.map[data-view="wide"]{display:block}}
.map text{fill:${ink};font-family:inherit}
.bed{fill:#E6D6B4;stroke:${ink};stroke-width:2}
.plotg.on .bed{fill:${tab}}
.hatch{fill:none;stroke:${ink};stroke-width:1.25;opacity:.6}
.peg{fill:#FFFEF6;stroke:${ink};stroke-width:1.5}
.ground{fill:none;stroke:${ink};stroke-width:1;opacity:.55}
.section{fill:none;stroke:${ink};stroke-width:1.5;stroke-dasharray:8 4}
.walk{fill:none;stroke:#CFE0B8;stroke-width:12;stroke-linecap:round}
.walk-line{fill:none;stroke:${ink};stroke-width:1.5;stroke-dasharray:1 6;stroke-linecap:round}
.gate{fill:${ink};stroke:${ink};stroke-width:2}
.north{fill:${ink}}
.selbits{display:none}
.plotg.on .selbits{display:inline}
.plotg.on .peg-code{display:none}
.sel-outer{fill:none;stroke:${paper};stroke-width:7}
.sel-inner{fill:none;stroke:${ink};stroke-width:3}
.tab{fill:${tab};stroke:${ink};stroke-width:2}
.tab-text{font-weight:700}
.legend{display:flex;flex-wrap:wrap;gap:4px 28px;margin:0;padding:8px 18px;list-style:none;border:2px solid ${ink};border-top:0;border-radius:0 0 12px 12px;background:#FFFEF6}
.legend li{display:inline-flex;align-items:center;gap:10px;min-height:30px}
.key-gate{flex:none;width:13px;height:13px;background:${ink}}
.key-walk{flex:none;position:relative;width:34px;height:13px;border-radius:999px;background:#CFE0B8}
.key-walk::after{content:"";position:absolute;left:5px;right:5px;top:50%;margin-top:-1px;border-top:2px dotted ${ink}}
@page{margin:52px 60px}
@media print{html{background:#FFF;color:#000}.day{padding:0 0 10px;background:#FFF;color:#000;border-bottom:3px double #000}.day .in{display:flex;justify-content:space-between;align-items:baseline;gap:16px}.day p{margin:0}main{padding:0}.cols{display:block;padding-top:16px}.col-find{margin-bottom:24px}.js-only,.js-block{display:none!important}ul.list li{border-color:#000;background:#FFF}ul.list li::before{display:none}ul.list li.on{background:#E6E6E6}.code-tab{border-color:#000;background:#E6E6E6}.map{background:#FFF;border-color:#000}.map text{fill:#000}.bed{fill:#FFF;stroke:#000}.plotg.on .bed{fill:#E6E6E6}.hatch{stroke:#444;opacity:1}.peg{fill:#FFF;stroke:#000}.ground{stroke:#888;opacity:1}.walk{stroke:#DADADA}.walk-line{stroke:#000}.gate{fill:#000;stroke:#000}.north{fill:#000}.sel-outer{stroke:#FFF}.sel-inner{stroke:#000}.tab{fill:#E6E6E6;stroke:#000}.legend{background:#FFF;border-color:#000}.legend{border-top:2px solid #000}.key-gate{background:#000}.key-walk{background:#DADADA}.key-walk::after{border-top-color:#000}}
`.trim();
}

const SCRIPT = `(function(){
var d=document,root=d.documentElement;
var data=JSON.parse(d.getElementById('plot-availability').textContent);
root.className+=' has-script';
var sec=d.getElementById('sec'),list=d.getElementById('list'),none=d.getElementById('none'),sel=d.getElementById('sel'),code=d.getElementById('selcode');
var items=list?Array.prototype.slice.call(list.children):[];
function run(){var v=sec?sec.value:'',n=0;
items.forEach(function(li){var ok=!v||li.getAttribute('data-sec')===v;li.hidden=!ok;if(ok)n++;});
if(none){none.hidden=n>0||items.length===0;}}
function mark(id){Array.prototype.forEach.call(d.querySelectorAll('.plotg'),function(g){g.classList.toggle('on',g.getAttribute('data-plot')===id);});
items.forEach(function(li){li.classList.toggle('on',li.getAttribute('data-plot')===id);});
var p=data.freePlots.filter(function(x){return x.id===id;})[0];sel.hidden=!p;if(p){code.textContent=p.code;}}
if(sec){sec.addEventListener('change',run);}
Array.prototype.forEach.call(d.querySelectorAll('button[data-plot]'),function(b){b.addEventListener('click',function(){mark(b.getAttribute('data-plot'));var m=Array.prototype.filter.call(d.querySelectorAll('.map'),function(x){return x.getClientRects().length>0;})[0];if(m&&m.scrollIntoView){m.scrollIntoView({block:'nearest'});}});});
var pm=d.getElementById('printmap');if(pm){pm.addEventListener('click',function(){window.print();});}
})();`;

export function buildAvailabilityHtml(file: AvailabilityFile, words: AvailabilityWords, theme: AvailabilityTheme = DEFAULT_THEME): string {
  checkAvailabilityWords(words);
  const asAt = fillWords(words.asAt, { date: file.asOf });
  const sectionLabel = (sectionId: string): string => file.sections.find((s) => s.id === sectionId)?.label ?? "";
  // One drawing made for a narrow frame and one made for a wide frame. The page shows the one that fits (spec 07, L9.7).
  const visitor = { label: words.mapLabel, selectable: true, namesToLegend: true } as const;
  const narrow = availabilityMapSvg(file, { ...visitor, width: 320, view: "narrow" });
  const svg = narrow === "" ? "" : narrow + availabilityMapSvg(file, { ...visitor, width: 640, view: "wide", tabsApart: true });

  const chooser =
    file.sections.length < 2
      ? ""
      : `<div class="js-block"><label for="sec">${escapeHtml(words.chooseSection)}</label><select id="sec"><option value="">${escapeHtml(words.allSections)}</option>${file.sections
          .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`)
          .join("")}</select></div>`;

  const list =
    file.freePlots.length === 0
      ? `<p>${escapeHtml(words.noPlots)}</p>`
      : `<p id="none" hidden>${escapeHtml(words.noPlots)}</p>
<ul class="list" id="list">${file.freePlots
          .map(
            (plot) =>
              `<li data-plot="${escapeHtml(plot.id)}" data-sec="${escapeHtml(plot.sectionId)}"><strong class="name">${escapeHtml(words.plot)} <span class="code-tab">${escapeHtml(plot.code)}</span></strong><span>${escapeHtml(words.section)} ${escapeHtml(sectionLabel(plot.sectionId))}</span><span><button type="button" class="js-only" data-plot="${escapeHtml(plot.id)}">${escapeHtml(words.showLocation)}</button></span></li>`,
          )
          .join("")}</ul>`;

  const body = `<header class="day"><div class="in"><h1>${escapeHtml(file.siteTitle)}</h1><p>${escapeHtml(asAt)}</p></div></header>
<main>
<div class="cols">
<div class="col-find">
<section aria-labelledby="avail-heading">
<h2 id="avail-heading">${escapeHtml(words.availablePlots)}</h2>
${chooser}
${list}
</section>
<section aria-labelledby="ask-heading">
<h2 id="ask-heading">${escapeHtml(words.askSecretary)}</h2>
${file.instructions === "" ? "" : `<p>${escapeHtml(file.instructions)}</p>`}
<p id="sel" role="status" hidden>${escapeHtml(words.selected)}: <strong id="selcode"></strong></p>
</section>
<section aria-labelledby="entrance-heading">
<h2 id="entrance-heading">${escapeHtml(words.entrance)}</h2>
<p>${escapeHtml(file.gate.name)}</p>
</section>
</div>
<div class="col-map">
<section aria-labelledby="map-heading">
<h2 id="map-heading">${escapeHtml(words.mapLabel)}</h2>
${svg === "" ? "" : `<div class="frame">${svg}${legendHtml(file.gate.name, file.paths.map((p) => p.name))}</div>`}
<div class="row"><button type="button" id="printmap" class="js-only">${escapeHtml(words.printMap)}</button></div>
</section>
</div>
</div>
</main>`;

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(file.siteTitle)} · ${escapeHtml(words.pageTitle)}</title>
<style>${viewerCss(theme)}</style>
</head>
<body>
${body}
<script type="application/json" id="plot-availability">${jsonForScript(file)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}