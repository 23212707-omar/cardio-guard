'use strict';

/**
 * afd.js — Autómata Finito Determinista de Cardio Guard
 *
 * Es una máquina de estados "pura": no llama al lexer, al parser ni a las
 * reglas semánticas. Solo recibe EVENTOS (el resultado de cada etapa) y
 * decide a qué ESTADO pasar, según la tabla de transiciones. Quien orquesta
 * el proceso completo (llamar al lexer, al parser, etc. y alimentar al AFD
 * con los eventos correspondientes) es interpreter.js.
 *
 * Definición formal (5-tupla, sección 7/13 del documento de contexto):
 *   Q  -> el objeto ESTADO, de abajo
 *   Σ  -> el objeto EVENTO, de abajo
 *   q0 -> ESTADO.INICIO
 *   δ  -> la tabla TRANSICIONES
 *   F  -> ESTADOS_DE_ACEPTACION (ACEPTADO y sus variantes con alerta/advertencia)
 *
 * RECHAZADO es un estado final, pero queda fuera de F a propósito: la
 * documentación distingue "aceptado" de "rechazado" como dos desenlaces
 * distintos, no F vs. "lo que no es F".
 */

const ESTADO = Object.freeze({
  INICIO: 'INICIO',
  VALIDANDO_SEMANTICA_REGISTRO: 'VALIDANDO_SEMANTICA_REGISTRO',
  BUSCANDO_PACIENTE: 'BUSCANDO_PACIENTE',
  VALIDANDO_SEMANTICA_LECTURA: 'VALIDANDO_SEMANTICA_LECTURA',
  CLASIFICANDO: 'CLASIFICANDO',
  BUSCANDO_PACIENTE_CONSULTA: 'BUSCANDO_PACIENTE_CONSULTA',
  LISTANDO: 'LISTANDO',
  ACEPTADO: 'ACEPTADO',
  ACEPTADO_CON_ALERTA: 'ACEPTADO_CON_ALERTA',
  ACEPTADO_CON_ADVERTENCIA: 'ACEPTADO_CON_ADVERTENCIA',
  ACEPTADO_CON_ALERTA_Y_ADVERTENCIA: 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA',
  RECHAZADO: 'RECHAZADO',
});

const EVENTO = Object.freeze({
  LEXICO_SINTACTICO_ERROR: 'LEXICO_SINTACTICO_ERROR',
  LEXICO_SINTACTICO_OK_REG: 'LEXICO_SINTACTICO_OK_REG',
  LEXICO_SINTACTICO_OK_LEC: 'LEXICO_SINTACTICO_OK_LEC',
  LEXICO_SINTACTICO_OK_CON: 'LEXICO_SINTACTICO_OK_CON',
  LEXICO_SINTACTICO_OK_LIS: 'LEXICO_SINTACTICO_OK_LIS',
  CONSULTA_PACIENTE_NO_ENCONTRADO: 'CONSULTA_PACIENTE_NO_ENCONTRADO',
  CONSULTA_PACIENTE_ENCONTRADO: 'CONSULTA_PACIENTE_ENCONTRADO',
  LISTADO_OK: 'LISTADO_OK',
  SEMANTICA_REGISTRO_ERROR: 'SEMANTICA_REGISTRO_ERROR',
  SEMANTICA_REGISTRO_OK: 'SEMANTICA_REGISTRO_OK',
  PACIENTE_NO_ENCONTRADO: 'PACIENTE_NO_ENCONTRADO',
  PACIENTE_ENCONTRADO: 'PACIENTE_ENCONTRADO',
  SEMANTICA_LECTURA_ERROR: 'SEMANTICA_LECTURA_ERROR',
  SEMANTICA_LECTURA_OK: 'SEMANTICA_LECTURA_OK',
  CLASIFICACION_NORMAL: 'CLASIFICACION_NORMAL',
  CLASIFICACION_ALERTA: 'CLASIFICACION_ALERTA',
  CLASIFICACION_ADVERTENCIA: 'CLASIFICACION_ADVERTENCIA',
  CLASIFICACION_ALERTA_Y_ADVERTENCIA: 'CLASIFICACION_ALERTA_Y_ADVERTENCIA',
});

const ESTADOS_DE_ACEPTACION = new Set([
  ESTADO.ACEPTADO,
  ESTADO.ACEPTADO_CON_ALERTA,
  ESTADO.ACEPTADO_CON_ADVERTENCIA,
  ESTADO.ACEPTADO_CON_ALERTA_Y_ADVERTENCIA,
]);

const ESTADOS_FINALES = new Set([...ESTADOS_DE_ACEPTACION, ESTADO.RECHAZADO]);

