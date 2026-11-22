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
6. In the file, type `Quillmoss` in **Name or plot code**, choose **Find**, then **Show location**. The map marks Y07. **Print this location** prints that one plot.
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
2. Choose **Choose file** and pick the `committee-review-2026-04-20.json` file from step 1.7. Choose **Add register**. The Desk says "Added Site 1. 2 open checks."
3. Choose **Open the first item**, then **Mark checked**. It says "Decision saved on this device."
4. Choose **Return slips**, then **Download return slip for Site 1**. The slip holds no name and no text.

Without a file, **Open walkthrough** on the Desk home shows invented sites.

## Then try these

- Choose **Start a register** in either app. You can enter a page by hand, import a spreadsheet, or make a numbered section without drawing it.
- Turn off your network after the first load. The hub, both registers, the Desk preview and both sample sheets open again. A register you start offline is saved on your device.
- Open **About** on the hub. It says which places are invented.

## What this guide does not show

No real warden, secretary, family member or committee used these screens. The steps were run in headless Chromium on one Windows machine. See `docs/verification.md` for what was tested and what was not.
