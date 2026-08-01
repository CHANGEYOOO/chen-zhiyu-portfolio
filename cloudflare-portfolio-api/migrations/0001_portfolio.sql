PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL CHECK (section IN ('tvc', 'livestream')),
  brand_name TEXT,
  work_title TEXT NOT NULL,
  work_type TEXT NOT NULL,
  poster_key TEXT,
  video_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  CHECK (section <> 'tvc' OR NULLIF(TRIM(brand_name), '') IS NOT NULL),
  CHECK (section <> 'livestream' OR brand_name IS NULL),
  CHECK (section <> 'livestream' OR poster_key IS NULL),
  CHECK (section <> 'livestream' OR video_key IS NULL)
);

CREATE TABLE IF NOT EXISTS work_images (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  image_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
  UNIQUE (work_id, sort_order)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  work_id TEXT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS works_section_status_sort_order_idx
  ON works (section, status, sort_order);
CREATE INDEX IF NOT EXISTS work_images_work_id_sort_order_idx
  ON work_images (work_id, sort_order);
