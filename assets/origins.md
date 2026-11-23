# Where the art comes from

Every drawing in this folder was drawn for this project as flat SVG shapes: paths, circles, rectangles, gradients and one mask. None of it is traced from a photograph, a stock library, a logo or a font. There is no real grave, no real site plan and no real person in any of it.

| File | What it shows | Where it is used | What moves and what stands still |
|---|---|---|---|
| `gate-lantern.svg` | A crescent moon with a faint halo, a small church with a tower, a nave and a porch and one lit window, and one lantern on a post with a glowing amber glass panel. 300 by 80 | The first row of the header of the Churchyard Register (`header.app::before`), once, at the right, 16 px in from the edge. It is also the one picture in the band of the start page | It stands still |
| `churchyard-margin.svg` | Stars, seven yews, small headstones and crosses, a row of iron railings and a low band of pale mist along the foot. 1200 by 80, and it tiles sideways without a seam | The first row of the header of the Churchyard Register (`header.app::before`), tiled sideways behind the lantern, at the height of the band | It stands still. A separate soft haze (`.mist`, a gradient and not a file) drifts slowly over it. The haze stops for reduced motion and is hidden in high contrast |
| `garden-margin.svg` | Clouds, a sun, a tool shed, a garden gate, three bean poles, and a strip of soil with furrow lines and seedlings. 1200 by 72, and it tiles sideways without a seam | The first row of the header of the Allotment Register (`header.app::before`), tiled sideways at the height of the band | It stands still. A separate pale haze (`.mist`, a gradient and not a file) drifts very slowly over it. The haze stops for reduced motion and is hidden in high contrast. In high contrast the garden band is plain white and carries no art |
| `plot-symbols.svg` | The five marks of the map key as symbols: Free (open arch), Reserved (slash), Taken (solid centre), Unusable (cross), Needs checking (dotted arch) | The master drawing of the marks. The key and the state mark beside the selected plot draw the same arch and marks in code, so the register loads no extra file for them | It stands still |

Colours in each file, read from the file. Nothing in the art carries meaning by colour alone: each map mark has its word beside it.

- `churchyard-margin.svg`: `#0E1233`, `#151A42`, `#1B2150`, `#55609A`, `#6A76B5`, `#FAF5E9`.
- `gate-lantern.svg`: `#0E1233`, `#151A42`, `#F2C96B`, `#F3E9C8`, `#FBE7B0`, and `#000000` and `#FFFFFF` in the mask that cuts the crescent (the mask paints nothing).
- `garden-margin.svg`: `#2F7D55`, `#5F452D`, `#7A4E2D`, `#7B5A3C`, `#9A7146`, `#A7CBAE`, `#CFA070`, `#F2C14E`, `#FFF7DC`, `#FFFFFF`.

The art holds no text and no script, and it never sits over a word or a control. Each stylesheet gives it a row of its own above the brand and the menu, in the margin only. In print the band is left out.

The beds on the garden plan (a footprint, a strip of hatching and a square peg for the code) and the grass walks are drawn in code by the shared sheet and the visitor map. They use no file.

Lantern Fold and Thimble Beds are invented places. Their names, plots, inscriptions and payments were made for this project.
