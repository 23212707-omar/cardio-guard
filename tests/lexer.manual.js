'use strict';

const { analizarLexico, ErrorLexico } = require('../src/lexer/lexer');

const casos = [
  'REGISTRAR P001, 45, M, O+',
  'REGISTRAR P003, 150, M, B+',
  'P001; 118/76, 75',
  'P002; 190/125, 110',
  'P002; 120/-80, 75',   // debe producir tokens: ..., SLASH, GUION, NUM(80), ...
  'P009; 120/80, 70',
  'CONSULTAR P001',
  'LISTAR',
  'consultar P001',      // minúsculas: no es palabra reservada (LETRA + ID)
  'P001; 120/80, 70$',   // '$' no es un símbolo válido -> debe lanzar ErrorLexico
];

for (const linea of casos) {
  console.log('\nEntrada: ' + linea);
  try {
    const tokens = analizarLexico(linea);
    const resumen = tokens
      .filter((t) => t.tipo !== 'EOF')
      .map((t) => `${t.tipo}(${t.valor})`)
      .join('  ');
    console.log('Tokens:  ' + resumen);
  } catch (err) {
    if (err instanceof ErrorLexico) {
      console.log(`Error léxico en posición ${err.posicion}: ${err.message}`);
    } else {
      throw err;
    }
  }
}
