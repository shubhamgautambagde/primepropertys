// Shared input validation for property writes (Stage F).
// Returns { ok, errors, clean }. For PATCH, `partial` allows missing fields;
// for POST, required fields must be present.

export const PROPERTY_TYPES = ['Apartment', 'Villa', 'Plot', 'Builder Floor', 'House', 'Commercial'];
export const LISTING_TYPES = ['sale', 'rent'];

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
    errors.push(`property_type must be one of: ${PROPERTY_TYPES.join(', ')}`);
  } else clean.property_type = b.property_type;
  if (b.listing_type === undefined) {
    if (!partial) errors.push('listing_type is required');
  } else if (!LISTING_TYPES.includes(b.listing_type)) {
    errors.push('listing_type must be sale or rent');
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
