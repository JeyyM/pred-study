import { fetchText } from './lib/mugshot-scrape.mjs';
import { sorScrapeSites } from './lib/sources.mjs';

function parseIds(html) {
  const ids = new Set();
  const re = /sex_offender_view\.php\?id=(\d+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return ids;
}

for (const site of sorScrapeSites()) {
  process.stdout.write(`${site.id} ... `);
  try {
    const html = await fetchText(`${site.base}/sex_offenders.php`);
    const ids = parseIds(html);
    const hasMore = /grp=\d+/i.test(html) || html.includes('?grp=');
    console.log(`${ids.size} on first page${hasMore ? ' (paged)' : ''}`);
  } catch (err) {
    console.log(`fail ${String(err.message).slice(0, 60)}`);
  }
}
