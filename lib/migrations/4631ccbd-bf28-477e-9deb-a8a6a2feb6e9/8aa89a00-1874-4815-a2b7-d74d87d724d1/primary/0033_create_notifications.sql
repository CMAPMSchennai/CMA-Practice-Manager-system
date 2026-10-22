-- @apply
CREATE TABLE IF NOT EXISTS "notifications" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel"      VARCHAR(20) NOT NULL,
  "recipient_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "template"     VARCHAR(100) NOT NULL,
  "subject"      VARCHAR(500),
  "body"         TEXT,
  "data"         JSONB,
  "status"       VARCHAR(20) NOT NULL DEFAULT 'pending',
  "sent_at"      TIMESTAMPTZ,
  "read_at"      TIMESTAMPTZ,
  "error"        TEXT,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_notifications_channel CHECK (channel IN ('in_app','email')),
  CONSTRAINT chk_notifications_status CHECK (status IN ('pending','sent','delivered','read','failed'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON "notifications" ("recipient_id");
CREATE INDEX IF NOT EXISTS idx_notifications_status ON "notifications" ("status");
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_status ON "notifications" ("recipient_id", "status");

-- @rollback
DROP INDEX IF EXISTS idx_notifications_recipient_status;
DROP INDEX IF EXISTS idx_notifications_status;
DROP INDEX IF EXISTS idx_notifications_recipient;
DROP TABLE IF EXISTS "notifications";