-- stories: allow bigger videos (15s at 960x540 is ~10-20MB)
update storage.buckets set file_size_limit = 52428800 where id = 'stories';
