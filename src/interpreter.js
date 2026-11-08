'use strict';

const { analizarLexico, ErrorLexico } = require('./lexer/lexer');
const { analizarSintactico, ErrorSintactico } = require('./parser/parser');
const { crearAFD, EVENTO } = require('./automaton/afd');
const { construirMarcador } = require('./diagnostico');
const { fechaHoraLocal } = require('./storage/bitacoraRepo');
const { validarRegistro } = require('./semantics/validarRegistro');
const { validarLectura } = require('./semantics/validarLectura');
const { validarConsulta } = require('./semantics/validarConsulta');
const {
  clasificarPresion,
  determinarAvisoClasificacion,
  compararConUltimaRevision,
  describirRevision,
  alertaFrecuencia,
  ALERTA_FRECUENCIA,
  CAUSA_SOSPECHOSO,
} = require('./semantics/clasificacion');

/**
 * interpreter.js — Orquestador de Cardio Guard
 *
 * Junta lexer -> parser -> AFD -> reglas semánticas -> storage, para una
 * instrucción a la vez (sección 6 del documento de contexto). No sabe si lo
 * llamó server.js, un modo de consola, o un archivo de pruebas: solo
 * necesita un repositorio de pacientes y una fecha de procesamiento.
 *
 * Recomendaciones por categoría de presión: no se habían formalizado antes
 * de este archivo (quedaban mencionadas como idea en la documentación
 * original, sin un texto exacto). Se agregan aquí como un primer borrador
 * razonable; convendría que el equipo las revise y las ajuste a su gusto.
 */
// Las llaves deben coincidir EXACTAMENTE con los nombres de
// CATEGORIAS_PRESION en semantics/clasificacion.js (NOM-030-SSA2-2017).
// Si no coinciden, la recomendación simplemente no aparece (no truena).
const RECOMENDACIONES_PRESION = {
  'Óptima': 'Mantener hábitos actuales y control periódico.',
  'Subóptima': 'Vigilar la presión con mayor frecuencia y moderar el consumo de sodio.',
  'Limítrofe': 'Control periódico, reducir sodio y aumentar la actividad física.',
  'Hipertensión grado 1': 'Se recomienda valoración médica para confirmar el diagnóstico con varias mediciones.',
  'Hipertensión grado 2': 'Se recomienda valoración médica a la brevedad.',
  'Hipertensión grado 3': 'Se requiere valoración médica urgente.',
  // "Crisis hipertensiva" no lleva recomendación genérica: ya se muestra
  // la alerta de protocolo de emergencia, que es lo relevante en ese caso.
  // La alerta por frecuencia severa tampoco lleva recomendación de texto.
};

const TEXTO_ESTADO = {
  ACEPTADO: 'Aceptado',
  ACEPTADO_CON_ALERTA: 'Aceptado con Alerta',
  ACEPTADO_CON_ADVERTENCIA: 'Aceptado con Advertencia',
  ACEPTADO_CON_ALERTA_Y_ADVERTENCIA: 'Aceptado con Alerta y Advertencia',
  RECHAZADO: 'Rechazado',
};

function textoCambio(cambio) {
  if (cambio === 'MEJORO') return 'mejoró';
  if (cambio === 'EMPEORO') return 'empeoró';
  return 'se mantuvo igual';
}

