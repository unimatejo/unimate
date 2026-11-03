"""Build supabase/seed/universities.sql from the researched JSON files (idempotent)."""
import json, glob, sys
src, out = sys.argv[1], sys.argv[2]
CITY = {'Mafraq': 'المفرق', "Ma'an": 'معان', 'Madaba': 'مادبا', 'Zarqa': 'الزرقاء', 'Amman': 'عمّان', 'Tafila': 'الطفيلة', 'Irbid': 'إربد'}
KINDS = {'portal', 'elearning', 'teams', 'email', 'library', 'calendar', 'registration', 'phone', 'website', 'other'}
q = lambda s: 'null' if s is None else "'" + str(s).replace("'", "''") + "'"
arr = lambda xs: "array[" + ",".join(q(x) for x in xs) + "]::text[]"
sql = ["select set_config('unimate.system','on',true);"]
for f in sorted(glob.glob(f'{src}/*.json')):
    d = json.load(open(f))
    c = d.get('center') or {}
    u = f"(select id from universities where slug = {q(d['slug'])})"
    notes = d.get('notes')
    notes = notes if isinstance(notes, str) else json.dumps(notes, ensure_ascii=False) if notes else None
    sql.append(f"""insert into universities (slug, name_ar, name_en, city, type, email_domains, center_lat, center_lng, data_status, data_notes)
values ({q(d['slug'])}, {q(d['name_ar'])}, {q(d['name_en'])}, {q(CITY.get(d['city'], d['city']))}, {q(d['type'])}, {arr(d['email_domains'])}, {c.get('lat') or 'null'}, {c.get('lng') or 'null'}, 'draft', {q(notes)})
on conflict (slug) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, city = excluded.city, email_domains = excluded.email_domains,
  center_lat = coalesce(excluded.center_lat, universities.center_lat), center_lng = coalesce(excluded.center_lng, universities.center_lng), data_notes = excluded.data_notes;""")
    sql.append(f"delete from university_links where university_id = {u};")
    for i, l in enumerate(d.get('links', [])):
        k = l.get('kind') if l.get('kind') in KINDS else 'other'
        sql.append(f"insert into university_links (university_id, kind, title, url, position) values ({u}, {q(k)}, {q(l['title'])}, {q(l['url'])}, {i});")
    sql.append(f"""insert into communities (university_id, kind, name, description)
select {u}, 'university', {q(d['name_ar'])}, 'مجتمع كل طلاب الجامعة' where not exists (select 1 from communities where university_id = {u} and kind = 'university');""")
    for col in d['colleges']:
        cid = f"(select id from colleges where university_id = {u} and name_ar = {q(col['name_ar'])})"
        sql.append(f"insert into colleges (university_id, name_ar, name_en) values ({u}, {q(col['name_ar'])}, {q(col.get('name_en'))}) on conflict (university_id, name_ar) do update set name_en = excluded.name_en;")
        sql.append(f"insert into communities (university_id, kind, college_id, name, description) select {u}, 'college', {cid}, {q(col['name_ar'])}, 'طلاب الكلية' where not exists (select 1 from communities where college_id = {cid} and kind = 'college');")
        for m in col.get('majors', []):
            deg = m.get('degree') or 'bachelor'
            mid = f"(select id from majors where university_id = {u} and name_ar = {q(m['name_ar'])} and degree = {q(deg)})"
            sql.append(f"insert into majors (university_id, college_id, name_ar, name_en, degree) values ({u}, {cid}, {q(m['name_ar'])}, {q(m.get('name_en'))}, {q(deg)}) on conflict (university_id, name_ar, degree) do update set college_id = excluded.college_id, name_en = excluded.name_en;")
            sql.append(f"insert into communities (university_id, kind, college_id, major_id, name, description) select {u}, 'major', {cid}, {mid}, {q(m['name_ar'])}, 'طلاب التخصص' where not exists (select 1 from communities where major_id = {mid} and kind = 'major');")
sql.append("select set_config('unimate.system','off',true);")
open(out, 'w').write("\n".join(sql) + "\n")
print(len(sql), 'statements')
