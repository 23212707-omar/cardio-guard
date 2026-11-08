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

/** Lee sql/migrar_historial.sql apuntando a la base de prueba y lo parte en lotes (GO). */
function lotesMigrar() {
  const texto = fs.readFileSync(path.join(__dirname, '..', 'sql', 'migrar_historial.sql'), 'utf8');
  return texto
    .replace(/\bcardio_guard\b/g, BASE_PRUEBA)
    .split(/^\s*GO\s*$/im)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Historial de revisiones: tabla revisiones, transacción, obtenerHistorial, migración e intérprete. */
async function pruebasHistorial(repo, base) {
  console.log('\n=== Historial de revisiones (fase 3) ===');
  const rev = (fecha, s = 120, d = 80, f = 70) => ({ fecha, sistolica: s, diastolica: d, frecuencia: f });
  const contar = async (id) => (await repo.pool.request().input('id', sql.VarChar(20), id)
    .query('SELECT COUNT(*) AS n FROM revisiones WHERE paciente_id = @id')).recordset[0].n;
  const ddl = (texto) => repo.pool.request().batch(texto);

  // --- vacío, orden, desempate, objetos nuevos ---
  await repo.agregar({ id: 'H001', edad: 50, sexo: 'M', sangre: 'O+' });
  const vacio = await repo.obtenerHistorial('H001', 10);
  check('paciente sin revisiones: total 0 y lista vacía', vacio.total === 0 && vacio.revisiones.length === 0);
  check('ID inexistente: total 0 y lista vacía', JSON.stringify(await repo.obtenerHistorial('H999', 10)) === '{"total":0,"revisiones":[]}');
  check('ID largo: total 0 y lista vacía (sin enviarlo a SQL)',
    JSON.stringify(await repo.obtenerHistorial("P001'; DROP TABLE pacientes;--", 10)) === '{"total":0,"revisiones":[]}');
  check('el repositorio SQL declara soportaHistorial = true', repo.soportaHistorial === true);

  await repo.actualizarRevision('H001', rev('2026-11-08 10:00', 110, 70, 60));
  await repo.actualizarRevision('H001', rev('2026-11-08 10:05', 120, 80, 70));
  await repo.actualizarRevision('H001', rev('2026-11-08 10:10', 130, 85, 80));
  const h3 = await repo.obtenerHistorial('H001', 10);
  check('3 revisiones: total 3, más reciente primero',
    h3.total === 3 && h3.revisiones.map((r) => r.fecha).join() === '2026-11-08 10:10,2026-11-08 10:05,2026-11-08 10:00');
  check('cada revisión trae solo fecha, sistolica, diastolica, frecuencia',
    JSON.stringify(h3.revisiones[0]) === JSON.stringify(rev('2026-11-08 10:10', 130, 85, 80)));
  check('la última revisión de pacientes sigue siendo la más reciente',
    JSON.stringify((await repo.obtener('H001')).ultimaRevision) === JSON.stringify(rev('2026-11-08 10:10', 130, 85, 80)));
  h3.revisiones[0].sistolica = 1;
  h3.revisiones.pop();
  const h3b = await repo.obtenerHistorial('H001', 10);
  check('obtenerHistorial regresa objetos nuevos en cada llamada',
    h3b.revisiones.length === 3 && h3b.revisiones[0].sistolica === 130 && h3b !== h3);

  // --- límite ---
  await repo.agregar({ id: 'H002', edad: 40, sexo: 'F', sangre: 'A+' });
  for (let i = 0; i < 12; i += 1) {
    await repo.actualizarRevision('H002', rev(`2026-11-08 11:${String(i).padStart(2, '0')}`, 100 + i, 70, 60 + i));
  }
  const h12 = await repo.obtenerHistorial('H002', 10);
  check('12 revisiones y límite 10: total 12, 10 filas, de la 12.ª a la 3.ª',
    h12.total === 12 && h12.revisiones.length === 10 &&
    h12.revisiones[0].sistolica === 111 && h12.revisiones[9].sistolica === 102);

  // --- desempate: misma fecha y hora ---
  await repo.agregar({ id: 'H003', edad: 33, sexo: 'F', sangre: 'B+' });
  for (const s of [101, 102, 103]) await repo.actualizarRevision('H003', rev('2026-11-08 12:00', s));
  const mm = await repo.obtenerHistorial('H003', 10);
  check('lecturas del mismo minuto: la última guardada va primero (id_revision)',
    mm.revisiones.map((r) => r.sistolica).join() === '103,102,101');

  // --- ID inexistente no inserta nada ---
  const antesTotal = (await repo.pool.request().query('SELECT COUNT(*) AS n FROM revisiones')).recordset[0].n;
  let errInex = null;
  try { await repo.actualizarRevision('H999', rev('2026-11-08 12:00')); } catch (e) { errInex = e; }
  const despuesTotal = (await repo.pool.request().query('SELECT COUNT(*) AS n FROM revisiones')).recordset[0].n;
  check('actualizarRevision de ID inexistente: mismo error de siempre y no inserta nada',
    errInex && errInex.message === 'No se puede actualizar la revisión de un paciente inexistente: H999' && antesTotal === despuesTotal);

  // --- atomicidad: un CHECK temporal solo en la base de prueba hace fallar el INSERT ---
  await repo.agregar({ id: 'H004', edad: 60, sexo: 'M', sangre: 'AB+' });
  await repo.actualizarRevision('H004', rev('2026-11-08 13:00', 120, 80, 70));
  try {
    await ddl('ALTER TABLE dbo.revisiones ADD CONSTRAINT CK_prueba_atomicidad CHECK (sistolica <= 400)');
    let errTx = null;
    try { await repo.actualizarRevision('H004', rev('2026-11-08 13:05', 999, 80, 70)); } catch (e) { errTx = e; }
    check('si el INSERT falla se lanza ErrorBaseDatos', errTx && errTx.name === 'ErrorBaseDatos');
    check('atomicidad: el UPDATE de pacientes se revirtió (sigue la revisión de las 13:00)',
      JSON.stringify((await repo.obtener('H004')).ultimaRevision) === JSON.stringify(rev('2026-11-08 13:00', 120, 80, 70)));
    check('atomicidad: revisiones no ganó ninguna fila', (await contar('H004')) === 1);
  } finally {
    await ddl(`IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_prueba_atomicidad')
               ALTER TABLE dbo.revisiones DROP CONSTRAINT CK_prueba_atomicidad`);
  }
  await repo.actualizarRevision('H004', rev('2026-11-08 13:10', 999, 80, 70));
  check('restaurado el estado: ya se acepta de nuevo (CHECK quitado)', (await contar('H004')) === 2);

  // --- migración: copia una vez, no duplica, respeta pacientes con historial ---
  await repo.agregar({ id: 'H005', edad: 70, sexo: 'F', sangre: 'O-' });
  await repo.agregar({ id: 'H006', edad: 71, sexo: 'F', sangre: 'O-' }); // sin revisión: no se copia
  await repo.agregar({ id: 'H007', edad: 72, sexo: 'M', sangre: 'O-' });
  await repo.pool.request().batch(
    `UPDATE pacientes SET fecha_revision = '2026-10-01 08:30', sistolica = 150, diastolica = 95, frecuencia = 88 WHERE id = 'H005';
     UPDATE pacientes SET fecha_revision = '2026-10-02 09:00', sistolica = 140, diastolica = 90, frecuencia = 80 WHERE id = 'H007';
     INSERT INTO revisiones (paciente_id, fecha_revision, sistolica, diastolica, frecuencia)
       VALUES ('H007', '2026-10-02 09:00', 140, 90, 80);`);
  const totalAntes = (await repo.pool.request().query('SELECT COUNT(*) AS n FROM revisiones')).recordset[0].n;
  for (let corrida = 1; corrida <= 2; corrida += 1) {
    for (const lote of lotesMigrar()) await repo.pool.request().batch(lote);
  }
  const totalDespues = (await repo.pool.request().query('SELECT COUNT(*) AS n FROM revisiones')).recordset[0].n;
  check('migrar_historial.sql corrido dos veces copia solo 1 fila (H005)', totalDespues === totalAntes + 1);
  check('migración: H005 quedó con su última revisión; H006 sin historial; H007 sin duplicar',
    JSON.stringify((await repo.obtenerHistorial('H005', 10)).revisiones) === JSON.stringify([rev('2026-10-01 08:30', 150, 95, 88)]) &&
    (await contar('H006')) === 0 && (await contar('H007')) === 1);

  // --- crear_base.sql sobre una base que ya existe no falla ---
  for (const lote of lotesCrearBase()) await repo.pool.request().batch(lote.replace(/^USE\s+\w+;?/i, ''));
  check('crear_base.sql corrido otra vez sobre la base existente no falla y conserva los datos', (await contar('H002')) === 12);

  // --- intérprete contra SQL: REGISTRAR, 3 lecturas, CONSULTAR ---
  let minuto = 0;
  const ahora = () => new Date(2026, 10, 8, 14, minuto++);
  const interp = crearInterpreter({ pacientesRepo: repo, ahora });
  await interp.procesarLinea('REGISTRAR P100, 55, M, A+', 1);
  await interp.procesarLinea('P100; 120/80, 70', 2);
  await interp.procesarLinea('P100; 118/78, 151', 3);
  await interp.procesarLinea('P100; 135/88, 76', 4);
  const c = await interp.procesarLinea('CONSULTAR P100', 5);
  console.log(c.lineasBitacora.join('\n'));
  const hi = c.resultado.paciente.historial;
  check('intérprete+SQL: historial con 3 revisiones, total 3, mostradas 3',
    hi && hi.total === 3 && hi.mostradas === 3 && hi.revisiones.length === 3);
  check('intérprete+SQL: orden más reciente primero (135, 118, 120)',
    hi.revisiones.map((r) => r.sistolica).join() === '135,118,120' &&
    hi.revisiones.map((r) => r.fecha).join() === '2026-11-08 14:02,2026-11-08 14:01,2026-11-08 14:00');
  check('intérprete+SQL: clasificación completa y alertaFrecuencia en la de FC 151',
    hi.revisiones[1].clasificacion.alertaFrecuencia === 'TAQUICARDIA_SEVERA' &&
    hi.revisiones[0].clasificacion.alertaFrecuencia === null &&
    JSON.stringify(Object.keys(hi.revisiones[1].clasificacion)) === JSON.stringify(Object.keys(c.resultado.paciente.clasificacion)));
  check('intérprete+SQL: bitácora con encabezado "mostrando 3 de 3" y 3 líneas, la de 151 con su etiqueta',
    c.lineasBitacora[3] === '   Historial de revisiones (mostrando 3 de 3):' && c.lineasBitacora.length === 7 &&
    c.lineasBitacora[5].includes('151 lpm') && c.lineasBitacora[5].includes('[TAQUICARDIA SEVERA]') &&
    !c.lineasBitacora[4].includes('[') && !c.lineasBitacora[6].includes('['));
  await interp.procesarLinea('REGISTRAR P101, 20, F, A+', 6);
  const sinHist = await interp.procesarLinea('CONSULTAR P101', 6);
  check('intérprete+SQL: paciente sin revisiones -> historial vacío y sin líneas extra',
    sinHist.resultado.paciente.historial.total === 0 && sinHist.lineasBitacora.length === 3);
  const rechazada = await interp.procesarLinea('P100; 120/80, 5000', 7);
  check('una lectura rechazada no se guarda en el historial',
    rechazada.resultado.estado === 'RECHAZADO' && (await contar('P100')) === 3);

  // --- fallo de SQL al leer el historial: ErrorBaseDatos (el servidor lo vuelve 503 genérico) ---
  try {
    await ddl("EXEC sp_rename 'dbo.revisiones', 'revisiones_x'");
    let errLeer = null;
    try { await interp.procesarLinea('CONSULTAR P100', 8); } catch (e) { errLeer = e; }
    check('CONSULTAR con la tabla revisiones inaccesible lanza ErrorBaseDatos (503 en el servidor)',
      errLeer && errLeer.name === 'ErrorBaseDatos' && !/revisiones/.test(errLeer.message));
    let errGuardar = null;
    try { await interp.procesarLinea('P100; 120/80, 70', 9); } catch (e) { errGuardar = e; }
    check('una lectura con la tabla revisiones inaccesible lanza ErrorBaseDatos',
      errGuardar && errGuardar.name === 'ErrorBaseDatos');
    check('y no deja la última revisión de pacientes a medias (transacción revertida)',
      (await repo.obtener('P100')).ultimaRevision.sistolica === 135);
  } finally {
    await ddl(`IF OBJECT_ID(N'dbo.revisiones_x', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.revisiones', N'U') IS NULL
               EXEC sp_rename 'dbo.revisiones_x', 'revisiones'`);
  }
  check('tabla revisiones restaurada', (await contar('P100')) === 3);
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

    await pruebasHistorial(repo, base);
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
