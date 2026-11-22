// The market stall register entry point. Only here does an app import its own adapter and give it to the shell.
import { createRoot } from "react-dom/client";
import { RegisterShell } from "../../../template/src/ui/RegisterShell";
import type { RegisterApp } from "../../../template/src/ui/shellContext";
import "./theme.css";
import { marketAdapter, marketRecords, stallsImporter } from "./adapter";
import { StallPanel } from "./Stalls";
import type { MarketCommand, MarketEvent, MarketState } from "./types";

export const marketApp: RegisterApp<MarketState, MarketCommand, MarketEvent> = {
  adapter: marketAdapter,
  title: "Stall Register",
  importers: [stallsImporter],
  records: marketRecords,
  plotExtras: StallPanel,
};

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no root element");
createRoot(root).render(<RegisterShell app={marketApp} />);