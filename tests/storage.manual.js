'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { crearPacientesRepo } = require('../src/storage/pacientesRepo');
const { crearBitacora } = require('../src/storage/bitacoraRepo');

const carpetaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardio-guard-test-'));

console.log('=== pacientesRepo ===');
const rutaCsv = path.join(carpetaTemp, 'pacientes.csv');

let repo = crearPacientesRepo(rutaCsv);
console.log('Al crear (sin pacientes aún): ' + fs.readFileSync(rutaCsv, 'utf8').trim());

repo.agregar({ id: 'P001', edad: 45, sexo: 'M', sangre: 'O+' });
repo.agregar({ id: 'P004', edad: 30, sexo: 'F', sangre: 'O+' }); // paciente sin revisión previa

console.log('idsExistentes: ' + [...repo.idsExistentes()].join(', '));
console.log('existe P001: ' + repo.existe('P001') + '   existe P009: ' + repo.existe('P009'));

repo.actualizarRevision('P001', { fecha: '2026-09-18', sistolica: 130, diastolica: 85, frecuencia: 72 });
repo.actualizarRevision('P001', { fecha: '2026-09-18', sistolica: 118, diastolica: 76, frecuencia: 75 });

console.log('\nContenido final de pacientes.csv:');
console.log(fs.readFileSync(rutaCsv, 'utf8'));

// Simula "reiniciar el programa": se crea un repo nuevo apuntando al mismo
// archivo, para confirmar que lo que se guardó se puede volver a leer bien.
const repoRecargado = crearPacientesRepo(rutaCsv);
console.log('Tras recargar, P001.ultimaRevision: ' + JSON.stringify(repoRecargado.obtener('P001').ultimaRevision));
console.log('Tras recargar, P004.ultimaRevision (debe ser null): ' + JSON.stringify(repoRecargado.obtener('P004').ultimaRevision));

console.log('\n=== bitacoraRepo ===');
const carpetaBitacoras = path.join(carpetaTemp, 'bitacoras');
const fechaFija = new Date('2026-09-18T14:30:00');

const bitacora = crearBitacora(carpetaBitacoras, fechaFija);
console.log('(nombre de archivo generado: ' + bitacora.nombreArchivo + ')\n');

bitacora.registrarEntrada([
  '[LÍNEA 01] REGISTRAR P001 -> ESTADO: Aceptado (Paciente registrado)',
  '   45 años, M, O+. Sin revisiones previas.',
]);
bitacora.registrarEntrada([
  '[LÍNEA 02] P001 | 118/76, 75 -> ESTADO: Aceptado (Normal)',
  '   Cambio vs. 2026-09-18: POSITIVO (130/85 -> 118/76)',
]);

const rutaFinal = bitacora.cerrarConResumen({
  total: 2,
  aceptadas: 2,
  conAlerta: 0,
  rechazadas: 0,
  erroresSintaxis: 0,
  erroresSemanticos: 0,
});

console.log('\nArchivo de bitácora guardado en: ' + rutaFinal);
console.log('¿Coincide el contenido leído del archivo con lo impreso arriba? ' +
  (fs.readFileSync(rutaFinal, 'utf8').includes('Bitácora guardada en: ' + bitacora.nombreArchivo) ? 'Sí' : 'No'));

// Segunda bitácora con la misma fecha/hora exacta: no debe sobrescribir la anterior.
const bitacora2 = crearBitacora(carpetaBitacoras, fechaFija);
console.log('\nSegunda bitácora con la misma fecha/hora -> nombre: ' + bitacora2.nombreArchivo + ' (debe llevar sufijo _2)');
