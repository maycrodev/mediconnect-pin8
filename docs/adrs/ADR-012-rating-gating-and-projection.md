# ADR-012: Gating de calificaciones y proyección a doctor-service

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

Req VIII: *"Los pacientes deben poder calificar la atención recibida; el sistema consolida métricas de calidad por médico"*. Dos problemas:

1. **Anti-fraude**: solo debería poder calificar el paciente que realmente fue atendido.
2. **Consistencia eventual**: el `doctor-service` ya tenía un campo `rating` (placeholder MVP 1) — debe mantenerse sincronizado con la verdad del `rating-service`.

## Decisión

### Gating sincrónico

Al crear un rating, `rating-service` llama síncronamente a `appointment-service` con:
```
GET {APPOINTMENT_SERVICE_URL}/appointments/{appointment_id}
```
Y valida:
- La cita existe (HTTP 200).
- `status === 'COMPLETADA'`.
- Toma `patient_id` y `doctor_id` de la respuesta (no del request del cliente) → previene spoofing.

Si no se cumple, devuelve HTTP 409.

### Unicidad

PK `appointment_id UNIQUE` → una cita = una calificación. Si el paciente intenta recalificar, devuelve 409.

### Proyección al doctor-service

Cuando se inserta un rating:
1. Misma transacción SQL: recalcular agregado en `doctor_rating_summary` (avg, count).
2. Insertar evento en `event_outbox` con tipo `doctor.rating.updated`.
3. Dispatcher publica el evento en RabbitMQ.
4. `doctor-service` consume y actualiza su columna `rating` (lectura rápida desde su propia BD, sin cross-service joins).

Esto es un **patrón de proyección read-model** — `doctor-service` mantiene una vista materializada local de los ratings sin acoplarse al esquema de `rating-service`.

## Consecuencias

✅ Imposible calificar sin haber tenido cita real y COMPLETADA.
✅ El `doctor.rating` se mantiene consistente con eventual consistency baja (<3s con outbox a 2s).
✅ Cada servicio puede evolucionar su BD sin romper al otro.
⚠️ Si `appointment-service` está caído, no se pueden crear ratings → aceptable (es write infrecuente).
⚠️ Si se pierde el evento `doctor.rating.updated`, el `doctor.rating` queda desactualizado → mitigado por Outbox + dispatcher.
