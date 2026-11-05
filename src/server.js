'use strict';

const path = require('path');
const express = require('express');

const { crearPacientesRepo } = require('./storage/pacientesRepo');
const { crearBitacora } = require('./storage/bitacoraRepo');
const { crearInterpreter } = require('./interpreter');

/**
 * server.js — Servidor de Cardio Guard
 *
 * Expone el intérprete (interpreter.js) mediante una API HTTP, para que la
 * página en public/ pueda mandar instrucciones y mostrar el resultado al
 * instante (sección 13 del documento de contexto).
 *
 * "Una ejecución" = una vez que arranca este servidor (sección 12.2,
 * decisión tomada junto con el equipo): se crea UNA sola bitácora al
 * iniciar, y todas las instrucciones que lleguen de cualquier persona
 * mientras el servidor siga corriendo se agregan a esa misma bitácora. Si
 * el servidor se reinicia, empieza una bitácora nueva.
 *
 * El número de línea NO lo lleva el servidor: lo lleva el navegador (ver
 * public/app.js), numerando sus propios envíos como si fueran líneas de
 * un archivo. El servidor confía en el numeroLinea que le manda el
 * frontend para el encabezado "[LÍNEA X]" de la bitácora.
 */

const RUTA_DATOS = path.join(__dirname, '..', 'data');
const RUTA_PACIENTES = path.join(RUTA_DATOS, 'pacientes.csv');
const RUTA_BITACORAS = path.join(RUTA_DATOS, 'bitacoras');
const RUTA_PUBLIC = path.join(__dirname, '..', 'public');
const PUERTO = process.env.PUERTO || 3000;

const pacientesRepo = crearPacientesRepo(RUTA_PACIENTES);
const bitacora = crearBitacora(RUTA_BITACORAS, new Date());
// Fecha de arranque (hora local), solo informativa: encabezado de la bitácora
// y /api/estado. Las revisiones usan la fecha y hora de cada instrucción.
const fechaProcesamiento = bitacora.fechaProcesamiento;
// La fecha y hora de cada revisión se toman por instrucción (hora local),
// no al arrancar: el interpreter recibe el reloj.
const interpreter = crearInterpreter({ pacientesRepo, ahora: () => new Date() });

// Contadores en memoria para el resumen en vivo del frontend. Se reinician
// junto con el servidor, igual que la bitácora.
const contadores = {
  total: 0,
  aceptadas: 0,
  conAlerta: 0,
  rechazadas: 0,
  erroresSintaxis: 0,
  erroresSemanticos: 0,
};

function actualizarContadores(resultado) {
  contadores.total += 1;
  if (resultado.estado === 'RECHAZADO') {
    contadores.rechazadas += 1;
    if (resultado.tipo === 'LEXICO' || resultado.tipo === 'SINTACTICO') {
      contadores.erroresSintaxis += 1;
    } else {
      contadores.erroresSemanticos += 1;
    }
  } else {
    contadores.aceptadas += 1;
    if (resultado.estado.includes('ALERTA')) contadores.conAlerta += 1;
  }
}

const app = express();
app.use(express.json());
app.use(express.static(RUTA_PUBLIC));

app.post('/api/procesar', (req, res) => {
  const { texto, numeroLinea } = req.body || {};

  if (typeof texto !== 'string' || texto.trim() === '') {
    return res.status(400).json({ error: 'Falta el texto de la instrucción.' });
  }
  if (!Number.isInteger(numeroLinea) || numeroLinea < 1) {
    return res.status(400).json({ error: 'numeroLinea debe ser un entero positivo.' });
  }

  let salida;
  try {
    salida = interpreter.procesarLinea(texto, numeroLinea);
  } catch (err) {
    // Un error aquí es un bug del intérprete, no un dato inválido del
    // usuario (esos ya se manejan como RECHAZADO dentro de interpreter.js).
    console.error('Error inesperado al procesar la instrucción:', err);
    return res.status(500).json({ error: 'Error interno al procesar la instrucción.' });
  }

  bitacora.registrarEntrada(salida.lineasBitacora);
  actualizarContadores(salida.resultado);

  res.json({
    resultado: salida.resultado,
    lineasBitacora: salida.lineasBitacora,
    contadores,
  });
});

app.get('/api/estado', (req, res) => {
  res.json({
    fechaProcesamiento,
    archivoBitacora: bitacora.nombreArchivo,
    contadores,
  });
});

app.listen(PUERTO, () => {
  console.log(`Cardio Guard escuchando en http://localhost:${PUERTO}`);
  console.log(`Bitácora de esta ejecución: ${bitacora.nombreArchivo}`);
});
