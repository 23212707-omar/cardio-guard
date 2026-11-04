'use strict';

/**
 * app.js — Frontend de Cardio Guard
 *
 * El navegador lleva su propia numeración de "línea": cada instrucción que
 * se manda desde esta página cuenta como la siguiente línea de una fila
 * virtual, igual que si se estuviera escribiendo un archivo .txt una línea
 * a la vez (decisión del documento de contexto, sección 13.1). Esta cuenta
 * se reinicia si se recarga la página; el servidor no lleva ningún estado
 * para esto, solo confía en el numeroLinea que le llega en cada petición.
 */

let numeroLinea = 0;

const inputInstruccion = document.getElementById('instruccion');
const botonEnviar = document.getElementById('enviar');
const historial = document.getElementById('historial');
const historialVacio = document.getElementById('historial-vacio');

function claseParaEstado(estado) {
  switch (estado) {
    case 'ACEPTADO':
      return 'tarjeta aceptado';
    case 'ACEPTADO_CON_ALERTA':
    case 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA':
      return 'tarjeta alerta';
    case 'ACEPTADO_CON_ADVERTENCIA':
      return 'tarjeta advertencia';
    case 'RECHAZADO':
      return 'tarjeta rechazado';
    default:
      return 'tarjeta';
  }
}

function actualizarResumen(contadores) {
  document.getElementById('r-total').textContent = contadores.total;
  document.getElementById('r-aceptadas').textContent = contadores.aceptadas;
  document.getElementById('r-alerta').textContent = contadores.conAlerta;
  document.getElementById('r-rechazadas').textContent = contadores.rechazadas;
}

function agregarTarjeta(lineasBitacora, estado) {
  if (historialVacio) historialVacio.remove();

  const tarjeta = document.createElement('div');
  tarjeta.className = claseParaEstado(estado);

  const [encabezado, ...detalles] = lineasBitacora;

  const pEncabezado = document.createElement('p');
  pEncabezado.className = 'encabezado';
  pEncabezado.textContent = encabezado;
  tarjeta.appendChild(pEncabezado);

  for (const detalle of detalles) {
    const pDetalle = document.createElement('p');
    pDetalle.className = 'detalle';
    pDetalle.textContent = detalle.trim();
    tarjeta.appendChild(pDetalle);
  }

  // Lo más reciente arriba, para no tener que ir bajando con cada envío.
  historial.prepend(tarjeta);
}

async function enviarInstruccion() {
  const texto = inputInstruccion.value.trim();
  if (!texto) return;

  numeroLinea += 1;
  botonEnviar.disabled = true;

  try {
    const respuesta = await fetch('/api/procesar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, numeroLinea }),
    });

    if (!respuesta.ok) {
      const error = await respuesta.json().catch(() => ({}));
      alert(error.error || 'Ocurrió un error al procesar la instrucción.');
      numeroLinea -= 1; // no se consumió un número de línea real
      return;
    }

    const datos = await respuesta.json();
    agregarTarjeta(datos.lineasBitacora, datos.resultado.estado);
    actualizarResumen(datos.contadores);
    inputInstruccion.value = '';
    inputInstruccion.focus();
  } catch (err) {
    alert('No se pudo conectar con el servidor.');
    numeroLinea -= 1;
  } finally {
    botonEnviar.disabled = false;
  }
}

botonEnviar.addEventListener('click', enviarInstruccion);
inputInstruccion.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter') enviarInstruccion();
});
