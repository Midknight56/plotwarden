// Every word of the site, in one place. The hub, the two visitor pages, the 404 page and the notice that
// the service worker shows. Plain short words. No dash between words.
// The middle dot is the only separator. The 404 page is plain HTML, so `site/public/404.html` repeats
// the three words that start with `notFound`, and `tests/unit/siteCopy.test.ts` holds the two equal.

export const SITE_COPY = {
  siteName: "Plotwarden",
  jobLine: "Find a burial. Offer a garden plot. Keep the history of both.",
  tagline: "Plotwarden keeps plot registers on the keeper's own device.",
  chooseHeading: "Choose where to start",
  backToStart: "Back to start",
  mainNavigation: "Site",
  aboutLink: "About",

  churchyardName: "Churchyard Register",
  churchyardLine: "Find a burial, give a family a map, print a dated report.",
  churchyardMapLabel: "Practice map of Lantern Fold",
  allotmentName: "Allotment Register",
  allotmentLine: "Offer the next free plot, record the rent, hand a plot on.",
  allotmentMapLabel: "Practice map of Thimble Beds",
  tryPractice: "Try the practice register",
  startOwn: "Start your own",
  deskName: "Plotwarden Review Desk",
  deskLine: "A committee reads the review files and returns a slip. This is a preview of the app.",
  deskOpen: "Open Review Desk preview",

  visitorHeading: "Sheets for visitors",
  visitorLine: "What a family or someone looking for a plot receives. Each one is made from a practice register.",
  hubFamily: "See the family map",
  hubSeeker: "See the plot seeker map",

  aboutTitle: "About Plotwarden",
  aboutOffline: "Everything runs in your browser. There is no login, no server and no sync. Records stay on the device that holds them.",
  aboutInvented: "Lantern Fold and Thimble Beds are invented places. Their people, burials and payments were made for this project.",
  aboutTwoLooks: "The two registers share one foundation and each adds its own rules.",

  familyTitle: "Family map",
  familyIntro: "This is the file a warden gives to a family. It lists only the names the warden approved, and it shows the way to each plot.",
  familyPractice: "This copy was made from Lantern Fold, an invented place.",
  familyOpen: "Open the family map",
  familyDownload: "Download the family map",
  familyAboutLink: "About this sheet",
  familyAboutTitle: "About this sheet",
  familyAbout1: "It is one file. It holds no network address, so it opens with no connection.",
  familyAbout2: "Search by name or plot code. Choose Show location to mark a plot on the map.",
  familyAbout3: "A copy keeps its own date. Ask the warden for a newer one.",
  familyAbout4: "Print the map or one location from inside the file.",

  seekerTitle: "Plot seeker map",
  seekerIntro: "This is the file a garden secretary gives to someone looking for a plot. It shows free plots and how to ask the secretary. It holds no names and no rent.",
  seekerPractice: "This copy was made from Thimble Beds, an invented place.",
  seekerOpen: "Open the plot seeker map",
  seekerDownload: "Download the plot seeker map",
  seekerAboutLink: "About this sheet",
  seekerAboutTitle: "About this sheet",
  seekerAbout1: "It is one file. It holds no network address, so it opens with no connection.",
  seekerAbout2: "Choose a section to see its free plots. Choose Show location to mark one on the map.",
  seekerAbout3: "A copy keeps its own date. A plot may have been taken since. Ask the secretary.",
  seekerAbout4: "Print the map from inside the file.",

  notFoundTitle: "Page not found",
  notFoundLine: "This address has no page on this site.",
  notFoundOpen: "Back to start",

  updateReady: "A new version is ready. Save your work before reopening.",
  noScript: "Plotwarden needs JavaScript to open. Everything runs in your browser, and nothing is sent anywhere.",
  backToSheet: "Back to the sheet",
} as const;

export type SiteCopyKey = keyof typeof SITE_COPY;
