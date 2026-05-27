# ADR-011: CEP en streaming para alertas IoT

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

Req VII: el sistema debe **enviar alertas automáticas a médicos cuando los valores de un paciente crónico salgan de rangos predefinidos**.

Esto es un caso clásico de **Complex Event Processing (CEP)**: evaluar reglas sobre un stream de eventos en near-real-time. Opciones consideradas:
- Apache Flink / Kafka Streams — overkill para el volumen del MVP.
- Reglas en cron job que escanea periódicamente la BD — alta latencia.
- **Consumer en streaming**: cada evento `iot.metric.received` dispara la evaluación de reglas inmediatamente.

## Decisión

`alert-service` implementa un **CEP simple en streaming**:

1. Se suscribe a la routing key `iot.metric.received` en RabbitMQ.
2. Para cada evento: carga reglas activas aplicables (globales + del paciente).
3. Aplica el comparador (`>`, `<`, `>=`, `<=`, `==`) contra `threshold`.
4. Si la regla matchea **y no hay una alerta `ABIERTA` para esa combinación paciente+regla**, crea la alerta y publica `iot.alert.triggered`.

Idempotencia: el estado abierto de la alerta evita disparar la misma 100 veces seguidas si las lecturas siguen fuera de rango. La alerta se resuelve manualmente por el médico (cambia status, evento `iot.alert.resolved`).

## Severidades

- **CRITICAL**: requiere intervención inmediata (hipoglucemia, crisis hipertensiva, SpO₂<92).
- **WARNING**: requiere atención no urgente (SpO₂<95, taquicardia).
- **INFO**: solo informativo.

## Consecuencias

✅ Latencia desde lectura → alerta < 1s (limitada por broker).
✅ Cero polling de la BD.
✅ Reglas editables en runtime (no hay que redeployar).
✅ Escala horizontal: varios pods del alert-service pueden compartir la cola.
⚠️ Reglas complejas multi-evento (ej. "3 lecturas altas en 10 min") requerirían un motor real (Flink). Para esos casos se documenta evolución.
⚠️ El estado "alerta abierta" vive en MongoDB → si crece mucho conviene archivado periódico.
