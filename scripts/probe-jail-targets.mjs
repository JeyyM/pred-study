import { BJM_ROSTER_SITES } from './lib/sources.mjs';
import { scrapeSite } from './lib/mugshot-scrape.mjs';

for (const site of BJM_ROSTER_SITES.slice(0, 4)) {
  process.stdout.write(`${site.id} ... `);
  try {
    const rows = await scrapeSite(site, { rosterRole: 'target' });
    console.log(rows.length, rows.map((r) => r.offense.slice(0, 50)).join(' | ') || '(none)');
  } catch (err) {
    console.log('fail', err.message);
  }
}
