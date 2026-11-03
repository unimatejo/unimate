export type University = {
  id: string; slug: string; name_ar: string; name_en: string; city: string | null;
  email_domains: string[]; brand_color: string; logo_url: string | null;
  center_lat: number | null; center_lng: number | null;
};

export type Profile = {
  id: string; university_id: string | null; college_id: string | null; major_id: string | null;
  username: string | null; full_name: string; avatar_url: string | null; bio: string; study_year: number | null;
  status: 'active' | 'suspended' | 'banned';
  is_private: boolean; hide_followers: boolean; hide_following: boolean; hide_like_counts: boolean;
  who_can_message: 'everyone' | 'college' | 'major' | 'nobody';
  socials_visible_to: 'everyone' | 'friends' | 'close_friends' | 'nobody';
  instagram: string | null; snapchat: string | null;
  block_screenshots: boolean; default_vanish: VanishMode; nearby_enabled: boolean;
  points: number; follower_count: number; following_count: number; post_count: number;
  university?: University | null;
  college?: { id: string; name_ar: string } | null;
  major?: { id: string; name_ar: string } | null;
};

export type VanishMode = 'after_view' | 'h24' | 'd7' | 'never';

export type Post = {
  id: string; author_id: string; university_id: string; community_id: string | null;
  category: string; audience: string; title: string | null; body: string; price_jod: number | null;
  lost_found: 'lost' | 'found' | null; is_pinned: boolean; hide_likes: boolean;
  like_count: number; comment_count: number; created_at: string;
  author?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'study_year'> & { major?: { name_ar: string } | null };
  media?: { id: string; kind: string; url: string; file_name: string | null; size_bytes: number | null; position: number }[];
  poll?: { options: string[] } | null;
  liked?: boolean; saved?: boolean;
};

export type Conversation = {
  id: string; kind: 'direct' | 'group' | 'community'; title: string | null; context_label: string | null;
  vanish: VanishMode; block_screenshots: boolean; streak_days: number; last_message_at: string; community_id: string | null;
};

export type Message = {
  id: string; conversation_id: string; sender_id: string | null; kind: string; body: string | null;
  media_url: string | null; is_saved: boolean; viewed_once_at: string | null; vanishes_at: string | null;
  deleted_at: string | null; created_at: string;
};
