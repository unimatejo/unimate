#!/usr/bin/env bash
# Run a SQL file and print the JSON result.
set -euo pipefail
REF=$(cat ~/.unimate/project_ref); TOKEN=$(cat ~/.unimate/sb_token)
body=$(python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$1")
curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data "$body"
echo
