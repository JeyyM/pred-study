const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const r = await fetch('https://www.waltonso.org/inmate-roster', { headers: { 'User-Agent': UA } });
const t = await r.text();
console.log('status', r.status);
for (const m of t.matchAll(/<img[^>]+src="([^"]+)"/gi)) {
  if (/mug|inmate|photo|jail/i.test(m[1])) console.log(m[1].slice(0, 120));
}
