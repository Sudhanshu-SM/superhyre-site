/* superhyre.com/admins-superhyre-ke/ — the one admin page: the Extension dashboard and the Agent dashboard
 * (agent-view.js), one sign-in, a switch between them (?view=agent).
 *
 * The Extension half: how the Contact Finder extension is used, for Superhyre's owners and admins. Signs in with the console's Google
 * sign-in (same Supabase project, same browser session as superhyre.com/access/), then asks the database for
 * everything at once: public.extension_admin_dashboard. The database decides who is an admin and refuses everyone
 * else; this file only draws what comes back. The one write is public.extension_admin_set_credits, which logs every
 * change it makes. Both are in Superhyre-Extension/supabase/25_extension_admin_dashboard.sql.
 *
 * Filters live in the address bar (?p=30&org=…&user=…), so a filtered view can be shared or bookmarked.
 */
(function () {
  "use strict";

  var SUPABASE_URL = "https://npqajviolhoufuggfobg.supabase.co";
  // Publishable key: public by design, buys only the ability to sign in as yourself.
  var SUPABASE_KEY = "sb_publishable_GNHiZtlyWPLQQhySPd7Vhg_aTcqYWex";
  var TZ = "Asia/Kolkata";
  var FIRST_DAY = "2026-09-01";

  // Local only: ?fixture=<file> draws a saved answer instead of signing in, to check the page offline.
  var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var fixture = isLocal ? new URLSearchParams(location.search).get("fixture") : null;
  var agentFixture = isLocal ? new URLSearchParams(location.search).get("agentFixture") : null;

  var sb = fixture ? null : window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
  });

  var COLORS = {
    numbers: "#EA5A1E", emails: "#6f8f72", misses: "#cfc8c0",
    sheet: "#1c1a18", jobs: "#f2a27c", people: "#EA5A1E", grid: "#eeeae5", text: "#8a847d"
  };

  var state = { view: "extension", p: "30", from: "", to: "", org: "", user: "", plot: "lookups", feed: "", idle: false, q: "" };
  var sorts = { org: ["numbers", -1], user: ["activity", -1], src: ["calls", -1] };
  var data = null, charts = {}, loading = false, seq = 0;

  // ---------------------------------------------------------------- helpers

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(n) { return n == null ? "—" : Number(n).toLocaleString("en-IN"); }
  function pct(a, b) { return b ? Math.round((a / b) * 100) + "%" : "—"; }
  function plural(n, one, many) { return num(n) + " " + (Number(n) === 1 ? one : (many || one + "s")); }

  function todayIST() { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); }
  function addDays(iso, n) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function dayLabel(iso, week) {
    var d = new Date(iso + "T00:00:00Z");
    var s = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    return week ? "Week of " + s : s;
  }
  function longDay(iso) {
    return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  function when(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
  }
  function ago(iso) {
    if (!iso) return "never";
    var mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 2) return "just now";
    if (mins < 60) return mins + " min ago";
    var h = Math.floor(mins / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    var d = Math.floor(h / 24);
    return d + (d === 1 ? " day ago" : " days ago");
  }
  function slug(url) { var m = /\/in\/([^/?#]+)/.exec(url || ""); return m ? decodeURIComponent(m[1]) : ""; }

  function toast(text) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3600);
  }
  function banner(text, bad) {
    var m = $("msg");
    m.hidden = !text; m.textContent = text || "";
    m.className = "banner" + (bad ? " bad" : "");
  }

  // ---------------------------------------------------------------- filters and the address bar

  function readUrl() {
    var q = new URLSearchParams(location.search);
    state.view = q.get("view") === "agent" ? "agent" : "extension";
    state.p = q.get("p") || "30";
    state.from = q.get("from") || "";
    state.to = q.get("to") || "";
    state.org = q.get("org") || "";
    state.user = q.get("user") || "";
  }
  function writeUrl() {
    var q = new URLSearchParams();
    if (fixture) q.set("fixture", fixture);
    if (agentFixture) q.set("agentFixture", agentFixture);
    if (state.view === "agent") q.set("view", "agent");
    if (state.p !== "30") q.set("p", state.p);
    if (state.p === "custom") { if (state.from) q.set("from", state.from); if (state.to) q.set("to", state.to); }
    if (state.org) q.set("org", state.org);
    if (state.user) q.set("user", state.user);
    var s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
  }
  function range() {
    var t = todayIST();
    switch (state.p) {
      case "today": return { from: t, to: t };
      case "7": return { from: addDays(t, -6), to: t };
      case "90": return { from: addDays(t, -89), to: t };
      case "all": return { from: FIRST_DAY, to: t };
      case "custom": return { from: state.from || addDays(t, -29), to: state.to || t };
      default: return { from: addDays(t, -29), to: t };
    }
  }
  function periodWords() {
    return { today: "today", "7": "the last 7 days", "30": "the last 30 days", "90": "the last 90 days",
             all: "all time", custom: "the chosen dates" }[state.p] || "the period";
  }

  function paintFilters() {
    Array.prototype.forEach.call($("period").children, function (b) { b.classList.toggle("on", b.dataset.p === state.p); });
    $("dates").hidden = state.p !== "custom";
    var r = range();
    $("from").value = r.from; $("to").value = r.to;
    $("from").max = $("to").max = todayIST();
    $("from").min = $("to").min = FIRST_DAY;
    $("reset").hidden = state.p === "30" && !state.org && !state.user;
  }

  function fillOptions(opts) {
    var org = $("org"), user = $("user");
    org.innerHTML = '<option value="">All organisations</option>' +
      opts.orgs.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.name) + "</option>"; }).join("") +
      '<option value="personal">Personal accounts (no organisation)</option>';
    org.value = state.org;
    var people = opts.users.filter(function (u) {
      if (!state.org) return true;
      if (state.org === "personal") return !u.org;
      return u.org === state.org;
    });
    user.innerHTML = '<option value="">Everyone' + (state.org ? " in it" : "") + "</option>" +
      people.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.name) + " · " + esc(u.email) + "</option>"; }).join("");
    if (state.user && !people.some(function (u) { return u.id === state.user; })) state.user = "";
    user.value = state.user;
  }

  // ---------------------------------------------------------------- sign-in

  /* The sign-in page. mode: "signin" (signed out), "forbidden" (signed in, not an admin), with an optional error. */
  var gateMode = "signin";
  function gate(mode, info) {
    gateMode = mode || "signin";
    $("checking").hidden = true;
    $("board").hidden = true;
    $("agentBoard").hidden = true;
    $("views").hidden = true;
    $("gate").hidden = false;
    document.body.classList.add("gated");
    var forbidden = gateMode === "forbidden";
    $("gateTitle").textContent = forbidden ? "Not an admin account" : "Sign in";
    $("gateText").textContent = forbidden
      ? "You're signed in as " + (info || "another account") + ". This page is only for owners and admins of the Superhyre workspace."
      : "Use your superhyre.com Google account to see how the extension and the agent are used.";
    $("inText").textContent = forbidden ? "Use a different Google account" : "Continue with Google";
    $("in").disabled = false;
    $("gateOut").hidden = !forbidden;
    $("gateErr").hidden = true;
  }
  function gateError(text) { $("gateErr").textContent = text; $("gateErr").hidden = false; }
  function ungate() { $("checking").hidden = true; $("gate").hidden = true; document.body.classList.remove("gated"); }

  async function signIn() {
    $("in").disabled = true;
    $("inText").textContent = "Opening Google…";
    // A different account starts from no session, so the page never mixes two people's sign-ins.
    if (gateMode === "forbidden") await sb.auth.signOut();
    var r = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname + location.search, queryParams: { prompt: "select_account" } }
    });
    // Success leaves the page for Google; only a failure to start lands here.
    if (r.error) {
      console.error("sign-in:", r.error);
      gate(gateMode);
      gateError("Couldn't open Google's sign-in. Check your connection and try again.");
    }
  }
  async function signOut() {
    if (sb) await sb.auth.signOut();
    $("who").hidden = $("out").hidden = true;
    data = null;
    agent = makeAgent();
    gate("signin");
  }
  /* Google or Supabase can send the person back with an error instead of a session (they pressed Cancel, or the
     account was refused at sign-up). Read it once, say it plainly, and take it out of the address bar. */
  function returnedError() {
    var q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ""));
    var err = q.get("error") || h.get("error");
    if (!err) return "";
    var desc = q.get("error_description") || h.get("error_description") || "";
    ["error", "error_code", "error_description"].forEach(function (k) { q.delete(k); });
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
    console.warn("sign-in returned:", err, desc);
    if (err === "access_denied" && !/email/i.test(desc)) return "Sign-in was cancelled. Try again when you're ready.";
    return "That sign-in didn't work. Use your superhyre.com Google account and try again.";
  }

  // ---------------------------------------------------------------- data

  async function rpc(name, p) {
    if (fixture && name === "admin_agent_dashboard") {
      var ar = await fetch(agentFixture, { cache: "no-store" });
      return ar.json();
    }
    if (fixture) {
      if (name === "extension_admin_set_credits") return { ok: true, lookup: Number(p.lookup || 0), apollo: Number(p.apollo || 0), refreshes: 1 };
      var res = await fetch(fixture, { cache: "no-store" });
      return res.json();
    }
    var r = await sb.rpc(name, { p: p });
    if (r.error) throw r.error;
    return r.data;
  }

  async function load() {
    var mine = ++seq, r = range();
    loading = true;
    document.body.classList.add("loading");
    $("reload").disabled = true;
    $("updated").innerHTML = '<span class="spin" aria-hidden="true"></span>Loading…';
    try {
      var d = await rpc("extension_admin_dashboard", { from: r.from, to: r.to, org: state.org, user: state.user });
      if (mine !== seq) return;
      if (!d || d.ok === false) {
        if (d && d.reason === "forbidden") {
          var email = "";
          if (sb) { var s = await sb.auth.getSession(); email = s.data.session && s.data.session.user.email; }
          gate("forbidden", email);
          return;
        }
        throw new Error((d && d.reason) || "no answer");
      }
      data = d;
      banner("");
      ungate();
      showView();
      if (d.me) { $("who").textContent = d.me.email; $("who").hidden = false; }
      $("out").hidden = !!fixture;
      render();
    } catch (e) {
      if (mine !== seq) return;
      console.error("admin dashboard:", e);
      if (e && /JWT|401|not authenticated/i.test(String(e.message || e.code || ""))) { gate("signin"); return; }
      ungate();
      banner("Couldn't load the numbers. Check your connection and press Refresh data.", true);
    } finally {
      if (mine === seq) {
        loading = false;
        document.body.classList.remove("loading");
        $("reload").disabled = false;
      }
    }
  }

  // ---------------------------------------------------------------- drawing

  function render() {
    var d = data;
    fillOptions(d.options);
    paintFilters();
    $("updated").textContent = "Updated " + when(d.now);

    var orgName = state.org === "personal" ? "personal accounts" :
      state.org ? (d.options.orgs.find(function (o) { return o.id === state.org; }) || {}).name : "all organisations";
    var who = state.user ? (d.options.users.find(function (u) { return u.id === state.user; }) || {}).name : "";
    $("scope").innerHTML = "Showing <b>" + esc(who || orgName) + "</b>" + (who ? " (" + esc(orgName) + ")" : "") +
      ", <b>" + esc(longDay(d.range.from)) + (d.range.from === d.range.to ? "" : " – " + esc(longDay(d.range.to))) + "</b>" +
      (state.p !== "all" ? ' <span class="note">· compared with the ' + d.range.days + " days before</span>" : "");

    alerts(); tiles(); mainChart(); orgChart(); hourChart();
    orgTable(); userTable(); refreshTable(); feed(); sourceTable(); exportTable(); database();
  }

  function delta(now, before) {
    if (state.p === "all") return "";
    now = Number(now || 0); before = Number(before || 0);
    if (!before) return now ? "none in the " + data.range.days + " days before" : "";
    var p = Math.round(((now - before) / before) * 100);
    return '<span class="' + (p >= 0 ? "up" : "dn") + '">' + (p >= 0 ? "+" : "") + p + "%</span> vs " + num(before) + " before";
  }

  function alerts() {
    var out = [];
    data.orgs.forEach(function (o) {
      if (o.personal) return;
      if (Number(o.credits) <= 0) {
        out.push({ k: "bad", t: "<b>" + esc(o.name) + "</b> has no lookup credits left. Their phone lookups are refused until it is topped up.", o: o });
      } else if (Number(o.credits) <= 10) {
        out.push({ k: "warn", t: "<b>" + esc(o.name) + "</b> is low on credits: " + num(o.credits) + " left.", o: o });
      }
    });
    var t = data.totals;
    if (Number(t.errors) > 0) {
      out.push({ k: "warn", t: plural(t.errors, "lookup") + " in this period failed or hit a setup problem (no credit was used). Worth a look if this keeps growing." });
    }
    $("alerts").innerHTML = out.map(function (a, i) {
      return '<div class="alert ' + a.k + '">' + '<span>' + a.t + '</span><span class="sp"></span>' +
        (a.o ? '<button class="btn sm" data-alert="' + i + '">Add credits</button>' : "") + "</div>";
    }).join("");
    Array.prototype.forEach.call($("alerts").querySelectorAll("[data-alert]"), function (b) {
      var o = out[Number(b.dataset.alert)].o;
      b.onclick = function () { openCredits({ kind: "org", id: o.id, name: o.name, lookup: o.credits, late: o.apollo_credits, refreshes: o.refreshes }); };
    });
  }

  function tile(k, n, d, color) {
    return '<div class="tile"><div class="k">' + (color ? '<i style="background:' + color + '"></i>' : "") + esc(k) +
      '</div><div class="n">' + n + '</div><div class="d">' + (d || "") + "</div></div>";
  }

  function tiles() {
    var t = data.totals, orgs = data.orgs;
    var finished = Number(t.numbers) + Number(t.misses);
    var credits = orgs.filter(function (o) { return !o.personal; }).reduce(function (s, o) { return s + Number(o.credits || 0); }, 0);
    var out = orgs.filter(function (o) { return !o.personal && Number(o.credits) <= 0; }).length;
    var people = data.options.users.length;
    $("tiles").innerHTML = [
      tile("Numbers found", num(t.numbers), delta(t.numbers, t.numbers_before) || "1 credit each", COLORS.numbers),
      tile("Emails opened", num(t.emails), delta(t.emails, t.emails_before) || "free", COLORS.emails),
      tile("Hit rate", pct(t.numbers, finished), plural(t.misses, "search", "searches") + " found no number"),
      tile("Added to sheet", num(t.sheet_adds), delta(t.sheet_adds, t.sheet_adds_before), COLORS.sheet),
      tile("Added to jobs", num(t.job_adds), plural(t.jobs_created, "job") + " created", COLORS.jobs),
      tile("Active people", num(t.active_users) + (state.user ? "" : " <small>of " + num(people) + "</small>"),
        delta(t.active_users, t.active_users_before)),
      tile("Team credits left", num(credits), out ? '<span class="dn">' + plural(out, "organisation") + " at zero</span>" : "across organisations"),
      tile("Employee export profiles", num(t.export_profiles), "from " + plural(t.exports, "company run"))
    ].join("");
  }

  // Charts: one shared look.
  function baseOptions(extra) {
    var o = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, color: "#57524c", font: { family: "IBM Plex Sans", size: 12 } } },
        tooltip: { backgroundColor: "#1c1a18", titleFont: { family: "IBM Plex Sans" }, bodyFont: { family: "IBM Plex Sans" }, padding: 10 }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: COLORS.text, font: { family: "IBM Plex Sans", size: 11 }, maxRotation: 0, autoSkipPadding: 12 } },
        y: { beginAtZero: true, grid: { color: COLORS.grid }, border: { display: false }, ticks: { color: COLORS.text, precision: 0, font: { family: "IBM Plex Sans", size: 11 } } }
      }
    };
    return Object.assign(o, extra || {});
  }
  function draw(key, canvas, config) {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart($(canvas), config);
  }
  function bar(label, values, color) { return { label: label, data: values, backgroundColor: color, borderRadius: 3, maxBarThickness: 28 }; }

  function mainChart() {
    var s = data.series, week = data.range.unit === "week";
    var labels = s.map(function (x) { return dayLabel(x.d, week); });
    var col = function (k) { return s.map(function (x) { return x[k]; }); };
    $("unit").textContent = week ? "One bar per week" : "One bar per day";
    var cfg;
    if (state.plot === "adds") {
      cfg = { type: "bar", data: { labels: labels, datasets: [bar("Added to sheet", col("sheet"), COLORS.sheet), bar("Added to jobs", col("jobs"), COLORS.jobs)] },
              options: baseOptions() };
    } else if (state.plot === "people") {
      cfg = { type: "line", data: { labels: labels, datasets: [{ label: "People who used it", data: col("users"), borderColor: COLORS.people,
              backgroundColor: "rgba(234,90,30,.08)", fill: true, tension: .3, pointRadius: s.length > 40 ? 0 : 3 }] },
              options: baseOptions() };
    } else {
      var o = baseOptions();
      o.scales.x.stacked = true; o.scales.y.stacked = true;
      cfg = { type: "bar", data: { labels: labels, datasets: [
        bar("Numbers found", col("numbers"), COLORS.numbers), bar("Emails opened", col("emails"), COLORS.emails),
        bar("No number", col("misses"), COLORS.misses)] }, options: o };
    }
    draw("main", "mainChart", cfg);
  }

  function orgChart() {
    var rows = data.orgs.slice().sort(function (a, b) { return (b.numbers + b.emails + b.sheet_adds) - (a.numbers + a.emails + a.sheet_adds); });
    var o = baseOptions({ indexAxis: "y", layout: { padding: { left: 4 } } });
    o.scales = { x: o.scales.y, y: { grid: { display: false }, ticks: { color: "#57524c", font: { family: "IBM Plex Sans", size: 12 } } } };
    draw("org", "orgChart", { type: "bar", data: {
      labels: rows.map(function (r) { return r.personal ? "Personal" : r.name; }),
      datasets: [bar("Numbers found", rows.map(function (r) { return r.numbers; }), COLORS.numbers),
                 bar("Emails opened", rows.map(function (r) { return r.emails; }), COLORS.emails),
                 bar("Added to sheet", rows.map(function (r) { return r.sheet_adds; }), COLORS.sheet)] }, options: o });
  }

  function hourChart() {
    var labels = data.hours.map(function (_, h) { return h === 0 ? "12am" : h < 12 ? h + "am" : h === 12 ? "12pm" : (h - 12) + "pm"; });
    var o = baseOptions(); o.plugins.legend.display = false;
    draw("hour", "hourChart", { type: "bar", data: { labels: labels, datasets: [bar("Lookups and adds", data.hours, COLORS.numbers)] }, options: o });
  }

  // Sortable tables. cols: {k, label, num?, html(row), v(row)?}
  function table(id, sortKey, cols, rows, empty) {
    var s = sorts[sortKey], col = cols.find(function (c) { return c.k === s[0]; }) || cols[0];
    var val = col.v || function (r) { return r[col.k]; };
    rows = rows.slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      if (x == null) x = typeof y === "string" ? "" : -Infinity;
      if (y == null) y = typeof x === "string" ? "" : -Infinity;
      return (x > y ? 1 : x < y ? -1 : 0) * s[1];
    });
    var head = "<thead><tr>" + cols.map(function (c) {
      var sorted = c.k === s[0] ? (s[1] < 0 ? "descending" : "ascending") : null;
      return '<th scope="col" data-k="' + c.k + '"' + (c.num ? ' class="num"' : "") + (sorted ? ' aria-sort="' + sorted + '"' : "") +
        (c.nosort ? ' data-nosort="1"' : "") + ">" + esc(c.label) + "</th>";
    }).join("") + "</tr></thead>";
    var body = rows.length ? rows.map(function (r) {
      return "<tr>" + cols.map(function (c) {
        var h = c.html(r);
        var zero = c.num && (h === "0" || h === "—");
        return "<td" + (c.num ? ' class="num' + (zero ? " zero" : "") + '"' : "") + ">" + h + "</td>";
      }).join("") + "</tr>";
    }).join("") : '<tr><td class="empty" colspan="' + cols.length + '">' + esc(empty) + "</td></tr>";
    var el = $(id);
    el.innerHTML = head + "<tbody>" + body + "</tbody>";
    Array.prototype.forEach.call(el.querySelectorAll("th"), function (th) {
      if (th.dataset.nosort) return;
      th.onclick = function () {
        var k = th.dataset.k;
        sorts[sortKey] = [k, sorts[sortKey][0] === k ? -sorts[sortKey][1] : -1];
        render();
      };
    });
    return el;
  }

  function creditPill(n) {
    if (n == null) return "—";
    n = Number(n);
    var k = n <= 0 ? "bad" : n <= 10 ? "warn" : "ok";
    return '<span class="pill ' + k + '">' + num(n) + "</span>";
  }
  function activeCell(iso) {
    if (!iso) return '<span class="pill flat">never</span>';
    return '<span title="' + esc(when(iso)) + '">' + esc(ago(iso)) + "</span>";
  }

  function orgTable() {
    var el = table("orgTable", "org", [
      { k: "name", label: "Organisation", html: function (r) {
          return "<b>" + esc(r.name) + '</b><span class="sub">' + plural(r.members, "person", "people") + "</span>"; } },
      { k: "active", label: "Active", num: true, html: function (r) { return num(r.active); } },
      { k: "credits", label: "Credits left", num: true, html: function (r) { return r.personal ? '<span class="note">per person</span>' : creditPill(r.credits); } },
      { k: "apollo_credits", label: "Apollo credits", num: true, html: function (r) { return r.personal ? "" : num(r.apollo_credits); } },
      { k: "numbers", label: "Numbers found", num: true, html: function (r) { return num(r.numbers); } },
      { k: "emails", label: "Emails", num: true, html: function (r) { return num(r.emails); } },
      { k: "misses", label: "No number", num: true, html: function (r) { return num(r.misses); } },
      { k: "hit", label: "Hit rate", num: true, v: function (r) { return r.numbers / Math.max(1, r.numbers + r.misses); },
        html: function (r) { return pct(r.numbers, r.numbers + r.misses); } },
      { k: "sheet_adds", label: "Sheet adds", num: true, html: function (r) { return num(r.sheet_adds); } },
      { k: "job_adds", label: "Job adds", num: true, html: function (r) { return num(r.job_adds); } },
      { k: "last_active", label: "Last used", v: function (r) { return r.last_active || ""; }, html: function (r) { return activeCell(r.last_active); } },
      { k: "refreshes", label: "Credit changes", num: true, html: function (r) {
          return Number(r.refreshes) ? "<b>" + num(r.refreshes) + '</b><span class="sub">last ' + esc(when(r.last_refresh)) + "</span>" : "0"; } },
      { k: "act", label: "", nosort: true, html: function (r) {
          return r.personal ? "" : '<button class="btn sm" data-org="' + esc(r.id) + '">Credits</button>'; } }
    ], data.orgs, "No organisation matches these filters.");
    Array.prototype.forEach.call(el.querySelectorAll("[data-org]"), function (b) {
      var o = data.orgs.find(function (x) { return x.id === b.dataset.org; });
      b.onclick = function () { openCredits({ kind: "org", id: o.id, name: o.name, lookup: o.credits, late: o.apollo_credits, refreshes: o.refreshes }); };
    });
  }

  function activity(u) { return Number(u.numbers) + Number(u.emails) + Number(u.misses) + Number(u.sheet_adds) + Number(u.job_adds) + Number(u.exports); }

  function userTable() {
    var q = state.q.trim().toLowerCase();
    var rows = data.users.filter(function (u) {
      if (!state.idle && !activity(u) && !state.user) return false;
      return !q || (u.name + " " + u.email + " " + (u.org_name || "")).toLowerCase().indexOf(q) >= 0;
    });
    var hidden = data.users.length - rows.length;
    var el = table("userTable", "user", [
      { k: "name", label: "Person", html: function (r) { return "<b>" + esc(r.name) + '</b><span class="sub">' + esc(r.email) + "</span>"; } },
      { k: "org_name", label: "Organisation", v: function (r) { return r.org_name || "~"; }, html: function (r) {
          return r.org_name ? esc(r.org_name) + (r.role ? '<span class="sub">' + esc(r.role) + "</span>" : "") : '<span class="note">Personal</span>'; } },
      { k: "numbers", label: "Numbers found", num: true, html: function (r) { return num(r.numbers); } },
      { k: "emails", label: "Emails", num: true, html: function (r) { return num(r.emails); } },
      { k: "misses", label: "No number", num: true, html: function (r) { return num(r.misses); } },
      { k: "sheet_adds", label: "Sheet adds", num: true, html: function (r) { return num(r.sheet_adds); } },
      { k: "job_adds", label: "Job adds", num: true, html: function (r) { return num(r.job_adds); } },
      { k: "exports", label: "Exports", num: true, html: function (r) { return num(r.exports); } },
      { k: "activity", label: "Total", num: true, v: activity, html: function (r) { return "<b>" + num(activity(r)) + "</b>"; } },
      { k: "last_active", label: "Last used", v: function (r) { return r.last_active || ""; }, html: function (r) {
          return activeCell(r.last_active) + '<span class="sub" title="' + esc(when(r.last_sign_in)) + '">signed in ' + esc(ago(r.last_sign_in)) + "</span>"; } },
      { k: "credits", label: "Own credits", num: true, html: function (r) {
          if (r.org) return '<span class="note">team</span>';
          return creditPill(r.credits) + '<button class="btn sm" data-user="' + esc(r.id) + '">Credits</button>' +
            (Number(r.refreshes) ? '<span class="sub">' + plural(r.refreshes, "change") + "</span>" : ""); } }
    ], rows, data.users.length ? "Nobody used the extension in this period. Tick “Show people with no activity” to list everyone." : "No one matches these filters.");
    if (hidden > 0 && !q && !state.idle) {
      el.querySelector("tbody").insertAdjacentHTML("beforeend",
        '<tr><td class="empty" colspan="11">' + plural(hidden, "person", "people") + " with no activity in this period hidden.</td></tr>");
    }
    Array.prototype.forEach.call(el.querySelectorAll("[data-user]"), function (b) {
      var u = data.users.find(function (x) { return x.id === b.dataset.user; });
      b.onclick = function () { openCredits({ kind: "user", id: u.id, name: u.name + " (personal account)", lookup: u.credits, late: u.apollo_credits, refreshes: u.refreshes }); };
    });
  }

  function change(before, after, label) {
    if (before === after) return "";
    var diff = Number(after || 0) - Number(before || 0);
    return esc(label) + " " + num(before || 0) + " → <b>" + num(after) + "</b> " +
      '<span class="' + (diff >= 0 ? "up" : "dn") + '">(' + (diff >= 0 ? "+" : "") + num(diff) + ")</span>";
  }

  function refreshTable() {
    var rows = data.refreshes;
    $("refreshNote").textContent = rows.length ? plural(rows.length, "change") + " in total" : "";
    var el = $("refreshTable");
    if (!rows.length) {
      el.innerHTML = '<tbody><tr><td class="empty">No credit changes yet. Use “Credits” on an organisation to top one up; every change is listed here.</td></tr></tbody>';
      return;
    }
    el.innerHTML = '<thead><tr><th>When</th><th>Account</th><th>Change</th><th>By</th></tr></thead><tbody>' + rows.map(function (r) {
      var lines = [change(r.lookup_before, r.lookup_after, "Lookup"), change(r.apollo_before, r.apollo_after, "Apollo")].filter(Boolean);
      return "<tr><td>" + esc(when(r.at)) + "</td><td><b>" + esc(r.target || "—") + "</b>" + (r.personal ? '<span class="sub">personal</span>' : "") +
        "</td><td>" + (lines.join("<br>") || '<span class="note">no change</span>') +
        (r.note ? '<span class="sub">“' + esc(r.note) + "”</span>" : "") + "</td><td>" + esc((r.admin_email || "").split("@")[0]) +
        '<span class="sub">' + (r.mode === "set" ? "set balance" : "added") + "</span></td></tr>";
    }).join("") + "</tbody>";
  }

  var KINDS = {
    "lookup:found": ["found a number", COLORS.numbers, "lookup"],
    "lookup:shared": ["opened a number", COLORS.numbers, "lookup"],
    "lookup:cached": ["reopened a number (free)", COLORS.misses, "lookup"],
    "lookup:emails": ["opened emails", COLORS.emails, "lookup"],
    "lookup:not_found": ["searched, no number", COLORS.misses, "lookup"],
    "lookup:requested": ["searched, waiting on a late answer", COLORS.misses, "lookup"],
    "lookup:failed": ["lookup failed", "#b3261e", "lookup"],
    "lookup:needs_setup": ["lookup failed (setup)", "#b3261e", "lookup"],
    sheet_added: ["added to their sheet", COLORS.sheet, "sheet"],
    shortlisted: ["added to a job", COLORS.jobs, "job"],
    created: ["created a job", COLORS.jobs, "job"],
    removed: ["removed from a job", COLORS.jobs, "job"]
  };

  function feed() {
    var rows = data.feed.filter(function (f) { var k = KINDS[f.kind]; return !state.feed || (k && k[2] === state.feed); });
    $("feed").innerHTML = rows.length ? rows.map(function (f) {
      var k = KINDS[f.kind] || [f.kind, COLORS.misses];
      var person = f.profile || slug(f.url);
      var sub = [f.org_name || "Personal", person].filter(Boolean).map(esc).join(" · ");
      return '<li><time title="' + esc(when(f.at)) + '">' + esc(ago(f.at).replace(" ago", "")) + '</time><div class="what">' +
        '<span class="dot" style="background:' + k[1] + '"></span><b>' + esc(f.who || "Someone") + "</b> " + esc(k[0]) +
        '<span class="sub">' + (f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">' + sub + "</a>" : sub) + "</span></div></li>";
    }).join("") : '<li class="empty">Nothing in this period.</li>';
  }

  function sourceTable() {
    var rows = data.sources.map(function (s) { return Object.assign({ found: s.purpose === "profile_enrichment" ? s.profiles : s.phones }, s); });
    table("sourceTable", "src", [
      { k: "name", label: "Source", html: function (r) {
          return "<b>" + esc(r.name) + '</b><span class="sub">' + (r.purpose === "profile_enrichment" ? "profile details" : "contact lookup") + "</span>"; } },
      { k: "calls", label: "Asked", num: true, html: function (r) { return num(r.calls); } },
      { k: "found", label: "Number / profile", num: true, html: function (r) { return num(r.found); } },
      { k: "email_only", label: "Email only", num: true, html: function (r) { return num(r.email_only); } },
      { k: "misses", label: "No match", num: true, html: function (r) { return num(r.misses); } },
      { k: "pending", label: "Answering later", num: true, html: function (r) { return num(r.pending); } },
      { k: "errors", label: "Errors", num: true, html: function (r) {
          return Number(r.errors) ? '<span class="pill bad">' + num(r.errors) + "</span>" : "0"; } },
      { k: "skipped", label: "Skipped", num: true, html: function (r) { return num(r.skipped); } },
      { k: "hit", label: "Hit rate", num: true, v: function (r) { return r.found / Math.max(1, r.found + r.email_only + r.misses + r.errors); },
        html: function (r) { return pct(r.found, r.found + r.email_only + r.misses + r.errors); } },
      { k: "avg_ms", label: "Avg time", num: true, html: function (r) { return r.avg_ms == null ? "—" : (r.avg_ms / 1000).toFixed(1) + "s"; } }
    ], rows, "No source was asked in this period.");
  }

  function company(url) {
    var m = /\/company\/([^/?#]+)/.exec(url || "");
    if (!m) return esc(url || "—");
    return '<a class="plain" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(decodeURIComponent(m[1]).replace(/-/g, " ")) + "</a>";
  }

  function exportTable() {
    var rows = data.exports;
    $("exportNote").textContent = rows.length ? plural(rows.length, "run") + " · " + num(data.totals.export_profiles) + " profiles" : "";
    $("exportTable").innerHTML = rows.length ? '<thead><tr><th>When</th><th>Company</th><th class="num">Profiles</th><th>By</th><th>State</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return "<tr><td>" + esc(when(r.at)) + "</td><td>" + company(r.company) + '</td><td class="num">' + num(r.written) + "</td><td>" +
          esc(r.user || "—") + '</td><td><span class="pill ' + (r.state === "done" ? "ok" : r.state === "failed" ? "bad" : "flat") + '">' + esc(r.state || "—") + "</span></td></tr>";
      }).join("") + "</tbody>"
      : '<tbody><tr><td class="empty">No company employee exports in this period.</td></tr></tbody>';
  }

  function database() {
    var b = data.database;
    var c = function (k, n, d) { return '<div><div class="k">' + esc(k) + '</div><div class="n">' + n + '</div><div class="d">' + (d || "") + "</div></div>"; };
    $("db").innerHTML = [
      c("People", num(b.people), "+" + num(b.added) + " in this period"),
      c("With a phone number", num(b.with_phone), pct(b.with_phone, b.people) + " of everyone"),
      c("With an email", num(b.with_email), pct(b.with_email, b.people) + " of everyone"),
      c("Profile details filled", num(b.enriched), pct(b.enriched, b.people) + " of everyone")
    ].join("");
  }

  // ---------------------------------------------------------------- credits dialog

  var cr = null, crMode = "add";

  function openCredits(target) {
    cr = target; crMode = "add";
    $("crTitle").textContent = "Credits · " + target.name;
    $("crNow").textContent = "Now: " + num(target.lookup || 0) + " lookup credits, " + num(target.late || 0) + " Apollo credits." +
      (Number(target.refreshes) ? " Changed " + plural(target.refreshes, "time") + " before." : " Never changed here before.");
    $("crLookup").value = ""; $("crLate").value = ""; $("crNote").value = "";
    $("crErr").hidden = true;
    paintMode();
    $("credits").showModal();
    $("crLookup").focus();
  }
  function paintMode() {
    Array.prototype.forEach.call($("crMode").children, function (b) { b.classList.toggle("on", b.dataset.m === crMode); });
    var quick = crMode === "add"
      ? [["+10", 10, null], ["+25", 25, null], ["+50", 50, null], ["+100", 100, null], ["+500", 500, null]]
      : [["Default (100 / 40)", 100, 40], ["Zero", 0, 0]];
    $("crQuick").innerHTML = quick.map(function (q, i) { return '<button type="button" data-i="' + i + '">' + esc(q[0]) + "</button>"; }).join("");
    Array.prototype.forEach.call($("crQuick").children, function (b) {
      var q = quick[Number(b.dataset.i)];
      b.onclick = function () { $("crLookup").value = q[1]; if (q[2] != null) $("crLate").value = q[2]; preview(); };
    });
    $("crSave").textContent = crMode === "add" ? "Add credits" : "Set balance";
    preview();
  }
  function amount(id) {
    var v = $(id).value.trim();
    if (v === "") return null;
    var n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : NaN;
  }
  function preview() {
    if (!cr) return;
    var l = amount("crLookup"), a = amount("crLate"), lines = [];
    if (isNaN(l) || isNaN(a)) { $("crPreview").textContent = "Use whole numbers from 0 to 100,000."; $("crSave").disabled = true; return; }
    var nl = l == null ? null : crMode === "add" ? Number(cr.lookup || 0) + l : l;
    var na = a == null ? null : crMode === "add" ? Number(cr.late || 0) + a : a;
    if (nl != null) lines.push(change(Number(cr.lookup || 0), nl, "Lookup credits"));
    if (na != null) lines.push(change(Number(cr.late || 0), na, "Apollo credits"));
    var none = !lines.filter(Boolean).length;
    $("crPreview").innerHTML = none ? "Enter an amount." : lines.filter(Boolean).join("<br>");
    $("crSave").disabled = none;
  }

  async function saveCredits(ev) {
    ev.preventDefault();
    var l = amount("crLookup"), a = amount("crLate");
    var btn = $("crSave"); btn.disabled = true;
    try {
      var r = await rpc("extension_admin_set_credits", { kind: cr.kind, id: cr.id, mode: crMode, lookup: l, apollo: a, note: $("crNote").value });
      if (!r || !r.ok) {
        var why = { forbidden: "Only Superhyre owners and admins can change credits.", in_org: "This person is in an organisation; change the organisation's credits instead.",
                    out_of_range: "Use whole numbers from 0 to 100,000.", not_found: "That account no longer exists." }[r && r.reason];
        $("crErr").textContent = why || "Couldn't save. Try again.";
        $("crErr").hidden = false; btn.disabled = false;
        return;
      }
      $("credits").close();
      toast(cr.name + ": " + num(r.lookup) + " lookup credits now. Change #" + num(r.refreshes) + " logged.");
      load();
    } catch (e) {
      console.error("set credits:", e);
      $("crErr").textContent = "Couldn't save. Check your connection and try again.";
      $("crErr").hidden = false; btn.disabled = false;
    }
  }

  // ---------------------------------------------------------------- wiring

  function wire() {
    $("in").onclick = signIn;
    $("views").onclick = function (e) {
      var b = e.target.closest("button"); if (!b || b.dataset.view === state.view) return;
      state.view = b.dataset.view;
      writeUrl();
      openView();
    };
    $("out").onclick = signOut;
    $("reload").onclick = load;
    $("reset").onclick = function () { state.p = "30"; state.org = ""; state.user = ""; writeUrl(); paintFilters(); load(); };
    $("period").onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      state.p = b.dataset.p;
      if (state.p === "custom") { var r = range(); state.from = state.from || r.from; state.to = state.to || r.to; }
      writeUrl(); paintFilters();
      load();
    };
    ["from", "to"].forEach(function (id) {
      $(id).onchange = function () {
        state[id] = $(id).value;
        if (state.from && state.to && state.from > state.to) { var t = state.from; state.from = state.to; state.to = t; }
        writeUrl(); paintFilters(); load();
      };
    });
    $("org").onchange = function () { state.org = $("org").value; state.user = ""; writeUrl(); if (data) fillOptions(data.options); load(); };
    $("user").onchange = function () { state.user = $("user").value; writeUrl(); load(); };
    $("tabs").onclick = function (e) {
      var b = e.target.closest("button"); if (!b || !data) return;
      state.plot = b.dataset.plot;
      Array.prototype.forEach.call($("tabs").children, function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
      mainChart();
    };
    $("feedKinds").onclick = function (e) {
      var b = e.target.closest("button"); if (!b || !data) return;
      state.feed = b.dataset.k;
      Array.prototype.forEach.call($("feedKinds").children, function (x) { x.classList.toggle("on", x === b); });
      feed();
    };
    $("idle").onchange = function () { state.idle = $("idle").checked; if (data) userTable(); };
    $("find").oninput = function () { state.q = $("find").value; if (data) userTable(); };
    $("crMode").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; crMode = b.dataset.m; paintMode(); };
    $("crLookup").oninput = $("crLate").oninput = preview;
    $("crCancel").onclick = function () { $("credits").close(); };
    $("crForm").onsubmit = saveCredits;
  }

  // ---------------------------------------------------------------- the two views

  var agent = null;
  function makeAgent() {
    return window.AgentView({
      rpc: rpc, esc: esc, banner: banner,
      onForbidden: forbidden,
      onSignedOut: function () { gate("signin"); }
    });
  }
  async function forbidden() {
    var email = "";
    if (sb) { var s = await sb.auth.getSession(); email = s.data.session && s.data.session.user.email; }
    gate("forbidden", email);
  }
  /** Show whichever view the address asks for, loading it the first time it is opened. */
  function showView() {
    var ext = state.view !== "agent";
    $("board").hidden = !ext;
    $("agentBoard").hidden = ext;
    $("views").hidden = false;
    $("who").hidden = !$("who").textContent;
    $("out").hidden = !!fixture;
    Array.prototype.forEach.call($("views").children, function (b) {
      var on = b.dataset.view === state.view;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on);
    });
    document.title = (ext ? "Extension" : "Agent") + " · Admins · Superhyre";
  }
  async function openView() {
    // Once someone is known to be an admin (either view has loaded), switching shows the new view at once and fills it
    // in; before that, the view only appears once the server has said yes.
    var known = !!data || agent.isLoaded();
    if (state.view === "agent") {
      if (agent.isLoaded()) { showView(); return; }
      if (known) { showView(); agent.load(); return; }
      var r = await agent.load();
      if (r) { ungate(); showView(); }
    } else {
      if (data) { showView(); return; }
      if (known) showView();
      await load();
    }
  }

  async function start() {
    readUrl();
    wire();
    paintFilters();
    $("gateOut").onclick = signOut;
    agent = makeAgent();
    if (fixture) { $("who").textContent = "local preview"; $("who").hidden = false; openView(); return; }
    var err = returnedError();
    var s = await sb.auth.getSession();
    if (s.data.session) { $("who").textContent = s.data.session.user.email; }
    if (s.data.session && !err) openView();
    else { gate("signin"); if (err) gateError(err); }
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_IN" && session && !data && !agent.isLoaded() && !loading) { $("who").textContent = session.user.email; openView(); }
      if (event === "SIGNED_OUT" && (!$("board").hidden || !$("agentBoard").hidden)) { data = null; agent = makeAgent(); gate("signin"); }
    });
  }

  start();
})();
