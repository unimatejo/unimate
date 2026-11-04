// Renders UniMate's built-in sticker pack: original "Yuni" blob character + Jordanian text stickers + a few animated ones.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUT = path.join(__dirname, 'out');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(__dirname, 'node_modules/@fontsource', f)).toString('base64');
const CSS = `
@font-face{font-family:Lalezar;src:url(${font('lalezar/files/lalezar-arabic-400-normal.woff2')});unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:Lalezar;src:url(${font('lalezar/files/lalezar-latin-400-normal.woff2')})}
@font-face{font-family:Cairo;font-weight:900;src:url(${font('cairo/files/cairo-arabic-900-normal.woff2')})}
html,body{margin:0;background:transparent;width:512px;height:512px;overflow:hidden}
.c{width:512px;height:512px;display:flex;align-items:center;justify-content:center;flex-direction:column;position:relative}
.cap{font-family:Lalezar;font-size:64px;line-height:1.05;color:#fff;-webkit-text-stroke:14px #111;paint-order:stroke fill;text-align:center;direction:rtl;max-width:500px}
.cap.sm{font-size:50px}
`;

// ---------- Yuni, the blob ----------
const COLORS = { blue: ['#6E95FF', '#2E5BFF'], pink: ['#FF9BBF', '#F0386B'], green: ['#7CE8B0', '#10A36B'], yellow: ['#FFE07A', '#F5B400'], violet: ['#C3A6FF', '#7C3AED'], orange: ['#FFC27A', '#FF6B2C'], red: ['#FF9A90', '#E5383B'], teal: ['#7FE7EA', '#0891B2'] };
function eyes(k) {
  const L = 170, R = 262, Y = 205;
  const dot = (x) => `<ellipse cx="${x}" cy="${Y}" rx="17" ry="22" fill="#14182B"/><circle cx="${x + 6}" cy="${Y - 8}" r="6" fill="#fff"/>`;
  switch (k) {
    case 'happy': return [L, R].map((x) => `<path d="M${x - 20} ${Y + 6} Q${x} ${Y - 22} ${x + 20} ${Y + 6}" stroke="#14182B" stroke-width="10" fill="none" stroke-linecap="round"/>`).join('');
    case 'closed': return [L, R].map((x) => `<path d="M${x - 20} ${Y} Q${x} ${Y + 16} ${x + 20} ${Y}" stroke="#14182B" stroke-width="9" fill="none" stroke-linecap="round"/>`).join('');
    case 'x': return [L, R].map((x) => `<path d="M${x - 15} ${Y - 15} L${x + 15} ${Y + 15} M${x + 15} ${Y - 15} L${x - 15} ${Y + 15}" stroke="#14182B" stroke-width="10" stroke-linecap="round"/>`).join('');
    case 'heart': return [L, R].map((x) => `<path transform="translate(${x - 22} ${Y - 22}) scale(1.8)" d="M12 21s-7-4.4-9.5-8.6C.6 9.1 2.3 5 6 5c2.1 0 3.3 1.2 4 2.3.7-1.1 1.9-2.3 4-2.3 3.7 0 5.4 4.1 3.5 7.4C19 16.6 12 21 12 21z" fill="#F0386B"/>`).join('');
    case 'wide': return [L, R].map((x) => `<circle cx="${x}" cy="${Y}" r="30" fill="#fff" stroke="#14182B" stroke-width="6"/><circle cx="${x}" cy="${Y + 4}" r="11" fill="#14182B"/>`).join('');
    case 'angry': return [L, R].map((x, i) => `${dot(x)}<path d="M${x - 26} ${Y - (i ? 40 : 26)} L${x + 26} ${Y - (i ? 26 : 40)}" stroke="#14182B" stroke-width="10" stroke-linecap="round"/>`).join('');
    case 'sad': return [L, R].map((x, i) => `${dot(x)}<path d="M${x - 24} ${Y - (i ? 26 : 40)} L${x + 24} ${Y - (i ? 40 : 26)}" stroke="#14182B" stroke-width="8" stroke-linecap="round"/>`).join('');
    case 'cool': return `<path d="M128 182 H304 L296 214 Q290 240 260 240 H244 Q222 240 220 214 L216 200 H216 L212 214 Q210 240 188 240 H172 Q142 240 136 214 Z" fill="#14182B"/><path d="M150 196 L176 196" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".6"/>`;
    case 'wink': return dot(L) + `<path d="M${R - 20} ${Y + 4} Q${R} ${Y - 18} ${R + 20} ${Y + 4}" stroke="#14182B" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    case 'side': return [L, R].map((x) => `<ellipse cx="${x}" cy="${Y}" rx="22" ry="18" fill="#fff" stroke="#14182B" stroke-width="5"/><circle cx="${x + 10}" cy="${Y}" r="8" fill="#14182B"/>`).join('');
    case 'money': return [L, R].map((x) => `<text x="${x}" y="${Y + 16}" font-family="Lalezar" font-size="56" text-anchor="middle" fill="#10A36B" stroke="#14182B" stroke-width="3">$</text>`).join('');
    default: return dot(L) + dot(R);
  }
}
function mouth(k) {
  switch (k) {
    case 'smile': return `<path d="M180 262 Q216 300 252 262" stroke="#14182B" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    case 'laugh': return `<path d="M168 255 Q216 330 264 255 Z" fill="#14182B"/><path d="M190 290 Q216 305 242 290 Q230 312 216 312 Q202 312 190 290Z" fill="#FF6F91"/>`;
    case 'frown': return `<path d="M184 290 Q216 258 248 290" stroke="#14182B" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    case 'o': return `<ellipse cx="216" cy="282" rx="20" ry="26" fill="#14182B"/>`;
    case 'flat': return `<path d="M188 278 H244" stroke="#14182B" stroke-width="10" stroke-linecap="round"/>`;
    case 'tongue': return `<path d="M180 262 Q216 300 252 262" stroke="#14182B" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M222 283 q12 0 12 16 q0 14 -12 14 q-12 0 -12 -14 z" fill="#FF6F91" stroke="#14182B" stroke-width="5"/>`;
    case 'wavy': return `<path d="M178 282 q10 -12 19 0 t19 0 t19 0 t19 0" stroke="#14182B" stroke-width="9" fill="none" stroke-linecap="round"/>`;
    case 'cry': return `<path d="M170 300 Q216 245 262 300 Z" fill="#14182B"/>`;
    case 'kiss': return `<path d="M206 266 q16 4 4 14 q14 6 -4 16" stroke="#14182B" stroke-width="8" fill="none" stroke-linecap="round"/>`;
    case 'grit': return `<rect x="180" y="262" width="72" height="34" rx="10" fill="#fff" stroke="#14182B" stroke-width="7"/><path d="M198 262 V296 M216 262 V296 M234 262 V296" stroke="#14182B" stroke-width="5"/>`;
    default: return '';
  }
}
function extra(k) {
  const tears = `<path d="M150 230 Q140 300 150 360" stroke="#7CC7FF" stroke-width="22" fill="none" stroke-linecap="round" opacity=".9"/><path d="M282 230 Q292 300 282 360" stroke="#7CC7FF" stroke-width="22" fill="none" stroke-linecap="round" opacity=".9"/>`;
  const map = {
    blush: `<ellipse cx="140" cy="250" rx="22" ry="13" fill="#FF7AA2" opacity=".6"/><ellipse cx="292" cy="250" rx="22" ry="13" fill="#FF7AA2" opacity=".6"/>`,
    tears, joy: `<path d="M140 222 q-30 10 -36 40" stroke="#7CC7FF" stroke-width="16" fill="none" stroke-linecap="round"/><path d="M292 222 q30 10 36 40" stroke="#7CC7FF" stroke-width="16" fill="none" stroke-linecap="round"/>`,
    sweat: `<path d="M318 140 q16 26 0 38 q-16 -12 0 -38z" fill="#7CC7FF" stroke="#14182B" stroke-width="4"/>`,
    zzz: `<text x="300" y="120" font-family="Lalezar" font-size="64" fill="#fff" stroke="#14182B" stroke-width="5" paint-order="stroke">Z</text><text x="350" y="76" font-family="Lalezar" font-size="44" fill="#fff" stroke="#14182B" stroke-width="5" paint-order="stroke">z</text>`,
    hearts: [[90, 110, 1], [330, 90, 1.3], [360, 220, .9]].map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s * 2})" d="M12 21s-7-4.4-9.5-8.6C.6 9.1 2.3 5 6 5c2.1 0 3.3 1.2 4 2.3.7-1.1 1.9-2.3 4-2.3 3.7 0 5.4 4.1 3.5 7.4C19 16.6 12 21 12 21z" fill="#F0386B" stroke="#14182B" stroke-width="1.5"/>`).join(''),
    anger: `<path d="M318 120 l16 16 m0 -16 l-16 16 M300 128 h0" stroke="#E5383B" stroke-width="10" stroke-linecap="round"/><g transform="translate(320 120)"><path d="M-22 -6 q10 0 10 -12 M6 -22 q0 10 12 10 M22 6 q-10 0 -10 12 M-6 22 q0 -10 -12 -10" stroke="#E5383B" stroke-width="8" fill="none" stroke-linecap="round"/></g>`,
    party: `<path d="M216 30 L264 120 L168 120 Z" fill="#F5B400" stroke="#14182B" stroke-width="6"/><circle cx="216" cy="28" r="14" fill="#F0386B" stroke="#14182B" stroke-width="5"/><path d="M190 100 l12 -20 M228 100 l12 -20" stroke="#F0386B" stroke-width="7"/>`,
    book: `<path d="M120 330 L216 350 L312 330 L312 400 L216 420 L120 400 Z" fill="#fff" stroke="#14182B" stroke-width="7"/><path d="M216 350 V420" stroke="#14182B" stroke-width="6"/>`,
    coffee: `<rect x="290" y="300" width="70" height="80" rx="12" fill="#fff" stroke="#14182B" stroke-width="7"/><path d="M360 320 q30 0 30 22 q0 22 -30 22" stroke="#14182B" stroke-width="7" fill="none"/><path d="M308 290 q-8 -16 4 -30 M332 290 q-8 -16 4 -30" stroke="#9AA3BF" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    thumbs: `<g transform="translate(310 300) rotate(-12)"><rect x="0" y="30" width="22" height="60" rx="6" fill="#FFD3A6" stroke="#14182B" stroke-width="6"/><path d="M26 34 q0 -36 22 -40 q14 0 10 26 h28 q16 0 12 18 l-10 44 q-4 12 -16 12 h-46 z" fill="#FFD3A6" stroke="#14182B" stroke-width="6"/></g>`,
    wave: `<g transform="translate(320 170) rotate(18)"><circle r="34" fill="#FFD3A6" stroke="#14182B" stroke-width="6"/><path d="M-20 -30 v-30 M-6 -34 v-38 M8 -32 v-34 M22 -26 v-26" stroke="#14182B" stroke-width="12" stroke-linecap="round"/></g><path d="M372 120 q18 10 18 30 M384 96 q30 18 30 50" stroke="#14182B" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    facepalm: `<g transform="translate(150 150) rotate(-20)"><rect x="0" y="0" width="120" height="80" rx="34" fill="#FFD3A6" stroke="#14182B" stroke-width="7"/><path d="M30 0 v-30 M56 0 v-36 M82 0 v-32" stroke="#14182B" stroke-width="12" stroke-linecap="round"/></g>`,
    fire: `<path d="M330 380 q-50 -40 -10 -110 q6 40 30 40 q-10 -50 30 -90 q0 70 30 100 q20 40 -20 60 z" fill="#FF6B2C" stroke="#14182B" stroke-width="6"/><path d="M350 376 q-20 -20 0 -50 q10 20 24 24 q6 20 -24 26z" fill="#FFE07A"/>`,
    sick: `<rect x="160" y="250" width="112" height="70" rx="16" fill="#E9F3FF" stroke="#14182B" stroke-width="6"/><path d="M160 270 L120 250 M272 270 L312 250" stroke="#14182B" stroke-width="6"/>`,
    phone: `<rect x="300" y="280" width="64" height="110" rx="12" fill="#14182B"/><rect x="308" y="292" width="48" height="80" rx="4" fill="#6E95FF"/>`,
    star: `<path transform="translate(320 70) scale(2.6)" d="M12 2l3 7 7 .6-5.3 4.6 1.6 7L12 17.3 5.7 21.2l1.6-7L2 9.6 9 9z" fill="#FFE07A" stroke="#14182B" stroke-width="1.5"/>`,
    question: `<text x="320" y="140" font-family="Lalezar" font-size="110" fill="#FFE07A" stroke="#14182B" stroke-width="7" paint-order="stroke">؟</text>`,
    sparkle: `<path transform="translate(70 100) scale(2)" d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#FFE07A" stroke="#14182B" stroke-width="1.5"/><path transform="translate(340 60) scale(1.4)" d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#FFE07A" stroke="#14182B" stroke-width="1.5"/>`,
  };
  return (k || []).map((x) => map[x] ?? '').join('');
}
function yuni({ color = 'blue', e = 'dot', m = 'smile', x = [], squash = 1, tilt = 0, dy = 0, size = 432 }) {
  const [c1, c2] = COLORS[color];
  return `<svg width="${size}" height="${size}" viewBox="0 0 432 432" style="transform:translateY(${dy}px) rotate(${tilt}deg) scaleY(${squash});transform-origin:50% 90%">
    <defs><radialGradient id="g" cx="35%" cy="25%" r="80%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
    <path d="M216 70 C330 70 380 160 380 250 C380 350 310 400 216 400 C122 400 52 350 52 250 C52 160 102 70 216 70Z" fill="url(#g)" stroke="#14182B" stroke-width="10"/>
    <ellipse cx="160" cy="120" rx="40" ry="20" fill="#fff" opacity=".35" transform="rotate(-25 160 120)"/>
    ${eyes(e)}${mouth(m)}${extra(x)}</svg>`;
}

