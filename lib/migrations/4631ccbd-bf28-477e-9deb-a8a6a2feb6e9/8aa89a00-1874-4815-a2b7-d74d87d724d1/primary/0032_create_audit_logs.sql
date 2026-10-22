-- @apply
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "action"        VARCHAR(50) NOT NULL DEFAULT 'create',
  "entity_type"   VARCHAR(100) NOT NULL,
  "entity_id"     UUID,
  "field_changes" JSONB,
  "user_id"       UUID,
  "ip_address"    VARCHAR(45),
  "user_agent"    TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_audit_logs_action CHECK (action IN ('create','update','delete','status_change','login','logout','permission_change','salary_release','override')),
  CONSTRAINT chk_audit_logs_entity_type CHECK (entity_type IN ('clients','task_instances','invoices')),
  CONSTRAINT fk_audit_logs_user_id FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON "audit_logs" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON "audit_logs" ("user_id");
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON "audit_logs" ("action");

-- @rollback
DROP INDEX IF EXISTS idx_audit_logs_action;
DROP INDEX IF EXISTS idx_audit_logs_user;
DROP INDEX IF EXISTS idx_audit_logs_entity;
DROP TABLE IF EXISTS "audit_logs";