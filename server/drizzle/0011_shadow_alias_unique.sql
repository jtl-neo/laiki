-- One alias per creator: backs the resolveOrCreateShadow concurrency fix
-- (insert .. ON CONFLICT DO NOTHING needs an arbiter for racing resolves).
CREATE UNIQUE INDEX IF NOT EXISTS "users_created_by_display_name_unique"
  ON "users" ("created_by", "display_name")
  WHERE "created_by" IS NOT NULL;
