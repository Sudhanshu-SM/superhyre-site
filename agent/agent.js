/* Shared by the pages under /agent. Signing in happens on /agent itself; these pages only need the session it left
   behind, or a one-time ?t= link the assistant sent in chat. Nothing here touches OAuth: a tool is connected on
   /agent, because that is the address Google, Notion and Slack send people back to. */
(function (w) {
  var API = w.SUPERHYRE_API;
  var HOME = "/agent/";

  function call(body) {
    return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: "Something went wrong. Please try again." }; }); })
      .catch(function () { return { ok: false, message: "No connection. Please check your internet and try again." }; });
  }

  // The session may be unreachable (a private window, blocked storage). The page then sends them to sign in again.
  function get() { try { return localStorage.getItem("sh_session") || ""; } catch (e) { return ""; } }
  function set(s) { try { s ? localStorage.setItem("sh_session", s) : localStorage.removeItem("sh_session"); } catch (e) {} }

  /** The session for this page: the one we have, or the one a ?t= link is worth. Sends them home if neither works. */
  function session() {
    var params = new URLSearchParams(location.search);
    var token = (params.get("t") || "").toLowerCase().replace(/[^a-f0-9]/g, "");
    if (!token) {
      var had = get();
      if (had) return Promise.resolve(had);
      location.replace(HOME + "?next=" + encodeURIComponent(location.pathname));
      return Promise.reject(new Error("signed out"));
    }
    return call({ action: "redeem", token: token }).then(function (r) {
      if (!r.ok || !r.session) {
        location.replace(HOME + "?next=" + encodeURIComponent(location.pathname));
        throw new Error("expired");
      }
      set(r.session);
      // The token is single use, so it should not stay in the address bar or in anyone's history.
      history.replaceState(null, "", location.pathname);
      return r.session;
    });
  }

  function signedOut() { set(""); location.replace(HOME); }

  /** A call that needs a session, with the sign-in handled once here rather than on every page. */
  function api(s, body) {
    return call(Object.assign({ session: s }, body)).then(function (r) {
      if (r && r.code === "signed_out") signedOut();
      return r;
    });
  }

  function el(id) { return document.getElementById(id); }
  function busy(btn, on, label) {
    btn.disabled = on;
    btn.innerHTML = on ? '<span class="spin" aria-hidden="true"></span>' : label;
  }
  function note(id, msg, kind) {
    var n = el(id);
    n.textContent = msg || "";
    n.className = "banner" + (kind ? " " + kind : "");
    n.hidden = !msg;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function day(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; }
  }

  w.SH = { call: call, api: api, session: session, signedOut: signedOut, el: el, busy: busy, note: note, esc: esc, day: day, HOME: HOME };
})(window);
