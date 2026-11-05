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

// ---------- Panel de último resultado ----------
// Se arma solo con lo que la API ya devuelve. La recomendación y la fecha de
// la revisión anterior no vienen como campos de `resultado`: se leen de
// lineasBitacora (formato fijo, ver src/interpreter.js). La presión y la
// frecuencia se toman del texto que envió el usuario (ver leerLectura).

const panelUltimo = document.getElementById('ultimo-cuerpo');

const ETIQUETA_TIPO_ERROR = {
  LEXICO: 'Error léxico',
  SINTACTICO: 'Error de sintaxis',
  SEMANTICO: 'Error semántico',
};
const TEXTO_COMPARACION = {
  PRIMERA_REVISION: 'Primera revisión',
  POSITIVO: 'Mejoró',
  NEGATIVO: 'Empeoró',
  SIN_CAMBIO: 'Sin cambio',
};
const TEXTO_CAMBIO = { MEJORO: 'mejoró', EMPEORO: 'empeoró', SIN_CAMBIO: 'sin cambio' };

function el(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

// Extrae de las líneas de bitácora lo que `resultado` no trae como campo
// (el id del paciente NO se lee de aquí: viene en resultado.id).
function leerBitacora(lineasBitacora) {
  const [encabezado = '', ...detalles] = lineasBitacora;
  const m = encabezado.match(/^\[LÍNEA\s+\d+\]\s+(.*?)\s+->\s+ESTADO:/);
  const instruccion = m ? m[1] : encabezado;

  const salida = {
    instruccion,
    avisos: [],          // ¡ALERTA ROJA! y protocolo
    sospechoso: null,
    anterior: null,      // { fecha, valores }
    recomendacion: null,
  };

  for (const crudo of detalles) {
    const linea = crudo.trim();
    let c;
    if (/^¡ALERTA ROJA!|^Disparar protocolo/.test(linea)) {
      salida.avisos.push(linea);
    } else if (/^Dato sospechoso/.test(linea)) {
      salida.sospechoso = linea;
    } else if ((c = linea.match(/^Cambio vs\. (\S+?):.*\((.+)\)$/))) {
      salida.anterior = { fecha: c[1], valores: c[2].replace('->', '→') };
    } else if (/^Recomendación:/.test(linea)) {
      salida.recomendacion = linea.replace(/^Recomendación:\s*/, '');
    }
  }
  return salida;
}

// Presión y frecuencia, tomadas del texto enviado. La sintaxis la fija la
// gramática (LEC -> id ; num / num , num). Solo se llama con una lectura
// aceptada, así que el texto ya pasó el léxico y el parser; si aun así no
// coincide, devuelve null y el panel omite esos datos.
function leerLectura(texto) {
  const m = texto.match(/^\s*P\d+\s*;\s*(\d+)\s*\/\s*(\d+)\s*,\s*(\d+)\s*$/);
  if (!m) return null;
  return { sistolica: Number(m[1]), diastolica: Number(m[2]), frecuencia: Number(m[3]) };
}

function crearDato(etiqueta, valor, sub) {
  const caja = el('div', 'dato');
  caja.appendChild(el('dt', 'dato-etiqueta', etiqueta));
  caja.appendChild(el('dd', 'dato-valor', valor));
  if (sub) caja.appendChild(el('dd', 'dato-sub', sub));
  return caja;
}

function crearBloque(titulo, ...hijos) {
  const bloque = el('div', 'ultimo-bloque');
  bloque.appendChild(el('h3', 'ultimo-bloque-titulo', titulo));
  for (const h of hijos) bloque.appendChild(h);
  return bloque;
}

function crearComparacion(comparacion, b) {
  const p = el('p', 'ultimo-comparacion');
  const titular = el('strong', null, TEXTO_COMPARACION[comparacion.resultado] || comparacion.resultado);
  p.appendChild(titular);

  if (comparacion.resultado === 'PRIMERA_REVISION') {
    p.appendChild(document.createTextNode(': sin datos previos para comparar.'));
    return p;
  }
  if (b.anterior) {
    p.appendChild(document.createTextNode(` respecto a la revisión del ${b.anterior.fecha} (${b.anterior.valores}).`));
  }
  if (comparacion.presion && comparacion.frecuencia) {
    const detalle = el(
      'span', 'ultimo-comparacion-detalle',
      `Presión: ${TEXTO_CAMBIO[comparacion.presion.cambio]} · Frecuencia: ${TEXTO_CAMBIO[comparacion.frecuencia.cambio]}`
    );
    p.appendChild(detalle);
  }
  return p;
}

// La alerta roja se pinta de forma síncrona y sin la clase de entrada animada.
function mostrarUltimo(resultado, lineasBitacora, textoEnviado) {
  const info = infoInsignia(resultado.estado);
  const tipo = info ? info.tipo : 'neutro';
  const esAlerta = tipo === 'alerta';
  const b = leerBitacora(lineasBitacora);
  const id = resultado.id; // los rechazos no traen id: no se infiere del texto

  const panel = el('article', `ultimo-resultado ultimo-${tipo}`);
  // role="alert" solo para la alerta; el resto se anuncia en cortés.
  if (esAlerta) panel.setAttribute('role', 'alert');
  else panel.setAttribute('aria-live', 'polite');
  if (!esAlerta) panel.classList.add('entra'); // 150 ms; anulada con prefers-reduced-motion

  // Cabecera: insignia + paciente + línea
  const cabecera = el('div', 'ultimo-cabecera');
  const insignia = crearInsignia(resultado.estado);
  if (insignia) cabecera.appendChild(insignia);
  if (id) cabecera.appendChild(el('p', 'ultimo-paciente', `Paciente ${id}`));
  if (resultado.linea) cabecera.appendChild(el('p', 'ultimo-linea', `Línea ${resultado.linea}`));
  panel.appendChild(cabecera);

  const cuerpo = el('div', 'ultimo-contenido');
  cuerpo.appendChild(el('p', 'ultimo-instruccion', b.instruccion));

  if (resultado.estado === 'RECHAZADO') {
    cuerpo.appendChild(crearBloque(
      'Motivo del rechazo',
      el('p', 'ultimo-motivo-tipo', ETIQUETA_TIPO_ERROR[resultado.tipo] || 'Error'),
      el('p', 'ultimo-motivo', resultado.mensaje || b.instruccion)
    ));
  } else if (resultado.instruccion === 'REGISTRO') {
    const datos = el('dl', 'ultimo-datos');
    datos.appendChild(crearDato('Edad', `${resultado.edad} años`));
    datos.appendChild(crearDato('Sexo', resultado.sexo));
    datos.appendChild(crearDato('Sangre', resultado.sangre));
    cuerpo.appendChild(el('p', 'ultimo-nota', 'Paciente registrado. Aún no tiene revisiones.'));
    cuerpo.appendChild(datos);
  } else {
    for (const aviso of b.avisos) cuerpo.appendChild(el('p', 'ultimo-aviso', aviso));
    if (b.sospechoso) cuerpo.appendChild(el('p', 'ultimo-sospechoso', b.sospechoso));

    const comp = resultado.comparacion;
    const lec = resultado.instruccion === 'LECTURA' ? leerLectura(textoEnviado) : null;
    const datos = el('dl', 'ultimo-datos');
    if (lec) datos.appendChild(crearDato('Presión', `${lec.sistolica}/${lec.diastolica}`, 'mmHg'));
    if (lec) {
      const cat = comp && comp.frecuencia ? comp.frecuencia.actual.nombre : '';
      datos.appendChild(crearDato('Frecuencia', lec.frecuencia, cat ? `lpm · ${cat}` : 'lpm'));
    }
    if (resultado.clasificacionPresion) {
      datos.appendChild(crearDato('Clasificación', resultado.clasificacionPresion.nombre));
    }
    cuerpo.appendChild(datos);

    if (comp) cuerpo.appendChild(crearBloque('Comparación con la última revisión', crearComparacion(comp, b)));
    if (b.recomendacion) cuerpo.appendChild(crearBloque('Recomendación', el('p', 'ultimo-recomendacion', b.recomendacion)));
  }

  panel.appendChild(cuerpo);
  panelUltimo.replaceChildren(panel);
}

function actualizarResumen(contadores) {
  document.getElementById('r-total').textContent = contadores.total;
  document.getElementById('r-aceptadas').textContent = contadores.aceptadas;
  document.getElementById('r-alerta').textContent = contadores.conAlerta;
  document.getElementById('r-rechazadas').textContent = contadores.rechazadas;
}

// ---------- Bitácora de la sesión ----------
// Tarjeta compacta: insignia, paciente (resultado.id), línea e instrucción; los
// detalles van plegados (abiertos en la alerta, que no debe quedar escondida).
// El filtro solo oculta tarjetas en el cliente: no toca los contadores, que
// vienen de la API.

const filtros = document.getElementById('filtros');
const filtroInfo = document.getElementById('filtro-info');
const filtroVacio = document.getElementById('filtro-vacio');
let filtroActivo = 'todas';

function aplicarFiltro() {
  let total = 0;
  let visibles = 0;
  historial.querySelectorAll('.tarjeta').forEach((tarjeta) => {
    const ver = filtroActivo === 'todas' || tarjeta.dataset.estado === filtroActivo;
    tarjeta.hidden = !ver;
    total += 1;
    if (ver) visibles += 1;
  });
  filtroVacio.hidden = !(total > 0 && visibles === 0);
  filtroInfo.textContent = filtroActivo === 'todas' || total === 0
    ? ''
    : `Mostrando ${visibles} de ${total} en esta sesión.`;
}

function agregarTarjeta(resultado, lineasBitacora) {
  if (historialVacio) historialVacio.remove();
  filtros.hidden = false;

  const info = infoInsignia(resultado.estado);
  const tipo = info ? info.tipo : 'otro';
  const [encabezado, ...detalles] = lineasBitacora;

  const tarjeta = el('article', claseParaEstado(resultado.estado));
  tarjeta.dataset.estado = tipo;
  // El anuncio a lectores de pantalla (role="alert") lo hace el panel de
  // último resultado; aquí no se repite para no anunciar la alerta dos veces.

  const cabecera = el('div', 'tarjeta-cabecera');
  const insignia = crearInsignia(resultado.estado);
  if (insignia) cabecera.appendChild(insignia);
  if (resultado.id) cabecera.appendChild(el('span', 'tarjeta-id', resultado.id));
  if (resultado.linea) {
    cabecera.appendChild(el('span', 'tarjeta-linea', `Línea ${String(resultado.linea).padStart(2, '0')}`));
  }
  tarjeta.appendChild(cabecera);

  tarjeta.appendChild(el('p', 'encabezado', leerBitacora(lineasBitacora).instruccion));

  if (detalles.length > 0) {
    const plegable = el('details', 'tarjeta-detalles');
    if (tipo === 'alerta') plegable.open = true;
    plegable.appendChild(el('summary', null, `Detalles (${detalles.length})`));
    for (const detalle of detalles) plegable.appendChild(el('p', 'detalle', detalle.trim()));
    tarjeta.appendChild(plegable);
  }

  // Lo más reciente arriba, para no tener que ir bajando con cada envío.
  historial.prepend(tarjeta);
  aplicarFiltro(); // respeta el filtro que esté activo
}

filtros.addEventListener('click', (evento) => {
  const boton = evento.target.closest('.filtro');
  if (!boton) return;
  filtroActivo = boton.dataset.filtro;
  filtros.querySelectorAll('.filtro').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
  aplicarFiltro();
});

// ---------- Captura por campos ----------
// Los campos NO validan reglas clínicas ni de formato: solo arman el texto de
// la instrucción (la misma que se escribiría a mano) y la mandan por el mismo
// POST. El intérprete (src/) es quien rechaza valores inválidos. La única
// comprobación aquí es que no haya campos vacíos.

const textoBoton = document.getElementById('enviar-texto');
const errorLinea = document.getElementById('error-instruccion');
const formulario = document.getElementById('captura');
const vistaPrevia = document.getElementById('vista-previa');
const vistaPreviaTexto = document.getElementById('vista-previa-texto');
const pestanas = Array.from(document.querySelectorAll('.pestana'));

// `campos`: ids de los inputs, en el orden de la instrucción.
// `armar`: solo concatena con el formato fijo; no interpreta ni corrige.
const CAPTURAS = {
  registro: {
    campos: ['reg-id', 'reg-edad', 'reg-sexo', 'reg-sangre'],
    armar: (v) => `REGISTRAR ${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}`,
  },
  lectura: {
    campos: ['lec-id', 'lec-sis', 'lec-dia', 'lec-fc'],
    armar: (v) => `${v[0]}; ${v[1]}/${v[2]}, ${v[3]}`,
  },
  directa: {
    campos: ['instruccion'],
    armar: (v) => v[0],
  },
};

let capturaActiva = 'registro';

// Sugerencias para el ID de "Registrar lectura": los pacientes aceptados en
// esta sesión del navegador (resultado.id de un REGISTRAR o una lectura
// aceptados). Solo sugiere: un ID inexistente debe llegar al intérprete.
// TODO: cuando exista GET /api/pacientes, llenar esta lista desde ahí (hoy no
// existe y no se usa); así también aparecerían los pacientes de sesiones
// anteriores.
const listaPacientes = document.getElementById('lista-pacientes');
const pacientesSesion = new Set();

function recordarPaciente(id) {
  if (!id || pacientesSesion.has(id)) return;
  pacientesSesion.add(id);
  const opcion = document.createElement('option');
  opcion.value = id;
  listaPacientes.appendChild(opcion);
}

function inputsDe(nombre) {
  return CAPTURAS[nombre].campos.map((id) => document.getElementById(id));
}

function valoresDe(nombre) {
  return inputsDe(nombre).map((input) => input.value.trim());
}

function actualizarVistaPrevia() {
  const esDirecta = capturaActiva === 'directa';
  vistaPrevia.hidden = esDirecta; // en la directa el campo ya es el texto
  if (esDirecta) return;
  const valores = valoresDe(capturaActiva).map((v) => v || '…');
  vistaPreviaTexto.textContent = CAPTURAS[capturaActiva].armar(valores);
}

function mostrarError(mensaje, camposInvalidos = []) {
  errorLinea.textContent = mensaje;
  for (const input of camposInvalidos) input.setAttribute('aria-invalid', 'true');
}

function limpiarError() {
  errorLinea.textContent = '';
  formulario.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
}

function activarPestana(nombre, enfocar) {
  capturaActiva = nombre;
  for (const tab of pestanas) {
    const activa = tab.dataset.captura === nombre;
    tab.setAttribute('aria-selected', String(activa));
    tab.tabIndex = activa ? 0 : -1;
    if (activa && enfocar) tab.focus();
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !activa;
  }
  limpiarError();
  actualizarVistaPrevia();

// Estado vacío de la bitácora: atajo para empezar por registrar un paciente.
const vacioAccion = document.getElementById('vacio-accion');
if (vacioAccion) {
  vacioAccion.addEventListener('click', () => {
    activarPestana('registro', false);
    document.getElementById('reg-id').focus();
  });
}
}

function ponerCargando(cargando) {
  botonEnviar.disabled = cargando;
  botonEnviar.classList.toggle('cargando', cargando);
  formulario.querySelectorAll('input').forEach((i) => { i.readOnly = cargando; });
  formulario.closest('.formulario').setAttribute('aria-busy', String(cargando));
  textoBoton.textContent = cargando ? 'Procesando…' : 'Procesar';
}

async function enviarTexto(texto, captura) {
  limpiarError();
  numeroLinea += 1;
  ponerCargando(true);

  try {
    const respuesta = await fetch('/api/procesar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, numeroLinea }),
    });

    if (!respuesta.ok) {
      const error = await respuesta.json().catch(() => ({}));
      mostrarError(error.error || 'Ocurrió un error al procesar la instrucción.');
      numeroLinea -= 1; // no se consumió un número de línea real
      return;
    }

    const datos = await respuesta.json();
    // Primero el panel: la alerta roja no espera a nada más.
    mostrarUltimo(datos.resultado, datos.lineasBitacora, texto);
    agregarTarjeta(datos.resultado, datos.lineasBitacora);
    actualizarResumen(datos.contadores);
    if (datos.resultado.estado !== 'RECHAZADO') recordarPaciente(datos.resultado.id);
    limpiarTrasEnvio(captura, datos.resultado.estado);
  } catch (err) {
    mostrarError('No se pudo conectar con el servidor. Revisa que esté en marcha e inténtalo de nuevo.');
    numeroLinea -= 1;
  } finally {
    ponerCargando(false);
  }
}

