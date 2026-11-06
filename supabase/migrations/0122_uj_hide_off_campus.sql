-- REVIEW BEFORE APPLYING. University of Jordan: rows outside the campus outline that still show on its map
-- (hotels, shops, cafés, schools and other bodies in the streets around it), plus one mosque listed twice. Same rule
-- as 0115: rejected, not deleted, one update brings any back. Bus stops, gates and parking within 400 m stay.
-- UJ's outline was wrong when 0115 ran, so these were missed then. The list with names: الأردنية-إخفاء.csv.
do $$
declare ju uuid := '49569f3c-5c69-479f-8f67-7ee0552db5ae';
begin
  -- 1. Off campus (hotels, shops, cafés, schools and other bodies in the streets around it), same rule as 0115:
  -- rejected, not deleted. UJ's outline was wrong when 0115 ran, so these were missed then.
  update buildings set state = 'rejected' where university_id = ju and state = 'approved' and id in ('010c422d-2fe9-4fb6-8e55-4a0ded8db056', '1d8748c2-9666-49e5-8e8a-189761fbc920', '49d12d5c-8861-4374-8796-3c3e5d085da3', '93295bd8-4941-4437-a1bb-f1c8701d98cf', '5e0428c4-dca0-4e41-9e81-01c6ef1cc81a', 'ac40a532-aaa1-42b8-b34b-7b05f1788c79', '0827b3cf-c9b6-44ab-89a8-a26a80a912c7', '2a45338c-7aa0-46ce-8316-3b2df0344be6', '0b4939c3-986d-488d-bce1-ce04e0256d1f', '1cfaf832-c906-4a6e-a0b4-c1443d2db9b7', 'bc8817f5-8a71-4e8b-9a98-b2225d6922b6');
  update places set state = 'rejected' where university_id = ju and state = 'approved' and id in ('b2abc1d0-480a-41b2-9d56-8e62e716b6bd', '6d910b51-d581-4785-8672-2cc9c8b4c088', 'e31f595c-f120-488b-adfd-674fefe0aebf', '86defa09-343e-4239-bcd3-e9bdfd6480d2', 'c9749a07-f09c-4ee9-ac7f-596c98c56308', '666a52c6-679d-4eae-96ca-0d165042d001', '79562e1a-3526-4d79-8e1b-f68b3145fced', '7167fdad-c319-47b7-aaa0-ea875386efdc', '14fc7132-8c02-4eb5-8c9e-6d452036d1f8', 'fa0da7fa-1756-4f7c-acdb-904ab30bdd53', '4c8a9e8a-f1ac-4948-9b46-27daa508182a', '94597860-3177-4647-818a-e948492e8b5d', 'd1ca76d4-eecd-4f06-8cbf-f623e31b2e3d', '62818b2c-cdd8-4a6f-88c0-98b40d98b5b0', 'ed3f395c-a59c-46d8-9055-1bcf5a0e39b3', 'ba122a11-ff68-437d-9586-e59489a7d83d', '25a19381-d62e-44c1-b0d3-5885e729ac00', '1ef2b9a2-e528-4c50-adbb-49c40cb37787', '69098650-0bda-4e3b-91ed-b25c52372e04', '5f5c928f-13d1-4f5b-b28e-6549f7e0aacc', '00a3f4b5-0727-4f45-8702-3480a75e2341', 'db4d9564-6ea1-4f74-a7ef-872e337cf770', '8ee7f8ab-8ecc-4976-a2b3-32924757852e', 'd9f31d07-e190-45a1-a0ac-ab8a1c06d6a1', 'a37af16b-cf2b-4874-b114-74a18dc59fdc');
  -- the same mosque twice, 15 m apart
  update places set state = 'rejected' where university_id = ju and state = 'approved' and id = '00d0d2f2-a895-4322-8f14-fa449d660fb8';

end $$;
