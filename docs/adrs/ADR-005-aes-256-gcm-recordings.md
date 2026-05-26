# ADR-005: Cifrado AES-256-GCM para grabaciones de videoconsulta

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

Requerimiento funcional II y NF de cumplimiento HIPAA/GDPR: *"El sistema debe soportar videoconsultas en tiempo real con grabación cifrada y almacenamiento seguro de la sesión"*.

## Decisión

- Las grabaciones se **fragmentan en chunks** y cada chunk se cifra con **AES-256-GCM** (cifrado autenticado: confidencialidad + integridad).
- Por chunk se guarda: `ciphertext` (b64), `iv` (12 bytes b64), `tag` (auth tag b64), `algorithm`, `sequence`.
- Clave maestra inyectada por variable de entorno (`ENCRYPTION_KEY`). En producción se rota mediante **KMS** y se usa **envelope encryption**: clave del data record cifrada con la CMK.
- En el endpoint de descarga (`GET /sessions/:roomId/recording`) se descifra solo si el caller tiene rol autorizado (vía gateway).

## Consecuencias

✅ Cumple HIPAA/GDPR equivalente en confidencialidad e integridad de la consulta.
✅ Per-chunk encryption permite streaming sin re-cifrar todo.
✅ GCM detecta tampering vía `auth tag`.
⚠️ Almacenar grandes blobs en MongoDB no es ideal → en prod se mueve a S3 con SSE-KMS, el documento solo guarda referencias.
⚠️ Custodia de claves crítica → ADR de KMS pendiente para prod.
