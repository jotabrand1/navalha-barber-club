CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  phone text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('client', 'barber', 'admin')),
  specialty text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240 AND duration_minutes % 5 = 0),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 1000000),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1000 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE services ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1000 CHECK (sort_order >= 0);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES users(id),
  barber_id uuid NOT NULL REFERENCES users(id),
  service_id uuid NOT NULL REFERENCES services(id),
  start_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 1000000),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_id <> barber_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_active_idx ON users(role, active);
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users ((regexp_replace(phone, '[^0-9]', '', 'g'))) WHERE regexp_replace(phone, '[^0-9]', '', 'g') <> '';
CREATE INDEX IF NOT EXISTS appointments_barber_start_idx ON appointments(barber_id, start_at) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS appointments_client_start_idx ON appointments(client_id, start_at);
CREATE INDEX IF NOT EXISTS appointments_service_idx ON appointments(service_id);
CREATE INDEX IF NOT EXISTS appointments_start_idx ON appointments(start_at);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS reset_tokens_user_idx ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS time_blocks (
  id uuid PRIMARY KEY,
  barber_id uuid NOT NULL REFERENCES users(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL CHECK (end_at > start_at),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_blocks_barber_start_idx ON time_blocks(barber_id, start_at);
