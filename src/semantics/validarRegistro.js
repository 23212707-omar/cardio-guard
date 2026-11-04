'use strict';

/**
 * validarRegistro.js — Reglas semánticas para la instrucción REGISTRAR
 *
 * Implementa la tabla "Semánticos en el registro de pacientes" de la
 * sección 8 del documento de contexto. Revisa un árbol REG ya construido
 * por el parser (con la edad ya convertida a número).
 *
 * No toca el sistema de archivos: recibe el conjunto de IDs que ya existen
 * (idsExistentes) como parámetro, para que este módulo se pueda probar sin
 * depender de storage/pacientesRepo.js. Es interpreter.js quien arma ese
 * conjunto a partir de pacientes.csv antes de llamar a esta función.
 */

const SANGRE_VALIDAS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

/**
 * @param {{id:string, edad:number, sexo:string, sangre:string}} arbolReg
 * @param {Set<string>} idsExistentes - IDs de pacientes ya registrados.
 * @returns {{ok:true} | {ok:false, mensaje:string}}
 */
function validarRegistro(arbolReg, idsExistentes) {
  const { id, edad, sexo, sangre } = arbolReg;

  // ID vacío o duplicado. El parser ya garantiza que "id" no llegue vacío
  // (el token ID exige al menos un dígito después de la P), así que en la
  // práctica esta regla solo se activa por duplicado; se deja la
  // comprobación de vacío de todas formas, por si en el futuro el
  // identificador se vuelve opcional o cambia de formato.
  if (!id || idsExistentes.has(id)) {
    return {
      ok: false,
      mensaje: `Error Semántico: identificador de paciente inválido o duplicado (${id}).`,
    };
  }

  if (edad < 0 || edad > 120) {
    return {
      ok: false,
      mensaje: `Error Semántico: edad fuera de rango válido (${edad}).`,
    };
  }

  if (sexo !== 'M' && sexo !== 'F') {
    return {
      ok: false,
      mensaje: `Error Semántico: valor de sexo no válido (${sexo}).`,
    };
  }

  if (!SANGRE_VALIDAS.has(sangre)) {
    return {
      ok: false,
      mensaje: `Error Semántico: tipo de sangre no reconocido (${sangre}).`,
    };
  }

  return { ok: true };
}

module.exports = { validarRegistro, SANGRE_VALIDAS };
