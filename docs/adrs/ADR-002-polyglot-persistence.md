# ADR-002: Persistencia Poliglota

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

El kata pide: *"La información debe almacenarse en una base de datos apropiada por microservicio (persistencia poliglota)"*. Los datos tienen perfiles muy distintos:

| Dominio | Forma | Acceso | Volumen |
|--------|-------|--------|---------|
| Usuarios/auth | Relacional, integridad ACID | Lecturas frecuentes, escrituras puntuales | Bajo |
| Pacientes/médicos | Relacional, búsquedas estructuradas | Lecturas frecuentes | Medio |
| Citas | Relacional con constraint de unicidad (slot) | ACID requerido | Alto |
| HCE | Documental anidado y heterogéneo | Lecturas pesadas (<150ms) | Muy alto |
| Sesiones video + chunks cifrados | Documental + blobs | Append-heavy | Muy alto |

## Decisión

- **PostgreSQL** → `auth_db`, `patient_db`, `doctor_db`, `appointment_db` (necesidad de transacciones, joins implícitos en consultas, constraints como `UNIQUE(doctor_id,date,time)`).
- **MongoDB** → `medical_history_db`, `video_db` (documentos anidados de tamaño variable, push de chunks, lecturas optimizadas por `patientId` indexado).
- **Redis** → cache de slots disponibles y rate-limit (reservado para MVPs 2-3).

Cada base corre en su **propio contenedor**, sin compartir conexiones entre microservicios (regla "una base por servicio").

## Consecuencias

✅ Cada tecnología elige lo mejor de su modelo.
✅ Escalado de MongoDB independiente del resto.
✅ Cumple la rúbrica.
⚠️ Más motores que operar → mitigado: PostgreSQL y MongoDB son ampliamente soportados gestionados (RDS, Atlas).
⚠️ No hay JOINs cross-service → resuelto con composición en el cliente / gateway y eventos.
