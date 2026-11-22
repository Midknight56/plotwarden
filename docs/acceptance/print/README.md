# Print proof

Made by `tests/browser/share-print.spec.ts` (headless Chromium, A4). Each document has two files.

| Document | PDF | Picture of page 1 |
|---|---|---|
| The family location: one burial chosen in the downloaded Lantern Fold file, then "Print this location" | `family-location-a4.pdf` | `family-location-a4-page-1.png` |
| The plot seeker sheet of Thimble Beds | `seeker-sheet-a4.pdf` | `seeker-sheet-a4-page-1.png` |
| The private season report of Thimble Beds | `season-report-a4.pdf` | `season-report-a4-page-1.png` |

How they were made, so nothing is claimed that was not observed:

- The PDF is the browser's own, made from the print document with the paper size the document asks for. It is not a printed page. No print dialog was driven and no paper was used.
- The picture is not a picture of the PDF. It is the same document drawn in print media at the width of A4 with a 12 mm page margin, cut at the height of A4. Page breaks and the true page margin are not shown.
- For the family location, the button "Print this location" was pressed with the browser's print call replaced by a recorder. The recorder saw the page marked `only-selected`. The PDF was then made from the page in that state.
- The PDF files carry a creation time, so they differ byte for byte on every run.
