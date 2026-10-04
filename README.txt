CUMULUS — news from around the cloud
====================================

HOW IT WORKS
Browsers aren't allowed to read most news sites' feeds from another website,
and the free relay services that work around that are unreliable. So the page
no longer reads feeds itself. Instead:

  1. scripts/fetch-news.mjs reads the four feeds and writes news.json
  2. GitHub runs that script for free every 30 minutes
     (.github/workflows/update-news.yml)
  3. index.html only loads news.json, so your web server just serves
     plain HTML, CSS, JavaScript and one JSON file.

news.json already contains today's headlines, so the page works immediately,
even before the first automatic update.


SETUP (about 10 minutes, free GitHub account needed)

1. Create a repository
   On github.com: New repository, name it "cumulus" (or anything you like), make it Public
   (scheduled runs and Pages are free for public repositories).

2. Upload the files
   "Add file" > "Upload files", and drag in everything from this folder.
   IMPORTANT: the ".github" folder is hidden on Mac (Cmd+Shift+. in Finder
   shows it) and may not upload. If it's missing in the repository afterwards:
   "Add file" > "Create new file", name it exactly
       .github/workflows/update-news.yml
   paste in the contents of that file from this folder, and commit.

3. Let the workflow save news.json
   Settings > Actions > General > Workflow permissions >
   "Read and write permissions" > Save.

4. Run it once
   Actions tab > "Update news" > "Run workflow". After a minute it should
   show a green tick and news.json in the repository gets a fresh date.
   From then on it runs every 30 minutes by itself.

5. Choose where the page lives

   A) On GitHub Pages (simplest)
      Settings > Pages > Source: "Deploy from a branch", branch "main",
      folder "/ (root)" > Save. Your site appears at
      https://YOUR-NAME.github.io/cumulus/ and always has the newest news.json.
      Leave newsUrl in assets/js/config.js as "news.json".

   B) On your own server
      Upload index.html and the assets folder to your server.
      In assets/js/config.js set:
        newsUrl: "https://raw.githubusercontent.com/YOUR-NAME/cumulus/main/news.json"
      The page then fetches the fresh news.json straight from GitHub
      (GitHub allows that, and caches it for about 5 minutes).


CHANGING THINGS
- Site name and tagline: siteName and tagline in assets/js/config.js
  (also change the <title> line in index.html so the name is right before
  the page has loaded).
- Sources and noise filter: edit the top of scripts/fetch-news.mjs.
  If you change the number of sources, also look at "layout" in
  assets/js/config.js (extra sources get their own rows automatically).
- Update frequency: the cron line in .github/workflows/update-news.yml.
- You can also run the script yourself on any computer with Node.js 18+:
      node scripts/fetch-news.mjs
  and copy news.json to your server, or schedule it (cron, Synology Task
  Scheduler) to write straight into your web folder.

THE HEADER INDICATOR
Top right shows when the news was last pulled:
- grey "Updated 12m ago": all good
- yellow "Outdated": news.json is older than staleAfterMinutes (config.js,
  default 90). The GitHub job has probably stopped: check the Actions tab.
- red "Can't load the news": the page can't find news.json at newsUrl.
If a single feed fails, the script keeps that source's previous headlines and
the line under the header names the source it couldn't reach.
