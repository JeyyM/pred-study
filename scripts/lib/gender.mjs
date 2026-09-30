/** Parse gender from sheriff HTML and infer from first names (Iowa). */

export function normalizeGender(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (v === 'm' || v === 'male') return 'male';
  if (v === 'f' || v === 'female') return 'female';
  return null;
}

export function parseGenderFromBjmRosterHtml(html) {
  const m =
    html.match(/Gender:[\s\S]*?inmate_profile_data_content">\s*([^<]+)/i) ||
    html.match(/Gender:<\/span><\/div>\s*<div class="cell inmate_profile_data_content">([^<]+)/i);
  return normalizeGender(m?.[1]);
}

export function parseGenderFromBjmSorHtml(html) {
  const m = html.match(/<strong>Gender:<\/strong><\/div>\s*<div class="right-cell">([^<]+)/i);
  return normalizeGender(m?.[1]);
}

const FEMALE_FIRST = new Set([
  'irene', 'mary', 'maria', 'linda', 'patricia', 'jennifer', 'elizabeth', 'barbara', 'susan',
  'jessica', 'sarah', 'karen', 'nancy', 'lisa', 'betty', 'helen', 'sandra', 'donna', 'carol',
  'ruth', 'sharon', 'michelle', 'laura', 'emily', 'kimberly', 'deborah', 'dorothy', 'amy',
  'angela', 'ashley', 'brenda', 'emma', 'olivia', 'sophia', 'isabella', 'ava', 'mia', 'charlotte',
  'amanda', 'melissa', 'stephanie', 'rebecca', 'cynthia', 'kathleen', 'pamela', 'janet', 'diane',
  'christina', 'heather', 'teresa', 'gloria', 'joyce', 'virginia', 'victoria', 'kelly', 'lauren',
  'nicole', 'samantha', 'rachel', 'catherine', 'ann', 'anne', 'anna', 'alice', 'julia', 'judy',
  'marie', 'janice', 'frances', 'jean', 'cheryl', 'megan', 'andrea', 'kathryn', 'jacqueline',
  'denise', 'tammy', 'holly', 'tiffany', 'brittany', 'danielle', 'monica', 'tracy', 'stacy',
]);

const MALE_FIRST = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
  'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan',
  'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
  'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander', 'patrick', 'jack', 'dennis',
  'jerry', 'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'douglas', 'zachary', 'peter',
  'kyle', 'noah', 'ethan', 'jeremy', 'walter', 'christian', 'keith', 'roger', 'terry', 'austin',
  'sean', 'gerald', 'carl', 'harold', 'dylan', 'arthur', 'lawrence', 'jordan', 'jesse', 'bryan',
  'billy', 'bruce', 'gabriel', 'joe', 'logan', 'albert', 'willie', 'alan', 'eugene', 'russell',
  'vincent', 'philip', 'bobby', 'johnny', 'bradley', 'roy', 'ralph', 'randy', 'howard', 'fred',
  'craig', 'stanley', 'leonard', 'derek', 'marcus', 'theodore', 'clarence', 'sean', 'martin',
]);

export function guessGenderFromName(fullName) {
  if (!fullName) return null;
  const parts = fullName.replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const first = parts.length > 1 && parts[0] === parts[0].toUpperCase() ? parts[1] : parts[0];
  const key = first.toLowerCase();
  if (FEMALE_FIRST.has(key)) return 'female';
  if (MALE_FIRST.has(key)) return 'male';
  return null;
}
