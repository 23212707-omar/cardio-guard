'use strict';

const sql = require('mssql');
const { LONGITUD_MAXIMA_ID } = require('../semantics/validarRegistro');

/**
 * pacientesRepoSql.js — Repositorio de pacientes sobre SQL Server
 *
 * Misma interfaz que pacientesRepo.js (CSV), pero asíncrona: existe,
 * idsExistentes, obtener, agregar, actualizarRevision, listar.
 *
 * - Un solo pool de conexión (se crea al arrancar, se cierra con cerrar()).
 * - Consultas SIEMPRE parametrizadas (request.input con tipo).
 * - Fechas: se pasa y se lee TEXTO "YYYY-MM-DD HH:MM" (hora local asignada en
 *   JavaScript con fechaHoraLocal). Nunca objetos Date: así el driver no
 *   aplica conversiones de zona horaria.
 * - Cada llamada regresa objetos nuevos (copias), nunca estado compartido.
 */

const COLUMNAS =
  "id, edad, sexo, sangre, CONVERT(varchar(16), fecha_revision, 120) AS fecha_revision, " +
  'sistolica, diastolica, frecuencia';

/** Error de acceso a la base: el detalle técnico queda en `causa`, no en el mensaje. */
class ErrorBaseDatos extends Error {
  constructor(mensaje, causa) {
    super(mensaje);
    this.name = 'ErrorBaseDatos';
    this.causa = causa;
  }
}

/** El ID ya existe (clave primaria duplicada, p. ej. por una carrera entre dos REGISTRAR). */
class ErrorIdDuplicado extends Error {
  constructor(id) {
    super(`El paciente ${id} ya existe.`);
    this.name = 'ErrorIdDuplicado';
    this.id = id;
  }
}

/** Un ID más largo que la columna no puede existir: ni se envía a SQL (daría el error 8016). */
function noCabe(id) {
  return typeof id === 'string' && id.length > LONGITUD_MAXIMA_ID;
}

function filaAPaciente(fila) {
  const ultimaRevision = fila.fecha_revision
    ? {
        fecha: fila.fecha_revision,
        sistolica: fila.sistolica,
        diastolica: fila.diastolica,
        frecuencia: fila.frecuencia,
      }
    : null;
  return { id: fila.id, edad: fila.edad, sexo: fila.sexo, sangre: fila.sangre, ultimaRevision };
}

class PacientesRepoSql {
  /** @param {import('mssql').ConnectionPool} pool pool ya conectado */
  constructor(pool, { nombreBase } = {}) {
    this.pool = pool;
    this.nombreBase = nombreBase;
    this.soportaHistorial = true; // el repositorio CSV no tiene esta propiedad: sin historial
  }

  async _ejecutar(consulta, parametros = []) {
    try {
      const request = this.pool.request();
      for (const [nombre, tipo, valor] of parametros) request.input(nombre, tipo, valor);
      return await request.query(consulta);
    } catch (err) {
      if (err instanceof ErrorIdDuplicado) throw err;
      throw new ErrorBaseDatos('Falló una consulta a la base de datos.', err);
    }
  }

  async existe(id) {
    if (noCabe(id)) return false;
    const r = await this._ejecutar('SELECT 1 AS x FROM pacientes WHERE id = @id', [
      ['id', sql.VarChar(LONGITUD_MAXIMA_ID), id],
    ]);
    return r.recordset.length > 0;
  }

  /** Para validarRegistro.js: el conjunto de IDs ya registrados. */
  async idsExistentes() {
    const r = await this._ejecutar('SELECT id FROM pacientes');
    return new Set(r.recordset.map((f) => f.id));
  }

  async obtener(id) {
    if (noCabe(id)) return null;
    const r = await this._ejecutar(`SELECT ${COLUMNAS} FROM pacientes WHERE id = @id`, [
      ['id', sql.VarChar(LONGITUD_MAXIMA_ID), id],
    ]);
    return r.recordset.length ? filaAPaciente(r.recordset[0]) : null;
  }

  /** Todos los pacientes en orden de registro (columna IDENTITY `orden`). */
  async listar() {
    const r = await this._ejecutar(`SELECT ${COLUMNAS} FROM pacientes ORDER BY orden`);
    return r.recordset.map(filaAPaciente);
  }

