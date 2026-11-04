import re, html
src = open('app/src/app/settings/legal.tsx', encoding='utf-8').read()
def secs(name):
    block = src[src.index(f'const {name}: Sec[] = ['):]
    block = block[:block.index('];')]
    return re.findall(r"\[t\('(.*?)'\), t\('(.*?)'\)\]", block)
PRIVACY, TERMS = secs('PRIVACY'), secs('TERMS')

CSS = """
:root{--bg:#F5F6FA;--card:#FFFFFF;--ink:#0E1430;--ink2:#3B4466;--muted:#6B7391;--line:#E4E7F0;--primary:#2E5BFF;--pink:#FF5470;--violet:#7C4DFF;--soft:#EEF2FF}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#111318;--ink:#F4F5F8;--ink2:#C9CDDB;--muted:#8D93A8;--line:#23262F;--primary:#4D74FF;--soft:#141B33}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.8 'Rubik',system-ui,sans-serif}
a{color:var(--primary)}a:focus-visible,button:focus-visible{outline:3px solid var(--primary);outline-offset:3px;border-radius:8px}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
nav{display:flex;align-items:center;gap:12px;padding:18px 0}
nav .brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font:700 20px 'Alexandria',sans-serif;margin-inline-end:auto}
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
def page(path, title, body, desc):
    doc = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><meta name="description" content="{desc}"><meta name="theme-color" content="#2E5BFF">
<link rel="icon" href="/favicon.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:title" content="{title}"><meta property="og:description" content="{desc}"><meta property="og:image" content="https://unimate.my/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@600;700&family=Rubik:wght@400;500;600&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><div class="wrap">
<nav><a class="brand" href="/"><img src="/logo.png" alt="">يونيميت</a><a class="l" href="/privacy/">الخصوصية</a><a class="l" href="/support/">الدعم</a></nav>
{body}
<footer><span>© 2026 يونيميت</span><a href="/privacy/">سياسة الخصوصية</a><a href="/terms/">شروط الاستخدام</a><a href="/support/">الدعم</a><a href="/delete-account/">حذف الحساب</a></footer>
</div></body></html>"""
    import os; os.makedirs(path, exist_ok=True) if path else None
    open((path + '/' if path else '') + 'index.html', 'w', encoding='utf-8').write(doc)

def docpage(path, title, items):
    s = ''.join(f'<section><h2>{html.escape(a)}</h2><p>{html.escape(b)}</p></section>' for a, b in items)
    page(path, f'{title} · يونيميت', f'<main class="doc"><h1>{title}</h1><p class="date">آخر تحديث: تشرين الثاني 2026</p>{s}</main>', f'{title} لتطبيق يونيميت')

page('', 'يونيميت · جامعتك كلها بتطبيق واحد', """<main><div class="hero"><h1>جامعتك كلها<br><span>بتطبيق واحد</span></h1>
<p>جدولك بيرتّب حاله، زملاؤك بشعبتك ودفعتك، ملخصات وسوق ومفقودات، ورسائل وستوري. لطلاب الجامعات الأردنية بإيميل الجامعة.</p>
<a class="cta" href="/support/">قريباً على App Store <small>· تابعنا</small></a></div>
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
])
docpage('delete-account', 'حذف الحساب', [
 ('من التطبيق', 'الإعدادات ← حذف الحساب ← تأكيد. بينحذف حسابك فوراً مع منشوراتك وتعليقاتك وستوريّاتك وصورك.'),
 ('شو بيضل', 'الرسائل اللي بعتها بمحادثات مع ناس تانيين بتضل عندهم بدون اسمك. البلاغات المفتوحة بتنحفظ لحد ما تخلص مراجعتها.'),
 ('ما بتقدر تفتح التطبيق؟', 'ابعتلنا من صفحة الدعم داخل التطبيق من أي حساب، أو تواصل معنا وبنحذفه عنك بعد ما نتأكد إنه حسابك.'),
])
open('robots.txt','w').write('User-agent: *\nAllow: /\nSitemap: https://unimate.my/sitemap.xml\n')
open('sitemap.xml','w').write('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(f'<url><loc>https://unimate.my/{p}</loc></url>' for p in ['', 'privacy/', 'terms/', 'support/', 'delete-account/']) + '</urlset>')
open('.htaccess','w').write('RewriteEngine On\nRewriteCond %{HTTPS} off\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]\nRewriteCond %{HTTP_HOST} ^www\\.(.*)$ [NC]\nRewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]\n')
