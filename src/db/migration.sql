CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS workspaces (id text PRIMARY KEY, name text NOT NULL, demo boolean NOT NULL DEFAULT false, profile jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS members (workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE, user_id text REFERENCES users(id) ON DELETE CASCADE, role text NOT NULL CHECK(role IN ('owner','admin','agent','analyst','viewer')), PRIMARY KEY(workspace_id,user_id));
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE, workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE, csrf text NOT NULL, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
-- Workspace-owned documents have stable IDs and tenant-local composite keys. Foreign
-- references inside documents are validated by repositories before writing.
CREATE TABLE IF NOT EXISTS records (workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE, kind text NOT NULL, id text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,kind,id));
CREATE INDEX IF NOT EXISTS records_kind_date ON records(workspace_id,kind,created_at DESC,id);
CREATE INDEX IF NOT EXISTS records_conversation ON records(workspace_id,(data->>'conversationId'),created_at) WHERE kind='messages';
CREATE UNIQUE INDEX IF NOT EXISTS contacts_identity ON records(workspace_id,(data->>'accountId'),(data->>'externalId')) WHERE kind='contacts';
CREATE INDEX IF NOT EXISTS conversations_status ON records(workspace_id,(data->>'status'),(data->>'updatedAt')) WHERE kind='conversations';
CREATE TABLE IF NOT EXISTS events (workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE, account_id text NOT NULL, id text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,account_id,id));
CREATE TABLE IF NOT EXISTS jobs (id text PRIMARY KEY, workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), error_code text);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(status,available_at);
CREATE TABLE IF NOT EXISTS deliveries (id text PRIMARY KEY, workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE, resource_id text NOT NULL, contact_id text NOT NULL, rule_id text NOT NULL, platform text NOT NULL, url text NOT NULL, tracking boolean NOT NULL, clicks integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS deliveries_contact_resource ON deliveries(workspace_id,contact_id,resource_id);
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS oauth_attempts (
  state_hash text PRIMARY KEY, binding_hash text NOT NULL, provider text NOT NULL,
  verifier text NOT NULL, nonce text NOT NULL, mode text NOT NULL CHECK(mode IN ('login','connect')),
  session_hash text, user_id text REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_attempt_expiry ON oauth_attempts(expires_at);
CREATE TABLE IF NOT EXISTS social_identities (
  provider text NOT NULL, subject text NOT NULL, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, PRIMARY KEY(provider, subject)
);
CREATE TABLE IF NOT EXISTS social_connections (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL, subject text NOT NULL, external_id text NOT NULL, name text NOT NULL,
  encrypted_tokens text NOT NULL, expires_at timestamptz, connected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, provider, external_id)
);
INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;

ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS publishing_requested boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS scheduled_posts (
 id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 author_id text NOT NULL REFERENCES users(id), content jsonb NOT NULL,
 status text NOT NULL, scheduled_at timestamptz, timezone text NOT NULL,
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_posts_workspace ON scheduled_posts(workspace_id,created_at DESC);
CREATE TABLE IF NOT EXISTS post_targets (
 id text PRIMARY KEY, post_id text NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
 platform text NOT NULL, connection_id text, name text NOT NULL, demo boolean NOT NULL,
 status text NOT NULL, detail text NOT NULL DEFAULT '', remote_id text, claimed_at timestamptz,
 UNIQUE(post_id,platform)
);
CREATE INDEX IF NOT EXISTS post_targets_ready ON post_targets(status,post_id);
INSERT INTO schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS post_media (
 id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 mime text NOT NULL, size integer NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_delivery_tokens (
 token text PRIMARY KEY, media_id text NOT NULL REFERENCES post_media(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);

-- Relay uses server sessions, not Supabase browser JWTs. No Data API policies.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_delivery_tokens ENABLE ROW LEVEL SECURITY;
