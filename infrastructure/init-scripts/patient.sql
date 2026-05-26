-- PATIENT SERVICE - PostgreSQL
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dni VARCHAR(15) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    gender VARCHAR(20),
    phone VARCHAR(20),
    email VARCHAR(150),
    address TEXT,
    region VARCHAR(80),
    blood_type VARCHAR(5),
    allergies TEXT,
    chronic_conditions TEXT,
    cobol_validated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patients_dni ON patients(dni);
CREATE INDEX idx_patients_region ON patients(region);

INSERT INTO patients (id, dni, first_name, last_name, birth_date, gender, phone, email, region, blood_type, cobol_validated) VALUES
('11111111-1111-1111-1111-111111111111', '70123456', 'Juan', 'Pérez García', '1985-03-15', 'M', '+51987654321', 'paciente1@mc.com', 'Lima', 'O+', TRUE),
('11111111-1111-1111-1111-111111111112', '70123457', 'María', 'López Quispe', '1992-07-22', 'F', '+51987654322', 'maria@mc.com',     'Cusco', 'A+', TRUE),
('11111111-1111-1111-1111-111111111113', '70123458', 'Carlos', 'Mendoza Ruiz','1978-11-30', 'M', '+51987654323', 'carlos@mc.com',    'Arequipa','B+', TRUE);
