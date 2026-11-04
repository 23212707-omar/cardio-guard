'use strict';

const fs = require('fs');
const path = require('path');
const { fechaLocal } = require('../utils/fecha');

/**
 * bitacoraRepo.js — Repositorio de bitácora de Cardio Guard
 *
 * Crea un archivo nuevo por cada ejecución (nunca sobrescribe uno
 * anterior) con fecha y hora en el nombre, por ejemplo
 * "bitacora_2026-10-18_14-30.txt" (sección 5.1 del documento de contexto).
 * Cada línea que se agrega se escribe al archivo y, al mismo tiempo, se
 * imprime en consola, ya que la decisión fue que la bitácora se vea en
 * ambos lugares (sección 12).
 */

function pad(numero) {
  return String(numero).padStart(2, '0');
}

/** Arma el sufijo FECHA_HORA del nombre de archivo a partir de un Date. */
function timestampArchivo(fecha) {
  const y = fecha.getFullYear();
  const m = pad(fecha.getMonth() + 1);
  const d = pad(fecha.getDate());
  const h = pad(fecha.getHours());
  const min = pad(fecha.getMinutes());
  return `${y}-${m}-${d}_${h}-${min}`;
}

class BitacoraRepo {
  /**
   * @param {string} carpeta - carpeta donde se guardan las bitácoras (ej. data/bitacoras).
   * @param {Date} [fecha] - fecha/hora a usar; por defecto, el momento actual.
   *                         Recibirla como parámetro (en vez de usar `new Date()`
   *                         internamente) es lo que permite probar este módulo
   *                         con una fecha fija y predecible.
   */
  constructor(carpeta, fecha = new Date()) {
    fs.mkdirSync(carpeta, { recursive: true });

    this.nombreArchivo = `bitacora_${timestampArchivo(fecha)}.txt`;
    this.rutaArchivo = path.join(carpeta, this.nombreArchivo);
    this.fechaProcesamiento = fechaLocal(fecha); // YYYY-MM-DD, hora local

    // Si por alguna razón el archivo ya existe (ej. dos ejecuciones en el
    // mismo minuto), no se sobrescribe: se le agrega un sufijo numérico.
    let sufijo = 2;
    while (fs.existsSync(this.rutaArchivo)) {
      this.nombreArchivo = `bitacora_${timestampArchivo(fecha)}_${sufijo}.txt`;
      this.rutaArchivo = path.join(carpeta, this.nombreArchivo);
      sufijo += 1;
    }

    fs.writeFileSync(this.rutaArchivo, '', 'utf8');
    this._escribir('===== BITÁCORA DE AUDITORÍA - CARDIO GUARD =====');
    this._escribir(`Fecha de procesamiento: ${this.fechaProcesamiento}`);
    this._escribir('');
  }

  _escribir(texto) {
    fs.appendFileSync(this.rutaArchivo, texto + '\n', 'utf8');
    console.log(texto);
  }

  /**
   * Agrega el resultado de una instrucción a la bitácora.
   * @param {string[]} lineas - líneas ya formateadas por interpreter.js
   *   (ej. ["[LÍNEA 01] P001 | 118/76, 75 -> ESTADO: Aceptado (Normal)",
   *         "   Cambio vs. 2026-09-18: POSITIVO (130/85 -> 118/76)"]).
   */
  registrarEntrada(lineas) {
    for (const linea of lineas) {
      this._escribir(linea);
    }
    this._escribir('');
  }

  /**
   * Escribe el bloque de resumen al final y regresa la ruta del archivo.
   * @param {{total:number, aceptadas:number, conAlerta:number, rechazadas:number,
   *          erroresSintaxis:number, erroresSemanticos:number}} resumen
   */
  cerrarConResumen(resumen) {
    const { total, aceptadas, conAlerta, rechazadas, erroresSintaxis, erroresSemanticos } = resumen;
    this._escribir('----- RESUMEN -----');
    this._escribir(
      `Total procesadas: ${total} | Aceptadas: ${aceptadas} (${conAlerta} con alerta) | Rechazadas: ${rechazadas}`
    );
    this._escribir(`   Errores de sintaxis: ${erroresSintaxis} | Errores semánticos: ${erroresSemanticos}`);
    this._escribir('');
    this._escribir(`Bitácora guardada en: ${this.nombreArchivo}`);
    return this.rutaArchivo;
  }
}

function crearBitacora(carpeta, fecha) {
  return new BitacoraRepo(carpeta, fecha);
}

module.exports = { BitacoraRepo, crearBitacora };
