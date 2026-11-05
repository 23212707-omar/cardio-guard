'use strict';

const { TIPO } = require('../lexer/lexer');

/**
 * parser.js — Analizador sintáctico de Cardio Guard
 *
 * Gramática que implementa (ver sección 4.3 del documento de contexto):
 *   S   -> REG | LEC | CON | LIS
 *   REG -> registrar id , num , sexo , sangre
 *   LEC -> id ; P , F
 *   P   -> num / num
 *   F   -> num
 *   CON -> consultar id
 *   LIS -> listar
 *
 * Entrega un árbol ya "aplanado" a un objeto plano (no una estructura de
 * nodos anidados), porque es lo que el motor semántico necesita consumir:
 *
 *   REGISTRAR P001, 45, M, O+
 *     -> { tipo: 'REG', id: 'P001', edad: 45, sexo: 'M', sangre: 'O+' }
 *
 *   P001; 118/76, 75
 *     -> { tipo: 'LEC', id: 'P001', sistolica: 118, diastolica: 76, frecuencia: 75 }
 *
 *   CONSULTAR P001  -> { tipo: 'CON', id: 'P001' }
 *   LISTAR          -> { tipo: 'LIS' }
 *
 * El parser ya convierte los números de texto a tipo numérico; eso es un
 * paso mecánico, no una regla semántica.
 *
 * El parser NO sabe en qué línea del archivo está (solo ve una instrucción
 * a la vez), así que sus errores solo cargan la posición dentro de la
 * línea. Es responsabilidad de interpreter.js anteponer "línea X" al
 * mensaje final.
 */

/** Error de sintaxis: la secuencia de tokens no sigue la gramática. */
class ErrorSintactico extends Error {
  /**
   * @param {string} detalle - qué se esperaba, en minúsculas (ej. 'se esperaba ","');
   *   es el texto que se muestra junto al marcador "^".
   * @param {number} posicion - índice del carácter con la falla dentro de la línea.
   */
  constructor(detalle, posicion) {
    super(`Estructura de tokens inválida (${detalle})`);
    this.name = 'ErrorSintactico';
    this.detalle = detalle;
    this.posicion = posicion;
  }
}

/**
 * Convierte una lista de tokens (salida de analizarLexico) en el árbol
 * de la instrucción.
 * @param {Array<{tipo: string, valor: string, posicion: number}>} tokens
 * @returns {{tipo: 'REG', id: string, edad: number, sexo: string, sangre: string}
 *          | {tipo: 'LEC', id: string, sistolica: number, diastolica: number, frecuencia: number}
 *          | {tipo: 'CON', id: string}
 *          | {tipo: 'LIS'}}
 * @throws {ErrorSintactico}
 */
function analizarSintactico(tokens) {
  let i = 0;

  const actual = () => tokens[i];

  const avanzar = () => {
    const t = tokens[i];
    i += 1;
    return t;
  };

  /** Exige que el token actual sea del tipo dado; si no, lanza ErrorSintactico. */
  const esperar = (tipoEsperado, mensaje) => {
    const t = actual();
    if (t.tipo !== tipoEsperado) {
      throw new ErrorSintactico(mensaje(t), t.posicion);
    }
    return avanzar();
  };

  // P -> num / num
  function parsearP() {
    const numIzq = esperar(
      TIPO.NUM,
      (t) => 'se esperaba la presión sistólica'
    ).valor;

    esperar(
      TIPO.SLASH,
      (t) => 'se esperaba "/"'
    );

    // Caso específico documentado: un guion justo después de la diagonal,
    // como en "120/-80". Se reporta con el mensaje exacto ya definido,
    // en vez del mensaje genérico de "se esperaba un número".
    if (actual().tipo === TIPO.GUION) {
      throw new ErrorSintactico(
        'se esperaba un número positivo después de la diagonal',
        actual().posicion
      );
    }

    const numDer = esperar(
      TIPO.NUM,
      (t) => 'se esperaba la presión diastólica'
    ).valor;

    return { sistolica: Number(numIzq), diastolica: Number(numDer) };
  }

  // F -> num
  function parsearF() {
    const num = esperar(
      TIPO.NUM,
      (t) => 'se esperaba la frecuencia cardíaca'
    ).valor;
    return Number(num);
  }

  /** Exige que no quede nada más que EOF después de la instrucción. */
  function exigirFinDeLinea() {
    esperar(
      TIPO.EOF,
      (t) => `sobra texto después de la instrucción: "${t.valor}"`
    );
  }

  // REG -> registrar id , num , sexo , sangre
  function parsearREG() {
    esperar(TIPO.REGISTRAR, () => 'se esperaba REGISTRAR');
    const id = esperar(
      TIPO.ID,
      () => 'se esperaba el identificador del paciente'
    ).valor;
    esperar(TIPO.COMA, () => 'se esperaba ","');
    const edad = esperar(
      TIPO.NUM,
      () => 'se esperaba la edad'
    ).valor;
    esperar(TIPO.COMA, () => 'se esperaba ","');
    const sexo = esperar(
      TIPO.LETRA,
      () => 'se esperaba el sexo'
    ).valor;
    esperar(TIPO.COMA, () => 'se esperaba ","');
    const sangre = esperar(
      TIPO.SANGRE,
      () => 'se esperaba el tipo de sangre'
    ).valor;
    exigirFinDeLinea();

    return { tipo: 'REG', id, edad: Number(edad), sexo, sangre };
  }

  // LEC -> id ; P , F
  function parsearLEC() {
    const id = esperar(
      TIPO.ID,
      () => 'se esperaba el identificador del paciente'
    ).valor;
    esperar(TIPO.PUNTOYCOMA, () => 'se esperaba ";"');
    const presion = parsearP();
    esperar(TIPO.COMA, () => 'se esperaba ","');
    const frecuencia = parsearF();
    exigirFinDeLinea();

    return {
      tipo: 'LEC',
      id,
      sistolica: presion.sistolica,
      diastolica: presion.diastolica,
      frecuencia,
    };
  }

  // CON -> consultar id
  function parsearCON() {
    esperar(TIPO.CONSULTAR, () => 'se esperaba CONSULTAR');
    const id = esperar(
      TIPO.ID,
      () => 'se esperaba el identificador del paciente'
    ).valor;
    exigirFinDeLinea();
    return { tipo: 'CON', id };
  }

  // LIS -> listar
  function parsearLIS() {
    esperar(TIPO.LISTAR, () => 'se esperaba LISTAR');
    exigirFinDeLinea();
    return { tipo: 'LIS' };
  }

  // S -> REG | LEC | CON | LIS   (se decide con el primer token, sin retroceder)
  const primero = actual();
  if (primero.tipo === TIPO.REGISTRAR) {
    return parsearREG();
  }
  if (primero.tipo === TIPO.CONSULTAR) {
    return parsearCON();
  }
  if (primero.tipo === TIPO.LISTAR) {
    return parsearLIS();
  }
  if (primero.tipo === TIPO.ID) {
    return parsearLEC();
  }
  throw new ErrorSintactico(
    'se esperaba REGISTRAR, CONSULTAR, LISTAR o el identificador de un paciente',
    primero.posicion
  );
}

module.exports = { analizarSintactico, ErrorSintactico };
