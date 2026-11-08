'use strict';

const { causasDatoSospechoso } = require('./clasificacion');

/**
 * validarLectura.js — Reglas semánticas para una instrucción de lectura
 *
 * Implementa la tabla "Semánticos en lecturas" de la sección 8 del
 * documento de contexto, excepto "paciente no encontrado": esa regla la
 * resuelve el AFD junto con storage/pacientesRepo.js (evento
 * PACIENTE_NO_ENCONTRADO), antes de que esta función se llame siquiera, ya
 * que validarLectura.js solo se ejecuta una vez que el paciente ya fue
 * encontrado.
 *
 * Nota sobre "valores nulos o negativos": el parser ya rechaza por sintaxis
 * cualquier número negativo (ver parser.js, caso "120/-80" y el guion como
 * token propio), así que en la práctica esta función solo puede toparse
 * con el caso de un valor en cero. Se conserva la comprobación de
 * negativos de todas formas, para que la regla quede completa y no
 * dependa en silencio de un detalle del parser.
 */

/**
 * @param {{sistolica:number, diastolica:number, frecuencia:number}} arbolLec
 * Nota: la sistólica debe ser estrictamente mayor que la diastólica; si es
 * menor o igual, la lectura se rechaza.
 *
 * @returns {{ok:true, datoSospechoso:boolean, causasSospechoso:string[]} | {ok:false, mensaje:string}}
 */
function validarLectura(arbolLec) {
  const { sistolica, diastolica, frecuencia } = arbolLec;

  if (sistolica <= diastolica) {
    return {
      ok: false,
      mensaje: `Error Semántico: la sistólica (${sistolica}) debe ser mayor que la diastólica (${diastolica}).`,
    };
  }

  if (sistolica <= 0 || diastolica <= 0 || frecuencia <= 0) {
    return {
      ok: false,
      mensaje: 'Error Semántico: los valores no pueden ser cero o negativos.',
    };
  }

  if (frecuencia < 30 || frecuencia > 220) {
    return {
      ok: false,
      mensaje: `Error Semántico: frecuencia cardíaca fuera de rango válido (${frecuencia}).`,
    };
  }

  // Presión extrema, pulso muy bajo o frecuencia en extremos (sección 7.4):
  // no se rechaza. Se deja pasar como válida, marcada como "dato
  // sospechoso" (con sus causas), para que clasificacion.js decida si
  // corresponde ADVERTENCIA, ALERTA, o ambas.
  const causasSospechoso = causasDatoSospechoso(sistolica, diastolica, frecuencia);

  return { ok: true, datoSospechoso: causasSospechoso.length > 0, causasSospechoso };
}

module.exports = { validarLectura };
