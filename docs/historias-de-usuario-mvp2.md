# Historias de Usuario — MVP 2

## HU-08: Emitir receta digital firmada
**Como** médico
**quiero** emitir una receta con uno o más medicamentos durante o al finalizar la videoconsulta
**para** que el paciente la presente en cualquier farmacia afiliada con validez legal.

**Criterios de aceptación**
- Cada receta recibe un **folio único** legible (ej: `RX-LV3K8X4-A2B9`).
- Se firma con **RSA-2048 + SHA-256** sobre el payload canonicalizado (claves ordenadas).
- Se almacena `signature`, `payload_hash`, `public_key_id` y `algorithm` para verificación.
- Tiene **fecha de expiración** (configurable, default 30 días).
- Se emite el evento `prescription.issued` (asíncrono, vía Outbox).
- Si se selecciona farmacia al emitir, status pasa a `ENVIADA` y se publica `prescription.sent`.

## HU-09: Enviar receta a una farmacia
**Como** paciente
**quiero** elegir la farmacia de mi preferencia tras recibir la receta
**para** retirar mis medicamentos cerca de mi domicilio.

**Criterios**
- Listado filtrable por región/cadena/24h.
- Al elegir, se publica `prescription.sent` con la firma para que la farmacia valide.
- `pharmacy-service` recibe el evento, persiste un `delivery` con status `RECIBIDA`.

## HU-10: Dispensar receta en farmacia
**Como** farmacéutico
**quiero** ver las recetas pendientes en mi farmacia y marcar la dispensación
**para** cerrar el ciclo de la receta.

**Criterios**
- Endpoint `/pharmacies/:id/deliveries` lista la cola por estado.
- Al dispensar se publica `prescription.dispensed`.
- `prescription-service` consume el evento y actualiza `status=DISPENSADA` (idempotente).

## HU-11: Verificar autenticidad de receta
**Como** auditor o sistema externo
**quiero** verificar la firma de una receta dado su ID/folio
**para** detectar adulteraciones.

**Criterios**
- `GET /prescriptions/:id/verify` devuelve `{ valid, expired, algorithm, public_key_id, status }`.
- `GET /prescriptions/public-key` expone la clave pública para verificación offline por terceros.

## HU-12: Solicitar exámenes de laboratorio
**Como** médico
**quiero** registrar una orden de exámenes para el paciente
**para** que el laboratorio externo procese y reporte resultados.

**Criterios**
- Tests con código + nombre + tipo de muestra.
- Status inicial `PENDIENTE`.
- Se publica `lab.order.created`.

## HU-13: Recibir resultados desde laboratorios externos
**Como** laboratorio clínico externo (San Martín, AngloLab, ROE)
**quiero** enviar resultados al sistema MediConnect vía webhook
**para** que automáticamente se integren al HCE del paciente.

**Criterios**
- POST `/lab/results` con header `x-lab-api-key` (autenticación por API key).
- Idempotente vía `external_lab_order_id`.
- Status inicial `RECIBIDO`. Se encola para procesamiento asíncrono.
- Worker valida cada valor numérico contra `reference_min/max`, marca `abnormal: true` y publica `lab.result.received`.
- Si hay errores de validación, status pasa a `RECHAZADO` y no se publica.

## HU-14: Integración automática de exámenes y recetas en HCE
**Como** médico
**quiero** que las recetas emitidas y los resultados de lab aparezcan automáticamente en el HCE del paciente
**para** no tener que ingresarlos manualmente.

**Criterios**
- `medical-history-service` se suscribe a `prescription.issued` → agrega medicamentos.
- Se suscribe a `lab.result.received` → agrega exámenes con valor, unidad y bandera `ANORMAL` si aplica.
- Los handlers son idempotentes (chequeo por `prescriptionId` y `resultId`).
