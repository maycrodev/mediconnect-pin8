# Diagramas de Secuencia — MVP 4

## 1. Captura universal de evento → cadena criptográfica

```mermaid
sequenceDiagram
    autonumber
    participant SVC as Cualquier microservicio
    participant MQ as RabbitMQ topic exchange
    participant AU as Audit Service
    participant DB as audit_db (PostgreSQL)
    participant LCK as writeLock mutex

    SVC->>MQ: publish appointment.created (o cualquier evento)
    Note over MQ: bind audit.all queue → routing key `#`
    MQ-->>AU: consume
    AU->>AU: extractContext(routingKey, payload)<br/>→ resource_type, resource_id, patient_id, actor_id
    AU->>LCK: acquire (serializa para evitar race)
    LCK-->>AU: granted
    AU->>DB: BEGIN
    AU->>DB: SELECT audit_last_hash() → prev_hash
    AU->>AU: entry_hash = SHA-256(prev_hash || canonicalize(payload completo))
    AU->>DB: INSERT audit_log (...prev_hash, entry_hash, created_at)
    AU->>DB: COMMIT
    AU->>LCK: release
    AU->>MQ: ack
```

## 2. Verificación de integridad por el auditor

```mermaid
sequenceDiagram
    autonumber
    actor AUD as Auditor MINSA
    participant FE as Frontend
    participant GW as Gateway (rol guard AUDITOR)
    participant AU as Audit Service
    participant DB as audit_db

    AUD->>FE: login auditor@mc.com
    FE->>GW: GET /api/audit/integrity/verify (JWT auditor)
    GW->>GW: roleGuard: AUDITOR ✓
    GW->>AU: forward
    AU->>DB: SELECT * FROM audit_log ORDER BY seq
    DB-->>AU: stream filas
    loop por cada fila
        AU->>AU: recalc = SHA-256(prev_hash || canonical(payload))
        AU->>AU: ¿recalc == entry_hash?<br/>¿row.prev_hash == expectedPrev?
    end
    AU-->>GW: { integrity: "OK", checked: N, breaches: [], tip_hash: ... }
    GW-->>FE: 200
    FE-->>AUD: ✅ CADENA ÍNTEGRA
```

## 3. Intento de tampering: trigger PostgreSQL bloquea

```mermaid
sequenceDiagram
    autonumber
    actor ATK as Atacante con credenciales DB
    participant PG as PostgreSQL audit_db
    participant TR as Trigger trg_audit_no_update

    ATK->>PG: UPDATE audit_log SET payload='{"hacked":true}' WHERE seq=42
    PG->>TR: fire BEFORE UPDATE
    TR->>TR: RAISE EXCEPTION 'audit_log es APPEND-ONLY'
    TR-->>PG: ROLLBACK
    PG-->>ATK: ERROR: audit_log es APPEND-ONLY: UPDATE no permitido (intento sobre seq=42)

    Note over ATK: Aún si el atacante deshabilitara el trigger,<br/>el siguiente verify detecta hash inválido
```

## 4. Auditoría completa por paciente (timeline GDPR)

```mermaid
sequenceDiagram
    autonumber
    actor AUD as Auditor / Titular del dato
    participant FE as Frontend
    participant GW as Gateway
    participant AU as Audit Service
    participant DB as audit_db

    AUD->>FE: ingresa patient_id
    FE->>GW: GET /api/audit?patient_id=X&limit=100
    GW->>AU: forward
    AU->>DB: SELECT ... WHERE patient_id=X ORDER BY seq DESC
    DB-->>AU: cronología
    AU-->>FE: timeline con<br/>citas, recetas, lab, accesos HCE, IoT, alertas, ratings
    FE-->>AUD: render visual timeline
```

## 5. Acceso a HCE deja huella

```mermaid
sequenceDiagram
    autonumber
    actor M as Médico
    participant GW as Gateway
    participant HCE as Medical History Service
    participant MQ as RabbitMQ
    participant AU as Audit Service

    M->>GW: GET /api/history/{patientId} (JWT MEDICO)
    GW->>HCE: forward + x-user-id + x-user-role
    HCE->>HCE: middleware emitAccess()
    HCE->>MQ: publish hce.accessed { patientId, actor_id, actor_role, endpoint }
    HCE-->>M: HCE completo
    MQ-->>AU: consume + persiste como entrada inmutable
    Note over AU: Si un médico accede a HCE de paciente que no le corresponde,<br/>el evento queda registrado para revisión posterior
```
