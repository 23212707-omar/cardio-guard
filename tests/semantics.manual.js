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
console.log(validarLectura({ sistolica: 80, diastolica: 120, frecuencia: 75 }));  // sistólica <= diastólica
console.log(validarLectura({ sistolica: 0, diastolica: 76, frecuencia: 75 }));     // valor en cero
console.log(validarLectura({ sistolica: 120, diastolica: 80, frecuencia: 250 }));  // frecuencia fuera de rango
console.log(validarLectura({ sistolica: 260, diastolica: 70, frecuencia: 75 }));   // dato sospechoso (no se rechaza)

console.log('\n=== clasificarPresion ===');
for (const [s, d] of [[118, 76], [125, 75], [135, 85], [150, 95], [190, 125], [260, 70]]) {
  const c = clasificarPresion(s, d);
  console.log(`${s}/${d} -> ${c.nombre} (nivel ${c.nivel})`);
}

// Fronteras de la tabla NOM-030-SSA2-2017 (y la crisis encima de grado 3).
// Cada caso prueba el valor justo en el límite de una categoría.
console.log('\n=== clasificarPresion: fronteras NOM-030 ===');
const casosNOM = [
  [119, 79, 'Óptima'],
  [120, 70, 'Subóptima'],             // sistólica entra a subóptima
  [110, 80, 'Subóptima'],             // diastólica entra a subóptima
  [120, 80, 'Subóptima'],             // antes (AHA) era "Hipertensión etapa 1"
  [129, 84, 'Subóptima'],
  [130, 75, 'Limítrofe'],
  [125, 85, 'Limítrofe'],             // gana la más alta (la diastólica)
  [139, 89, 'Limítrofe'],
  [140, 80, 'Hipertensión grado 1'],  // sistólica aislada -> grado por sistólica
  [135, 90, 'Hipertensión grado 1'],
  [159, 99, 'Hipertensión grado 1'],
  [160, 90, 'Hipertensión grado 2'],
  [150, 100, 'Hipertensión grado 2'],
  [179, 109, 'Hipertensión grado 2'],
  [180, 100, 'Hipertensión grado 3'],
  [170, 110, 'Hipertensión grado 3'],
  [180, 120, 'Hipertensión grado 3'], // aún no pasa el umbral de crisis
  [181, 100, 'Crisis hipertensiva'],
  [170, 121, 'Crisis hipertensiva'],
];
let fallas = 0;
for (const [s, d, esperado] of casosNOM) {
  const obtenido = clasificarPresion(s, d).nombre;
  const ok = obtenido === esperado;
  if (!ok) fallas += 1;
  console.log(`[${ok ? 'OK' : 'FALLA'}] ${s}/${d} -> ${obtenido}${ok ? '' : ` (esperado: ${esperado})`}`);
}
console.log(fallas === 0 ? 'Todas las fronteras correctas.' : `${fallas} frontera(s) incorrecta(s).`);

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

console.log('\n=== validarConsulta ===');
const { validarConsulta } = require('../src/semantics/validarConsulta');
const idsConsulta = new Set(['P001', 'P002']);
const rConOk = validarConsulta({ tipo: 'CON', id: 'P001' }, idsConsulta);
const rConNo = validarConsulta({ tipo: 'CON', id: 'P009' }, idsConsulta);
console.log(`[${rConOk.ok ? 'OK' : 'FALLÓ'}] P001 existe -> ok`);
console.log(`[${!rConNo.ok && rConNo.mensaje === 'Error Semántico: paciente P009 no encontrado.' ? 'OK' : 'FALLÓ'}] P009 no existe -> rechazo: ${rConNo.mensaje}`);

