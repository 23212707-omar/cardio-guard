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

// Insignia de estado: icono SVG en línea + texto + color (nunca solo color).
// ACEPTADO_CON_ALERTA_Y_ADVERTENCIA se muestra como alerta, con el aviso de
// dato sospechoso visible en el texto de la insignia.
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONOS = {
  // círculo con palomita
  aceptado: ['M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19z', 'M7.5 12.5l3 3 6-6.5'],
  // octágono con signo de exclamación
  alerta: ['M8.2 2.5h7.6l5.7 5.7v7.6l-5.7 5.7H8.2l-5.7-5.7V8.2z', 'M12 7v6', 'M12 16.5v.5'],
  // triángulo con signo de exclamación
  advertencia: ['M12 3L2.5 20h19z', 'M12 10v4.5', 'M12 17.2v.3'],
  // círculo con cruz
  rechazado: ['M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19z', 'M8.5 8.5l7 7', 'M15.5 8.5l-7 7'],
};

function infoInsignia(estado) {
  switch (estado) {
    case 'ACEPTADO':
      return { tipo: 'aceptado', texto: 'Aceptado' };
    case 'ACEPTADO_CON_ALERTA':
      return { tipo: 'alerta', texto: 'Alerta' };
    case 'ACEPTADO_CON_ALERTA_Y_ADVERTENCIA':
      return { tipo: 'alerta', texto: 'Alerta', extra: 'dato sospechoso' };
    case 'ACEPTADO_CON_ADVERTENCIA':
      return { tipo: 'advertencia', texto: 'Advertencia' };
    case 'RECHAZADO':
      return { tipo: 'rechazado', texto: 'Rechazado' };
    default:
      return null;
  }
}

function crearInsignia(estado) {
  const info = infoInsignia(estado);
  if (!info) return null;

  const insignia = document.createElement('span');
  insignia.className = 'insignia insignia-' + info.tipo;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'insignia-icono');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ICONOS[info.tipo]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  insignia.appendChild(svg);

  const etiqueta = document.createElement('span');
  etiqueta.textContent = info.extra ? `${info.texto} · ${info.extra}` : info.texto;
  insignia.appendChild(etiqueta);

  return insignia;
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

  const insignia = crearInsignia(estado);
  if (insignia) tarjeta.appendChild(insignia);
  // La alerta se anuncia de inmediato a lectores de pantalla.
  if (tarjeta.className === 'tarjeta alerta') tarjeta.setAttribute('role', 'alert');

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
