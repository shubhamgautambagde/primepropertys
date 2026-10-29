-- 018_search_filters_index: index for the Priority 1 server-side search
-- filters (bedrooms / area / possession). Status-first so the public
-- list (published only) can use it; CREATE INDEX IF NOT EXISTS keeps
-- this safe on existing databases.
CREATE INDEX IF NOT EXISTS idx_properties_search_filters
  ON properties (status, bedrooms, area_sqft, possession_status);
