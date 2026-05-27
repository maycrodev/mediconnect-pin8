-- RATING SERVICE - PostgreSQL
CREATE TABLE IF NOT EXISTS ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE,        -- una calificación por cita
    patient_id UUID NOT NULL,
    doctor_id UUID NOT NULL,
    stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    -- Subdimensiones (opcionales)
    puntualidad INT CHECK (puntualidad BETWEEN 1 AND 5),
    empatia INT CHECK (empatia BETWEEN 1 AND 5),
    claridad INT CHECK (claridad BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vista materializada lógica: agregado por médico
CREATE TABLE IF NOT EXISTS doctor_rating_summary (
    doctor_id UUID PRIMARY KEY,
    total_ratings INT NOT NULL DEFAULT 0,
    avg_stars NUMERIC(3,2) NOT NULL DEFAULT 0.00,
    avg_puntualidad NUMERIC(3,2),
    avg_empatia NUMERIC(3,2),
    avg_claridad NUMERIC(3,2),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL,
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ratings_doctor ON ratings(doctor_id);
CREATE INDEX idx_ratings_patient ON ratings(patient_id);
