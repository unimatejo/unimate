// Builds an over-the-air update (expo-updates protocol, self-hosted on app.unimate.my/ota).
// usage: node tools/ota/publish.js <outDir>   (run from repo root; needs app/node_modules)
// Then deploy <outDir> as /ota on app.unimate.my. Phones with the same runtimeVersion pick it up on next open.
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const out = path.resolve(process.argv[2] || 'ota-out');
const app = path.resolve(__dirname, '../../app');
const BASE = 'https://app.unimate.my/ota';
fs.rmSync(out, { recursive: true, force: true });
const exp = path.join(out, 'files');
execSync(`npx expo export --platform ios --platform android --output-dir ${exp}`, { cwd: app, stdio: 'inherit' });
const config = JSON.parse(execSync('npx expo config --json --type public', { cwd: app }).toString());
const meta = JSON.parse(fs.readFileSync(path.join(exp, 'metadata.json'), 'utf8'));
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const asset = (rel, ext, type) => {
  const buf = fs.readFileSync(path.join(exp, rel));
  return { hash: b64url(crypto.createHash('sha256').update(buf).digest()), key: crypto.createHash('md5').update(buf).digest('hex'), fileExtension: `.${ext}`, contentType: type, url: `${BASE}/files/${rel}` };
};
const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ttf: 'font/ttf', otf: 'font/otf', svg: 'image/svg+xml', json: 'application/json', mp3: 'audio/mpeg', wav: 'audio/wav' };
const createdAt = new Date().toISOString();
for (const platform of ['ios', 'android']) {
  const fm = meta.fileMetadata[platform];
  const launch = asset(fm.bundle, 'bundle', 'application/javascript');
  const id = crypto.createHash('sha256').update(launch.hash + platform).digest('hex');
  const manifest = {
    id: `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-a${id.slice(17, 20)}-${id.slice(20, 32)}`,
    createdAt, runtimeVersion: config.runtimeVersion, launchAsset: launch,
    assets: fm.assets.map((a) => asset(a.path, a.ext, mime[a.ext] || 'application/octet-stream')),
    metadata: {}, extra: { expoClient: config },
  };
  fs.writeFileSync(path.join(out, `manifest-${platform}.json`), JSON.stringify(manifest));
  console.log(platform, 'update', manifest.id, 'assets', manifest.assets.length);
}
// the app asks /ota/manifest with an "expo-platform" header; Apache picks the right file and adds the protocol headers
fs.writeFileSync(path.join(out, '.htaccess'), `RewriteEngine On
RewriteCond %{HTTP:expo-platform} android [NC]
RewriteRule ^manifest$ manifest-android.json [L]
RewriteRule ^manifest$ manifest-ios.json [L]
<FilesMatch "^manifest-.*\\.json$">
  Header set expo-protocol-version "1"
  Header set expo-sfv-version "0"
  Header set Cache-Control "private, max-age=0"
  Header set Content-Type "application/json"
</FilesMatch>
<IfModule mod_headers.c>
  <FilesMatch "\\.(hbc|js|bundle|png|jpg|ttf|otf|webp)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
`);
