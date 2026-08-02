CREATE TABLE IF NOT EXISTS upload_sessions (
  upload_id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  section TEXT NOT NULL CHECK (section IN ('tvc', 'livestream')),
  work_id TEXT NOT NULL,
  total_bytes INTEGER NOT NULL CHECK (total_bytes > 0 AND total_bytes <= 2147483648),
  content_type TEXT NOT NULL CHECK (content_type IN ('video/mp4', 'video/webm')),
  actor_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'aborted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
