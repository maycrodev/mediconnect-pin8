# ADR-004: Patrón Outbox para eventos críticos de salud

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

Cuando `appointment-service` crea una cita debe (a) persistirla en PostgreSQL y (b) publicar `appointment.created` en RabbitMQ. Hacer ambas cosas sin coordinación produce el clásico problema de **doble escritura**: si la base commitea pero el broker se cae, el evento se pierde — y en un sistema de salud eso significa que `medical-history-service` y `videoconsultation-service` no se enteran de la cita.

## Decisión

Implementamos el patrón **Transactional Outbox**:

1. En la **misma transacción** del INSERT en `appointments`, se inserta una fila en la tabla `event_outbox` (`event_type`, `payload`, `published=false`).
2. Un **dispatcher** dentro del servicio corre cada 2s, lee filas con `published=false`, las publica en RabbitMQ y las marca como `published=true`.
3. Si Rabbit está caído, las filas quedan pendientes y se reintentan en el próximo tick → entrega **at-least-once**.

Aplicado en `appointment-service`. Otros servicios (patient, video) usan publicación directa por simplicidad del MVP, asumiendo que la pérdida de un evento `patient.updated` es tolerable (eventual rebuild posible).

## Consecuencias

✅ Garantía de publicación de eventos críticos pese a caídas de Rabbit.
✅ Atomicidad domain + outbox vía transacción SQL.
⚠️ Posible duplicación → consumidores deben ser **idempotentes** (uso de `appointmentId` como clave en HCE).
⚠️ Costo de polling cada 2s → trivial en MVP; en prod se usaría Debezium/CDC.
