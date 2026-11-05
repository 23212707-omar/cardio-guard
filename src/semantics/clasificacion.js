'use strict';

/**
 * clasificacion.js — Clasificación clínica de Cardio Guard
 *
 * Implementa la sección 7 del documento de contexto: categorías de presión
 * arterial (NOM-030-SSA2-2017, norma oficial mexicana; antes se usaba la
 * guía AHA/ACC 2017, se cambió por decisión del equipo) y de frecuencia
 * cardíaca, el criterio de cambio
 * positivo/negativo contra la última revisión, y la decisión de si una
 * lectura debe mostrarse como ALERTA (crisis), ADVERTENCIA (dato
 * sospechoso) o ambas a la vez.
 *
 * Este módulo no conoce al AFD ni a sus EVENTO; regresa resultados en
 * texto plano (NORMAL / ALERTA / ADVERTENCIA / ALERTA_Y_ADVERTENCIA) para
 * no acoplarse a afd.js. Es interpreter.js quien traduce ese resultado al
 * evento correspondiente de la tabla de transiciones.
 */

// --- 7.1 Categorías de presión arterial (de más a menos severa) ---
//
// Tabla de la NOM-030-SSA2-2017:
//   Óptima                  < 120     y   < 80
//   Subóptima               120-129   o   80-84
//   Limítrofe               130-139   o   85-89
//   Hipertensión grado 1    140-159   o   90-99
//   Hipertensión grado 2    160-179   o   100-109
//   Hipertensión grado 3    >= 180    o   >= 110
//
// "Crisis hipertensiva" NO es una categoría de la NOM-030: se conserva
// encima de grado 3, con el mismo umbral que ya tenía el proyecto
// (sistólica > 180 o diastólica > 120), porque es la que dispara la
// ALERTA ROJA (sección 7.4) y el AFD depende de ella. Una lectura de
// exactamente 180/110 es grado 3; 181/110 o 170/121 ya es crisis.
//
// "Hipertensión sistólica aislada" (>= 140 y < 90) tampoco se agrega como
// categoría aparte: con la regla de "la categoría más alta de las dos" ya
// cae en el grado que le corresponde por su sistólica (ej. 150/80 ->
// grado 1), que es como la clasifican también las guías europeas.
const CATEGORIAS_PRESION = [
  {
    nombre: 'Crisis hipertensiva',
    nivel: 6,
    coincide: (s, d) => s > 180 || d > 120,
  },
  {
    nombre: 'Hipertensión grado 3',
    nivel: 5,
    coincide: (s, d) => s >= 180 || d >= 110,
  },
  {
    nombre: 'Hipertensión grado 2',
    nivel: 4,
    coincide: (s, d) => s >= 160 || d >= 100,
  },
  {
    nombre: 'Hipertensión grado 1',
    nivel: 3,
    coincide: (s, d) => s >= 140 || d >= 90,
  },
  {
    nombre: 'Limítrofe',
    nivel: 2,
    coincide: (s, d) => s >= 130 || d >= 85,
  },
  {
    nombre: 'Subóptima',
    nivel: 1,
    coincide: (s, d) => s >= 120 || d >= 80,
  },
  {
    nombre: 'Óptima',
    nivel: 0,
    coincide: () => true, // < 120 y < 80: todo lo que no cayó arriba
  },
];

/**
 * Clasifica una presión arterial. Se evalúa de la categoría más severa a
 * la menos severa y se toma la primera que coincida, lo que automáticamente
 * aplica la regla "si sistólica y diastólica caen en categorías distintas,
 * se usa la más alta de las dos".
 */
function clasificarPresion(sistolica, diastolica) {
  const categoria = CATEGORIAS_PRESION.find((c) => c.coincide(sistolica, diastolica));
  // CATEGORIAS_PRESION cubre todo el plano (Óptima es la condición por
  // defecto), así que siempre encuentra una coincidencia.
  return { nombre: categoria.nombre, nivel: categoria.nivel };
}

// --- 7.2 Categorías de frecuencia cardíaca (pulso en reposo) ---
function clasificarFrecuencia(frecuencia) {
  if (frecuencia < 60) return { nombre: 'Bradicardia', nivel: 1 };
  if (frecuencia > 100) return { nombre: 'Taquicardia', nivel: 1 };
  return { nombre: 'Normal', nivel: 0 };
}

