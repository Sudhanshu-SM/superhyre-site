/** THROWAWAY. Mounts the real pages against the local shim, which executes the
 *  real SQL. `?p=` picks the page. Deleted once verified. */
import { createRoot } from "react-dom/client";
import { DialerPage } from "../DialerPage";
import { ExtensionPage } from "../ExtensionPage";
import "../access.css";

const which = new URLSearchParams(location.search).get("p") ?? "calls";
const page = which === "extension" ? <ExtensionPage />
           : which === "queue" ? <DialerPage section="queue" />
           : <DialerPage section="calls" />;

const root = document.getElementById("root");
if (!root) throw new Error("no #root");
createRoot(root).render(
  <div className="con"><div className="con-body"><main className="con-main">{page}</main></div></div>,
);
