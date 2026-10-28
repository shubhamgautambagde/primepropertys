-- Post-property wizard fields (autopilot slice 4). Every column
-- below holds a value the wizard's own forms collect; nothing here
-- is sample data. All columns are nullable (or defaulted flags) so
-- existing listings are unaffected, and every field is optional in
-- validation: the wizard PATCHes them step by step onto a draft.
-- Binary uploads (photos, floor plans, documents) are deliberately
-- NOT added: binary upload is not implemented, and no column here
-- pretends otherwise. Photos stay URL references via property_images.
ALTER TABLE properties ADD COLUMN facing TEXT;
ALTER TABLE properties ADD COLUMN property_age TEXT;
ALTER TABLE properties ADD COLUMN possession_status TEXT;
ALTER TABLE properties ADD COLUMN furnishing_status TEXT;
ALTER TABLE properties ADD COLUMN floor_number INTEGER;
ALTER TABLE properties ADD COLUMN total_floors INTEGER;
ALTER TABLE properties ADD COLUMN unit_number TEXT;
ALTER TABLE properties ADD COLUMN approval_by TEXT;
ALTER TABLE properties ADD COLUMN balconies INTEGER;
ALTER TABLE properties ADD COLUMN servant_room INTEGER;
ALTER TABLE properties ADD COLUMN is_corner INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN is_gated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN has_lift INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN has_reserved_parking INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN open_parking INTEGER;
ALTER TABLE properties ADD COLUMN covered_parking INTEGER;
ALTER TABLE properties ADD COLUMN builtup_area_sqft INTEGER;
ALTER TABLE properties ADD COLUMN carpet_area_sqft INTEGER;
ALTER TABLE properties ADD COLUMN plot_area_sqft INTEGER;
ALTER TABLE properties ADD COLUMN area_unit TEXT;
ALTER TABLE properties ADD COLUMN price_per_sqft_inr INTEGER;
ALTER TABLE properties ADD COLUMN price_negotiable TEXT;
ALTER TABLE properties ADD COLUMN maintenance_monthly_inr INTEGER;
ALTER TABLE properties ADD COLUMN deposit TEXT;
ALTER TABLE properties ADD COLUMN ownership TEXT;
ALTER TABLE properties ADD COLUMN transaction_type TEXT;
ALTER TABLE properties ADD COLUMN amenities TEXT;
ALTER TABLE properties ADD COLUMN video_url TEXT;
ALTER TABLE properties ADD COLUMN video_url_2 TEXT;
ALTER TABLE properties ADD COLUMN tour_360_url TEXT;
ALTER TABLE properties ADD COLUMN floor_plan_title TEXT;
ALTER TABLE properties ADD COLUMN floor_plan_title_2 TEXT;
ALTER TABLE properties ADD COLUMN owner_name TEXT;
ALTER TABLE properties ADD COLUMN owner_type TEXT;
ALTER TABLE properties ADD COLUMN owner_phone TEXT;
ALTER TABLE properties ADD COLUMN owner_email TEXT;
ALTER TABLE properties ADD COLUMN contact_phone_calls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN contact_whatsapp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN contact_email INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN contact_site_visits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN contact_time TEXT;
ALTER TABLE properties ADD COLUMN response_language TEXT;
ALTER TABLE properties ADD COLUMN hide_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN pincode TEXT;
ALTER TABLE properties ADD COLUMN address_line TEXT;
ALTER TABLE properties ADD COLUMN project_name TEXT;
ALTER TABLE properties ADD COLUMN super_builtup_area_sqft INTEGER;
ALTER TABLE properties ADD COLUMN terrace_area_sqft INTEGER;
ALTER TABLE properties ADD COLUMN garden_area_sqft INTEGER;
ALTER TABLE properties ADD COLUMN dimensions TEXT;
ALTER TABLE properties ADD COLUMN area_notes TEXT;
ALTER TABLE properties ADD COLUMN availability TEXT;
