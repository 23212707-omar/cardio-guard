'use strict';

const { EVENTO, crearAFD, TransicionInvalidaError } = require('../src/automaton/afd');

function correr(nombre, eventos) {
  console.log('\nCaso: ' + nombre);
  const afd = crearAFD();
  for (const evento of eventos) {
    afd.transitar(evento);
  }
  console.log('Historial: ' + afd.historial.join(' -> '));
  console.log(
    `Final: ${afd.esFinal()}  Aceptado: ${afd.esAceptado()}  Rechazado: ${afd.esRechazado()}`
  );
}

// 1. REGISTRAR válido
correr('REGISTRAR válido', [
  EVENTO.LEXICO_SINTACTICO_OK_REG,
  EVENTO.SEMANTICA_REGISTRO_OK,
]);

// 2. REGISTRAR con error semántico (ej. ID duplicado)
correr('REGISTRAR con error semántico', [
  EVENTO.LEXICO_SINTACTICO_OK_REG,
  EVENTO.SEMANTICA_REGISTRO_ERROR,
]);

// 3. Lectura con error de sintaxis (ej. 120/-80): se rechaza antes de llegar a BUSCANDO_PACIENTE
correr('Lectura con error de sintaxis', [
  EVENTO.LEXICO_SINTACTICO_ERROR,
]);

// 4. Lectura de un paciente que no existe
correr('Lectura - paciente no encontrado', [
  EVENTO.LEXICO_SINTACTICO_OK_LEC,
  EVENTO.PACIENTE_NO_ENCONTRADO,
]);

// 5. Lectura con error semántico (ej. diastólica > sistólica)
correr('Lectura con error semántico', [
  EVENTO.LEXICO_SINTACTICO_OK_LEC,
  EVENTO.PACIENTE_ENCONTRADO,
  EVENTO.SEMANTICA_LECTURA_ERROR,
]);

// 6. Lectura normal, aceptada sin observaciones
correr('Lectura normal (aceptada)', [
  EVENTO.LEXICO_SINTACTICO_OK_LEC,
  EVENTO.PACIENTE_ENCONTRADO,
  EVENTO.SEMANTICA_LECTURA_OK,
  EVENTO.CLASIFICACION_NORMAL,
]);

// 7. Lectura en crisis hipertensiva (ALERTA ROJA)
correr('Lectura en crisis hipertensiva', [
  EVENTO.LEXICO_SINTACTICO_OK_LEC,
  EVENTO.PACIENTE_ENCONTRADO,
  EVENTO.SEMANTICA_LECTURA_OK,
  EVENTO.CLASIFICACION_ALERTA,
]);

// 8. Lectura con dato sospechoso (valor fuera de rango fisiológico, aceptado con advertencia)
correr('Lectura con dato sospechoso', [
  EVENTO.LEXICO_SINTACTICO_OK_LEC,
  EVENTO.PACIENTE_ENCONTRADO,
  EVENTO.SEMANTICA_LECTURA_OK,
  EVENTO.CLASIFICACION_ADVERTENCIA,
]);

// 9. Lectura que es alerta y advertencia a la vez (sección 7.4)
correr('Lectura: alerta y advertencia a la vez', [
  EVENTO.LEXICO_SINTACTICO_OK_LEC,
  EVENTO.PACIENTE_ENCONTRADO,
  EVENTO.SEMANTICA_LECTURA_OK,
  EVENTO.CLASIFICACION_ALERTA_Y_ADVERTENCIA,
]);

// 10. Transición inválida a propósito: debe lanzar TransicionInvalidaError
console.log('\nCaso: transición inválida (debe fallar)');
try {
  const afd = crearAFD();
  afd.transitar(EVENTO.PACIENTE_ENCONTRADO); // no es válido en el estado INICIO
  console.log('ERROR: no debió llegar aquí');
} catch (err) {
  if (err instanceof TransicionInvalidaError) {
    console.log('Lanzó TransicionInvalidaError como se esperaba: ' + err.message);
  } else {
    throw err;
  }
}

// --- CONSULTAR y LISTAR ---
correr('CONSULTAR válido', [
  EVENTO.LEXICO_SINTACTICO_OK_CON,
  EVENTO.CONSULTA_PACIENTE_ENCONTRADO,
]);
correr('CONSULTAR de paciente inexistente', [
  EVENTO.LEXICO_SINTACTICO_OK_CON,
  EVENTO.CONSULTA_PACIENTE_NO_ENCONTRADO,
]);
correr('LISTAR', [
  EVENTO.LEXICO_SINTACTICO_OK_LIS,
  EVENTO.LISTADO_OK,
]);

for (const [nombre, eventos] of [
  ['LISTANDO no acepta CONSULTA_PACIENTE_ENCONTRADO', [EVENTO.LEXICO_SINTACTICO_OK_LIS, EVENTO.CONSULTA_PACIENTE_ENCONTRADO]],
  ['BUSCANDO_PACIENTE_CONSULTA no acepta PACIENTE_ENCONTRADO (el de lecturas)', [EVENTO.LEXICO_SINTACTICO_OK_CON, EVENTO.PACIENTE_ENCONTRADO]],
]) {
  try {
    const afd = crearAFD();
    eventos.forEach((e) => afd.transitar(e));
    console.log(`[FALLÓ] ${nombre}`);
  } catch (err) {
    if (!(err instanceof TransicionInvalidaError)) throw err;
    console.log(`[OK] ${nombre}`);
  }
}
