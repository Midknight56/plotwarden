// The availability file as one self contained page. Pure text. The page is built from the visitor object
// alone: it holds the object as closed JSON, lists each free plot as plain text so browser Find works with
// script off, and has one small script that filters the list by section and marks a plot on the map.
// A policy seals it: no network, no form, no remote font, no image but a data address.
import { escapeHtml, fillWords, jsonForScript } from "./familyMap";
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

const DEFAULT_THEME: AvailabilityTheme = { ink: "#1B312A", paper: "#F7F5E8", sky: "#CFE7DF" };

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
  const { ink, paper, sky } = theme;
  return `
*{box-sizing:border-box}
html{background:${paper};color:${ink};font:16px/1.5 system-ui,"Segoe UI",Roboto,Arial,sans-serif;-webkit-text-size-adjust:100%}
body{margin:0}
h1,h2,h3{margin:0;line-height:1.25}
h1{font-size:26px}h2{font-size:21px}h3{font-size:18px}
p,ul{margin:0}
.day{padding:24px 16px;background:${sky};color:${ink};border-bottom:4px solid ${ink}}
.day p{margin-top:6px}
main{max-width:56rem;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:24px}
section{display:flex;flex-direction:column;gap:12px;min-width:0}
label{font-size:14px;font-weight:700}
select{width:100%;min-height:44px;padding:8px 12px;border:2px solid ${ink};border-radius:0;background:#FFFEF8;color:${ink};font:inherit}
button{min-height:44px;min-width:44px;padding:8px 16px;border:2px solid ${ink};border-radius:0;background:${paper};color:${ink};font:inherit;font-weight:600;cursor:pointer}
:focus-visible{outline:3px solid #0B4FAF;outline-offset:2px}
.row{display:flex;flex-wrap:wrap;gap:12px}
ul.list{list-style:none;padding:0;display:flex;flex-direction:column;gap:12px}
ul.list li{display:flex;flex-direction:column;gap:8px;padding:12px 16px;border:2px solid ${ink};border-top-width:8px;background:#EFE6CC}
ul.list li[hidden]{display:none}
ul.list li.on{background:#F3E3A3}
.js-only{display:none}
.js-block{display:none}
html.has-script .js-only{display:inline-flex;align-items:center;justify-content:center}
html.has-script .js-block{display:flex;flex-direction:column;gap:6px}
.map{display:block;width:100%;max-width:46rem;height:auto;border:2px solid ${ink};background:#EFE6CC}
.map text{fill:${ink};font-family:inherit}
.bed{fill:#E3EDCB;stroke:${ink};stroke-width:2}
.hatch{fill:none;stroke:${ink};stroke-width:1.25;opacity:.6}
.peg{fill:#FFFEF8;stroke:${ink};stroke-width:1.5}
.ground{fill:none;stroke:${ink};stroke-width:1;opacity:.55}
.section{fill:none;stroke:${ink};stroke-width:1.5;stroke-dasharray:8 4}
.walk{fill:none;stroke:#CFE0B8;stroke-width:12;stroke-linecap:round}
.walk-line{fill:none;stroke:${ink};stroke-width:1.5;stroke-dasharray:1 6;stroke-linecap:round}
.gate{fill:${paper};stroke:${ink};stroke-width:2}
.north{fill:${ink}}
.selbits{display:none}
.plotg.on .selbits{display:inline}
.sel-outer{fill:none;stroke:${paper};stroke-width:7}
.sel-inner{fill:none;stroke:${ink};stroke-width:3}
.tab{fill:#F3E3A3;stroke:${ink};stroke-width:2}
.tab-text{font-weight:700}
@media print{.day{background:#FFF;border-bottom:2px solid #000}.js-only,.js-block{display:none!important}ul.list li{border-color:#000;background:#FFF}}
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
Array.prototype.forEach.call(d.querySelectorAll('button[data-plot]'),function(b){b.addEventListener('click',function(){mark(b.getAttribute('data-plot'));var m=d.querySelector('.map');if(m&&m.scrollIntoView){m.scrollIntoView({block:'nearest'});}});});
var pm=d.getElementById('printmap');if(pm){pm.addEventListener('click',function(){window.print();});}
})();`;

export function buildAvailabilityHtml(file: AvailabilityFile, words: AvailabilityWords, theme: AvailabilityTheme = DEFAULT_THEME): string {
  checkAvailabilityWords(words);
  const asAt = fillWords(words.asAt, { date: file.asOf });
  const sectionLabel = (sectionId: string): string => file.sections.find((s) => s.id === sectionId)?.label ?? "";
  const svg = availabilityMapSvg(file, { width: 320, label: words.mapLabel, selectable: true });

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
              `<li data-plot="${escapeHtml(plot.id)}" data-sec="${escapeHtml(plot.sectionId)}"><strong>${escapeHtml(words.plot)} ${escapeHtml(plot.code)}</strong><span>${escapeHtml(words.section)} ${escapeHtml(sectionLabel(plot.sectionId))}</span><span><button type="button" class="js-only" data-plot="${escapeHtml(plot.id)}">${escapeHtml(words.showLocation)}</button></span></li>`,
          )
          .join("")}</ul>`;

  const body = `<header class="day"><h1>${escapeHtml(file.siteTitle)}</h1><p>${escapeHtml(asAt)}</p></header>
<main>
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
<section aria-labelledby="map-heading">
<h2 id="map-heading">${escapeHtml(words.mapLabel)}</h2>
${svg}
<div class="row"><button type="button" id="printmap" class="js-only">${escapeHtml(words.printMap)}</button></div>
</section>
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