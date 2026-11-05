import re, html
src = open('app/src/app/settings/legal.tsx', encoding='utf-8').read()
def secs(name):
    block = src[src.index(f'const {name}: Sec[] = ['):]
    block = block[:block.index('];')]
    return re.findall(r"\[t\('(.*?)'\), t\('(.*?)'\)\]", block)
PRIVACY, TERMS = secs('PRIVACY'), secs('TERMS')
EN_SRC = open('app/src/lib/i18n.en.ts', encoding='utf-8').read()
def en(ar):
    m = re.search(r'"' + re.escape(ar) + r'":\s*"((?:[^"\\]|\\.)*)"', EN_SRC)
    return m.group(1).replace('\\"', '"') if m else ar
PRIVACY_EN = [(en(a), en(b)) for a, b in PRIVACY]
TERMS_EN = [(en(a), en(b)) for a, b in TERMS]

CSS = """
:root{--bg:#F5F6FA;--card:#FFFFFF;--ink:#0E1430;--ink2:#3B4466;--muted:#6B7391;--line:#E4E7F0;--primary:#2E5BFF;--pink:#FF5470;--violet:#7C4DFF;--soft:#EEF2FF}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#111318;--ink:#F4F5F8;--ink2:#C9CDDB;--muted:#8D93A8;--line:#23262F;--primary:#4D74FF;--soft:#141B33}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.8 'Rubik',system-ui,sans-serif}
a{color:var(--primary)}a:focus-visible,button:focus-visible{outline:3px solid var(--primary);outline-offset:3px;border-radius:8px}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
nav{display:flex;align-items:center;gap:12px;padding:18px 0}
nav .brand{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--ink);font:700 18px 'Alexandria',sans-serif;margin-inline-end:auto;white-space:nowrap}
@media (max-width:420px){nav{gap:10px}nav .brand{font-size:15px}nav a.l{font-size:13px}}
nav .brand img{width:38px;height:38px;border-radius:11px}
nav a.l{color:var(--muted);text-decoration:none;font-size:15px}
h1,h2,h3{font-family:'Alexandria',sans-serif;line-height:1.35;margin:0}
.hero{padding:56px 0 30px}
.hero h1{font-size:clamp(34px,7vw,56px);letter-spacing:-.5px}
.hero h1 span{background:linear-gradient(90deg,#FFB547,#FF4F7B 45%,#7C3AED);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{color:var(--ink2);font-size:19px;max-width:560px;margin:18px 0 28px}
.cta{display:inline-flex;align-items:center;gap:10px;background:var(--ink);color:var(--bg);text-decoration:none;font-weight:600;padding:14px 22px;border-radius:16px}
.cta small{opacity:.7;font-weight:400}
.feat{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;padding:26px 0 40px}
.feat div{background:var(--card);border-radius:22px;padding:18px}
.feat b{display:block;font-family:'Alexandria',sans-serif;margin-bottom:4px}
.feat p{margin:0;color:var(--muted);font-size:15px;line-height:1.7}
.doc{padding:20px 0 50px}.doc h1{font-size:32px}.doc .date{color:var(--muted);margin:6px 0 26px}
.doc section{background:var(--card);border-radius:20px;padding:18px 20px;margin-bottom:10px}
.doc h2{font-size:18px;margin-bottom:6px}.doc p{margin:0;color:var(--ink2)}
footer{border-top:1px solid var(--line);padding:22px 0 40px;color:var(--muted);font-size:14px;display:flex;flex-wrap:wrap;gap:16px}
footer a{color:var(--muted)}
"""
def page(path, title, body, desc, lang='ar'):
    L = lang == 'en'
    pre = '/en' if L else ''
    other = ('/' + path.removeprefix('en').strip('/') + '/').replace('//', '/') if L else '/en/' + (path + '/' if path else '')
    doc = f"""<!doctype html><html lang="{lang}" dir="{'ltr' if L else 'rtl'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><meta name="description" content="{desc}"><meta name="theme-color" content="#2E5BFF">
<link rel="icon" href="/favicon.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}"><meta property="og:image" content="https://unimate.my/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@600;700&family=Rubik:wght@400;500;600&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><div class="wrap">
<nav><a class="brand" href="{pre}/"><img src="/logo.png" alt="">UniMate | يونيميت</a><a class="l" href="{pre}/privacy/">{'Privacy' if L else 'الخصوصية'}</a><a class="l" href="{pre}/support/">{'Support' if L else 'الدعم'}</a><a class="l" href="{other}" hreflang="{'ar' if L else 'en'}">{'عربي' if L else 'English'}</a></nav>
{body}
<footer><span>© 2026 UniMate | يونيميت</span><a href="{pre}/privacy/">{'Privacy policy' if L else 'سياسة الخصوصية'}</a><a href="{pre}/terms/">{'Terms of use' if L else 'شروط الاستخدام'}</a><a href="{pre}/support/">{'Support' if L else 'الدعم'}</a><a href="{pre}/delete-account/">{'Delete account' if L else 'حذف الحساب'}</a></footer>
</div></body></html>"""
    import os; os.makedirs(path, exist_ok=True) if path else None
    doc = doc.replace('<link rel="icon"', f'<link rel="alternate" hreflang="en" href="https://unimate.my/en/{path.removeprefix("en").strip("/") + "/" if path.removeprefix("en").strip("/") else ""}"><link rel="alternate" hreflang="ar" href="https://unimate.my/{path.removeprefix("en").strip("/") + "/" if path.removeprefix("en").strip("/") else ""}"><link rel="icon"', 1)
    open((path + '/' if path else '') + 'index.html', 'w', encoding='utf-8').write(doc)

