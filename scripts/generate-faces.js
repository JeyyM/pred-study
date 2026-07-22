const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'images');
fs.mkdirSync(outDir, { recursive: true });

const palettes = [
  { skin: '#c4b5a8', hair: '#2a2520', shirt: '#5a5a5a' },
  { skin: '#a8927e', hair: '#1a1410', shirt: '#4a4a4a' },
  { skin: '#d4c4b0', hair: '#4a3828', shirt: '#6a6a6a' },
  { skin: '#8f7760', hair: '#0f0f0f', shirt: '#555555' },
  { skin: '#bfa690', hair: '#6b4e37', shirt: '#505050' },
  { skin: '#cdb9a5', hair: '#302820', shirt: '#626262' },
  { skin: '#9e846c', hair: '#252018', shirt: '#585858' },
  { skin: '#dccab8', hair: '#584030', shirt: '#666666' },
  { skin: '#b09a84', hair: '#181410', shirt: '#525252' },
  { skin: '#e0d0c0', hair: '#3a3028', shirt: '#707070' },
];

const shapes = [
  { jaw: 72, cheek: 58, brow: -8, nose: 18, mouth: 6, ear: 12 },
  { jaw: 68, cheek: 62, brow: -4, nose: 22, mouth: 4, ear: 10 },
  { jaw: 76, cheek: 54, brow: -12, nose: 16, mouth: 8, ear: 14 },
  { jaw: 70, cheek: 60, brow: -6, nose: 20, mouth: 5, ear: 11 },
  { jaw: 74, cheek: 56, brow: -10, nose: 19, mouth: 7, ear: 13 },
];

function faceSvg(index) {
  const p = palettes[index % palettes.length];
  const s = shapes[index % shapes.length];
  const hairStyle = index % 4;
  const hasBeard = index % 5 === 0;
  const hasGlasses = index % 7 === 2;
  const id = String(index + 1).padStart(2, '0');

  let hairPath = '';
  if (hairStyle === 0) {
    hairPath = `<ellipse cx="100" cy="58" rx="52" ry="38" fill="${p.hair}"/>`;
  } else if (hairStyle === 1) {
    hairPath = `<path d="M48 72 Q100 10 152 72 L152 95 Q100 55 48 95 Z" fill="${p.hair}"/>`;
  } else if (hairStyle === 2) {
    hairPath = `<rect x="46" y="42" width="108" height="36" rx="18" fill="${p.hair}"/><rect x="46" y="58" width="18" height="50" fill="${p.hair}"/><rect x="136" y="58" width="18" height="50" fill="${p.hair}"/>`;
  } else {
    hairPath = `<ellipse cx="100" cy="52" rx="48" ry="30" fill="${p.hair}"/><rect x="52" y="52" width="96" height="24" fill="${p.hair}"/>`;
  }

  const beard = hasBeard
    ? `<path d="M72 ${130 + s.mouth} Q100 ${155 + s.mouth} 128 ${130 + s.mouth} L128 148 Q100 168 72 148 Z" fill="${p.hair}" opacity="0.85"/>`
    : '';

  const glasses = hasGlasses
    ? `<rect x="58" y="92" width="34" height="22" rx="4" fill="none" stroke="#333" stroke-width="2"/><rect x="108" y="92" width="34" height="22" rx="4" fill="none" stroke="#333" stroke-width="2"/><line x1="92" y1="103" x2="108" y2="103" stroke="#333" stroke-width="2"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260">
  <rect width="200" height="260" fill="#e8e8e8"/>
  <rect x="8" y="8" width="184" height="244" fill="#f5f5f5" stroke="#bbb" stroke-width="2"/>
  <text x="100" y="24" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#888">BOOKING PHOTO</text>
  <rect x="30" y="200" width="140" height="36" fill="${p.shirt}"/>
  ${hairPath}
  <ellipse cx="100" cy="115" rx="${s.jaw}" ry="88" fill="${p.skin}"/>
  <ellipse cx="42" cy="115" rx="${s.ear}" ry="18" fill="${p.skin}"/>
  <ellipse cx="158" cy="115" rx="${s.ear}" ry="18" fill="${p.skin}"/>
  <ellipse cx="72" cy="108" rx="10" ry="6" fill="#fff" opacity="0.15"/>
  <ellipse cx="128" cy="108" rx="10" ry="6" fill="#fff" opacity="0.15"/>
  <ellipse cx="72" cy="110" rx="5" ry="5" fill="#2a2520"/>
  <ellipse cx="128" cy="110" rx="5" ry="5" fill="#2a2520"/>
  ${glasses}
  <path d="M58 ${98 + s.brow} Q72 ${90 + s.brow} 86 ${98 + s.brow}" fill="none" stroke="#3a3530" stroke-width="2" stroke-linecap="round"/>
  <path d="M114 ${98 + s.brow} Q128 ${90 + s.brow} 142 ${98 + s.brow}" fill="none" stroke="#3a3530" stroke-width="2" stroke-linecap="round"/>
  <path d="M100 ${108 + s.nose} L100 ${128 + s.nose}" stroke="#9a8878" stroke-width="3" stroke-linecap="round"/>
  <path d="M88 ${128 + s.nose} Q100 ${136 + s.nose} 112 ${128 + s.nose}" fill="none" stroke="#8a7868" stroke-width="2"/>
  <path d="M82 ${142 + s.mouth} Q100 ${150 + s.mouth} 118 ${142 + s.mouth}" fill="none" stroke="#6a5850" stroke-width="2" stroke-linecap="round"/>
  ${beard}
  <text x="168" y="248" text-anchor="end" font-family="Arial,sans-serif" font-size="28" fill="#aaa" opacity="0.5">${id}</text>
</svg>`;
}

for (let i = 0; i < 20; i++) {
  fs.writeFileSync(path.join(outDir, `face-${String(i + 1).padStart(2, '0')}.svg`), faceSvg(i));
}

console.log('Generated 20 mugshot placeholders in images/');
