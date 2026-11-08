'use strict';

(async () => {

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

for (const [indice, linea] of lote.entries()) {
  const { resultado, lineasBitacora } = await interpreter.procesarLinea(linea, indice + 1);
  bitacora.registrarEntrada(lineasBitacora);

  if (resultado.estado === 'RECHAZADO') {
    rechazadas += 1;
    if (resultado.tipo === 'LEXICO' || resultado.tipo === 'SINTACTICO') erroresSintaxis += 1;
    else erroresSemanticos += 1;
  } else {
    aceptadas += 1;
    if (resultado.estado.includes('ALERTA')) conAlerta += 1;
  }
}

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

check('Ejemplo de referencia (sección 9): 9 líneas, 5 aceptadas, 1 con alerta, 4 rechazadas (1 de sintaxis, 3 semánticas)',
  lote.length === 9 && aceptadas === 5 && conAlerta === 1 && rechazadas === 4 &&
  erroresSintaxis === 1 && erroresSemanticos === 3);

// --- Marcador "^" en errores léxicos y sintácticos ---
console.log('\n=== Marcador "^" en errores léxicos y sintácticos ===');
const csvAntes = fs.readFileSync(rutaCsv, 'utf8');
const rechazo = async (texto) => await interpreter.procesarLinea(texto, 3);
const columnaCaret = (lineas) => lineas[lineas.length - 1].indexOf('^') - 3; // 3 = sangría de la bitácora

const guion = await rechazo('P002; 120/-80, 75');
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

const lexico = await rechazo('P001; 12@/80, 70');
console.log(lexico.lineasBitacora.join('\n'));
check('Error léxico: el ^ queda bajo el "@" (columna 8)', columnaCaret(lexico.lineasBitacora) === 8);
check('Error léxico: encabezado y motivo',
  lexico.lineasBitacora[1] === '   Error Léxico en la línea 3: Símbolo no reconocido' &&
  lexico.lineasBitacora[3].endsWith('^ símbolo no reconocido "@"'));

const faltaFinal = await rechazo('P001; 120/80,');
check('Falta la frecuencia: el ^ queda justo después del último carácter',
  columnaCaret(faltaFinal.lineasBitacora) === 'P001; 120/80,'.length);
const faltaReg = await rechazo('REGISTRAR P001, 45, M');
check('REGISTRAR incompleto: el ^ queda al final de la línea',
  columnaCaret(faltaReg.lineasBitacora) === 'REGISTRAR P001, 45, M'.length);

const sobra = await rechazo('P001; 120/80, 70 90');
check('Texto sobrante: el ^ queda bajo el "90" (columna 17)', columnaCaret(sobra.lineasBitacora) === 17);

const conTab = await rechazo('P001;\t120/-80, 75');
check('Con tabulador: el relleno conserva el tab para que el ^ alinee',
  conTab.resultado.diagnostico.marcador.startsWith('     \t    ^ '));

check('Los rechazos léxicos/sintácticos no modifican pacientes.csv',
  fs.readFileSync(rutaCsv, 'utf8') === csvAntes);

// --- CONSULTAR y LISTAR (solo lectura) ---
console.log('\n=== CONSULTAR y LISTAR ===');
const csvAntesConsultas = fs.readFileSync(rutaCsv, 'utf8');

const conOk = await interpreter.procesarLinea('CONSULTAR P001', 10);
console.log(conOk.lineasBitacora.join('\n'));
check('CONSULTAR P001: aceptado, instruccion CONSULTA, recorrido AFD',
  conOk.resultado.estado === 'ACEPTADO' && conOk.resultado.instruccion === 'CONSULTA' &&
  conOk.resultado.recorridoAFD.join() === 'INICIO,BUSCANDO_PACIENTE_CONSULTA,ACEPTADO');
check('CONSULTAR P001: muestra la última revisión 118/76 (la segunda lectura)',
  conOk.lineasBitacora.some((l) => l.includes('118/76 mmHg, 75 lpm (2026-09-18 09:05) — Óptima, FC Normal')));

check('CONSULTAR con CSV: no trae el campo historial y el texto no cambió (solo 3 líneas)',
  !('historial' in conOk.resultado.paciente) && conOk.lineasBitacora.length === 3 &&
  conOk.lineasBitacora[1] === '   45 años, M, O+.' &&
  conOk.lineasBitacora[2] === '   Última revisión: 118/76 mmHg, 75 lpm (2026-09-18 09:05) — Óptima, FC Normal.' &&
  pacientesRepo.soportaHistorial === undefined);

const conNo = await interpreter.procesarLinea('CONSULTAR P009', 11);
console.log(conNo.lineasBitacora.join('\n'));
check('CONSULTAR P009: rechazo semántico, sin ^',
  conNo.resultado.estado === 'RECHAZADO' && conNo.resultado.tipo === 'SEMANTICO' &&
  !conNo.resultado.diagnostico && conNo.resultado.mensaje === 'Error Semántico: paciente P009 no encontrado.');

const lis = await interpreter.procesarLinea('LISTAR', 12);
console.log(lis.lineasBitacora.join('\n'));
check('LISTAR: aceptado, 2 pacientes, instruccion LISTADO',
  lis.resultado.estado === 'ACEPTADO' && lis.resultado.instruccion === 'LISTADO' && lis.resultado.total === 2 &&
  lis.resultado.recorridoAFD.join() === 'INICIO,LISTANDO,ACEPTADO');

const lisArg = await interpreter.procesarLinea('LISTAR P001', 13);
console.log(lisArg.lineasBitacora.join('\n'));
check('LISTAR P001: error de sintaxis con ^ bajo "P001" (columna 7)',
  lisArg.resultado.tipo === 'SINTACTICO' && columnaCaret(lisArg.lineasBitacora) === 7);

const conVacio = await interpreter.procesarLinea('CONSULTAR', 14);
console.log(conVacio.lineasBitacora.join('\n'));
check('CONSULTAR sin ID: error de sintaxis con ^ al final de la línea',
  conVacio.resultado.tipo === 'SINTACTICO' && columnaCaret(conVacio.lineasBitacora) === 'CONSULTAR'.length);

check('CONSULTAR y LISTAR no modifican pacientes.csv', fs.readFileSync(rutaCsv, 'utf8') === csvAntesConsultas);

// LISTAR con repositorio vacío: aceptado con mensaje
const repoVacio = crearPacientesRepo(path.join(carpetaTemp, 'vacio.csv'));
const lisVacio = await crearInterpreter({ pacientesRepo: repoVacio, ahora }).procesarLinea('LISTAR', 1);
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

  const l1 = await interp.procesarLinea('P001; 118/76, 75', 1);
  check('Fila vieja (solo fecha): la lectura nueva funciona y "Cambio vs." muestra solo la fecha',
    l1.lineasBitacora.some((l) => l.includes('Cambio vs. 2026-09-18: POSITIVO')));
  check('La revisión nueva guarda fecha y hora de la instrucción (2026-11-04 18:30)',
    fs.readFileSync(rutaMixta, 'utf8').includes('P001,45,M,O+,2026-11-04 18:30,118,76,75'));

  reloj = new Date(2026, 10, 4, 23, 59);
  await interp.procesarLinea('P002; 190/125, 110', 2);
  check('Cada instrucción toma su propia hora (P002 a las 23:59, no la de P001)',
    fs.readFileSync(rutaMixta, 'utf8').includes('P002,58,F,A+,2026-11-04 23:59,190,125,110'));
  check('Las filas viejas no tocadas se conservan tal cual',
    fs.readFileSync(rutaMixta, 'utf8').includes('P003,30,F,B+,2026-09-18,260,70,80'));

  const c1 = await interp.procesarLinea('CONSULTAR P001', 3);
  check('CONSULTAR muestra categoría de presión y de frecuencia',
    c1.lineasBitacora.some((l) => l.includes('118/76 mmHg, 75 lpm (2026-11-04 18:30) — Óptima, FC Normal')) &&
    c1.resultado.paciente.clasificacion.presion.nombre === 'Óptima');
  const c2 = await interp.procesarLinea('CONSULTAR P002', 4);
  check('CONSULTAR con crisis: [CRISIS HIPERTENSIVA]',
    c2.lineasBitacora.some((l) => l.includes('Crisis hipertensiva, FC Taquicardia [CRISIS HIPERTENSIVA]')) &&
    c2.resultado.paciente.clasificacion.crisis === true);
  const c3 = await interp.procesarLinea('CONSULTAR P003', 5);
  check('CONSULTAR con dato sospechoso (fila vieja): crisis y [DATO SOSPECHOSO] juntos',
    c3.lineasBitacora.some((l) => l.includes('[CRISIS HIPERTENSIVA] [DATO SOSPECHOSO]')) &&
    c3.resultado.paciente.clasificacion.datoSospechoso === true);

  const lista = await interp.procesarLinea('LISTAR', 6);
  console.log(lista.lineasBitacora.join('\n'));
  check('LISTAR muestra categorías por fila y "sin revisiones previas" cuando no hay',
    lista.lineasBitacora.some((l) => l.startsWith('   P001') && l.includes('Óptima, FC Normal')) &&
    lista.lineasBitacora.some((l) => l.includes('P003') && l.includes('[DATO SOSPECHOSO]')) &&
    lista.resultado.pacientes.every((p) => 'clasificacion' in p));
  const csvSinCambios = fs.readFileSync(rutaMixta, 'utf8');
  await interp.procesarLinea('LISTAR', 7); await interp.procesarLinea('CONSULTAR P001', 8);
  check('CONSULTAR/LISTAR no cambian el CSV', fs.readFileSync(rutaMixta, 'utf8') === csvSinCambios);
}

// --- Dato sospechoso ampliado (pulso bajo, frecuencia extrema) y rechazo sistólica <= diastólica ---
console.log('\n=== Dato sospechoso: pulso, frecuencia y fronteras ===');
{
  const rutaSosp = path.join(carpetaTemp, 'sospechoso.csv');
  fs.writeFileSync(rutaSosp,
    'id,edad,sexo,sangre,fecha_revision,sistolica,diastolica,frecuencia\n' +
    'P001,45,M,O+,2026-09-18 08:00,118,76,75\n' +
    'P002,58,F,A+,,,,\n' +
    'P003,30,F,B+,,,,\n' +
    'P004,30,F,B+,,,,\n', 'utf8');
  const interp = crearInterpreter({ pacientesRepo: crearPacientesRepo(rutaSosp), ahora });
  const run = async (t) => await interp.procesarLinea(t, 1);
  const sospLineas = (r) => r.lineasBitacora.filter((l) => l.trim().startsWith('Dato sospechoso:'));

  const r120 = await run('P001; 120/120, 75');
  check('120/120, 75 -> rechazo semántico con el mensaje nuevo',
    r120.resultado.estado === 'RECHAZADO' && r120.resultado.tipo === 'SEMANTICO' &&
    r120.resultado.mensaje === 'Error Semántico: la sistólica (120) debe ser mayor que la diastólica (120).');
  check('120/119, 75 -> ACEPTADO_CON_ADVERTENCIA (pulso 1)', (await run('P001; 120/119, 75')).resultado.estado === 'ACEPTADO_CON_ADVERTENCIA');
  check('120/111, 75 -> ACEPTADO_CON_ADVERTENCIA (pulso 9)', (await run('P001; 120/111, 75')).resultado.estado === 'ACEPTADO_CON_ADVERTENCIA');
  const r110 = await run('P001; 120/110, 75');
  check('120/110, 75 -> sin advertencia (pulso 10)',
    !r110.resultado.estado.includes('ADVERTENCIA') && sospLineas(r110).length === 0);
  check('120/80, 39 -> alerta y advertencia', (await run('P001; 120/80, 39')).resultado.estado === 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA');
  check('120/80, 40 -> sin advertencia', !(await run('P001; 120/80, 40')).resultado.estado.includes('ADVERTENCIA'));
  check('120/80, 200 -> sin advertencia (solo alerta)', !(await run('P001; 120/80, 200')).resultado.estado.includes('ADVERTENCIA'));
  check('120/80, 201 -> alerta y advertencia', (await run('P001; 120/80, 201')).resultado.estado === 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA');
  check('120/80, 29 -> rechazo', (await run('P001; 120/80, 29')).resultado.estado === 'RECHAZADO');
  check('120/80, 30 -> alerta y advertencia', (await run('P001; 120/80, 30')).resultado.estado === 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA');
  check('120/80, 220 -> alerta y advertencia', (await run('P001; 120/80, 220')).resultado.estado === 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA');
  check('120/80, 221 -> rechazo', (await run('P001; 120/80, 221')).resultado.estado === 'RECHAZADO');

  const rPulso = await run('P002; 120/115, 75');
  console.log(rPulso.lineasBitacora.join('\n'));
  check('120/115, 75 -> ACEPTADO_CON_ADVERTENCIA con línea de pulso (diferencia de 5 mmHg)',
    rPulso.resultado.estado === 'ACEPTADO_CON_ADVERTENCIA' &&
    sospLineas(rPulso).length === 1 &&
    sospLineas(rPulso)[0].trim() === 'Dato sospechoso: presión de pulso muy baja (diferencia de 5 mmHg), verificar captura.');

  const rTres = await run('P003; 190/185, 210');
  console.log(rTres.lineasBitacora.join('\n'));
  const lt = sospLineas(rTres).map((l) => l.trim());
  check('190/185, 210 -> ACEPTADO_CON_ALERTA_Y_ADVERTENCIA',
    rTres.resultado.estado === 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA');
  check('190/185, 210 -> bitácora con las tres causas, una línea por causa',
    lt.length === 3 &&
    lt.includes('Dato sospechoso: presión de pulso muy baja (diferencia de 5 mmHg), verificar captura.') &&
    lt.includes('Dato sospechoso: frecuencia cardíaca extrema (210 lpm), verificar captura.'));
  check('190/185, 210 -> incluye la línea de presión extrema',
    lt.includes('Dato sospechoso: valor fuera de rango fisiológico habitual, verificar captura (190/185 mmHg).'));

  const rPres = await run('P004; 260/110, 75');
  check('260/110, 75 -> mantiene el texto de presión extrema',
    sospLineas(rPres).length === 1 &&
    sospLineas(rPres)[0].trim() === 'Dato sospechoso: valor fuera de rango fisiológico habitual, verificar captura (260/110 mmHg).');

  // CONSULTAR / LISTAR: P002 (pulso 5) y una lectura sospechosa por frecuencia
  await run('P001; 120/80, 210');
  const cp = await run('CONSULTAR P002');
  check('CONSULTAR (sospechoso por pulso): datoSospechoso true y causasSospechoso [PULSO_BAJO]',
    cp.resultado.paciente.clasificacion.datoSospechoso === true &&
    cp.resultado.paciente.clasificacion.causasSospechoso.join() === 'PULSO_BAJO' &&
    cp.lineasBitacora.some((l) => l.includes('[DATO SOSPECHOSO]')));
  const cf = await run('CONSULTAR P001');
  check('CONSULTAR (sospechoso por frecuencia): datoSospechoso true y causasSospechoso [FRECUENCIA_EXTREMA]',
    cf.resultado.paciente.clasificacion.datoSospechoso === true &&
    cf.resultado.paciente.clasificacion.causasSospechoso.join() === 'FRECUENCIA_EXTREMA');
  const ls = await run('LISTAR');
  const porId = (id) => ls.resultado.pacientes.find((p) => p.id === id).clasificacion;
  check('LISTAR: P002 (pulso) y P001 (frecuencia) con datoSospechoso y causas',
    porId('P002').datoSospechoso && porId('P002').causasSospechoso.join() === 'PULSO_BAJO' &&
    porId('P001').datoSospechoso && porId('P001').causasSospechoso.join() === 'FRECUENCIA_EXTREMA');
}

// --- ALERTA por frecuencia cardíaca severa (< 40 bradicardia, > 150 taquicardia) ---
console.log('\n=== ALERTA por frecuencia severa ===');
{
  const rutaFrec = path.join(carpetaTemp, 'frecuencia.csv');
  fs.writeFileSync(rutaFrec,
    'id,edad,sexo,sangre,fecha_revision,sistolica,diastolica,frecuencia\n' +
    'P001,45,M,O+,,,,\n' +
    'P002,58,F,A+,,,,\n' +
    'P003,30,F,B+,,,,\n' +
    'P004,30,F,B+,,,,\n', 'utf8');
  const interp = crearInterpreter({ pacientesRepo: crearPacientesRepo(rutaFrec), ahora });
  const run = async (t) => await interp.procesarLinea(t, 1);
  const estado = async (t) => (await run(t)).resultado.estado;
  const lineasCon = (r, texto) => r.lineasBitacora.filter((l) => l.includes(texto));
  const PROTOCOLO = 'Disparar protocolo de emergencia médica inmediata.';

  check('120/80, 40 -> ACEPTADO (nada)', (await estado('P001; 120/80, 40')) === 'ACEPTADO');
  check('120/80, 39 -> ACEPTADO_CON_ALERTA_Y_ADVERTENCIA', (await estado('P001; 120/80, 39')) === 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA');
  check('120/80, 30 -> ACEPTADO_CON_ALERTA_Y_ADVERTENCIA', (await estado('P001; 120/80, 30')) === 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA');
  check('120/80, 29 -> rechazo', (await estado('P001; 120/80, 29')) === 'RECHAZADO');
  check('120/80, 150 -> sin alerta', (await estado('P001; 120/80, 150')) === 'ACEPTADO');
  check('120/80, 151 -> ACEPTADO_CON_ALERTA solo', (await estado('P001; 120/80, 151')) === 'ACEPTADO_CON_ALERTA');
  check('120/80, 200 -> ACEPTADO_CON_ALERTA solo', (await estado('P001; 120/80, 200')) === 'ACEPTADO_CON_ALERTA');
  check('120/80, 201 -> ACEPTADO_CON_ALERTA_Y_ADVERTENCIA', (await estado('P001; 120/80, 201')) === 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA');
  check('120/80, 220 -> ACEPTADO_CON_ALERTA_Y_ADVERTENCIA', (await estado('P001; 120/80, 220')) === 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA');
  check('120/80, 221 -> rechazo', (await estado('P001; 120/80, 221')) === 'RECHAZADO');

  const r160 = await run('P001; 120/80, 160');
  console.log(r160.lineasBitacora.join('\n'));
  check('120/80, 160 -> ACEPTADO_CON_ALERTA con la línea de taquicardia severa',
    r160.resultado.estado === 'ACEPTADO_CON_ALERTA' &&
    r160.lineasBitacora.some((l) => l.trim() === '¡ALERTA ROJA! Taquicardia severa detectada (160 lpm).'));
  check('120/80, 160 -> sin líneas de crisis hipertensiva y alertaFrecuencia en el resultado',
    lineasCon(r160, 'Crisis').length === 0 && r160.resultado.alertaFrecuencia === 'TAQUICARDIA_SEVERA');
  check('120/80, 160 -> una línea de protocolo', lineasCon(r160, PROTOCOLO).length === 1);

  const r35 = await run('P001; 120/80, 35');
  check('120/80, 35 -> línea de bradicardia severa y alertaFrecuencia BRADICARDIA_SEVERA',
    r35.lineasBitacora.some((l) => l.trim() === '¡ALERTA ROJA! Bradicardia severa detectada (35 lpm).') &&
    r35.resultado.alertaFrecuencia === 'BRADICARDIA_SEVERA');
  check('120/80, 100 -> alertaFrecuencia null', (await run('P001; 120/80, 100')).resultado.alertaFrecuencia === null);

  const rAmbas = await run('P002; 190/125, 160');
  console.log(rAmbas.lineasBitacora.join('\n'));
  check('190/125, 160 -> ACEPTADO_CON_ALERTA',
    rAmbas.resultado.estado === 'ACEPTADO_CON_ALERTA');
  check('190/125, 160 -> las dos líneas de motivo (crisis y taquicardia)',
    rAmbas.lineasBitacora.some((l) => l.trim() === '¡ALERTA ROJA! Crisis Hipertensiva detectada (190/125 mmHg).') &&
    rAmbas.lineasBitacora.some((l) => l.trim() === '¡ALERTA ROJA! Taquicardia severa detectada (160 lpm).'));
  check('190/125, 160 -> la línea de protocolo aparece 1 vez',
    lineasCon(rAmbas, PROTOCOLO).length === 1);
  check('Solo crisis (190/125, 75): protocolo 1 vez y sin línea de frecuencia',
    lineasCon(await run('P002; 190/125, 75'), PROTOCOLO).length === 1 &&
    lineasCon(await run('P002; 190/125, 75'), 'severa').length === 0);

  // Recomendación de texto: se omite con cualquier ALERTA, se mantiene con solo advertencia.
  const tieneRec = async (t) => lineasCon(await run(t), 'Recomendación:').length > 0;
  check('120/80, 39 -> sin recomendación', !(await tieneRec('P001; 120/80, 39')));
  check('120/80, 151 -> sin recomendación', !(await tieneRec('P001; 120/80, 151')));
  check('120/80, 200 -> alerta sola, sin recomendación', !(await tieneRec('P001; 120/80, 200')));
  check('120/80, 201 -> alerta y advertencia, sin recomendación', !(await tieneRec('P001; 120/80, 201')));
  check('120/80, 150 -> con recomendación', (await tieneRec('P001; 120/80, 150')));
  check('190/125, 160 -> sin recomendación', !(await tieneRec('P002; 190/125, 160')));
  check('120/115, 75 -> solo advertencia, con recomendación', (await tieneRec('P001; 120/115, 75')));

  check('120/115, 75 -> ACEPTADO_CON_ADVERTENCIA solo (pulso bajo)',
    (await estado('P003; 120/115, 75')) === 'ACEPTADO_CON_ADVERTENCIA');

  // CONSULTAR y LISTAR de pacientes con revisión de frecuencia severa
  await run('P003; 120/80, 160');
  await run('P004; 120/80, 35');
  const cT = await run('CONSULTAR P003');
  check('CONSULTAR (taquicardia severa): alertaFrecuencia, crisis false y etiqueta',
    cT.resultado.paciente.clasificacion.alertaFrecuencia === 'TAQUICARDIA_SEVERA' &&
    cT.resultado.paciente.clasificacion.crisis === false &&
    cT.lineasBitacora.some((l) => l.includes('[TAQUICARDIA SEVERA]')));
  const cB = await run('CONSULTAR P004');
  check('CONSULTAR (bradicardia severa): alertaFrecuencia y etiqueta',
    cB.resultado.paciente.clasificacion.alertaFrecuencia === 'BRADICARDIA_SEVERA' &&
    cB.lineasBitacora.some((l) => l.includes('[BRADICARDIA SEVERA]')));
  const lF = await run('LISTAR');
  const filaF = (id) => lF.lineasBitacora.find((l) => l.trim().startsWith(id));
  const claseF = (id) => lF.resultado.pacientes.find((p) => p.id === id).clasificacion;
  check('LISTAR: P003 y P004 con alertaFrecuencia y su etiqueta',
    claseF('P003').alertaFrecuencia === 'TAQUICARDIA_SEVERA' && filaF('P003').includes('[TAQUICARDIA SEVERA]') &&
    claseF('P004').alertaFrecuencia === 'BRADICARDIA_SEVERA' && filaF('P004').includes('[BRADICARDIA SEVERA]'));
}

// --- ID de más de 20 caracteres (LONGITUD_MAXIMA_ID): rechazos claros, sin tocar el CSV ---
console.log('\n=== ID demasiado largo ===');
{
  const rutaLargo = path.join(carpetaTemp, 'largo.csv');
  fs.writeFileSync(rutaLargo,
    'id,edad,sexo,sangre,fecha_revision,sistolica,diastolica,frecuencia\nP001,45,M,O+,,,,\n', 'utf8');
  const csvAntesLargo = fs.readFileSync(rutaLargo, 'utf8');
  const interp = crearInterpreter({ pacientesRepo: crearPacientesRepo(rutaLargo), ahora });
  const id20 = 'P' + '1'.repeat(19);
  const id21 = 'P' + '1'.repeat(20);

  const regOk = await interp.procesarLinea(`REGISTRAR ${id20}, 40, F, A+`, 1);
  check('REGISTRAR con ID de 20 caracteres -> aceptado', regOk.resultado.estado === 'ACEPTADO');
  const reg = await interp.procesarLinea(`REGISTRAR ${id21}, 40, F, A+`, 2);
  const msg = `Error Semántico: identificador de paciente demasiado largo, máximo 20 caracteres (${id20}…).`;
  check('REGISTRAR con ID de 21 caracteres -> RECHAZADO SEMANTICO con el mensaje nuevo',
    reg.resultado.estado === 'RECHAZADO' && reg.resultado.tipo === 'SEMANTICO' && reg.resultado.mensaje === msg &&
    reg.lineasBitacora[1] === `   ${msg}`);
  const lec = await interp.procesarLinea(`${id21}; 120/80, 70`, 3);
  check('lectura con ID largo -> "paciente … no encontrado" de siempre',
    lec.resultado.estado === 'RECHAZADO' && lec.resultado.mensaje === `Error Semántico: paciente ${id21} no encontrado.`);
  const con = await interp.procesarLinea(`CONSULTAR ${id21}`, 4);
  check('CONSULTAR con ID largo -> "paciente … no encontrado" de siempre',
    con.resultado.estado === 'RECHAZADO' && con.resultado.mensaje === `Error Semántico: paciente ${id21} no encontrado.`);
  const csvDespues = fs.readFileSync(rutaLargo, 'utf8');
  check('los rechazos por ID largo no cambian el CSV (solo se agregó el ID de 20)',
    csvDespues === csvAntesLargo + `${id20},40,F,A+,,,,\n`);
}

// --- Historial en CONSULTAR con un repositorio falso (sin SQL Server) ---
console.log('\n=== CONSULTAR con historial (repositorio falso en memoria) ===');
{
  const pac = {
    id: 'P001', edad: 45, sexo: 'M', sangre: 'O+',
    ultimaRevision: { fecha: '2026-11-08 12:02', sistolica: 118, diastolica: 76, frecuencia: 151 },
  };
  let limitePedido = null;
  const falso = {
    soportaHistorial: true,
    idsExistentes: async () => new Set(['P001', 'P002']),
    listar: async () => [{ ...pac }, { id: 'P002', edad: 30, sexo: 'F', sangre: 'A+', ultimaRevision: null }],
    obtenerHistorial: async (id, limite) => {
      limitePedido = limite;
      return id !== 'P001' ? { total: 0, revisiones: [] } : {
        total: 12,
        revisiones: [
          { fecha: '2026-11-08 12:02', sistolica: 118, diastolica: 76, frecuencia: 151 },
          { fecha: '2026-11-08 12:01', sistolica: 130, diastolica: 85, frecuencia: 72 },
        ],
      };
    },
  };
  const interp = crearInterpreter({ pacientesRepo: falso, ahora });
  const h = await interp.procesarLinea('CONSULTAR P001', 1);
  console.log(h.lineasBitacora.join('\n'));
  const hist = h.resultado.paciente.historial;
  check('historial: límite pedido = 10, total 12, mostradas 2',
    limitePedido === 10 && hist.total === 12 && hist.mostradas === 2 && hist.revisiones.length === 2);
  check('historial: clasificación con la misma forma que paciente.clasificacion',
    JSON.stringify(Object.keys(hist.revisiones[0].clasificacion)) ===
      JSON.stringify(Object.keys(h.resultado.paciente.clasificacion)) &&
    hist.revisiones[0].clasificacion.alertaFrecuencia !== null && hist.revisiones[1].clasificacion.alertaFrecuencia === null);
  check('bitácora: líneas actuales intactas y, al final, el encabezado y una línea por revisión',
    h.lineasBitacora.length === 6 &&
    h.lineasBitacora[1] === '   45 años, M, O+.' &&
    h.lineasBitacora[3] === '   Historial de revisiones (mostrando 2 de 12):' &&
    h.lineasBitacora[4].includes('2026-11-08 12:02') && h.lineasBitacora[4].includes('[TAQUICARDIA SEVERA]') &&
    h.lineasBitacora[5].includes('2026-11-08 12:01') && !h.lineasBitacora[5].includes('['));
  const sin = await interp.procesarLinea('CONSULTAR P002', 2);
  check('paciente sin revisiones: historial vacío y sin líneas de historial',
    sin.resultado.paciente.historial.total === 0 && sin.resultado.paciente.historial.mostradas === 0 &&
    sin.lineasBitacora.length === 3);
}
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
