# C4 — Nivel 2: Contenedores (final, con MVP 1 + 2 + 3)

```mermaid
C4Container
    title MediConnect — Contenedores (MVP 1+2+3)

    Person(paciente, "Paciente")
    Person(medico, "Médico")
    Person(farmaceutico, "Farmacéutico")
    Person(auditor, "Auditor")
    System_Ext(iot, "Dispositivos IoT", "Glucómetros, tensiómetros, oxímetros")
    System_Ext(labExt, "Laboratorios Externos", "San Martín/AngloLab/ROE")
    System_Ext(cobol, "Registro Civil COBOL", "API REST")

    System_Boundary(mc, "MediConnect") {
        Container(spa, "SPA Web", "HTML/JS/CSS")
        Container(gw, "API Gateway", "Express + JWT")

        Container(auth, "Auth", "Node")
        Container(patient, "Patient", "Node")
        Container(doctor, "Doctor", "Node", "Suscribe doctor.rating.updated, appointment.completed")
        Container(appt, "Appointment", "Node + Outbox")
        Container(history, "Medical History", "Node + Mongoose")
        Container(video, "Video", "Node + AES-256")

        Container(rx, "Prescription", "Node + RSA-2048")
        Container(pharm, "Pharmacy", "Node")
        Container(lab, "Laboratory", "Node + API key + worker")

        Container(iotsvc, "IoT", "Node + Mongo TS", "MongoDB time-series collection")
        Container(alert, "Alert", "Node + CEP streaming", "Evalúa reglas en cada métrica")
        Container(rating, "Rating", "Node + PostgreSQL + Outbox", "Gating contra appointment-service")

        ContainerDb(authdb, "auth_db", "PostgreSQL")
        ContainerDb(patientdb, "patient_db", "PostgreSQL")
        ContainerDb(doctordb, "doctor_db", "PostgreSQL")
        ContainerDb(apptdb, "appointment_db", "PostgreSQL")
        ContainerDb(rxdb, "prescription_db", "PostgreSQL")
        ContainerDb(pharmdb, "pharmacy_db", "PostgreSQL")
        ContainerDb(ratingdb, "rating_db", "PostgreSQL")
        ContainerDb(historydb, "history_db", "MongoDB")
        ContainerDb(videodb, "video_db", "MongoDB")
        ContainerDb(labdb, "laboratory_db", "MongoDB")
        ContainerDb(iotdb, "iot_db", "MongoDB time-series")
        ContainerDb(alertdb, "alert_db", "MongoDB")

        Container(broker, "Event Broker", "RabbitMQ topic", "mediconnect.events: appointment.* / prescription.* / lab.* / iot.* / rating.* / doctor.* / patient.* / video.*")
    }

    Rel(paciente, spa, "")
    Rel(medico, spa, "")
    Rel(farmaceutico, spa, "")
    Rel(auditor, gw, "verifica firmas, rankings, audit logs")
    Rel(spa, gw, "REST", "HTTPS")

    Rel(gw, auth, ""); Rel(gw, patient, ""); Rel(gw, doctor, ""); Rel(gw, appt, "")
    Rel(gw, history, ""); Rel(gw, video, ""); Rel(gw, rx, ""); Rel(gw, pharm, "")
    Rel(gw, lab, ""); Rel(gw, iotsvc, ""); Rel(gw, alert, ""); Rel(gw, rating, "")

    Rel(iot, iotsvc, "POST /metrics", "HTTPS + x-device-key")
    Rel(labExt, lab, "POST /lab/results", "HTTPS + x-lab-api-key")
    Rel(patient, cobol, "valida DNI")

    Rel(rating, appt, "GET cita (gating)")
    Rel(rx, patient, "snapshot"); Rel(rx, doctor, "snapshot")

    Rel(auth, authdb, ""); Rel(patient, patientdb, ""); Rel(doctor, doctordb, "")
    Rel(appt, apptdb, ""); Rel(history, historydb, ""); Rel(video, videodb, "")
    Rel(rx, rxdb, ""); Rel(pharm, pharmdb, ""); Rel(lab, labdb, "")
    Rel(iotsvc, iotdb, ""); Rel(alert, alertdb, ""); Rel(rating, ratingdb, "")

    Rel(iotsvc, broker, "iot.metric.received")
    Rel(broker, alert, "iot.metric.received")
    Rel(alert, broker, "iot.alert.triggered / resolved")
    Rel(rating, broker, "rating.created / doctor.rating.updated")
    Rel(broker, doctor, "doctor.rating.updated, appointment.completed")
    Rel(broker, history, "patient.created / appointment.completed / prescription.issued / lab.result.received")
```

## Resumen de servicios

| # | Servicio | Puerto | BD | Patrones |
|---|----------|--------|----|----|
| 1 | api-gateway | 3100 (host) | — | JWT, proxy, role guard |
| 2 | auth | 3001 | PostgreSQL | bcrypt, JWT signing |
| 3 | patient | 3002 | PostgreSQL | ACL COBOL |
| 4 | doctor | 3003 | PostgreSQL | Read-model projection |
| 5 | appointment | 3004 | PostgreSQL | Outbox |
| 6 | medical-history | 3005 | MongoDB | Event sourcing parcial |
| 7 | videoconsultation | 3006 | MongoDB | AES-256-GCM, WebRTC signaling |
| 8 | prescription | 3007 | PostgreSQL | RSA-2048, Outbox |
| 9 | pharmacy | 3008 | PostgreSQL | Event consumer |
| 10 | laboratory | 3009 | MongoDB | Webhook + worker async |
| 11 | iot | 3010 | MongoDB time-series | Append-heavy, TTL |
| 12 | alert | 3011 | MongoDB | CEP streaming |
| 13 | rating | 3012 | PostgreSQL | Gating sync, Outbox |
| – | rabbitmq | 5672/15672 | — | Topic exchange |
| – | redis | 6379 | — | (reservado) |
| – | frontend | 8080 | — | Nginx static |
```
