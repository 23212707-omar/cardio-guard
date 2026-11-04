'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { crearPacientesRepo } = require('../src/storage/pacientesRepo');
const { crearBitacora } = require('../src/storage/bitacoraRepo');
const { crearInterpreter } = require('../src/interpreter');

const carpetaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardio-guard-interpreter-'));
const rutaCsv = path.join(carpetaTemp, 'pacientes.csv');
const carpetaBitacoras = path.join(carpetaTemp, 'bitacoras');

const pacientesRepo = crearPacientesRepo(rutaCsv);
const bitacora = crearBitacora(carpetaBitacoras, new Date('2026-09-18T14:30:00'));
const interpreter = crearInterpreter({ pacientesRepo, fechaProcesamiento: '2026-09-18' });

// El mismo lote de 9 instrucciones del ejemplo de referencia (sección 9
// del documento de contexto).
const lote = [
  'REGISTRAR P001, 45, M, O+',
  'REGISTRAR P002, 58, F, A+',
  'P001; 130/85, 72',
  'P001; 118/76, 75',
  'REGISTRAR P001, 50, M, A+',
  'REGISTRAR P003, 150, M, B+',
  'P002; 190/125, 110',
  'P002; 120/-80, 75',
  'P009; 120/80, 70',
];

let aceptadas = 0;
let conAlerta = 0;
let rechazadas = 0;
let erroresSintaxis = 0;
let erroresSemanticos = 0;

lote.forEach((linea, indice) => {
  const { resultado, lineasBitacora } = interpreter.procesarLinea(linea, indice + 1);
  bitacora.registrarEntrada(lineasBitacora);

  if (resultado.estado === 'RECHAZADO') {
    rechazadas += 1;
    if (resultado.tipo === 'LEXICO' || resultado.tipo === 'SINTACTICO') erroresSintaxis += 1;
    else erroresSemanticos += 1;
  } else {
    aceptadas += 1;
    if (resultado.estado.includes('ALERTA')) conAlerta += 1;
  }
});

bitacora.cerrarConResumen({
  total: lote.length,
  aceptadas,
  conAlerta,
  rechazadas,
  erroresSintaxis,
  erroresSemanticos,
});

console.log('\n\n=== Estado final de pacientes.csv ===');
console.log(fs.readFileSync(rutaCsv, 'utf8'));

console.log('=== Verificaciones automáticas ===');
const csvFinal = fs.readFileSync(rutaCsv, 'utf8');
const check = (descripcion, condicion) => console.log(`[${condicion ? 'OK' : 'FALLÓ'}] ${descripcion}`);

check('Solo P001 y P002 quedan en el archivo (P003 y P009 no)', 
  csvFinal.includes('P001') && csvFinal.includes('P002') && !csvFinal.includes('P003') && !csvFinal.includes('P009'));
check('P001 quedó con la lectura 118/76,75 (la segunda, no la primera 130/85)',
  /P001,45,M,O\+,2026-09-18,118,76,75/.test(csvFinal));
check('P002 quedó con la lectura de alerta 190/125,110 (se guardó pese a la alerta)',
  /P002,58,F,A\+,2026-09-18,190,125,110/.test(csvFinal));
