// The landing page of a sample visitor sheet: what the file is, where it came from, and two links to the one
// file (open it, or download it). The file itself is built by `npm run build:visitor` from the real builders of
// the two registers. This page never builds one and never imports a register. Hash routes inside, as the hub.
import { Frame, pathOfHash } from "./Home";
import { SITE_COPY } from "./copy";

export type VisitorKind = "family" | "seeker";
export type VisitorRoute = "home" | "about" | "not-found";

export function visitorRouteOf(hash: string): VisitorRoute {
  const path = pathOfHash(hash);
  if (path === "/") return "home";
  if (path === "/about") return "about";
  return "not-found";
}

const WORDS = {
  family: {
    title: SITE_COPY.familyTitle,
    intro: SITE_COPY.familyIntro,
    practice: SITE_COPY.familyPractice,
    open: SITE_COPY.familyOpen,
    download: SITE_COPY.familyDownload,
    aboutLink: SITE_COPY.familyAboutLink,
    aboutTitle: SITE_COPY.familyAboutTitle,
    about: [SITE_COPY.familyAbout1, SITE_COPY.familyAbout2, SITE_COPY.familyAbout3, SITE_COPY.familyAbout4],
  },
  seeker: {
    title: SITE_COPY.seekerTitle,
    intro: SITE_COPY.seekerIntro,
    practice: SITE_COPY.seekerPractice,
    open: SITE_COPY.seekerOpen,
    download: SITE_COPY.seekerDownload,
    aboutLink: SITE_COPY.seekerAboutLink,
    aboutTitle: SITE_COPY.seekerAboutTitle,
    about: [SITE_COPY.seekerAbout1, SITE_COPY.seekerAbout2, SITE_COPY.seekerAbout3, SITE_COPY.seekerAbout4],
  },
} as const;

export function visitorTitleOf(kind: VisitorKind, route: VisitorRoute): string {
  const w = WORDS[kind];
  if (route === "about") return `${w.aboutTitle} · ${w.title}`;
  if (route === "not-found") return `${SITE_COPY.notFoundTitle} · ${SITE_COPY.siteName}`;
  return `${w.title} · ${SITE_COPY.siteName}`;
}

export function VisitorLanding({ kind, file, route }: { kind: VisitorKind; file: string; route: VisitorRoute }) {
  const w = WORDS[kind];
  const nav = (
    <>
      <a className="button secondary" href="../../">
        {SITE_COPY.backToStart}
      </a>
      {route === "home" ? (
        <a className="button secondary" href="#/about">
          {w.aboutLink}
        </a>
      ) : null}
    </>
  );

  if (route === "about") {
    return (
      <Frame nav={nav}>
        <div className="stack">
          <h1 tabIndex={-1}>{w.aboutTitle}</h1>
          <ul className="plain stack">
            {w.about.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="actions">
            <a className="button" href="#/">
              {SITE_COPY.backToSheet}
            </a>
          </div>
        </div>
      </Frame>
    );
  }

  if (route === "not-found") {
    return (
      <Frame nav={nav}>
        <div className="stack">
          <h1 tabIndex={-1}>{SITE_COPY.notFoundTitle}</h1>
          <p>{SITE_COPY.notFoundLine}</p>
          <div className="actions">
            <a className="button" href="#/">
              {SITE_COPY.backToSheet}
            </a>
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame nav={nav}>
      <div className="stack">
        <h1 tabIndex={-1}>{w.title}</h1>
        <p>{w.intro}</p>
        <p>{w.practice}</p>
        <div className="actions">
          <a className="button" href={`./${file}`}>
            {w.open}
          </a>
          <a className="button secondary" href={`./${file}`} download>
            {w.download}
          </a>
        </div>
      </div>
    </Frame>
  );
}
