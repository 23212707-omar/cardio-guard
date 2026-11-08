'use strict';

/**
 * Prueba de pacientesRepoSql con la misma batería que el repositorio CSV.
 *
 * Se OMITE (sale con código 0 y un mensaje) si no hay SQL Server configurado:
 * faltan variables o no hay conexión. Nunca toca la base real cardio_guard:
 * crea su propia base cardio_guard_test (con DB_TEST_USER / DB_TEST_PASSWORD,
 * un usuario con permiso para crear bases de datos) y la elimina al terminar.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const sql = require('mssql');

const { crearPacientesRepoSql, ErrorIdDuplicado } = require('../src/storage/pacientesRepoSql');
const { crearInterpreter } = require('../src/interpreter');

const BASE_PRUEBA = 'cardio_guard_test';
const env = process.env;

function omitir(motivo) {
  console.log(`[OMITIDA] Prueba de SQL Server: ${motivo}`);
  process.exit(0);
}

let fallas = 0;
function check(nombre, condicion) {
  if (!condicion) fallas += 1;
  console.log(`[${condicion ? 'OK' : 'FALLÓ'}] ${nombre}`);
}

function sinClave(texto) {
  const clave = env.DB_TEST_PASSWORD;
  const t = String(texto);
  return clave ? t.split(clave).join('***') : t;
}

/** Mensaje, código y errores encadenados (causa / cause / originalError), sin la contraseña. */
function detalleError(err, nivel = 0) {
  if (!err) return '';
  const sangria = '  '.repeat(nivel + 1);
  const partes = [`${sangria}${err.name || 'Error'}: ${sinClave(err.message)}`];
  const codigo = [err.code, err.number].filter((x) => x !== undefined).join(' / ');
  if (codigo) partes.push(`${sangria}código: ${codigo}`);
  for (const interno of [err.causa, err.cause, err.originalError]) {
    if (interno && interno !== err) partes.push(detalleError(interno, nivel + 1));
  }
  return partes.join('\n');
}

/** Lee sql/crear_base.sql, cambia el nombre de la base por la de prueba y lo parte en lotes (GO). */
function lotesCrearBase() {
  const texto = fs.readFileSync(path.join(__dirname, '..', 'sql', 'crear_base.sql'), 'utf8');
  return texto
    .replace(/\bcardio_guard\b/g, BASE_PRUEBA)
    .split(/^\s*GO\s*$/im)
    .map((l) => l.trim())
    .filter(Boolean);
}

// USE master: crear_base.sql hace USE <base de prueba> y esa conexión del pool admin conservaría
// el contexto dentro de la base, lo que impide borrarla (error 3702).
// SINGLE_USER WITH ROLLBACK IMMEDIATE expulsa cualquier conexión rezagada antes del DROP.
const BORRAR_BASE_PRUEBA =
  `USE master; IF DB_ID(N'${BASE_PRUEBA}') IS NOT NULL BEGIN ` +
  `ALTER DATABASE ${BASE_PRUEBA} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; ` +
  `DROP DATABASE ${BASE_PRUEBA}; END`;

