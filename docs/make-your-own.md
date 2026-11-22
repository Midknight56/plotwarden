# Make your own register

This guide makes a third kind of register, a **market stall register**, from the shared template. It shows that a new set of rules needs no change to the template. You will generate the app, run it, and see one rule at work: a trader who needs 240 cm can take a 250 cm stall and cannot take a 200 cm stall.

The market stall register is an example for developers. It is not one of the two public apps. Its stalls, traders and reservations are invented.

## What you need

- Node 24 or later.
- A checkout of this repository, with `npm install` run once.

## 1. Make the app

From the root of the checkout:

```
npm run create:app -- --kind market --out .local/market
```

The folder must not exist yet. If the path exists, whether it is a file, an empty folder or a full one, the script says so, writes nothing and stops with code 2. The script never writes under `template/`, `apps/` or `examples/`.

It writes these files into `.local/market`:

| File | What it holds |
|---|---|
| `src/types.ts` | The state, the commands and the events of the market register |
| `src/rules.ts` | The width rule, and how each event changes the state |
| `src/adapter.ts` | The one object the template needs, the Stalls sheet and the search names |
| `src/fields.ts` | The two columns of the Stalls sheet: `Stall code` and `Frontage cm` |
| `src/copy.ts` | Every word that is special to stalls |
| `src/Stalls.tsx` | The stall panel on the plot screen |
| `src/main.tsx` | The entry point that hands the adapter to the shared shell |
| `src/theme.css` | The colours: dark brown ink on warm paper |
| `fixture.json` | Four invented stalls and two invented traders |
| `index.html`, `package.json`, `vite.config.ts` | The page, the package and the build |

The files are a copy of `examples/market/`. Only the path to the template is rewritten, so the copy finds `template/` wherever you put it.

## 2. Run it

```
npx vite --config .local/market/vite.config.ts
```

Open `http://127.0.0.1:4181/`. The server listens on that address only, on that port only. If the port is busy it stops with an error and does not pick another. Stop it with Ctrl+C.

To build and look at a finished copy:

```
npx vite build --config .local/market/vite.config.ts
npx vite preview --config .local/market/vite.config.ts
```

The finished copy is at `http://127.0.0.1:4180/`.

## 3. Walk through the rule

1. Choose **Start a register**. Name it `Stall Row`. Choose **Create register**.
2. Choose **Add your map**. In **Map setup**, fill in one row of four stalls: Section name `Row A`, Prefix `S`, First number `1`, Digits `1`, Rows `1`, Columns `4`. Choose **Preview plots**, then **Apply layout**. The register now has stalls S1 to S4.
3. Choose **Back to register**, then **Plot list**, then open stall S4. Choose **Check plot**, then **Confirm change**. Enter `S4B` in **New plot code** and choose **Rename plot**. The old code `S4` stays searchable.
4. Do the same check on S1, S2 and S3: open the stall from the plot list, choose **Check plot**, then **Confirm change**. A stall that has not been checked is never read as free.
5. On each of S1, S2 and S3, the **Stall** panel says *No frontage is set for this stall.* Enter `200` for S1, `250` for S2 and `300` for S3 in **Frontage in cm**, and choose **Save frontage**. Leave S4B with no frontage.
6. Open S1. Enter a trader name, `240` in **Width the trader needs in cm**, and choose **Reserve stall**. The register says: *A 240 cm stand does not fit a 200 cm stall.* Nothing was saved.
7. Open S2. Enter the same trader and `240`. The register says: *S2 reserved for* the trader, and *Saved on this device.* Stall S2 is now Reserved.
8. Open S4B and try to reserve. The register says: *Set the frontage of S4B first.* A stall with no frontage is never read as wide enough.
9. Choose **Back up** and download the private backup. Then choose **Registers**, **Restore backup**, choose the file, and choose **Restore as new register**. The copy holds the same stalls, the frontages and the reservation.

Steps 1 to 9 were run in a headless browser by `tests/browser/market-example.spec.ts`, against `examples/market`, at 360 by 640 and at 1920 by 1080. Every screen on the way was measured for edges, gaps, targets, text size and contrast. The spec runs the example folder, which the generator copies byte for byte when the new folder is two levels below the root.
## What the rule is

