/*
 * Loads news.json (built by scripts/fetch-news.mjs) and renders it with Bootstrap.
 * Page settings live in config.js.
 */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG;
  var grid = document.getElementById("grid");
  var status = document.getElementById("status");
  var updated = document.getElementById("updated");
  var tooltips = [];
  var news = null;      // last news.json that loaded
  var lastError = null;
  var loading = false;

  // ---------- helpers ----------

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : "#"; }

  function ago(date) {
    var m = (Date.now() - date.getTime()) / 60000;
    if (!isFinite(m)) return "";
    if (m < 45) return Math.max(1, Math.round(m)) + "m";
    if (m < 60 * 24) return Math.round(m / 60) + "h";
    if (m < 60 * 24 * 30) return Math.floor(m / 1440) + "d";
    if (m < 60 * 24 * 365) return Math.floor(m / 43200) + "mo";
    return Math.floor(m / 525600) + "y";
  }

  function fullDate(date) {
    return isNaN(date) ? "" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  // ---------- loading ----------

  function load() {
    if (loading) return;
    loading = true;
    var url = CFG.newsUrl + (CFG.newsUrl.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now();

    fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + CFG.newsUrl);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.sources)) throw new Error("news.json has an unexpected format");
        news = data;
        lastError = null;
      })
      .catch(function (err) {
        lastError = err;
        if (window.console) console.error("Couldn't load headlines:", err);
      })
      .finally(function () {
        loading = false;
        render();
      });
  }

  // ---------- header: when the news was last pulled ----------

  var PILL = "badge rounded-pill fw-normal px-3 py-2 ";
  function showUpdated() {
    var gen = news && new Date(news.generatedAt);
    if (!news || isNaN(gen)) {
      updated.className = PILL + "text-bg-danger";
      updated.textContent = "Can't load the news";
      updated.title = lastError ? lastError.message : "";
      return;
    }
    var mins = (Date.now() - gen.getTime()) / 60000;
    var time = gen.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    var stale = mins > CFG.staleAfterMinutes;
    updated.className = PILL + (stale ? "text-bg-warning" : "border border-secondary text-white-50");
    updated.textContent = (stale ? "Outdated · last update " : "Updated ") + ago(gen) + " ago" + (mins < 60 * 24 ? " (" + time + ")" : "");
    updated.title = "News last pulled " + fullDate(gen) + (lastError ? " · couldn't check for newer news just now" : "");
  }

  // ---------- rendering ----------

  function headline(it) {
    var d = new Date(it.time);
    return '<li class="list-group-item px-1 py-2 d-flex gap-3 justify-content-between align-items-baseline bg-transparent">' +
      '<a class="site-link link-underline link-underline-opacity-0 text-body" href="' + esc(safeUrl(it.url)) + '" target="_blank" rel="noopener"' +
      (it.summary ? ' data-bs-toggle="tooltip" data-bs-placement="right" data-bs-title="' + esc(it.summary) + '"' : "") + '>' + esc(it.title) + '</a>' +
      (it.time ? '<time class="small text-body-secondary text-nowrap font-monospace" data-ago="' + esc(it.time) + '" datetime="' + esc(it.time) + '" title="' + esc(fullDate(d)) + '">' + ago(d) + '</time>' : "") +
      '</li>';
  }

  function sourceBlock(s) {
    var items = s.items || [];
    var body = items.length
      ? items.map(headline).join("")
      : '<li class="list-group-item px-1 py-2 bg-transparent text-body-secondary">' +
        (s.error ? "Couldn't load this feed right now." : "No headlines right now.") + '</li>';
    return '<section class="col-12 col-md-6 col-lg-4"><div class="border-top border-4 pt-2 h-100">' +
      '<h2 class="h6 fw-bold mb-1"><a class="site-link link-underline link-underline-opacity-0 text-body" href="' + esc(safeUrl(s.site)) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a></h2>' +
      '<ul class="list-group list-group-flush small">' + body + '</ul></div></section>';
  }

  function featuredBlock(s) {
    var it = s && s.items && s.items[0];
    if (!it) return "";
    return '<article class="col-12 col-md-6 col-lg-4">' +
      '<a class="site-feature d-block border-top border-4 pt-2 h-100 link-underline link-underline-opacity-0" href="' + esc(safeUrl(it.url)) + '" target="_blank" rel="noopener">' +
      '<p class="small text-body-secondary mb-2">Latest from ' + esc(s.name) + '</p>' +
      '<h2 class="fs-3 fw-bold lh-sm text-body mb-3 text-balance">' + esc(it.title) + '</h2>' +
      '<p class="text-body-secondary mb-0">' + esc(it.summary) + '</p></a></article>';
  }

  function render() {
    tooltips.forEach(function (t) { t.dispose(); });
    tooltips = [];

    if (!news) {
      grid.innerHTML = '<div class="alert alert-warning"><strong>Couldn\'t load the headlines.</strong> ' +
        'The page looks for <code>' + esc(CFG.newsUrl) + '</code>. Check that the file exists at that address ' +
        '(see README.txt), then press Refresh.' +
        (lastError ? '<br><span class="small text-body-secondary">' + esc(lastError.message) + '</span>' : '') + '</div>';
      status.textContent = "Headlines unavailable";
      showUpdated();
      return;
    }

    var sources = news.sources;
    var html = "", i = 0;
    CFG.layout.forEach(function (row) {
      var start = i, cells = "";
      row.forEach(function (cell) {
        if (cell === "s") {
          if (i < sources.length) cells += sourceBlock(sources[i++]);
        } else {
          cells += featuredBlock(sources[start + Number(cell.slice(1))]);
        }
      });
      if (cells) html += '<div class="row g-4 mb-4 mb-lg-5">' + cells + '</div>';
    });
    while (i < sources.length) {
      html += '<div class="row g-4 mb-4 mb-lg-5">' + sources.slice(i, i + 3).map(sourceBlock).join("") + '</div>';
      i += 3;
    }
    grid.innerHTML = html;

    var failed = sources.filter(function (s) { return s.error; }).map(function (s) { return s.name; });
    status.textContent = sources.length + " sources" +
      (failed.length ? " · couldn't reach " + failed.join(", ") + " on the last update" : "") +
      " · hover a headline for its teaser";
    showUpdated();

    if (window.bootstrap && window.matchMedia("(hover: hover)").matches) {
      grid.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
        tooltips.push(new bootstrap.Tooltip(el));
      });
    }
  }

  function skeleton() {
    var col = '<div class="col-12 col-md-6 col-lg-4"><div class="border-top border-4 pt-3 d-grid gap-3">' +
      '<div class="site-skel w-25"></div><div class="site-skel"></div><div class="site-skel w-75"></div><div class="site-skel"></div></div></div>';
    grid.innerHTML = '<div class="row g-4 mb-5" aria-hidden="true">' + col + col + col + '</div>';
  }

  // ---------- name ----------

  function applyName() {
    var name = CFG.siteName || "News", tagline = CFG.tagline || "";
    document.title = tagline ? name + " | " + tagline : name;
    document.querySelectorAll('[data-site="name"]').forEach(function (el) { el.textContent = name; });
    document.querySelectorAll('[data-site="tagline"]').forEach(function (el) { el.textContent = tagline; el.hidden = !tagline; });
  }

  // ---------- start ----------

  applyName();

  skeleton();
  load();
  setInterval(load, CFG.refreshMinutes * 60000);
  setInterval(function () {
    if (news) showUpdated();
    document.querySelectorAll("[data-ago]").forEach(function (t) {
      t.textContent = ago(new Date(t.getAttribute("data-ago")));
    });
  }, 60000);
})();
