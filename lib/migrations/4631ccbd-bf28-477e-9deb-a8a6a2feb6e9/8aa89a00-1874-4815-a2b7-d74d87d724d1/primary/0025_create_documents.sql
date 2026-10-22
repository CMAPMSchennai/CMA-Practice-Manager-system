-- @apply
CREATE TABLE IF NOT EXISTS "documents" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "owner_type"      VARCHAR(30) NOT NULL,
  "owner_id"        UUID        NOT NULL,
  "document_type"   VARCHAR(100),
  "file_name"       VARCHAR(500) NOT NULL,
  "file_ref"        TEXT        NOT NULL,
  "file_size_bytes" BIGINT,
  "mime_type"       VARCHAR(100),
  "uploaded_by"     UUID        NOT NULL,
  "expiry_date"     DATE,
  "version"         INTEGER     NOT NULL DEFAULT 0,
  "is_active"       BOOLEAN     NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pk_documents PRIMARY KEY ("id"),

  CONSTRAINT chk_documents_owner_type
    CHECK ("owner_type" IN ('client','employee','engagement')),

  CONSTRAINT chk_documents_document_type
    CHECK ("document_type" IN ('card','engagement')),

  CONSTRAINT fk_documents_uploaded_by
    FOREIGN KEY ("uploaded_by")
    REFERENCES "users" ("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_owner
  ON "documents" ("owner_type", "owner_id");

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by
  ON "documents" ("uploaded_by");

CREATE INDEX IF NOT EXISTS idx_documents_expiry
  ON "documents" ("expiry_date");

-- @rollback
DROP INDEX IF EXISTS idx_documents_expiry;
DROP INDEX IF EXISTS idx_documents_uploaded_by;
DROP INDEX IF EXISTS idx_documents_owner;
DROP TABLE IF EXISTS "documents";