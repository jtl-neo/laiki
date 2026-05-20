CREATE UNIQUE INDEX IF NOT EXISTS groups_line_group_id_unique
  ON groups (line_group_id) WHERE line_group_id IS NOT NULL;
