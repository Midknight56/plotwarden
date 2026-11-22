// The entry of the hub and the two visitor pages. The page says which it is in `data-page` on the body, so the
// three HTML files share one script. The route is the hash. When it changes, the title follows and focus moves
// to the page heading, as in the registers.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Home, hubRouteOf, hubTitleOf } from "./Home";
import { VisitorLanding, visitorRouteOf, visitorTitleOf } from "./VisitorLanding";
import type { VisitorKind } from "./VisitorLanding";
import "./site.css";

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

/** Set the title, and move focus to the heading after a change of route. Not on the first draw. */
function useRouteEffects(title: string, hash: string): void {
  const first = useRef(true);
  useEffect(() => {
    document.title = title;
    if (first.current) {
      first.current = false;
      return;
    }
    document.querySelector<HTMLElement>("main h1")?.focus();
  }, [title, hash]);
}

function Hub() {
  const hash = useHash();
  const route = hubRouteOf(hash);
  useRouteEffects(hubTitleOf(route), hash);
  return <Home route={route} />;
}

function Visitor({ kind, file }: { kind: VisitorKind; file: string }) {
  const hash = useHash();
  const route = visitorRouteOf(hash);
  useRouteEffects(visitorTitleOf(kind, route), hash);
  return <VisitorLanding kind={kind} file={file} route={route} />;
}

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no root element");
const page = document.body.dataset["page"];
const file = document.body.dataset["file"] ?? "";
if (page === "family" || page === "seeker") createRoot(root).render(<Visitor kind={page} file={file} />);
else createRoot(root).render(<Hub />);
