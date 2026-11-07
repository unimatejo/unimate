-- Yarmouk University: matched against the university's official campus plan (yu.edu.jo, the disability access and
-- compliance map, 2023): a scaled drawing with a code on every building and gate and a legend of their names. The
-- drawing was fitted to the ground on 14 known points (gates, library, presidency, colleges; 4-60 m off, mostly
-- because our points sit on a building's edge), and each code read where it lands. Only what the plan and a second
-- source agree on changes; conflicts are hidden until a Yarmouk student confirms them through «اقترح مكان».
-- Hidden rows are rejected, not deleted. 2026-11-07.
do $$
declare yu uuid := '1444f1f4-5b74-410a-be0a-9c1a9bd88744';
begin
  -- 1. Off campus (shops, cafés, banks, malls and other bodies in the streets around it), same rule as 0115 and 0122.
  --    «بوابة اللوازم» stays: it's the plan's supply gate (G-S1), 2 m outside the outline.
  update buildings set state = 'rejected' where university_id = yu and state = 'approved' and id in ('19e7e02a-bc48-4f19-b226-550cf0a844d4', '6103c881-4c14-4d36-b424-bdb591109850', '7bf1e448-3ac1-4d89-864c-d3dbccf43c3d', '0b516bde-cbdd-4778-8d84-706386bf2ab5', '365e5b9f-6dec-4bfb-81fd-f3a8ac9d3f48');
  update places set state = 'rejected' where university_id = yu and state = 'approved' and id in ('370b4397-e4a3-406b-9a2a-69c217853914', 'e22af32e-a7f0-4f41-bdad-76e2285686e8', '476c4c9a-b5b2-46aa-a74d-76821e1a5608', '2e1c4b6e-a5cb-4654-a039-c00443927cdf', '7c06fa6b-0b51-4da8-b26e-9bf46421fd02', 'dd51f986-ab3a-450f-8ac4-e60684927641', 'e6d42907-93bf-45c2-8b53-121c78211bd7', 'c2e31dc8-a45a-4815-aa78-929947486582', 'ca5a8dc8-12f9-44cb-810a-84522c1abbdb', '872755a4-47aa-4b5e-aa95-aec11e2571ad', 'f9710142-18f1-44eb-a1a9-8cb1c38e8501', '19483deb-ee67-4867-ad61-adad435ddaa2', 'b9e87600-30d8-4914-b120-3df9753ac1d5', '045efe37-bfe9-47f2-b4f1-d468af6596ea', '06552762-84ac-4d0f-a8cc-b3b6e31a6fb8', '13f68d68-f55e-476e-b4df-452dc1e383f7', 'c0106db9-b0cd-482a-b9cc-f89973c8a06e', '436017e1-343c-4a0f-8114-cf4ab16176f6', 'd84a50f8-c279-46bb-b3fa-6136c05f4dc0', '38bb9b50-d577-4429-8ab8-12ea19e35518', '8f8b387b-4e66-4eb0-afac-4f8038a53954', '3e44cd62-5228-42d7-ba0a-b6a849dc1b81', 'dd586fdc-9664-4d85-a4c2-4257012eec9e', '36d2e944-7e4b-44e8-9286-f5c065f24cd9', 'ca20748e-a7ed-44f3-beaf-c21aa89ac2ad', '79dadef4-a6bc-4a7a-8078-4b084e48b04c', 'b5a2d5a6-0bb9-4503-a05b-719849fff8b5', '374c2a99-6353-47ee-ac75-6a86f8e81815', '02d476a0-6534-4194-b7ab-1c4eabb5ade4', '48400025-e0dd-4cb6-bc78-723c6470210a', '879502d2-c10f-4318-b4c3-1752e2899e20', '2d21422d-f22f-4e28-866a-36f8451d446e', 'c1bafd86-9575-4aee-8658-5d0a04434f01', '0581e1dc-9b10-46a5-812b-38dfc35c99cb', 'da4cc2a1-971c-4f60-bbf7-2530116e403a', 'e3594401-8d33-430c-acbc-6b053fcbbf96', 'd0ad0c18-fc13-4fe4-a7c3-657ab173dc22', '55c4aaaf-db10-4d86-b761-423ef3ebe823', '016dadd1-2602-4715-be74-032ae269217b', 'b9b68415-2fd9-4c5a-bbb2-b806b32379b3', '5d61341a-f3df-44ac-8170-bc1779c5e4a1', '885e328d-1e95-4634-abab-c0795e27d73e', 'cf9ebe30-f4ae-409c-bb15-d858cc2ae056', '3e322307-bbb2-4ab1-9194-e64371c2b3a5', '36c48dfc-05bc-4f01-971f-8d3f19d1c139', 'ef84c478-4ee0-43b5-b94a-5df0db8584dd', '9bc64498-046d-4d5d-be92-d7c18c3c6517', '319a6b5d-6a35-40f6-8835-ac05b246024b', '68609104-c3a2-4748-a85d-7d256676ecc2', '6bbccebe-2556-4e08-b5a1-dd7e15bde64e', '932ead67-bd52-465a-8a11-64fd09db2259', 'c86f0ec2-5d9d-4451-9bd1-ad8bb2a24ecf', 'c519d60c-4f15-4480-b980-27e8537d12c3', 'aa4d9220-185b-4d1b-90f2-ed77afc72fb0', 'c17081b3-aca6-41bc-9e77-a40415574256', 'd93c381b-c751-4a5e-9675-798d5e780647', '7aa952f7-b3ff-4206-ab32-d459be4e8861', 'e737f09a-a064-4438-aada-c6e3005fde3f', 'a0d9e463-87d7-438c-be8f-8755fab48d97', '1985a399-8475-4827-9398-1e2caab17e63', '5333dde5-86ce-45e3-83ce-cc5f73fae54b', 'cf04f547-e728-4ed4-be43-fa5a2daec5d9', 'edad93ef-0e06-48cf-a83e-51a46d509987', 'd91c75e1-bb9e-4b15-8bd0-be4f1db363d9', '3252c165-1c91-48af-b1de-503a79bb1070', 'f3d6d189-2f46-41a8-858d-35f8beb47e6e', '29c4ec94-2669-45bf-a7b0-81b8b634ad7c', 'f6a84b7e-e22e-4127-9955-a31d55916ba0', '0cef5562-ead4-4f44-8883-247d4a76f436', 'b4599408-3fe1-4e10-9391-616ce152c89b', '7ec4f79c-e663-4e18-b580-d903b33a099a', '1e6b0548-cc44-420c-bc62-8103abfc3863', 'fb14b61c-ce2f-44a6-9d8c-8b412e3c9329', 'a5421ea9-9095-4ab3-b7b8-ff7a33511468', '71fd400b-67d6-475c-a95e-25c386adeb7d', '882965d1-057c-4982-8392-9d5513185835', '710af547-1a64-43e1-97fe-94ee914ac721', 'cb246fe4-668c-4fe8-90e6-687ef4d1e0aa', 'd1c77a2e-eb68-45cc-b823-3abb61c06e31', '122d8c14-37e2-4171-a5d7-2a2a733fba98', 'a9ff0a87-a7b6-445f-b7fe-de01a28ec985', 'c4170b60-0f6a-4f2f-98cb-86e04540c1f7', '7bfee258-f4b4-484e-a95c-50915300c476', 'f06cbd22-cbf5-4814-a789-00c9ba05afff', '75d02a9d-803e-46a5-b155-f4101dff5bf3', '55669c3c-ed10-461a-b1ca-60ae7c9bbb49', '27c68850-773a-4e5f-bac3-9d9cb3e8432b', '9a1ffedb-0ba2-42e5-b334-d10eaa22b4f6', '8afb777a-e424-481a-ac40-74ad59ce2cf4', '90c57636-bdf4-4510-8ba1-db883898b6f2', 'ebb7116a-cca4-420b-82f3-b230309f301a', '6729ca04-d9f0-4d0f-a172-2662bc267dc6', 'a3caf113-bf13-42f1-aa4a-f86cd80b22aa', '70ffe15d-4fd3-4e30-b140-17d8ce3a88e1', '1adfc3c8-f8a3-4a24-b5cc-472401cdca10', 'f5a6ab15-e1a8-4cc5-85fe-41118e37f940', '6c9b7457-73bf-4e33-b76d-8bd7f0c21c1d', '288c8e66-5d0f-490a-9e8a-29b57516ec37', '605feafb-27e6-42a5-a6c6-81a7e9024b8c', 'b92764d1-6810-46a6-be43-86de61041b7a', '35fd0272-9ed1-46f9-b4ba-1a2fcd1b2f0a', '18cff9be-23fc-41c4-bbf8-10ae4bf72ce4', '7e2cc29f-de03-4412-b2e5-060d6ffa811b', '5c573acc-b1fc-4f08-a52a-0597824b7a2a', '3770d816-e00e-4159-bc54-4cc323e9313a', 'cd4811d1-c9cf-464e-b1f3-11aeef23f1e3', '3b1c2ed5-ac28-4553-a347-33bedcab8ecd', '06692df6-848f-4d12-9e5c-4f8f3acf0207', '83867158-94df-4722-8270-a8142f31e17a', '67463f82-6d1f-4246-8343-7b6b0c295fea', '14c6ddc2-b7fd-4ddd-afd3-b2bbb981bab7', 'f6642ee6-b1dc-4241-97e7-1c10d631a733', 'd89c338a-0d19-450d-98ac-8d65b490e968', '5694db86-9627-479a-8e1d-93343646b9b5', '3b4dbde1-d591-4cd8-b537-848c965fddef', '3e1319c2-c281-441f-bdab-0c2058d54a99', '2c2a10cf-111e-4729-b13a-cfd2b0ca1649', '6406be52-1c3c-4784-acff-f1975a71e2ed', '071845ea-b0ce-424e-9a50-3d3f29ce6c49', 'cf0fe3d7-44c8-4d40-8d4b-0e9eabccbc80', '846199fa-df0f-4ed6-8c54-b5b898745da3', '7e441df5-2138-4322-ac4f-ca5e1de29e07', '2d43daef-bfed-44a7-b768-0615762683c6', '69ee5959-51bf-4cb9-8a2e-cfe8239c8bcd', '3b3e0d63-c3bb-4145-8f63-dfef2434bc61', 'c849daa5-f025-4985-84f9-eb96c8f2cc8e', 'fb3280c9-68a2-44a4-9e23-6648ae6f1a5d', '3a885352-128a-4513-8262-66d98d271551', 'f7e81eba-dc61-4a9f-90af-76581b25ce4f', 'a68869ad-95e1-47ec-8fc7-c297cff3a407', '23f2caa1-0a73-454f-bfef-4344a3f3498d', 'c6e3faa6-5dc0-4544-a65c-50f160023669', '9041ba0a-7a72-4908-863b-7c4609724984', 'b3fce43a-d36b-4d1d-a313-5cc82a66dc9c', '57a6c8bd-da63-4ebf-aa52-beeb20023f17', '0778585e-ec8f-4831-88ca-69dac449c5b7', 'fef84b00-56cf-470f-be8b-d7f4197f553f', '1be0aeb0-ed84-47b3-a627-53aada5b9306', 'f69a3461-57c2-4e7a-b2a4-45b37ae91ccc', '8c826cd0-4714-40c5-ac09-a80930fda184', '9d31db76-4c2e-4e8c-85f6-dbbf9ee300ae', 'a3415191-2a7b-47e0-9b51-72d3919c3600', '044fc712-4345-48ab-b0a5-030dddb33b69', '859d82a8-7b6f-43cf-b4cb-d79d45fac8fc', '24b0fd56-2180-4f1b-a3e4-7fecc1d83359', '5d76e2d2-ad2d-4880-8206-eb3e9257eb7f', '3dad7d68-6a43-4faa-a0e2-80919ccc6ea1', '2d9404b5-a378-47dd-8f79-db7cde1e25a1', 'bd0e4b43-9a0d-4e24-bb67-c45e9b4bea60', '1fe313b9-3368-4b7a-bad4-d4bfa141bc3f', 'efedbc98-55ab-44b0-85ab-54f8e0b2b55d', '0100b9ae-67ce-4299-9ff2-3e76493963bf', '0bdb930e-aab0-4d74-8647-745c41ed55b6', '0dcabcac-08fa-47d0-9983-f24277f4729b', '4b9e0002-cd1a-4c8c-8e03-9df3b97eaa3a', '43fc9a99-02c1-4b08-b072-d07ac135bd5a', '3500e315-9351-461f-aed2-d93a15cf59ec', 'b7d1bc0c-524e-4690-8f17-5e0b926ddc5c', 'b7fed793-9af0-4d47-a33e-51b2ee236c9f', 'cd6badf2-6245-487e-9474-a60a9dfcf826', 'e7584608-4383-4d45-b944-a1d53998837e', 'd5e14ee3-0891-4e16-89fa-01b4fadd09f0', '8daf7dd6-e77e-4103-a263-5f28a7033c11', '2b6fef0f-d067-45d7-bb06-feadd728e8f2', '1d477f5b-02ed-442a-b341-4d12ee59ab59', '01202d75-11bd-4316-a353-ec0d16518b49', 'f5ac174a-f85e-4d23-bcb5-16efcef6178c', 'df24aa8c-81b3-4e3e-a1a3-a31dbbce1340', '80294be3-8d08-41b4-84fa-de15adde5315', 'da990164-96b1-4537-bb16-a6df9b868e76', '60ac0971-ca95-4442-ab5f-52c857033d21', 'ba148972-18d9-41b2-bd3f-be675258581f', '2a690e3c-9ddd-4433-8e14-f2cb039c2497', '353a863e-4abc-427d-81fc-c19c8f810765', 'b83647d4-fd47-4156-8be3-bcc942898270', 'c3d731fa-a87f-430f-85b0-6d6e8a935a5c', 'c0aa3277-0760-4c7d-90a2-7c649db92afb', '1e7eb84f-e04d-4db1-927b-f898f0c05cf5', '8b6ba852-73f7-424e-a681-f566790b5d1c', '0af76f7d-9cd4-499c-b227-a7f932e5ccdb', '0b56033a-dccc-46a2-8a2d-41d92c71c712', '2ebabf03-4387-493f-bbda-29bbc6c3d992', '78109c71-9398-4bc6-92de-992ad5012780', 'e3915f1e-6b48-45db-b407-5df9bb0aa993', 'bc816e74-025d-41e4-a93a-9b3ec9ef1705', '4d416b69-79ec-4fc4-b265-4591f3051915', '5aad9c96-25a9-4625-b56e-ec668e891cd7', '1ece60ee-23ae-403f-bfca-10fdb0b64735', 'd788f346-643f-46a8-aec3-39ba6539ce6d');

  -- 2. Homes: «Bulding num 1-13» are the plan's staff housing (المباني السكنية, D1-13). Same rule as 0117.
  update buildings set state = 'rejected' where university_id = yu and state = 'approved' and id in ('3c706ee6-cfea-4873-91f0-fb5187b838d1', '47680031-d090-4e4b-9113-959aa3f26765', '4e0a3f39-d27c-4deb-b3dc-d0e9c674a05c', '64614c06-8ed0-4538-878c-89b8eafd156c', 'e4761d13-3eef-4712-b553-5e036987203c', 'd183a207-a880-4eff-8e35-2694482956e1', '94044b87-1d00-40a5-8de2-f1d1206f9788', '60a02f98-4d33-43a3-bcf5-5684e9e91fa3', '794acf2a-de04-47fc-9b0b-3173ac0428ee', 'e6309623-c493-4ae0-8d73-05e20e83ff18', 'bdde6a27-1d2e-4928-a9c4-b18a993572d1', '068b1d08-f8ac-4272-b4fb-c25672c0edf5', 'ad8e4b6b-4d11-40f1-867a-4aae152f3280');

  -- 3. Names the plan contradicts, hidden until confirmed: كليه الطب; كلية القانون في جامعة اليرموك; نادي العاملين في الجامعة
  update buildings set state = 'rejected' where university_id = yu and state = 'approved' and id in ('91660784-253c-4929-b62e-0d38631bf17c', '67f97a89-28ea-4d41-85de-80ecad2cb141', 'd322dd28-3ef1-4dfc-9237-d87c55b151de');

  -- 4. Names as the plan writes them (the old name stays searchable where students use it)
  update buildings set name_ar = 'مبنى الجمنازيوم' where id = '4def974e-e0fa-4e57-a3dd-7d4693a1d3bc' and university_id = yu;
  update buildings set name_ar = 'كلية التربية' where id = 'd16bc571-539a-4072-80a1-d045c91bf484' and university_id = yu;
  update buildings set name_ar = 'مركز اللغات' where id = 'ac6dd2a1-00c1-4cd0-87d9-cd286e77230c' and university_id = yu;
  update buildings set name_ar = 'ورشة مشاغل هندسية' where id = 'b21a9388-470b-4cdd-8ed3-e7069cce0a85' and university_id = yu;
  update buildings set name_ar = 'مبنى الأمير الحسين بن عبدالله الثاني' where id = '6ba74e27-2e81-430e-87b8-1c76d39e2789' and university_id = yu;
  update buildings set name_ar = 'كلية الآثار' where id = '6a27e1c8-d1ce-4be7-8883-7a75f585f861' and university_id = yu;
  update buildings set name_ar = 'مظلات' where id = 'ab4e3107-38a0-45ec-b436-1a747cf29b88' and university_id = yu;
  update buildings set name_ar = 'مظلات' where id = '51fe8013-c3f9-4950-9219-c79b2041a047' and university_id = yu;
  update buildings set name_ar = 'مظلات' where id = '412458c0-2d75-4f64-8905-d71706f43e21' and university_id = yu;
  update places set name_ar = 'بوابة الرئاسة' where id = '58da9cd8-e9ab-4d05-a053-8179cce49279' and university_id = yu;
  update places set name_ar = 'بوابة الاقتصاد القديم' where id = 'd7e88db8-5d9b-451a-81f7-6d557416b072' and university_id = yu;
  update places set name_ar = 'صالة خالد بن الوليد الرياضية' where id = 'd485938a-ded7-4e13-9fc4-5b23baaf6479' and university_id = yu;
  update places set name_ar = 'المقصف الشرقي' where id = 'aa73a73f-575b-4a46-8eb1-7cb46a39d2db' and university_id = yu;
  update places set name_ar = 'ملعب مدرسة الذكور' where id = '90d6dd62-8c7f-45c1-a9ee-00eba20113ce' and university_id = yu;
  update places set name_ar = 'مركز اليرموك الصحي' where id = '7b123e9f-5c1a-4daa-9bef-af12cee8e0d9' and university_id = yu;

  -- 5. Other names from the plan's legend, so search finds them
  insert into place_aliases (university_id, place_id, building_id, alias, state)
  select yu, x.p, x.b, x.a, 'approved' from (values
    (null::uuid, 'de8eef9f-fd5b-4eb9-ac57-de4aa7f446ae'::uuid, 'نادي الجامعة'),
    (null::uuid, 'de8eef9f-fd5b-4eb9-ac57-de4aa7f446ae'::uuid, 'الشؤون القانونية'),
    (null::uuid, '85039231-3e69-4c8a-8dc3-c19912b7bbbd'::uuid, 'الدائرة المالية'),
    (null::uuid, '85039231-3e69-4c8a-8dc3-c19912b7bbbd'::uuid, 'دائرة الموارد البشرية'),
    (null::uuid, 'b1d7e06a-1867-4d11-b154-c15f3c764074'::uuid, 'مبنى الندوات والمؤتمرات'),
    (null::uuid, 'e4808dd2-0f86-4f3e-80c4-b65ebbeb4ca2'::uuid, 'بركة السباحة'),
    (null::uuid, 'e4808dd2-0f86-4f3e-80c4-b65ebbeb4ca2'::uuid, 'عمادة التربية الرياضية'),
    (null::uuid, 'f4fba921-73f8-48f5-bb13-6894b3785411'::uuid, 'مختبرات تكنولوجيا المعلومات'),
    (null::uuid, 'e650b646-b333-499d-ac5b-bfff631bca32'::uuid, 'مبنى جابر بن حيان'),
    (null::uuid, 'e650b646-b333-499d-ac5b-bfff631bca32'::uuid, 'دائرة الخدمات العامة'),
    (null::uuid, '3a74c1d0-3c4b-4fa8-aee5-bcb42913699c'::uuid, 'مبنى القاهرة عمان القديم'),
    (null::uuid, '8b79e189-c3ec-4210-8349-9ed126dac0e7'::uuid, 'قسم علوم الأرض'),
    (null::uuid, '00b27474-1932-408f-bcff-8027bac3599d'::uuid, 'مبنى البيروني'),
    (null::uuid, 'f00f129f-ef52-4883-82e6-938fc722606a'::uuid, 'مبنى الكندي'),
    (null::uuid, 'fba4890d-c04d-4e6e-8513-6c1fbd0bbd24'::uuid, 'دائرة الرقابة الإدارية والمالية'),
    (null::uuid, 'fba4890d-c04d-4e6e-8513-6c1fbd0bbd24'::uuid, 'الدائرة الهندسية'),
    (null::uuid, 'f7ec536e-13f7-42b3-9191-e48738ea325d'::uuid, 'مبنى مركز الحاسب'),
    (null::uuid, '8d2ad245-76ac-41da-aa1b-1a5271ba1687'::uuid, 'كلية الطب'),
    (null::uuid, '8d2ad245-76ac-41da-aa1b-1a5271ba1687'::uuid, 'كلية الصيدلة'),
    (null::uuid, '6a27e1c8-d1ce-4be7-8883-7a75f585f861'::uuid, 'Historical Museum'),
    (null::uuid, 'ac6dd2a1-00c1-4cd0-87d9-cd286e77230c'::uuid, 'Language center'),
    (null::uuid, '6ba74e27-2e81-430e-87b8-1c76d39e2789'::uuid, 'prince hussien'),
    ('6f4fe7a7-ea41-467f-9fb1-abd51535bcf2'::uuid, null::uuid, 'المكتبة الحسينية'),
    ('d485938a-ded7-4e13-9fc4-5b23baaf6479'::uuid, null::uuid, 'الصالة الرياضية'),
    ('58da9cd8-e9ab-4d05-a053-8179cce49279'::uuid, null::uuid, 'البوابة الرئيسية الشرقية'),
    ('d7e88db8-5d9b-451a-81f7-6d557416b072'::uuid, null::uuid, 'البوابة الغربية'),
    ('cca83fef-f2cd-4721-bf96-aee89fa7a906'::uuid, null::uuid, 'مسجد جامعة اليرموك')
  ) x(p, b, a) where not exists (select 1 from place_aliases t where t.university_id = yu and t.alias = x.a);

  -- 6. On the plan and in Wikimapia at that spot (within 25 m), missing here
  insert into places (university_id, kind, name_ar, lat, lng, state)
  select yu, k::place_kind, n, la, ln, 'approved' from (values
    ('cafeteria', 'المقصف الرئيسي (مبنى الفارابي)', 32.54063, 35.853737),
    ('building', 'دائرة العلاقات العامة', 32.539278, 35.852309),
    ('building', 'المدرسة النموذجية (الذكور)', 32.534262, 35.855359),
    ('building', 'المدرسة النموذجية (الإناث)', 32.533057, 35.854612)
  ) v(k, n, la, ln) where not exists (select 1 from places p where p.university_id = yu and p.name_ar = v.n);
end $$;
