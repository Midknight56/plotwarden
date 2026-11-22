// The family file as one self contained page. Pure text. The page is built from the visitor object
// alone: it holds the object as closed JSON, lists each burial as plain text so browser Find works
// with script off, and has one small script that filters the list and marks a plot.
// A policy seals it: no network, no form, no remote font, no image but a data address.
import { escapeHtml, familyMapSvg, fillWords, jsonForScript } from "./familyMap";
import type { FamilyFile, PublicBurial } from "./privacy";

export const FAMILY_WORD_KEYS = [
  "pageTitle",
  "findBurial",
  "nameOrCode",
  "find",
  "clear",
  "showLocation",
  "entrance",
  "section",
  "plot",
  "directions",
  "printLocation",
  "printMap",
  "asAt",
  "noMatch",
  "noNames",
  "mapLabel",
  "burials",
  "gate",
  "selected",
  "sheet",
  "sections",
] as const;

export type FamilyWords = Readonly<Record<(typeof FAMILY_WORD_KEYS)[number], string>>;

export interface PageTheme {
  ink: string;
  paper: string;
  sky: string;
}

const DEFAULT_THEME: PageTheme = { ink: "#22252C", paper: "#FAF5E9", sky: "#232A5C" };

/** Check that every word is given, so a missing word never becomes a blank on the page. */
export function checkWords(words: FamilyWords): void {
  for (const key of FAMILY_WORD_KEYS) {
    if (typeof words[key] !== "string" || words[key] === "") throw new Error(`The word ${key} is missing`);
  }
}

/** Lower case, accents removed, single spaces. For matching only. */
export function foldForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}

export const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'";

/** `family-map-2026-04-20.html`. The kind and the date only, never a private value. */
export function visitorFileName(kind: "family", date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("A file name takes a date and nothing else");
  return `${kind}-map-${date}.html`;
}

function viewerCss(theme: PageTheme): string {
  const { ink, paper, sky } = theme;
  return `
*{box-sizing:border-box}
html{background:${paper};color:${ink};font:16px/1.5 system-ui,"Segoe UI",Roboto,Arial,sans-serif;-webkit-text-size-adjust:100%}
body{margin:0}
h1,h2,h3{margin:0;line-height:1.25}
h1{font-size:26px}h2{font-size:21px}h3{font-size:18px}
p,ul{margin:0}
.sky{padding:24px 16px;background:${sky};color:#FAF5E9;border-bottom:4px solid ${ink}}
.sky p{margin-top:6px;color:#E9E3D2}
main{max-width:56rem;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:24px}
section{display:flex;flex-direction:column;gap:12px;min-width:0}
label{font-size:14px;font-weight:700}
input{width:100%;min-height:44px;padding:8px 12px;border:2px solid ${ink};border-radius:0;background:#FFFEF8;color:${ink};font:inherit}
button{min-height:44px;min-width:44px;padding:8px 16px;border:2px solid ${ink};border-radius:0;background:${paper};color:${ink};font:inherit;font-weight:600;cursor:pointer}
button.primary{background:${ink};color:${paper}}
:focus-visible{outline:3px solid #0B4FAF;outline-offset:2px}
.row{display:flex;flex-wrap:wrap;gap:12px}
.search{display:flex;flex-direction:column;gap:12px}
ul.list{list-style:none;padding:0;display:flex;flex-direction:column;gap:12px}
ul.list li{display:flex;flex-direction:column;gap:8px;padding:12px 16px;border:2px solid ${ink};background:#EFE8D6}
ul.list li[hidden]{display:none}
.js-only{display:none}
html.has-script .js-only{display:inline-flex;align-items:center;justify-content:center}
.map{display:block;width:100%;max-width:46rem;height:auto;border:2px solid ${ink};background:${paper}}
.map text{fill:${ink};font-family:inherit}
.arch{fill:${paper};stroke:${ink};stroke-width:2}
.arch-inner{fill:none;stroke:${ink};stroke-width:1}
.section{fill:none;stroke:${ink};stroke-width:1.5;stroke-dasharray:8 4}
.walk{fill:none;stroke:#D9CDB0;stroke-width:12;stroke-linecap:round}
.walk-line{fill:none;stroke:${ink};stroke-width:1.5;stroke-dasharray:1 6;stroke-linecap:round}
.gate{fill:${paper};stroke:${ink};stroke-width:2}
.north{fill:${ink}}
.selbits{display:none}
.plotg.on .selbits{display:inline}
.sel-outer{fill:none;stroke:${paper};stroke-width:7}
.sel-inner{fill:none;stroke:${ink};stroke-width:3}
.tab{fill:#E4D9BE;stroke:${ink};stroke-width:2}
.tab-text{font-weight:700}
@media print{.sky{background:#FFF;color:#000;border-bottom:2px solid #000}.sky p{color:#000}.js-only,.search{display:none!important}ul.list li{border-color:#000;background:#FFF}.walk{stroke:#BBB}.tab{fill:#DDD}body.only-selected ul.list li:not(.on){display:none}}
`.trim();
}

