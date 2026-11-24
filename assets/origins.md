# Where the art comes from

Every drawing in this folder was drawn for this project as flat SVG shapes: paths, circles, rectangles, gradients and one mask. None of it is traced from a photograph, a stock library, a logo or a font. The one other file is a rendered picture of an invented headstone, `stone-face.webp`, made for this project and kept as it was made. There is no real grave, no real site plan and no real person in any of it.

| File | What it shows | Where it is used | What moves and what stands still |
|---|---|---|---|
| `gate-lantern.svg` | A crescent moon with a faint halo, a small church with a tower, a nave and a porch and one lit window, and one lantern on a post with a glowing amber glass panel. 300 by 80 | The first row of the header of the Churchyard Register (`header.app::before`), once, at the right, 16 px in from the edge. It is also the first picture in the art band of the churchyard door of the start page (`.door.church .door-art`) | It stands still |
| `churchyard-margin.svg` | Stars, seven yews, small headstones and crosses, a row of iron railings and a low band of pale mist along the foot. 1200 by 80, and it tiles sideways without a seam | The first row of the header of the Churchyard Register (`header.app::before`), tiled sideways behind the lantern, at the height of the band. It is also the foot band at the bottom of a churchyard screen with sheets (`.shell:has(.desk, .page)::after`, 56 px high, with no word and no control on it, and left out in high contrast and in print), and the second picture in the art band of the churchyard door of the start page | It stands still. A separate soft haze (`.mist`, a gradient and not a file) drifts slowly over it. The haze stops for reduced motion and is hidden in high contrast |
| `garden-margin.svg` | Clouds, a sun, a tool shed, a garden gate, three bean poles, and a strip of soil with furrow lines and seedlings. 1200 by 72, and it tiles sideways without a seam | The first row of the header of the Allotment Register (`header.app::before`), tiled sideways at the height of the band. It is also the art band of the allotment door of the start page (`.door.garden .door-art`) | It stands still. A separate pale haze (`.mist`, a gradient and not a file) drifts very slowly over it. The haze stops for reduced motion and is hidden in high contrast. In high contrast the garden band is plain white and carries no art |
| `mark.svg` | The mark of Plotwarden: a rounded square in the night blue, with an arch (a headstone) with a lantern lit in it, and a bed with one line of hatching, drawn in ivory lines. 64 by 64 | The start page, beside the brand in the bar (`.brand::before` in `site/src/site.css`), 28 px. No other page loads it | It stands still |
| `plot-symbols.svg` | The five marks of the map key as symbols: Free (open arch), Reserved (slash), Taken (solid centre), Unusable (cross), Needs checking (dotted arch) | The master drawing of the marks. The key and the state mark beside the selected plot draw the same arch and marks in code, so the register loads no extra file for them | It stands still |
| `stone-face.webp` | The invented headstone of Mirel Quillmoss of Hollowmere, keeper of the Lantern Fold, in grass, with one worn line, "OF HOLLOWMERE". A rendered picture made in Blender for this project, not a photograph and not a real stone. It is the same picture as `docs/film/stone-face.webp`, byte for byte | The burial screen of the practice churchyard only, for the burial of Mirel Quillmoss (`practiceStone.ts`), in the Compare photo and words section beside the inscription. It is a file of the app, and it is never a record: no family file, committee file or backup holds it | It stands still |

Colours in each file, read from the file. Nothing in the art carries meaning by colour alone: each map mark has its word beside it.

- `churchyard-margin.svg`: `#0E1233`, `#151A42`, `#1B2150`, `#55609A`, `#6A76B5`, `#FAF5E9`.
- `gate-lantern.svg`: `#0E1233`, `#151A42`, `#F2C96B`, `#F3E9C8`, `#FBE7B0`, and `#000000` and `#FFFFFF` in the mask that cuts the crescent (the mask paints nothing).
- `mark.svg`: `#232B5C`, `#FAF5E9`, `#F0B955`.
- `garden-margin.svg`: `#2F7D55`, `#5F452D`, `#7A4E2D`, `#7B5A3C`, `#9A7146`, `#A7CBAE`, `#CFA070`, `#F2C14E`, `#FFF7DC`, `#FFFFFF`.

Four of the files here are the clean copies that the design handoff gave for this project: `gate-lantern.svg`, `churchyard-margin.svg`, `garden-margin.svg` and `mark.svg`. They are kept byte for byte on purpose, so that the pictures in the repository are the pictures that were designed, and they are checked here by the same rules as every other drawing. `mark.svg` is used only as a background picture, so it carries no title and no `aria-hidden`, which the other three do carry. Nothing else of the handoff is in the repository: no mockup, no markup, no script and no font link.

The art holds no text and no script, and it never sits over a word or a control. Each stylesheet gives it a row of its own above the brand and the menu, in the margin only. In print the band is left out.

The beds on the garden plan (a footprint, a strip of hatching and a square peg for the code) and the grass walks are drawn in code by the shared sheet and the visitor map. They use no file.

Lantern Fold and Thimble Beds are invented places. Their names, plots, inscriptions and payments were made for this project.
