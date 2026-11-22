# Two minute guide

This is a path through both registers and the Review Desk preview. It takes about two minutes. Every place and person here is invented. There is no login. Everything runs in your browser and nothing is sent anywhere.

`tests/browser/judge-guide.spec.ts` runs these steps click for click on the built site, at 360 by 640 and at 1920 by 1080, in headless Chromium. If a word on a screen changes, that test fails and this guide has to change with it.

## Open the site

Open the site address. The live address is set by the person who publishes the site, and it is not in this repository yet.

To run the same site from a checkout (Node 24 or later):

```
npm ci
npm run build:apps
npm run assemble:site -- --desk <the dist/preview folder of the Review Desk checkout>
npm run preview
```

Then open `http://127.0.0.1:4174/`. The server listens on that address only. Stop it with Ctrl+C. The Review Desk is built in its own repository. Assembly checks its preview against `release/desk-preview.lock.json` and stops if one byte differs.

The hub says what Plotwarden is and offers three choices: **Open Churchyard Register**, **Open Allotment Register** and **Open Review Desk preview**. Two links below them, **See the family map** and **See the plot seeker map**, open the two sample sheets that a visitor receives.

## 1. Churchyard Register

1. Choose **Open Churchyard Register**, then **Open Lantern Fold**.
2. In **Name or plot code** type `Quillmoss`. Choose **Search**.
3. The result reads "Mirel Quillmoss · Y07 · Yew Walk". Choose **Show on map**. The map marks Y07 in Yew Walk.
4. Choose **Make a family map**, then **Preview as a visitor**. The preview shows only the name the warden approved.
5. Choose **Download family copy**. The file is `family-map-2026-04-20.html`. Open it from your downloads folder. It is one file and it needs no connection.
6. In the file, type `Quillmoss` in **Name or plot code**, choose **Find**, then **Show location**. The map marks Y07 as an arch with its code on a tab. The other eleven plots are plain outlines with no code. The list shows the line for this burial, and **Entrance** shows the way in for the whole site. **Print this location** prints the gate, the walk, the outlines and that one plot with its tab.
7. Back in the register, choose **Back to register**, **Committee review**, **Preview review file**, then **Download review file**. The file is `committee-review-2026-04-20.json`. It holds no name, amount or note.

## 2. Allotment Register

1. Open the hub again. Choose **Open Allotment Register**, then **Open Thimble Beds**.
2. Choose **Make an offer**, **Review offer**, then **Record offer**. The register says "B03 reserved for Tavi Bramblequill."
3. Choose **Accept offer**. It says "Offer accepted. Tavi Bramblequill holds B03."
4. Choose **Back to register**, **Season fees**, then **New season**. Fill in **Season name** `Season 2026`, **Start date** `2026-04-01`, **End date** `2027-04-01`, **Due date** `2026-06-30` and **Standard fee** `36.00`. Choose **New season**.
5. Tick **Select tenancies: B03 · Tavi Bramblequill**. Choose **Preview charges**. It shows GBP 36.00. Choose **Apply charges**.
6. Choose **Season fees**. On the card "Season 2026 · B03 · Tavi Bramblequill" type `12.00` in **Amount received** and choose **Record payment**. The card says "GBP 12.00 recorded. GBP 24.00 still due."

## 3. Review Desk preview

1. From the hub choose **Open Review Desk preview**.
2. Choose **Choose file** and pick the `committee-review-2026-04-20.json` file from step 1.7. Choose **Add register**. The Desk says "Added Churchyard · Site 1. 2 open checks."
3. Choose **Open the first item**, then **Mark checked**. It says "Decision saved on this device." Choose **Back to meeting list**. On the card "Churchyard · Site 1 · Record 2 · Uncertain reading" choose **Open item**, then **Mark checked**.
4. Choose **Return slips**, then **Download return slip for Churchyard · Site 1**. The file is `committee-return-` and the date. The slip holds no name and no text.
5. Open the hub again. Choose **Open Churchyard Register**, then **Open Lantern Fold**.
6. Choose **Committee review**, then **Open return slip** and pick the slip file from step 4. The rows "Record 1 · Check the location" and "Record 2 · Read the stone again" both read "Ready to check".
7. On "Record 1 · Check the location" choose **Open matching record**. The list "Burials with no plot" opens. Go back, open the slip again, and on "Record 2 · Read the stone again" choose **Open matching record**. The "Burial record" opens.

