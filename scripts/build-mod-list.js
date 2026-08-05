/**
 * build-mod-list.js
 * ------------------
 * Run this OCCASIONALLY — not on every scheduled update. It pulls the
 * current, real list of everything each target syndicate offers (from a
 * community-maintained Warframe data project), filters out the obvious
 * non-mod items, and writes a candidate list to data/tracked-mods.json.
 *
 * IMPORTANT — please read: Syndicates also sell 1-2 exclusive WEAPONS
 * (not mods), and this data source doesn't cleanly label "this is a
 * weapon" vs "this is a mod". Weapon names slip through the filter below.
 * After running this, open data/tracked-mods.json and delete any weapon
 * names you spot (there are usually only a handful per syndicate, so this
 * is a quick skim, not a big job). You'll only need to redo this when a
 * syndicate gets new offerings, which is rare.
 *
 * Run with: npm run build-mod-list
 */

const SYNDICATE_DATA_URL = 'https://drops.warframestat.us/data/syndicates.json';

// The syndicates we want to track. Names must match the source data
// exactly — if one below comes back empty, check the spelling against
// https://drops.warframestat.us (search box) or the raw JSON itself.
const TARGET_SYNDICATES = [
  // The 6 main Faction syndicates
  'Steel Meridian',
  'Arbiters of Hexis',
  'Cephalon Suda',
  'The Perrin Sequence',
  'Red Veil',
  'New Loka',
  // Neutral syndicates known (or suspected) to offer mods.
  // If any of these come back empty after filtering, it just means that
  // syndicate doesn't currently offer mods — safe to delete from this list.
  'Cephalon Simaris',
  'Necraloid',
  'Conclave',
  'Entrati',
  'The Hex',
  'The Holdfasts',
];

// Item names containing any of these words are almost certainly NOT mods,
// so they're filtered out automatically. Everything else is kept as a
// "candidate" for your manual pass (mainly to catch syndicate weapons).
const EXCLUDE_KEYWORDS = [
  'sigil', 'blueprint', 'key', 'credits', 'endo', 'ephemera',
  'glyph', 'emblem', 'decoration', 'sculpture', 'noggle', 'skin',
  'armor', 'helmet', 'syandana', 'scene', 'captura', 'fragment',
  'relic', 'orokin cell', 'forma', 'exilus',
];

// Item names here usually carry a useful note in parentheses telling you
// what the mod applies to — "Shattering Justice (Sobek)" is the Sobek
// augment. We KEEP that, because it's the most useful thing about an
// augment mod and it gets shown on the site.
//
// warframe.market doesn't use it in their slugs (they just call it
// "shattering_justice"), so update-market-data.js strips it there instead.
// Display name and lookup key, handled separately.
function tidyWhitespace(itemName) {
  return itemName.replace(/\s+/g, ' ').trim();
}

function looksLikeMod(itemName) {
  const lower = itemName.toLowerCase();
  return !EXCLUDE_KEYWORDS.some((word) => lower.includes(word));
}

async function main() {
  console.log(`Fetching syndicate data from ${SYNDICATE_DATA_URL} ...`);
  const res = await fetch(SYNDICATE_DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch syndicate data: ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const syndicates = body.syndicates;

  const result = {};

  for (const name of TARGET_SYNDICATES) {
    const offerings = syndicates[name];
    if (!offerings) {
      console.warn(`  No data found for "${name}" — check the spelling against the source.`);
      continue;
    }

    const candidateMods = offerings
      .map((entry) => tidyWhitespace(entry.item))
      .filter((itemName) => itemName.length > 0)
      .filter((itemName, index, all) => all.indexOf(itemName) === index) // de-dupe
      .filter(looksLikeMod);

    if (candidateMods.length > 0) {
      result[name] = candidateMods;
      console.log(`  ${name}: ${candidateMods.length} candidates`);
    } else {
      console.log(`  ${name}: nothing left after filtering (probably no mods offered)`);
    }
  }

  const fs = await import('node:fs/promises');
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/tracked-mods.json', JSON.stringify(result, null, 2) + '\n');

  console.log('\nWrote data/tracked-mods.json');
  console.log('Next step: open that file and delete any non-mod items (mainly syndicate');
  console.log('weapons) before running "npm run update-market-data" for the first time.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
