/* /agent/memory: the second brain, read by the person it was built about (step 11 of Second_Brain.md). Its own script
   rather than a block inside the page, because there is enough of it that the markup would be buried; the session,
   the API call and the look all come from agent.js and agent.css, exactly as the connectors and agent pages do.

   Two rules shape the whole of it. Every list says where each piece came from and when, because provenance is what
   lets someone catch the agent being wrong, and a crawl that cannot be checked is a crawl that has to be trusted.
   And every delete is asked about first, in place, where the thing itself is: there is no modal to dismiss by
   accident, and no button anywhere on this page that forgets more than the one row it sits on. */
(function () {
  var S = window.SH, token = "", asking = "";
  var state = { blocks: null, crawls: [], people: null, places: null, memory: null };

  function dots(parts) {
    return parts.filter(function (x) { return !!x; }).join(" · ");
  }
  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : (many || one + "s"));
  }
  function nth(n) {
    var last = n % 10, teen = n % 100 > 10 && n % 100 < 14;
    return n + (teen || last > 3 || !last ? "th" : last === 1 ? "st" : last === 2 ? "nd" : "rd");
  }
  /* A pointer was read out of someone's Drive or Slack, so it is treated as data: only an ordinary web link is ever
     turned into one, and anything else is shown as text. */
  function href(url) {
    return /^https?:\/\//i.test(String(url || "")) ? String(url) : "";
  }
  function words(s) {
    return String(s || "").replace(/_/g, " ");
  }

  function act(key, label, question) {
    if (asking !== key) {
      return '<div class="act"><button type="button" class="sm" data-ask="' + S.esc(key) + '">' + S.esc(label) + '</button></div>';
    }
    return '<div class="act"><span class="ask">' + S.esc(question) + '</span>' +
      '<button type="button" class="sm danger" data-go="' + S.esc(key) + '">Yes, forget it</button>' +
      '<button type="button" class="link" data-ask="">Keep it</button></div>';
  }

  /* A thin page is almost always a crawl still running, and leaving someone to guess at that is the confusion this
     page exists to end. */
  function crawlNote() {
    var c = state.crawls || [];
    if (!c.length) {
      return 'You haven\'t connected a tool yet, so there is nothing for me to have read. ' +
        '<a href="../connectors/">Connect one</a> and I\'ll start.';
    }
    var busy = c.filter(function (x) { return x.status === "queued" || x.status === "working"; });
    if (busy.length) {
      return 'I\'m still reading your ' + S.esc(busy.map(function (x) { return x.tool; }).join(" and ")) +
        '. This page fills in as I go.';
    }
    var done = c.filter(function (x) { return x.done_at; }).map(function (x) { return x.done_at; }).sort();
    return done.length ? "Last read through your tools on " + S.esc(S.day(done[done.length - 1])) + "." : "";
  }

  function drawProfile() {
    var blocks = state.blocks || [], written = blocks.filter(function (b) { return !!b.text; });
    var note = crawlNote();
    var html = "<h2>How I'd describe you</h2>" +
      '<p class="count">' + (written.length
        ? written.length + " of 7 written. These paragraphs go into every message I write, which is why they come first."
        : "None of the seven written yet.") +
      (note ? " " + note : "") + "</p>";

    html += blocks.map(function (b) {
      var head = '<div class="t">' + S.esc(b.name) + "</div>";
      if (!b.text) {
        return '<div class="item">' + head + '<div class="meta">' + S.esc(b.about) +
          '</div><p class="txt muted">Nothing worked out yet.</p></div>';
      }
      return '<div class="item">' + head +
        '<p class="txt">' + S.esc(b.text) + "</p>" +
        '<div class="meta">' + S.esc(dots([
          b.updated_at ? "Last rebuilt " + S.day(b.updated_at) : "",
          b.version > 1 ? nth(b.version) + " version" : "",
          b.from,
        ])) + "</div>" +
        '<div class="meta">' + S.esc(b.about) + "</div>" +
        act("block:" + b.block, "Forget this", "Delete this paragraph? I'll stop using it. If I work the same thing out again from your mail and calendar it can come back, so tell me in chat if it should stay gone.") +
        "</div>";
    }).join("");
    S.el("profile").innerHTML = html;
  }

  function factList(facts) {
    if (!facts || !facts.length) return "";
    // The meta is bracketed because the relationship word ("works at") would otherwise read as the sentence carrying
    // on rather than as a note about where the sentence came from.
    return '<ul class="facts">' + facts.map(function (f) {
      return "<li>" + S.esc(f.fact) + ' <span class="meta">(' + S.esc(dots([
        words(f.kind),
        f.source ? "from " + f.source : "",
        f.source_ref || "",
        f.learned_at ? "learnt " + S.day(f.learned_at) : "",
      ])) + ")</span></li>";
    }).join("") + "</ul>";
  }

  function drawPeople() {
    var people = state.people || [];
    var html = "<h2>People and companies</h2>";
    if (!people.length) {
      S.el("people").innerHTML = html + '<p class="muted">Nobody yet. These come from counting who you email and ' +
        "meet, so they appear once I've read through a tool.</p>";
      return;
    }
    html += '<p class="count">' + plural(people.length, "person", "people and companies") +
      ", most-seen first. How often is counted from your mail and calendar, never guessed at.</p>";
    html += people.map(function (p) {
      var where = [p.title, p.company].filter(function (x) { return !!x; }).join(" at ");
      // Until a read pass learns someone's real name, their name *is* their address: saying it twice reads as a bug.
      var addr = (p.emails || [])[0] || (p.domains || [])[0] || "";
      return '<div class="item"><div class="t">' + S.esc(p.name) + ' <span class="tag">' + S.esc(p.kind) + "</span></div>" +
        '<div class="meta">' + S.esc(dots([
          addr === p.name ? "" : addr,
          where,
          plural(p.touches, "message"),
          p.last_seen ? "last " + S.day(p.last_seen) : "",
          p.first_seen ? "first seen " + S.day(p.first_seen) : "",
          p.source ? "from " + p.source : "",
        ])) + "</div>" +
        (p.summary ? '<p class="txt">' + S.esc(p.summary) + "</p>" : "") +
        factList(p.facts) +
        act("ent:" + p.id, "Forget " + p.name, "Delete " + p.name +
          ((p.facts || []).length ? " and the " + plural(p.facts.length, "fact") + " about them" : "") +
          "? Their emails and files are untouched — this is only what I concluded.") +
        "</div>";
    }).join("");
    S.el("people").innerHTML = html;
  }

  function drawPlaces() {
    var places = state.places || [];
    var html = "<h2>Where your things live</h2>";
    if (!places.length) {
      S.el("places").innerHTML = html + '<p class="muted">Nothing catalogued yet. This is the list of your trackers, ' +
        "folders, channels and boards — the list of them, never what is inside.</p>";
      return;
    }
    html += '<p class="count">' + plural(places.length, "thing") + " I know of. A title, a line about what it is and a " +
      "link to open it. The contents stay where they are: I read a file when you ask me about it, not before.</p>";
    html += places.map(function (x) {
      var link = href(x.pointer);
      return '<div class="item"><div class="t">' + S.esc(x.title) + ' <span class="tag">' + S.esc(x.kind) + "</span>" +
        (link ? ' <a class="link-out" href="' + S.esc(link) + '" target="_blank" rel="noopener">Open it</a>' : "") + "</div>" +
        '<p class="txt">' + S.esc(x.card) + "</p>" +
        '<div class="meta">' + S.esc(dots([
          x.source ? "from " + x.source : "",
          x.updated_at ? "changed " + S.day(x.updated_at) : "",
          x.at ? "on " + S.day(x.at) : "",
          (x.who || []).length ? "with " + x.who.slice(0, 4).join(", ") : "",
        ])) + "</div>" +
        act("idx:" + x.id, "Forget this", "Delete my note of " + x.title + "? The " + words(x.kind) +
          " itself is yours and stays exactly where it is; I just stop knowing about it.") +
        "</div>";
    }).join("");
    S.el("places").innerHTML = html;
  }

  /* What the chat remembers: one row per person or thing, each note with where it came from and its own Forget. The
     list is the one the assistant reads every message, corrections and what they asked it to keep first. */
  function drawMemory() {
    var groups = state.memory || [];
    var html = "<h2>What I remember from our chats</h2>";
    if (!groups.length) {
      S.el("remembered").innerHTML = html + '<p class="muted">Nothing yet. Once we have talked a little, what I keep ' +
        "from it shows up here: who people are, what you asked me to keep, what your meetings settled.</p>";
      return;
    }
    var count = groups.reduce(function (n, g) { return n + g.claims.length; }, 0);
    html += '<p class="count">' + plural(count, "note") + " about " + plural(groups.length, "person or thing", "people and things") +
      ", each with where it came from. What you corrected or asked me to keep comes first: it wins over everything else.</p>";
    html += groups.map(function (g) {
      return '<div class="item"><div class="t">' + S.esc(g.subject) + "</div>" + g.claims.map(function (c) {
        return '<p class="txt">' + S.esc(c.statement) +
          (c.pinned ? ' <span class="tag">kept</span>' : "") + (c.kind === "now" ? ' <span class="tag">for now</span>' : "") + "</p>" +
          '<div class="meta">' + S.esc(dots([c.from, c.at ? S.day(c.at) : ""])) + "</div>" +
          act("mem:" + c.id, "Forget this", "Forget this? I stop using it, along with its earlier versions, and the " +
            "messages it came from stop turning up when I search. Everything else stays.");
      }).join("") + "</div>";
    }).join("");
    S.el("remembered").innerHTML = html;
  }

  function draw() {
    if (state.memory) drawMemory();
    if (state.blocks) drawProfile();
    if (state.people) drawPeople();
    if (state.places) drawPlaces();
  }

  /* What each key deletes, and which list the answer refreshes. One place, so the confirm, the call and the redraw
     can never disagree about what was being forgotten. */
  function forget(key, btn) {
    var kind = key.slice(0, key.indexOf(":")), id = key.slice(key.indexOf(":") + 1), body;
    if (kind === "block") body = { action: "brain_forget_block", block: id };
    else if (kind === "ent") body = { action: "brain_forget_entity", entity_id: id };
    else if (kind === "idx") body = { action: "brain_forget_index", index_id: id };
    else if (kind === "mem") body = { action: "memory_forget", claim_id: id };
    else return;
    S.busy(btn, true, "Yes, forget it");
    S.api(token, body).then(function (r) {
      if (!r.ok) {
        S.busy(btn, false, "Yes, forget it");
        S.note("msg", r.message || "I couldn't delete that. Please try again.", "bad");
        return;
      }
      asking = "";
      // Each delete answers with the list it changed, emptied of what went, so the page shows what is stored rather
      // than its own idea of it.
      if (r.blocks) { state.blocks = r.blocks; state.crawls = r.crawls || state.crawls; }
      if (r.people) state.people = r.people;
      if (r.places) state.places = r.places;
      if (r.memory) state.memory = r.memory;
      draw();
      S.note("msg", "Gone. The next message I write won't have it.", "ok");
    });
  }

  document.addEventListener("click", function (e) {
    var ask = e.target.closest ? e.target.closest("[data-ask]") : null;
    if (ask) {
      asking = ask.getAttribute("data-ask") || "";
      S.note("msg", "");
      draw();
      return;
    }
    var go = e.target.closest ? e.target.closest("[data-go]") : null;
    if (go) forget(go.getAttribute("data-go"), go);
  });

  S.session().then(function (s) {
    token = s;
    return Promise.all([
      S.api(token, { action: "brain_profile" }),
      S.api(token, { action: "brain_people" }),
      S.api(token, { action: "brain_places" }),
      S.api(token, { action: "memory_list" }),
    ]);
  }).then(function (all) {
    if (!all[0].ok) { S.note("msg", all[0].message || "Please sign in again.", "bad"); return; }
    state.blocks = all[0].blocks || [];
    state.crawls = all[0].crawls || [];
    state.people = all[1].ok ? (all[1].people || []) : [];
    state.places = all[2].ok ? (all[2].places || []) : [];
    state.memory = all[3].ok ? (all[3].memory || []) : [];
    draw();
  }).catch(function () {});
})();
