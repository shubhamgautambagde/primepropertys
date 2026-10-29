-- 028_newest_index: Priority 4 performance.
-- Evidence (EXPLAIN QUERY PLAN on a fresh migrated DB, 2026-10-28):
-- the default public list (status='published', ORDER BY id DESC, LIMIT 20)
-- used idx_properties_search_filters and then "USE TEMP B-TREE FOR ORDER BY".
-- The default sort is newest-first, so a status+id index lets SQLite scan
-- in order instead of sorting the filtered set. No query changes; the
-- existing search-filter index is kept for filtered queries.
CREATE INDEX IF NOT EXISTS idx_properties_newest
  ON properties (status, id DESC);
