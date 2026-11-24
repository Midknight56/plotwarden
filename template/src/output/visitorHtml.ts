// The family file as one self contained page. Pure text. The page is built from the visitor object
// alone: it holds the object as closed JSON, lists each burial as plain text so browser Find works
// with script off, and has one small script that filters the list and marks a plot.
// A policy seals it: no network, no form, no remote font, no image but a data address.
import { WALK_BAND, escapeHtml, familyMapSvg, fillWords, jsonForScript, legendHtml } from "./familyMap";
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
  /** The header band. */
  sky: string;
  /** The code tab, the chosen plot and the line under the header band. */
  tab: string;
}

/** The headings use Georgia. Every other word uses the system text font. Nothing is loaded. */
export const HEADING_FONT = 'Georgia,"Times New Roman",serif';

const DEFAULT_THEME: PageTheme = { ink: "#22252C", paper: "#FAF5E9", sky: "#232A5C", tab: "#F2C96B" };

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
  const { ink, paper, sky, tab } = theme;
  return `
*{box-sizing:border-box}
html{background:${paper};color:${ink};font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;-webkit-text-size-adjust:100%}
body{margin:0}
h1,h2,h3{margin:0;font-family:${HEADING_FONT};line-height:1.25}
h1{font-size:clamp(26px,1vw + 20px,34px);line-height:1.15}h2{font-size:22px}h3{font-size:18px;line-height:1.3}
p,ul{margin:0}
.sky{padding:clamp(14px,1.6vw,22px) clamp(16px,2.8vw,40px);background:${sky};color:#FAF5E9;border-bottom:4px solid ${tab}}
.sky p{margin-top:4px;color:#C9CEE6}
.in{max-width:1160px;margin:0 auto}
main{max-width:1240px;margin:0 auto;padding:clamp(18px,2vw,28px) clamp(16px,2.8vw,40px) 40px}
.cols{display:flex;flex-wrap:wrap;align-items:flex-start;gap:24px clamp(24px,3.4vw,48px)}
.col-find{flex:1 1 320px;min-width:0;display:flex;flex-direction:column;gap:24px}
.col-map{flex:1.5 1 420px;min-width:0}
section{display:flex;flex-direction:column;gap:12px;min-width:0}
label{font-size:14px;font-weight:700}
input{width:100%;min-height:48px;padding:0 12px;border:2px solid ${ink};border-radius:2px;background:#FFF;color:${ink};font:inherit}
button{min-height:46px;min-width:44px;padding:0 16px;border:2px solid ${ink};border-radius:2px;background:#FFFEF8;color:${ink};font:inherit;font-weight:600;cursor:pointer}
button:hover{background:#EFE8D6}
button:active{background:#D9CDB0}
button.primary{padding:0 26px;border-color:${sky};background:${sky};color:${paper};font-weight:700}
button.primary:hover{border-color:#1A2046;background:#1A2046}
button.primary:active{border-color:#12173A;background:#12173A}
:focus-visible{outline:3px solid #0B4FAF;outline-offset:2px}
.row{display:flex;flex-wrap:wrap;gap:12px}
.search{display:flex;flex-direction:column;gap:6px}
.search .row{margin-top:6px}
ul.list{list-style:none;padding:0;display:flex;flex-direction:column;gap:12px}
ul.list li{display:flex;flex-direction:column;gap:6px;padding:16px;border:2px solid ${ink};border-radius:16px 16px 2px 2px;background:#FFFEF8}
ul.list li[hidden]{display:none}
.name{font:700 24px/1.2 ${HEADING_FONT};overflow-wrap:anywhere}
.where{font-weight:600}
.code-tab{display:inline-block;padding:0 7px;border:2px solid ${ink};background:${tab};line-height:1.4}
.js-only{display:none}
html.has-script .js-only{display:inline-flex;align-items:center;justify-content:center}
.frame{max-width:680px;container-type:inline-size}
.map{display:block;width:100%;height:auto;border:2px solid ${ink};border-bottom:0;background:${paper}}
.map[data-view="wide"]{display:none}
@container (min-width:600px){.map[data-view="narrow"]{display:none}.map[data-view="wide"]{display:block}}
.map text{fill:${ink};font-family:inherit}
.arch{fill:none;stroke:${ink};stroke-width:2}
.arch-inner{display:none;fill:none;stroke:${ink};stroke-width:1}
.plotg.on .arch{fill:${tab}}
.section{fill:none;stroke:${ink};stroke-width:1.5;stroke-dasharray:8 4}
.outline{fill:none;stroke:${ink};stroke-width:1}
.walk,.walk-sample{fill:none;stroke:#D9CDB0;stroke-width:${WALK_BAND};stroke-linecap:round}
.walk-line,.walk-line-sample{fill:none;stroke:${ink};stroke-width:1.5;stroke-dasharray:1 6;stroke-linecap:round}
.section-sample{stroke:${ink};stroke-width:1.5;stroke-dasharray:8 4}
.gate,.gate-sample{fill:${ink};stroke:${ink};stroke-width:2}
.north{fill:${ink}}
.selring{display:none}
.plotg.on .selring{display:inline}
html.has-script .selbits{display:none}
html.has-script .plotg.on .selbits{display:inline}
.sel-outer{fill:none;stroke:${paper};stroke-width:7}
.sel-inner{fill:none;stroke:${ink};stroke-width:3}
.tab{fill:${tab};stroke:${ink};stroke-width:2}
.tab-text{font-weight:700}
.legend{display:flex;flex-wrap:wrap;gap:4px 28px;margin:0;padding:8px 18px;list-style:none;background:#FFFEF8;border:2px solid ${ink};border-top:0}
.legend li{display:inline-flex;align-items:center;gap:10px;min-height:30px}
.key-gate{flex:none;width:13px;height:13px;background:${ink}}
.key-walk{flex:none;position:relative;width:34px;height:13px;border-radius:999px;background:#D9CDB0}
.key-walk::after{content:"";position:absolute;left:5px;right:5px;top:50%;margin-top:-1px;border-top:2px dotted ${ink}}
.entry,.entry-a,.entry-b{display:contents}
@page{margin:52px 60px}
@media print{html{background:#FFF;color:#000}.sky{padding:0 0 10px;background:#FFF;color:#000;border-bottom:3px double #000}.sky .in{display:flex;justify-content:space-between;align-items:baseline;gap:16px}.sky p{color:#000}.sky p{margin:0}main{padding:0}.cols{display:block;padding-top:16px}.col-find{margin-bottom:24px}.entry{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);column-gap:24px}.entry-a,.entry-b{display:flex;flex-direction:column;gap:12px}.entry-b h3{font-size:22px;line-height:1.25}.js-only,.search{display:none!important}ul.list li{border-color:#000;background:#FFF}.code-tab{border-color:#000;background:#E6E6E6}.map{border-color:#000;background:#FFF}.map text{fill:#000}.arch{fill:#FFF;stroke:#000}.plotg.on .arch{fill:#E6E6E6}.walk{stroke:#DADADA}.walk-sample{stroke:#DADADA}.walk-line,.walk-line-sample{stroke:#000}.outline{stroke:#666}.gate,.gate-sample{fill:#000;stroke:#000}.north{fill:#000}.sel-outer{stroke:#FFF}.sel-inner{stroke:#000}.tab{fill:#E6E6E6;stroke:#000}.legend{border-color:#000;background:#FFF}.legend{border-top:2px solid #000}.key-gate{background:#000}.key-walk{background:#DADADA}.key-walk::after{border-top-color:#000}body.only-selected ul.list li:not(.on){display:none}body.only-selected .plotg:not(.on) .arch{stroke:#666;stroke-width:1}html.has-script body.all-tabs .selbits{display:inline}}
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
Array.prototype.forEach.call(d.querySelectorAll('button[data-plot]'),function(b){b.addEventListener('click',function(){mark(b.getAttribute('data-plot'));var m=Array.prototype.filter.call(d.querySelectorAll('.map'),function(x){return x.getClientRects().length>0;})[0];if(m&&m.scrollIntoView){m.scrollIntoView({block:'nearest'});}});});
d.getElementById('printloc').addEventListener('click',function(){d.body.className='only-selected';window.print();d.body.className='';});
d.getElementById('printmap').addEventListener('click',function(){d.body.className='all-tabs';window.print();d.body.className='';});
})();`;

