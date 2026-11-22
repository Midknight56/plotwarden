// The Allotment Register entry point. Only here does an app import its own adapter and give it to the shell.
import { createRoot } from "react-dom/client";
import { RegisterShell } from "../../../template/src/ui/RegisterShell";
import type { RegisterApp } from "../../../template/src/ui/shellContext";
import "./theme.css";
import { allotAdapter, allotRecords, tenanciesImporter, waitingImporter } from "./adapter";
import { AllotPlotExtras, AllotmentHome } from "./AllotmentHome";
import { HandoverScreen } from "./Handover";
import { OfferScreen } from "./Offer";
import { PaymentsScreen } from "./Payments";
import { SeasonScreen } from "./Season";
import { SeasonReport } from "./SeasonReport";
import { SeekerSheet } from "./SeekerSheet";
import { TenancyScreen } from "./Tenancy";
import type { AllotCommand, AllotEvent, AllotState } from "./types";
import { WaitingList } from "./WaitingList";
import { thimbleBeds } from "./walkthrough";

export const allotApp: RegisterApp<AllotState, AllotCommand, AllotEvent> = {
  adapter: allotAdapter,
  title: "Allotment Register",
  importers: [waitingImporter, tenanciesImporter],
  records: allotRecords,
  home: AllotmentHome,
  routes: {
    waiting: WaitingList,
    offer: OfferScreen,
    tenancy: TenancyScreen,
    handover: HandoverScreen,
    season: SeasonScreen,
    payments: PaymentsScreen,
    seeker: SeekerSheet,
    report: SeasonReport,
  },
  plotExtras: AllotPlotExtras,
  walkthrough: thimbleBeds,
};

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no root element");
createRoot(root).render(<RegisterShell app={allotApp} />);