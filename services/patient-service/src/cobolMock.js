// === Mock del sistema legado COBOL del Registro Civil Nacional ===
// Simula la API REST de solo lectura que expone el sistema COBOL.
// En producción se reemplazaría con un HTTP client al endpoint real.

const fakeRegistry = new Map([
  ['70123456', { dni: '70123456', firstName: 'Juan', lastName: 'Pérez García', birthDate: '1985-03-15', gender: 'M', valid: true }],
  ['70123457', { dni: '70123457', firstName: 'María', lastName: 'López Quispe', birthDate: '1992-07-22', gender: 'F', valid: true }],
  ['70123458', { dni: '70123458', firstName: 'Carlos', lastName: 'Mendoza Ruiz', birthDate: '1978-11-30', gender: 'M', valid: true }],
]);

async function validateDNIWithCOBOL(dni) {
  // Simula latencia de la integración con sistema legado
  await new Promise(r => setTimeout(r, 80));
  if (fakeRegistry.has(dni)) {
    return { valid: true, data: fakeRegistry.get(dni) };
  }
  // Para cualquier DNI numérico de 8 dígitos, lo damos por válido con datos sintéticos
  if (/^\d{8}$/.test(dni)) {
    return {
      valid: true,
      data: { dni, firstName: 'Ciudadano', lastName: 'Verificado', birthDate: '1990-01-01', gender: 'X', valid: true }
    };
  }
  return { valid: false, error: 'DNI no encontrado en registro civil COBOL' };
}

module.exports = { validateDNIWithCOBOL };
