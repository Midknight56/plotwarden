import { createRoot } from "react-dom/client";
import { RegisterShell } from "../../template/src/ui/RegisterShell";
import { paperApp } from "./app";

const root = document.getElementById("root");
if (root === null) throw new Error("The host page has no root element");
createRoot(root).render(<RegisterShell app={paperApp} />);