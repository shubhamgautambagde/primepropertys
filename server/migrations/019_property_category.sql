-- 019_property_category: persist the wizard's category choice
-- (residential / commercial / land / project) on the property row.
-- Previously the choice lived only in browser sessionStorage and was
-- dropped on draft creation. Nullable, so existing listings are
-- unaffected; validation in validate.js restricts values.
ALTER TABLE properties ADD COLUMN category TEXT;
