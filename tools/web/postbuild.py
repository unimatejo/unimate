# After `expo export -p web`: make app.unimate.my installable on iPhone/Android home screens (PWA bits) and add the server config.
import json, shutil, sys, os
d = sys.argv[1]
app = os.path.join(os.path.dirname(__file__), '../../app')
shutil.copy(os.path.join(app, 'assets/images/icon.png'), os.path.join(d, 'icon-512.png'))
json.dump({
  'name': 'UniMate | يونيميت', 'short_name': 'يونيميت', 'start_url': '/', 'scope': '/', 'display': 'standalone',
  'background_color': '#0E1430', 'theme_color': '#0E1430', 'dir': 'rtl', 'lang': 'ar',
  'icons': [{'src': '/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable'}],
}, open(os.path.join(d, 'manifest.webmanifest'), 'w'), ensure_ascii=False)
p = os.path.join(d, 'index.html'); h = open(p, encoding='utf-8').read()
tags = ('<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon-512.png">'
        '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
        '<style>input:focus,textarea:focus{outline:none}html,body{-webkit-tap-highlight-color:transparent}</style>'
        '<meta name="apple-mobile-web-app-title" content="يونيميت"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="theme-color" content="#0E1430">'
        # iPhone home-screen app: the status bar (clock, battery) sits on the app's own colour instead of a white strip
        '<script>(function(){try{var t=localStorage.getItem("theme");var bg={light:"#F4F5F8",black:"#05070F"}[t]||"#0E1430";'
        'document.documentElement.style.background=bg;var m=document.querySelector(\'meta[name="theme-color"]\');if(m)m.content=bg;'
        'if(t==="light"){var s=document.querySelector(\'meta[name="apple-mobile-web-app-status-bar-style"]\');if(s)s.content="default";}}catch(e){}})();</script>')
if 'manifest.webmanifest' not in h: h = h.replace('</head>', tags + '</head>', 1)
h = h.replace('content="width=device-width, initial-scale=1, shrink-to-fit=no"', 'content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"')
open(p, 'w', encoding='utf-8').write(h)
ht = open(os.path.join(os.path.dirname(__file__), 'htaccess')).read()  # https, page fallback, basic safety headers
ht += open(os.path.join(app, 'web/htaccess-extra')).read() + '\nAddType application/manifest+json .webmanifest\n<FilesMatch "\\.html$">\n  Header set Cache-Control "no-cache, must-revalidate"\n</FilesMatch>\n<Files "sw.js">\n  Header set Cache-Control "no-cache"\n  Header set Service-Worker-Allowed "/"\n</Files>\n'
# a phone still running an old copy asks for code files that are gone: answer with a tiny script that loads
# the newest version (instead of index.html, which breaks the import and leaves the page stuck)
spa = 'RewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule ^ index.html [L]'
assert spa in ht, 'spa fallback not found'
ht = ht.replace(spa, 'RewriteCond %{REQUEST_URI} ^/_expo/static/js/\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteRule ^ recover.js [L]\n' + spa, 1)
# no one can put the app inside their own page (clickjacking); browsers stick to https
ht += '<IfModule mod_headers.c>\n  Header always set Content-Security-Policy "frame-ancestors \'self\'"\n  Header always set Strict-Transport-Security "max-age=31536000"\n  Header always set Permissions-Policy "camera=(self), microphone=(self), geolocation=(self)"\n</IfModule>\n'
ht += '<Files "recover.js">\n  Header set Cache-Control "no-store"\n</Files>\n'
open(os.path.join(d, 'recover.js'), 'w').write(
  "try{var k='um_recover',n=+(sessionStorage.getItem(k)||0);"
  "if(n<2){sessionStorage.setItem(k,String(n+1));location.replace(location.pathname+'?v='+Date.now().toString(36));}"
  "else{setTimeout(function(){sessionStorage.removeItem(k)},60000);}}"
  "catch(e){location.replace('/?v='+Date.now());}\nexport default null;\n")
open(os.path.join(d, '.htaccess'), 'w').write(ht)
shutil.copy(os.path.join(app, 'web/sw.js'), os.path.join(d, 'sw.js'))
# hashed code/asset files never change under the same name: let phones keep them for a year
for sub in ('_expo/static', 'assets'):
  if os.path.isdir(os.path.join(d, sub)):
    open(os.path.join(d, sub, '.htaccess'), 'w').write('<IfModule mod_headers.c>\n  Header set Cache-Control "public, max-age=31536000, immutable"\n</IfModule>\n')
print('pwa ok')
