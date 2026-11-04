'use strict';

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
 * @returns {{ok:true, datoSospechoso:boolean} | {ok:false, mensaje:string}}
 */
function validarLectura(arbolLec) {
  const { sistolica, diastolica, frecuencia } = arbolLec;

  if (diastolica > sistolica) {
    return {
      ok: false,
      mensaje: `Error Semántico: la diastólica (${diastolica}) no puede ser mayor que la sistólica (${sistolica}).`,
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

  // Presión fuera de rango fisiológico (sección 7.4): ya NO se rechaza.
  // Se deja pasar como válida, marcada como "dato sospechoso", para que
  // clasificacion.js decida si corresponde ADVERTENCIA, ALERTA, o ambas.
  const datoSospechoso = sistolica > 250 || diastolica > 150;

  return { ok: true, datoSospechoso };
}

module.exports = { validarLectura };
