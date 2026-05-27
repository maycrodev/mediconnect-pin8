# ADR-013: Audit log inmutable con hash chain criptográfico

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

Del contexto adicional del kata:
> *"Las historias clínicas son auditadas mensualmente por entes regulatorios con acceso de solo lectura a registros inmutables."*

"Inmutable" no es una propiedad opinable: es una **garantía técnica verificable**. Necesitamos:

1. **Imposibilidad de modificación** post-escritura.
2. **Detección de tampering** aunque alguien con privilegios root altere la BD.
3. **Trazabilidad universal**: toda operación crítica queda registrada.
4. **Acceso de solo lectura** para auditores externos.

## Decisión

### Capa 1 — Append-only enforced en BD

Trigger PostgreSQL que rechaza `UPDATE` y `DELETE` sobre la tabla `audit_log`:

```sql
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_block_mutations();
```

Incluso un `psql` directo con el usuario `mediconnect` falla.

### Capa 2 — Hash chain criptográfico

Cada entrada incluye:
- `prev_hash` = hash de la entrada anterior
- `entry_hash` = SHA-256( prev_hash || canonicalize(payload completo) )

`canonicalize()` ordena las claves del JSON alfabéticamente → hash determinístico independiente del orden de inserción de campos.

Esto permite que, aunque alguien con privilegios `superuser` modifique el trigger y altere una fila, el `entry_hash` recalculado no coincidirá con el almacenado. La detección se hace recorriendo la cadena:

```
GET /audit/integrity/verify
→ { integrity: "OK", checked_entries: N, breaches: [], tip_hash: ... }
```

El **tip hash** (último hash de la cadena) funciona como "raíz lógica" — basta publicarlo periódicamente (ej. en blockchain pública o en un timestamp service notariado) para tener prueba externa.

### Capa 3 — Captura universal por broker

El `audit-service` se suscribe a la routing key `#` (wildcard) en RabbitMQ `mediconnect.events`. Cualquier evento que un microservicio publique queda automáticamente auditado, sin que el servicio publisher tenga que conocer al audit-service.

### Capa 4 — Mutex en proceso

Para evitar **race condition** entre dos eventos concurrentes que leen el mismo `prev_hash`, los `INSERT` se serializan con un mutex en proceso (`writeLock`). En producción multi-réplica se reemplazaría por:
- Advisory lock de PostgreSQL, o
- Una única partición consumer en Rabbit (consumer concurrency=1) por servicio.

## Por qué no usar una blockchain real (Ethereum / Hyperledger)

- Costo y latencia inviables para 15M pacientes y eventos por segundo.
- Complejidad operativa.
- No agrega valor sobre hash chain + tip hash publicado: la propiedad de inmutabilidad es la misma cuando confías la "raíz" a una autoridad externa.

## Consecuencias

✅ Cumple "registros inmutables" verificable matemáticamente.
✅ Auditor puede inspeccionar, no puede alterar.
✅ Detección de tampering en O(N) (un solo recorrido de la cadena).
✅ Captura universal sin acoplar servicios al audit-service.
⚠️ El audit-service es **point of failure**: si cae, eventos se quedan en la queue (durable). Se recupera al volver.
⚠️ El tamaño del log crece sin parar → política de archivado (no de borrado: archivado a almacenamiento frío con hashes congelados) tras período legal.
⚠️ Si se publica el tip hash en un timestamp service externo (futuro), la prueba de inmutabilidad se vuelve resistente a actores estatales.
