/* The Agent half of superhyre.com/admins-superhyre-ke/.
 *
 * The same dashboard as /agent/admin-dashboard (its drawing is carried over from agent/admin.js), but signed in the
 * way the rest of this page is: the Supabase Google session, and public.admin_agent_dashboard, which lets in only the
 * people core.is_extension_admin lets in and logs every read to agent_admin_audit. That page and the onboard function
 * behind it are unchanged; the page now forwards here.
 *
 * Model spend is priced here from each model's own tokens, with the onboard function's built-in prices (no
 * GATEWAY_PRICES override is set), so the figure is the one the agent page shows.
 *
 * admins.js owns sign-in, the header and switching views; it calls AgentView(ctx).load().
 */
(function (w) {
  "use strict";

  // Dollars per million tokens, in and out: the onboard function's BUILT_IN_PRICES.
  var PRICES = { "claude-haiku-5-5": [0.1, 0.5], "claude-sonnet-5-5": [2, 10], "claude-opus-5-5": [4, 20] };
  var VB_W = 1040, VB_H = 268, PLOT_H = 220, PAD_L = 40;

  w.AgentView = function (ctx) {
    var esc = ctx.esc;
    var days = 7, over = null, people = [], plot = "volume", asTable = false, loaded = false, busy = false;

    function A(id) { return document.getElementById("ag-" + id); }

    // ---------- numbers as words ----------

    function num(v) {
      if (v === null || v === undefined || v === "") return "—";
      var n = Number(v);
      return isNaN(n) ? String(v) : n.toLocaleString("en-IN");
    }
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
    function plu(n, one, many) { return num(n) + " " + (Number(n) === 1 ? one : (many || one + "s")); }
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
    function quietKind(iso) {
      if (!iso) return "bad";
      var d = (Date.now() - new Date(iso).getTime()) / 86400000;
      return d >= 7 ? "bad" : d >= 4 ? "warn" : d <= 1 ? "ok" : "flat";
    }
    function sig(kind, words) { return '<span class="sig ' + kind + '"><i aria-hidden="true"></i>' + esc(words) + "</span>"; }
    function clock(iso) {
      try { return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
      catch (e) { return ""; }
    }
    function delta(now, before) {
      if (days >= 3650 || before === null || before === undefined) return "";
      var a = Number(now), b = Number(before);
      if (isNaN(a) || isNaN(b)) return "";
      if (!b) return a > 0 ? "none the period before" : "";
      var pc = Math.round(((a - b) / b) * 100);
      return '<span class="' + (pc >= 0 ? "up" : "dn") + '">' + (pc >= 0 ? "+" : "") + pc + "%</span> vs " + num(b) + " before";
    }
    function dayName(iso) {
      try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }); }
      catch (e) { return String(iso).slice(5); }
    }

    // ---------- spend, priced per model ----------

    function priceFor(model) {
      var id = String(model || "").toLowerCase();
      if (PRICES[id]) return PRICES[id];
      var near = Object.keys(PRICES).filter(function (k) { return id.indexOf(k) === 0; }).sort(function (a, b) { return b.length - a.length; })[0];
      return near ? PRICES[near] : null;
    }
    function withCost(model) {
      model = model || {};
      var rows = Array.isArray(model.by_model) ? model.by_model : [], total = 0, priced = true;
      var by = rows.map(function (row) {
        if (!Number(row.tokens_in || 0) && !Number(row.tokens_out || 0)) return Object.assign({}, row, { cost: 0 });
        var p = priceFor(row.model);
        if (!p) { priced = false; return Object.assign({}, row, { cost: null }); }
        var c = (Number(row.tokens_in || 0) * p[0] + Number(row.tokens_out || 0) * p[1]) / 1e6;
        total += c;
        return Object.assign({}, row, { cost: Math.round(c * 10000) / 10000 });
      });
      return Object.assign({}, model, {
        by_model: by,
        cost: rows.length ? Math.round(total * 10000) / 10000 : null,
        cost_per_turn: Number(model.turns) > 0 && rows.length ? Math.round((total / Number(model.turns)) * 100000) / 100000 : null,
        cost_complete: priced
      });
    }

    // ---------- the tiles ----------

    function tile(k, n, d, none) {
      return '<div class="tile"><div class="k">' + esc(k) + '</div><div class="n' + (none ? " none" : "") + '">' + n +
        '</div><div class="d">' + (d || "") + "</div></div>";
    }
    function drawRibbon(o) {
      var t = o.tiles || {}, m = o.model, waiting = Number(t.queued || 0) + Number(t.held || 0);
      var failPc = t.turns ? Math.round((t.failed / t.turns) * 1000) / 10 : 0;
      A("ribbon").innerHTML = [
        tile("Turns answered", num(t.turns), delta(t.turns, t.turns_before)),
        tile("People active", num(t.people) + " <small>of " + num(t.accounts) + "</small>",
          num(t.people_today) + " today · " + num(t.people_before) + " before"),
        tile("Median wait", secs(t.p50), "slowest tenth " + secs(t.p90)),
        tile("Slowest reply", secs(t.slowest),
          Number(t.over_two_min) ? sig("warn", plu(t.over_two_min, "turn") + " over 2m") : "none over 2m"),
        tile("Failed turns", num(t.failed),
          Number(t.failed) ? sig("bad", plu(t.failed_people, "person", "people") + " · " + failPc + "%") : num(t.retried) + " retried"),
        tile("Waiting now", num(waiting), num(t.queued) + " queued · " + num(t.held) + " held"),
        tile("Model spend", m.cost === null ? "—" : money(m.cost),
          m.cost === null ? "nothing logged yet"
            : (m.cost_complete ? "" : "a model has no price · ") + (m.cost_per_turn ? money(m.cost_per_turn) + " a turn" : ""),
          m.cost === null)
      ].join("");
    }

    // ---------- the one chart (SVG, with hover and keyboard reading) ----------

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
    function hitbands(series, slot) {
      return series.map(function (d, i) {
        return '<rect class="hit" x="' + (PAD_L + i * slot) + '" y="0" width="' + slot + '" height="' + PLOT_H + '" data-i="' + i + '"></rect>';
      }).join("");
    }
    function xlabels(series, slot) {
      var every = series.length <= 10 ? 1 : series.length <= 31 ? 3 : 7;
      return series.map(function (d, i) {
        if (i !== series.length - 1 && i % every !== 0) return "";
        return '<text class="axis" x="' + (PAD_L + i * slot + slot / 2) + '" y="' + (PLOT_H + 20) + '" text-anchor="middle">' + esc(dayName(d.day)) + "</text>";
      }).join("");
    }

    var PLOTS = {
      volume: {
        name: "Messages a day",
        legend: '<span><i style="background:var(--ag-in)"></i>in</span><span><i style="background:var(--ag-out)"></i>out</span>',
        cols: ["In", "Out", "People"],
        row: function (d) { return [num(d.in), num(d.out), num(d.people)]; },
        max: function (s) { return Math.max.apply(null, [1].concat(s.map(function (d) { return Math.max(d.in || 0, d.out || 0); }))); },
        fmt: function (v) { return String(Math.round(v)); },
        marks: function (s, slot, top) {
          var bw = Math.max(2, Math.min(34, slot / 3.5));
          return s.map(function (d, i) {
            var mid = PAD_L + i * slot + slot / 2, hi = PLOT_H - y(d.in, top), ho = PLOT_H - y(d.out, top);
            return '<rect class="bin" x="' + (mid - bw - 1) + '" y="' + y(d.in, top).toFixed(1) + '" width="' + bw + '" height="' + hi.toFixed(1) + '" rx="3"></rect>' +
              '<rect class="bout" x="' + (mid + 1) + '" y="' + y(d.out, top).toFixed(1) + '" width="' + bw + '" height="' + ho.toFixed(1) + '" rx="3"></rect>';
          }).join("");
        },
        tip: function (d) {
          return '<div class="t">' + esc(dayName(d.day)) + "</div><b>" + num(d.in) + "</b> in · <b>" + num(d.out) +
            '</b> out<div class="t">' + plu(d.people, "person", "people") + "</div>";
        }
      },
      latency: {
        name: "Reply time",
        legend: '<span><i style="background:var(--ag-p50)"></i>median</span><span><i style="background:var(--ag-p90)"></i>slowest tenth</span><span><span class="dash"></span>two minutes</span>',
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
          if (top >= 120) out += '<line class="thr" x1="' + PAD_L + '" y1="' + y(120, top).toFixed(1) + '" x2="' + VB_W + '" y2="' + y(120, top).toFixed(1) + '"></line>';
          out += '<polyline class="l90" points="' + p90.join(" ") + '"></polyline><polyline class="l50" points="' + p50.join(" ") + '"></polyline>';
          if (p90.length === 1) out += '<circle class="d90" cx="' + p90[0].split(",")[0] + '" cy="' + p90[0].split(",")[1] + '" r="4"></circle>';
          if (p50.length === 1) out += '<circle class="d50" cx="' + p50[0].split(",")[0] + '" cy="' + p50[0].split(",")[1] + '" r="4"></circle>';
          return out;
        },
        tip: function (d) {
          return '<div class="t">' + esc(dayName(d.day)) + "</div>median <b>" + secs(d.p50) + '</b><div class="t">slowest tenth ' + secs(d.p90) + "</div>";
        }
      },
      tokens: {
        name: "Tokens a day",
        legend: '<span><i style="background:var(--ag-in)"></i>tokens in and out</span>',
        cols: ["Tokens", "Turns"],
        row: function (d) { return [num(d.tokens), num(d.turns)]; },
        max: function (s) { return Math.max.apply(null, [1].concat(s.map(function (d) { return d.tokens || 0; }))); },
        fmt: function (v) { return v >= 1000 ? Math.round(v / 1000) + "k" : String(Math.round(v)); },
        marks: function (s, slot, top) {
          var bw = Math.max(2, Math.min(34, slot / 2.2));
          return s.map(function (d, i) {
            var mid = PAD_L + i * slot + slot / 2, h = PLOT_H - y(d.tokens, top);
            return '<rect class="bin" x="' + (mid - bw / 2) + '" y="' + y(d.tokens, top).toFixed(1) + '" width="' + bw + '" height="' + h.toFixed(1) + '" rx="3"></rect>';
          }).join("");
        },
        tip: function (d) {
          return '<div class="t">' + esc(dayName(d.day)) + "</div><b>" + num(d.tokens) + '</b> tokens<div class="t">over ' + plu(d.turns, "turn") + "</div>";
        }
      }
    };

    function drawPlot() {
      var series = (over && over.series) || [], p = PLOTS[plot], box = A("plot");
      A("legend").innerHTML = asTable ? "" : p.legend;
      A("plotnote").innerHTML = '<button class="link" id="ag-twin">' + (asTable ? "Show the chart" : "Show the numbers") + "</button>";
      if (!series.length) { box.innerHTML = '<p class="muted">Nothing in this window.</p>'; wireTwin(); return; }
      if (asTable) {
        box.innerHTML = table([{ t: "Day" }].concat(p.cols.map(function (c) { return { t: c, num: true }; })),
          series.map(function (d) { return [esc(dayName(d.day))].concat(p.row(d)); }));
        wireTwin();
        return;
      }
      var ax = niceAxis(p.max(series)), top = ax.top, slot = (VB_W - PAD_L) / series.length;
      box.innerHTML = '<svg class="chart" viewBox="0 0 ' + VB_W + " " + VB_H + '" tabindex="0" role="img" aria-label="' +
        esc(p.name) + ", " + plu(series.length, "day") + '. Use the arrow keys to read each day.">' +
        gridlines(ax, p.fmt) + p.marks(series, slot, top) + xlabels(series, slot) + hitbands(series, slot) +
        '</svg><div class="tip" id="ag-tip" hidden></div>';
      wireTwin();
      wireHover(series, slot, top, p);
    }
    function wireTwin() {
      var b = A("twin");
      if (b) b.onclick = function () { asTable = !asTable; drawPlot(); };
    }
    function wireHover(series, slot, top, p) {
      var box = A("plot"), tip = A("tip"), svg = box.querySelector("svg");
      function show(i) {
        var d = series[i];
        if (!d) return;
        tip.innerHTML = p.tip(d);
        tip.hidden = false;
        var r = svg.getBoundingClientRect(), cx = PAD_L + i * slot + slot / 2;
        var hi = plot === "latency" ? Math.min(y(d.p50, top), y(d.p90, top)) : plot === "tokens" ? y(d.tokens, top) : Math.min(y(d.in, top), y(d.out, top));
        tip.style.left = (cx / VB_W * r.width) + "px";
        tip.style.top = ((hi / VB_H) * r.height - 8) + "px";
      }
      function hide() { tip.hidden = true; }
      Array.prototype.forEach.call(box.querySelectorAll(".hit"), function (el) {
        var i = Number(el.getAttribute("data-i"));
        el.addEventListener("mouseenter", function () { show(i); });
        el.addEventListener("mouseleave", hide);
      });
      var at = -1;
      svg.addEventListener("keydown", function (e) {
        var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (step) { at = at < 0 ? (step > 0 ? 0 : series.length - 1) : Math.max(0, Math.min(series.length - 1, at + step)); show(at); e.preventDefault(); }
        else if (e.key === "Home") { at = 0; show(at); e.preventDefault(); }
        else if (e.key === "End") { at = series.length - 1; show(at); e.preventDefault(); }
        else if (e.key === "Escape") { at = -1; hide(); }
      });
      svg.addEventListener("blur", function () { at = -1; hide(); });
    }

    // ---------- tables ----------

    function table(cols, rows) {
      if (!rows.length) return '<p class="empty">Nothing yet.</p>';
      return "<table><thead><tr>" + cols.map(function (c) {
        return "<th" + (c.num ? ' class="num"' : "") + ">" + esc(c.t) + "</th>";
      }).join("") + "</tr></thead><tbody>" + rows.map(function (r) {
        return "<tr>" + r.map(function (cell, i) { return "<td" + (cols[i].num ? ' class="num"' : "") + ">" + cell + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
    }

    var AGENT_SHORT = { assistant: "assistant", talent_ops: "talent ops", sourcing: "sourcing" };

    function drawPeople(list) {
      var holders = list.filter(function (p) { return p.kind === "recruiter"; }).length;
      A("peopleNote").textContent = plu(list.length, "account") + " · " + holders + " of them account holders · quietest first";
      A("people").innerHTML = table(
        [{ t: "Person" }, { t: "Team" }, { t: "Quiet for" }, { t: "7 days", num: true }, { t: "Turns", num: true },
          { t: "Median", num: true }, { t: "Agents" }, { t: "Tools" }, { t: "Failed", num: true }],
        list.map(function (p) {
          var agents = (p.agents || []).map(function (a) { return AGENT_SHORT[a] || a; });
          return [
            "<b>" + esc(p.name || "Unnamed") + '</b><span class="sub">' + (p.kind === "member" ? "candidate or hiring manager" : "account holder") + " · ···" + esc(p.tail || "") + "</span>",
            esc(p.org || (p.kind === "member" ? "—" : "no team")),
            sig(quietKind(p.last_in), ago(p.last_in)),
            num(p.turns7), num(p.turns), secs(p.p50),
            agents.length === 3 ? "all three" : agents.length ? esc(agents.join(", ")) : '<span class="note">—</span>',
            (p.tools || []).length ? esc((p.tools || []).join(", ")) : '<span class="note">—</span>',
            p.failed ? '<span class="pill bad">' + num(p.failed) + "</span>" : "0"
          ];
        }));
    }

    var MILESTONES = [
      ["Was welcomed", "welcomed"], ["Said something of their own", "said_something"], ["Said five things", "stayed"],
      ["Connected a tool", "connected_a_tool"], ["Switched a second agent on", "switched_an_agent_on"],
      ["Here this week", "here_this_week"], ["Here today", "here_today"]
    ];
    function drawFunnel(f) {
      if (!f) { A("funnel").innerHTML = '<p class="empty">Nothing yet.</p>'; return; }
      var of = Number(f.holders || 0);
      A("funnel").innerHTML = table([{ t: "Of " + plu(of, "account holder") }, { t: "" }, { t: "People", num: true }],
        MILESTONES.map(function (s) {
          var v = Number(f[s[1]] || 0), pc = of ? Math.round((v / of) * 100) : 0;
          return [esc(s[0]), '<div class="trackbar"><i style="width:' + pc + '%"></i></div>', num(v) + ' <span class="note">' + pc + "%</span>"];
        }));
    }

    function drawAgents(a) {
      a = a || {};
      var on = {};
      (a.on || []).forEach(function (r) { on[r.agent] = r; });
      var p = a.assistant || {}, to = a.talent_ops || {}, me = a.meetings || {};
      function count(key) { return on[key] ? num(on[key].on) : "0"; }
      A("agents").innerHTML = table([{ t: "Agent" }, { t: "On", num: true }, { t: "What it has done" }, { t: "Watch" }], [
        ["<b>Personal assistant</b>", count("assistant"),
          plu(p.memories, "memory", "memories") + " · " + num(p.known) + " known · " + plu(p.routines, "routine"),
          p.crawls_failed ? sig("warn", plu(p.crawls_failed, "crawl") + " failed") : p.sync_failing ? sig("warn", plu(p.sync_failing, "stream") + " failing") : sig("ok", "nothing failing")],
        ["<b>Talent operations</b>", count("talent_ops"), plu(to.jobs, "job") + " · " + num(to.members) + " joined",
          to.meetings ? sig("ok", plu(to.meetings, "interview") + " booked") : sig("warn", "nothing booked yet")],
        ["<b>Meeting assistant</b>", num(me.installs), plu(me.calls, "call") + " · " + plu(me.cards, "card") + " · " + num(me.hours) + " hours",
          me.problems ? sig("bad", num(me.problems) + " with no card") : sig("ok", "nothing failing")]
      ]);
    }

    function drawActions(list, model) {
      if (!list.length) {
        A("actionsNote").textContent = "";
        A("actions").innerHTML = '<p class="empty">Nothing logged yet. Every turn records which actions it ran, so this fills up on its own.</p>';
        return;
      }
      var runs = 0;
      list.forEach(function (a) { runs += Number(a.runs || 0); });
      A("actionsNote").textContent = plu(runs, "action") + " over " + plu(model.turns, "turn");
      A("actions").innerHTML = table([{ t: "Action" }, { t: "Run", num: true }, { t: "Failed", num: true }, { t: "Failure rate", num: true }],
        list.map(function (a) {
          var pc = a.runs ? Math.round((a.failed / a.runs) * 1000) / 10 : 0;
          return ["<code>" + esc(a.type) + "</code>", num(a.runs), a.failed ? '<span class="pill bad">' + num(a.failed) + "</span>" : "0",
            pc >= 25 ? sig("bad", pc + "%") : pc >= 10 ? sig("warn", pc + "%") : pc + "%"];
        }));
    }

    function drawModel(m) {
      if (!Number(m.turns)) {
        A("modelNote").textContent = "";
        A("model").innerHTML = '<p class="empty">Nothing logged yet. Turns are recorded (model, tokens, rounds, time) as soon as traffic comes through.</p>';
        return;
      }
      A("modelNote").textContent = m.cost_complete ? plu(m.calls, "model call") : "a model that ran has no price set";
      A("model").innerHTML = table([{ t: "Model" }, { t: "Turns", num: true }, { t: "Tokens in", num: true }, { t: "Tokens out", num: true }, { t: "Cost", num: true }],
        (m.by_model || []).map(function (r) {
          return [esc(r.model || "none (failed before the model)"), num(r.turns), num(r.tokens_in), num(r.tokens_out),
            r.cost === null ? '<span class="note">no price</span>' : money(r.cost)];
        }).concat([['<span class="note">' + (m.rounds_avg || 1) + " rounds a turn · median " + secs(Number(m.ms_p50 || 0) / 1000) +
          (m.out_of_rounds ? " · " + plu(m.out_of_rounds, "turn") + " out of rounds" : "") + "</span>", "", "", "", ""]]));
    }

    function drawTools(list) {
      A("tools").innerHTML = table([{ t: "Tool" }, { t: "Connected", num: true }, { t: "Working", num: true }, { t: "Needs reconnecting", num: true }],
        list.map(function (t) {
          return [esc(t.provider), num(t.connected), num(t.active), t.stale ? '<span class="pill bad">' + num(t.stale) + "</span>" : "0"];
        }));
    }

    function drawErrors(list) {
      if (!list.length) { A("errors").innerHTML = '<p class="empty">Nothing failed in this window.</p>'; return; }
      A("errors").innerHTML = table([{ t: "Where" }, { t: "What" }, { t: "Times", num: true }, { t: "Last" }],
        list.map(function (e) {
          return [esc(e.where), '<span class="err">' + esc(e.error) + "</span>", num(e.seen), '<span class="note">' + esc(ago(e.last)) + " ago</span>"];
        }));
    }

    // ---------- loading ----------

    var WINDOW_WORDS = { 1: "the last 24 hours", 7: "the last 7 days", 30: "the last 30 days", 3650: "all time" };

    async function load() {
      if (busy) return;
      busy = true;
      A("reload").disabled = true;
      A("updated").innerHTML = '<span class="spin" aria-hidden="true"></span>Loading…';
      try {
        var r = await ctx.rpc("admin_agent_dashboard", { days: days });
        if (!r || r.ok === false) {
          if (r && r.reason === "forbidden") { ctx.onForbidden(); return null; }
          throw new Error((r && r.reason) || "no answer");
        }
        over = Object.assign({}, r.overview, { model: withCost(r.overview && r.overview.model) });
        people = r.people || [];
        loaded = true;
        ctx.banner("");
        A("updated").textContent = "Updated " + clock(over.now);
        A("scope").innerHTML = "Showing <b>" + esc(WINDOW_WORDS[days] || "the period") + "</b>" +
          (days < 3650 ? ' <span class="note">· compared with the ' + (days === 1 ? "24 hours" : days + " days") + " before</span>" : "");
        drawRibbon(over);
        drawPlot();
        drawPeople(people);
        drawFunnel(over.funnel);
        drawAgents(over.agents);
        drawActions(over.actions || [], over.model || {});
        drawModel(over.model || {});
        drawTools(over.tools || []);
        drawErrors(over.errors || []);
        return r;
      } catch (e) {
        console.error("agent dashboard:", e);
        if (e && /JWT|401|not authenticated/i.test(String(e.message || e.code || ""))) { ctx.onSignedOut(); return null; }
        A("updated").textContent = "";
        ctx.banner("Couldn't load the agent numbers. Check your connection and press Refresh data.", true);
        return null;
      } finally {
        busy = false;
        A("reload").disabled = false;
      }
    }

    function wire() {
      A("reload").onclick = load;
      A("range").onclick = function (e) {
        var b = e.target.closest("button"); if (!b) return;
        days = Number(b.dataset.days);
        Array.prototype.forEach.call(A("range").children, function (x) { x.classList.toggle("on", x === b); });
        load();
      };
      A("tabs").onclick = function (e) {
        var b = e.target.closest("button"); if (!b) return;
        plot = b.dataset.plot;
        Array.prototype.forEach.call(A("tabs").children, function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
        if (over) drawPlot();
      };
    }

    wire();
    return { load: load, isLoaded: function () { return loaded; } };
  };
})(window);
