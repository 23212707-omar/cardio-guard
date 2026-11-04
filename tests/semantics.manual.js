'use strict';

const { validarRegistro } = require('../src/semantics/validarRegistro');
const { validarLectura } = require('../src/semantics/validarLectura');
const {
  clasificarPresion,
  clasificarFrecuencia,
  determinarAvisoClasificacion,
  compararConUltimaRevision,
} = require('../src/semantics/clasificacion');

console.log('=== validarRegistro ===');

console.log(validarRegistro({ id: 'P001', edad: 45, sexo: 'M', sangre: 'O+' }, new Set()));
console.log(validarRegistro({ id: 'P001', edad: 45, sexo: 'M', sangre: 'O+' }, new Set(['P001'])));
console.log(validarRegistro({ id: 'P003', edad: 150, sexo: 'M', sangre: 'B+' }, new Set()));
console.log(validarRegistro({ id: 'P010', edad: 40, sexo: 'X', sangre: 'O+' }, new Set()));
console.log(validarRegistro({ id: 'P011', edad: 40, sexo: 'F', sangre: 'Z+' }, new Set()));

console.log('\n=== validarLectura ===');

console.log(validarLectura({ sistolica: 118, diastolica: 76, frecuencia: 75 }));
console.log(validarLectura({ sistolica: 80, diastolica: 120, frecuencia: 75 }));  // diastólica > sistólica
console.log(validarLectura({ sistolica: 0, diastolica: 76, frecuencia: 75 }));     // valor en cero
console.log(validarLectura({ sistolica: 120, diastolica: 80, frecuencia: 250 }));  // frecuencia fuera de rango
console.log(validarLectura({ sistolica: 260, diastolica: 70, frecuencia: 75 }));   // dato sospechoso (no se rechaza)

console.log('\n=== clasificarPresion ===');
for (const [s, d] of [[118, 76], [125, 75], [135, 85], [150, 95], [190, 125], [260, 70]]) {
  const c = clasificarPresion(s, d);
  console.log(`${s}/${d} -> ${c.nombre} (nivel ${c.nivel})`);
}

console.log('\n=== clasificarFrecuencia ===');
for (const f of [50, 72, 105]) {
  const c = clasificarFrecuencia(f);
  console.log(`${f} lpm -> ${c.nombre} (nivel ${c.nivel})`);
}

console.log('\n=== determinarAvisoClasificacion ===');
console.log('Normal, sin sospecha:       ' + determinarAvisoClasificacion(clasificarPresion(118, 76), false));
console.log('Crisis, sin sospecha:       ' + determinarAvisoClasificacion(clasificarPresion(190, 125), false));
console.log('Crisis, con sospecha (260): ' + determinarAvisoClasificacion(clasificarPresion(260, 70), true));

console.log('\n=== compararConUltimaRevision (ejemplo de referencia: P001) ===');
const anterior = { sistolica: 130, diastolica: 85, frecuencia: 72 };
const actual = { sistolica: 118, diastolica: 76, frecuencia: 75 };
console.log(JSON.stringify(compararConUltimaRevision(actual, anterior), null, 2));

console.log('\n=== compararConUltimaRevision (primera revisión) ===');
console.log(compararConUltimaRevision(actual, null));

console.log('\n=== compararConUltimaRevision (caso mixto: presión mejora, frecuencia empeora) ===');
const anteriorMixto = { sistolica: 125, diastolica: 80, frecuencia: 78 };
const actualMixto = { sistolica: 118, diastolica: 76, frecuencia: 105 };
console.log(JSON.stringify(compararConUltimaRevision(actualMixto, anteriorMixto), null, 2));
