/**
 * update-market-data.js
 * ----------------------
 * This is the script that runs on a schedule (see
 * .github/workflows/update-market-data.yml). It reads data/tracked-mods.json
 * (which mods to track, grouped by syndicate — see build-mod-list.js) and
 * for each one:
 *
 *   1. Looks up the current lowest sell price on warframe.market.
 *   2. Adds to a running count of how often that mod shows up in the
 *      site-wide feed of recent trades. warframe.market doesn't publish a
 *      ranked "most traded" list itself, so this running count IS our
 *      "most traded" signal — it's built up over time, one run at a time.
 *
 * A NOTE ON THE API: warframe.market is in the middle of replacing their
 * whole API (v1 -> v2), and the v2 docs weren't fully browsable when this
 * was written, so a couple of field names below are reasonable best
 * guesses rather than 100% confirmed. If this errors out or the numbers
 * look wrong on your first run, uncomment the debug line inside
 * getRecentTradeCounts() below — it prints one raw order straight from the
 * API so you can compare its actual field names to the ones used here and
 * adjust.
 *
 * Run with: npm run update-market-data
 */

import { readFile, writeFile } from 'node:fs/promises';

const API_BASE = 'https://api.warframe.market/v2';
const REQUEST_DELAY_MS = 350; // keeps us comfortably under the 3-requests/sec limit

// If a mod's automatically-guessed warframe.market slug doesn't match
// reality (check the mod's real URL on warframe.market to find out), add
// the correct one here, e.g. 'Some Mod Name': 'some_actual_slug'
const SLUG_OVERRIDES = {};

function slugify(modName) {
  if (SLUG_OVERRIDES[modName]) return SLUG_OVERRIDES[modName];
  return modName
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function loadExistingData() {
  try {
    const raw = await readFile('data/market-data.json', 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { lastUpdated: null, lastSeenOrderTime: null, syndicates: {} };
  }
}

async function getCurrentLowestPrice(slug) {
  try {
    const { data } = await fetchJson(`${API_BASE}/orders/item/${slug}`);
    const sellPrices = data
      .filter((order) => order.type === 'sell' && order.visible)
      .map((order) => order.platinum)
      .sort((a, b) => a - b);
    return sellPrices.length > 0 ? sellPrices[0] : null;
  } catch (err) {
    console.warn(`    could not get price for ${slug}: ${err.message}`);
    return null;
  }
}

/**
 * HOW RUN FREQUENCY AFFECTS THIS FUNCTION — worth understanding:
 *
 * The /orders/recent endpoint only returns orders from roughly the last
 * 4 hours. So each run of this script sees a 4-hour window, no matter how
 * often you run it.
 *
 * That means the schedule in the workflow file directly changes how much
 * trade activity you actually capture:
 *
 *   Running hourly -> overlapping windows, near-complete coverage.
 *   Running daily  -> you catch ONE 4-hour window out of every 24 hours,
 *                     always at the same time of day.
 *
 * Daily is totally fine for getting started — you'll still see which mods
 * trade more than others, just built up more slowly, and skewed toward
 * whoever happens to be online at that hour. Prices are unaffected either
 * way; those are a live snapshot taken at run time.
 */
async function getRecentTradeCounts(sinceTimestamp) {
  const { data: recentOrders } = await fetchJson(`${API_BASE}/orders/recent`);

  // Uncomment this the first time you run the script, to sanity-check the
  // field names used below (createdAt, item.slug) against what the API
  // actually returns:
  // console.log(JSON.stringify(recentOrders[0], null, 2));

  const counts = {}; // slug -> count of new orders seen this run
  let newestTimestamp = sinceTimestamp;

  for (const order of recentOrders) {
    const createdAt = order.createdAt;
    if (sinceTimestamp && createdAt <= sinceTimestamp) continue;
    if (!newestTimestamp || createdAt > newestTimestamp) newestTimestamp = createdAt;

    const slug = order.item?.slug;
    if (!slug) continue;
    counts[slug] = (counts[slug] || 0) + 1;
  }

  return { counts, newestTimestamp };
}

async function main() {
  const trackedMods = JSON.parse(await readFile('data/tracked-mods.json', 'utf-8'));
  const existingData = await loadExistingData();

  console.log('Checking recent market-wide trade activity...');
  const { counts: recentCounts, newestTimestamp } = await getRecentTradeCounts(
    existingData.lastSeenOrderTime
  );

  const output = {
    lastUpdated: new Date().toISOString(),
    lastSeenOrderTime: newestTimestamp,
    syndicates: {},
  };

  for (const [syndicateName, modNames] of Object.entries(trackedMods)) {
    console.log(`\n${syndicateName}:`);
    output.syndicates[syndicateName] = [];

    for (const modName of modNames) {
      const slug = slugify(modName);
      console.log(`  ${modName} (${slug})`);

      const price = await getCurrentLowestPrice(slug);
      await wait(REQUEST_DELAY_MS);

      const previousEntry = existingData.syndicates[syndicateName]?.find(
        (m) => m.name === modName
      );
      const runningTradeCount = (previousEntry?.tradeCount || 0) + (recentCounts[slug] || 0);

      output.syndicates[syndicateName].push({
        name: modName,
        slug,
        lowestPrice: price,
        tradeCount: runningTradeCount,
      });
    }

    // Most-traded first, within each syndicate
    output.syndicates[syndicateName].sort((a, b) => b.tradeCount - a.tradeCount);
  }

  await writeFile('data/market-data.json', JSON.stringify(output, null, 2) + '\n');
  console.log('\nWrote data/market-data.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