export function buildFamilyHtml(file: FamilyFile, words: FamilyWords, theme: PageTheme = DEFAULT_THEME): string {
  checkWords(words);
  const rows = rowsOf(file);
  const asAt = fillWords(words.asAt, { date: file.asOf });
  const directions = [...new Set(file.burials.map((b) => b.directions).filter((d): d is string => d !== undefined))];
  // One drawing made for a narrow frame and one made for a wide frame. The page shows the one that fits (spec 07, L9.7).
  const visitor = { label: words.mapLabel, selectable: true, namesToLegend: true } as const;
  const narrow = familyMapSvg(file, { ...visitor, width: 320, view: "narrow" });
  const svg = narrow === "" ? "" : narrow + familyMapSvg(file, { ...visitor, width: 640, view: "wide", tabsApart: true });

  const list =
    rows.length === 0
      ? `<p>${escapeHtml(words.noNames)}</p>`
      : `<p id="none" hidden>${escapeHtml(words.noMatch)}</p>
<ul class="list" id="list">${rows
          .map(
            ({ burial, code, section, q }) =>
              `<li data-plot="${escapeHtml(burial.plotId)}" data-q="${escapeHtml(q)}"><strong class="name">${escapeHtml(burial.name)}${burial.year === undefined ? "" : ` · ${burial.year}`}</strong><span class="where">${escapeHtml(words.plot)} <span class="code-tab">${escapeHtml(code)}</span> · ${escapeHtml(words.section)} ${escapeHtml(section)}</span>${burial.line === undefined ? "" : `<span class="line">${escapeHtml(burial.line)}</span>`}<span><button type="button" class="js-only" data-plot="${escapeHtml(burial.plotId)}">${escapeHtml(words.showLocation)}</button></span></li>`,
          )
          .join("")}</ul>`;

  const body = `<header class="sky"><div class="in"><h1>${escapeHtml(file.siteTitle)}</h1><p>${escapeHtml(asAt)}</p></div></header>
<main>
<div class="cols">
<div class="col-find">
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
<div class="entry"><div class="entry-a"><h2 id="entrance-heading">${escapeHtml(words.entrance)}</h2><p>${escapeHtml(file.gate.name)}</p></div>${directions.length === 0 ? "" : `<div class="entry-b"><h3>${escapeHtml(words.directions)}</h3>${directions.map((d) => `<p>${escapeHtml(d)}</p>`).join("")}</div>`}</div>
</section>
</div>
<div class="col-map">
<section aria-labelledby="map-heading">
<h2 id="map-heading">${escapeHtml(words.mapLabel)}</h2>
${svg === "" ? "" : `<div class="frame">${svg}${legendHtml(file.gate.name, file.paths.map((p) => p.name))}</div>`}
<p id="sel" role="status" hidden>${escapeHtml(words.selected)}: <strong id="selcode"></strong></p>
<div class="row"><button type="button" id="printloc" class="js-only">${escapeHtml(words.printLocation)}</button><button type="button" id="printmap" class="js-only">${escapeHtml(words.printMap)}</button></div>
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
<script type="application/json" id="plot-family">${jsonForScript(file)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
