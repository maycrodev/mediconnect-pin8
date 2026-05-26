# Historias de Usuario — MVP 1

## HU-01: Agendar cita médica
**Como** paciente registrado
**quiero** agendar una cita en línea con un médico (general o especialista)
**para** recibir atención sin trasladarme físicamente.

**Criterios de aceptación**
- El paciente puede filtrar médicos por especialidad.
- El sistema muestra solo slots disponibles (descarta los ya tomados por otras citas).
- Al confirmar, la cita queda en estado `AGENDADA`.
- Se emite el evento asíncrono `appointment.created` vía RabbitMQ.

## HU-02: Modificar cita
**Como** paciente o médico
**quiero** cambiar la fecha, hora, modalidad o motivo de una cita futura
**para** adaptarme a imprevistos.

**Criterios**
- Solo se pueden modificar citas en estado `AGENDADA` o `CONFIRMADA`.
- Cualquier cambio publica el evento `appointment.updated`.

## HU-03: Cancelar cita
**Como** paciente o médico
**quiero** cancelar una cita registrando el motivo
**para** liberar el slot y dejar trazabilidad.

**Criterios**
- Pide motivo y registra quién canceló (`cancelled_by`).
- Estado pasa a `CANCELADA`.
- Se publica `appointment.cancelled`.

## HU-04: Iniciar videoconsulta
**Como** paciente o médico
**quiero** iniciar la videoconsulta correspondiente a una cita
**para** atenderme remotamente.

**Criterios**
- La cita pasa a `EN_CURSO`.
- Se crea/recupera una sala (`Session` con `roomId` único).
- La grabación se cifra **AES-256-GCM** chunk a chunk.
- Hay **subtítulos en vivo** activados por defecto (accesibilidad).

## HU-05: Finalizar videoconsulta
**Como** médico
**quiero** dar por terminada la consulta y guardar mis notas en el HCE
**para** dejar registro clínico.

**Criterios**
- La sesión cierra (`status=ENDED`, `endedAt`, `durationSeconds`).
- La cita pasa a `COMPLETADA`.
- Las notas se agregan al HCE del paciente como una nueva `consultation`.

## HU-06: Consultar HCE del paciente durante la consulta
**Como** médico
**quiero** ver el historial clínico completo (alergias, crónicas, consultas, exámenes, medicamentos) del paciente
**para** decidir el tratamiento de forma informada.

**Criterios**
- Acceso por `patientId` o por DNI.
- Endpoint optimizado `/history/:id/summary` para dashboard <150ms.
- Solo roles autorizados: `MEDICO`, `ENFERMERO`, `AUDITOR`, `PACIENTE`(propio), `ADMIN`.

## HU-07: Validar paciente contra Registro Civil (COBOL)
**Como** sistema
**quiero** validar el DNI del paciente contra el sistema legado COBOL del Registro Civil
**para** cumplir con la integración de solo lectura exigida.

**Criterios**
- `patient-service` invoca el adapter `cobolMock` (en producción: HTTP REST real al COBOL).
- Si el DNI no valida, se rechaza el alta con HTTP 422.
- El paciente queda con `cobol_validated = TRUE`.
