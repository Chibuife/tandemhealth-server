CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop tables (meetings first because it references users)
DROP TABLE IF EXISTS meetings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(20) CHECK (role IN ('doctor', 'patient')),
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Meetings
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,

  host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES users(id) ON DELETE SET NULL,

  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,

  reason_for_visit TEXT,
  consultation_type VARCHAR(100),

  priority VARCHAR(20)
    CHECK (priority IN ('low', 'medium', 'high'))
    DEFAULT 'medium',



  status VARCHAR(20)
    CHECK (status IN ('pending','accepted','declined','completed'))
    DEFAULT 'pending',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_time_range
    CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX idx_meetings_slug ON meetings(slug);
CREATE INDEX idx_meetings_host ON meetings(host_id);
CREATE INDEX idx_meetings_participant ON meetings(participant_id);

CREATE TRIGGER trg_meetings_updated_at
BEFORE UPDATE ON meetings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();