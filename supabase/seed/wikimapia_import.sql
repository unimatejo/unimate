-- Import Wikimapia campus objects from osm_stage (k = 'wm') into buildings/places (safe to re-run).
-- Data © Wikimapia contributors (CC BY-SA). Names are cleaned and joke/user names dropped.
with s0 as (
  select distinct on (st.osm) st.*, u.id as university_id,
    btrim(regexp_replace(regexp_replace(st.name_ar, '\s+', ' ', 'g'), '\s*(\(en\)|:\)|:D|pb)\s*$', '', 'i')) as nm
  from osm_stage st join universities u on u.slug = st.uni
  where st.k = 'wm' and st.name_ar is not null
  order by st.osm, st.id desc
), s as (
  select *, translate(nm, 'ةأإآى', 'هااای') as n from s0
  where length(nm) between 2 and 70
    and not (nm ~ '[a-z]{3,}' and nm !~ '[A-Z]' and nm !~ '[ء-ي]')            -- user names, chat
    and nm !~* '(ooo|eee|aaa|haha|camera|location|test)'
    and nm !~ '(مزز|هادا|هاد |حبيب|يا شباب|ههه|عشاق|ذكريات|أجمل|اجمل|لعيون|بيت |منزل|مزرعه|مزرعة|مشتل|شركة)'
    and nm !~ '[😀-🙏]'
    -- not the campus: homes, private dorms, schools, offices and other universities next door
    and nm !~ '(عماره|عمارة|عمارات|مدرسه|مدرسة|مدارس|بادارة|بإدارة|بأداره|بادارة|مع تحيات|مكتب |شقق|اسكان|إسكان|فيلا|مجمعات|مجمع [أ-ي]+ عبد|جمعية|الجمعية|دفاع مدني|سفارة|نادي طلبة)'
    and nm !~* '(residential|apartment|complex|studant|villa| building$|^[A-Z][a-z]+ Building)'
    and not (nm ~ '^(ال)?جامع[ةه] ' and nm !~ (select regexp_replace(u2.name_ar, '^(ال)?جامع[ةه] ', '') from universities u2 where u2.id = s0.university_id))
    and not (nm ~ '^سكن' and nm !~ '(الداخلي|الجامع)')
    and nm !~ '(ضاحية|ضاحيه|^حي |نادي الطفل|مركز الأنوار|القرآني|مسكن|محل [أ-ي]+ لل)'
    and nm !~* '[a-z][2357][a-z]'                                                   -- arabizi chat
    -- where Wikimapia has no campus outline (city colleges, and JU whose outline is the whole district),
    -- keep only things that are clearly part of the university, and for small colleges only right next to it
    and (s0.uni not in ('ju','wise','psut','aou-jo','amsu','aau','htu','anu','ltuc','aauc','khawarizmi','auct','nuct','raca')
      or (nm ~* '(كلي[ةه]|مبنى|مباني|قسم|عماد[ةه]|قبول|تسجيل|مختبر|مدرج|قاع[ةه]|قاعات|رئاس[ةه]|المكتب[ةه]|كافتير|كفتير|مصلى|ملعب|بواب[ةه]|موقف|مواقف|الجامع[ةه]|جامع[ةه]|الكلي[ةه]|faculty|department|hall|lab|college|university)'
          and nm !~ '(مجمع .* التجاري|شرك[ةه]|مؤسس[ةه]|وزار[ةه]|مديري[ةه]|دائر[ةه] الإقام[ةه]|هيئ[ةه]|فندق|hotel|كازي[ةه]|محط[ةه])'
          and (s0.uni = 'ju' or sqrt(power((lat - (select center_lat from universities u4 where u4.id = s0.university_id)) * 111000, 2)
                + power((lng - (select center_lng from universities u4 where u4.id = s0.university_id)) * 94000, 2)) < 350)))
    and sqrt(power((lat - (select center_lat from universities u3 where u3.id = s0.university_id)) * 111000, 2)
           + power((lng - (select center_lng from universities u3 where u3.id = s0.university_id)) * 94000, 2)) < 1100
), m as (
  select s.*, case
    when n ~ '(كشك|اكشاك|kiosk)' then 'kiosk'
    when n ~* '(كافتير|كفتير|كافيتير|كفيتير|كوفي|قهوه|كافيه|مقهى|سناك|cafe|coffee|cafeteria)' then 'cafeteria'
    when n ~* '(مطعم|شاورما|فلافل|بيتزا|restaurant)' then 'restaurant'
    when n ~* '(باص|حافلات|سرفيس|كوستر|bus)' then 'bus'
    when n ~* '(موقف|مواقف|كراج|parking)' then 'parking'
    when n ~ '(مسجد|مصلى)' then 'mosque'
    when n ~* '(بوابه|gate)' then 'gate'
    when n ~* '(تصوير|طباعه|قرطاسيه|print)' then 'print'
    when n ~* '(بنك|صراف|atm)' then 'bank'
    when n ~* '(عياده|عيادات|مستشفى|مركز صحي|صيدليه|clinic|hospital)' then 'clinic'
    when n ~* '(ملعب|صاله رياضيه|رياضي|مسبح|المرمى|stadium|gym)' then 'sports'
    when n ~* '(حديقه|بحيره|نافور|ساحه|garden)' then 'garden'
    when n ~ '(^المكتبه|مكتبه الجامعه|المكتبه الرئيسيه|library)' then 'library'
    when n ~* '(كليه|مبنى|مباني|قسم|مدرج|قاعه|قاعات|سكوير|square|مختبر|مختبرات|lab|مشاغل|hall|عماده|رئاسه|قبول|سكن|مركز|معهد|faculty|building|^[A-Z]{1,3} ?[0-9]{0,2}$)' then 'building'
    when coalesce((tags->>'a')::float, 0) > 0.0008 then 'building'
    else null end as pk
  from s
), nb as (
  insert into buildings (university_id, name_ar, lat, lng, osm_id)
  select university_id, nm, lat, lng, osm from m
  where pk = 'building'
    and not exists (select 1 from buildings b where b.osm_id = m.osm)
    and not exists (select 1 from buildings b where b.university_id = m.university_id and b.name_ar = m.nm)
    and not exists (select 1 from buildings b where b.university_id = m.university_id and b.lat is not null
                    and abs(b.lat - m.lat) < 0.00018 and abs(b.lng - m.lng) < 0.0002)
  returning 1
), np as (
  insert into places (university_id, kind, name_ar, lat, lng, osm_id, state)
  select university_id, pk::place_kind, nm, lat, lng, osm, 'approved' from m
  where pk is not null and pk <> 'building'
    and not exists (select 1 from places p where p.osm_id = m.osm)
    and not exists (select 1 from places p where p.university_id = m.university_id and (p.name_ar = m.nm or p.kind::text = m.pk)
                    and abs(p.lat - m.lat) < 0.00015 and abs(p.lng - m.lng) < 0.00018)
  returning 1
)
select (select count(*) from nb) as buildings_added, (select count(*) from np) as places_added;