// Aceptado: se limpian todos los campos y se enfoca el primero. Rechazado: se
// conservan los valores para poder corregirlos. La instrucción directa se
// limpia siempre, como antes.
function limpiarTrasEnvio(nombre, estado) {
  const inputs = inputsDe(nombre);
  const limpiar = nombre === 'directa' || estado !== 'RECHAZADO';
  if (limpiar) inputs.forEach((input) => { input.value = ''; });
  actualizarVistaPrevia();
  if (nombre === capturaActiva) inputs[0].focus(); // si cambió de pestaña, no se le quita el foco
}

function enviarFormulario() {
  if (botonEnviar.disabled) return; // ya hay un envío en curso
  const captura = capturaActiva;
  const inputs = inputsDe(captura);
  const vacios = inputs.filter((input) => input.value.trim() === '');

  if (vacios.length > 0) {
    // Solo se comprueba que no falte nada; no se envía ni se consume línea.
    const mensaje = captura === 'directa'
      ? 'Escribe una instrucción antes de procesar.'
      : `Completa los campos vacíos: ${vacios.map((i) => i.dataset.nombre).join(', ')}.`;
    mostrarError(mensaje, vacios);
    vacios[0].focus();
    return;
  }

  enviarTexto(CAPTURAS[captura].armar(valoresDe(captura)), captura);
}

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    inputInstruccion.value = chip.dataset.ejemplo;
    limpiarError();
    inputInstruccion.focus();
  });
});

// Pestañas: clic y teclado (flechas, Inicio, Fin).
pestanas.forEach((tab, i) => {
  tab.addEventListener('click', () => activarPestana(tab.dataset.captura, false));
  tab.addEventListener('keydown', (evento) => {
    let destino = null;
    if (evento.key === 'ArrowRight') destino = (i + 1) % pestanas.length;
    else if (evento.key === 'ArrowLeft') destino = (i - 1 + pestanas.length) % pestanas.length;
    else if (evento.key === 'Home') destino = 0;
    else if (evento.key === 'End') destino = pestanas.length - 1;
    if (destino === null) return;
    evento.preventDefault();
    activarPestana(pestanas[destino].dataset.captura, true);
  });
});

formulario.addEventListener('input', () => {
  limpiarError();
  actualizarVistaPrevia();
});
formulario.addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviarFormulario();
});

actualizarVistaPrevia();
