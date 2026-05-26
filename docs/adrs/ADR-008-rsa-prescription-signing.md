# ADR-008: Firma electrónica RSA-2048/SHA-256 para recetas digitales

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

Requerimiento funcional IV: *"El sistema debe emitir recetas digitales firmadas electrónicamente (con validez legal), enviadas directamente a la farmacia seleccionada por el paciente."*

En el contexto latinoamericano la firma digital con validez legal exige:
1. **Confidencialidad e integridad del payload** (no alterable).
2. **No repudio** (vinculación al firmante).
3. **Verificación independiente** por terceros (farmacias, auditores).
4. **Hash determinístico** sobre el payload.

## Decisión

- **Algoritmo**: `RSA-2048` + `SHA-256` (estándar RFC 8017 / X.509).
- **Par de claves**: generado por `prescription-service` al arrancar; en producción se reemplaza por **HSM/KMS** con clave persistente del prestador (MediConnect S.A.S. en representación delegada del médico).
- **Payload canonical**: JSON con **claves ordenadas alfabéticamente** (canonicalización) para garantizar `payload_hash` reproducible.
- Campos persistidos: `signature` (base64), `payload_hash` (sha256 hex), `signature_algorithm`, `public_key_id` (primeros 16 hex de SHA-256 de la clave pública → permite rotación).
- `GET /prescriptions/public-key` publica la clave pública en formato PEM para verificación offline por farmacias o auditores.
- `GET /prescriptions/:id/verify` valida la firma y reporta si la receta está expirada.

## Consecuencias

✅ Cumple validez legal (firma asimétrica reconocida internacionalmente).
✅ No repudio: la farmacia puede demostrar que recibió una receta auténtica.
✅ Auditable: el hash se persiste, cualquier cambio en `prescriptions`/`prescription_items` rompe la verificación.
⚠️ Si la clave se ve comprometida hay que revocar y re-emitir → mitigado con `public_key_id` que permite rotación con histórico.
⚠️ El payload firmado incluye snapshot de paciente y médico al momento de la firma → cambios futuros en `patient`/`doctor` no rompen la verificación.
