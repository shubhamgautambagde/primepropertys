-- Stage I, Slice 2 (performance): indexes for the hot list queries.
-- Evidence (EXPLAIN QUERY PLAN before this migration, 200-row test
-- tables): the properties list used idx_properties_search on city
-- but a status-only list had no status-first index, and the leads
-- list filtered by status did a full SCAN of inquiries.
-- The new properties index is status-first because every public
-- list filters status='published'; the old city-first index stays
-- for city-first lookups.
CREATE INDEX IF NOT EXISTS idx_properties_status
  ON properties (status, city, property_type, listing_type);
CREATE INDEX IF NOT EXISTS idx_inquiries_assigned ON inquiries (assigned_to);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries (status);
CREATE INDEX IF NOT EXISTS idx_inquiries_source ON inquiries (source);
CREATE INDEX IF NOT EXISTS idx_lead_followups_due ON lead_followups (due_at);
