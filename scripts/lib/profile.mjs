import {
  guessGenderFromName,
  normalizeGender,
  parseGenderFromBjmRosterHtml,
  parseGenderFromBjmSorHtml,
} from './gender.mjs';

export function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fieldAfterLabel(html, label) {
  const re = new RegExp(
    `${label}:<\\/span><\\/div>\\s*<div class="(?:cell )?inmate_profile_data_content">([^<]+)`,
    'i',
  );
  const m = html.match(re);
  return m?.[1]?.trim() || null;
}

function fieldAfterStrong(html, label) {
  const re = new RegExp(`<strong>${label}:<\\/strong><\\/div>\\s*<div class="right-cell">([^<]+)`, 'i');
  const m = html.match(re);
  return m?.[1] ? htmlToText(m[1]) || null : null;
}

export function parseAgeFromText(value) {
  if (value == null || value === '') return null;
  const n = parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n) || n < 16 || n > 100) return null;
  return n;
}

export function parseBjmRosterProfile(html) {
  const age = parseAgeFromText(fieldAfterLabel(html, 'Age'));
  const raceRaw = fieldAfterLabel(html, 'Race');
  const name =
    html.match(/class="ptitles"[^>]*>\s*([^<]+?)\s*<\/strong>/i)?.[1]?.trim() ||
    html.match(/class="ptitles"[^>]*>([^<]+)/i)?.[1]?.trim() ||
    null;
  return {
    name: name || undefined,
    age,
    gender: parseGenderFromBjmRosterHtml(html),
    race: raceRaw || undefined,
  };
}

export function parseBjmSorProfile(html) {
  const name =
    html.match(/property="og:title" content="([^"]+)"/i)?.[1]?.trim() ||
    html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() ||
    undefined;
  const dob =
    fieldAfterStrong(html, 'DOB') ||
    fieldAfterStrong(html, 'Date of Birth') ||
    html.match(/Date of Birth:[\s\S]*?right-cell">([^<]+)/i)?.[1]?.trim();
  let age = null;
  if (dob) {
    const yearMatch = dob.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      age = new Date().getFullYear() - Number(yearMatch[0]);
      if (age < 16 || age > 100) age = null;
    }
  }
  const ageDirect = fieldAfterStrong(html, 'Age');
  if (ageDirect) age = parseAgeFromText(ageDirect) ?? age;

  return {
    name,
    age,
    gender: parseGenderFromBjmSorHtml(html) || guessGenderFromName(name),
    race: fieldAfterStrong(html, 'Race') || undefined,
  };
}

export function parseBjmSorCharge(html) {
  const block = html.match(/class="level_\d+"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const fromLevel = htmlToText(block);
  const additionalInfo = fieldAfterStrong(html, 'Additional Info') || undefined;
  const og = html.match(/property="og:description" content="([^"]+)"/i)?.[1];
  const offense = fromLevel || htmlToText(og) || 'Sex offense';
  return {
    offense: offense.slice(0, 4000),
    additionalInfo: additionalInfo ? additionalInfo.slice(0, 4000) : undefined,
  };
}

export function normalizeOffenseKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
