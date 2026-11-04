# After `expo export -p web`: make app.unimate.my installable on iPhone/Android home screens (PWA bits) and add the server config.
import json, shutil, sys, os
d = sys.argv[1]
app = os.path.join(os.path.dirname(__file__), '../../app')
shutil.copy(os.path.join(app, 'assets/images/icon.png'), os.path.join(d, 'icon-512.png'))
json.dump({
  'name': 'UniMate | يونيميت', 'short_name': 'يونيميت', 'start_url': '/', 'scope': '/', 'display': 'standalone',
  'background_color': '#F5F6FA', 'theme_color': '#2E5BFF', 'dir': 'rtl', 'lang': 'ar',
  'icons': [{'src': '/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable'}],
}, open(os.path.join(d, 'manifest.webmanifest'), 'w'), ensure_ascii=False)
p = os.path.join(d, 'index.html'); h = open(p, encoding='utf-8').read()
tags = ('<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon-512.png">'
        '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-title" content="يونيميت"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="theme-color" content="#2E5BFF">')
if 'manifest.webmanifest' not in h: h = h.replace('</head>', tags + '</head>', 1)
open(p, 'w', encoding='utf-8').write(h)
ht = open(os.path.join(os.path.dirname(__file__), '../../admin/public/.htaccess')).read().replace('Header always set X-Frame-Options "DENY"\n', '')
ht += open(os.path.join(app, 'web/htaccess-extra')).read() + '\nAddType application/manifest+json .webmanifest\n'
open(os.path.join(d, '.htaccess'), 'w').write(ht)
print('pwa ok')
