# ADR-010: MongoDB Time-Series Collection para métricas IoT

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

Req VI: el módulo de enfermedades crónicas recibe métricas continuas desde glucómetros, tensiómetros y pulsioxímetros conectados. Cada dispositivo puede generar varias lecturas por hora; con miles de pacientes crónicos esto escala a **millones de mediciones por día**.

El acceso típico es:
- Append-only (los dispositivos solo escriben).
- Lectura por `patientId + ventana de tiempo` (ej. últimas 24h).
- Compresión esencial: las lecturas consecutivas son muy similares.

Opciones evaluadas:
- InfluxDB / TimescaleDB (purpose-built TSDB)
- MongoDB Time-Series Collection (≥ Mongo 6)
- Reusar PostgreSQL con tabla particionada

## Decisión

Usamos **MongoDB Time-Series Collection** nativa (Mongo 6+):

```js
db.createCollection('metrics', {
  timeseries: { timeField: 'ts', metaField: 'meta', granularity: 'seconds' },
  expireAfterSeconds: 60*60*24*365   // 1 año
})
```

- `meta` agrupa `{patientId, deviceType, deviceId}` → Mongo agrupa físicamente las lecturas del mismo "stream" y comprime fuertemente.
- Índices: `{ 'meta.patientId': 1, ts: -1 }` y `{ 'meta.deviceType': 1, ts: -1 }`.
- TTL automático elimina datos viejos sin job manual.

## Razones para esta elección sobre TSDBs dedicadas

- **Operacionalmente más simple**: ya operamos Mongo en el stack (HCE, video, lab).
- **El equipo conoce Mongo** → menos overhead de capacitación.
- **Performance suficiente** para 15M pacientes con monitoreo selectivo de crónicos.
- **Compresión nativa** comparable a InfluxDB para este volumen.
- En el **futuro** se puede migrar a InfluxDB/Timescale si el throughput crece (documentado en deployment.md).

## Consecuencias

✅ Mismo motor que MVP 1-2 → menos diversidad operativa.
✅ Compresión y TTL automáticos.
✅ Aggregations nativas (`$group`, `$bucket`) para gráficos.
⚠️ Para escalar realmente a millones de eventos/seg podría requerir sharding o migración a TSDB pura.
⚠️ Limitaciones: no se pueden crear índices arbitrarios sobre el `timeField`, solo sobre `metaField`.