Without a file, **Open walkthrough** on the Desk home shows invented sites.

### Thimble Beds

This does the same for the garden. It follows section 2, so Thimble Beds holds what you did there.

1. Open the hub again. Choose **Open Allotment Register**, then **Open Thimble Beds**.
2. Choose **Committee review**, **Preview review file**, then **Download review file**. The file is `committee-review-2026-04-20.json`. It holds one check, a late fee.
3. From the hub choose **Open Review Desk preview**. Choose **Choose file** and pick that file. Choose **Add register**. The Desk says "Added Allotments · Site 1. 1 open check."
4. Choose **Meeting list**. On the card "Allotments · Site 1 · Record 1 · Due fee" choose **Open item**, then **Mark checked**.
5. Choose **Return slips**, then **Download return slip for Allotments · Site 1**.
6. Open the hub again. Choose **Open Allotment Register**, then **Open Thimble Beds**.
7. Choose **Committee review**, then **Open return slip** and pick the slip file from step 5. The row "Record 1 · Check the payment" reads "Ready to check". Choose **Open matching record**. **Season fees** opens on the fee that raised the check.

## Then try these

- Choose **Start a register** in either app. You can enter a page by hand, import a spreadsheet, or make a numbered section without drawing it.
- Turn off your network after the first load. The hub, both registers, the Desk preview and both sample sheets open again. A register you start offline is saved on your device.
- Open **About** on the hub. It says which places are invented.

### The 200 record book

This is the paper book of the Churchyard Register. It takes about two minutes and needs no paper. The records are invented. The browser test runs these steps on the built site.

1. Open the hub again. Choose **Open Churchyard Register**, then **Start a register**. Fill in **Site name** `Paper Book`, choose **Local time zone** `Europe/London`, then choose **Create register**.
2. Choose **Add your map**. Fill in **Section name** `Paper`, **Prefix** `C`, **First number** `1`, **Digits** `3`, **Rows** `10`, **Columns** `20`, **Plot width** `40`, **Plot height** `30`, **Start east** `100` and **Start north** `100`. Choose **Preview plots**, then **Apply layout**. The register says "Map saved." and makes 200 plots, C001 to C200.
3. Choose **Back to register**, **Add records**, **Import spreadsheet**, then **Download a practice book**. The file is `practice-book.csv`. It holds 200 invented records, and row 117 has no source ref. **Download column guide** beside it lists the columns.
4. Choose **Choose CSV** and pick `practice-book.csv`. Under **Match columns**, the column headed Name is already matched to **Recorded name**. Choose **Review import**. The review says "Errors 1", "Ready 197" and "Location to confirm 2". **Import 199 records** is off. The card "Row 117" says "Check Source ref in row 117. Enter a value." Nothing has been written.
5. On the card "Row 117" choose **Fix row**. Fill in **Source ref** `R117` and choose **Save row**. The button now reads **Import 200 records**. Choose it. The register says "200 saved · 2 still need a plot."
6. Choose **Back to register**, **Add records**, **Import spreadsheet**, pick `practice-book.csv` again and choose **Review import**. Fix row 117 as in step 5. The review says "Already in register 200" and "There is nothing new to import." Nothing is added a second time.
7. Choose **Cancel import**, then **Back to register**. Choose **Unplaced burials · 2**. On the card "Sorrel Larkspur" choose **Section** `Paper` and **Plot** `C199 · Paper`, then choose **Confirm placement**. The register says "Sorrel Larkspur placed at C199."
8. Choose **Back to register**. The link now reads **Unplaced burials · 1**. In **Name or plot code** type `Quill Fernhollow` and choose **Search**. The result reads "Quill Fernhollow · C117 · Paper". The summary reads "C117 · Paper · Taken" and the map shows C117 on its tab.

## What this guide does not show

No real warden, secretary, family member or committee used these screens. The steps were run in headless Chromium on one Windows machine. See `docs/verification.md` for what was tested and what was not.
