/**
 * Add more jail foils + qualifying registry targets without wiping the pool.
 * Run: node scripts/expand-pool.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseGenderFromBjmRosterHtml, parseGenderFromBjmSorHtml, guessGenderFromName } from './lib/gender.mjs';
import { decodeOffenseText, isQualifyingMinorSexOffense } from './lib/offense-qualify.mjs';
import { applyFaceVisibility } from './lib/face-visible.mjs';
import { normalizeDownloadedImage } from './lib/normalize-image.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'public', 'images');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const BJM_ROSTER_SITES = [
  { id: 'al-chilton-jail', state: 'AL', base: 'https://www.chiltoncountyso.org', pages: 4 },
  { id: 'ar-logan-jail', state: 'AR', base: 'https://www.loganso.com', pages: 4 },
  { id: 'mo-stone-jail', state: 'MO', base: 'https://www.stonecountymosheriff.com', pages: 4 },
  { id: 'al-pickens-jail', state: 'AL', base: 'https://www.pcsoal.org', pages: 4 },
];

const BJM_SOR_SITES = [
  { id: 'al-chilton-sor', state: 'AL', base: 'https://www.chiltoncountyso.org' },
  { id: 'ar-logan-sor', state: 'AR', base: 'https://www.loganso.com' },
  { id: 'al-pickens-sor', state: 'AL', base: 'https://www.pcsoal.org' },
];

const SEX_PATTERNS =
  /\b(sexual|sex offender|rape|sodomy|molest|lewd|indecent|child.*(sex|porn|abuse|molest)|exploitation of a minor|solicit.*minor)\b/i;

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nextImageName(records) {
  let max = 0;
  for (const rec of records) {
    const n = parseInt(String(rec.image).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `mug-${String(max + 1).padStart(3, '0')}.jpg`;
}

async function downloadImage(url, destPath) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*,*/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 900) throw new Error('Image too small');
  const normalized = await normalizeDownloadedImage(buf, path.basename(destPath));
  fs.writeFileSync(destPath, normalized);
}

function parseBjmRosterPage(html, site) {
  const records = [];
  const cardRe =
    /<img src='([^']*templates\/[^']*\/images\/inmates\/[^']+)'[\s\S]*?href="roster_view\.php\?booking_num=([^"]+)"/gi;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    records.push({ bookingNum: m[2], imageUrl: new URL(m[1], site.base).href });
  }
  return records;
}

async function scrapeJailCandidates(site, limit = 30) {
  const seen = new Set();
  const rows = [];
  for (let page = 0; page < site.pages; page += 1) {
    const grp = page === 0 ? '' : `?grp=${page * 10}`;
    const html = await fetchText(`${site.base}/roster.php${grp}`);
    const cards = parseBjmRosterPage(html, site);
    for (const card of cards) {
      if (seen.has(card.bookingNum)) continue;
      seen.add(card.bookingNum);
      try {
        const detail = await fetchText(`${site.base}/roster_view.php?booking_num=${encodeURIComponent(card.bookingNum)}`);
        const block = detail.match(/<span class="text2">([\s\S]*?)<\/span>/i)?.[1] || '';
        const charges = block.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').trim();
        if (SEX_PATTERNS.test(charges)) continue;
        const gender = parseGenderFromBjmRosterHtml(detail);
        if (!gender) continue;
        rows.push({
          sourceId: site.id,
          sourceState: site.state,
          sourceType: 'county-jail',
          imageUrl: card.imageUrl,
          offense: charges.slice(0, 140) || 'Booking charge',
          category: 'violent',
          year: new Date().getFullYear(),
          gender,
          qualifyingMinor: false,
        });
        if (rows.length >= limit) return rows;
      } catch {
        /* skip */
      }
      await sleep(100);
    }
  }
  return rows;
}

