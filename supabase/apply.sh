#!/usr/bin/env bash
# Apply one SQL file to the UniMate project through the Supabase Management API.
set -euo pipefail
REF=$(cat ~/.unimate/project_ref); TOKEN=$(cat ~/.unimate/sb_token)
f="$1"
body=$(mktemp); python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$f" > "$body"
out=$(curl -sS -w '\n%{http_code}' -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary "@$body"); rm -f "$body"
code=$(echo "$out" | tail -1); resp=$(echo "$out" | sed '$d')
if [[ "$code" != 2* ]]; then echo "FAILED $f ($code): $resp"; exit 1; fi
echo "ok $f"
