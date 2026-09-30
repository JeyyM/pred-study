import { fetchText } from './lib/mugshot-scrape.mjs';

const sites = [
  { name: 'Logan AR', base: 'https://www.loganso.com' },
  { name: 'Chilton AL', base: 'https://www.chiltoncountyso.org' },
];

const cardRe =
  /<img src='([^']*templates\/[^']*\/images\/inmates\/[^']+)'[\s\S]*?href="roster_view\.php\?booking_num=([^"]+)"/gi;

for (const site of sites) {
  const all = [];
  for (let page = 0; page < 3; page += 1) {
    const grp = page === 0 ? '' : `?grp=${page * 10}`;
    const html = await fetchText(`${site.base}/roster.php${grp}`);
    let m;
    while ((m = cardRe.exec(html)) !== null) all.push({ booking: m[2], page });
  }
  const uniq = new Set(all.map((c) => c.booking));
  console.log(`${site.name}: ${all.length} cards, ${uniq.size} unique bookings across 3 pages`);
}
