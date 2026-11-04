'use strict';

const { analizarLexico, ErrorLexico } = require('./lexer/lexer');
const { analizarSintactico, ErrorSintactico } = require('./parser/parser');
const { crearAFD, EVENTO } = require('./automaton/afd');
const { validarRegistro } = require('./semantics/validarRegistro');
const { validarLectura } = require('./semantics/validarLectura');
const {
  clasificarPresion,
  determinarAvisoClasificacion,
  compararConUltimaRevision,
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
const RECOMENDACIONES_PRESION = {
  Normal: 'Mantener hábitos actuales y control periódico.',
  Elevada: 'Vigilar la presión con mayor frecuencia y moderar el consumo de sodio.',
  'Hipertensión etapa 1': 'Control periódico, reducir sodio y aumentar la actividad física.',
  'Hipertensión etapa 2': 'Se recomienda valoración médica a la brevedad.',
  // "Crisis hipertensiva" no lleva recomendación genérica: ya se muestra
  // la alerta de protocolo de emergencia, que es lo relevante en ese caso.
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
 *          fechaProcesamiento: string}} dependencias
 *   fechaProcesamiento (YYYY-MM-DD): la fecha que se asigna a toda revisión
 *   aceptada en esta ejecución. Se recibe como parámetro, en vez de leer
 *   `new Date()` internamente, para que todo el lote use la misma fecha y
 *   para que este módulo se pueda probar con una fecha fija y predecible.
 */
function crearInterpreter({ pacientesRepo, fechaProcesamiento }) {
  /**
   * Procesa una instrucción y regresa tanto el resultado "programático"
   * (para la interfaz web / server.js) como las líneas ya formateadas
   * para la bitácora.
   * @returns {{resultado: object, lineasBitacora: string[]}}
   */
  function procesarLinea(textoOriginal, numeroLinea) {
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
        `Error Léxico en la línea ${numeroLinea}: ${err.message}`
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
        `Error de Sintaxis en la línea ${numeroLinea}: ${err.message}`
      );
    }

    afd.transitar(arbol.tipo === 'REG' ? EVENTO.LEXICO_SINTACTICO_OK_REG : EVENTO.LEXICO_SINTACTICO_OK_LEC);

    return arbol.tipo === 'REG'
      ? procesarRegistro(afd, arbol, numeroLinea)
      : procesarLectura(afd, arbol, numeroLinea);
  }

  // --- Instrucción REGISTRAR ---
  function procesarRegistro(afd, arbol, numeroLinea) {
    const encabezado = `REGISTRAR ${arbol.id}`;
    const validacion = validarRegistro(arbol, pacientesRepo.idsExistentes());

    if (!validacion.ok) {
      afd.transitar(EVENTO.SEMANTICA_REGISTRO_ERROR);
      return construirResultado({
        afd, numeroLinea, encabezado, instruccion: 'REGISTRO',
        detalles: [validacion.mensaje],
        tipo: 'SEMANTICO', mensaje: validacion.mensaje,
      });
    }

    afd.transitar(EVENTO.SEMANTICA_REGISTRO_OK);
    pacientesRepo.agregar({ id: arbol.id, edad: arbol.edad, sexo: arbol.sexo, sangre: arbol.sangre });

    return construirResultado({
      afd, numeroLinea, encabezado, instruccion: 'REGISTRO',
      detalles: [`${arbol.edad} años, ${arbol.sexo}, ${arbol.sangre}. Sin revisiones previas.`],
      extra: { id: arbol.id, edad: arbol.edad, sexo: arbol.sexo, sangre: arbol.sangre },
    });
  }

  // --- Instrucción de lectura ---
  function procesarLectura(afd, arbol, numeroLinea) {
    // Una vez que el parser construyó el árbol, usamos la forma abreviada
    // "id | sistólica/diastólica, frecuencia" en vez del texto crudo, tanto
    // si termina aceptada como si se rechaza más adelante (paciente no
    // encontrado o error semántico), porque la instrucción sí era
    // sintácticamente válida.
    const encabezado = `${arbol.id} | ${arbol.sistolica}/${arbol.diastolica}, ${arbol.frecuencia}`;

    const paciente = pacientesRepo.obtener(arbol.id);
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
    const aviso = determinarAvisoClasificacion(categoriaPresion, validacion.datoSospechoso);
    afd.transitar(EVENTO[`CLASIFICACION_${aviso}`]);

    const comparacion = compararConUltimaRevision(
      { sistolica: arbol.sistolica, diastolica: arbol.diastolica, frecuencia: arbol.frecuencia },
      ultimaRevisionAnterior
    );

    // Solo se actualiza el archivo hasta aquí: todo lo anterior a este
    // punto pudo haber terminado en rechazo, y un rechazo no debe tocar
    // pacientes.csv (sección 6.2 del documento de contexto).
    pacientesRepo.actualizarRevision(arbol.id, {
      fecha: fechaProcesamiento,
      sistolica: arbol.sistolica,
      diastolica: arbol.diastolica,
      frecuencia: arbol.frecuencia,
    });

    const detalles = [];

    if (aviso === 'ALERTA' || aviso === 'ALERTA_Y_ADVERTENCIA') {
      detalles.push(`¡ALERTA ROJA! Crisis Hipertensiva detectada (${arbol.sistolica}/${arbol.diastolica} mmHg).`);
      detalles.push('Disparar protocolo de emergencia médica inmediata.');
    }
    if (aviso === 'ADVERTENCIA' || aviso === 'ALERTA_Y_ADVERTENCIA') {
      detalles.push(
        `Dato sospechoso: valor fuera de rango fisiológico habitual, verificar captura (${arbol.sistolica}/${arbol.diastolica} mmHg).`
      );
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

    const recomendacion = RECOMENDACIONES_PRESION[categoriaPresion.nombre];
    if (recomendacion) {
      detalles.push(`Recomendación: ${recomendacion}`);
    }

    return construirResultado({
      afd, numeroLinea, encabezado, instruccion: 'LECTURA',
      detalles,
      extra: { id: arbol.id, clasificacionPresion: categoriaPresion, comparacion },
    });
  }

  // --- Helpers compartidos ---

  /** Rechazo por error léxico o sintáctico (todavía no hay árbol ni se sabe REG/LEC). */
  function rechazarPorEntrada(afd, numeroLinea, textoOriginal, tipo, mensaje) {
    return {
      resultado: {
        estado: 'RECHAZADO',
        tipo,
        linea: numeroLinea,
        mensaje,
        recorridoAFD: afd.historial,
      },
      lineasBitacora: [
        `[LÍNEA ${numeroDeLinea(numeroLinea)}] ${textoOriginal} -> ESTADO: ${TEXTO_ESTADO.RECHAZADO}`,
        `   ${mensaje}`,
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
