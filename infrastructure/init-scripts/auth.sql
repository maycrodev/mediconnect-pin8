-- AUTH SERVICE - PostgreSQL
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('PACIENTE','MEDICO','ENFERMERO','AUDITOR','ADMIN')),
    external_ref_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Seed - password = "password123" (bcrypt $2b$10$...)
INSERT INTO users (email, password_hash, role, external_ref_id) VALUES
('paciente1@mc.com', '$2b$10$QXkXjLDQ7VL8tQjGhVRk0OQzVlYj7KhqXJ7gZ8KZqVQ8KZqVQ8KZq', 'PACIENTE', '11111111-1111-1111-1111-111111111111'),
('medico1@mc.com',   '$2b$10$QXkXjLDQ7VL8tQjGhVRk0OQzVlYj7KhqXJ7gZ8KZqVQ8KZqVQ8KZq', 'MEDICO',   '22222222-2222-2222-2222-222222222222'),
('auditor@mc.com',   '$2b$10$QXkXjLDQ7VL8tQjGhVRk0OQzVlYj7KhqXJ7gZ8KZqVQ8KZqVQ8KZq', 'AUDITOR',  '33333333-3333-3333-3333-333333333333');
