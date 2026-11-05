'use strict';

/**
 * validarConsulta.js — Reglas semánticas para la instrucción CONSULTAR
 *
 * Única regla: el paciente consultado debe existir. Igual que
 * validarRegistro.js, no toca el sistema de archivos: recibe el conjunto de
 * IDs registrados como parámetro.
 *
 * LISTAR no tiene módulo de validación: no recibe datos que validar (un
 * listado vacío no es un error, ver sección 14.3 del documento de contexto).
 *
 * @param {{id:string}} arbolCon
 * @param {Set<string>} idsExistentes
 * @returns {{ok:true} | {ok:false, mensaje:string}}
 */
function validarConsulta(arbolCon, idsExistentes) {
  if (!idsExistentes.has(arbolCon.id)) {
    return {
      ok: false,
      mensaje: `Error Semántico: paciente ${arbolCon.id} no encontrado.`,
    };
  }
  return { ok: true };
}

module.exports = { validarConsulta };
