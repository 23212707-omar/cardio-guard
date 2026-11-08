'use strict';

const path = require('path');
const { crearPacientesRepo } = require('./pacientesRepo');

/**
 * seleccionarRepo.js — Elige el repositorio de pacientes según REPOSITORIO
 * (csv | sql, por defecto csv). Con sql, si la conexión falla NO se cae al
 * CSV: se muestra qué falló y qué variable revisar, y el proceso termina.
 */

function leerConfigSql(env) {
  return {
    server: env.DB_SERVER || 'localhost',
    port: Number(env.DB_PORT) || 1433,
    database: env.DB_NAME || 'cardio_guard',
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    encrypt: env.DB_ENCRYPT === 'true',
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
  };
}

/** Quita la contraseña de cualquier texto antes de mostrarlo. */
function sinContrasena(texto, env = process.env) {
  const pass = env.DB_PASSWORD;
  const t = String(texto);
  return pass ? t.split(pass).join('***') : t;
}

function terminar(mensajes) {
  for (const m of mensajes) console.error(m);
  process.exit(1);
}

/**
 * @returns {Promise<{repo: object, descripcion: string, cerrar: () => Promise<void>}>}
 */
async function seleccionarRepo({ rutaCsv, env = process.env }) {
  const modo = (env.REPOSITORIO || 'csv').trim().toLowerCase();

  if (modo === 'csv') {
    return {
      repo: crearPacientesRepo(rutaCsv),
      descripcion: 'Repositorio de pacientes: csv',
      cerrar: async () => {},
    };
  }

  if (modo !== 'sql') {
    terminar([
      `Error de configuración: REPOSITORIO="${env.REPOSITORIO}" no es válido.`,
      'Revisa la variable REPOSITORIO en el archivo .env (valores permitidos: csv o sql).',
    ]);
  }

  const config = leerConfigSql(env);
  if (!config.user || !config.password) {
    terminar([
      'Error de configuración: REPOSITORIO=sql pero faltan credenciales de la base de datos.',
      'Revisa las variables DB_USER y DB_PASSWORD en el archivo .env.',
    ]);
  }

  const { crearPacientesRepoSql } = require('./pacientesRepoSql');
  try {
    const repo = await crearPacientesRepoSql(config);
    return {
      repo,
      descripcion: `Repositorio de pacientes: sql (base ${config.database} en ${config.server}:${config.port})`,
      cerrar: () => repo.cerrar(),
    };
  } catch (err) {
    return terminar([
      `No se pudo conectar a SQL Server (${config.server}:${config.port}, base ${config.database}).`,
      `Detalle: ${sinContrasena(err && err.message ? err.message : err, env)}`,
      'Revisa en el archivo .env las variables DB_SERVER, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD,',
      'y que SQL Server esté en ejecución con TCP/IP habilitado en el puerto indicado.',
      'El servidor no usará el CSV como respaldo; cambia REPOSITORIO=csv si quieres usarlo.',
    ]);
  }
}

module.exports = { seleccionarRepo, leerConfigSql, sinContrasena };