function parseSexOffenderIds(html) {
  const ids = [];
  const re = /sex_offender_view\.php\?id=(\d+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

async function fetchQualifyingOffender(site, id) {
  const html = await fetchText(`${site.base}/sex_offender_view.php?id=${id}`);
  const levelBlock = html.match(/class="level_1"[^>]*>\s*<p>([\s\S]*?)<\/p>/i)?.[1];
  const ogDesc = html.match(/property="og:description" content="([^"]+)"/i)?.[1];
  const offense = decodeOffenseText(levelBlock || ogDesc || '');
  if (!isQualifyingMinorSexOffense(offense)) return null;
  const gender = parseGenderFromBjmSorHtml(html);
  if (!gender) return null;
  const rel =
    html.match(/src="(\/?plugins\/show_image\.php\?id=\d+&type=orig)"/i)?.[1] ||
    html.match(/content="(https:\/\/[^"]+\/plugins\/show_image\.php\?id=\d+&type=min200)"/i)?.[1];
  if (!rel) return null;
  const imageUrl = rel.startsWith('http') ? rel.replace('type=min200', 'type=orig') : new URL(rel, site.base).href;
  return applyFaceVisibility({
    sourceId: site.id,
    sourceState: site.state,
    sourceType: 'sex-offender-registry',
    imageUrl,
    offense: offense.slice(0, 160),
    category: 'sex',
    qualifyingMinor: true,
    year: new Date().getFullYear(),
    gender,
  });
}

async function main() {
  const poolData = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  let records = poolData.records;
  const usedImages = new Set(records.map((r) => r.image));
  const usedKeys = new Set(records.map((r) => `${r.sourceId}:${decodeOffenseText(r.offense).toLowerCase()}`));

  let added = 0;

  for (const site of BJM_ROSTER_SITES) {
    process.stdout.write(`• Expand jail ${site.id} ... `);
    try {
      const candidates = await scrapeJailCandidates(site, 28);
      let siteAdded = 0;
      for (const row of candidates) {
        const key = `${row.sourceId}:${decodeOffenseText(row.offense).toLowerCase()}`;
        if (usedKeys.has(key)) continue;
        const filename = nextImageName(records);
        if (usedImages.has(filename)) continue;
        try {
          await downloadImage(row.imageUrl, path.join(IMAGE_DIR, filename));
          records.push({ ...row, image: filename });
          usedImages.add(filename);
          usedKeys.add(key);
          siteAdded += 1;
          added += 1;
        } catch {
          /* skip download */
        }
        await sleep(150);
      }
      console.log(`+${siteAdded}`);
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(300);
  }

  const qualifying = records.filter((r) => r.qualifyingMinor).length;
  const targetQualifying = 54;
  if (qualifying < targetQualifying) {
    process.stdout.write(`• Expand qualifying targets (${qualifying}/${targetQualifying}) ... `);
    let sorAdded = 0;
    for (const site of BJM_SOR_SITES) {
      if (qualifying + sorAdded >= targetQualifying) break;
      const html = await fetchText(`${site.base}/sex_offenders.php`);
      const ids = parseSexOffenderIds(html);
      for (const id of ids) {
        if (qualifying + sorAdded >= targetQualifying) break;
        try {
          const row = await fetchQualifyingOffender(site, id);
          if (!row || row.faceVisible === false) continue;
          const key = `${row.sourceId}:${decodeOffenseText(row.offense).toLowerCase()}`;
          if (usedKeys.has(key)) continue;
          const filename = nextImageName(records);
          await downloadImage(row.imageUrl, path.join(IMAGE_DIR, filename));
          records.push({ ...row, image: filename });
          usedKeys.add(key);
          sorAdded += 1;
          added += 1;
        } catch {
          /* skip */
        }
        await sleep(150);
      }
    }
    console.log(`+${sorAdded}`);
  }

  poolData.records = records;
  poolData.count = records.length;
  poolData.expandedAt = new Date().toISOString();
  fs.writeFileSync(POOL_PATH, JSON.stringify(poolData, null, 2));

  const freshQualifying = records.filter((r) => r.qualifyingMinor && r.faceVisible !== false).length;
  const freshJail = records.filter(
    (r) => r.sourceType === 'county-jail' && r.category !== 'sex' && r.faceVisible !== false && r.gender,
  ).length;
  const maxSessions = Math.min(Math.floor(freshJail / 36), Math.floor(freshQualifying / 18));

  console.log(`\nAdded ${added} photos. Pool=${records.length}, qualifying targets=${freshQualifying}, jail foils=${freshJail}`);
  console.log(`Estimated replayable full sessions (fresh photos each): ~${maxSessions}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
