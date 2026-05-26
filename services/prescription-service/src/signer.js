// === Firma electrónica RSA-SHA256 para validez legal de la receta ===
// En producción: la clave privada vive en HSM/KMS, nunca en disco.
const crypto = require('crypto');

let keyPair = null;
let publicKeyId = null;

function initKeyPair() {
  // Generamos el par al arrancar el servicio (en prod: cargar de KMS)
  keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  publicKeyId = crypto.createHash('sha256').update(keyPair.publicKey).digest('hex').substring(0, 16);
  console.log(`[signer] RSA-2048 keypair generado (kid=${publicKeyId})`);
  return keyPair;
}

function getPublicKey() {
  return { publicKey: keyPair.publicKey, kid: publicKeyId };
}

function canonicalize(obj) {
  // JSON canónico: claves ordenadas → garantiza hash determinístico
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

function hashPayload(payload) {
  const canonical = canonicalize(payload);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function signPayload(payload) {
  const canonical = canonicalize(payload);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(canonical);
  signer.end();
  const signature = signer.sign(keyPair.privateKey, 'base64');
  return {
    signature,
    payload_hash: crypto.createHash('sha256').update(canonical).digest('hex'),
    algorithm: 'RSA-SHA256',
    public_key_id: publicKeyId,
  };
}

function verifySignature(payload, signature) {
  const canonical = canonicalize(payload);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(canonical);
  verifier.end();
  return verifier.verify(keyPair.publicKey, signature, 'base64');
}

module.exports = { initKeyPair, getPublicKey, signPayload, verifySignature, hashPayload };
