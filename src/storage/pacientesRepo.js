'use strict';

const fs = require('fs');
const path = require('path');

/**
 * pacientesRepo.js — Repositorio de pacientes de Cardio Guard
 *
 * Lee y escribe pacientes.csv (sección 5.1 del documento de contexto).
 * Mantiene a los pacientes en memoria (un Map por ID) mientras el programa
 * corre, y reescribe el archivo completo cada vez que algo cambia. Esto
 * mantiene el archivo siempre consistente y, de paso, evita que dos
 * escrituras se mezclen a medias: cada actualización reescribe el CSV
 * entero de una sola vez (fs.writeFileSync es síncrono).
 */

const ENCABEZADO = 'id,edad,sexo,sangre,fecha_revision,sistolica,diastolica,frecuencia';

function parsearLinea(linea) {
  const [id, edad, sexo, sangre, fecha, sistolica, diastolica, frecuencia] = linea.split(',');
  const ultimaRevision = fecha
    ? {
        fecha,
        sistolica: Number(sistolica),
        diastolica: Number(diastolica),
        frecuencia: Number(frecuencia),
      }
    : null;
  return { id, edad: Number(edad), sexo, sangre, ultimaRevision };
}

function formatearLinea(paciente) {
  const rev = paciente.ultimaRevision;
  const campos = [
    paciente.id,
    paciente.edad,
    paciente.sexo,
    paciente.sangre,
    rev ? rev.fecha : '',
    rev ? rev.sistolica : '',
    rev ? rev.diastolica : '',
    rev ? rev.frecuencia : '',
  ];
  return campos.join(',');
}

class PacientesRepo {
  constructor(rutaArchivo) {
    this.rutaArchivo = rutaArchivo;
    this.pacientes = new Map(); // id -> paciente
    this._cargar();
  }

  _cargar() {
    if (!fs.existsSync(this.rutaArchivo)) {
      fs.mkdirSync(path.dirname(this.rutaArchivo), { recursive: true });
      fs.writeFileSync(this.rutaArchivo, ENCABEZADO + '\n', 'utf8');
    }

    const contenido = fs.readFileSync(this.rutaArchivo, 'utf8');
    const lineas = contenido.split(/\r?\n/).filter((l) => l.trim().length > 0);

    this.pacientes = new Map();
    for (const linea of lineas.slice(1)) {
      const paciente = parsearLinea(linea);
      this.pacientes.set(paciente.id, paciente);
    }
  }

  _guardar() {
    const lineas = [ENCABEZADO, ...Array.from(this.pacientes.values()).map(formatearLinea)];
    fs.writeFileSync(this.rutaArchivo, lineas.join('\n') + '\n', 'utf8');
  }

  existe(id) {
    return this.pacientes.has(id);
  }

  /** Para validarRegistro.js: el conjunto de IDs ya registrados. */
  idsExistentes() {
    return new Set(this.pacientes.keys());
  }

  obtener(id) {
    return this.pacientes.get(id) || null;
  }

  /**
   * Todos los pacientes, en orden de registro. Regresa COPIAS (no las
   * referencias internas) para que quien liste no pueda mutar el repositorio
   * ni verse afectado por una actualización posterior (ver sección 14.3).
   */
  listar() {
    return Array.from(this.pacientes.values()).map((p) => ({
      ...p,
      ultimaRevision: p.ultimaRevision ? { ...p.ultimaRevision } : null,
    }));
  }

  /** Da de alta un paciente nuevo, sin revisión previa, y persiste el archivo. */
  agregar({ id, edad, sexo, sangre }) {
    this.pacientes.set(id, { id, edad, sexo, sangre, ultimaRevision: null });
    this._guardar();
  }

  /** Reemplaza la última revisión del paciente (una lectura aceptada) y persiste. */
  actualizarRevision(id, { fecha, sistolica, diastolica, frecuencia }) {
    const paciente = this.obtener(id);
    if (!paciente) {
      // Error de programación: interpreter.js no debería llamar a esto sin
      // haber confirmado antes, vía el AFD, que el paciente existe.
      throw new Error(`No se puede actualizar la revisión de un paciente inexistente: ${id}`);
    }
    paciente.ultimaRevision = { fecha, sistolica, diastolica, frecuencia };
    this._guardar();
  }
}

function crearPacientesRepo(rutaArchivo) {
  return new PacientesRepo(rutaArchivo);
}

module.exports = { PacientesRepo, crearPacientesRepo, ENCABEZADO };
