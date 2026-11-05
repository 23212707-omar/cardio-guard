'use strict';

/**
 * diagnostico.js — Marcador "^" para errores léxicos y sintácticos
 *
 * Arma, como lo haría un compilador, dos líneas de texto: la instrucción
 * original y debajo un "^" alineado con el carácter donde está la falla,
 * seguido del motivo:
 *
 *   P002; 120/-80, 75
 *             ^ se esperaba un número positivo después de la diagonal
 *
 * Es una función pura (sin dependencias): solo manipula texto. Quien la use
 * debe mostrar ambas líneas con fuente monoespaciada y respetando los
 * espacios, o el "^" quedará desalineado.
 */

/**
 * @param {string} texto - la instrucción tal como llegó (sin recortar).
 * @param {number} posicion - índice del carácter con la falla. Puede ser igual
 *   a texto.length (falta algo al final de la línea); fuera de rango se ajusta.
 * @param {string} detalle - el motivo, que se escribe a la derecha del "^".
 * @returns {{instruccion: string, marcador: string}}
 */
function construirMarcador(texto, posicion, detalle) {
  const pos = Math.max(0, Math.min(posicion, texto.length));
  // Los tabuladores se copian tal cual (para que el "^" caiga en la misma
  // columna visual sin importar el ancho del tab); lo demás se vuelve espacio.
  const relleno = texto.slice(0, pos).replace(/[^\t]/g, ' ');
  return { instruccion: texto, marcador: `${relleno}^ ${detalle}` };
}

module.exports = { construirMarcador };
