-- PHARMACY SERVICE - PostgreSQL
CREATE TABLE IF NOT EXISTS pharmacies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ruc VARCHAR(15) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    chain VARCHAR(80),                -- ej: Inkafarma, Mifarma, Boticas BTL
    address TEXT,
    region VARCHAR(80),
    city VARCHAR(80),
    phone VARCHAR(20),
    email VARCHAR(150),
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    is_24h BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescription_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL,
    folio VARCHAR(30) NOT NULL,
    pharmacy_id UUID NOT NULL REFERENCES pharmacies(id),
    patient_id UUID NOT NULL,
    patient_name VARCHAR(200),
    items JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'RECIBIDA'
        CHECK (status IN ('RECIBIDA','EN_PREPARACION','LISTA','DISPENSADA','RECHAZADA')),
    received_at TIMESTAMPTZ DEFAULT NOW(),
    dispensed_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX idx_pharmacies_region ON pharmacies(region);
CREATE INDEX idx_pharmacies_chain  ON pharmacies(chain);
CREATE INDEX idx_deliveries_pharmacy ON prescription_deliveries(pharmacy_id);
CREATE INDEX idx_deliveries_status ON prescription_deliveries(status);
CREATE INDEX idx_deliveries_folio ON prescription_deliveries(folio);

-- Seed: 8 farmacias representativas (en prod serían 12K)
INSERT INTO pharmacies (id, ruc, name, chain, address, region, city, phone, latitude, longitude, is_24h) VALUES
('a0000000-0000-0000-0000-000000000001','20100001111','Inkafarma Av. Arequipa 350','Inkafarma','Av. Arequipa 350','Lima','Lima','+5114561000',-12.0464,-77.0428, TRUE),
('a0000000-0000-0000-0000-000000000002','20100002222','Mifarma Miraflores Larco','Mifarma','Av. Larco 1234','Lima','Miraflores','+5114562000',-12.1206,-77.0297, FALSE),
('a0000000-0000-0000-0000-000000000003','20100003333','Boticas BTL Centro','Boticas BTL','Jr. Junín 450','Lima','Lima','+5114563000',-12.0500,-77.0350, FALSE),
('a0000000-0000-0000-0000-000000000004','20100004444','Inkafarma Cusco Plaza','Inkafarma','Plaza Regocijo 200','Cusco','Cusco','+5184221000',-13.5170,-71.9784, TRUE),
('a0000000-0000-0000-0000-000000000005','20100005555','Mifarma Arequipa Yanahuara','Mifarma','Av. Ejército 880','Arequipa','Arequipa','+5154221000',-16.3988,-71.5350, FALSE),
('a0000000-0000-0000-0000-000000000006','20100006666','Boticas Perú Trujillo','Boticas Perú','Jr. Pizarro 600','La Libertad','Trujillo','+5144221000',-8.1090,-79.0215, TRUE),
('a0000000-0000-0000-0000-000000000007','20100007777','Inkafarma Piura Centro','Inkafarma','Jr. Lima 333','Piura','Piura','+5174221000',-5.1945,-80.6328, FALSE),
('a0000000-0000-0000-0000-000000000008','20100008888','Farmacia Comunal Rural Puno','Independiente','Plaza de Armas s/n','Puno','Juliaca','+5154221111',-15.4994,-70.1331, FALSE);
