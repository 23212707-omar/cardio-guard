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
// Reloj fijo y avanzable (el interpreter toma la hora por instrucción).
let relojActual = new Date(2026, 8, 18, 9, 5);
const ahora = () => relojActual;
const interpreter = crearInterpreter({ pacientesRepo, ahora });

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
  /P001,45,M,O\+,2026-09-18 09:05,118,76,75/.test(csvFinal));
check('P002 quedó con la lectura de alerta 190/125,110 (se guardó pese a la alerta)',
  /P002,58,F,A\+,2026-09-18 09:05,190,125,110/.test(csvFinal));

// --- Marcador "^" en errores léxicos y sintácticos ---
console.log('\n=== Marcador "^" en errores léxicos y sintácticos ===');
const csvAntes = fs.readFileSync(rutaCsv, 'utf8');
const rechazo = (texto) => interpreter.procesarLinea(texto, 3);
const columnaCaret = (lineas) => lineas[lineas.length - 1].indexOf('^') - 3; // 3 = sangría de la bitácora

const guion = rechazo('P002; 120/-80, 75');
console.log(guion.lineasBitacora.join('\n'));
check('120/-80: el ^ queda bajo el guion (columna 10)', columnaCaret(guion.lineasBitacora) === 10);
check('120/-80: el motivo va junto al ^',
  guion.lineasBitacora[3].endsWith('^ se esperaba un número positivo después de la diagonal'));
check('120/-80: la instrucción se repite sin cambios en la línea anterior',
  guion.lineasBitacora[2] === '   P002; 120/-80, 75');
check('120/-80: el encabezado ya no repite el motivo',
  guion.lineasBitacora[1] === '   Error de Sintaxis en la línea 3: Estructura de tokens inválida');
check('120/-80: el resultado trae posicion, detalle y diagnostico',
  guion.resultado.posicion === 10 && guion.resultado.tipo === 'SINTACTICO' &&
  guion.resultado.diagnostico.instruccion === 'P002; 120/-80, 75');

const lexico = rechazo('P001; 12@/80, 70');
console.log(lexico.lineasBitacora.join('\n'));
check('Error léxico: el ^ queda bajo el "@" (columna 8)', columnaCaret(lexico.lineasBitacora) === 8);
check('Error léxico: encabezado y motivo',
  lexico.lineasBitacora[1] === '   Error Léxico en la línea 3: Símbolo no reconocido' &&
  lexico.lineasBitacora[3].endsWith('^ símbolo no reconocido "@"'));

const faltaFinal = rechazo('P001; 120/80,');
check('Falta la frecuencia: el ^ queda justo después del último carácter',
  columnaCaret(faltaFinal.lineasBitacora) === 'P001; 120/80,'.length);
const faltaReg = rechazo('REGISTRAR P001, 45, M');
check('REGISTRAR incompleto: el ^ queda al final de la línea',
  columnaCaret(faltaReg.lineasBitacora) === 'REGISTRAR P001, 45, M'.length);

const sobra = rechazo('P001; 120/80, 70 90');
check('Texto sobrante: el ^ queda bajo el "90" (columna 17)', columnaCaret(sobra.lineasBitacora) === 17);

const conTab = rechazo('P001;\t120/-80, 75');
check('Con tabulador: el relleno conserva el tab para que el ^ alinee',
  conTab.resultado.diagnostico.marcador.startsWith('     \t    ^ '));

check('Los rechazos léxicos/sintácticos no modifican pacientes.csv',
  fs.readFileSync(rutaCsv, 'utf8') === csvAntes);

// --- CONSULTAR y LISTAR (solo lectura) ---
console.log('\n=== CONSULTAR y LISTAR ===');
const csvAntesConsultas = fs.readFileSync(rutaCsv, 'utf8');

const conOk = interpreter.procesarLinea('CONSULTAR P001', 10);
console.log(conOk.lineasBitacora.join('\n'));
check('CONSULTAR P001: aceptado, instruccion CONSULTA, recorrido AFD',
  conOk.resultado.estado === 'ACEPTADO' && conOk.resultado.instruccion === 'CONSULTA' &&
  conOk.resultado.recorridoAFD.join() === 'INICIO,BUSCANDO_PACIENTE_CONSULTA,ACEPTADO');
check('CONSULTAR P001: muestra la última revisión 118/76 (la segunda lectura)',
  conOk.lineasBitacora.some((l) => l.includes('118/76 mmHg, 75 lpm (2026-09-18 09:05) — Óptima, FC Normal')));

const conNo = interpreter.procesarLinea('CONSULTAR P009', 11);
console.log(conNo.lineasBitacora.join('\n'));
check('CONSULTAR P009: rechazo semántico, sin ^',
  conNo.resultado.estado === 'RECHAZADO' && conNo.resultado.tipo === 'SEMANTICO' &&
  !conNo.resultado.diagnostico && conNo.resultado.mensaje === 'Error Semántico: paciente P009 no encontrado.');

const lis = interpreter.procesarLinea('LISTAR', 12);
console.log(lis.lineasBitacora.join('\n'));
check('LISTAR: aceptado, 2 pacientes, instruccion LISTADO',
  lis.resultado.estado === 'ACEPTADO' && lis.resultado.instruccion === 'LISTADO' && lis.resultado.total === 2 &&
  lis.resultado.recorridoAFD.join() === 'INICIO,LISTANDO,ACEPTADO');

