/**
 * The console's stylesheets, in the order the whole app has always put them in one file.
 *
 * Most of them are global rules that meet at the same weight, so which comes later wins, and `access.css` (last)
 * is written to have the last word. Pages are now loaded one at a time (consolePages.ts); a stylesheet imported
 * by a page would be fetched with the page and land after `access.css`, which is a different cascade. So the
 * ones the app has always had are named here, once, in their old order, and ship in the entry's one file.
 * That file is not on the critical path of the first paint (index.html draws its own loader, see
 * src/build/asyncCss.ts) and is sent compressed.
 *
 * A new stylesheet for one page can still be imported by that page: it is fetched with the page and
 * is new, so there is nothing for it to be ordered against.
 */
import "./components/loader.css";
import "./analytics.css";
import "./emptyArt.css";
import "./errorStates.css";
import "./ui.css";
import "./candidates.css";
import "./addCandidates.css";
import "./contacts.css";
import "./roles.css";
import "./newcampaign.css";
import "./campaigns-page.css";
import "./workspace.css";
import "./clients.css";
import "./apply.css";
import "./sourcing.css";
import "./roleSpec.css";
import "./campaignEdit.css";
import "./bars.css";
import "./moments.css";
import "./stages.css";
import "./forms.css";
import "./notifications.css";
import "./theme/theme.css";
import "./agents.css";
import "./live.css";
import "./recs.css";
import "./composer.css";
import "./campaign.css";
import "./liveReports.css";
import "./clarify.css";
import "./liveCompareEtc.css";
import "./compare.css";
import "./agentLive.css";
import "./agentCards/agentCards.css";
import "./agentHero.css";
import "./board.css";
import "./home.css";
import "./settingsMemory.css";
import "./settingsDnc.css";
import "./schedules.css";
import "./settings.css";
import "./nocampaign.css";
import "./access.css";
