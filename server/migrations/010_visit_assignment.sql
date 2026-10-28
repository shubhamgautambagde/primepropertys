-- Visit-booking finish: an agent (any user, mirroring lead
-- assignment) can be assigned to a visit. Assignment is a
-- visits:manage action (Admin, Super Admin); the assignee
-- gains visibility of the visit, like a lead assignee.
ALTER TABLE site_visits ADD COLUMN assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_site_visits_assigned ON site_visits (assigned_to);
