// The hub: what Plotwarden is in one line, and the clear choices. Two registers, the committee Desk preview,
// and the two sample sheets for visitors. Inner screens are hash routes (`#/about`), so a refresh on a static
// host never asks the host for a path that is not there. Every word is in `copy.ts`.
import type { ReactNode } from "react";
import { SITE_COPY } from "./copy";
import { PRACTICE_MAPS } from "./practiceMaps";

export type HubRoute = "home" | "about" | "not-found";

/** The path inside a hash: `#/about/` gives `/about`. The root is `/`. */
export function pathOfHash(hash: string): string {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

export function hubRouteOf(hash: string): HubRoute {
  const path = pathOfHash(hash);
  if (path === "/") return "home";
  if (path === "/about") return "about";
  return "not-found";
}

export function hubTitleOf(route: HubRoute): string {
  if (route === "about") return `${SITE_COPY.aboutTitle} · ${SITE_COPY.siteName}`;
  if (route === "not-found") return `${SITE_COPY.notFoundTitle} · ${SITE_COPY.siteName}`;
  return SITE_COPY.siteName;
}

/**
 * The stripe in the three app colours, the bar with the brand and the navigation, then the page. Shared by the hub and the
 * visitor pages. The stripe holds nothing and is hidden from a screen reader. The mark beside the brand is drawn by the
 * stylesheet, so it adds no word.
 */
export function Frame({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="stripe" aria-hidden="true"></div>
      <header className="bar">
        <span className="brand">{SITE_COPY.siteName}</span>
        {nav === undefined ? null : <nav aria-label={SITE_COPY.mainNavigation}>{nav}</nav>}
      </header>
      <main>{children}</main>
    </>
  );
}

/** The Review Desk: a card with one link and no drawing. It is not an article, so only the two doors are. */
function DeskCard({ name, line, href, open }: { name: string; line: string; href: string; open: string }) {
  return (
    <section className="review-card" aria-labelledby="desk-name">
      <h3 id="desk-name">{name}</h3>
      <p>{line}</p>
      <a className="button secondary" href={href}>
        {open}
      </a>
    </section>
  );
}

/**
 * A door to a register: an art band, its name, one line, two buttons and a small drawing of its practice map. The band is a
 * picture of the stylesheet and holds no word. The drawing is inline SVG text made by the shared sheet at build time (see
 * `practiceMaps.ts`), so it needs no picture file and no request. Each link keeps its own words as the start of its
 * accessible name and adds the register, so two links with the same words are told apart.
 */
function RegisterDoor({ tone, name, line, folder, map }: { tone: "church" | "garden"; name: string; line: string; folder: string; map: { markup: string } }) {
  const heading = `choice-${tone}`;
  return (
    <li className={`door ${tone}`}>
      <article className="register-card" aria-labelledby={heading}>
        <div className="door-art" aria-hidden="true"></div>
        <div className="door-body">
          <div className="door-text">
            <h3 id={heading}>{name}</h3>
            <p>{line}</p>
            <div className="actions">
              <a className="button" href={`${folder}#/practice`} aria-label={`${SITE_COPY.tryPractice}, ${name}`}>
                {SITE_COPY.tryPractice}
              </a>
              <a className="button secondary" href={`${folder}#/new`} aria-label={`${SITE_COPY.startOwn}, ${name}`}>
                {SITE_COPY.startOwn}
              </a>
            </div>
          </div>
          <div className="practice-map" dangerouslySetInnerHTML={{ __html: map.markup }} />
        </div>
      </article>
    </li>
  );
}

/** A sheet for visitors: a small picture of the sheet, drawn by the stylesheet with no text, beside the button that opens it. */
function SheetRow({ tone, href, words }: { tone: "church" | "garden"; href: string; words: string }) {
  return (
    <div className="sheet-row">
      <span className={`sheet-pic ${tone}`} aria-hidden="true"></span>
      <a className="button secondary" href={href}>
        {words}
      </a>
    </div>
  );
}

function HomePage() {
  return (
    <>
      <div className="stack intro">
        <h1 tabIndex={-1} className="title">{SITE_COPY.siteName}</h1>
        <p className="job">{SITE_COPY.jobLine}</p>
        <p className="tagline">{SITE_COPY.tagline}</p>
      </div>
      <section className="stack" aria-labelledby="choose">
        <h2 id="choose">{SITE_COPY.chooseHeading}</h2>
        <ul className="doors plain">
          <RegisterDoor tone="church" name={SITE_COPY.churchyardName} line={SITE_COPY.churchyardLine} folder="churchyard/" map={{ markup: PRACTICE_MAPS.church }} />
          <RegisterDoor tone="garden" name={SITE_COPY.allotmentName} line={SITE_COPY.allotmentLine} folder="allotments/" map={{ markup: PRACTICE_MAPS.garden }} />
        </ul>
      </section>
      <div className="below">
        <DeskCard name={SITE_COPY.deskName} line={SITE_COPY.deskLine} href="review/" open={SITE_COPY.deskOpen} />
        <section className="stack visitors" aria-labelledby="visitors">
          <h2 id="visitors">{SITE_COPY.visitorHeading}</h2>
          <p>{SITE_COPY.visitorLine}</p>
          <div className="sheet-rows">
            <SheetRow tone="church" href="visitor/family/" words={SITE_COPY.hubFamily} />
            <SheetRow tone="garden" href="visitor/seeker/" words={SITE_COPY.hubSeeker} />
          </div>
        </section>
      </div>
    </>
  );
}function AboutPage() {
  return (
    <div className="stack">
      <h1 tabIndex={-1}>{SITE_COPY.aboutTitle}</h1>
      <p>{SITE_COPY.aboutOffline}</p>
      <p>{SITE_COPY.aboutTwoLooks}</p>
      <p>{SITE_COPY.aboutInvented}</p>
      <div className="actions">
        <a className="button" href="#/">
          {SITE_COPY.backToStart}
        </a>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="stack">
      <h1 tabIndex={-1}>{SITE_COPY.notFoundTitle}</h1>
      <p>{SITE_COPY.notFoundLine}</p>
      <div className="actions">
        <a className="button" href="#/">
          {SITE_COPY.backToStart}
        </a>
      </div>
    </div>
  );
}

export function Home({ route }: { route: HubRoute }) {
  const nav =
    route === "home" ? (
      <a className="button secondary" href="#/about">
        {SITE_COPY.aboutLink}
      </a>
    ) : undefined;
  return <Frame nav={nav}>{route === "home" ? <HomePage /> : route === "about" ? <AboutPage /> : <NotFoundPage />}</Frame>;
}
