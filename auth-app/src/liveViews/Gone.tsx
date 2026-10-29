import { Check } from "@phosphor-icons/react";
import { OPEN_ADD_MENU } from "../adding";
import "../peopleImport.css";

/**
 * The card of a sheet the paperclip added, when its file is gone (the page was reloaded, or the time ran out): the way on is to add it again.
 * `last` is what is said about adding again: nobody is added twice for people (the import skips whoever is there), which is not so for roles.
 */
export function Gone({ what, plural = false, last = "Nobody is added twice." }: { what: string; plural?: boolean; last?: string }): JSX.Element {
  return (
    <div className="pi-fail">
      <p className="t-body" role="status">{`${what} ${plural ? "aren't" : "isn't"} here any more because the page was reloaded. Add ${plural ? "them" : "it"} again with the paperclip. ${last}`}</p>
      <div className="pi-row">
        <button type="button" className="src-btn is-quiet mo-small" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_ADD_MENU))}>Add something</button>
      </div>
    </div>
  );
}

/**
 * The card of an add that came to its end, when it is drawn again (the chat was left and came back): how it went, in the words it said then,
 * and where to see it. Its files were let go when it finished, so it is not the page that was reloaded and there is nothing to add again.
 */
export function Finished({ line, href, link }: { line: string; href: string; link: string }): JSX.Element {
  return (
    <footer className="pi-foot is-done">
      <p className="pi-done t-body" role="status"><Check size={14} weight="bold" aria-hidden="true" />{line}</p>
      <a className="cn-link" href={href}>{link}</a>
    </footer>
  );
}
