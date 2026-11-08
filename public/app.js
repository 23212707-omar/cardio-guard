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

// Icono SVG decorativo (aria-hidden): el significado siempre va en el texto.
function crearIcono(tipo, clase) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', clase);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ICONOS[tipo]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function crearInsignia(estado) {
  const info = infoInsignia(estado);
  if (!info) return null;

  const insignia = document.createElement('span');
  insignia.className = 'insignia insignia-' + info.tipo;
  insignia.appendChild(crearIcono(info.tipo, 'insignia-icono'));

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
    motivos: [],         // una línea "¡ALERTA ROJA! ..." por motivo (crisis y/o frecuencia)
    protocolo: null,     // "Disparar protocolo..." (una sola, aunque haya varios motivos)
    sospechosos: [],     // una línea "Dato sospechoso: ..." por causa
    anterior: null,      // { fecha, valores }
    recomendacion: null,
  };

  for (const crudo of detalles) {
    const linea = crudo.trim();
    let c;
    if (/^¡ALERTA ROJA!/.test(linea)) {
      salida.motivos.push(linea);
    } else if (/^Disparar protocolo/.test(linea)) {
      salida.protocolo = linea;
    } else if (/^Dato sospechoso/.test(linea)) {
      salida.sospechosos.push(linea);
    } else if ((c = linea.match(/^Cambio vs\. (\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?):.*\((.+)\)$/))) {
      // La fecha puede traer hora (AAAA-MM-DD HH:MM) o ser solo la fecha (filas antiguas).
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

// Bloque monoespaciado del marcador "^" (errores léxicos y sintácticos): la
// instrucción tal como llegó y debajo una línea que termina en el "^". Sin
// trim() ni cambios de espacios, o el "^" se desalinea. El motivo NO va aquí:
// se pone aparte, como texto normal (ver crearMotivoDiagnostico).
function crearBloqueDiagnostico(diagnostico) {
  const marcador = diagnostico.marcador;
  const caret = marcador.indexOf('^');
  // El relleno solo tiene espacios o tabs, así que el primer "^" es el del marcador.
  const lineaCaret = caret >= 0 ? marcador.slice(0, caret + 1) : marcador;
  const pre = el('pre', 'diagnostico');
  pre.tabIndex = 0; // permite desplazarlo con teclado si la instrucción es larga
  pre.setAttribute('role', 'region');
  pre.setAttribute('aria-label', 'Instrucción con marcador de error');
  pre.textContent = `${diagnostico.instruccion}\n${lineaCaret}`;
  return pre;
}

// Motivo del error, como texto normal bajo el bloque. Si el resultado no trae
// `detalle`, no hay nada que separar: el bloque ya se pintó con el marcador
// completo (ver crearDiagnosticoCompleto).
function crearMotivoDiagnostico(resultado) {
  return resultado.detalle ? el('p', 'ultimo-motivo', `Motivo: ${resultado.detalle}`) : null;
}

// Bloque + motivo, compartido por el panel de último resultado y las tarjetas.
function crearDiagnosticoCompleto(resultado) {
  const d = resultado.diagnostico;
  const nodos = [];
  if (resultado.detalle) {
    nodos.push(crearBloqueDiagnostico(d));
    nodos.push(crearMotivoDiagnostico(resultado));
  } else {
    // Sin detalle: marcador completo (instrucción + línea del "^" con su texto).
    const pre = el('pre', 'diagnostico');
    pre.tabIndex = 0;
    pre.setAttribute('role', 'region');
    pre.setAttribute('aria-label', 'Instrucción con marcador de error');
    pre.textContent = `${d.instruccion}\n${d.marcador}`;
    nodos.push(pre);
  }
  return nodos;
}

function crearDato(etiqueta, valor, sub, ancho) {
  const caja = el('div', ancho ? 'dato dato-ancho' : 'dato');
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
    // La fecha va en su propio span para que no se parta en los guiones.
    p.appendChild(document.createTextNode(' respecto a la revisión del '));
    p.appendChild(el('span', 'fecha', b.anterior.fecha));
    p.appendChild(document.createTextNode(` (${b.anterior.valores}).`));
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

// ---------- CONSULTAR y LISTAR ----------
// Etiquetas clínicas: salen de paciente.clasificacion (crisis / datoSospechoso),
// no del estado de la instrucción, que sigue siendo ACEPTADO (verde). Icono +
// texto, nunca solo color. Cada una describe la última revisión del paciente.
const ETIQUETAS_CLINICAS = {
  crisis: { icono: 'alerta', texto: 'CRISIS HIPERTENSIVA' },
  taquicardia: { icono: 'alerta', texto: 'TAQUICARDIA SEVERA' },
  bradicardia: { icono: 'alerta', texto: 'BRADICARDIA SEVERA' },
  sospechoso: { icono: 'advertencia', texto: 'DATO SOSPECHOSO' },
};

// clasificacion.alertaFrecuencia -> clave de ETIQUETAS_CLINICAS.
const ETIQUETA_POR_ALERTA_FRECUENCIA = {
  TAQUICARDIA_SEVERA: 'taquicardia',
  BRADICARDIA_SEVERA: 'bradicardia',
};

// Causas de clasificacion.causasSospechoso -> texto en español.
// OJO: los umbrales de estos textos deben coincidir con las constantes de
// src/semantics/clasificacion.js (PRESION_SISTOLICA_EXTREMA, PRESION_DIASTOLICA_EXTREMA,
// PULSO_MINIMO_PLAUSIBLE, FRECUENCIA_EXTREMA_BAJA, FRECUENCIA_EXTREMA_ALTA).
// Si cambian allá, hay que actualizarlos aquí y en la ayuda de index.html.
const TEXTO_CAUSA_SOSPECHOSO = {
  PRESION_EXTREMA: 'Presión extrema (sistólica mayor de 250 o diastólica mayor de 150 mmHg).',
  PULSO_BAJO: 'Presión de pulso muy baja (diferencia entre sistólica y diastólica menor de 10 mmHg).',
  FRECUENCIA_EXTREMA: 'Frecuencia extrema (menor de 40 o mayor de 200 lpm).',
};

function crearEtiquetaClinica(tipo) {
  const info = ETIQUETAS_CLINICAS[tipo];
  const etiqueta = el('span', `etiqueta-clinica etiqueta-${tipo}`);
  etiqueta.appendChild(crearIcono(info.icono, 'etiqueta-icono'));
  etiqueta.appendChild(el('span', null, info.texto));
  return etiqueta;
}

// Contenedor con 0–3 etiquetas (pueden coexistir): crisis, frecuencia severa y
// dato sospechoso. null si no hay ninguna.
function crearEtiquetasPaciente(paciente) {
  const c = paciente.clasificacion;
  if (!c) return null;
  const claveFrecuencia = ETIQUETA_POR_ALERTA_FRECUENCIA[c.alertaFrecuencia];
  if (!c.crisis && !claveFrecuencia && !c.datoSospechoso) return null;
  const caja = el('div', 'etiquetas-clinicas');
  if (c.crisis) caja.appendChild(crearEtiquetaClinica('crisis'));
  if (claveFrecuencia) caja.appendChild(crearEtiquetaClinica(claveFrecuencia));
  if (c.datoSospechoso) caja.appendChild(crearEtiquetaClinica('sospechoso'));
  return caja;
}

// Causas del dato sospechoso (ficha de CONSULTAR). Un código desconocido se
// muestra con un texto genérico en vez de romper la ficha.
function crearCausasSospechoso(clasificacion) {
  if (!clasificacion || !clasificacion.datoSospechoso) return null;
  const causas = Array.isArray(clasificacion.causasSospechoso) ? clasificacion.causasSospechoso : [];
  const lista = el('ul', 'causas-sospechoso');
  for (const causa of causas) {
    lista.appendChild(el('li', null, TEXTO_CAUSA_SOSPECHOSO[causa] || 'Valor fuera del rango habitual, verificar captura.'));
  }
  if (causas.length === 0) lista.appendChild(el('li', null, 'Valor fuera del rango habitual, verificar captura.'));
  return crearBloque('Dato sospechoso', lista);
}

function crearFichaPaciente(paciente) {
  const nodos = [];
  const etiquetas = crearEtiquetasPaciente(paciente);
  if (etiquetas) nodos.push(etiquetas);

  // Dos cuadrículas: datos personales (3) y revisión (Presión + Frecuencia en
  // fila, Clasificación ancha), para que Frecuencia no quede sola en una fila.
  const datos = el('dl', 'ultimo-datos ultimo-datos-personal');
  datos.appendChild(crearDato('Edad', paciente.edad, 'años'));
  datos.appendChild(crearDato('Sexo', paciente.sexo));
  datos.appendChild(crearDato('Sangre', paciente.sangre));
  nodos.push(datos);

  const rev = paciente.ultimaRevision;
  const c = paciente.clasificacion;
  if (rev && c) {
    const datosRev = el('dl', 'ultimo-datos ultimo-datos-revision');
    datosRev.appendChild(crearDato('Presión', `${rev.sistolica}/${rev.diastolica}`, 'mmHg'));
    datosRev.appendChild(crearDato('Frecuencia', rev.frecuencia, `lpm · ${c.frecuencia.nombre}`));
    datosRev.appendChild(crearDato('Clasificación', c.presion.nombre, null, true));
    nodos.push(datosRev);

    const causas = crearCausasSospechoso(c);
    if (causas) nodos.push(causas);
  }

  const historial = crearHistorial(paciente.historial);
  if (historial) nodos.push(historial);

  if (rev && c) {
    const p = el('p', 'ultimo-comparacion');
    p.appendChild(document.createTextNode('Última revisión: '));
    p.appendChild(el('span', 'fecha', rev.fecha));
    // Con CSV solo existe la última revisión; con historial (SQL Server) no es cierto.
    p.appendChild(document.createTextNode(historial ? '.' : '. Solo se conserva la última revisión.'));
    nodos.push(crearBloque('Revisión', p));
  } else {
    nodos.push(el('p', 'ultimo-nota', 'Sin revisiones registradas todavía.'));
  }
  nodos.push(el('p', 'nota-orientativa', 'Carácter orientativo, no es diagnóstico médico.'));
  return nodos;
}

// Rol ARIA explícito (y data-etiqueta para la vista de tarjetas) en las tablas
// que se apilan en pantallas angostas: LISTAR y el historial de CONSULTAR.
function conRol(nodo, rol, etiqueta) {
  nodo.setAttribute('role', rol);
  if (etiqueta) nodo.setAttribute('data-etiqueta', etiqueta);
  return nodo;
}

const NBSP = ' ';

// Historial de revisiones (solo con SQL Server). null si no existe (CSV) o está
// vacío. La fecha se muestra tal cual llega; no se convierte con Date.
function crearHistorial(historial) {
  const revisiones = historial && Array.isArray(historial.revisiones) ? historial.revisiones : [];
  if (revisiones.length === 0) return null;

  const [hFecha, hPresion, hFrecuencia, hClas] = ['Fecha y hora', 'Presión', 'Frecuencia', 'Clasificación'];
  const tabla = conRol(el('table', 'tabla-pacientes tabla-historial'), 'table');
  tabla.appendChild(el('caption', 'solo-lector', 'Historial de revisiones, de la más reciente a la más antigua'));
  const thead = conRol(el('thead'), 'rowgroup');
  const filaTh = conRol(el('tr'), 'row');
  thead.appendChild(filaTh);
  for (const t of [hFecha, hPresion, hFrecuencia, hClas]) {
    const th = conRol(el('th', null, t), 'columnheader');
    th.scope = 'col';
    filaTh.appendChild(th);
  }
  tabla.appendChild(thead);

  const tbody = conRol(el('tbody'), 'rowgroup');
  revisiones.forEach((rev, i) => {
    const fila = conRol(el('tr'), 'row');
    const celdaFecha = conRol(el('th', 'col-fecha'), 'rowheader', hFecha);
    celdaFecha.scope = 'row';
    celdaFecha.appendChild(el('span', 'fecha', rev.fecha));
    if (i === 0) celdaFecha.appendChild(el('span', 'hist-reciente', 'Más reciente'));
    fila.appendChild(celdaFecha);
    fila.appendChild(conRol(el('td', 'col-num', `${rev.sistolica}/${rev.diastolica}${NBSP}mmHg`), 'cell', hPresion));
    fila.appendChild(conRol(el('td', 'col-num', `${rev.frecuencia}${NBSP}lpm`), 'cell', hFrecuencia));

    const c = rev.clasificacion;
    const celdaClas = conRol(el('td', 'col-clas'), 'cell', hClas);
    if (c && c.presion && c.frecuencia) {
      celdaClas.appendChild(el('span', 'clas-linea', c.presion.nombre));
      celdaClas.appendChild(el('span', 'clas-linea clas-fc', `FC: ${c.frecuencia.nombre}`));
      const etiquetas = crearEtiquetasPaciente({ clasificacion: c });
      if (etiquetas) celdaClas.appendChild(etiquetas);
    } else {
      celdaClas.appendChild(el('span', 'sin-revision', '—'));
    }
    fila.appendChild(celdaClas);
    tbody.appendChild(fila);
  });
  tabla.appendChild(tbody);

  const scroll = el('div', 'tabla-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Tabla del historial de revisiones');
  scroll.appendChild(tabla);

  const hijos = [];
  if (Number.isFinite(historial.total) && Number.isFinite(historial.mostradas) && historial.total > historial.mostradas) {
    hijos.push(el('p', 'ultimo-nota', `Mostrando las ${historial.mostradas} más recientes de ${historial.total}`));
  }
  hijos.push(scroll);
  return crearBloque('Historial de revisiones', ...hijos);
}

function irARegistrar() {
  activarPestana('registro', false);
  document.getElementById('reg-id').focus();
}

function crearTablaListado(resultado) {
  const pacientes = Array.isArray(resultado.pacientes) ? resultado.pacientes : [];
  if (pacientes.length === 0) {
    const vacio = el('div', 'listado-vacio');
    vacio.appendChild(el('p', null, 'No hay pacientes registrados.'));
    vacio.appendChild(el('p', null, 'Registra uno y después captura su primera lectura.'));
    const boton = el('button', 'vacio-accion', 'Registrar un paciente');
    boton.type = 'button';
    boton.addEventListener('click', irARegistrar);
    vacio.appendChild(boton);
    return [vacio];
  }

  const total = Number.isFinite(resultado.total) ? resultado.total : pacientes.length;
  // En pantallas angostas el CSS apila cada fila como tarjeta (display distinto
  // de table-*), lo que hace que algunos navegadores pierdan la semántica de
  // tabla; los roles explícitos la conservan. Cada celda lleva su etiqueta en
  // data-etiqueta para mostrarla en la tarjeta.
  const [hID, hEdad, hSexo, hSangre, hRev, hClas] = ['ID', 'Edad', 'Sexo', 'Sangre', 'Última revisión', 'Clasificación'];
  const encabezados = [hID, hEdad, hSexo, hSangre, hRev, hClas];

  const tabla = conRol(el('table', 'tabla-pacientes'), 'table');
  tabla.appendChild(el('caption', 'solo-lector', `${total} paciente(s) registrado(s)`));
  const thead = conRol(el('thead'), 'rowgroup');
  const filaTh = conRol(el('tr'), 'row');
  thead.appendChild(filaTh);
  for (const t of encabezados) {
    const th = conRol(el('th', null, t), 'columnheader');
    th.scope = 'col';
    filaTh.appendChild(th);
  }
  tabla.appendChild(thead);

  const tbody = conRol(el('tbody'), 'rowgroup');
  for (const p of pacientes) {
    const fila = conRol(el('tr'), 'row');
    const id = conRol(el('th', 'col-id', p.id), 'rowheader', hID);
    id.scope = 'row';
    fila.appendChild(id);
    fila.appendChild(conRol(el('td', 'col-num', p.edad), 'cell', hEdad));
    fila.appendChild(conRol(el('td', null, p.sexo), 'cell', hSexo));
    fila.appendChild(conRol(el('td', null, p.sangre), 'cell', hSangre));

    const rev = p.ultimaRevision;
    const c = p.clasificacion;
    const celdaRev = conRol(el('td', 'col-rev'), 'cell', hRev);
    const celdaClas = conRol(el('td', 'col-clas'), 'cell', hClas);
    if (rev && c) {
      celdaRev.appendChild(el('span', 'rev-valores', `${rev.sistolica}/${rev.diastolica} mmHg · ${rev.frecuencia} lpm`));
      celdaRev.appendChild(el('span', 'fecha rev-fecha', rev.fecha));
      celdaClas.appendChild(el('span', 'clas-linea', c.presion.nombre));
      celdaClas.appendChild(el('span', 'clas-linea clas-fc', `FC: ${c.frecuencia.nombre}`));
      const etiquetas = crearEtiquetasPaciente(p);
      if (etiquetas) celdaClas.appendChild(etiquetas);
    } else {
      celdaRev.appendChild(el('span', 'sin-revision', 'Sin revisiones'));
      celdaClas.appendChild(el('span', 'sin-revision', '—'));
    }
    fila.appendChild(celdaRev);
    fila.appendChild(celdaClas);
    tbody.appendChild(fila);
  }
  tabla.appendChild(tbody);

  const scroll = el('div', 'tabla-scroll');
  scroll.tabIndex = 0; // permite desplazar la tabla con teclado
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Tabla de pacientes registrados');
  scroll.appendChild(tabla);
  return [
    el('p', 'ultimo-nota', `${total} paciente(s) registrado(s).`),
    scroll,
    el('p', 'nota-orientativa', 'Carácter orientativo, no es diagnóstico médico.'),
  ];
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
  const conDiagnostico = resultado.estado === 'RECHAZADO' && resultado.diagnostico;
  // Con diagnóstico, la instrucción se muestra dentro del bloque del "^".
  if (!conDiagnostico) cuerpo.appendChild(el('p', 'ultimo-instruccion', b.instruccion));

  if (resultado.estado === 'RECHAZADO') {
    const hijos = [
      el('p', 'ultimo-motivo-tipo', ETIQUETA_TIPO_ERROR[resultado.tipo] || 'Error'),
      el('p', 'ultimo-motivo', resultado.mensaje || b.instruccion),
    ];
    if (conDiagnostico) hijos.push(...crearDiagnosticoCompleto(resultado));
    cuerpo.appendChild(crearBloque('Motivo del rechazo', ...hijos));
  } else if (resultado.instruccion === 'REGISTRO') {
    const datos = el('dl', 'ultimo-datos');
    datos.appendChild(crearDato('Edad', `${resultado.edad} años`));
    datos.appendChild(crearDato('Sexo', resultado.sexo));
    datos.appendChild(crearDato('Sangre', resultado.sangre));
    cuerpo.appendChild(el('p', 'ultimo-nota', 'Paciente registrado. Aún no tiene revisiones.'));
    cuerpo.appendChild(datos);
  } else if (resultado.instruccion === 'CONSULTA' && resultado.paciente) {
    for (const nodo of crearFichaPaciente(resultado.paciente)) cuerpo.appendChild(nodo);
  } else if (resultado.instruccion === 'LISTADO') {
    for (const nodo of crearTablaListado(resultado)) cuerpo.appendChild(nodo);
  } else {
    // Alerta: un encabezado por motivo (crisis y/o frecuencia) y un solo protocolo.
    for (const motivo of b.motivos) cuerpo.appendChild(el('p', 'ultimo-aviso', motivo));
    if (b.protocolo) cuerpo.appendChild(el('p', 'ultimo-protocolo', b.protocolo));
    // Dato sospechoso: una línea por causa; puede venir solo o junto con alerta.
    for (const sosp of b.sospechosos) cuerpo.appendChild(el('p', 'ultimo-sospechoso', sosp));

    const comp = resultado.comparacion;
    const lec = resultado.instruccion === 'LECTURA' ? leerLectura(textoEnviado) : null;
    const datos = el('dl', 'ultimo-datos');
    if (lec) datos.appendChild(crearDato('Presión', `${lec.sistolica}/${lec.diastolica}`, 'mmHg'));
    if (lec) {
      const cat = comp && comp.frecuencia ? comp.frecuencia.actual.nombre : '';
      datos.appendChild(crearDato('Frecuencia', lec.frecuencia, cat ? `lpm · ${cat}` : 'lpm'));
    }
    if (resultado.clasificacionPresion) {
      datos.appendChild(crearDato('Clasificación', resultado.clasificacionPresion.nombre, null, true));
    }
    cuerpo.appendChild(datos);

    if (comp) cuerpo.appendChild(crearBloque('Comparación con la última revisión', crearComparacion(comp, b)));
    if (b.recomendacion) cuerpo.appendChild(crearBloque('Recomendación', el('p', 'ultimo-recomendacion', b.recomendacion)));
  }

  panel.appendChild(cuerpo);
  panelUltimo.replaceChildren(panel);
}

// ---------- Resumen de la ejecución ----------
// Los contadores son los del servidor (POST y GET /api/estado). Cualquier valor
// que no sea un número se muestra como 0, así que una respuesta incompleta no
// rompe la página.

const numeroOCero = (v) => (Number.isFinite(v) ? v : 0);
let resumenDePost = false; // un POST es más reciente que un GET /api/estado lento

function actualizarResumen(contadores) {
  const c = contadores || {};
  document.getElementById('r-total').textContent = numeroOCero(c.total);
  document.getElementById('r-aceptadas').textContent = numeroOCero(c.aceptadas);
  document.getElementById('r-alerta').textContent = numeroOCero(c.conAlerta);
  document.getElementById('r-rechazadas').textContent = numeroOCero(c.rechazadas);

  // Desglose opcional: solo si la API entrega ambos campos y hay rechazos.
  const hayDesglose = Number.isFinite(c.erroresSintaxis) && Number.isFinite(c.erroresSemanticos);
  document.getElementById('r-sintaxis').textContent = numeroOCero(c.erroresSintaxis);
  document.getElementById('r-semanticos').textContent = numeroOCero(c.erroresSemanticos);
  document.getElementById('r-desglose').hidden = !(hayDesglose && numeroOCero(c.rechazadas) > 0);
}

// Al cargar: fecha de procesamiento, archivo de bitácora y contadores. Si falla
// (red, 404, JSON inválido) no se muestra nada: queda el cero inicial.
async function cargarEstado() {
  try {
    const respuesta = await fetch('/api/estado', { cache: 'no-store' });
    if (!respuesta.ok) return;
    const estado = await respuesta.json();
    if (!estado || typeof estado !== 'object') return;

    if (typeof estado.fechaProcesamiento === 'string' && typeof estado.archivoBitacora === 'string') {
      document.getElementById('r-fecha').textContent = estado.fechaProcesamiento;
      document.getElementById('r-archivo').textContent = estado.archivoBitacora;
      document.getElementById('r-meta').hidden = false;
    }
    if (!resumenDePost) actualizarResumen(estado.contadores);
  } catch (err) {
    // Sin mensaje: la página funciona igual con los contadores en cero.
  }
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
  let [encabezado, ...detalles] = lineasBitacora;
  // CONSULTAR con historial: la ficha ya muestra la tabla, así que las líneas de
  // texto del historial (de "Historial de revisiones…" al final) no se repiten
  // aquí ni se cuentan. La bitácora .txt las conserva; lineasBitacora no se altera.
  if (resultado.instruccion === 'CONSULTA' && resultado.paciente && resultado.paciente.historial) {
    const inicio = detalles.findIndex((l) => l.trim().startsWith('Historial de revisiones'));
    if (inicio !== -1) detalles = detalles.slice(0, inicio);
  }

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

  // CONSULTAR: las etiquetas clínicas también van visibles en la tarjeta.
  if (resultado.instruccion === 'CONSULTA' && resultado.paciente) {
    const etiquetas = crearEtiquetasPaciente(resultado.paciente);
    if (etiquetas) tarjeta.appendChild(etiquetas);
  }

  if (detalles.length > 0) {
    const plegable = el('details', 'tarjeta-detalles');
    if (tipo === 'alerta') plegable.open = true;
    plegable.appendChild(el('summary', null, `Detalles (${detalles.length})`));
    if (resultado.estado === 'RECHAZADO' && resultado.diagnostico) {
      // Léxico/sintáctico: el mensaje general como texto y el "^" en bloque
      // monoespaciado armado desde resultado.diagnostico (las líneas de la
      // bitácora traen sangría y no deben recortarse ni reacomodarse).
      plegable.appendChild(el('p', 'detalle', detalles[0].trim()));
      for (const nodo of crearDiagnosticoCompleto(resultado)) plegable.appendChild(nodo);
    } else {
      for (const detalle of detalles) plegable.appendChild(el('p', 'detalle', detalle.trim()));
    }
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
  consultar: {
    campos: ['con-id'],
    armar: (v) => `CONSULTAR ${v[0]}`,
  },
  // Sin campos: solo el botón. La vista previa muestra "LISTAR".
  listar: {
    campos: [],
    armar: () => 'LISTAR',
  },
  directa: {
    campos: ['instruccion'],
    armar: (v) => v[0],
  },
};

let capturaActiva = 'registro';

// Sugerencias para el ID de "Lectura" y "Consultar": los pacientes aceptados en
// esta sesión del navegador (resultado.id de un REGISTRAR, lectura o CONSULTAR
// aceptados) y los de resultado.pacientes de un LISTAR. Solo sugiere: un ID
// inexistente debe llegar al intérprete.
// Además, GET /api/pacientes (solo IDs) trae los pacientes ya guardados al abrir
// la página y después de un REGISTRAR aceptado o un LISTAR. Si falla, no pasa
// nada: la lista queda como estaba.
const listaPacientes = document.getElementById('lista-pacientes');
const pacientesSesion = new Set();

function recordarPaciente(id) {
  if (!id || pacientesSesion.has(id)) return;
  pacientesSesion.add(id);
  const opcion = document.createElement('option');
  opcion.value = id;
  listaPacientes.appendChild(opcion);
}

async function cargarPacientesGuardados() {
  try {
    const respuesta = await fetch('/api/pacientes', { cache: 'no-store' });
    if (!respuesta.ok) return;
    const datos = await respuesta.json();
    if (!datos || !Array.isArray(datos.pacientes)) return;
    for (const p of datos.pacientes) {
      if (p && typeof p.id === 'string') recordarPaciente(p.id);
    }
  } catch (err) {
    // En silencio: solo son sugerencias.
  }
}
cargarPacientesGuardados();

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
}

// Estado vacío de la bitácora: atajo para empezar por registrar un paciente.
const vacioAccion = document.getElementById('vacio-accion');
if (vacioAccion) {
  vacioAccion.addEventListener('click', irARegistrar);
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
    resumenDePost = true;
    actualizarResumen(datos.contadores);
    if (datos.resultado.estado !== 'RECHAZADO') {
      recordarPaciente(datos.resultado.id);
      if (Array.isArray(datos.resultado.pacientes)) {
        for (const p of datos.resultado.pacientes) recordarPaciente(p && p.id);
      }
    }
    limpiarTrasEnvio(captura, datos.resultado.estado);
    // Sin await: no retrasa nada; las sugerencias se refrescan por su cuenta.
    const esRegistroAceptado = datos.resultado.estado !== 'RECHAZADO' && /^\s*REGISTRAR\b/i.test(texto);
    if (esRegistroAceptado || /^\s*LISTAR\b/i.test(texto)) cargarPacientesGuardados();
  } catch (err) {
    mostrarError('No se pudo conectar con el servidor. Revisa que esté en marcha e inténtalo de nuevo.');
    numeroLinea -= 1;
  } finally {
    ponerCargando(false);
    // Sin campos (Listar), el foco que tenía el botón deshabilitado vuelve a él.
    if (captura === 'listar' && capturaActiva === 'listar') botonEnviar.focus();
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
  // Si cambió de pestaña, no se le quita el foco. "Listar" no tiene campos:
  // su foco vuelve al botón en enviarTexto, cuando ya no está deshabilitado.
  if (nombre === capturaActiva && inputs.length > 0) inputs[0].focus();
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
cargarEstado();