console.log('\n=== esDatoSospechoso / describirRevision ===');
{
  const { esDatoSospechoso, describirRevision } = require('../src/semantics/clasificacion');
  const ok = (d, c) => console.log(`[${c ? 'OK' : 'FALLÓ'}] ${d}`);
  ok('250/150 no es sospechoso', !esDatoSospechoso(250, 150));
  ok('251/100 sí', esDatoSospechoso(251, 100));
  ok('120/151 sí', esDatoSospechoso(120, 151));
  ok('describirRevision(null) = null', describirRevision(null) === null);

  const { causasDatoSospechoso, CAUSA_SOSPECHOSO: C } = require('../src/semantics/clasificacion');
  const causas = (s, d, f) => causasDatoSospechoso(s, d, f).join(',');
  ok('causas: 260/110, 75 -> PRESION_EXTREMA', causas(260, 110, 75) === C.PRESION_EXTREMA);
  ok('causas: 120/115, 75 -> PULSO_BAJO', causas(120, 115, 75) === C.PULSO_BAJO);
  ok('causas: 120/80, 210 -> FRECUENCIA_EXTREMA', causas(120, 80, 210) === C.FRECUENCIA_EXTREMA);
  ok('causas: 190/185, 210 -> las tres (diastólica 185 > 150)',
    causas(190, 185, 210) === `${C.PRESION_EXTREMA},${C.PULSO_BAJO},${C.FRECUENCIA_EXTREMA}`);
  ok('causas: 250/150, 75 -> ninguna', causas(250, 150, 75) === '');
  ok('causas: 260/255, 210 -> las tres',
    causas(260, 255, 210) === `${C.PRESION_EXTREMA},${C.PULSO_BAJO},${C.FRECUENCIA_EXTREMA}`);
  ok('sin frecuencia (2 args) no evalúa la causa c', !esDatoSospechoso(120, 80) && causas(120, 80) === '');
  ok('determinarAviso: 120/115 sin crisis -> ADVERTENCIA (alcanzable)',
    determinarAvisoClasificacion(clasificarPresion(120, 115), esDatoSospechoso(120, 115, 75)) === 'ADVERTENCIA');

  // Fronteras de validarLectura (pulso y frecuencia)
  const val = (s, d, f) => validarLectura({ sistolica: s, diastolica: d, frecuencia: f });
  const rech = (s, d, f) => !val(s, d, f).ok;
  const adv = (s, d, f) => { const r = val(s, d, f); return r.ok && r.datoSospechoso; };
  const sin = (s, d, f) => { const r = val(s, d, f); return r.ok && !r.datoSospechoso; };
  ok('120/120, 75 -> rechazo semántico con mensaje claro',
    rech(120, 120, 75) && val(120, 120, 75).mensaje === 'Error Semántico: la sistólica (120) debe ser mayor que la diastólica (120).');
  ok('120/119, 75 -> advertencia (pulso 1)', adv(120, 119, 75));
  ok('120/111, 75 -> advertencia (pulso 9)', adv(120, 111, 75));
  ok('120/110, 75 -> sin advertencia (pulso 10)', sin(120, 110, 75));
  ok('120/80, 39 -> advertencia', adv(120, 80, 39));
  ok('120/80, 40 -> sin advertencia', sin(120, 80, 40));
  ok('120/80, 200 -> sin advertencia', sin(120, 80, 200));
  ok('120/80, 201 -> advertencia', adv(120, 80, 201));
  ok('120/80, 29 -> rechazo', rech(120, 80, 29));
  ok('120/80, 30 -> advertencia', adv(120, 80, 30));
  ok('120/80, 220 -> advertencia', adv(120, 80, 220));
  ok('120/80, 221 -> rechazo', rech(120, 80, 221));
  const dp = describirRevision({ sistolica: 120, diastolica: 115, frecuencia: 75 });
  ok('describirRevision 120/115, 75 -> datoSospechoso y causasSospechoso [PULSO_BAJO]',
    dp.datoSospechoso === true && dp.causasSospechoso.join() === C.PULSO_BAJO);
  const df = describirRevision({ sistolica: 120, diastolica: 80, frecuencia: 210 });
  ok('describirRevision 120/80, 210 -> causasSospechoso [FRECUENCIA_EXTREMA]',
    df.datoSospechoso === true && df.causasSospechoso.join() === C.FRECUENCIA_EXTREMA);
  const d = describirRevision({ sistolica: 260, diastolica: 70, frecuencia: 50 });
  ok('260/70, 50 lpm -> Crisis + sospechoso + Bradicardia',
    d.crisis && d.datoSospechoso && d.frecuencia.nombre === 'Bradicardia');
}
