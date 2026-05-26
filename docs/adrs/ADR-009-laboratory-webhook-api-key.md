# ADR-009: Webhook con API key para laboratorios externos

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

Requerimiento funcional V: *"Debe integrarse con laboratorios clínicos externos para recepción automática de resultados de exámenes."*

Los laboratorios son partners externos heterogéneos (San Martín, AngloLab, ROE, etc.). Cada uno tiene su propio sistema y nos enviará resultados. No son usuarios humanos, por lo que el modelo JWT no aplica.

## Decisión

- **Endpoint público de ingreso**: `POST /lab/results`
- **Autenticación por API key**: header `x-lab-api-key` validado contra un set configurable (`LAB_API_KEYS` env var).
- **Mapeo API key → nombre de laboratorio** para tagear cada resultado con su origen (auditoría y trust).
- **Idempotencia** vía `external_lab_order_id` único.
- **Procesamiento en dos fases**:
  1. **Recepción rápida (HTTP 202)**: persistencia bruta del payload + encolado.
  2. **Worker asíncrono**: valida valores numéricos contra rangos de referencia, marca anormales y publica `lab.result.received`.
- Resultados rechazados quedan en MongoDB con `processing_errors` para auditoría manual.

## Por qué no mTLS / OAuth en este MVP

- mTLS: requiere PKI completa, infra de provisioning de certs por partner — sobre-ingeniería para el hackaton; se documenta como evolución.
- OAuth client_credentials: implica IdP, más rondas-trip; conveniente cuando hay rotación frecuente. Las API keys con rotación y por-partner cumplen para el MVP.

## Consecuencias

✅ Onboarding de un laboratorio: añadir clave al env y reiniciar.
✅ La recepción no se bloquea por validación lenta → throughput alto.
✅ Cualquier resultado fuera de rango queda tageado `abnormal=true`, lo cual alimentará el módulo de alertas del MVP 3.
⚠️ API keys requieren rotación + monitoreo de abuso → mitigación: usage tracking por partner (futuro).
⚠️ El payload "crudo" se persiste para auditoría → costo de almacenamiento controlado en MongoDB.
