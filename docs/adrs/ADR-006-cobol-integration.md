# ADR-006: Integración solo-lectura con sistema legado COBOL

- **Status**: Aceptado
- **Fecha**: 2026-05-26

## Contexto

Del contexto adicional del kata:
> *"El sistema de registro civil nacional (cédulas/DNI) funciona en un sistema legado COBOL que el Ministerio no puede modificar; la integración debe ser solo de lectura vía API REST expuesta recientemente."*

## Decisión

- Encapsulamos la integración dentro del `patient-service` mediante un adapter (`cobolMock.js`) que en producción se reemplaza por un HTTP client real al endpoint REST del COBOL.
- La validación del DNI es **bloqueante** durante la creación del paciente: si COBOL responde inválido, se devuelve `422` y no se persiste.
- El paciente persistido marca `cobol_validated = TRUE`.
- Toda la integración es **read-only** (no se llama a nada que mute el legado).

## Patrón aplicado

**Anti-Corruption Layer (ACL)** — aísla la semántica del legado del modelo de dominio interno, evitando que cambios en COBOL se propaguen al resto del sistema.

## Consecuencias

✅ Cumple la restricción dura del kata.
✅ Reemplazo del mock a real es transparente (un solo archivo).
✅ El COBOL nunca recibe escrituras → cero riesgo de romperlo.
⚠️ Si COBOL está caído, no se pueden registrar nuevos pacientes → mitigación: circuit breaker + retry con backoff (pendiente para prod).
