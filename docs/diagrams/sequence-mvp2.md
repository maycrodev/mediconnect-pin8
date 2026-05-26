# Diagramas de Secuencia — MVP 2

## 1. Emisión de receta digital firmada y envío a farmacia

```mermaid
sequenceDiagram
    autonumber
    actor M as Médico
    participant W as Frontend
    participant GW as API Gateway
    participant RX as Prescription Service
    participant PA as Patient Service
    participant DO as Doctor Service
    participant DB as prescription_db
    participant R as RabbitMQ
    participant PH as Pharmacy Service
    participant HCE as Medical History
    participant PHDB as pharmacy_db

    M->>W: "Firmar y emitir" (durante video)
    W->>GW: POST /api/prescriptions
    GW->>RX: forward
    par Snapshot canónico
        RX->>PA: GET /patients/{id}
        PA-->>RX: datos
    and
        RX->>DO: GET /doctors/{id}
        DO-->>RX: datos
    end
    RX->>RX: canonicalize(payload) + RSA-SHA256 sign
    RX->>DB: BEGIN; INSERT prescriptions + items + outbox(prescription.issued, prescription.sent); COMMIT
    RX-->>W: 201 receta firmada (folio + signature + kid)
    
    Note over RX,R: Outbox dispatcher (cada 2s)
    RX->>R: publish prescription.issued
    RX->>R: publish prescription.sent
    
    R-->>HCE: consume prescription.issued
    HCE->>HCE: $push medicamentos (idempotente)
    
    R-->>PH: consume prescription.sent
    PH->>PHDB: INSERT delivery (status=RECIBIDA)
```

## 2. Dispensación en farmacia

```mermaid
sequenceDiagram
    autonumber
    actor F as Farmacéutico
    actor P as Paciente
    participant W as Front farmacia
    participant GW as API Gateway
    participant PH as Pharmacy Service
    participant R as RabbitMQ
    participant RX as Prescription Service

    P->>F: presenta DNI + folio
    F->>W: lista cola
    W->>GW: GET /api/pharmacies/{id}/deliveries
    GW->>PH: forward
    PH-->>W: array deliveries
    F->>W: clic "Dispensar"
    W->>GW: POST /api/deliveries/{id}/dispense
    GW->>PH: forward
    PH->>PH: UPDATE status=DISPENSADA
    PH->>R: publish prescription.dispensed
    R-->>RX: consume
    RX->>RX: UPDATE prescriptions SET status=DISPENSADA
```

## 3. Recepción asíncrona de resultados de laboratorio

```mermaid
sequenceDiagram
    autonumber
    participant LAB as Laboratorio externo (San Martín)
    participant GW as API Gateway
    participant LS as Laboratory Service
    participant MO as mongo-laboratory
    participant Q as queue laboratory.processing
    participant W as Worker (mismo servicio)
    participant R as RabbitMQ topic
    participant HCE as Medical History Service

    Note over LAB: Termina análisis
    LAB->>GW: POST /lab/results (header x-lab-api-key)
    Note right of GW: API key validation
    GW->>LS: forward
    LS->>LS: valida api key → partner name
    LS->>MO: INSERT LabResult (status=RECIBIDO, raw_payload)
    LS->>Q: enqueue {resultId}
    LS-->>LAB: 202 Accepted {resultId}
    
    W->>Q: consume
    W->>MO: load LabResult
    loop por cada resultado
        W->>W: chequea reference_min/max → marca abnormal
    end
    alt sin errores
        W->>MO: UPDATE status=VALIDADO, reported_at
        W->>R: publish lab.result.received
        R-->>HCE: consume
        HCE->>HCE: $push exams (idempotente por resultId)
    else con errores
        W->>MO: UPDATE status=RECHAZADO + processing_errors
    end
```

## 4. Verificación de firma de receta (auditor / farmacia escéptica)

```mermaid
sequenceDiagram
    autonumber
    actor A as Auditor / Farmacia
    participant GW as API Gateway
    participant RX as Prescription Service
    
    A->>GW: GET /api/prescriptions/{id}/verify
    GW->>RX: forward
    RX->>RX: reconstruye payload canónico
    RX->>RX: crypto.verify(RSA-SHA256, payload, signature, publicKey)
    RX-->>A: { valid: true|false, expired, algorithm, kid, status }
    
    Note over A: Verificación offline alternativa
    A->>GW: GET /api/prescriptions/public-key
    GW->>RX: forward
    RX-->>A: { publicKey: PEM, kid }
    Note over A: valida con su propia librería
```
