# Diagramas de Secuencia — MVP 3

## 1. Métrica IoT → Alerta automática al médico

```mermaid
sequenceDiagram
    autonumber
    participant DEV as Dispositivo IoT
    participant GW as API Gateway
    participant IOT as IoT Service
    participant TS as MongoDB time-series
    participant R as RabbitMQ
    participant AL as Alert Service
    participant ADB as mongo-alert
    participant FE as Frontend (médico)

    Note over DEV: glucómetro mide 220 mg/dL
    DEV->>GW: POST /api/iot/metrics (header x-device-key)
    GW->>IOT: forward
    IOT->>IOT: valida device key → tipo glucometer
    IOT->>TS: insertOne (ts, meta, values)
    IOT->>R: publish iot.metric.received
    IOT-->>DEV: 202 accepted

    R-->>AL: consume iot.metric.received
    AL->>ADB: find rules (deviceType=glucometer, patient OR global, active)
    loop por cada regla
        AL->>AL: aplica comparator/threshold
        alt match y no hay alerta ABIERTA
            AL->>ADB: insert Alert (severity=CRITICAL, status=ABIERTA)
            AL->>R: publish iot.alert.triggered
        else duplicada
            Note over AL: skip idempotencia
        end
    end

    FE->>GW: GET /api/alerts?status=ABIERTA
    GW->>AL: forward
    AL-->>FE: lista de alertas
    FE-->>FE: notifica visualmente al médico
```

## 2. Médico reconoce/resuelve alerta

```mermaid
sequenceDiagram
    autonumber
    actor M as Médico
    participant FE as Frontend
    participant GW as Gateway
    participant AL as Alert Service
    participant R as RabbitMQ

    M->>FE: click "Reconocer"
    FE->>GW: POST /api/alerts/{id}/acknowledge
    GW->>AL: forward
    AL->>AL: UPDATE status=RECONOCIDA, acknowledged_by

    M->>FE: click "Resolver" + notas
    FE->>GW: POST /api/alerts/{id}/resolve
    GW->>AL: forward
    AL->>AL: UPDATE status=RESUELTA, resolved_at
    AL->>R: publish iot.alert.resolved
```

## 3. Calificación post-consulta con proyección al doctor

```mermaid
sequenceDiagram
    autonumber
    actor P as Paciente
    participant FE as Frontend
    participant GW as API Gateway
    participant RT as Rating Service
    participant AP as Appointment Service
    participant RDB as rating_db
    participant R as RabbitMQ
    participant DO as Doctor Service
    participant DDB as doctor_db

    P->>FE: click "Calificar" en cita COMPLETADA
    FE->>FE: muestra modal con 4 dims de estrellas
    P->>FE: 5★ + subdims + comentario
    FE->>GW: POST /api/ratings {appointment_id, stars,...}
    GW->>RT: forward

    Note over RT,AP: Gating sincrónico
    RT->>AP: GET /appointments/{id}
    AP-->>RT: {patient_id, doctor_id, status:COMPLETADA}
    RT->>RT: valida status==COMPLETADA

    RT->>RDB: BEGIN
    RT->>RDB: INSERT rating (UNIQUE appt)
    RT->>RDB: recalc + UPSERT doctor_rating_summary
    RT->>RDB: INSERT outbox(doctor.rating.updated)
    RT->>RDB: INSERT outbox(rating.created)
    RT->>RDB: COMMIT
    RT-->>FE: 201 + summary actualizado

    Note over RT,R: Outbox dispatcher (~2s)
    RT->>R: publish doctor.rating.updated
    R-->>DO: consume
    DO->>DDB: UPDATE doctors SET rating=avg_stars
```

## 4. Ingesta batch desde zona rural (offline-first)

```mermaid
sequenceDiagram
    autonumber
    participant App as App móvil paciente (rural)
    participant IDB as IndexedDB local
    participant GW as API Gateway
    participant IOT as IoT Service
    participant R as RabbitMQ
    participant AL as Alert Service

    Note over App: Sin conexión durante 8h
    loop varias lecturas
        App->>IDB: guarda sample
    end
    Note over App: Recupera conexión 2G
    App->>GW: POST /api/iot/metrics/batch (50 samples)
    GW->>IOT: forward
    IOT->>IOT: insertMany time-series
    loop por cada sample
        IOT->>R: publish iot.metric.received
    end
    Note over AL: evalúa todos los eventos en paralelo
    R-->>AL: consume × 50
    AL->>AL: detecta y crea alertas (idempotencia evita spam)
```
