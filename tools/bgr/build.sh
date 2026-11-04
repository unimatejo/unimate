#!/usr/bin/env bash
# Builds the in-browser background remover for stickers into $1 (served at app.unimate.my/bgr/).
# IMG.LY background-removal 1.4.5 + its "small" model + ONNX runtime wasm, all self-hosted (no CDN at runtime).
set -euo pipefail
OUT=${1:?output dir}; W=$(mktemp -d)
cd "$W" && npm init -y >/dev/null && npm i --silent @imgly/background-removal@1.4.5 @imgly/background-removal-data@1.4.5 esbuild@0.25 >/dev/null
echo "export { removeBackground } from '@imgly/background-removal';" > entry.mjs
mkdir -p "$OUT" && npx esbuild entry.mjs --bundle --format=esm --platform=browser --minify --outfile="$OUT/bgr.mjs" --log-level=warning
python3 - "$W/node_modules/@imgly/background-removal-data/dist/" "$OUT" <<'PY'
import json, shutil, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src + 'resources.json'))
keep = {k: v for k, v in d.items() if k in ('/models/small', '/onnxruntime-web/ort-wasm.wasm', '/onnxruntime-web/ort-wasm-simd.wasm')}
json.dump(keep, open(out + '/resources.json', 'w'))
for v in keep.values():
    for c in v['chunks']: shutil.copy(src + c['hash'], out + '/' + c['hash'])
PY
echo "built $(du -sh "$OUT" | cut -f1) in $OUT"
