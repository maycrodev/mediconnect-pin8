# ADR-003: Comunicación Asíncrona con RabbitMQ

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

El kata exige: *"La arquitectura debe usar el patrón microservicios con comunicación asíncrona para eventos críticos de salud"*. Los eventos críticos incluyen: creación/cancelación de cita, fin de videoconsulta, alertas IoT futuras (MVP 3), envío de receta (MVP 2).

Tenemos que decidir entre Kafka, RabbitMQ y NATS.

## Decisión

**RabbitMQ** con un único **topic exchange** `mediconnect.events` y routing keys jerárquicas:

- `appointment.created | updated | cancelled | started | completed`
- `patient.created | updated`
- `video.session.started | ended`
- (MVP 2/3): `prescription.issued`, `lab.result.received`, `iot.alert.triggered`

Cada servicio declara su propia queue durable y se bindea a las routing keys de su interés.

## Razones para RabbitMQ vs Kafka (en este hackaton)

- Tiempo de setup ≪ Kafka.
- Routing topic flexible para múltiples consumidores.
- Acks por mensaje + retries simples.
- Imagen oficial con UI admin (`:15672`) muy útil en demo.
- Volúmenes esperados en MVP no requieren la garantía de retention de Kafka.

## Consecuencias

✅ Eventos críticos no bloquean el camino crítico.
✅ Bajo acoplamiento entre servicios.
✅ Demo visual del flujo (panel RabbitMQ).
⚠️ En MVP 3 (IoT a escala) puede convenir Kafka — se documenta como evolución.
