# Diagrama de Despliegue

## Despliegue local (Hackaton — Docker Compose)

```mermaid
flowchart TB
    subgraph host[Host: Docker Engine - mediconnect-net]
        subgraph edge[Edge Tier]
            FE[Nginx :8080<br/>SPA estática]
            GW[API Gateway :3000<br/>Node 20]
        end
        subgraph svc[Microservices Tier]
            AUTH[auth-service :3001]
            PAT[patient-service :3002]
            DOC[doctor-service :3003]
            APT[appointment-service :3004]
            HIS[medical-history-service :3005]
            VID[videoconsultation-service :3006]
        end
        subgraph data[Data Tier - Persistencia Poliglota]
            PG1[(PostgreSQL :5433<br/>auth_db)]
            PG2[(PostgreSQL :5434<br/>patient_db)]
            PG3[(PostgreSQL :5435<br/>doctor_db)]
            PG4[(PostgreSQL :5436<br/>appointment_db)]
            MO1[(MongoDB :27017<br/>medical_history_db)]
            MO2[(MongoDB :27018<br/>video_db)]
            RD[(Redis :6379)]
        end
        subgraph msg[Mensajería]
            MQ[(RabbitMQ :5672 / :15672<br/>exchange: mediconnect.events)]
        end
    end
    Browser((Navegador)) -.HTTPS.-> FE
    Browser -.REST + WS.-> GW
    GW --> AUTH & PAT & DOC & APT & HIS & VID
    AUTH --> PG1
    PAT --> PG2
    DOC --> PG3
    APT --> PG4
    HIS --> MO1
    VID --> MO2
    AUTH & PAT & DOC & APT & HIS & VID --> MQ
```

## Despliegue objetivo en producción (referencia)

```mermaid
flowchart TB
    subgraph cloud[Nube — multi-AZ - 99.9% SLA]
        subgraph edge[Edge]
            CDN[CDN / WAF]
            LB[Application Load Balancer]
        end
        subgraph k8s[Kubernetes - HPA + PDB]
            POD_GW[Pods: API Gateway x N]
            POD_SVC[Pods: 6 microservicios<br/>cada uno con HPA por CPU/RPS]
        end
        subgraph dbs[Bases gestionadas]
            RDS[Amazon RDS PostgreSQL<br/>multi-AZ + read replicas]
            DOC[MongoDB Atlas / DocumentDB<br/>sharded para HCE y video]
            EC[ElastiCache Redis cluster]
        end
        MSK[Amazon MSK / RabbitMQ HA cluster]
        S3[(S3 Object Storage<br/>grabaciones cifradas KMS)]
        TURN[TURN/STUN servers<br/>autoescalado]
        KMS[AWS KMS — claves AES-256 rotables]
    end
    Internet((Internet)) --> CDN --> LB --> POD_GW --> POD_SVC
    POD_SVC --> RDS & DOC & EC & MSK
    POD_SVC -.cifrado AES.-> S3
    POD_SVC -.firma/cifrado.-> KMS
    POD_SVC -.WebRTC ICE.-> TURN
```

### Decisiones de despliegue clave

- **Microservicios stateless** → escalado horizontal con HPA.
- **Read replicas en PostgreSQL** para reducir presión del dashboard clínico (<150ms).
- **MongoDB sharded** para crecimiento ilimitado del HCE (15M pacientes).
- **Almacenamiento de grabaciones en S3** con cifrado en reposo via KMS (no en MongoDB).
- **RabbitMQ HA / MSK** garantiza la entrega de eventos críticos.
- **Modo degradado offline-first** (PWA con IndexedDB) para zonas rurales — pendiente como evolución del frontend.
