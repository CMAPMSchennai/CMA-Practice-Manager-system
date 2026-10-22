-- @apply
-- @transaction single

CREATE TABLE IF NOT EXISTS "engagement_team" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "engagement_id"       UUID NOT NULL
                        REFERENCES "engagements" ("id")
                        ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id"             UUID NOT NULL
                        REFERENCES "users" ("id")
                        ON DELETE CASCADE ON UPDATE CASCADE,
  "role_in_engagement"  VARCHAR(50),
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_engagement_team_role_in_engagement
    CHECK (role_in_engagement IN ('partner','manager','senior','associate','articled_clerk'))
);

CREATE INDEX IF NOT EXISTS idx_engagement_team_engagement
  ON "engagement_team" ("engagement_id");

CREATE INDEX IF NOT EXISTS idx_engagement_team_user
  ON "engagement_team" ("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS idx_engagement_team_unique
  ON "engagement_team" ("engagement_id", "user_id");

-- @rollback
-- @transaction single

DROP INDEX IF EXISTS idx_engagement_team_unique;
DROP INDEX IF EXISTS idx_engagement_team_user;
DROP INDEX IF EXISTS idx_engagement_team_engagement;
DROP TABLE IF EXISTS "engagement_team";