// δ: función de transición, como tabla "estado:evento" -> estado siguiente.
const TRANSICIONES = Object.freeze({
  [`${ESTADO.INICIO}:${EVENTO.LEXICO_SINTACTICO_ERROR}`]: ESTADO.RECHAZADO,
  [`${ESTADO.INICIO}:${EVENTO.LEXICO_SINTACTICO_OK_REG}`]: ESTADO.VALIDANDO_SEMANTICA_REGISTRO,
  [`${ESTADO.INICIO}:${EVENTO.LEXICO_SINTACTICO_OK_LEC}`]: ESTADO.BUSCANDO_PACIENTE,
  [`${ESTADO.INICIO}:${EVENTO.LEXICO_SINTACTICO_OK_CON}`]: ESTADO.BUSCANDO_PACIENTE_CONSULTA,
  [`${ESTADO.INICIO}:${EVENTO.LEXICO_SINTACTICO_OK_LIS}`]: ESTADO.LISTANDO,

  [`${ESTADO.BUSCANDO_PACIENTE_CONSULTA}:${EVENTO.CONSULTA_PACIENTE_NO_ENCONTRADO}`]: ESTADO.RECHAZADO,
  [`${ESTADO.BUSCANDO_PACIENTE_CONSULTA}:${EVENTO.CONSULTA_PACIENTE_ENCONTRADO}`]: ESTADO.ACEPTADO,

  [`${ESTADO.LISTANDO}:${EVENTO.LISTADO_OK}`]: ESTADO.ACEPTADO,

  [`${ESTADO.VALIDANDO_SEMANTICA_REGISTRO}:${EVENTO.SEMANTICA_REGISTRO_ERROR}`]: ESTADO.RECHAZADO,
  [`${ESTADO.VALIDANDO_SEMANTICA_REGISTRO}:${EVENTO.SEMANTICA_REGISTRO_OK}`]: ESTADO.ACEPTADO,

  [`${ESTADO.BUSCANDO_PACIENTE}:${EVENTO.PACIENTE_NO_ENCONTRADO}`]: ESTADO.RECHAZADO,
  [`${ESTADO.BUSCANDO_PACIENTE}:${EVENTO.PACIENTE_ENCONTRADO}`]: ESTADO.VALIDANDO_SEMANTICA_LECTURA,

  [`${ESTADO.VALIDANDO_SEMANTICA_LECTURA}:${EVENTO.SEMANTICA_LECTURA_ERROR}`]: ESTADO.RECHAZADO,
  [`${ESTADO.VALIDANDO_SEMANTICA_LECTURA}:${EVENTO.SEMANTICA_LECTURA_OK}`]: ESTADO.CLASIFICANDO,

  [`${ESTADO.CLASIFICANDO}:${EVENTO.CLASIFICACION_NORMAL}`]: ESTADO.ACEPTADO,
  [`${ESTADO.CLASIFICANDO}:${EVENTO.CLASIFICACION_ALERTA}`]: ESTADO.ACEPTADO_CON_ALERTA,
  [`${ESTADO.CLASIFICANDO}:${EVENTO.CLASIFICACION_ADVERTENCIA}`]: ESTADO.ACEPTADO_CON_ADVERTENCIA,
  [`${ESTADO.CLASIFICANDO}:${EVENTO.CLASIFICACION_ALERTA_Y_ADVERTENCIA}`]: ESTADO.ACEPTADO_CON_ALERTA_Y_ADVERTENCIA,
});

/** Error de programación: se intentó una transición que la tabla no contempla. */
class TransicionInvalidaError extends Error {
  constructor(estado, evento) {
    super(
      `Transición inválida: el evento "${evento}" no está definido para el estado "${estado}". ` +
      'Esto es un error de interpreter.js, no un error de los datos del usuario.'
    );
    this.name = 'TransicionInvalidaError';
    this.estado = estado;
    this.evento = evento;
  }
}

class AFD {
  constructor() {
    this.estado = ESTADO.INICIO;
    this.historial = [ESTADO.INICIO];
  }

  /** Aplica un evento y mueve el autómata al siguiente estado. */
  transitar(evento) {
    const clave = `${this.estado}:${evento}`;
    const siguiente = TRANSICIONES[clave];
    if (siguiente === undefined) {
      throw new TransicionInvalidaError(this.estado, evento);
    }
    this.estado = siguiente;
    this.historial.push(siguiente);
    return this.estado;
  }

  estadoActual() {
    return this.estado;
  }

  /** ¿El autómata llegó a un estado del que ya no sale (aceptación o rechazo)? */
  esFinal() {
    return ESTADOS_FINALES.has(this.estado);
  }

  /** ¿El estado actual es alguno de los de aceptación (F)? */
  esAceptado() {
    return ESTADOS_DE_ACEPTACION.has(this.estado);
  }

  esRechazado() {
    return this.estado === ESTADO.RECHAZADO;
  }
}

/** Crea un AFD nuevo en el estado inicial (q0), uno por cada instrucción procesada. */
function crearAFD() {
  return new AFD();
}

module.exports = {
  ESTADO,
  EVENTO,
  TRANSICIONES,
  ESTADOS_DE_ACEPTACION,
  ESTADOS_FINALES,
  TransicionInvalidaError,
  AFD,
  crearAFD,
};
