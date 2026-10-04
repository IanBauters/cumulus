#!/usr/bin/env node
/*
 * News fetcher.
 * Reads each source's RSS/Atom feed on the server side (no browser CORS limits),
 * filters out noise and writes everything the page needs to news.json.
 *
 * Run it with Node.js 18 or newer:   node scripts/fetch-news.mjs
 * No packages to install.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ---------------- settings ----------------

// The news sources, in the order they appear on the page.
// filter: true applies the noise filter below to that source.
const SOURCES = [
  { name: "MacRumors",  site: "https://www.macrumors.com/",    feed: "https://feeds.macrumors.com/MacRumors-All",     filter: true },
  { name: "9 to 5 Mac", site: "https://9to5mac.com/",          feed: "https://9to5mac.com/feed/",                     filter: true },
  { name: "MacStories", site: "https://www.macstories.net/",   feed: "https://www.macstories.net/feed/",              filter: true },
  { name: "VRT NWS",    site: "https://www.vrt.be/vrtnws/nl/", feed: "https://www.vrt.be/vrtnws/nl.rss.articles.xml", filter: false },
];

const ITEMS_PER_SOURCE = 5;

// Headlines whose title or teaser matches any of these are skipped (for sources with filter: true).
const NOISE = [
  /\bdeals?\b/i, /price drops?/i, /\bdiscount/i, /\bsave \$/i, /\$\d+ off\b/i,
  /prime (big deal )?days?/i, /black friday/i, /cyber monday/i, /coupon/i,
  /sponsor/i, /podcast/i, /\bovertime\b/i, /the macrumors show/i,
  /monthly log/i, /macstories weekly/i, /club members/i, /for club macstories/i,
];

const TIMEOUT_MS = 15000;

// ---------------- helpers ----------------

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(here, "..", "news.json");

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", eacute: "é", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü", agrave: "à", egrave: "è" };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function unwrap(s) {
  if (s == null) return "";
  const cdata = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decode(s);
}

function plain(html) {
  return decode(String(html).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function teaser(html) {
  const t = plain(html);
  return t.length <= 170 ? t : t.slice(0, 170).replace(/\s+\S*$/, "") + "…";
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? unwrap(m[1]).trim() : "";
}

function cleanUrl(u) {
  try {
    const url = new URL(u.trim());
    if (!/^https?:$/.test(url.protocol)) return "";
    for (const p of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ncid"]) url.searchParams.delete(p);
    return url.toString();
  } catch {
    return "";
  }
}

function parseFeed(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    let link = tag(b, "link");
    if (!link) {
      // Atom: <link rel="alternate" href="..."/>
      const links = [...b.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
      const alt = links.find((a) => !/rel=/.test(a) || /rel=["']alternate["']/.test(a)) || "";
      link = (alt.match(/href=["']([^"']+)["']/) || [])[1] || "";
    }
    const when = new Date(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    return {
      title: plain(tag(b, "title")),
      url: cleanUrl(decode(link)),
      time: isNaN(when) ? null : when.toISOString(),
      summary: teaser(tag(b, "description") || tag(b, "summary") || tag(b, "content") || tag(b, "content:encoded")),
    };
  })
    .filter((it) => it.title && it.url)
    .sort((a, b) => (b.time || "").localeCompare(a.time || ""));
}

async function fetchFeed(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NewsFetcher/1.0)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- main ----------------

async function main() {
  let previous = { sources: [] };
  try { previous = JSON.parse(await readFile(OUTPUT, "utf8")); } catch { /* first run */ }

  const now = new Date().toISOString();
  const sources = await Promise.all(SOURCES.map(async (s) => {
    const old = (previous.sources || []).find((p) => p.feed === s.feed);
    try {
      let items = parseFeed(await fetchFeed(s.feed));
      if (!items.length) throw new Error("feed had no readable items");
      if (s.filter) items = items.filter((it) => !NOISE.some((re) => re.test(`${it.title} ${it.summary}`)));
      console.log(`ok    ${s.name}: ${items.length} items after filtering`);
      return { name: s.name, site: s.site, feed: s.feed, fetchedAt: now, error: null, items: items.slice(0, ITEMS_PER_SOURCE) };
    } catch (err) {
      // keep the last good headlines so a hiccup doesn't empty the page
      console.log(`fail  ${s.name}: ${err.message}`);
      return { name: s.name, site: s.site, feed: s.feed, fetchedAt: old?.fetchedAt ?? null, error: String(err.message), items: old?.items ?? [] };
    }
  }));

  await writeFile(OUTPUT, JSON.stringify({ generatedAt: now, sources }, null, 2) + "\n");
  console.log(`wrote ${OUTPUT}`);
  if (sources.every((s) => s.error)) process.exitCode = 1;
}

main();
