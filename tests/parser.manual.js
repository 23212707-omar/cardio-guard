'use strict';

const { analizarLexico, ErrorLexico } = require('../src/lexer/lexer');
const { analizarSintactico, ErrorSintactico } = require('../src/parser/parser');

const casos = [
  'REGISTRAR P001, 45, M, O+',          // REG válido
  'REGISTRAR P003, 150, M, B+',         // REG válido (la edad inválida es semántica, no sintáctica)
  'P001; 118/76, 75',                   // LEC válido
  'P002; 190/125, 110',                 // LEC válido
  'P002; 120/-80, 75',                  // error específico: número positivo tras la diagonal
  'REGISTRAR P001, 45, M',              // error genérico: falta ", sangre"
  'P001; 120/80, 70 90',                // error genérico: sobra texto al final
  '120/80, 70',                         // error: no empieza con REGISTRAR ni con un ID
];

for (const linea of casos) {
  console.log('\nEntrada: ' + linea);
  try {
    const tokens = analizarLexico(linea);
    const arbol = analizarSintactico(tokens);
    console.log('Árbol:   ' + JSON.stringify(arbol));
  } catch (err) {
    if (err instanceof ErrorLexico) {
      console.log(`Error léxico en posición ${err.posicion}: ${err.message}`);
    } else if (err instanceof ErrorSintactico) {
      console.log(`Error de sintaxis en posición ${err.posicion}: ${err.message}`);
    } else {
      throw err;
    }
  }
}