const CHAR = [
  ['ههههههه', { color: 'yellow', e: 'happy', m: 'laugh', x: ['joy'] }],
  ['مش قادر 😂', { color: 'orange', e: 'closed', m: 'laugh', x: ['joy'], tilt: -8 }],
  ['بكرا امتحان', { color: 'teal', e: 'sad', m: 'cry', x: ['tears'] }],
  ['الله يعين', { color: 'violet', e: 'sad', m: 'wavy', x: ['sweat'] }],
  ['شو هاد؟!', { color: 'red', e: 'wide', m: 'o' }],
  ['ولك لا', { color: 'red', e: 'angry', m: 'grit', x: ['anger'] }],
  ['بحبك يا صاحبي', { color: 'pink', e: 'heart', m: 'smile', x: ['hearts', 'blush'] }],
  ['منور', { color: 'yellow', e: 'happy', m: 'smile', x: ['sparkle', 'blush'] }],
  ['بدي أنام', { color: 'violet', e: 'closed', m: 'flat', x: ['zzz'] }],
  ['تصبحوا على خير', { color: 'blue', e: 'closed', m: 'smile', x: ['zzz', 'blush'] }],
  ['صباح الخير', { color: 'orange', e: 'dot', m: 'smile', x: ['coffee', 'blush'] }],
  ['يلا عالكافتيريا', { color: 'green', e: 'dot', m: 'tongue', x: ['coffee'] }],
  ['على راسي', { color: 'green', e: 'happy', m: 'smile', x: ['thumbs'] }],
  ['تمام التمام', { color: 'blue', e: 'wink', m: 'smile', x: ['thumbs'] }],
  ['مرحبا شباب', { color: 'teal', e: 'dot', m: 'smile', x: ['wave', 'blush'] }],
  ['يا عيب الشوم', { color: 'orange', e: 'closed', m: 'frown', x: ['facepalm'] }],
  ['مش فاهم ولا إشي', { color: 'yellow', e: 'side', m: 'wavy', x: ['question'] }],
  ['عم بدرس', { color: 'blue', e: 'dot', m: 'flat', x: ['book', 'sweat'] }],
  ['نجحت!', { color: 'green', e: 'happy', m: 'laugh', x: ['party', 'sparkle'] }],
  ['رسبت 😂', { color: 'teal', e: 'x', m: 'cry', x: ['tears'] }],
  ['كول', { color: 'violet', e: 'cool', m: 'smile' }],
  ['إنت كبير', { color: 'blue', e: 'cool', m: 'smile', x: ['star'] }],
  ['مبروك', { color: 'pink', e: 'happy', m: 'laugh', x: ['party', 'sparkle'] }],
  ['مريض', { color: 'green', e: 'closed', m: '', x: ['sick', 'sweat'] }],
  ['لا تزعل', { color: 'pink', e: 'sad', m: 'smile', x: ['blush'] }],
  ['زعلان', { color: 'blue', e: 'sad', m: 'frown' }],
  ['هسا بجيك', { color: 'orange', e: 'dot', m: 'o', x: ['sweat', 'phone'] }],
  ['فلوس؟', { color: 'green', e: 'money', m: 'tongue' }],
  ['عنجد؟', { color: 'yellow', e: 'wide', m: 'flat' }],
  ['🔥🔥', { color: 'red', e: 'cool', m: 'smile', x: ['fire'] }],
  ['بوسة', { color: 'pink', e: 'closed', m: 'kiss', x: ['hearts'] }],
  ['جوعان', { color: 'orange', e: 'sad', m: 'o', x: ['sweat'] }],
  ['شكراً', { color: 'teal', e: 'happy', m: 'smile', x: ['blush', 'hearts'] }],
  ['آسف', { color: 'violet', e: 'sad', m: 'wavy', x: ['blush'] }],
  ['', { color: 'yellow', e: 'happy', m: 'laugh', x: ['joy'] }],
  ['', { color: 'blue', e: 'heart', m: 'smile', x: ['hearts'] }],
  ['', { color: 'red', e: 'angry', m: 'grit', x: ['anger'] }],
  ['', { color: 'green', e: 'wink', m: 'tongue' }],
  ['', { color: 'violet', e: 'closed', m: 'flat', x: ['zzz'] }],
  ['', { color: 'teal', e: 'sad', m: 'cry', x: ['tears'] }],
];

