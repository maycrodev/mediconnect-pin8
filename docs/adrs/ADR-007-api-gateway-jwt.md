# ADR-007: API Gateway + JWT como mecanismo de identidad

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

Tenemos múltiples microservicios y dos clases de clientes (paciente, médico/staff). Necesitamos:
- Un único punto de entrada para el frontend (simplifica CORS, observabilidad y rate-limiting).
- Identidad transportable entre servicios sin compartir sesión.
- Soporte para auditoría: cada llamada debe poder atribuirse a un usuario y rol.

## Decisión

- **API Gateway** (`api-gateway`) basado en Express + `http-proxy-middleware`.
- **JWT HS256** firmado por `auth-service`. En prod se migra a **RS256** + JWKS para no compartir secret.
- El gateway:
  - Valida JWT en cada request (excepto `/auth/*`).
  - Inyecta cabeceras `x-user-id`, `x-user-role`, `x-user-ref` al downstream → los servicios no re-validan, confían en el gateway (red interna privada).
- Roles transportados en el claim `role`: `PACIENTE`, `MEDICO`, `ENFERMERO`, `AUDITOR`, `ADMIN`.

## Consecuencias

✅ Stateless: el servicio puede escalar sin sticky sessions.
✅ Authz por rol centralizada en gateway, granularidad fina en cada servicio.
✅ Las cabeceras inyectadas alimentan auditoría (MVP 4).
⚠️ Comprometer el secret expone todo → mitigación: rotación + RS256 en prod.
⚠️ El gateway es un SPOF → en prod va detrás de LB con N réplicas.