/** Borra la base de prueba; reintenta unas veces por si una conexión tarda en soltarse. */
async function borrarBasePrueba(admin) {
  let ultimo = null;
  for (let intento = 1; intento <= 3; intento += 1) {
    try {
      await admin.request().batch(BORRAR_BASE_PRUEBA);
      return;
    } catch (err) {
      ultimo = err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw ultimo;
}

async function main() {
  console.log('=== pacientesRepoSql ===');
  if (!env.DB_SERVER || !env.DB_TEST_USER || !env.DB_TEST_PASSWORD) {
    omitir('faltan DB_SERVER, DB_TEST_USER o DB_TEST_PASSWORD en .env (ver .env.example).');
  }

  const base = {
    server: env.DB_SERVER,
    port: Number(env.DB_PORT) || 1433,
    user: env.DB_TEST_USER,
    password: env.DB_TEST_PASSWORD,
    options: {
      encrypt: env.DB_ENCRYPT === 'true',
      trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    },
    connectionTimeout: 5000,
  };

  // Conexión administrativa a master, solo para crear/borrar la base de prueba.
  const admin = new sql.ConnectionPool({ ...base, database: 'master' });
  try {
    await admin.connect();
  } catch (err) {
    omitir(`no hay conexión a SQL Server en ${base.server}:${base.port} (${sinClave(err.message)}).`);
  }

  let repo = null;
  const pools = [admin]; // TODOS los pools del test: se cierran antes de borrar la base
  try {
    await borrarBasePrueba(admin);
    for (const lote of lotesCrearBase()) await admin.request().batch(lote);
    console.log(`Base de prueba ${BASE_PRUEBA} creada (la base real cardio_guard no se toca).`);

    repo = await crearPacientesRepoSql({
      server: base.server,
      port: base.port,
      database: BASE_PRUEBA,
      user: base.user,
      password: base.password,
      encrypt: base.options.encrypt,
      trustServerCertificate: base.options.trustServerCertificate,
    });
    pools.push(repo.pool);

    // --- existe / idsExistentes / obtener / agregar ---
    check('repositorio vacío: listar() -> []', (await repo.listar()).length === 0);
    check('repositorio vacío: obtener(P001) -> null', (await repo.obtener('P001')) === null);
    await repo.agregar({ id: 'P010', edad: 45, sexo: 'M', sangre: 'O+' });
    await repo.agregar({ id: 'P002', edad: 58, sexo: 'F', sangre: 'A+' });
    await repo.agregar({ id: 'P004', edad: 30, sexo: 'F', sangre: 'O+' });
    check('existe P010 true, P009 false', (await repo.existe('P010')) === true && (await repo.existe('P009')) === false);
    const ids = await repo.idsExistentes();
    check('idsExistentes: Set con P010, P002, P004', ids instanceof Set && [...ids].sort().join() === 'P002,P004,P010');
    const nuevo = await repo.obtener('P004');
    check('obtener: sin revisión -> ultimaRevision null y mismos campos',
      nuevo.id === 'P004' && nuevo.edad === 30 && nuevo.sexo === 'F' && nuevo.sangre === 'O+' && nuevo.ultimaRevision === null);

    // --- actualizarRevision y fecha de ida y vuelta ---
    await repo.actualizarRevision('P010', { fecha: '2026-11-08 23:30', sistolica: 130, diastolica: 85, frecuencia: 72 });
    await repo.actualizarRevision('P010', { fecha: '2026-11-08 23:45', sistolica: 118, diastolica: 76, frecuencia: 75 });
    const rev = (await repo.obtener('P010')).ultimaRevision;
    check('actualizarRevision reemplaza la revisión anterior (solo la última)',
      JSON.stringify(rev) === JSON.stringify({ fecha: '2026-11-08 23:45', sistolica: 118, diastolica: 76, frecuencia: 75 }));
    for (const f of ['2026-11-08 23:30', '2026-01-05 07:05', '2026-03-08 02:30', '2026-12-31 00:00']) {
      await repo.actualizarRevision('P002', { fecha: f, sistolica: 120, diastolica: 80, frecuencia: 70 });
      const leida = (await repo.obtener('P002')).ultimaRevision.fecha;
      check(`fecha de ida y vuelta sin desfase: ${f} -> ${leida}`, leida === f);
    }
    let error = null;
    try {
      await repo.actualizarRevision('P999', { fecha: '2026-11-08 10:00', sistolica: 1, diastolica: 1, frecuencia: 1 });
    } catch (e) {
      error = e;
    }
    check('actualizarRevision de un ID inexistente lanza error', error !== null);

    // --- listar: orden de registro (no alfabético) y copias independientes ---
    const lista = await repo.listar();
    check('listar: orden de registro (P010, P002, P004), no alfabético', lista.map((p) => p.id).join() === 'P010,P002,P004');
    lista[0].edad = 999;
    lista[0].ultimaRevision.sistolica = 1;
    const otra = await repo.listar();
    check('mutar el resultado de listar no afecta al repositorio (copias)',
      otra[0].edad === 45 && otra[0].ultimaRevision.sistolica === 118 && otra[0] !== lista[0]);
    const o1 = await repo.obtener('P010');
    const o2 = await repo.obtener('P010');
    check('obtener regresa objetos nuevos en cada llamada', o1 !== o2 && o1.ultimaRevision !== o2.ultimaRevision);

    // --- inyección SQL tratada como un ID más ---
    const filasAntes = (await repo.listar()).map((p) => p.id).join();
    const tablaViva = async () => (await repo.listar()).map((p) => p.id).join();

    // (a) ID con comillas que SÍ cabe en la columna (19 de 20 caracteres): es un ID más.
    const malo = "P1';DROP TABLE x;--";
    check(`el ID de prueba cabe en la columna (${malo.length} <= 20 caracteres)`, malo.length <= 20);
    check('existe(ID con comillas) -> false, sin error', (await repo.existe(malo)) === false);
    check('obtener(ID con comillas) -> null', (await repo.obtener(malo)) === null);
    await repo.agregar({ id: malo, edad: 20, sexo: 'M', sangre: 'B+' });
    const guardado = await repo.obtener(malo);
    check('agregar guarda el texto exacto como un ID más (no se ejecutó como SQL)',
      guardado !== null && guardado.id === malo && guardado.edad === 20);
    check('la tabla pacientes sigue y conserva las demás filas',
      (await tablaViva()) === `${filasAntes},${malo}`);

    // (b) ID de 30 caracteres con el ataque clásico: no cabe en VARCHAR(20); debe fallar
    // de forma segura (error del driver) sin ejecutar nada y sin tocar la tabla.
    const largo = "P001'; DROP TABLE pacientes;--";
    check(`el ID largo mide ${largo.length} caracteres (> 20)`, largo.length > 20);
    // existe/obtener/actualizarRevision responden como a un ID inexistente (sin enviarlo a SQL);
    // agregar (que el intérprete nunca alcanza, la validación lo rechaza antes) falla de forma segura.
    check('existe(ID largo) -> false, sin error', (await repo.existe(largo)) === false);
    check('obtener(ID largo) -> null, sin error', (await repo.obtener(largo)) === null);
    let errLargo = null;
    try {
      await repo.actualizarRevision(largo, { fecha: '2026-11-08 10:00', sistolica: 1, diastolica: 1, frecuencia: 1 });
    } catch (e) {
      errLargo = e;
    }
    check('actualizarRevision(ID largo) lanza el mismo error que un ID inexistente',
      errLargo !== null && errLargo.message === `No se puede actualizar la revisión de un paciente inexistente: ${largo}`);
    errLargo = null;
    try {
      await repo.agregar({ id: largo, edad: 20, sexo: 'M', sangre: 'B+' });
    } catch (e) {
      errLargo = e;
    }
    check(`agregar(ID de ${largo.length} caracteres) falla de forma segura (ErrorBaseDatos)`,
      errLargo !== null && errLargo.name === 'ErrorBaseDatos');
    check('tras el ID largo la tabla pacientes y sus filas siguen intactas',
      (await tablaViva()) === `${filasAntes},${malo}`);

    // --- duplicado: ErrorIdDuplicado ---
    error = null;
    try {
      await repo.agregar({ id: 'P004', edad: 31, sexo: 'F', sangre: 'O+' });
    } catch (e) {
      error = e;
    }
    check('agregar un ID existente lanza ErrorIdDuplicado', error instanceof ErrorIdDuplicado);

    // --- carrera entre dos REGISTRAR del mismo ID: un solo rechazo semántico normal ---
    const interp = crearInterpreter({ pacientesRepo: repo, ahora: () => new Date(2026, 10, 8, 12, 0) });
    const [a, b] = await Promise.all([
      interp.procesarLinea('REGISTRAR P050, 40, M, A+', 1),
      interp.procesarLinea('REGISTRAR P050, 40, M, A+', 2),
    ]);
    const estados = [a.resultado.estado, b.resultado.estado].sort().join();
    check('carrera de REGISTRAR: uno ACEPTADO y uno RECHAZADO (no error 500)', estados === 'ACEPTADO,RECHAZADO');
    const rech = a.resultado.estado === 'RECHAZADO' ? a : b;
    const msg = 'Error Semántico: identificador de paciente inválido o duplicado (P050).';
    check('el rechazo es el mismo de ID duplicado (tipo SEMANTICO, mismo texto)',
      rech.resultado.tipo === 'SEMANTICO' && rech.resultado.mensaje === msg && rech.lineasBitacora[1] === `   ${msg}`);
    check('sigue habiendo un solo P050', (await repo.listar()).filter((p) => p.id === 'P050').length === 1);
  } catch (err) {
    // Una verificación (o un paso) lanzó una excepción: mostrar el error técnico original.
    fallas += 1;
    console.error('[FALLÓ] La prueba se interrumpió con un error técnico:');
    console.error(detalleError(err));
  } finally {
    // 1) cerrar todos los pools menos el administrativo, 2) borrar la base con el admin, 3) cerrar el admin.
    for (const pool of pools.filter((p) => p !== admin)) await pool.close().catch(() => {});
    try {
      await borrarBasePrueba(admin);
      console.log(`Base de prueba ${BASE_PRUEBA} eliminada.`);
    } catch (err) {
      fallas += 1;
      console.error(`No se pudo eliminar ${BASE_PRUEBA} (revísala y bórrala a mano):`);
      console.error(detalleError(err));
    }
    await admin.close().catch(() => {});
  }

  console.log(fallas === 0 ? '\nTodas las verificaciones pasaron.' : `\n${fallas} verificación(es) fallaron.`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Error en la prueba de SQL Server:');
  console.error(detalleError(err));
  process.exit(1);
});