/**
 * 7.4 — ¿La lectura debe marcarse con ALERTA (crisis), ADVERTENCIA (dato
 * sospechoso), ambas, o ninguna?
 *
 * Nota: con los umbrales definidos (crisis: sistólica > 180 o diastólica >
 * 120; dato sospechoso: sistólica > 250 o diastólica > 150), todo dato
 * sospechoso cae también dentro del rango de crisis (250 > 180 y 150 >
 * 120), así que ALERTA_Y_ADVERTENCIA es, en la práctica, el único caso en
 * el que aparece la advertencia. Se deja la rama "solo advertencia" de
 * forma explícita de todas formas, por claridad y por si en el futuro se
 * ajustan los umbrales de alguna de las dos reglas.
 */
/**
 * 7.4 — ¿La presión está fuera del rango fisiológico habitual? (dato
 * sospechoso). Única definición del umbral: la usan validarLectura.js y la
 * descripción de revisiones guardadas.
 */
function esDatoSospechoso(sistolica, diastolica) {
  return sistolica > 250 || diastolica > 150;
}

/**
 * Clasificación de una revisión ya guardada (para CONSULTAR y LISTAR).
 * @param {{sistolica:number, diastolica:number, frecuencia:number}|null} revision
 * @returns {null | {presion: object, frecuencia: object, crisis: boolean, datoSospechoso: boolean}}
 */
function describirRevision(revision) {
  if (!revision) return null;
  const presion = clasificarPresion(revision.sistolica, revision.diastolica);
  return {
    presion,
    frecuencia: clasificarFrecuencia(revision.frecuencia),
    crisis: presion.nombre === 'Crisis hipertensiva',
    datoSospechoso: esDatoSospechoso(revision.sistolica, revision.diastolica),
  };
}

function determinarAvisoClasificacion(categoriaPresion, datoSospechoso) {
  const esCrisis = categoriaPresion.nombre === 'Crisis hipertensiva';

  if (esCrisis && datoSospechoso) return 'ALERTA_Y_ADVERTENCIA';
  if (esCrisis) return 'ALERTA';
  if (datoSospechoso) return 'ADVERTENCIA';
  return 'NORMAL';
}

/**
 * 7.3 — Compara la lectura actual contra la última revisión del paciente.
 * @param {{sistolica:number, diastolica:number, frecuencia:number}} actual
 * @param {{sistolica:number, diastolica:number, frecuencia:number}|null} anterior
 *        null si el paciente no tiene revisión previa.
 */
function compararConUltimaRevision(actual, anterior) {
  if (anterior === null) {
    return { resultado: 'PRIMERA_REVISION' };
  }

  const presionActual = clasificarPresion(actual.sistolica, actual.diastolica);
  const presionAnterior = clasificarPresion(anterior.sistolica, anterior.diastolica);
  const frecuenciaActual = clasificarFrecuencia(actual.frecuencia);
  const frecuenciaAnterior = clasificarFrecuencia(anterior.frecuencia);

  const compararNiveles = (actualNivel, anteriorNivel) => {
    if (actualNivel < anteriorNivel) return 'MEJORO';
    if (actualNivel > anteriorNivel) return 'EMPEORO';
    return 'SIN_CAMBIO';
  };

  const cambioPresion = compararNiveles(presionActual.nivel, presionAnterior.nivel);
  const cambioFrecuencia = compararNiveles(frecuenciaActual.nivel, frecuenciaAnterior.nivel);

  // Regla conservadora (sección 7.3): cualquier empeoramiento domina sobre
  // una mejora, para no dar una falsa sensación de tranquilidad.
  let resultado;
  if (cambioPresion === 'EMPEORO' || cambioFrecuencia === 'EMPEORO') {
    resultado = 'NEGATIVO';
  } else if (cambioPresion === 'MEJORO' || cambioFrecuencia === 'MEJORO') {
    resultado = 'POSITIVO';
  } else {
    resultado = 'SIN_CAMBIO';
  }

  return {
    resultado,
    presion: { actual: presionActual, anterior: presionAnterior, cambio: cambioPresion },
    frecuencia: { actual: frecuenciaActual, anterior: frecuenciaAnterior, cambio: cambioFrecuencia },
  };
}

module.exports = {
  CATEGORIAS_PRESION,
  clasificarPresion,
  clasificarFrecuencia,
  esDatoSospechoso,
  describirRevision,
  determinarAvisoClasificacion,
  compararConUltimaRevision,
};