  /** Da de alta un paciente sin revisión. Lanza ErrorIdDuplicado si el ID ya existe. */
  async agregar({ id, edad, sexo, sangre }) {
    try {
      await this.pool
        .request()
        .input('id', sql.VarChar(LONGITUD_MAXIMA_ID), id)
        .input('edad', sql.Int, edad)
        .input('sexo', sql.Char(1), sexo)
        .input('sangre', sql.VarChar(3), sangre)
        .query('INSERT INTO pacientes (id, edad, sexo, sangre) VALUES (@id, @edad, @sexo, @sangre)');
    } catch (err) {
      // 2627 = violación de PRIMARY KEY, 2601 = índice único.
      const numero = err && (err.number || (err.originalError && err.originalError.number));
      if (numero === 2627 || numero === 2601) throw new ErrorIdDuplicado(id);
      throw new ErrorBaseDatos('Falló una consulta a la base de datos.', err);
    }
  }

  /**
   * Reemplaza la última revisión del paciente (UPDATE en pacientes) y agrega la lectura al
   * historial (INSERT en revisiones), en UNA transacción: se guardan las dos o ninguna.
   */
  async actualizarRevision(id, { fecha, sistolica, diastolica, frecuencia }) {
    const inexistente = () =>
      new Error(`No se puede actualizar la revisión de un paciente inexistente: ${id}`);
    if (noCabe(id)) throw inexistente();

    const tx = new sql.Transaction(this.pool);
    let abierta = false;
    let faltaPaciente = false;
    try {
      await tx.begin();
      abierta = true;
      const conParametros = (request) =>
        request
          .input('id', sql.VarChar(LONGITUD_MAXIMA_ID), id)
          .input('fecha', sql.VarChar(16), fecha)
          .input('sistolica', sql.Int, sistolica)
          .input('diastolica', sql.Int, diastolica)
          .input('frecuencia', sql.Int, frecuencia);

      const r = await conParametros(new sql.Request(tx)).query(
        `UPDATE pacientes
            SET fecha_revision = CONVERT(datetime2(0), @fecha, 120),
                sistolica = @sistolica, diastolica = @diastolica, frecuencia = @frecuencia
          WHERE id = @id`
      );
      if (r.rowsAffected[0] === 0) {
        faltaPaciente = true;
        throw inexistente();
      }
      await conParametros(new sql.Request(tx)).query(
        `INSERT INTO revisiones (paciente_id, fecha_revision, sistolica, diastolica, frecuencia)
         VALUES (@id, CONVERT(datetime2(0), @fecha, 120), @sistolica, @diastolica, @frecuencia)`
      );
      await tx.commit();
      abierta = false;
    } catch (err) {
      if (abierta) await tx.rollback().catch(() => {});
      if (faltaPaciente) throw err;
      throw new ErrorBaseDatos('Falló una consulta a la base de datos.', err);
    }
  }

  /**
   * Las `limite` revisiones más recientes del paciente (la más reciente primero) y el total.
   * Orden por id_revision (IDENTITY) para desempatar lecturas del mismo minuto.
   * @returns {Promise<{total:number, revisiones:{fecha:string,sistolica:number,diastolica:number,frecuencia:number}[]}>}
   */
  async obtenerHistorial(id, limite) {
    if (noCabe(id)) return { total: 0, revisiones: [] };
    const r = await this._ejecutar(
      `SELECT COUNT(*) AS total FROM revisiones WHERE paciente_id = @id;
       SELECT TOP (@limite) CONVERT(varchar(16), fecha_revision, 120) AS fecha,
              sistolica, diastolica, frecuencia
         FROM revisiones WHERE paciente_id = @id ORDER BY id_revision DESC`,
      [
        ['id', sql.VarChar(LONGITUD_MAXIMA_ID), id],
        ['limite', sql.Int, limite],
      ]
    );
    const [totalSet, filas] = r.recordsets;
    return {
      total: totalSet[0].total,
      revisiones: filas.map((f) => ({
        fecha: f.fecha, sistolica: f.sistolica, diastolica: f.diastolica, frecuencia: f.frecuencia,
      })),
    };
  }

  async cerrar() {
    await this.pool.close();
  }
}

/**
 * Crea el repositorio y abre el pool (un solo pool por proceso).
 * @param {{server:string, port:number, database:string, user:string, password:string,
 *          encrypt?:boolean, trustServerCertificate?:boolean}} config
 */
async function crearPacientesRepoSql(config) {
  const pool = new sql.ConnectionPool({
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    options: {
      encrypt: config.encrypt === true,
      trustServerCertificate: config.trustServerCertificate !== false,
    },
    connectionTimeout: config.connectionTimeout || 8000,
    pool: { max: 10, min: 0 },
  });
  await pool.connect();
  return new PacientesRepoSql(pool, { nombreBase: config.database });
}

module.exports = { PacientesRepoSql, crearPacientesRepoSql, ErrorBaseDatos, ErrorIdDuplicado };
