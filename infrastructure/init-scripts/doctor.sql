-- DOCTOR SERVICE - PostgreSQL
CREATE TABLE IF NOT EXISTS doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_number VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(20),
    specialty VARCHAR(80) NOT NULL,
    sub_specialty VARCHAR(80),
    is_general BOOLEAN DEFAULT FALSE,
    rating NUMERIC(3,2) DEFAULT 0.00,
    total_consultations INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INT DEFAULT 30
);

CREATE INDEX idx_doctors_specialty ON doctors(specialty);
CREATE INDEX idx_schedule_doctor ON doctor_schedule(doctor_id);

INSERT INTO doctors (id, license_number, first_name, last_name, email, phone, specialty, is_general, rating) VALUES
('22222222-2222-2222-2222-222222222222', 'CMP-12345', 'Ana', 'Torres Vega', 'medico1@mc.com', '+51999000111', 'Medicina General', TRUE, 4.85),
('22222222-2222-2222-2222-222222222223', 'CMP-12346', 'Luis', 'Ramírez Soto','luis@mc.com',    '+51999000112', 'Cardiología',     FALSE,4.92),
('22222222-2222-2222-2222-222222222224', 'CMP-12347', 'Patricia','Gómez Lara','patricia@mc.com','+51999000113','Endocrinología',  FALSE,4.78);

INSERT INTO doctor_schedule (doctor_id, day_of_week, start_time, end_time) VALUES
('22222222-2222-2222-2222-222222222222', 1, '08:00', '14:00'),
('22222222-2222-2222-2222-222222222222', 2, '08:00', '14:00'),
('22222222-2222-2222-2222-222222222222', 3, '08:00', '14:00'),
('22222222-2222-2222-2222-222222222222', 4, '08:00', '14:00'),
('22222222-2222-2222-2222-222222222222', 5, '08:00', '14:00'),
('22222222-2222-2222-2222-222222222223', 1, '14:00', '20:00'),
('22222222-2222-2222-2222-222222222223', 3, '14:00', '20:00'),
('22222222-2222-2222-2222-222222222223', 5, '14:00', '20:00'),
('22222222-2222-2222-2222-222222222224', 2, '09:00', '15:00'),
('22222222-2222-2222-2222-222222222224', 4, '09:00', '15:00');
