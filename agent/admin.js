/* /agent/admin-dashboard. Its own session, because its door is its own: a Google account in our domain, checked on
   the server. Everything else here is drawing — the numbers arrive already worked out, and no figure on this page is
   calculated twice in two places. */
(function () {
  var S = window.SH, KEY = "sh_admin", token = "", days = 7, over = null;

  function get() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function set(s) { try { s ? localStorage.setItem(KEY, s) : localStorage.removeItem(KEY); } catch (e) {} }

  function api(body) {
    body.session = token;
    return S.call(body).then(function (r) {
      if (r && r.code === "signed_out") { set(""); token = ""; gate(); }
      return r;
    });
  }

  // ---------- numbers as words ----------

  function num(v) {
    if (v === null || v === undefined || v === "") return "—";
    var n = Number(v);
    return isNaN(n) ? String(v) : n.toLocaleString();
  }
  /** Seconds, said the way a person would say them. */
  function secs(v) {
    if (v === null || v === undefined) return "—";
    var n = Number(v);
    if (isNaN(n)) return "—";
    if (n < 60) return (Math.round(n * 10) / 10) + "s";
    var m = Math.floor(n / 60), s = Math.round(n - m * 60);
    return m + "m" + (s ? " " + s + "s" : "");
  }
  /** A count and its noun, agreeing with each other: one person, four people, one call, nine calls. */
  function plu(n, one, many) {
    return num(n) + " " + (Number(n) === 1 ? one : (many || one + "s"));
  }
  function money(v) {
    if (v === null || v === undefined) return "—";
    var n = Number(v);
    if (isNaN(n)) return "—";
    return n >= 10 ? "$" + n.toFixed(0) : n >= 0.01 ? "$" + n.toFixed(2) : "$" + n.toFixed(4);
  }
  /** How long ago, in the largest unit that still says something true. */
  function ago(iso) {
    if (!iso) return "never";
    var ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return "never";
    var mins = Math.floor(ms / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return mins + " min";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? " hour" : " hours");
    var d = Math.floor(hrs / 24);
    return d + (d === 1 ? " day" : " days");
  }
  /** Quiet for long enough to worry about: five days is a working week gone by. */
  function quietClass(iso) {
    if (!iso) return "bad-txt";
    var d = (Date.now() - new Date(iso).getTime()) / 86400000;
    return d >= 7 ? "bad-txt" : d >= 4 ? "warn-txt" : d <= 1 ? "ok-txt" : "";
  }
  function clock(iso) {
    try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function delta(now, before) {
    if (before === null || before === undefined) return "";
    var a = Number(now), b = Number(before);
    if (isNaN(a) || isNaN(b) || !b) return b === 0 && a > 0 ? "none before" : "";
    var pc = Math.round(((a - b) / b) * 100);
    return (pc >= 0 ? "+" : "") + pc + "% on " + num(b);
  }

  // ---------- the signed-out page ----------

  function gate() {
    S.el("board").hidden = true;
    S.el("gate").hidden = false;
    S.el("who").hidden = true;
    S.el("out").hidden = true;
  }
  function signedIn(email) {
    S.el("gate").hidden = true;
    S.el("board").hidden = false;
    S.el("who").textContent = email;
    S.el("who").hidden = false;
    S.el("out").hidden = false;
  }

  function startSignIn() {
    var btn = S.el("in"), label = btn.textContent;
    S.busy(btn, true, label);
    S.call({ action: "admin_start" }).then(function (r) {
      S.busy(btn, false, label);
      if (!r.ok || !r.url) { S.note("msg", r.message || "Couldn't start the sign-in.", "bad"); return; }
      location.href = r.url;
    });
  }

  /** Google sends them back here with a code. It is spent once, server-side, and never stays in the address bar. */
  function finishSignIn(code, state) {
    S.note("msg", "Signing you in…");
    return S.call({ action: "admin_callback", code: code, state: state }).then(function (r) {
      history.replaceState(null, "", location.pathname);
      if (!r.ok || !r.session) { S.note("msg", r.message || "That sign-in didn't work.", "bad"); gate(); return null; }
      S.note("msg", "");
      token = r.session;
      set(token);
      signedIn(r.email);
      return r.email;
    });
  }

  // ---------- tiles ----------

  function tile(k, n, sub, cls) {
    return '<div class="tile"><div class="k">' + S.esc(k) + '</div><div class="n' + (cls ? " " + cls : "") + '">' +
      n + '</div><div class="sub">' + (sub || "") + '</div></div>';
  }

  function drawTiles(o) {
    var t = o.tiles, m = o.model, waiting = Number(t.queued || 0) + Number(t.held || 0);
    var failPc = t.turns ? Math.round((t.failed / t.turns) * 1000) / 10 : 0;
    S.el("tiles").innerHTML = [
      tile("Turns answered", num(t.turns), S.esc(delta(t.turns, t.turns_before)) + (t.background ? " · " + num(t.background) + " in the background" : "")),
      tile("People active", num(t.people) + ' <small>of ' + num(t.accounts) + "</small>", num(t.people_today) + " today"),
      tile("Median wait", secs(t.p50), "slowest tenth " + secs(t.p90), Number(t.p50) > 30 ? "warn" : ""),
      tile("Slowest reply", secs(t.slowest), num(t.over_two_min) + " over two minutes", Number(t.slowest) > 120 ? "bad" : ""),
      tile("Failed turns", num(t.failed), t.failed ? plu(t.failed_people, "person", "people") + " · " + failPc + "% · " + num(t.retried) + " retried" : num(t.retried) + " retried", t.failed ? "bad" : ""),
      tile("Model spend", m.cost === null ? "—" : money(m.cost),
        m.cost === null ? "nothing logged yet" : (m.cost_complete ? "" : "a model has no price · ") + (m.cost_per_turn ? money(m.cost_per_turn) + " a turn" : ""),
        m.cost === null ? "none" : ""),
      tile("Waiting now", num(waiting), num(t.queued) + " queued · " + num(t.held) + " held", waiting > 5 ? "warn" : ""),
      tile("Voice and files", num(Number(t.voice || 0) + Number(t.files || 0)), num(t.voice) + " voice · " + num(t.files) + " files"),
    ].join("");
  }

  // ---------- the two charts ----------

  var W = 1000, H = 150;

  function dayLabels(series) {
    var every = series.length <= 14 ? 1 : series.length <= 31 ? 3 : 7;
    return '<div class="days">' + series.map(function (d, i) {
      var show = i === series.length - 1 || i % every === 0;
      return "<span>" + (show ? S.esc(d.day.slice(8) + "/" + d.day.slice(5, 7)) : "") + "</span>";
    }).join("") + "</div>";
  }

  function drawVolume(series) {
    if (!series.length) { S.el("volume").innerHTML = '<p class="muted">Nothing in this window.</p>'; return; }
    var top = 1;
    series.forEach(function (d) { top = Math.max(top, Number(d.in || 0), Number(d.out || 0)); });
    var slot = W / series.length, bw = Math.max(2, Math.min(14, slot / 3));
    var bars = series.map(function (d, i) {
      var mid = i * slot + slot / 2, hi = (Number(d.in || 0) / top) * H, ho = (Number(d.out || 0) / top) * H;
      return '<rect class="bar-in" x="' + (mid - bw - 1) + '" y="' + (H - hi) + '" width="' + bw + '" height="' + hi + '"></rect>' +
        '<rect class="bar-out" x="' + (mid + 1) + '" y="' + (H - ho) + '" width="' + bw + '" height="' + ho + '"></rect>';
    }).join("");
    S.el("volume").innerHTML = '<svg class="chart" viewBox="0 0 ' + W + " " + (H + 1) + '" height="' + (H + 1) +
      '" preserveAspectRatio="none" role="img" aria-label="Messages in and out, by day">' + bars +
      '<line class="grid" x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '"></line></svg>' + dayLabels(series) +
      '<p class="muted" style="margin:10px 0 0;font-size:13.5px">Busiest day ' + num(top) + ' messages.</p>';
  }

  function path(series, key, top) {
    var pts = [], slot = W / series.length;
    series.forEach(function (d, i) {
      if (d[key] === null || d[key] === undefined) return;
      pts.push((i * slot + slot / 2).toFixed(1) + "," + (H - (Number(d[key]) / top) * H).toFixed(1));
    });
    return pts;
  }

  function drawLatency(series) {
    var top = 1, any = false;
    series.forEach(function (d) {
      if (d.p90 !== null && d.p90 !== undefined) { any = true; top = Math.max(top, Number(d.p90)); }
      if (d.p50 !== null && d.p50 !== undefined) { any = true; top = Math.max(top, Number(d.p50)); }
    });
    if (!any) { S.el("latency").innerHTML = '<p class="muted">Nothing answered in this window.</p>'; return; }
    var p50 = path(series, "p50", top), p90 = path(series, "p90", top);
    var two = top >= 120 ? '<line class="mark" x1="0" y1="' + (H - (120 / top) * H) + '" x2="' + W + '" y2="' + (H - (120 / top) * H) + '"></line>' : "";
    // A line through one point draws nothing, and the 24-hour view is one point: a day on its own gets a dot instead.
    var dot = function (pts, cls) {
      return pts.length !== 1 ? "" : '<circle class="' + cls + '" cx="' + pts[0].split(",")[0] + '" cy="' + pts[0].split(",")[1] + '" r="4"></circle>';
    };
    S.el("latency").innerHTML = '<svg class="chart" viewBox="0 0 ' + W + " " + (H + 1) + '" height="' + (H + 1) +
      '" preserveAspectRatio="none" role="img" aria-label="Median and slowest-tenth reply time, by day">' + two +
      '<polyline class="p90" points="' + p90.join(" ") + '"></polyline>' + dot(p90, "dot-p90") +
      '<polyline class="p50" points="' + p50.join(" ") + '"></polyline>' + dot(p50, "dot-p50") +
      '<line class="grid" x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '"></line></svg>' + dayLabels(series) +
      '<p class="muted" style="margin:10px 0 0;font-size:13.5px">Top of the chart is ' + secs(top) + '.</p>';
  }

  // ---------- tables ----------

  function table(cols, rows) {
    if (!rows.length) return '<p class="muted">Nothing yet.</p>';
    return '<table class="tbl"><thead><tr>' + cols.map(function (c) {
      return '<th' + (c.num ? ' class="num"' : "") + ">" + S.esc(c.t) + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.map(function (r) {
      return "<tr>" + r.map(function (cell, i) {
        return "<td" + (cols[i].num ? ' class="num"' : "") + ">" + cell + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
  }

  var AGENT_SHORT = { assistant: "assistant", talent_ops: "talent ops", sourcing: "sourcing" };

  function drawPeople(people) {
    var holders = people.filter(function (p) { return p.kind === "recruiter"; }).length;
    S.el("peopleNote").textContent = plu(people.length, "account") + ", " + holders + " of them account holders";
    var rows = people.map(function (p) {
      var agents = (p.agents || []).map(function (a) { return AGENT_SHORT[a] || a; }).join(", ");
      return [
        '<span class="who">' + S.esc(p.name || "Unnamed") + "</span>" +
          '<div class="sub">' + (p.kind === "member" ? "candidate or hiring manager" : S.esc(p.org || "no team")) +
          " · ···" + S.esc(p.tail || "") + "</div>",
        '<span class="' + quietClass(p.last_in) + '">' + S.esc(ago(p.last_in)) + "</span>" +
          '<div class="sub">joined ' + S.esc(S.day(p.joined)) + "</div>",
        num(p.turns7),
        num(p.turns),
        secs(p.p50),
        agents ? S.esc(agents) : '<span class="muted">—</span>',
        (p.tools || []).length ? S.esc((p.tools || []).join(", ")) : '<span class="muted">—</span>',
        p.failed ? '<span class="bad-txt">' + num(p.failed) + "</span>" : "0",
      ];
    });
    S.el("people").innerHTML = table([
      { t: "Person" }, { t: "Quiet for" }, { t: "Turns 7d", num: true }, { t: "Turns", num: true },
      { t: "Median", num: true }, { t: "Agents" }, { t: "Tools" }, { t: "Failed", num: true },
    ], rows);
  }

  function step(lab, n, of, rest) {
    var pc = of ? Math.round((n / of) * 100) : 0;
    return '<div class="kv"><span class="lab">' + S.esc(lab) + '</span><span class="val">' + num(n) + "</span>" +
      '<span class="step"><i style="width:' + pc + '%"></i></span>' +
      '<span class="rest">' + (of ? pc + "% of the step above" : "") + (rest ? " · " + S.esc(rest) : "") + "</span></div>";
  }

  function drawFunnel(f) {
    S.el("funnel").innerHTML = [
      step("Asked for a code", f.codes_sent, 0, ""),
      step("Used the code", f.codes_used, f.codes_sent, ""),
      step("Became an account", f.accounts, f.codes_used, ""),
      step("Was welcomed", f.welcomed, f.accounts, ""),
      step("Said something of their own", f.said_something, f.welcomed, ""),
      step("Said five things", f.stayed, f.said_something, ""),
      step("Connected a tool", f.connected_a_tool, f.said_something, ""),
      step("Switched a second agent on", f.switched_an_agent_on, f.said_something, ""),
      step("Here this week", f.here_this_week, f.accounts, ""),
    ].join("");
  }

  function kv(lab, val, rest) {
    return '<div class="kv"><span class="lab">' + S.esc(lab) + '</span><span class="val">' + val + "</span>" +
      '<span class="rest">' + (rest || "") + "</span></div>";
  }

  function drawAgents(a) {
    var on = {};
    (a.on || []).forEach(function (r) { on[r.agent] = r; });
    var p = a.assistant, to = a.talent_ops, so = a.sourcing, me = a.meetings;
    function count(key) {
      var r = on[key];
      return r ? num(r.on) + " on" + (r.ever > r.on ? " · " + num(r.ever - r.on) + " switched off" : "") : "nobody";
    }
    S.el("agents").innerHTML = [
      kv("Personal assistant", count("assistant"),
        plu(p.memories, "thing") + " remembered · " + num(p.known) + " people and companies known · " +
        plu(p.routines, "routine") + " · " + plu(p.watches, "thing") + " watched"),
      kv("— its drafts", num(p.drafts_sent) + " sent",
        num(p.drafts_waiting) + " waiting for an OK · " + num(p.drafts_dropped) + " dropped · " + plu(p.reminders_due, "reminder") + " due"),
      kv("— its reading of your tools", num(p.crawls_working) + " running",
        (p.crawls_failed ? '<span class="bad-txt">' + plu(p.crawls_failed, "crawl") + " failed</span> · " : "") +
        (p.sync_failing ? '<span class="warn-txt">' + plu(p.sync_failing, "stream") + " failing</span>" : "nothing failing")),
      kv("Talent operations", count("talent_ops"),
        plu(to.jobs, "job") + " (" + num(to.jobs_open) + " open) · " + num(to.members) + " candidates and managers joined · " +
        (to.meetings ? plu(to.meetings, "interview") + " booked" : '<span class="warn-txt">no interviews booked yet</span>')),
      kv("— its teams", plu(to.orgs, "team"), plu(to.relays_answered, "relayed answer") + " · " + plu(to.asks, "teammate ask")),
      kv("Sourcing", count("sourcing"),
        num(so.jds) + " JDs · " + plu(so.runs, "run") + " (" + num(so.runs_done) + " done" +
        (so.runs_failed ? ', <span class="bad-txt">' + num(so.runs_failed) + " failed</span>" : "") +
        (so.runs_waiting ? ", " + num(so.runs_waiting) + " waiting" : "") + ") · " +
        (so.per_run ? num(so.per_run) + " people a run · " : "") + (so.minutes_p50 ? so.minutes_p50 + " min a run" : "")),
      kv("Meeting assistant", plu(me.installs, "install"),
        plu(me.calls, "call") + " · " + plu(me.cards, "card") + " · " + num(me.hours) + " hours of talk" +
        (me.problems ? ' · <span class="bad-txt">' + num(me.problems) + " with no card</span>" : "") +
        (me.partial ? " · " + num(me.partial) + " partly transcribed" : "")),
    ].join("");
  }

  function drawActions(list, model) {
    if (!list.length) {
      S.el("actionsNote").textContent = "";
      S.el("actions").innerHTML = '<p class="muted">Nothing logged yet. Every turn from here on records which actions it ran, ' +
        'so this fills up on its own — give it a day.</p>';
      return;
    }
    var runs = 0;
    list.forEach(function (a) { runs += Number(a.runs || 0); });
    S.el("actionsNote").textContent = plu(runs, "action") + " run over " + plu(model.turns, "turn");
    S.el("actions").innerHTML = table(
      [{ t: "Action" }, { t: "Run", num: true }, { t: "Failed", num: true }, { t: "Failure rate", num: true }],
      list.map(function (a) {
        var pc = a.runs ? Math.round((a.failed / a.runs) * 1000) / 10 : 0;
        return [
          "<code>" + S.esc(a.type) + "</code>",
          num(a.runs),
          a.failed ? '<span class="bad-txt">' + num(a.failed) + "</span>" : "0",
          '<span class="' + (pc >= 25 ? "bad-txt" : pc >= 10 ? "warn-txt" : "") + '">' + pc + "%</span>",
        ];
      }),
    );
  }

  function drawModel(m) {
    if (!Number(m.turns)) {
      S.el("modelNote").textContent = "";
      S.el("model").innerHTML = '<p class="muted">Nothing logged yet. Turns start being recorded — model, tokens, rounds, ' +
        'how long they took — from the next deploy, and the spend tile lights up with them.</p>';
      return;
    }
    S.el("modelNote").textContent = m.cost_complete ? "" : "a model that ran has no price set, so the money is short";
    var rounds = (m.rounds || []).map(function (r) {
      return plu(r.turns, "turn") + " took " + plu(r.rounds, "round");
    }).join(" · ");
    S.el("model").innerHTML = [
      kv("Turns", num(m.turns), num(m.calls) + " model calls · " + (m.rounds_avg || 1) + " rounds a turn on average · median " + secs(Number(m.ms_p50 || 0) / 1000)),
      kv("Tokens", num(Number(m.tokens_in || 0) + Number(m.tokens_out || 0)), num(m.tokens_in) + " in · " + num(m.tokens_out) + " out"),
      kv("Spend", money(m.cost), m.cost_per_turn ? money(m.cost_per_turn) + " a turn" : ""),
      kv("Ran out of rounds", num(m.out_of_rounds),
        m.out_of_rounds ? "the model hit its six-round ceiling and had to tell them what was left" : "never"),
      kv("Rounds", rounds || "—", ""),
      kv("Turns that threw", m.failed ? '<span class="bad-txt">' + num(m.failed) + "</span>" : "0", ""),
    ].join("") + '<div class="scroll" style="margin-top:14px">' + table(
      [{ t: "Model" }, { t: "Turns", num: true }, { t: "Tokens in", num: true }, { t: "Tokens out", num: true }, { t: "Cost", num: true }],
      (m.by_model || []).map(function (r) {
        return [S.esc(r.model), num(r.turns), num(r.tokens_in), num(r.tokens_out),
          r.cost === null ? '<span class="muted">no price</span>' : money(r.cost)];
      }),
    ) + "</div>";
  }

  function drawTools(list) {
    S.el("tools").innerHTML = table(
      [{ t: "Tool" }, { t: "Connected", num: true }, { t: "Working", num: true }, { t: "Needs reconnecting", num: true }],
      list.map(function (t) {
        return [S.esc(t.provider), num(t.connected), num(t.active),
          t.stale ? '<span class="bad-txt">' + num(t.stale) + "</span>" : "0"];
      }),
    );
  }

  function drawErrors(list) {
    if (!list.length) { S.el("errors").innerHTML = '<p class="muted">Nothing failed in this window.</p>'; return; }
    S.el("errors").innerHTML = table(
      [{ t: "Where" }, { t: "What" }, { t: "Times", num: true }, { t: "Last" }],
      list.map(function (e) {
        return [S.esc(e.where), '<span class="err">' + S.esc(e.error) + "</span>", num(e.seen), S.esc(ago(e.last)) + " ago"];
      }),
    );
  }

  // ---------- loading ----------

  function load() {
    S.el("when").textContent = "Loading…";
    return Promise.all([
      api({ action: "admin_overview", days: days }),
      api({ action: "admin_people" }),
    ]).then(function (rs) {
      var o = rs[0], pp = rs[1];
      if (!o.ok) { S.note("msg", o.message || "Couldn't read the numbers.", "bad"); S.el("when").textContent = ""; return; }
      over = o.overview;
      S.note("msg", "");
      drawTiles(over);
      drawVolume(over.series || []);
      drawLatency(over.series || []);
      drawFunnel(over.funnel);
      drawAgents(over.agents);
      drawActions(over.actions || [], over.model);
      drawModel(over.model);
      drawTools(over.tools || []);
      drawErrors(over.errors || []);
      if (pp.ok) drawPeople(pp.people || []);
      S.el("when").textContent = "Read at " + clock(over.now);
    });
  }

  function pickRange(btn) {
    days = Number(btn.getAttribute("data-days"));
    Array.prototype.forEach.call(document.querySelectorAll(".range button[data-days]"), function (b) {
      b.className = b === btn ? "on" : "";
    });
    load();
  }

  // ---------- start ----------

  S.el("in").addEventListener("click", startSignIn);
  S.el("refresh").addEventListener("click", load);
  S.el("out").addEventListener("click", function () {
    api({ action: "admin_logout" }).then(function () { set(""); token = ""; gate(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".range button[data-days]"), function (b) {
    b.addEventListener("click", function () { pickRange(b); });
  });

  var q = new URLSearchParams(location.search);
  var code = q.get("code"), state = q.get("state");
  if (q.get("error")) {
    history.replaceState(null, "", location.pathname);
    gate();
    S.note("msg", "Google didn't complete the sign-in. Please try again.", "bad");
  } else if (code && state) {
    gate();
    finishSignIn(code, state).then(function (email) { if (email) load(); });
  } else {
    token = get();
    if (!token) gate();
    else {
      api({ action: "admin_me" }).then(function (r) {
        if (!r.ok) { gate(); return; }
        signedIn(r.email);
        load();
      });
    }
  }
})();
