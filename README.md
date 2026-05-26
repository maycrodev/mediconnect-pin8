# MediConnect - Plataforma Nacional de Telemedicina

> **Hackaton 4 — Arquitectura de Software — PIN8 — 26/05/2026**
> Proyecto **MediConnect S.A.S.** para el Ministerio de Salud (caso del kata).

## MVP 1 (60% de la rúbrica)

Implementa los requerimientos funcionales **I, II, III**:

| Req | Descripción | Implementación |
|-----|-------------|----------------|
| I   | Agendar, modificar, cancelar citas | `appointment-service` + frontend |
| II  | Videoconsultas en tiempo real con grabación cifrada | `videoconsultation-service` (WebRTC + AES-256-GCM) |
| III | Acceso al historial clínico electrónico durante la consulta | `medical-history-service` (MongoDB) |

Complementa con: **api-gateway**, **auth-service**, **patient-service**, **doctor-service**.

## Arquitectura

- **Patrón**: Microservicios con comunicación síncrona (REST) y asíncrona (RabbitMQ topic exchange).
- **Persistencia poliglota**:
  - PostgreSQL: auth, patient, doctor, appointment (datos transaccionales)
  - MongoDB: medical history, video sessions (documentos y blobs cifrados)
  - Redis: cache (reservado para MVPs siguientes)
- **API Gateway** con JWT (RS256-ready) que enruta a microservicios.
- **Patrón Outbox** en `appointment-service` para garantizar publicación de eventos críticos de salud.
- **Cifrado AES-256-GCM** para grabaciones de videoconsultas (cumplimiento HIPAA/GDPR equivalente).
- **Accesibilidad**: subtítulos en vivo simulados.

Ver detalles en [docs/](docs/).

## Estructura del repositorio

```
mediconnect-pin8/
├── docker-compose.yml                # Orquestación de todos los servicios
├── infrastructure/init-scripts/      # SQL de inicialización
├── services/
│   ├── api-gateway/                 # Puerto 3000
│   ├── auth-service/                # 3001 - PostgreSQL
│   ├── patient-service/             # 3002 - PostgreSQL + COBOL mock
│   ├── doctor-service/              # 3003 - PostgreSQL
│   ├── appointment-service/         # 3004 - PostgreSQL + Outbox
│   ├── medical-history-service/     # 3005 - MongoDB
│   └── videoconsultation-service/   # 3006 - MongoDB + AES-256
├── frontend/                         # SPA HTML/JS sirve en :8080
└── docs/                             # C4, ADRs, secuencia, despliegue
```

## Ejecutar

```bash
docker compose up --build
```

Servicios disponibles tras ~30s:

- Frontend: http://localhost:8080
- API Gateway: http://localhost:3100  *(se mapea a `:3000` interno; cambiado para evitar conflicto en host)*
- RabbitMQ admin: http://localhost:15672 (mediconnect / mediconnect123)
- Servicios individuales en `3001..3006`

## Usuarios demo (password = `password123`)

| Email | Rol | Datos |
|-------|-----|-------|
| `paciente1@mc.com` | PACIENTE | Juan Pérez García (DNI 70123456) |
| `medico1@mc.com`   | MEDICO   | Dra. Ana Torres (Medicina General) |
| `auditor@mc.com`   | AUDITOR  | (preparado para MVP 4) |

## Flujo de prueba MVP 1

1. Login como **paciente1@mc.com**.
2. Tab **Agendar Cita** → selecciona médico/fecha/hora → click Confirmar.
3. Tab **Mis Citas** → click **Iniciar Video** (en cita VIDEOCONSULTA).
4. Se abre sala con cámara, **subtítulos en vivo** y **grabación cifrada**.
5. Click **Finalizar consulta** → cita pasa a `COMPLETADA`.
6. Logout, login como **medico1@mc.com** → tab **Buscar Paciente** → DNI `70123456` → revisa HCE.

## Historias de Usuario (HU)

Ver [docs/historias-de-usuario.md](docs/historias-de-usuario.md).

## Documentación de arquitectura

- [Diagramas C4](docs/diagrams/) (Contexto, Contenedor, Componentes)
- [ADRs](docs/adrs/)
- [Diagrama de secuencia](docs/diagrams/sequence-mvp1.md)
- [Diagrama de despliegue](docs/diagrams/deployment.md)

## Equipo PIN8

Listado de integrantes en [docs/caratula.md](docs/caratula.md).