A stall is a plot with one space. Its frontage is a whole number of cm from 1 to 10,000. A trader needs a width, also from 1 to 10,000 cm.

| The trader needs | The stall has | Result |
|---|---|---|
| 240 | 250 | Reserved |
| 240 | 240 | Reserved. An equal width fits |
| 240 | 200 | Refused, naming 240 and 200 |
| 240 | nothing recorded | Refused. The stall has no frontage |
| 0, 1.5 or 10,001 | any | Refused. Not a whole number of cm from 1 to 10,000 |

The rule is in `src/rules.ts`. A reservation is a held claim on the stall's space, made with the shared `add_claim`. So status, history, backup and restore treat it like any other claim, and the register keeps them without extra code.

## Check that nothing in the template changed

`tests/unit/scaffold.test.ts` hashes every file under `template/`, `apps/`, `examples/` and `tests/helpers/` before and after it runs the generator, and fails if one byte differs. `tests/conformance/market.test.ts` runs the same conformance suite as the two apps on the market register. That suite checks replay, refusal, isolation, the visitor file, repeat operations, stale saves, backup and restore, and the Stalls import. The suite has no market code in it.

You can run both:

```
npx vitest run tests/unit/scaffold.test.ts tests/conformance/market.test.ts
```

## Check it with the local inspector

The inspector has a fixed vector for the width rule. After `npm run build:inspector`, in a Unix shell:

```
node dist/inspector/cli.mjs check_adapter '{"adapterId":"market","caseId":"width_rule"}'
```

In Windows PowerShell 5, a double quote inside an argument needs a backslash, so write it in two lines:

```
$json = '{"adapterId":"market","caseId":"width_rule"}' -replace '"','\"'
node dist/inspector/cli.mjs check_adapter $json
```

The answer is `pass: true` and no mismatches. The arguments are data. The command runs nothing from them.
## What the generated app does not have yet

- **No practice register.** The two public apps open Lantern Fold and Thimble Beds. The market app has none.
- **No availability page.** The adapter builds the visitor file: `marketAdapter.project(state, "visitor", date)` lists the free stalls and nothing else, and never a trader. There is no screen to download or print it. To add one, read `apps/allotment-register/src/SeekerSheet.tsx` and `template/src/output/availabilityHtml.ts`, which do that for the garden.
- **No committee checks.** The market adapter has no review rules, so its committee file is empty.
- **No reports.**
- **A frontage change is a new event, not a named correction.** The history keeps the old width, but does not link the two.

## Use it in another repository

This part was **not tested**. The generator and the generated app were run only inside this checkout, at two levels below the root and deeper. Steps to try:

1. Copy the `template/` folder into your repository, next to where the app will go. Keep its licence.
2. Run the generator from this checkout, pointing at your copy of the template:

   ```
   node scripts/create-app.mjs --kind market --out ../my-repo/market --template ../my-repo/template
   ```

3. In your repository, install the packages at the versions this project uses:

   ```
   npm install --save-exact react@19.3.1 react-dom@19.3.1 zod@4.6.7 fflate@0.8.3
   npm install --save-exact --save-dev vite@8.3.8 typescript@6.0.3 @types/react@19.3.0 @types/react-dom@19.3.0
   ```

4. Add a `tsconfig.json` with `"jsx": "react-jsx"`, `"module": "ESNext"` and `"moduleResolution": "Bundler"`.
5. Build and run it with the two `npx vite` commands above, with your own `--config` path.

The generated `vite.config.ts` lets the dev server read the folder that holds both the app and the template. If your template is far from the app, check that line first.

## Make a rule of your own

1. Copy `examples/market/` to a new folder of your own under `examples/`.
2. Change `MARKET_KIND` in `types.ts` to a new name. The shell opens only a register of its own kind.
3. Replace the state, the commands and the events in `types.ts`.
4. Replace the rule in `rules.ts`. Send every command that is not yours to `decideBase`, and every event to `applyBase` first, as the market register does.
5. Replace the words in `copy.ts`. Use plain words, with no dash between words.
6. Give the new example a conformance test like `tests/conformance/market.test.ts`. Do not change the suite.
7. Run `node scripts/check-imports.mjs`. It fails if your example imports an app or another example.