def docpage(path, title, items, lang='ar'):
    s = ''.join(f'<section><h2>{html.escape(a)}</h2><p>{html.escape(b)}</p></section>' for a, b in items)
    if lang == 'en':
        page(path, f'{title} · UniMate', f'<main class="doc"><h1>{title}</h1><p class="date">Last updated: 5 November 2026</p>{s}</main>', f'UniMate {title.lower()}', 'en')
    else:
        page(path, f'{title} · يونيميت', f'<main class="doc"><h1>{title}</h1><p class="date">آخر تحديث: 5 تشرين الثاني 2026</p>{s}</main>', f'{title} لتطبيق يونيميت')

page('', 'يونيميت · جامعتك كلها بتطبيق واحد', """<main><div class="hero"><h1>جامعتك كلها<br><span>بتطبيق واحد</span></h1>
<p>جدولك بيرتّب حاله، زملاؤك بشعبتك ودفعتك، ملخصات وسوق ومفقودات، ورسائل وستوري. لطلاب الجامعات الأردنية بإيميل الجامعة.</p>
<a class="cta" href="https://app.unimate.my">جرّبه من المتصفح <small>· app.unimate.my</small></a></div>
<div class="feat">
<div><b>جدولك جاهز</b><p>جيب موادك من Teams بكبسة، وأوقات المحاضرات اللي بيضيفها أي زميل بشعبتك بتطلع للكل.</p></div>
<div><b>تذكير قبل كل محاضرة</b><p>تنبيه قبل المحاضرة والامتحان، وملخص يومك الجاي كل ليلة.</p></div>
<div><b>مجتمع جامعتك</b><p>منشورات، ملخصات، سوق، مفقودات، وفعاليات. جامعتك وكليتك واللي بتتابعهم.</p></div>
<div><b>رسائل وجروبات تلقائية</b><p>جروب لكليتك وتخصصك ودفعتك بينضاف لحاله، وطلبات الرسائل مثل إنستغرام.</p></div>
<div><b>خريطة الحرم</b><p>المباني والقاعات، وكيف توصل لمحاضرتك.</p></div>
<div><b>خصوصيتك بإيدك</b><p>حساب خاص، مقربين، كلمات مخفية، حظر وبلاغ سري.</p></div>
</div></main>""", 'يونيميت: جدولك وزملاؤك ومجتمع جامعتك بتطبيق واحد، لطلاب الجامعات الأردنية.')
docpage('privacy', 'سياسة الخصوصية', PRIVACY)
docpage('terms', 'شروط الاستخدام', TERMS)
docpage('support', 'الدعم والمساعدة', [
 ('من جوا التطبيق', 'افتح الإعدادات ثم «الدعم والمساعدة»، اختار الموضوع واكتب مشكلتك. بنرد عليك بنفس الصفحة بأسرع وقت.'),
 ('ما بتقدر تدخل؟', 'تأكد إنك بتستخدم إيميل جامعتك الرسمي. إذا جامعتك مش مدعومة لهلأ، بتطلعلك رسالة بالتطبيق وبنضيفها قريباً.'),
 ('بلاغ عن شخص أو محتوى', 'اكبس على «⋯» أو «إبلاغ» على المنشور أو البروفايل أو الرسالة. البلاغ سري وما حدا بيعرف إنك بلّغت.'),
 ('الإيميل', 'shannik@unimate.my'),
])
page('download', 'نزّل يونيميت · أندرويد وآيفون', """<main><div class="hero"><h1>نزّل <span>يونيميت</span></h1>
<p>نفس الحساب على كل الأجهزة. التطبيق بيتحدث لحاله، ما بتحتاج تنزّله مرة ثانية.</p></div>
<div class="feat">
<div><b>أندرويد</b><p>نزّل الملف وافتحه. أول مرة بيطلب منك التلفون «السماح بالتثبيت من هذا المصدر»، اسمحله وكمّل.</p>
<p><a class="cta" href="/download/UniMate.apk" download>نزّل للأندرويد (APK)</a></p></div>
<div><b>آيفون</b><p>افتح <a href="https://app.unimate.my">app.unimate.my</a> من <b>سفاري</b>، اكبس زر المشاركة <b>⬆︎</b> تحت، واختار <b>«إضافة إلى الشاشة الرئيسية»</b>. بتصير أيقونة يونيميت عندك زي أي تطبيق، ودايماً محدثة.</p>
<p><a class="cta" href="https://app.unimate.my">افتح يونيميت للآيفون</a></p></div>
<div><b>ما بيفتح من الواتساب؟</b><p>إذا فتحت الرابط من جوا الواتساب أو الإنستغرام، اكبس ⋯ واختار «فتح بالمتصفح» (سفاري أو كروم)، عشان تسجيل الدخول بمايكروسوفت يكمل.</p></div>
</div></main>""", 'نزّل تطبيق يونيميت للأندرويد، أو استخدمه على الآيفون من سفاري.')
docpage('delete-account', 'حذف الحساب', [
 ('من التطبيق', 'الإعدادات ← حذف الحساب ← تأكيد. بينحذف حسابك مع منشوراتك وتعليقاتك وستوريّاتك وصورك بعد 30 يوم. إذا سجلت دخول قبلها، بيرجع كل إشي زي ما هو.'),
 ('شو بيضل', 'الرسائل اللي بعتها بمحادثات مع ناس تانيين بتضل عندهم بدون اسمك. البلاغات المفتوحة بتنحفظ لحد ما تخلص مراجعتها.'),
 ('ما بتقدر تفتح التطبيق؟', 'ابعتلنا على shannik@unimate.my من إيميلك الجامعي، وبنحذفه عنك بعد ما نتأكد إنه حسابك.'),
])
page('en', 'UniMate · Your whole university in one app', """<main><div class="hero" dir="ltr"><h1>Your whole university<br><span>in one app</span></h1>
<p>A schedule that fills itself in, classmates from your section and year, summaries, a student market, lost and found, messages and stories. For Jordanian university students with a university email.</p>
<a class="cta" href="https://app.unimate.my">Try it on the web <small>· app.unimate.my</small></a></div>
<div class="feat">
<div><b>Your schedule, ready</b><p>Bring your courses from Teams in one tap. Lecture times added by any classmate in your section show up for everyone.</p></div>
<div><b>A reminder before every lecture</b><p>Alerts before lectures and exams, and a summary of tomorrow every night.</p></div>
<div><b>Your campus community</b><p>Posts, summaries, market, lost and found and events, for your university, your college and the people you follow.</p></div>
<div><b>Messages and automatic groups</b><p>A group for your college, major and year joins you automatically. Message requests work like Instagram.</p></div>
<div><b>Campus map</b><p>Buildings and rooms, and how to get to your lecture.</p></div>
<div><b>Your privacy, your call</b><p>Private account, close friends, hidden words, blocking and confidential reports.</p></div>
</div></main>""", 'UniMate: your schedule, classmates and campus community in one app, for Jordanian university students.', 'en')
docpage('en/privacy', 'Privacy policy', PRIVACY_EN, 'en')
docpage('en/terms', 'Terms of use', TERMS_EN, 'en')
docpage('en/support', 'Help and support', [
 ('In the app', 'Open Settings, then Help and support, choose a topic and describe the problem. We reply on the same page as soon as we can.'),
 ('Can\'t sign in?', 'Make sure you use your official university email. If your university isn\'t supported yet, the app tells you and we add it soon.'),
 ('Report a person or content', 'Tap ⋯ or Report on the post, profile or message. Reports are confidential.'),
 ('Email', 'shannik@unimate.my'),
], 'en')
docpage('en/delete-account', 'Delete your account', [
 ('In the app', 'Settings → Delete account → Confirm. Your account is deleted right away, with your posts, comments, stories and photos.'),
 ('What stays', 'Messages you sent in conversations with other people stay with them, without your name. Open reports are kept until they are reviewed.'),
 ('Can\'t open the app?', 'Email shannik@unimate.my from your university address and we will delete it after confirming it is yours.'),
], 'en')
open('robots.txt','w').write('User-agent: *\nAllow: /\nSitemap: https://unimate.my/sitemap.xml\n')
open('sitemap.xml','w').write('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(f'<url><loc>https://unimate.my/{p}</loc></url>' for p in ['', 'privacy/', 'terms/', 'support/', 'delete-account/', 'en/', 'en/privacy/', 'en/terms/', 'en/support/', 'en/delete-account/']) + '</urlset>')
open('.htaccess','w').write('RewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]\nRewriteCond %{HTTP_HOST} ^www\\.(.*)$ [NC]\nRewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]\n\nAddType application/vnd.android.package-archive .apk\n')
