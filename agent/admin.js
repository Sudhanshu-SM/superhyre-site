/* /agent/admin-dashboard. Its own session, because its door is its own: a Google account in our domain, checked on
   the server. Everything else here is drawing — the numbers arrive already worked out, and no figure on this page is
   calculated twice in two places.

   The shape of the page is deliberate. Every headline number sits in one ribbon, small and semibold, each with its own
   reference beside it; one chart owns the view and the others are tabs of it, because two charts side by side halve
   both; the tables are dense because this is read at a glance, daily, by us. */
(function () {
  var S = window.SH, KEY = "sh_admin", token = "", days = 7, over = null, people = [];
  /* Which plot the one chart is showing, and whether it is showing its numbers instead. Every chart has a table twin:
     a tooltip may enhance a value but must never be the only way to read it. */
  var plot = "volume", asTable = false;
  var VB_W = 1040, VB_H = 268, PLOT_H = 220, PAD_L = 40;

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
  function money(v) {
    if (v === null || v === undefined) return "—";
    var n = Number(v);
    if (isNaN(n)) return "—";
    return n >= 10 ? "$" + n.toFixed(0) : n >= 0.01 ? "$" + n.toFixed(2) : "$" + n.toFixed(4);
  }
  /** A count and its noun, agreeing with each other: one person, four people, one call, nine calls. */
  function plu(n, one, many) {
    return num(n) + " " + (Number(n) === 1 ? one : (many || one + "s"));
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
  function quietKind(iso) {
    if (!iso) return "bad";
    var d = (Date.now() - new Date(iso).getTime()) / 86400000;
    return d >= 7 ? "bad" : d >= 4 ? "warn" : d <= 1 ? "ok" : "flat";
  }
  /** A state is a dot and a word together, so colour is never carrying it alone. */
  function sig(kind, words) {
    return '<span class="sig ' + kind + '"><i aria-hidden="true"></i>' + S.esc(words) + "</span>";
  }
  function clock(iso) {
    try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function delta(now, before) {
    if (before === null || before === undefined) return "";
    var a = Number(now), b = Number(before);
    if (isNaN(a) || isNaN(b)) return "";
    if (!b) return a > 0 ? "none the week before" : "";
    var pc = Math.round(((a - b) / b) * 100);
    return '<span class="' + (pc >= 0 ? "up" : "dn") + '">' + (pc >= 0 ? "+" : "") + pc + "%</span> on " + num(b);
  }
  function dayName(iso) {
    try {
      return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
    } catch (e) { return iso.slice(5); }
  }

  // ---------- signed out ----------

  function gate() {
    S.el("board").hidden = true;
    S.el("gate").hidden = false;
    ["who", "range", "refresh", "out"].forEach(function (id) { S.el(id).hidden = true; });
  }
  function signedIn(email) {
    S.el("gate").hidden = true;
    S.el("board").hidden = false;
    S.el("who").textContent = email;
    ["who", "range", "refresh", "out"].forEach(function (id) { S.el(id).hidden = false; });
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

  // ---------- the ribbon ----------

  function cell(k, n, d, cls) {
    return '<div class="cell"><div class="k">' + S.esc(k) + '</div><div class="n' + (cls ? " " + cls : "") + '">' +
      n + '</div><div class="d">' + (d || "") + "</div></div>";
  }

  function drawRibbon(o) {
    var t = o.tiles, m = o.model, waiting = Number(t.queued || 0) + Number(t.held || 0);
    var failPc = t.turns ? Math.round((t.failed / t.turns) * 1000) / 10 : 0;
    S.el("ribbon").innerHTML = [
      cell("Turns answered", num(t.turns), delta(t.turns, t.turns_before)),
      cell("People active", num(t.people) + ' <small>of ' + num(t.accounts) + "</small>",
        num(t.people_today) + " today · " + num(t.people_before) + " before"),
      cell("Median wait", secs(t.p50), "p90 " + secs(t.p90)),
      cell("Slowest reply", secs(t.slowest),
        Number(t.over_two_min) ? sig("warn", plu(t.over_two_min, "turn") + " over 2m") : "none over 2m"),
      cell("Failed turns", num(t.failed),
        Number(t.failed) ? sig("bad", plu(t.failed_people, "person", "people") + " · " + failPc + "%")
          : num(t.retried) + " retried"),
      cell("Waiting now", num(waiting), num(t.queued) + " queued · " + num(t.held) + " held"),
      cell("Model spend", m.cost === null ? "—" : money(m.cost),
        m.cost === null ? "nothing logged yet"
          : (m.cost_complete ? "" : "a model has no price · ") + (m.cost_per_turn ? money(m.cost_per_turn) + " a turn" : ""),
        m.cost === null ? "none" : ""),
    ].join("");
  }

  // ---------- the one chart ----------

  /**
   * A step off a ladder of round numbers, and a top that is a whole number of them — so the ticks are values a person
   * would have chosen and the tallest mark nearly fills the plot. Rounding the top up on its own is not enough: 102
   * rounded up that way gives 200, which wastes half the height and puts the gridlines at 67 and 133.
   */
  function niceAxis(max) {
    if (!(max > 0)) return { top: 1, step: 1 };
    var raw = max / 4, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), n = raw / mag;
    var step = (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10) * mag;
    return { top: Math.ceil(max / step) * step, step: step };
  }
  var y = function (v, top) { return PLOT_H - (Number(v || 0) / top) * PLOT_H; };

  function gridlines(ax, fmt) {
    var out = "";
    for (var v = 0; v <= ax.top + 1e-9; v += ax.step) {
      var yy = y(v, ax.top);
      out += '<line class="grid" x1="' + PAD_L + '" y1="' + yy.toFixed(1) + '" x2="' + VB_W + '" y2="' + yy.toFixed(1) + '"></line>' +
        '<text class="axis" x="4" y="' + (yy + 4).toFixed(1) + '">' + fmt(v) + "</text>";
    }
    return out;
  }

  /** One transparent band per day, the full height of the plot: nobody should have to hit a 14px bar. */
  function hitbands(series, slot) {
    return series.map(function (d, i) {
      return '<rect class="hit" x="' + (PAD_L + i * slot) + '" y="0" width="' + slot + '" height="' + PLOT_H +
        '" tabindex="0" role="img" data-i="' + i + '" aria-label="' + S.esc(dayName(d.day)) + '"></rect>';
    }).join("");
  }

  function xlabels(series, slot) {
    var every = series.length <= 10 ? 1 : series.length <= 31 ? 3 : 7;
    return series.map(function (d, i) {
      if (i !== series.length - 1 && i % every !== 0) return "";
      return '<text class="axis" x="' + (PAD_L + i * slot + slot / 2) + '" y="' + (PLOT_H + 20) +
        '" text-anchor="middle">' + S.esc(dayName(d.day)) + "</text>";
    }).join("");
  }

  var PLOTS = {
    volume: {
      name: "Messages a day",
      legend: '<span><i style="background:var(--accent)"></i>in</span><span><i style="background:var(--s2)"></i>out</span>',
      cols: ["In", "Out", "People"],
      row: function (d) { return [num(d.in), num(d.out), num(d.people)]; },
      max: function (s) { return Math.max.apply(null, [1].concat(s.map(function (d) { return Math.max(d.in || 0, d.out || 0); }))); },
      fmt: function (v) { return String(Math.round(v)); },
      marks: function (s, slot, top) {
        // Bars grow with the slot: at seven days a pair reads as a block, at sixty as hairlines.
        var bw = Math.max(2, Math.min(34, slot / 3.5));
        return s.map(function (d, i) {
          var mid = PAD_L + i * slot + slot / 2, hi = PLOT_H - y(d.in, top), ho = PLOT_H - y(d.out, top);
          return '<rect class="bin" x="' + (mid - bw - 1) + '" y="' + y(d.in, top).toFixed(1) + '" width="' + bw + '" height="' + hi.toFixed(1) + '" rx="3"></rect>' +
            '<rect class="bout" x="' + (mid + 1) + '" y="' + y(d.out, top).toFixed(1) + '" width="' + bw + '" height="' + ho.toFixed(1) + '" rx="3"></rect>';
        }).join("");
      },
      tip: function (d) {
        return '<div class="t">' + S.esc(dayName(d.day)) + "</div><b>" + num(d.in) + "</b> in · <b>" + num(d.out) +
          "</b> out<div class=\"t\">" + plu(d.people, "person", "people") + "</div>";
      },
    },
    latency: {
      name: "Reply time",
      legend: '<span><i style="background:var(--p50)"></i>median</span><span><i style="background:var(--p90)"></i>slowest tenth</span><span><span class="dash"></span>two minutes</span>',
      cols: ["Median", "Slowest tenth"],
      row: function (d) { return [secs(d.p50), secs(d.p90)]; },
      max: function (s) { return Math.max.apply(null, [1].concat(s.map(function (d) { return Math.max(d.p90 || 0, d.p50 || 0); }))); },
      fmt: function (v) { return Math.round(v) + "s"; },
      marks: function (s, slot, top) {
        var pts = function (key) {
          return s.map(function (d, i) {
            if (d[key] === null || d[key] === undefined) return null;
            return (PAD_L + i * slot + slot / 2).toFixed(1) + "," + y(d[key], top).toFixed(1);
          }).filter(Boolean);
        };
        var p50 = pts("p50"), p90 = pts("p90"), out = "";
        if (top >= 120) {
          out += '<line class="thr" x1="' + PAD_L + '" y1="' + y(120, top).toFixed(1) + '" x2="' + VB_W + '" y2="' + y(120, top).toFixed(1) + '"></line>';
        }
        out += '<polyline class="l90" points="' + p90.join(" ") + '"></polyline>' +
          '<polyline class="l50" points="' + p50.join(" ") + '"></polyline>';
        // A line through one point draws nothing, so a single day gets dots.
        if (p90.length === 1) out += '<circle class="d90" cx="' + p90[0].split(",")[0] + '" cy="' + p90[0].split(",")[1] + '" r="4"></circle>';
        if (p50.length === 1) out += '<circle class="d50" cx="' + p50[0].split(",")[0] + '" cy="' + p50[0].split(",")[1] + '" r="4"></circle>';
        return out;
      },
      tip: function (d) {
        return '<div class="t">' + S.esc(dayName(d.day)) + "</div>median <b>" + secs(d.p50) + "</b><div class=\"t\">slowest tenth " + secs(d.p90) + "</div>";
      },
    },
    tokens: {
      name: "Tokens a day",
      legend: '<span><i style="background:var(--accent)"></i>tokens in and out</span>',
      cols: ["Tokens", "Turns"],
      row: function (d) { return [num(d.tokens), num(d.turns)]; },
      max: function (s) { return Math.max.apply(null, [1].concat(s.map(function (d) { return d.tokens || 0; }))); },
      fmt: function (v) { return v >= 1000 ? Math.round(v / 1000) + "k" : String(Math.round(v)); },
      // One measure, one axis. Turns live in the tooltip rather than on a second scale.
      marks: function (s, slot, top) {
        var bw = Math.max(2, Math.min(34, slot / 2.2));
        return s.map(function (d, i) {
          var mid = PAD_L + i * slot + slot / 2, h = PLOT_H - y(d.tokens, top);
          return '<rect class="bin" x="' + (mid - bw / 2) + '" y="' + y(d.tokens, top).toFixed(1) + '" width="' + bw + '" height="' + h.toFixed(1) + '" rx="3"></rect>';
        }).join("");
      },
      tip: function (d) {
        return '<div class="t">' + S.esc(dayName(d.day)) + "</div><b>" + num(d.tokens) + "</b> tokens<div class=\"t\">over " + plu(d.turns, "turn") + "</div>";
      },
    },
  };

  function drawPlot() {
    var series = (over && over.series) || [], p = PLOTS[plot], box = S.el("plot");
    S.el("legend").innerHTML = asTable ? "" : p.legend;
    S.el("plotnote").innerHTML = '<button class="link" id="twin">' + (asTable ? "Show the chart" : "Show the numbers") + "</button>";
    if (!series.length) { box.innerHTML = '<p class="muted">Nothing in this window.</p>'; wireTwin(); return; }

    if (asTable) {
      box.innerHTML = table(
        [{ t: "Day" }].concat(p.cols.map(function (c) { return { t: c, num: true }; })),
        series.map(function (d) { return [S.esc(dayName(d.day))].concat(p.row(d)); }),
      );
      wireTwin();
      return;
    }

    var ax = niceAxis(p.max(series)), top = ax.top, slot = (VB_W - PAD_L) / series.length;
    box.innerHTML = '<svg class="chart" viewBox="0 0 ' + VB_W + " " + VB_H + '" role="img" aria-label="' + S.esc(p.name) + '">' +
      gridlines(ax, p.fmt) + p.marks(series, slot, top) + xlabels(series, slot) + hitbands(series, slot) +
      '</svg><div class="tip" id="tip" hidden></div>';
    wireTwin();
    wireHover(series, slot, top, p);
  }

  function wireTwin() {
    var b = S.el("twin");
    if (b) b.addEventListener("click", function () { asTable = !asTable; drawPlot(); });
  }

  /** Hover and keyboard focus show the same thing, because a value a mouse can reach a keyboard must too. */
  function wireHover(series, slot, top, p) {
    var box = S.el("plot"), tip = S.el("tip"), svg = box.querySelector("svg");
    function show(i) {
      var d = series[i];
      if (!d) return;
      tip.innerHTML = p.tip(d);
      tip.hidden = false;
      var r = svg.getBoundingClientRect();
      var cx = PAD_L + i * slot + slot / 2;
      var hi = plot === "latency" ? Math.min(y(d.p50, top), y(d.p90, top))
        : plot === "tokens" ? y(d.tokens, top) : Math.min(y(d.in, top), y(d.out, top));
      tip.style.left = (cx / VB_W * r.width) + "px";
      tip.style.top = ((hi / VB_H) * r.height - 8) + "px";
    }
    function hide() { tip.hidden = true; }
    Array.prototype.forEach.call(box.querySelectorAll(".hit"), function (el) {
      var i = Number(el.getAttribute("data-i"));
      el.addEventListener("mouseenter", function () { show(i); });
      el.addEventListener("focus", function () { show(i); });
      el.addEventListener("mouseleave", hide);
      el.addEventListener("blur", hide);
    });
  }

  // ---------- tables ----------

  function table(cols, rows) {
    if (!rows.length) return '<p class="muted">Nothing yet.</p>';
    return "<table><thead><tr>" + cols.map(function (c) {
      return '<th' + (c.num ? ' class="num"' : "") + ">" + S.esc(c.t) + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.map(function (r) {
      return "<tr>" + r.map(function (cell, i) {
        return "<td" + (cols[i].num ? ' class="num"' : "") + ">" + cell + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
  }

  var AGENT_SHORT = { assistant: "assistant", talent_ops: "talent ops", sourcing: "sourcing" };

  function drawPeople(list) {
    var holders = list.filter(function (p) { return p.kind === "recruiter"; }).length;
    S.el("peopleNote").textContent = plu(list.length, "account") + " · " + holders +
      " of them account holders · sorted by how long they have been quiet";
    S.el("people").innerHTML = table(
      [{ t: "Person" }, { t: "Team" }, { t: "Quiet for" }, { t: "7d", num: true }, { t: "Turns", num: true },
        { t: "Median", num: true }, { t: "Agents" }, { t: "Tools" }, { t: "Failed", num: true }],
      list.map(function (p) {
        var agents = (p.agents || []).map(function (a) { return AGENT_SHORT[a] || a; });
        return [
          '<span class="who">' + S.esc(p.name || "Unnamed") + "</span>" +
            '<div class="sub">' + (p.kind === "member" ? "candidate or hiring manager" : "account holder") + " · ···" + S.esc(p.tail || "") + "</div>",
          '<span class="sub">' + S.esc(p.org || (p.kind === "member" ? "—" : "no team")) + "</span>",
          sig(quietKind(p.last_in), ago(p.last_in)),
          num(p.turns7),
          num(p.turns),
          secs(p.p50),
          agents.length === 3 ? "all three" : agents.length ? S.esc(agents.join(", ")) : '<span class="sub">—</span>',
          (p.tools || []).length ? S.esc((p.tools || []).join(", ")) : '<span class="sub">—</span>',
          p.failed ? '<span style="color:var(--bad)">' + num(p.failed) + "</span>" : "0",
        ];
      }),
    );
  }

  /* Milestones, not a funnel. These are not nested subsets of one another — talent operations needs no connected
     tool, and somebody active this week need never have switched a second agent on — so they are each shown as a
     share of the account holders rather than as a fall from the line above, which would invent a drop-off. */
  var MILESTONES = [
    ["Was welcomed", "welcomed"],
    ["Said something of their own", "said_something"],
    ["Said five things", "stayed"],
    ["Connected a tool", "connected_a_tool"],
    ["Switched a second agent on", "switched_an_agent_on"],
    ["Here this week", "here_this_week"],
    ["Here today", "here_today"],
  ];

  function drawFunnel(f) {
    if (!f) { S.el("funnel").innerHTML = '<p class="muted">Nothing yet.</p>'; return; }
    var of = Number(f.holders || 0);
    S.el("funnel").innerHTML = table(
      [{ t: "Of " + plu(of, "account holder") }, { t: "" }, { t: "People", num: true }],
      MILESTONES.map(function (s) {
        var v = Number(f[s[1]] || 0), pc = of ? Math.round((v / of) * 100) : 0;
        return [S.esc(s[0]), '<div class="trackbar"><i style="width:' + pc + '%"></i></div>',
          num(v) + ' <span class="sub">' + pc + "%</span>"];
      }),
    );
  }

  function drawAgents(a) {
    var on = {};
    (a.on || []).forEach(function (r) { on[r.agent] = r; });
    var p = a.assistant, to = a.talent_ops, so = a.sourcing, me = a.meetings;
    function count(key) { return on[key] ? num(on[key].on) : "0"; }
    S.el("agents").innerHTML = table(
      [{ t: "Agent" }, { t: "On", num: true }, { t: "What it has done" }, { t: "Watch" }],
      [
        ['<span class="who">Personal assistant</span>', count("assistant"),
          plu(p.memories, "memory", "memories") + " · " + num(p.known) + " known · " + plu(p.routines, "routine"),
          p.crawls_failed ? sig("warn", plu(p.crawls_failed, "crawl") + " failed")
            : p.sync_failing ? sig("warn", plu(p.sync_failing, "stream") + " failing") : sig("ok", "nothing failing")],
        ['<span class="who">Talent operations</span>', count("talent_ops"),
          plu(to.jobs, "job") + " · " + num(to.members) + " joined",
          to.meetings ? sig("ok", plu(to.meetings, "interview") + " booked") : sig("warn", "nothing booked yet")],
        ['<span class="who">Sourcing</span>', count("sourcing"),
          num(so.jds) + " JDs · " + plu(so.runs, "run") + (so.per_run ? " · " + num(so.per_run) + " a run" : ""),
          so.runs_failed ? sig("bad", plu(so.runs_failed, "run") + " failed") : sig("ok", "nothing failing")],
        ['<span class="who">Meeting assistant</span>', num(me.installs),
          plu(me.calls, "call") + " · " + plu(me.cards, "card") + " · " + num(me.hours) + " hours",
          me.problems ? sig("bad", num(me.problems) + " with no card") : sig("ok", "nothing failing")],
      ],
    );
  }

  function drawActions(list, model) {
    if (!list.length) {
      S.el("actionsNote").textContent = "";
      S.el("actions").innerHTML = '<p class="muted" style="padding:14px 16px">Nothing logged yet. Every turn from here on ' +
        'records which actions it ran, so this fills up on its own.</p>';
      return;
    }
    var runs = 0;
    list.forEach(function (a) { runs += Number(a.runs || 0); });
    S.el("actionsNote").textContent = plu(runs, "action") + " over " + plu(model.turns, "turn");
    S.el("actions").innerHTML = table(
      [{ t: "Action" }, { t: "Run", num: true }, { t: "Failed", num: true }, { t: "Failure rate", num: true }],
      list.map(function (a) {
        var pc = a.runs ? Math.round((a.failed / a.runs) * 1000) / 10 : 0;
        return ["<code>" + S.esc(a.type) + "</code>", num(a.runs),
          a.failed ? '<span style="color:var(--bad)">' + num(a.failed) + "</span>" : "0",
          pc >= 25 ? sig("bad", pc + "%") : pc >= 10 ? sig("warn", pc + "%") : pc + "%"];
      }),
    );
  }

  function drawModel(m) {
    if (!Number(m.turns)) {
      S.el("modelNote").textContent = "";
      S.el("model").innerHTML = '<p class="muted" style="padding:14px 16px">Nothing logged yet. Turns start being ' +
        'recorded — model, tokens, rounds, how long they took — as soon as traffic comes through.</p>';
      return;
    }
    S.el("modelNote").textContent = m.cost_complete ? plu(m.calls, "model call") : "a model that ran has no price set";
    S.el("model").innerHTML = table(
      [{ t: "Model" }, { t: "Turns", num: true }, { t: "Tokens in", num: true }, { t: "Tokens out", num: true }, { t: "Cost", num: true }],
      (m.by_model || []).map(function (r) {
        return [S.esc(r.model), num(r.turns), num(r.tokens_in), num(r.tokens_out),
          r.cost === null ? '<span class="sub">no price</span>' : money(r.cost)];
      }).concat([[
        '<span class="sub">' + (m.rounds_avg || 1) + " rounds a turn · median " + secs(Number(m.ms_p50 || 0) / 1000) +
          (m.out_of_rounds ? " · " + plu(m.out_of_rounds, "turn") + " out of rounds" : "") + "</span>",
        "", "", "", "",
      ]]),
    );
  }

  function drawTools(list) {
    S.el("tools").innerHTML = table(
      [{ t: "Tool" }, { t: "Connected", num: true }, { t: "Working", num: true }, { t: "Needs reconnecting", num: true }],
      list.map(function (t) {
        return [S.esc(t.provider), num(t.connected), num(t.active),
          t.stale ? '<span style="color:var(--bad)">' + num(t.stale) + "</span>" : "0"];
      }),
    );
  }

  function drawErrors(list) {
    if (!list.length) { S.el("errors").innerHTML = '<p class="muted" style="padding:14px 16px">Nothing failed in this window.</p>'; return; }
    S.el("errors").innerHTML = table(
      [{ t: "Where" }, { t: "What" }, { t: "Times", num: true }, { t: "Last" }],
      list.map(function (e) {
        return [S.esc(e.where), '<span class="err">' + S.esc(e.error) + "</span>", num(e.seen),
          '<span class="sub">' + S.esc(ago(e.last)) + " ago</span>"];
      }),
    );
  }

  // ---------- loading ----------

  function load() {
    S.el("lead").textContent = "Loading…";
    return Promise.all([
      api({ action: "admin_overview", days: days }),
      api({ action: "admin_people" }),
    ]).then(function (rs) {
      var o = rs[0], pp = rs[1];
      if (!o.ok) { S.note("msg", o.message || "Couldn't read the numbers.", "bad"); return; }
      over = o.overview;
      people = pp.ok ? (pp.people || []) : [];
      S.note("msg", "");
      S.el("lead").textContent = "Read at " + clock(over.now) +
        " · numbers only — no one's messages, memories or JDs are readable from here.";
      drawRibbon(over);
      drawPlot();
      drawPeople(people);
      drawFunnel(over.funnel);
      drawAgents(over.agents);
      drawActions(over.actions || [], over.model);
      drawModel(over.model);
      drawTools(over.tools || []);
      drawErrors(over.errors || []);
    });
  }

  // ---------- start ----------

  S.el("in").addEventListener("click", startSignIn);
  S.el("refresh").addEventListener("click", load);
  S.el("out").addEventListener("click", function () {
    api({ action: "admin_logout" }).then(function () { set(""); token = ""; gate(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("#range button"), function (b) {
    b.addEventListener("click", function () {
      days = Number(b.getAttribute("data-days"));
      Array.prototype.forEach.call(document.querySelectorAll("#range button"), function (x) { x.className = x === b ? "on" : ""; });
      load();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) {
    b.addEventListener("click", function () {
      plot = b.getAttribute("data-plot");
      Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (x) { x.className = x === b ? "on" : ""; });
      drawPlot();
    });
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
