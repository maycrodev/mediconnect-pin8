# ADR-001: Arquitectura de Microservicios

- **Status**: Aceptado
- **Fecha**: 2026-05-26
- **Contexto**: Hackaton 4 — MediConnect

## Contexto

El kata exige expresamente: *"La arquitectura obligatoria es microservicios"*. Además, los volúmenes (15M pacientes, 45K médicos, 80K enfermeros, 12K farmacias) y la exigencia de **99.9% uptime** descartan un monolito que se convertiría en SPOF y cuello de botella al escalar campañas de vacunación.

## Decisión

Adoptamos una arquitectura de microservicios con un **bounded context por capability del dominio salud**:

- `auth-service` (identidad)
- `patient-service` (pacientes + integración COBOL)
- `doctor-service` (médicos + agendas)
- `appointment-service` (ciclo de vida de citas)
- `medical-history-service` (HCE)
- `videoconsultation-service` (salas y grabación cifrada)
- `api-gateway` (BFF + JWT)

Cada servicio: stateless, despliega independiente, tiene su propia base de datos (ver ADR-002).

## Consecuencias

✅ Escalado independiente por carga (video y HCE crecen distinto que auth).
✅ Despliegues incrementales sin downtime.
✅ Fallos contenidos (circuit breaker en gateway, no propaga).
⚠️ Mayor complejidad operativa → mitigada con Docker Compose en dev y K8s en prod.
⚠️ Consistencia eventual entre servicios → asumida y mitigada con Outbox (ADR-004).
