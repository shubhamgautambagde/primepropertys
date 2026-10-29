// Shared input validation for property writes (Stage F).
// Returns { ok, errors, clean }. For PATCH, `partial` allows missing fields;
// for POST, required fields must be present.

// Extended 2026-10-29 (migration 029, user decision: extend via table
// rebuild): PG / Office / Shop / Warehouse are real property types and
// lease is a real listing type — they were wizard choice cards all along
// and must no longer be rejected.
export const PROPERTY_TYPES = ['Apartment', 'Villa', 'Plot', 'Builder Floor', 'House', 'Commercial', 'PG', 'Office', 'Shop', 'Warehouse'];
export const LISTING_TYPES = ['sale', 'rent', 'lease'];

function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

function str(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}

export function validatePropertyInput(body, partial = false) {
  const errors = [];
  const clean = {};
  const b = body && typeof body === 'object' ? body : {};

  function reqStr(field, max) {
    if (b[field] === undefined) {
      if (!partial) errors.push(`${field} is required`);
      return;
    }
    if (!str(b[field], max)) errors.push(`${field} must be non-empty text up to ${max} characters`);
    else clean[field] = b[field].trim();
  }
  function optStr(field, max) {
    if (b[field] === undefined || b[field] === null || b[field] === '') return;
    if (typeof b[field] !== 'string' || b[field].length > max) errors.push(`${field} must be text up to ${max} characters`);
    else clean[field] = b[field].trim();
  }
  function optInt(field, min, max) {
    if (b[field] === undefined || b[field] === null || b[field] === '') return;
    if (!isInt(b[field]) || b[field] < min || b[field] > max) errors.push(`${field} must be an integer between ${min} and ${max}`);
    else clean[field] = b[field];
  }

  reqStr('title', 200);
  optStr('description', 5000);
  if (b.property_type === undefined) {
    if (!partial) errors.push('property_type is required');
  } else if (!PROPERTY_TYPES.includes(b.property_type)) {
    errors.push(`property_type '${b.property_type}' is not supported — must be one of: ${PROPERTY_TYPES.join(', ')}`);
  } else clean.property_type = b.property_type;
  if (b.listing_type === undefined) {
    if (!partial) errors.push('listing_type is required');
  } else if (!LISTING_TYPES.includes(b.listing_type)) {
    errors.push(`listing_type '${b.listing_type}' is not supported — must be one of: ${LISTING_TYPES.join(', ')}`);
  } else clean.listing_type = b.listing_type;
  if (b.price_inr === undefined) {
    if (!partial) errors.push('price_inr is required');
  } else if (!isInt(b.price_inr) || b.price_inr <= 0 || b.price_inr > 100_000_000_000) {
    errors.push('price_inr must be a positive integer up to 100000000000');
  } else clean.price_inr = b.price_inr;
  reqStr('city', 100);
  optStr('locality', 100);
  optInt('area_sqft', 0, 1_000_000);
  optInt('bedrooms', 0, 50);
  optInt('bathrooms', 0, 50);

  // Post-property wizard fields (migration 017). All optional:
  // the wizard PATCHes them step by step onto a draft.
  const optStrs = {
    facing: 50, property_age: 50, possession_status: 50, furnishing_status: 50,
    unit_number: 50, approval_by: 100, area_unit: 20, price_negotiable: 50,
    deposit: 100, ownership: 100, transaction_type: 100, video_url: 500,
    video_url_2: 500, tour_360_url: 500, floor_plan_title: 200,
    floor_plan_title_2: 200, owner_name: 200, owner_type: 100,
    owner_phone: 50, contact_time: 50, response_language: 50,
    pincode: 20, address_line: 500, project_name: 200, dimensions: 200,
    area_notes: 1000, availability: 50,
  };
  for (const [field, max] of Object.entries(optStrs)) optStr(field, max);
  if (b.category !== undefined && b.category !== null && b.category !== '') {
    if (typeof b.category !== 'string' || !['residential', 'commercial', 'land', 'project'].includes(b.category.trim())) {
      errors.push(`category '${b.category}' is not supported — must be one of: residential, commercial, land, project`);
    } else clean.category = b.category.trim();
  }
  const optInts = {
    floor_number: [0, 200], total_floors: [0, 200], balconies: [0, 50],
    servant_room: [0, 20], open_parking: [0, 100], covered_parking: [0, 100],
    builtup_area_sqft: [0, 1_000_000], carpet_area_sqft: [0, 1_000_000],
    super_builtup_area_sqft: [0, 1_000_000], terrace_area_sqft: [0, 1_000_000],
    garden_area_sqft: [0, 1_000_000],
    plot_area_sqft: [0, 1_000_000], price_per_sqft_inr: [0, 100_000_000],
    maintenance_monthly_inr: [0, 100_000_000],
  };
  for (const [field, [min, max]] of Object.entries(optInts)) optInt(field, min, max);
  // 0/1 flags: accept 0, 1, true, false.
  const flags = ['is_corner', 'is_gated', 'has_lift', 'has_reserved_parking',
    'contact_phone_calls', 'contact_whatsapp', 'contact_email',
    'contact_site_visits', 'hide_number'];
  for (const field of flags) {
    if (b[field] === undefined || b[field] === null || b[field] === '') continue;
    if (b[field] === true || b[field] === 1 || b[field] === '1') clean[field] = 1;
    else if (b[field] === false || b[field] === 0 || b[field] === '0') clean[field] = 0;
    else errors.push(`${field} must be 0 or 1`);
  }
  if (b.owner_email !== undefined && b.owner_email !== null && b.owner_email !== '') {
    if (typeof b.owner_email !== 'string' || b.owner_email.length > 200 ||
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.owner_email)) {
      errors.push('owner_email must be a valid email address up to 200 characters');
    } else clean.owner_email = b.owner_email.trim();
  }
  if (b.amenities !== undefined && b.amenities !== null && b.amenities !== '') {
    const list = Array.isArray(b.amenities) ? b.amenities : null;
    if (!list || list.some((a) => typeof a !== 'string' || !a.trim() || a.length > 100) || list.length > 50) {
      errors.push('amenities must be an array of up to 50 names, each up to 100 characters');
    } else clean.amenities = JSON.stringify([...new Set(list.map((a) => a.trim()))]);
  }

  return { ok: errors.length === 0, errors, clean };
}

export function validateImageUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    return 'url must be non-empty text up to 2048 characters';
  }
  let u;
  try {
    u = new URL(value);
  } catch {
    return 'url must be a valid absolute URL';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'url must use http or https';
  if (u.username || u.password) return 'url must not contain credentials';
  return null;
}
