-- APPOINTMENT SERVICE - PostgreSQL
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL,
    doctor_id UUID NOT NULL,
    specialty VARCHAR(80),
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    duration_minutes INT DEFAULT 30,
    modality VARCHAR(20) NOT NULL CHECK (modality IN ('VIDEOCONSULTA','PRESENCIAL')),
    status VARCHAR(20) NOT NULL DEFAULT 'AGENDADA'
        CHECK (status IN ('AGENDADA','CONFIRMADA','EN_CURSO','COMPLETADA','CANCELADA','NO_ASISTIO')),
    reason TEXT,
    notes TEXT,
    cancellation_reason TEXT,
    cancelled_by VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(doctor_id, appointment_date, appointment_time)
);

CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Tabla de outbox para garantizar publicación de eventos asincrónicos
CREATE TABLE IF NOT EXISTS event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL,
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
