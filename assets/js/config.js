/*
 * Page settings.
 * Sources and the noise filter are set in scripts/fetch-news.mjs, which builds news.json.
 */
window.SITE_CONFIG = {

  // The site name and tagline, shown in the header, browser tab and footer.
  siteName: "Cumulus",
  tagline: "News from around the cloud",

  // Where the page loads its headlines from.
  // "news.json" = the file next to index.html (when the site is hosted on GitHub Pages).
  // Hosting the page on your own server? Point this at the file in your GitHub repository, e.g.
  // "https://raw.githubusercontent.com/YOUR-NAME/aaplnow/main/news.json"
  newsUrl: "news.json",

  // Layout, row by row: "s" is the next source's headline list,
  // "f0" / "f1" is the big "Latest from" story of the 1st / 2nd source in that row.
  layout: [["s", "s", "f0"], ["f1", "s", "s"]],

  // How often an open page checks for a newer news.json, in minutes.
  refreshMinutes: 10,

  // The header turns yellow when the newest data is older than this (in minutes).
  // The GitHub job runs every 30 minutes, so 90 leaves room for its delays.
  staleAfterMinutes: 90
};
