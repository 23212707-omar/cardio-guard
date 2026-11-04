'use strict';

/**
 * lexer.js — Analizador léxico de Cardio Guard
 *
 * Convierte una línea de texto (una instrucción, ya sea REGISTRAR o una
 * lectura) en una lista de tokens. No valida gramática (eso es trabajo
 * del parser) ni coherencia clínica (eso es trabajo del motor semántico);
 * solo reconoce qué "forma" tiene cada pedazo del texto.
 *
 * Tokens que puede producir (ver sección 4.2 del documento de contexto):
 *   REGISTRAR    palabra reservada
 *   ID           letra P seguida de uno o más dígitos (ej. P001)
 *   NUM          uno o más dígitos (ej. 118)
 *   SANGRE       una o más letras seguidas inmediatamente de + o -
 *                (ej. O+, AB-). Es la única forma de reconocer un tipo
 *                de sangre por su patrón, sin depender de contexto.
 *   LETRA        una o más letras sin signo (ej. M, F). El parser decide,
 *                por su posición en la gramática, si esto corresponde al
 *                campo "sexo" de un REGISTRAR. El lexer no distingue
 *                SEXO de cualquier otra letra suelta: eso no es un hecho
 *                léxico, es un hecho sintáctico/semántico.
 *   SLASH        /
 *   COMA         ,
 *   PUNTOYCOMA   ;
 *   GUION        -  (token propio, necesario para poder detectar casos
 *                    inválidos como "120/-80")
 *   EOF          marca el final de la línea (no corresponde a texto)
 */

const TIPO = Object.freeze({
  REGISTRAR: 'REGISTRAR',
  ID: 'ID',
  NUM: 'NUM',
  SANGRE: 'SANGRE',
  LETRA: 'LETRA',
  SLASH: 'SLASH',
  COMA: 'COMA',
  PUNTOYCOMA: 'PUNTOYCOMA',
  GUION: 'GUION',
  EOF: 'EOF',
});

/** Error léxico: símbolo que no coincide con ningún token válido. */
class ErrorLexico extends Error {
  constructor(mensaje, posicion) {
    super(mensaje);
    this.name = 'ErrorLexico';
    this.posicion = posicion;
  }
}

// El orden importa: las reglas más específicas van primero, para que una
// coincidencia más general (como LETRA) no "robe" un texto que en realidad
// pertenece a una regla más concreta (como REGISTRAR o SANGRE).
const REGLAS = [
  { tipo: TIPO.REGISTRAR, regex: /^REGISTRAR\b/ },
  { tipo: TIPO.ID, regex: /^P\d+/ },
  { tipo: TIPO.SANGRE, regex: /^[A-Za-z]+[+-]/ },
  { tipo: TIPO.NUM, regex: /^\d+/ },
  { tipo: TIPO.LETRA, regex: /^[A-Za-z]+/ },
  { tipo: TIPO.SLASH, regex: /^\// },
  { tipo: TIPO.COMA, regex: /^,/ },
  { tipo: TIPO.PUNTOYCOMA, regex: /^;/ },
  { tipo: TIPO.GUION, regex: /^-/ },
];

/**
 * Convierte una línea de texto en una lista de tokens.
 * @param {string} linea - la instrucción a analizar (sin salto de línea).
 * @returns {Array<{tipo: string, valor: string, posicion: number}>}
 * @throws {ErrorLexico} si encuentra un símbolo que no coincide con ningún token.
 */
function analizarLexico(linea) {
  const tokens = [];
  let resto = linea;
  let posicion = 0;

  while (resto.length > 0) {
    // Los espacios en blanco se ignoran y no generan token.
    const espacio = resto.match(/^\s+/);
    if (espacio) {
      posicion += espacio[0].length;
      resto = resto.slice(espacio[0].length);
      continue;
    }

    const coincidencia = REGLAS
      .map((regla) => ({ regla, m: resto.match(regla.regex) }))
      .find((r) => r.m !== null);

    if (!coincidencia) {
      throw new ErrorLexico(
        `Símbolo no reconocido: "${resto[0]}"`,
        posicion
      );
    }

    const { regla, m } = coincidencia;
    tokens.push({ tipo: regla.tipo, valor: m[0], posicion });
    posicion += m[0].length;
    resto = resto.slice(m[0].length);
  }

  tokens.push({ tipo: TIPO.EOF, valor: '', posicion });
  return tokens;
}

module.exports = { analizarLexico, ErrorLexico, TIPO };
