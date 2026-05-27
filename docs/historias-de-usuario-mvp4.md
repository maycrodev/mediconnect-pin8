# Historias de Usuario — MVP 4

## HU-22: Registro inmutable de toda actividad del sistema
**Como** entidad regulatoria (Ministerio de Salud)
**quiero** que toda operación crítica del sistema quede registrada de forma inmutable
**para** poder auditar el cumplimiento HIPAA/GDPR mensualmente.

**Criterios**
- Tabla PostgreSQL `audit_log` **append-only** (UPDATE/DELETE bloqueados por trigger SQL).
- `audit-service` se suscribe a TODOS los eventos del exchange `mediconnect.events` (binding `#`).
- Cada entrada incluye: `event_type`, `actor_id`, `actor_role`, `resource_type`, `resource_id`, `patient_id`, `payload`, `prev_hash`, `entry_hash`, `created_at`.
- Cobertura: `appointment.*`, `prescription.*`, `lab.*`, `iot.*` (metric, alert), `rating.*`, `doctor.*`, `patient.*`, `video.*`, `auth.*`, `hce.accessed`.

## HU-23: Cadena criptográfica de hashes (estilo blockchain ligero)
**Como** auditor escéptico
**quiero** poder detectar si alguien manipuló cualquier entrada del log
**para** confiar plenamente en la trazabilidad.

**Criterios**
- Cada entrada: `entry_hash = SHA-256(prev_hash || canonicalize(payload_completo))`.
- Endpoint `GET /audit/integrity/verify` recorre toda la cadena y reporta discrepancias.
- Si alguien intenta `UPDATE`/`DELETE` directo a la BD → el trigger PostgreSQL lo bloquea con error.
- Si alguien borra una fila (forzando), `prev_hash` deja de coincidir en la siguiente entrada → detectado.
- Si alguien edita un payload (forzando), `entry_hash` recalculado no coincide → detectado.

## HU-24: Acceso de solo lectura al auditor
**Como** auditor del Ministerio de Salud
**quiero** ver y filtrar todos los registros sin poder modificarlos
**para** investigar incidentes y verificar cumplimiento.

**Criterios**
- Rol `AUDITOR` definido en `auth-service`.
- Gateway bloquea `/api/audit/*` para cualquier rol que no sea `AUDITOR` o `ADMIN`.
- Filtros: por `event_type`, `patient_id`, `actor_id`, `resource_type`, ventana temporal (`since`/`until`).
- Vista PostgreSQL `audit_log_readonly` reforzando la semántica de solo lectura.

## HU-25: Auditoría por paciente (timeline completo)
**Como** auditor o paciente que solicita "mis datos" (GDPR)
**quiero** ver todo lo que el sistema sabe y ha hecho con la información de un paciente
**para** cumplir con el derecho de acceso y portabilidad.

**Criterios**
- Endpoint `GET /audit?patient_id=X` devuelve cronología completa: citas, recetas, exámenes, accesos al HCE, métricas IoT, alertas, calificaciones.
- UI auditor: timeline visual con marcadores por evento.

## HU-26: Auditoría de accesos al HCE
**Como** auditor
**quiero** saber quién accedió al HCE de qué paciente y cuándo
**para** detectar accesos no autorizados o curiosity browsing.

**Criterios**
- `medical-history-service` emite `hce.accessed` con `actor_id`, `actor_role`, `patientId`, `endpoint`, `summary_only` cada vez que un médico/enfermero/auditor lee un HCE.
- El `audit-service` consume el evento y lo persiste.
- Filtro `event_type=hce.accessed` en el dashboard auditor.

## HU-27: Estadísticas agregadas para reporte mensual
**Como** Ministerio de Salud
**quiero** un resumen de actividad por tipo de evento y por recurso
**para** generar el reporte mensual exigido por ley.

**Criterios**
- `GET /audit/stats/summary` devuelve totales, distribución por evento y por recurso.
- UI auditor con gráficos de barras y conteos.

## HU-28: Prueba de inmutabilidad para demo
**Como** equipo
**quiero** un endpoint que demuestre que un UPDATE directo es bloqueado
**para** convencer al regulador (y a los profes) de la garantía.

**Criterios**
- `POST /audit/_demo/try-tamper/:seq` ejecuta un UPDATE intencional.
- Retorna 403 con el mensaje del trigger PostgreSQL.
- UI con botón "Intentar UPDATE (debe fallar)".
