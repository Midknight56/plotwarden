// The Churchyard Register entry point. Only here does an app import its own adapter and give it to the shell.
import { createRoot } from "react-dom/client";
import { RegisterShell } from "../../../template/src/ui/RegisterShell";
import type { RegisterApp } from "../../../template/src/ui/shellContext";
import "./theme.css";
import { burialsImporter, churchAdapter, churchRecords } from "./adapter";
import { BurialReport } from "./BurialReport";
import { BurialRoute } from "./Burial";
import { ChurchPlotExtras, ChurchyardHome } from "./ChurchyardHome";
import { FamilySheet } from "./FamilySheet";
import { ReservationScreen } from "./Reservation";
import { UnplacedScreen } from "./Unplaced";
import type { ChurchCommand, ChurchEvent, ChurchState } from "./types";
import { lanternFold } from "./walkthrough";

export const churchApp: RegisterApp<ChurchState, ChurchCommand, ChurchEvent> = {
  adapter: churchAdapter,
  title: "Churchyard Register",
  importers: [burialsImporter],
  records: churchRecords,
  home: ChurchyardHome,
  routes: {
    burial: BurialRoute,
    reserve: ReservationScreen,
    unplaced: UnplacedScreen,
    family: FamilySheet,
    report: BurialReport,
  },
  plotExtras: ChurchPlotExtras,
  walkthrough: lanternFold,
  practiceBook: { href: "./practice-book.csv", fileName: "practice-book.csv" },
};

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no root element");
createRoot(root).render(<RegisterShell app={churchApp} />);
