'use strict';

const { construirMarcador } = require('../src/diagnostico');

const check = (descripcion, condicion) => console.log(`[${condicion ? 'OK' : 'FALLÓ'}] ${descripcion}`);

// Ejemplo de referencia: el ^ debe quedar bajo el guion.
const ej = construirMarcador('P002; 120/-80, 75', 10, 'se esperaba un número positivo después de la diagonal');
console.log(`${ej.instruccion}\n${ej.marcador}\n`);
check('devuelve la instrucción sin modificar', ej.instruccion === 'P002; 120/-80, 75');
check('posición 10: 10 espacios y luego el ^', ej.marcador === `${' '.repeat(10)}^ se esperaba un número positivo después de la diagonal`);

check('posición 0: el ^ va al inicio', construirMarcador('abc', 0, 'x').marcador === '^ x');
check('posición = largo (falta algo al final)', construirMarcador('abc', 3, 'x').marcador === '   ^ x');
check('posición mayor al largo se ajusta al final', construirMarcador('abc', 99, 'x').marcador === '   ^ x');
check('posición negativa se ajusta a 0', construirMarcador('abc', -5, 'x').marcador === '^ x');
check('los tabuladores se conservan en el relleno', construirMarcador('a\tb', 2, 'x').marcador === ' \t^ x');