// ---------- Jordanian text stickers ----------
const TEXT = [
  'خد ليرة واسكت', 'خد دينار واسكت', 'يا زلمة', 'ولك شو هاد', 'الدكتور غايب؟', 'مين حاضر؟', 'فاتتني المحاضرة', 'دحيت', 'تكرم عينك', 'حبيبي والله',
  'صلّي عالنبي', 'شو الوضع؟', 'طالع من البيت', 'خلص ولا يهمك', 'إشي بموت ضحك', 'ماشي الحال', 'إن شاء الله', 'الحمدلله', 'يا جماعة الخير', 'ما في دوام؟',
  'الغيابات خلصت', 'سلّمت المشروع؟', 'وين الملخص؟', 'يا رب نجاح', 'اشي بجنن', 'بطّل', 'طوّل بالك', 'مش وقتك', 'يلا نروح', 'هيك الحياة',
  'والله ما بعرف', 'ابصر', 'ع راسي والله', 'صحتين وعافية', 'وصلت؟', 'يسلمو', 'غالي والطلب رخيص', 'نام بكير', 'خلّيها على الله', 'شو بدك أحكيلك',
  'كمّل كمّل', 'مش مصدق', 'بتمزح؟', 'القهوة علي', 'يا حرام', 'منّور الجروب', 'أهلين', 'خلصنا', 'ولا كلمة', 'نايم؟',
];
const STYLES = [
  (s) => `<div class="cap" style="font-size:${s.length > 11 ? 92 : 124}px;color:#FFE07A;transform:rotate(-6deg)">${s}</div>`,
  (s) => `<div style="background:#fff;border:9px solid #111;border-radius:60px;padding:26px 36px;max-width:430px;transform:rotate(3deg);box-shadow:10px 12px 0 #111"><div style="font-family:Lalezar;font-size:${s.length > 11 ? 74 : 100}px;line-height:1.1;color:#111;direction:rtl;text-align:center">${s}</div></div><div style="width:0;height:0;border-left:30px solid transparent;border-right:30px solid transparent;border-top:44px solid #111;margin-top:-4px;transform:translate(90px,-6px) rotate(18deg)"></div>`,
  (s) => `<div style="background:linear-gradient(135deg,#6E95FF,#7C3AED);border:9px solid #111;border-radius:40px;padding:24px 34px;max-width:440px;transform:rotate(-4deg)"><div class="cap" style="font-size:${s.length > 11 ? 74 : 98}px;-webkit-text-stroke:10px #111">${s}</div></div>`,
  (s) => `<div class="cap" style="font-size:${s.length > 11 ? 92 : 124}px;color:#FF6F91;transform:rotate(5deg)">${s}</div>`,
  (s) => `<div style="background:#FFE07A;border:9px solid #111;border-radius:24px;padding:22px 30px;max-width:440px;transform:rotate(-3deg);box-shadow:-10px 12px 0 #F0386B"><div style="font-family:Lalezar;font-size:${s.length > 11 ? 74 : 98}px;line-height:1.1;color:#111;direction:rtl;text-align:center">${s}</div></div>`,
  (s) => `<div class="cap" style="font-size:${s.length > 11 ? 92 : 124}px;color:#7CE8B0;transform:rotate(-3deg)">${s}</div>`,
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  const manifest = [];
  const shot = async (html, name, tags) => {
    await p.setContent(`<html><head><style>${CSS}</style></head><body><div class="c">${html}</div></body></html>`);
    await p.evaluate(() => document.fonts.ready);
    const png = path.join(OUT, name + '.png');
    await p.screenshot({ path: png, omitBackground: true });
    execSync(`ffmpeg -y -loglevel error -i ${png} -c:v libwebp -lossless 0 -q:v 85 ${path.join(OUT, name + '.webp')}`);
    fs.unlinkSync(png);
    manifest.push({ file: name + '.webp', tags, animated: false });
  };
  let i = 0;
  for (const [cap, o] of CHAR) {
    await shot(`${yuni({ ...o, size: cap ? 360 : 460 })}${cap ? `<div class="cap" style="font-size:${cap.length > 9 ? 54 : 70}px;margin-top:-26px">${cap}</div>` : ''}`, `yuni-${String(++i).padStart(2, '0')}`, cap || 'يوني');
  }
  i = 0;
  for (const [k, s] of TEXT.entries()) await shot(STYLES[k % STYLES.length](s), `txt-${String(++i).padStart(2, '0')}`, s);

  // ---------- animated (12 frames, looping) ----------
  const ANIM = [
    ['laugh', (f) => `${yuni({ color: 'yellow', e: 'happy', m: 'laugh', x: ['joy'], tilt: Math.sin(f / 12 * Math.PI * 2) * 10, dy: -Math.abs(Math.sin(f / 12 * Math.PI * 2)) * 18 })}`, 'ههههه متحرك'],
    ['heart', (f) => `<div style="transform:scale(${1 + Math.abs(Math.sin(f / 12 * Math.PI * 2)) * 0.22})">${yuni({ color: 'pink', e: 'heart', m: 'smile', x: ['hearts', 'blush'] })}</div>`, 'قلب متحرك'],
    ['wave', (f) => `${yuni({ color: 'teal', e: 'dot', m: 'smile', x: ['wave', 'blush'], tilt: Math.sin(f / 12 * Math.PI * 2) * 7, size: 370 })}<div class="cap" style="margin-top:-26px">مرحبا</div>`, 'مرحبا متحرك'],
    ['cry', (f) => `<div style="transform:translateX(${Math.sin(f / 12 * Math.PI * 4) * 6}px)">${yuni({ color: 'teal', e: 'sad', m: 'cry', x: ['tears'], size: 370 })}</div><div class="cap" style="margin-top:-26px">يا حرام</div>`, 'بكي متحرك'],
    ['angry', (f) => `<div style="transform:translate(${Math.sin(f / 12 * Math.PI * 6) * 8}px,0)">${yuni({ color: 'red', e: 'angry', m: 'grit', x: ['anger'] })}</div>`, 'معصب متحرك'],
    ['sleep', (f) => `<div style="transform:scaleY(${1 - Math.abs(Math.sin(f / 12 * Math.PI * 2)) * 0.05});transform-origin:50% 90%">${yuni({ color: 'violet', e: 'closed', m: 'flat', x: ['zzz'] })}</div>`, 'نايم متحرك'],
    ['yalla', (f) => `<div class="cap" style="font-size:170px;color:#FFE07A;transform:translateY(${-Math.abs(Math.sin(f / 12 * Math.PI * 2)) * 30}px) rotate(${Math.sin(f / 12 * Math.PI * 2) * 6}deg)">يلا!</div>`, 'يلا متحرك'],
    ['haha', (f) => `<div class="cap" style="font-size:118px;color:#FF6F91;transform:rotate(${Math.sin(f / 12 * Math.PI * 4) * 8}deg) scale(${1 + Math.abs(Math.sin(f / 12 * Math.PI * 2)) * 0.12})">ههههههه</div>`, 'ضحك متحرك'],
    ['party', (f) => `<div style="transform:rotate(${Math.sin(f / 12 * Math.PI * 2) * 12}deg)">${yuni({ color: 'green', e: 'happy', m: 'laugh', x: ['party', 'sparkle'], size: 370 })}</div><div class="cap" style="margin-top:-26px">مبروك!</div>`, 'مبروك متحرك'],
    ['fire', (f) => `<div style="transform:scale(${1 + Math.sin(f / 12 * Math.PI * 2) * 0.06})">${yuni({ color: 'red', e: 'cool', m: 'smile', x: ['fire'] })}</div>`, 'نار متحرك'],
  ];
  for (const [name, fn, tag] of ANIM) {
    const dir = path.join(OUT, 'f-' + name); fs.mkdirSync(dir);
    for (let f = 0; f < 12; f++) {
      await p.setContent(`<html><head><style>${CSS}</style></head><body><div class="c">${fn(f)}</div></body></html>`);
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: path.join(dir, `${String(f).padStart(2, '0')}.png`), omitBackground: true });
    }
    execSync(`ffmpeg -y -loglevel error -framerate 12 -i ${dir}/%02d.png -vf scale=384:384 -c:v libwebp_anim -loop 0 -lossless 0 -q:v 70 -pix_fmt yuva420p ${path.join(OUT, 'anim-' + name + '.webp')}`);
    fs.rmSync(dir, { recursive: true });
    manifest.push({ file: 'anim-' + name + '.webp', tags: tag, animated: true });
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log('made', manifest.length);
  await b.close();
})();
