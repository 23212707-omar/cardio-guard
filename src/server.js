'use strict';

const path = require('path');
require('dotenv').config({ quiet: true });
const express = require('express');

const { seleccionarRepo, sinContrasena } = require('./storage/seleccionarRepo');
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

// Se asignan en iniciar(): el repositorio (CSV o SQL) se elige con REPOSITORIO
// en el .env y la conexión SQL es asíncrona.
let bitacora;
let fechaProcesamiento;
let interpreter;

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

app.post('/api/procesar', async (req, res) => {
  const { texto, numeroLinea } = req.body || {};

  if (typeof texto !== 'string' || texto.trim() === '') {
    return res.status(400).json({ error: 'Falta el texto de la instrucción.' });
  }
  if (!Number.isInteger(numeroLinea) || numeroLinea < 1) {
    return res.status(400).json({ error: 'numeroLinea debe ser un entero positivo.' });
  }

  let salida;
  try {
    salida = await interpreter.procesarLinea(texto, numeroLinea);
  } catch (err) {
    if (err && err.name === 'ErrorBaseDatos') {
      // Detalle técnico solo en consola (sin contraseña); al cliente, mensaje genérico.
      const causa = err.causa || {};
      console.error(`[BD] ${err.message} (${causa.code || 'sin código'}): ${sinContrasena(causa.message || '')}`);
      return res.status(503).json({ error: 'No se pudo acceder a la base de datos. Intenta de nuevo en un momento.' });
    }
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

async function iniciar() {
  const { repo: pacientesRepo, descripcion, cerrar } = await seleccionarRepo({ rutaCsv: RUTA_PACIENTES });
  bitacora = crearBitacora(RUTA_BITACORAS, new Date());
  // Fecha de arranque (hora local), solo informativa: encabezado de la bitácora
  // y /api/estado. Las revisiones usan la fecha y hora de cada instrucción.
  fechaProcesamiento = bitacora.fechaProcesamiento;
  // La fecha y hora de cada revisión se toman por instrucción (hora local),
  // no al arrancar: el interpreter recibe el reloj.
  interpreter = crearInterpreter({ pacientesRepo, ahora: () => new Date() });

  const servidor = app.listen(PUERTO, () => {
    console.log(`Cardio Guard escuchando en http://localhost:${PUERTO}`);
    console.log(descripcion);
    console.log(`Bitácora de esta ejecución: ${bitacora.nombreArchivo}`);
  });

  // Ctrl+C: dejar de aceptar peticiones y cerrar el pool de conexión.
  process.on('SIGINT', async () => {
    servidor.close();
    try {
      await cerrar();
    } catch (err) {
      console.error('No se pudo cerrar la conexión limpiamente.');
    }
    process.exit(0);
  });
}

iniciar().catch((err) => {
  console.error('No se pudo iniciar el servidor:', sinContrasena(err && err.message ? err.message : err));
  process.exit(1);
});
