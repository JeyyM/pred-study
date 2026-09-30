import { fetchText } from './lib/mugshot-scrape.mjs';

const site = { base: 'https://www.loganso.com' };
const cardRe =
  /<img src='([^']*templates\/[^']*\/images\/inmates\/[^']+)'[\s\S]*?href="roster_view\.php\?booking_num=([^"]+)"/gi;

const all = [];
for (let page = 0; page < 3; page += 1) {
  const grp = page === 0 ? '' : `?grp=${page * 10}`;
  const html = await fetchText(`${site.base}/roster.php${grp}`);
  const pageCards = [];
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    pageCards.push({ booking: m[2], img: m[1] });
  }
  console.log(`page ${page}: ${pageCards.length} cards, ${new Set(pageCards.map((c) => c.booking)).size} unique bookings`);
  all.push(...pageCards.map((c) => ({ ...c, page })));
}

const byBooking = new Map();
for (const c of all) {
  if (!byBooking.has(c.booking)) byBooking.set(c.booking, []);
  byBooking.get(c.booking).push(c);
}
const repeated = [...byBooking.entries()].filter(([, rows]) => rows.length > 1);
console.log(`\ntotal cards: ${all.length}, unique bookings: ${byBooking.size}, unique image URLs: ${new Set(all.map((c) => c.img)).size}`);
console.log(`bookings on multiple pages: ${repeated.length}`);
for (const [booking, rows] of repeated.slice(0, 8)) {
  console.log(`  ${booking} -> pages ${rows.map((r) => r.page).join(', ')}`);
}
