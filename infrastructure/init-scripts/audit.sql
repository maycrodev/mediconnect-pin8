-- AUDIT SERVICE - PostgreSQL APPEND-ONLY con HASH CHAIN
-- Cumple: registros inmutables auditables por entes regulatorios (Req. ADIC. b)

CREATE TABLE IF NOT EXISTS audit_log (
    seq BIGSERIAL PRIMARY KEY,
    id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    -- Trazabilidad del evento
    event_type VARCHAR(80) NOT NULL,
    actor_id UUID,
    actor_role VARCHAR(30),
    resource_type VARCHAR(80),
    resource_id VARCHAR(100),
    patient_id UUID,
    -- Payload congelado (JSON canónico)
    payload JSONB NOT NULL,
    -- Cadena criptográfica
    prev_hash VARCHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    entry_hash VARCHAR(64) NOT NULL,
    -- Metadatos
    source_service VARCHAR(60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_event_type   ON audit_log(event_type);
CREATE INDEX idx_audit_patient      ON audit_log(patient_id);
CREATE INDEX idx_audit_actor        ON audit_log(actor_id);
CREATE INDEX idx_audit_created      ON audit_log(created_at DESC);
CREATE INDEX idx_audit_resource     ON audit_log(resource_type, resource_id);

-- ============================================
-- INMUTABILIDAD: trigger que bloquea UPDATE/DELETE
-- ============================================
CREATE OR REPLACE FUNCTION audit_block_mutations()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log es APPEND-ONLY: % no permitido (intento sobre seq=%)',
        TG_OP, OLD.seq;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_no_update
BEFORE UPDATE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_block_mutations();

CREATE TRIGGER trg_audit_no_delete
BEFORE DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_block_mutations();

-- Función helper para leer último hash (usada por el servicio en cada INSERT)
CREATE OR REPLACE FUNCTION audit_last_hash()
RETURNS VARCHAR AS $$
DECLARE h VARCHAR;
BEGIN
    SELECT entry_hash INTO h FROM audit_log ORDER BY seq DESC LIMIT 1;
    RETURN COALESCE(h, '0000000000000000000000000000000000000000000000000000000000000000');
END;
$$ LANGUAGE plpgsql;

-- Vista para auditores (solo lectura conceptual; el servicio respeta esto)
CREATE OR REPLACE VIEW audit_log_readonly AS
SELECT seq, id, event_type, actor_id, actor_role, resource_type, resource_id,
       patient_id, payload, prev_hash, entry_hash, source_service, created_at
FROM audit_log
ORDER BY seq;