function numeroDeLinea(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param {{pacientesRepo: import('./storage/pacientesRepo').PacientesRepo,
 *          ahora: () => Date}} dependencias
 *   ahora: reloj que regresa un Date. Se consulta UNA vez por cada lectura
 *   aceptada, y la fecha y hora (locales, "YYYY-MM-DD HH:MM") se guardan en
 *   la revisión. Se recibe como parámetro, en vez de leer `new Date()`
 *   internamente, para poder probar este módulo con un reloj fijo.
 */
function crearInterpreter({ pacientesRepo, ahora }) {
  /**
   * Procesa una instrucción y regresa tanto el resultado "programático"
   * (para la interfaz web / server.js) como las líneas ya formateadas
   * para la bitácora.
   * @returns {Promise<{resultado: object, lineasBitacora: string[]}>}
   */
  async function procesarLinea(textoOriginal, numeroLinea) {
    const afd = crearAFD();

    // --- 1 y 2. Léxico y sintáctico ---
    let tokens;
    try {
      tokens = analizarLexico(textoOriginal);
    } catch (err) {
      if (!(err instanceof ErrorLexico)) throw err;
      afd.transitar(EVENTO.LEXICO_SINTACTICO_ERROR);
      return rechazarPorEntrada(
        afd, numeroLinea, textoOriginal, 'LEXICO',
        `Error Léxico en la línea ${numeroLinea}: Símbolo no reconocido`, err
      );
    }

    let arbol;
    try {
      arbol = analizarSintactico(tokens);
    } catch (err) {
      if (!(err instanceof ErrorSintactico)) throw err;
      afd.transitar(EVENTO.LEXICO_SINTACTICO_ERROR);
      return rechazarPorEntrada(
        afd, numeroLinea, textoOriginal, 'SINTACTICO',
        `Error de Sintaxis en la línea ${numeroLinea}: Estructura de tokens inválida`, err
      );
    }

    switch (arbol.tipo) {
      case 'REG':
        afd.transitar(EVENTO.LEXICO_SINTACTICO_OK_REG);
        return await procesarRegistro(afd, arbol, numeroLinea);
      case 'CON':
        afd.transitar(EVENTO.LEXICO_SINTACTICO_OK_CON);
        return await procesarConsulta(afd, arbol, numeroLinea);
      case 'LIS':
        afd.transitar(EVENTO.LEXICO_SINTACTICO_OK_LIS);
        return await procesarListado(afd, numeroLinea);
      default:
        afd.transitar(EVENTO.LEXICO_SINTACTICO_OK_LEC);
        return await procesarLectura(afd, arbol, numeroLinea);
    }
  }

  // --- Instrucciones de solo lectura: CONSULTAR y LISTAR (no tocan pacientes.csv) ---

  /** Texto de una revisión guardada, con su categoría NOM-030, la de frecuencia y los avisos. */
  function resumenRevision(rev) {
    const desc = describirRevision(rev);
    if (!desc) return 'sin revisiones previas';
    const avisos = [];
    if (desc.crisis) avisos.push('[CRISIS HIPERTENSIVA]');
    if (desc.alertaFrecuencia === ALERTA_FRECUENCIA.TAQUICARDIA_SEVERA) avisos.push('[TAQUICARDIA SEVERA]');
    if (desc.alertaFrecuencia === ALERTA_FRECUENCIA.BRADICARDIA_SEVERA) avisos.push('[BRADICARDIA SEVERA]');
    if (desc.datoSospechoso) avisos.push('[DATO SOSPECHOSO]');
    return `${rev.sistolica}/${rev.diastolica} mmHg, ${rev.frecuencia} lpm (${rev.fecha}) — ` +
      `${desc.presion.nombre}, FC ${desc.frecuencia.nombre}` +
      (avisos.length ? ` ${avisos.join(' ')}` : '');
  }

  /** Copia del paciente con la clasificación de su última revisión (null si no tiene). */
  function conClasificacion(paciente) {
    return { ...paciente, clasificacion: describirRevision(paciente.ultimaRevision) };
  }

  async function procesarConsulta(afd, arbol, numeroLinea) {
    const encabezado = `CONSULTAR ${arbol.id}`;
    const validacion = validarConsulta(arbol, await pacientesRepo.idsExistentes());

    if (!validacion.ok) {
      afd.transitar(EVENTO.CONSULTA_PACIENTE_NO_ENCONTRADO);
      return construirResultado({
        afd, numeroLinea, encabezado, instruccion: 'CONSULTA',
        detalles: [validacion.mensaje], tipo: 'SEMANTICO', mensaje: validacion.mensaje,
      });
    }
    afd.transitar(EVENTO.CONSULTA_PACIENTE_ENCONTRADO);

    // listar() regresa copias: el resultado no comparte referencias con el repositorio.
    const paciente = (await pacientesRepo.listar()).find((p) => p.id === arbol.id);
    return construirResultado({
      afd, numeroLinea, encabezado, instruccion: 'CONSULTA',
      detalles: [
        `${paciente.edad} años, ${paciente.sexo}, ${paciente.sangre}.`,
        `Última revisión: ${resumenRevision(paciente.ultimaRevision)}.`,
      ],
      extra: { id: paciente.id, paciente: conClasificacion(paciente) },
    });
  }

  async function procesarListado(afd, numeroLinea) {
    afd.transitar(EVENTO.LISTADO_OK);
    const pacientes = await pacientesRepo.listar();
    const detalles = pacientes.length === 0
      ? ['No hay pacientes registrados.']
      : [
          `${pacientes.length} paciente(s) registrado(s):`,
          ...pacientes.map(
            (p) => `${p.id} | ${p.edad} años, ${p.sexo}, ${p.sangre} | ${resumenRevision(p.ultimaRevision)}`
          ),
        ];
    return construirResultado({
      afd, numeroLinea, encabezado: 'LISTAR', instruccion: 'LISTADO',
      detalles, extra: { total: pacientes.length, pacientes: pacientes.map(conClasificacion) },
    });
  }

  // --- Instrucción REGISTRAR ---
  async function procesarRegistro(afd, arbol, numeroLinea) {
    const encabezado = `REGISTRAR ${arbol.id}`;
    const validacion = validarRegistro(arbol, await pacientesRepo.idsExistentes());

    if (!validacion.ok) {
      afd.transitar(EVENTO.SEMANTICA_REGISTRO_ERROR);
      return construirResultado({
        afd, numeroLinea, encabezado, instruccion: 'REGISTRO',
        detalles: [validacion.mensaje],
        tipo: 'SEMANTICO', mensaje: validacion.mensaje,
      });
    }

    try {
      await pacientesRepo.agregar({ id: arbol.id, edad: arbol.edad, sexo: arbol.sexo, sangre: arbol.sangre });
    } catch (err) {
      if (err && err.name !== 'ErrorIdDuplicado') throw err;
      // Carrera entre dos REGISTRAR del mismo ID: el repositorio SQL rechazó el
      // duplicado (clave primaria). Mismo rechazo semántico que validarRegistro.
      const duplicado = validarRegistro(arbol, new Set([arbol.id]));
      afd.transitar(EVENTO.SEMANTICA_REGISTRO_ERROR);
      return construirResultado({
        afd, numeroLinea, encabezado, instruccion: 'REGISTRO',
        detalles: [duplicado.mensaje],
        tipo: 'SEMANTICO', mensaje: duplicado.mensaje,
      });
    }
    afd.transitar(EVENTO.SEMANTICA_REGISTRO_OK);

    return construirResultado({
      afd, numeroLinea, encabezado, instruccion: 'REGISTRO',
      detalles: [`${arbol.edad} años, ${arbol.sexo}, ${arbol.sangre}. Sin revisiones previas.`],
      extra: { id: arbol.id, edad: arbol.edad, sexo: arbol.sexo, sangre: arbol.sangre },
    });
  }

  // --- Instrucción de lectura ---
  async function procesarLectura(afd, arbol, numeroLinea) {
    // Una vez que el parser construyó el árbol, usamos la forma abreviada
    // "id | sistólica/diastólica, frecuencia" en vez del texto crudo, tanto
    // si termina aceptada como si se rechaza más adelante (paciente no
    // encontrado o error semántico), porque la instrucción sí era
    // sintácticamente válida.
    const encabezado = `${arbol.id} | ${arbol.sistolica}/${arbol.diastolica}, ${arbol.frecuencia}`;

    const paciente = await pacientesRepo.obtener(arbol.id);
    if (!paciente) {
      afd.transitar(EVENTO.PACIENTE_NO_ENCONTRADO);
      const mensaje = `Error Semántico: paciente ${arbol.id} no encontrado.`;
      return construirResultado({
        afd, numeroLinea, encabezado, instruccion: 'LECTURA',
        detalles: [mensaje], tipo: 'SEMANTICO', mensaje,
      });
    }
    afd.transitar(EVENTO.PACIENTE_ENCONTRADO);

    // pacientesRepo.obtener() regresa el paciente por referencia, no una
    // copia. Como actualizarRevision() va a mutar ese mismo objeto más
    // abajo, hay que guardar la revisión anterior AHORA, antes de que se
    // sobrescriba, o el mensaje de comparación terminaría comparando la
    // lectura nueva contra sí misma.
    const ultimaRevisionAnterior = paciente.ultimaRevision;

    const validacion = validarLectura(arbol);
    if (!validacion.ok) {
      afd.transitar(EVENTO.SEMANTICA_LECTURA_ERROR);
      return construirResultado({
        afd, numeroLinea, encabezado, instruccion: 'LECTURA',
        detalles: [validacion.mensaje], tipo: 'SEMANTICO', mensaje: validacion.mensaje,
      });
    }
    afd.transitar(EVENTO.SEMANTICA_LECTURA_OK);

    const categoriaPresion = clasificarPresion(arbol.sistolica, arbol.diastolica);
    const alertaFrec = alertaFrecuencia(arbol.frecuencia);
    const aviso = determinarAvisoClasificacion(categoriaPresion, validacion.datoSospechoso, alertaFrec);
    afd.transitar(EVENTO[`CLASIFICACION_${aviso}`]);

    const comparacion = compararConUltimaRevision(
      { sistolica: arbol.sistolica, diastolica: arbol.diastolica, frecuencia: arbol.frecuencia },
      ultimaRevisionAnterior
    );

    // Solo se actualiza el archivo hasta aquí: todo lo anterior a este
    // punto pudo haber terminado en rechazo, y un rechazo no debe tocar
    // pacientes.csv (sección 6.2 del documento de contexto).
    await pacientesRepo.actualizarRevision(arbol.id, {
      fecha: fechaHoraLocal(ahora()),
      sistolica: arbol.sistolica,
      diastolica: arbol.diastolica,
      frecuencia: arbol.frecuencia,
    });

    const detalles = [];

    // Bloque de ALERTA ROJA: una línea de motivo por cada causa (crisis
    // hipertensiva y/o frecuencia severa) y, al final, UNA sola línea de
    // protocolo aunque haya varios motivos.
    const hayAlerta = aviso === 'ALERTA' || aviso === 'ALERTA_Y_ADVERTENCIA';
    if (hayAlerta) {
      if (categoriaPresion.nombre === 'Crisis hipertensiva') {
        detalles.push(`¡ALERTA ROJA! Crisis Hipertensiva detectada (${arbol.sistolica}/${arbol.diastolica} mmHg).`);
      }
      if (alertaFrec === ALERTA_FRECUENCIA.TAQUICARDIA_SEVERA) {
        detalles.push(`¡ALERTA ROJA! Taquicardia severa detectada (${arbol.frecuencia} lpm).`);
      } else if (alertaFrec === ALERTA_FRECUENCIA.BRADICARDIA_SEVERA) {
        detalles.push(`¡ALERTA ROJA! Bradicardia severa detectada (${arbol.frecuencia} lpm).`);
      }
      detalles.push('Disparar protocolo de emergencia médica inmediata.');
    }
    // Una línea "Dato sospechoso:" por cada causa.
    for (const causa of validacion.causasSospechoso) {
      if (causa === CAUSA_SOSPECHOSO.PRESION_EXTREMA) {
        detalles.push(
          `Dato sospechoso: valor fuera de rango fisiológico habitual, verificar captura (${arbol.sistolica}/${arbol.diastolica} mmHg).`
        );
      } else if (causa === CAUSA_SOSPECHOSO.PULSO_BAJO) {
        detalles.push(
          `Dato sospechoso: presión de pulso muy baja (diferencia de ${arbol.sistolica - arbol.diastolica} mmHg), verificar captura.`
        );
      } else if (causa === CAUSA_SOSPECHOSO.FRECUENCIA_EXTREMA) {
        detalles.push(
          `Dato sospechoso: frecuencia cardíaca extrema (${arbol.frecuencia} lpm), verificar captura.`
        );
      }
    }

    if (comparacion.resultado === 'PRIMERA_REVISION') {
      detalles.push('Primera revisión registrada, sin datos previos para comparar.');
    } else {
      const anterior = ultimaRevisionAnterior;
      detalles.push(
        `Cambio vs. ${anterior.fecha}: ${comparacion.resultado} (${anterior.sistolica}/${anterior.diastolica} -> ${arbol.sistolica}/${arbol.diastolica})`
      );
      if (comparacion.presion.cambio !== comparacion.frecuencia.cambio) {
        detalles.push(
          `(la presión ${textoCambio(comparacion.presion.cambio)}, pero la frecuencia cardíaca ${textoCambio(comparacion.frecuencia.cambio)})`
        );
      }
    }

    // Con cualquier ALERTA (crisis o frecuencia severa) no se da recomendación
    // de texto: el protocolo de emergencia es lo único relevante.
    const recomendacion = hayAlerta ? undefined : RECOMENDACIONES_PRESION[categoriaPresion.nombre];
    if (recomendacion) {
      detalles.push(`Recomendación: ${recomendacion}`);
    }

    return construirResultado({
      afd, numeroLinea, encabezado, instruccion: 'LECTURA',
      detalles,
      extra: { id: arbol.id, clasificacionPresion: categoriaPresion, alertaFrecuencia: alertaFrec, comparacion },
    });
  }

  // --- Helpers compartidos ---

  /**
   * Rechazo por error léxico o sintáctico (todavía no hay árbol ni se sabe REG/LEC).
   * `mensaje` es el encabezado general; el motivo y la posición exacta salen
   * de `error` (detalle y posicion) y se muestran con un "^" bajo la falla.
   */
  function rechazarPorEntrada(afd, numeroLinea, textoOriginal, tipo, mensaje, error) {
    const diagnostico = construirMarcador(textoOriginal, error.posicion, error.detalle);
    return {
      resultado: {
        estado: 'RECHAZADO',
        tipo,
        linea: numeroLinea,
        mensaje,
        posicion: error.posicion,
        detalle: error.detalle,
        diagnostico,
        recorridoAFD: afd.historial,
      },
      lineasBitacora: [
        `[LÍNEA ${numeroDeLinea(numeroLinea)}] ${textoOriginal} -> ESTADO: ${TEXTO_ESTADO.RECHAZADO}`,
        `   ${mensaje}`,
        `   ${diagnostico.instruccion}`,
        `   ${diagnostico.marcador}`,
      ],
    };
  }

  /** Arma el resultado final (aceptado o rechazado) ya con el árbol construido. */
  function construirResultado({ afd, numeroLinea, encabezado, instruccion, detalles, extra = {}, tipo, mensaje }) {
    const estado = afd.estadoActual();
    const esRechazo = afd.esRechazado();

    let textoEstado = TEXTO_ESTADO[estado];
    if (!esRechazo && instruccion === 'REGISTRO') {
      textoEstado = 'Aceptado (Paciente registrado)';
    } else if (!esRechazo && instruccion === 'CONSULTA') {
      textoEstado = 'Aceptado (Consulta)';
    } else if (!esRechazo && instruccion === 'LISTADO') {
      textoEstado = 'Aceptado (Listado)';
    } else if (!esRechazo && instruccion === 'LECTURA' && estado === 'ACEPTADO') {
      textoEstado = `Aceptado (${extra.clasificacionPresion.nombre})`;
    }

    const resultado = esRechazo
      ? { estado, instruccion, tipo, linea: numeroLinea, mensaje, recorridoAFD: afd.historial }
      : { estado, instruccion, linea: numeroLinea, recorridoAFD: afd.historial, ...extra };

    const lineasBitacora = [
      `[LÍNEA ${numeroDeLinea(numeroLinea)}] ${encabezado} -> ESTADO: ${textoEstado}`,
      ...detalles.map((d) => `   ${d}`),
    ];

    return { resultado, lineasBitacora };
  }

  return { procesarLinea };
}

module.exports = { crearInterpreter };
