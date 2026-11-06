"""Rewrites the generated part of ARCHITECTURE.md (after the marker) from the code. Run from the repo root."""
import os,re,glob
def clean(c): 
    c=re.sub(r'^\s*/\*\*|\*/\s*$','',c.strip()); c=' '.join(l.strip().lstrip('*').strip() for l in c.split('\n')); return c.strip()
def doc(p, default=True):
    s=open(p,encoding='utf8').read()
    if default:
        m=re.search(r"(/\*\*(?:(?!\*/).)*\*/)\s*\n\s*export default",s,re.S)
        if m: return clean(m.group(1))
        m=re.search(r"(/\*\*(?:(?!\*/).)*\*/)\s*\n\s*export (?:async )?(?:function|const)",s,re.S)
        if m: return clean(m.group(1))
    m=re.search(r"^(/\*\*(?:(?!\*/).)*\*/)",s,re.S|re.M)
    if m: return clean(m.group(1))
    m=re.search(r"^//\s*(.+)$",s,re.M)
    return m.group(1).strip() if m else ''
def cut(x,n): x=x.replace('|','/'); return x if len(x)<=n else x[:n].rsplit(' ',1)[0]+'…'
def route(p):
    r=p.replace('app/src/app','').replace('.tsx','')
    r=re.sub(r'/\([^)]+\)','',r).replace('/index','') or '/'
    return r
out=[]
out.append('### Screens (`app/src/app`) — URL → file\n\n| URL | File | What it is |\n|---|---|---|')
for p in sorted(glob.glob('app/src/app/**/*.tsx',recursive=True)):
    if os.path.basename(p)=='_layout.tsx' and p!='app/src/app/_layout.tsx': continue
    out.append(f"| `{route(p)}` | `{p.replace('app/src/','')}` | {cut(doc(p),150)} |")
out.append('\n### Components (`app/src/components`)\n')
for d in sorted(glob.glob('app/src/components/*/')):
    out.append(f"**{os.path.basename(d.rstrip('/'))}/**\n")
    for p in sorted(glob.glob(d+'*.ts*')): out.append(f"- `{os.path.basename(p)}` — {cut(doc(p),160)}")
    out.append('')
out.append('### Shared logic (`app/src/lib`)\n')
for p in sorted(glob.glob('app/src/lib/*.ts*')): out.append(f"- `{os.path.basename(p)}` — {cut(doc(p, False),170)}")
out.append('\n### Edge functions (`supabase/functions`)\n')
for p in sorted(glob.glob('supabase/functions/*/index.ts')): out.append(f"- `{p.split('/')[2]}` — {cut(doc(p,False),220)}")
out.append('\n### Database migrations (`supabase/migrations`, applied in order)\n')
for p in sorted(glob.glob('supabase/migrations/*.sql')):
    s=open(p,encoding='utf8').read().split('\n')
    first=next((l.lstrip('- ').strip() for l in s if l.startswith('--') and len(l.strip())>3),'')
    out.append(f"- `{os.path.basename(p)}` — {cut(first,180)}")
rev=sorted(glob.glob('supabase/review/*.sql'))
if rev:
    out.append('\n### Waiting for review (`supabase/review`, NOT applied)\n')
    for p in rev:
        s=open(p,encoding='utf8').read().split('\n'); out.append(f"- `{os.path.basename(p)}` — {cut(s[0].lstrip('- '),180)}")
MARK = '<!-- generated: tools/arch/generate.py -->'
doc_path = 'ARCHITECTURE.md'
head = open(doc_path, encoding='utf8').read().split(MARK)[0]
open(doc_path, 'w', encoding='utf8').write(head + MARK + '\n\n' + '\n'.join(out) + '\n')
print('ARCHITECTURE.md updated')