function rowsOf(file: FamilyFile): { burial: PublicBurial; code: string; section: string; q: string }[] {
  return file.burials.map((burial) => {
    const plot = file.plots.find((p) => p.id === burial.plotId);
    const section = file.sections.find((s) => s.id === plot?.sectionId)?.label ?? "";
    const code = plot?.code ?? "";
    const year = burial.year === undefined ? "" : String(burial.year);
    return { burial, code, section, q: foldForSearch(`${burial.name} ${code} ${section} ${year}`) };
  });
}

const SCRIPT = `(function(){
var d=document,root=d.documentElement;
var data=JSON.parse(d.getElementById('plot-family').textContent);
root.className+=' has-script';
var q=d.getElementById('q'),list=d.getElementById('list'),none=d.getElementById('none'),sel=d.getElementById('sel'),code=d.getElementById('selcode');
var items=list?Array.prototype.slice.call(list.children):[];
function fold(s){return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\s+/g,' ').trim();}
function run(){var w=fold(q.value).split(' ').filter(function(x){return x;}),n=0;
items.forEach(function(li){var t=li.getAttribute('data-q')||'',ok=w.every(function(x){return t.indexOf(x)>-1;});li.hidden=!ok;if(ok)n++;});
if(none){none.hidden=n>0||items.length===0;}}
function mark(id){Array.prototype.forEach.call(d.querySelectorAll('.plotg'),function(g){g.classList.toggle('on',g.getAttribute('data-plot')===id);});
items.forEach(function(li){li.classList.toggle('on',li.getAttribute('data-plot')===id);});
var p=data.plots.filter(function(x){return x.id===id;})[0];sel.hidden=!p;if(p){code.textContent=p.code;}}
q.addEventListener('input',run);
q.addEventListener('keydown',function(e){if(e.key==='Enter'){run();}});
d.getElementById('go').addEventListener('click',run);
d.getElementById('clr').addEventListener('click',function(){q.value='';run();mark('');q.focus();});
Array.prototype.forEach.call(d.querySelectorAll('button[data-plot]'),function(b){b.addEventListener('click',function(){mark(b.getAttribute('data-plot'));var m=d.querySelector('.map');if(m&&m.scrollIntoView){m.scrollIntoView({block:'nearest'});}});});
d.getElementById('printloc').addEventListener('click',function(){d.body.className='only-selected';window.print();d.body.className='';});
d.getElementById('printmap').addEventListener('click',function(){d.body.className='';window.print();});
})();`;

export function buildFamilyHtml(file: FamilyFile, words: FamilyWords, theme: PageTheme = DEFAULT_THEME): string {
  checkWords(words);
  const rows = rowsOf(file);
  const asAt = fillWords(words.asAt, { date: file.asOf });
  const directions = [...new Set(file.burials.map((b) => b.directions).filter((d): d is string => d !== undefined))];
  const svg = familyMapSvg(file, { width: 320, label: words.mapLabel, selectable: true });

  const list =
    rows.length === 0
      ? `<p>${escapeHtml(words.noNames)}</p>`
      : `<p id="none" hidden>${escapeHtml(words.noMatch)}</p>
<ul class="list" id="list">${rows
          .map(
            ({ burial, code, section, q }) =>
              `<li data-plot="${escapeHtml(burial.plotId)}" data-q="${escapeHtml(q)}"><strong>${escapeHtml(burial.name)}${burial.year === undefined ? "" : ` · ${burial.year}`}</strong><span>${escapeHtml(words.plot)} ${escapeHtml(code)} · ${escapeHtml(words.section)} ${escapeHtml(section)}</span><span><button type="button" class="js-only" data-plot="${escapeHtml(burial.plotId)}">${escapeHtml(words.showLocation)}</button></span></li>`,
          )
          .join("")}</ul>`;

  const body = `<header class="sky"><h1>${escapeHtml(file.siteTitle)}</h1><p>${escapeHtml(asAt)}</p></header>
<main>
<section aria-labelledby="find-heading">
<h2 id="find-heading">${escapeHtml(words.findBurial)}</h2>
<div role="search" class="search">
<label for="q">${escapeHtml(words.nameOrCode)}</label>
<input id="q" type="text" autocomplete="off" spellcheck="false">
<div class="row"><button type="button" id="go" class="js-only primary">${escapeHtml(words.find)}</button><button type="button" id="clr" class="js-only">${escapeHtml(words.clear)}</button></div>
</div>
<h3>${escapeHtml(words.burials)}</h3>
${list}
</section>
<section aria-labelledby="entrance-heading">
<h2 id="entrance-heading">${escapeHtml(words.entrance)}</h2>
<p>${escapeHtml(file.gate.name)}</p>
${directions.length === 0 ? "" : `<h3>${escapeHtml(words.directions)}</h3>${directions.map((d) => `<p>${escapeHtml(d)}</p>`).join("")}`}
</section>
<section aria-labelledby="map-heading">
<h2 id="map-heading">${escapeHtml(words.mapLabel)}</h2>
${svg}
<p id="sel" role="status" hidden>${escapeHtml(words.selected)}: <strong id="selcode"></strong></p>
<div class="row"><button type="button" id="printloc" class="js-only">${escapeHtml(words.printLocation)}</button><button type="button" id="printmap" class="js-only">${escapeHtml(words.printMap)}</button></div>
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
<script type="application/json" id="plot-family">${jsonForScript(file)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
