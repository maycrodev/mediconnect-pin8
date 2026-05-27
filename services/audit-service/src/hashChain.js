const crypto = require('crypto');

// JSON canónico determinístico (mismas claves ordenadas → mismo hash)
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// hash de una entrada del log = SHA-256(prev_hash || canonical(payload completo))
function computeEntryHash(prevHash, entry) {
  const material = prevHash + canonicalize({
    event_type:    entry.event_type,
    actor_id:      entry.actor_id || null,
    actor_role:    entry.actor_role || null,
    resource_type: entry.resource_type || null,
    resource_id:   entry.resource_id || null,
    patient_id:    entry.patient_id || null,
    payload:       entry.payload,
    source_service: entry.source_service || null,
    created_at:    entry.created_at,
  });
  return sha256(material);
}

module.exports = { canonicalize, sha256, computeEntryHash };