const lisArg = interpreter.procesarLinea('LISTAR P001', 13);
console.log(lisArg.lineasBitacora.join('\n'));
check('LISTAR P001: error de sintaxis con ^ bajo "P001" (columna 7)',
  lisArg.resultado.tipo === 'SINTACTICO' && columnaCaret(lisArg.lineasBitacora) === 7);

const conVacio = interpreter.procesarLinea('CONSULTAR', 14);
console.log(conVacio.lineasBitacora.join('\n'));
check('CONSULTAR sin ID: error de sintaxis con ^ al final de la línea',
  conVacio.resultado.tipo === 'SINTACTICO' && columnaCaret(conVacio.lineasBitacora) === 'CONSULTAR'.length);

check('CONSULTAR y LISTAR no modifican pacientes.csv', fs.readFileSync(rutaCsv, 'utf8') === csvAntesConsultas);

// LISTAR con repositorio vacío: aceptado con mensaje
const repoVacio = crearPacientesRepo(path.join(carpetaTemp, 'vacio.csv'));
const lisVacio = crearInterpreter({ pacientesRepo: repoVacio, ahora }).procesarLinea('LISTAR', 1);
console.log(lisVacio.lineasBitacora.join('\n'));
check('LISTAR sin pacientes: aceptado con "No hay pacientes registrados."',
  lisVacio.resultado.estado === 'ACEPTADO' && lisVacio.resultado.total === 0 &&
  lisVacio.lineasBitacora[1] === '   No hay pacientes registrados.');

// --- Fecha y hora por instrucción, compatibilidad con filas viejas y categorías ---
console.log('\n=== Fecha/hora por instrucción y categorías en CONSULTAR/LISTAR ===');
{
  const rutaMixta = path.join(carpetaTemp, 'mixto.csv');
  fs.writeFileSync(rutaMixta,
    'id,edad,sexo,sangre,fecha_revision,sistolica,diastolica,frecuencia\n' +
    'P001,45,M,O+,2026-09-18,130,85,72\n' +   // fila vieja: solo fecha
    'P002,58,F,A+,,,,\n' +                     // sin revisión
    'P003,30,F,B+,2026-09-18,260,70,80\n', 'utf8'); // dato sospechoso (260)
  let reloj = new Date(2026, 10, 4, 18, 30);
  const interp = crearInterpreter({ pacientesRepo: crearPacientesRepo(rutaMixta), ahora: () => reloj });

  const l1 = interp.procesarLinea('P001; 118/76, 75', 1);
  check('Fila vieja (solo fecha): la lectura nueva funciona y "Cambio vs." muestra solo la fecha',
    l1.lineasBitacora.some((l) => l.includes('Cambio vs. 2026-09-18: POSITIVO')));
  check('La revisión nueva guarda fecha y hora de la instrucción (2026-11-04 18:30)',
    fs.readFileSync(rutaMixta, 'utf8').includes('P001,45,M,O+,2026-11-04 18:30,118,76,75'));

  reloj = new Date(2026, 10, 4, 23, 59);
  interp.procesarLinea('P002; 190/125, 110', 2);
  check('Cada instrucción toma su propia hora (P002 a las 23:59, no la de P001)',
    fs.readFileSync(rutaMixta, 'utf8').includes('P002,58,F,A+,2026-11-04 23:59,190,125,110'));
  check('Las filas viejas no tocadas se conservan tal cual',
    fs.readFileSync(rutaMixta, 'utf8').includes('P003,30,F,B+,2026-09-18,260,70,80'));

  const c1 = interp.procesarLinea('CONSULTAR P001', 3);
  check('CONSULTAR muestra categoría de presión y de frecuencia',
    c1.lineasBitacora.some((l) => l.includes('118/76 mmHg, 75 lpm (2026-11-04 18:30) — Óptima, FC Normal')) &&
    c1.resultado.paciente.clasificacion.presion.nombre === 'Óptima');
  const c2 = interp.procesarLinea('CONSULTAR P002', 4);
  check('CONSULTAR con crisis: [CRISIS HIPERTENSIVA]',
    c2.lineasBitacora.some((l) => l.includes('Crisis hipertensiva, FC Taquicardia [CRISIS HIPERTENSIVA]')) &&
    c2.resultado.paciente.clasificacion.crisis === true);
  const c3 = interp.procesarLinea('CONSULTAR P003', 5);
  check('CONSULTAR con dato sospechoso (fila vieja): crisis y [DATO SOSPECHOSO] juntos',
    c3.lineasBitacora.some((l) => l.includes('[CRISIS HIPERTENSIVA] [DATO SOSPECHOSO]')) &&
    c3.resultado.paciente.clasificacion.datoSospechoso === true);

  const lista = interp.procesarLinea('LISTAR', 6);
  console.log(lista.lineasBitacora.join('\n'));
  check('LISTAR muestra categorías por fila y "sin revisiones previas" cuando no hay',
    lista.lineasBitacora.some((l) => l.startsWith('   P001') && l.includes('Óptima, FC Normal')) &&
    lista.lineasBitacora.some((l) => l.includes('P003') && l.includes('[DATO SOSPECHOSO]')) &&
    lista.resultado.pacientes.every((p) => 'clasificacion' in p));
  const csvSinCambios = fs.readFileSync(rutaMixta, 'utf8');
  interp.procesarLinea('LISTAR', 7); interp.procesarLinea('CONSULTAR P001', 8);
  check('CONSULTAR/LISTAR no cambian el CSV', fs.readFileSync(rutaMixta, 'utf8') === csvSinCambios);
}
