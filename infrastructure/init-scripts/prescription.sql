-- PRESCRIPTION SERVICE - PostgreSQL
CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio VARCHAR(30) UNIQUE NOT NULL,
    appointment_id UUID,
    patient_id UUID NOT NULL,
    patient_dni VARCHAR(15),
    patient_name VARCHAR(200),
    doctor_id UUID NOT NULL,
    doctor_name VARCHAR(200),
    doctor_license VARCHAR(30),
    pharmacy_id UUID,
    diagnostico TEXT,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'EMITIDA'
        CHECK (status IN ('EMITIDA','ENVIADA','DISPENSADA','ANULADA','VENCIDA')),
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    dispensed_at TIMESTAMPTZ,
    -- Firma electrónica (validez legal)
    signature TEXT NOT NULL,
    signature_algorithm VARCHAR(40) DEFAULT 'RSA-SHA256',
    payload_hash VARCHAR(128) NOT NULL,
    public_key_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medication_name VARCHAR(200) NOT NULL,
    medication_code VARCHAR(40),
    presentation VARCHAR(120),
    dosis VARCHAR(80) NOT NULL,
    frecuencia VARCHAR(80) NOT NULL,
    duracion VARCHAR(80) NOT NULL,
    via VARCHAR(40) DEFAULT 'oral',
    quantity INT DEFAULT 1,
    instructions TEXT
);

CREATE TABLE IF NOT EXISTS event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL,
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_doctor ON prescriptions(doctor_id);
CREATE INDEX idx_prescriptions_pharmacy ON prescriptions(pharmacy_id);
CREATE INDEX idx_prescriptions_status ON prescriptions(status);
CREATE INDEX idx_prescriptions_folio ON prescriptions(folio);
