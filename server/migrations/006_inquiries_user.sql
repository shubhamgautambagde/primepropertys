-- Stage H, Phase 5: link inquiries to the account that sent them, so a
-- buyer can list their own enquiries. Nullable: anonymous inquiries
-- (submitted without a session) stay unlinked and are never exposed
-- through the "mine" endpoint — matching by email would let anyone who
-- registers with someone else's email read their inquiries, so only an
-- explicit user_id link counts.
ALTER TABLE inquiries ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX idx_inquiries_user ON inquiries(user_id);
