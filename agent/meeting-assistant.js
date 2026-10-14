/* The meeting assistant's page: hand the extension in this browser a token, and show which browsers have one.
   The handover is the point of this file. Chrome lets a page message an extension only when that extension's
   manifest names the page's origin (`externally_connectable`), so this is the one place a token can be put into the
   extension without anybody typing anything — and the code box below is for the profiles where it is blocked. */
(function () {
  var S = window.SH, token = "", extensionId = "";

  /* The extension says which one it is.

     A page has to name an extension to message it, and an unpacked build gets a different id on every machine — so
     during testing there is no id to hard-code. The extension's own content script (`announce.ts`) runs on this page
     and posts its `chrome.runtime.id` here, which is the only place that value can come from without somebody
     pasting it. Everything else is a fallback: the id we were told last time, one in the address bar, and the one
     configured in config.js once there is a Store id worth hard-coding. */
  var announced = "";
  window.addEventListener("message", function (e) {
    if (e.source !== window || e.origin !== location.origin) return;
    var d = e.data || {};
    if (d.source === "superhyre-extension" && typeof d.id === "string" && /^[a-p]{32}$/.test(d.id)) {
      announced = d.id;
      try { localStorage.setItem("sh_ext_id", d.id); } catch (err) {}
    }
  });
  // In case the extension's script ran before this listener existed.
  window.postMessage({ source: "superhyre-page-hello" }, location.origin);

  function ids() {
    var saved = "";
    try { saved = localStorage.getItem("sh_ext_id") || ""; } catch (e) {}
    var hinted = new URLSearchParams(location.search).get("ext") || "";
    return [announced, hinted, saved, window.SUPERHYRE_EXTENSION_ID || ""].filter(Boolean);
  }

  function ping(id) {
    return new Promise(function (resolve) {
      if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) return resolve(false);
      try {
        chrome.runtime.sendMessage(id, { type: "superhyre.ping" }, function (r) {
          // A missing extension sets lastError; reading it is what keeps Chrome from logging it as uncaught.
          var err = chrome.runtime.lastError;
          resolve(!err && !!r && r.ok === true);
        });
      } catch (e) { resolve(false); }
    });
  }

  function handOver(id, tok) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(id, { type: "superhyre.token", token: tok }, function (r) {
          var err = chrome.runtime.lastError;
          resolve(!err && !!r && r.ok === true);
        });
      } catch (e) { resolve(false); }
    });
  }

  function drawBrowsers(list) {
    var box = S.el("browsersList"), empty = S.el("browsersEmpty");
    list = list || [];
    empty.hidden = list.length > 0;
    box.innerHTML = list.map(function (b) {
      var seen = b.last_seen_at ? "last used " + S.esc(S.day(b.last_seen_at)) : "not used yet";
      return '<div class="jd"><div class="t">' + S.esc(b.label || "A browser") + '</div>' +
        '<div class="meta">Connected ' + S.esc(S.day(b.connected_at)) + " · " + seen + '</div>' +
        '<div class="links"><button type="button" class="btn" data-revoke="' + S.esc(b.id) + '">Disconnect</button></div></div>';
    }).join("");
    [].forEach.call(box.querySelectorAll("[data-revoke]"), function (btn) {
      btn.addEventListener("click", function () {
        var label = btn.textContent;
        S.busy(btn, true, label);
        S.api(token, { action: "meet_revoke", install_id: btn.getAttribute("data-revoke") }).then(function (r) {
          S.busy(btn, false, label);
          if (!r.ok) return S.note("msg", r.message || "I couldn't disconnect that.", "bad");
          drawBrowsers(r.browsers);
          S.note("msg", "That browser won't send me any more calls.");
        });
      });
    });
    S.el("state").textContent = list.length ? (list.length === 1 ? "On in 1 browser" : "On in " + list.length + " browsers") : "Not set up";
    S.el("state").className = "pill" + (list.length ? " on" : "");
  }

  function connect() {
    var btn = S.el("connect"), label = btn.textContent;
    S.busy(btn, true, label);
    var found = "";
    // Which id this browser's extension has, if it has one at all.
    ids().reduce(function (chain, id) {
      return chain.then(function () {
        if (found) return;
        return ping(id).then(function (ok) { if (ok) found = id; });
      });
    }, Promise.resolve()).then(function () {
      if (!found) {
        S.busy(btn, false, label);
        S.note("msg", "I can't see the extension in this browser. Add it first, then press Connect again — or use a code from its popup.", "bad");
        return;
      }
      try { localStorage.setItem("sh_ext_id", found); } catch (e) {}
      return S.api(token, { action: "meet_pair", label: browserLabel() }).then(function (r) {
        if (!r.ok || !r.token) {
          S.busy(btn, false, label);
          S.note("msg", r.message || "I couldn't make a token for this browser.", "bad");
          return;
        }
        return handOver(found, r.token).then(function (ok) {
          S.busy(btn, false, label);
          if (!ok) {
            S.note("msg", "The extension didn't take the token. Open its popup and use a code instead.", "bad");
            return;
          }
          S.note("msg", "Connected. Join a Google Meet and I'll offer to summarise it — one click per call.", "ok");
          return S.api(token, { action: "meet_installs" }).then(function (x) { if (x.ok) drawBrowsers(x.browsers); });
        });
      });
    });
  }

  function claim() {
    var btn = S.el("claim"), label = btn.textContent, code = (S.el("code").value || "").trim();
    if (!code) return S.note("msg", "Type the code the extension is showing you.", "bad");
    S.busy(btn, true, label);
    S.api(token, { action: "meet_claim", code: code }).then(function (r) {
      S.busy(btn, false, label);
      if (!r.ok) return S.note("msg", r.message || "That code didn't work.", "bad");
      S.el("code").value = "";
      drawBrowsers(r.browsers);
      S.note("msg", "Done. The extension will pick it up within a few seconds.", "ok");
    });
  }

  function browserLabel() {
    var ua = navigator.userAgent;
    var os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "this computer";
    return "Chrome on " + os;
  }

  S.session().then(function (s) {
    token = s;
    return S.api(token, { action: "meet_installs" });
  }).then(function (r) {
    if (!r.ok) { S.note("msg", r.message || "Please sign in again.", "bad"); return; }
    drawBrowsers(r.browsers);
    S.el("connect").addEventListener("click", connect);
    S.el("claim").addEventListener("click", claim);
  }).catch(function () {});
})();
