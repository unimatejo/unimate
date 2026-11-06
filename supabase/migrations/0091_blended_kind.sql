-- UniMate · 0091 a class can be "blended" (on campus some weeks, online others), not only lecture/lab/online.
alter type meeting_kind add value if not exists 'blended' after 'online';
