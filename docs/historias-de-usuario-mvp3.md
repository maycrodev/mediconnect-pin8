# Historias de Usuario — MVP 3

## HU-15: Ingesta de métricas IoT de pacientes crónicos (Req VI)
**Como** dispositivo IoT (glucómetro, tensiómetro, pulsioxímetro) en el hogar del paciente
**quiero** enviar mediciones al sistema MediConnect
**para** que el médico tratante pueda monitorear al paciente crónico en tiempo casi real.

**Criterios**
- Endpoint `POST /metrics` con header `x-device-key` (autenticación de dispositivo).
- 3 tipos de dispositivos soportados: `glucometer`, `bp_monitor`, `oximeter`.
- Almacenamiento en **MongoDB Time-Series Collection** (`metrics`) con `timeField=ts` y `metaField=meta`.
- Retención automática 1 año vía `expireAfterSeconds`.
- Endpoint **batch** (`POST /metrics/batch`) para sincronización diferida en zonas rurales (modo offline-first).
- Publica evento `iot.metric.received` por cada lectura.

## HU-16: Configuración de reglas de alerta
**Como** administrador clínico
**quiero** definir umbrales por métrica y severidad (CRITICAL/WARNING/INFO)
**para** que el sistema sepa cuándo emitir alertas.

**Criterios**
- Reglas globales por defecto (sembradas al arrancar):
  - Glucosa > 180 → CRITICAL (hiperglucemia severa)
  - Glucosa < 70 → CRITICAL (hipoglucemia)
  - Sistólica ≥ 160 / Diastólica ≥ 100 → CRITICAL (crisis hipertensiva)
  - SpO₂ < 92 → CRITICAL
  - SpO₂ < 95 → WARNING
- Reglas personalizables por `patientId` (override de globales).
- CRUD completo `/rules` (POST/PUT/DELETE/GET).

## HU-17: Alerta automática al médico cuando valores salen de rango (Req VII)
**Como** médico tratante
**quiero** ser alertado automáticamente cuando un paciente crónico envíe valores fuera de rango
**para** poder intervenir oportunamente.

**Criterios**
- `alert-service` consume `iot.metric.received` y evalúa reglas activas en streaming (CEP simple).
- Idempotencia: si ya hay una alerta `ABIERTA` para el mismo paciente+regla, no duplica.
- Publica `iot.alert.triggered` con severidad.
- El médico puede `acknowledge` o `resolve` (cambia status).
- Endpoint `/alerts?status=ABIERTA&severity=CRITICAL` para dashboards.

## HU-18: Visualización del paciente de sus métricas
**Como** paciente
**quiero** ver mis últimas mediciones, mis tendencias y mis alertas activas
**para** entender mi estado de salud.

**Criterios**
- Endpoint `/iot/patients/:id/summary` devuelve la última lectura por dispositivo + conteo 24h.
- Endpoint `/iot/patients/:id/series?deviceType=X&hours=N` devuelve serie temporal para gráficos.
- UI con simulador integrado (3 dispositivos virtuales) — útil para demo y para tests E2E.

## HU-19: Calificación de atención por el paciente (Req VIII)
**Como** paciente que tuvo una consulta
**quiero** calificar al médico de 1 a 5 estrellas y dejar comentarios
**para** retroalimentar el servicio.

**Criterios**
- **Gating**: la cita debe estar `COMPLETADA` y pertenecer al paciente (validado vía `appointment-service` sincrónicamente).
- Subdimensiones opcionales: puntualidad, empatía, claridad.
- Una calificación por cita (`UNIQUE(appointment_id)`).
- Al crear: se recalcula `doctor_rating_summary` en la misma transacción.
- Se publica `doctor.rating.updated` vía Outbox → `doctor-service` consume y refresca su tabla.

## HU-20: Ranking público de médicos
**Como** auditor / paciente buscando médico
**quiero** ver el ranking de médicos por promedio de estrellas
**para** elegir mejor o auditar la calidad.

**Criterios**
- `GET /ratings/ranking` devuelve médicos ordenados por `avg_stars DESC, total_ratings DESC`.
- `GET /ratings/doctor/:id/summary` para perfil individual.

## HU-21: El médico ve sus calificaciones
**Como** médico
**quiero** ver mi promedio actualizado y las últimas reseñas recibidas
**para** mejorar mi atención.

**Criterios**
- Tab "Mis Calificaciones" con summary (promedio + total + subdimensiones).
- Lista de últimas reseñas con estrellas y comentarios.
