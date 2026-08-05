# Syndicate Mod Ledger

A small site that tracks warframe.market prices and trade activity for
mods offered as syndicate rewards, grouped by syndicate. Hosted for free
on GitHub Pages; kept up to date by a free scheduled GitHub Action —
no server, no database, no hosting bill.

## How it fits together

```
data/tracked-mods.json   <- WHAT to track (syndicate -> list of mod names)
        |
        v  (npm run update-market-data)
data/market-data.json    <- current prices + trade activity, read by the site
        |
        v
index.html                <- the page people actually see
```

Two scripts, two different jobs:

- **`npm run build-mod-list`** — run this occasionally (only when a
  syndicate's offerings change, which is rare). It pulls the real, current
  list of everything each syndicate offers from a community Warframe data
  project and filters it down to mod candidates, writing the result to
  `data/tracked-mods.json`.

  **You need to review that file's output once** — syndicates also sell a
  couple of exclusive weapons, and there's no clean automatic way to tell
  "this is a weapon" from "this is a mod" in that data source, so a couple
  of weapon names may slip through. Just delete any you spot; it's usually
  only 1-2 per syndicate.

- **`npm run update-market-data`** — the workhorse. Reads
  `data/tracked-mods.json` and, for each mod, checks warframe.market for
  its current lowest sell price. It also keeps a running count of how
  often each mod shows up in the site-wide feed of recent trades —
  warframe.market doesn't publish a ranked "most traded" list itself, so
  this running count, built up one scheduled run at a time, **is** your
  "most traded" signal. Writes the combined result to
  `data/market-data.json`.

The GitHub Action in `.github/workflows/update-market-data.yml` runs the
second script **once a day** automatically, and commits the refreshed
`data/market-data.json` back into the repo. Public repos get free,
effectively unlimited GitHub Actions minutes, so this costs nothing.

### Changing how often it runs

Open `.github/workflows/update-market-data.yml` — there's a clearly marked
block near the top with the schedule options written out. Change the one
`cron:` line and push; that's the whole change.

One thing to know about going daily vs. hourly: the price for each mod is a
live snapshot taken whenever the script runs, so that's accurate either way.
The trade-activity numbers work differently — warframe.market's feed only
shows the last ~4 hours of orders, so each run captures a 4-hour window.
Running daily means catching one such window per day, always at the same
hour, so the "most traded" ranking builds up more slowly and leans toward
whoever's online at that time. Fine for getting a feel for it; switch to
hourly later if you want fuller coverage.

## Setting it up

1. Create a new repo on GitHub and push these files to it.
2. In the repo's **Settings → Pages**, set the source to deploy from your
   main branch. GitHub will give you a URL like
   `https://yourname.github.io/repo-name/`.
3. The scheduled Action needs permission to push commits back to the repo —
   this repo's workflow file already requests that (`permissions: contents:
   write`), but double check under **Settings → Actions → General →
   Workflow permissions** that "Read and write permissions" is selected.
4. That's it — the site will start updating itself every hour. You can
   also trigger a run immediately from the **Actions** tab
   ("Update market data" → "Run workflow") instead of waiting.

## Running it locally first (recommended)

Before pushing, it's worth running both scripts on your own machine so you
can see what they produce and fix anything before it's live:

```
node scripts/build-mod-list.js
# open data/tracked-mods.json, delete any weapon names you spot

node scripts/update-market-data.js
# open index.html in a browser (or run a local server) to see the result
```

No `npm install` needed — everything here uses Node's built-in `fetch`,
so you just need Node.js 18 or newer installed.

## Good to know: warframe.market's API is mid-upgrade

While building this, I found that warframe.market is in the middle of
replacing their whole API with a new version, and the new version's docs
weren't fully readable yet at the time of writing. The field names used in
`update-market-data.js` (things like `createdAt`, `item.slug`) are
reasonable, well-informed guesses rather than 100%-confirmed facts.

If the update script errors out, or the numbers look off, open
`scripts/update-market-data.js` and uncomment the single debug line inside
`getRecentTradeCounts()` — it prints one real order straight from the API
so you can compare its actual field names to the ones the script expects,
and adjust. Everything that talks to the API is contained in that one
file, so fixes stay localized.

## Adjusting what's tracked

Just edit `data/tracked-mods.json` directly at any point — add a mod, remove
one, or add a whole new syndicate key. The next scheduled run will pick up
the change automatically.
