/* One agent's page: what it does, and the switch. Each page sets window.SH_AGENT = { key } and writes its own copy;
   everything below is the same for all of them. Switching on happens here and nowhere else, which is why the chat
   only ever hands out a link to this page. */
(function () {
  var S = window.SH, KEY = (window.SH_AGENT || {}).key, token = "", me = null;

  function draw() {
    var pill = S.el("state"), btn = S.el("switch");
    pill.textContent = me.always_on ? "Always on" : me.enabled ? "On" : "Off";
    pill.className = "pill" + (me.enabled || me.always_on ? " on" : "");
    if (me.always_on) {
      btn.hidden = true;
      S.note("msg", "This one comes with your account, so there's nothing to switch on.");
      return;
    }
    btn.hidden = false;
    btn.textContent = me.enabled ? "Switch off" : "Switch on";
    btn.className = "btn" + (me.enabled ? "" : " fill");
  }

  function flip() {
    var btn = S.el("switch"), on = !me.enabled, label = btn.textContent;
    S.busy(btn, true, label);
    S.api(token, { action: on ? "agent_enable" : "agent_disable", agent: KEY }).then(function (r) {
      S.busy(btn, false, label);
      if (!r.ok) {
        // The usual reason is a tool it needs: say so and point at the place that fixes it.
        S.note("msg", r.message || "I couldn't change that. Please try again.", "bad");
        if (r.code === "needs_google") S.el("fix").hidden = false;
        return;
      }
      S.el("fix").hidden = true;
      (r.agents || []).forEach(function (a) { if (a.agent === KEY) me = a; });
      draw();
      S.note("msg", on
        ? me.name + " is on. Your assistant will message you on WhatsApp about what it can do."
        : me.name + " is off. Nothing it was doing will carry on.", on ? "ok" : "");
    });
  }

  S.session().then(function (s) {
    token = s;
    return S.api(token, { action: "agents_list" });
  }).then(function (r) {
    if (!r.ok) { S.note("msg", r.message || "Please sign in again.", "bad"); return; }
    (r.agents || []).forEach(function (a) { if (a.agent === KEY) me = a; });
    if (!me) { S.note("msg", "That agent isn't available.", "bad"); return; }
    draw();
    S.el("switch").addEventListener("click", flip);
  }).catch(function () {});
})();
