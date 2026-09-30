import { guessGenderFromName } from './gender.mjs';
import { categorizeCharge } from './offense.mjs';

function cleanOffense(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(text) {
  const m = String(text).match(/\b(20\d{2})\b/);
  if (m) return Number(m[1]);
  return new Date().getFullYear() - 3;
}

export function parseGreenRosterList(html, site) {
  const records = [];
  const chunks = html.split('inmate_mugshot has_image').slice(1);

  for (const chunk of chunks) {
    const imageUrl = chunk.match(/src="([^"]+g-green-backend[^"]+)"/i)?.[1];
    if (!imageUrl || imageUrl.includes('pna.gif')) continue;

    const name = chunk.match(/roster_name">([^<]+)/i)?.[1]?.trim();
    const ageRaw = chunk.match(/Age:[\s\S]*?inmate_data_content">\s*([^<]+)/i)?.[1]?.trim();
    const age = ageRaw && /^\d{1,3}$/.test(ageRaw) ? Number(ageRaw) : null;
    const booking = chunk.match(/Booking #:[\s\S]*?inmate_data_content">\s*([^<]+)/i)?.[1]?.trim();
    const chargeBlock = chunk.match(/Charges:[\s\S]*?inmate_data_content">\s*([\s\S]*?)<\/div>/i)?.[1];
    const offense = cleanOffense(chargeBlock) || 'Booking charge';

    records.push({
      sourceId: site.id,
      sourceState: site.state,
      sourceType: 'county-jail',
      imageUrl,
      offense,
      category: categorizeCharge(offense),
      year: extractYear(chunk),
      gender: guessGenderFromName(name),
      name: name || undefined,
      age,
      sourceBookingId: booking || undefined,
    });
  }

  return records;
}

export async function scrapeGreenRoster(site, fetchText, limit = Number.POSITIVE_INFINITY, rosterRole = 'foil') {
  const url = site.rosterUrl || `${site.base}/inmate-roster`;
  const html = await fetchText(url);
  const list = parseGreenRosterList(html, site)
    .map((row) => ({
      ...row,
      poolRole: row.category === 'sex' ? 'target' : 'foil',
    }))
    .filter((row) => {
      if (rosterRole === 'all') return true;
      if (rosterRole === 'foil') return row.poolRole === 'foil';
      return row.poolRole === 'target';
    });
  if (!Number.isFinite(limit)) return list;
  return list.slice(0, limit);
}
