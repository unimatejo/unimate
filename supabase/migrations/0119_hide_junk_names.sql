-- Not the university's: four Al-Balqa buildings named «aa» (test data), and three schools / a kindergarten next to
-- campuses (Al-Balqa, WISE, UJ). Hidden as `rejected`, never deleted. The import already refuses schools.
update buildings set state = 'rejected' where state = 'approved' and id in (
  '3ead4e5c-f979-48b8-b38c-c6e7a91d8a2e', '513719ff-b627-435e-8f00-b524a5cb8db9', '13d95e4a-5300-493b-bfd2-c0fd87db5d64',
  '61cc22d2-b267-46d0-ae00-181822819a9b',  -- «aa» ×4 (البلقاء)
  '556d34f8-f26c-4cb6-820e-2f372ded58ae',  -- مدرسة حسني فريز (البلقاء)
  '4bfe029e-24d4-4fe0-ac49-fc5d4be012ad',  -- مدرسة سنابل الخير (العلوم الإسلامية)
  '99741c32-567e-4802-8344-fa27f0aebacf'); -- روضة منارة الجامعة (الأردنية)
