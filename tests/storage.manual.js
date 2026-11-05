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

// Bug corregido: la fecha de procesamiento debe ser la fecha LOCAL, no la
// UTC. A las 23:30 hora local, en cualquier zona al oeste de UTC (como
// Tijuana), la fecha UTC ya es la del día siguiente.
console.log('\n=== Fecha local vs. UTC (bug corregido) ===');
const nocheLocal = new Date(2026, 9, 30, 23, 30); // 30 oct 2026, 23:30 hora local
const bitacoraNoche = crearBitacora(carpetaBitacoras, nocheLocal);
const fechaOk = bitacoraNoche.fechaProcesamiento === '2026-10-30';
const nombreOk = bitacoraNoche.nombreArchivo.startsWith('bitacora_2026-10-30_23-30');
console.log(`[${fechaOk ? 'OK' : 'FALLA'}] fechaProcesamiento a las 23:30 local = ${bitacoraNoche.fechaProcesamiento} (esperado 2026-10-30)`);
console.log(`[${nombreOk ? 'OK' : 'FALLA'}] nombre de archivo usa el mismo día: ${bitacoraNoche.nombreArchivo}`);

// listar(): orden de registro y copias (no referencias internas)
console.log('\n=== listar() ===');
{
  const repoL = crearPacientesRepo(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-listar-')), 'p.csv'));
  console.log(`[${repoL.listar().length === 0 ? 'OK' : 'FALLÓ'}] repositorio vacío -> []`);
  repoL.agregar({ id: 'P001', edad: 45, sexo: 'M', sangre: 'O+' });
  repoL.agregar({ id: 'P002', edad: 58, sexo: 'F', sangre: 'A+' });
  const lista = repoL.listar();
  console.log(`[${lista.map((p) => p.id).join() === 'P001,P002' ? 'OK' : 'FALLÓ'}] orden de registro`);
  repoL.actualizarRevision('P001', { fecha: '2026-09-18', sistolica: 118, diastolica: 76, frecuencia: 75 });
  console.log(`[${lista[0].ultimaRevision === null ? 'OK' : 'FALLÓ'}] la lista previa no cambia al actualizar el repo (son copias)`);
  lista[1].edad = 999;
  console.log(`[${repoL.obtener('P002').edad === 58 ? 'OK' : 'FALLÓ'}] mutar la lista no afecta al repositorio`);
}

console.log('\n=== fechaHoraLocal ===');
{
  const { fechaHoraLocal } = require('../src/storage/bitacoraRepo');
  const r = fechaHoraLocal(new Date(2026, 9, 30, 23, 30));
  console.log(`[${r === '2026-10-30 23:30' ? 'OK' : 'FALLÓ'}] 23:30 local -> ${r}`);
  const r2 = fechaHoraLocal(new Date(2026, 0, 5, 7, 5));
  console.log(`[${r2 === '2026-01-05 07:05' ? 'OK' : 'FALLÓ'}] relleno de ceros -> ${r2}`);
  const rutaMezcla = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-mezcla-')), 'p.csv');
  fs.writeFileSync(rutaMezcla, 'id,edad,sexo,sangre,fecha_revision,sistolica,diastolica,frecuencia\nP001,45,M,O+,2026-09-18,118,76,75\nP002,58,F,A+,2026-11-04 18:30,130,85,72\n');
  const rm = crearPacientesRepo(rutaMezcla);
  rm.agregar({ id: 'P003', edad: 30, sexo: 'F', sangre: 'B+' });
  const txt = fs.readFileSync(rutaMezcla, 'utf8');
  console.log(`[${rm.obtener('P001').ultimaRevision.fecha === '2026-09-18' && rm.obtener('P002').ultimaRevision.fecha === '2026-11-04 18:30' ? 'OK' : 'FALLÓ'}] filas con solo fecha y con fecha+hora se leen`);
  console.log(`[${txt.includes('P001,45,M,O+,2026-09-18,118') && txt.includes('P002,58,F,A+,2026-11-04 18:30,130') ? 'OK' : 'FALLÓ'}] al reescribir, ambas se conservan sin alterar`);
}
