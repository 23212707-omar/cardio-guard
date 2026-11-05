---
name: Cardio Guard
description: Interfaz sobria para capturar lecturas de presión arterial y frecuencia cardíaca y ver al instante su estado.
colors:
  marca: "#0f4c5c"
  marca-hover: "#0b3a47"
  marca-texto: "#ffffff"
  fondo: "#f4f7f8"
  panel: "#ffffff"
  borde: "#d3dce0"
  borde-campo: "#667882"
  tinta: "#14232b"
  tinta-suave: "#465861"
  seleccion: "#cfe4ea"
  ok-fondo: "#e6f4ea"
  ok-texto: "#123d22"
  ok-borde: "#1b6e3a"
  alerta-fondo: "#fde8e6"
  alerta-texto: "#5c0f0a"
  alerta-solido: "#b3261e"
  adv-fondo: "#fff1d6"
  adv-texto: "#4d2e00"
  adv-borde: "#8a5200"
  rech-fondo: "#eceff1"
  rech-texto: "#2a3338"
  rech-borde: "#5b6770"
  oscuro-marca: "#6fc3d6"
  oscuro-marca-hover: "#8fd3e2"
  oscuro-marca-texto: "#08222b"
  oscuro-fondo: "#0f1a1f"
  oscuro-panel: "#16252c"
  oscuro-borde: "#2c3f48"
  oscuro-borde-campo: "#7a8d96"
  oscuro-tinta: "#e6eef1"
  oscuro-tinta-suave: "#a9bac1"
  oscuro-seleccion: "#24505c"
  oscuro-ok-fondo: "#123022"
  oscuro-ok-texto: "#cfebd8"
  oscuro-ok-borde: "#5cc47f"
  oscuro-alerta-fondo: "#3a1411"
  oscuro-alerta-texto: "#ffd9d5"
  oscuro-alerta-solido: "#ff8a80"
  oscuro-alerta-solido-texto: "#2a0805"
  oscuro-adv-fondo: "#3a2800"
  oscuro-adv-texto: "#ffe6b8"
  oscuro-adv-borde: "#f0b24a"
  oscuro-rech-fondo: "#212c31"
  oscuro-rech-texto: "#d5dde1"
  oscuro-rech-borde: "#8a99a1"
typography:
  titulo:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
  dato:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.3
  cuerpo:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  etiqueta:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "8px"
  pastilla: "999px"
spacing:
  esp-1: "0.25rem"
  esp-2: "0.5rem"
  esp-3: "0.75rem"
  esp-4: "1rem"
  esp-5: "1.5rem"
  esp-6: "2rem"
  esp-7: "3rem"
components:
  boton-primario:
    backgroundColor: "{colors.marca}"
    textColor: "{colors.marca-texto}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1.5rem"
    height: "44px"
  boton-primario-hover:
    backgroundColor: "{colors.marca-hover}"
  insignia-aceptado:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ok-texto}"
    rounded: "{rounded.pastilla}"
  insignia-alerta:
    backgroundColor: "{colors.alerta-solido}"
    textColor: "{colors.marca-texto}"
    rounded: "{rounded.pastilla}"
  insignia-advertencia:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.adv-texto}"
    rounded: "{rounded.pastilla}"
  insignia-rechazado:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.rech-texto}"
    rounded: "{rounded.pastilla}"
  etiqueta-crisis:
    backgroundColor: "{colors.alerta-solido}"
    textColor: "{colors.marca-texto}"
    rounded: "{rounded.sm}"
    padding: "0.25rem 0.75rem 0.25rem 0.5rem"
  etiqueta-sospechoso:
    backgroundColor: "{colors.adv-fondo}"
    textColor: "{colors.adv-texto}"
    rounded: "{rounded.sm}"
    padding: "0.25rem 0.75rem 0.25rem 0.5rem"
  tarjeta-bitacora:
    backgroundColor: "{colors.rech-fondo}"
    textColor: "{colors.rech-texto}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
---

# Design System: Cardio Guard

Fuente de verdad: los tokens están en `public/style.css` (`:root` y el bloque `prefers-color-scheme: dark`). Este archivo los documenta; si cambian, se actualizan aquí. Los valores del frontmatter son los del modo claro; el modo oscuro se lista en Colores.

## Overview

**Creative North Star: "El tablero de enfermería"**

Una herramienta de turno: sobria, densa lo justo y legible de un vistazo, con luz de hospital (fondos fríos casi blancos, tinta azul muy oscura). La marca es un azul petróleo que nunca coincide con un color de estado, de modo que todo color de estado significa estado y nada más. El estado nunca se comunica solo con color: siempre lleva icono y texto.

Key Characteristics:
- Plana: profundidad con borde de 1 px y una sombra mínima, sin degradados ni halos.
- IBM Plex Sans para lectura; IBM Plex Mono solo para instrucciones, IDs y cifras.
- La alerta roja es, por tamaño, peso y relleno, lo más prominente de la página.
- Funciona igual en claro y oscuro (sigue `prefers-color-scheme`).

## Colors

Paleta neutra fría, una marca y cuatro colores de estado reservados.

### Primary
- **Azul petróleo** (#0f4c5c claro / #6fc3d6 oscuro): cabecera, botón de envío, pestaña activa, filtro activo, foco, enlaces del pie. Es la única voz de marca.

### Estado (reservados)
- **Verde, aceptado** (borde #1b6e3a, fondo #e6f4ea, texto #123d22).
- **Rojo, alerta** (relleno #b3261e, fondo #fde8e6, texto #5c0f0a).
- **Naranja, advertencia** (borde #8a5200, fondo #fff1d6, texto #4d2e00).
- **Gris, rechazado** (borde #5b6770, fondo #eceff1, texto #2a3338).
- Oscuro: cada estado invierte (fondo tenue oscuro, texto claro, borde luminoso); la alerta rellena pasa a #ff8a80 con texto #2a0805.

### Neutral
- **Fondo** #f4f7f8 / #0f1a1f; **Panel** #ffffff / #16252c; **Borde** #d3dce0 / #2c3f48; **Borde de campo** #667882 / #7a8d96; **Tinta** #14232b / #e6eef1; **Tinta suave** #465861 / #a9bac1; **Selección y hover** #cfe4ea / #24505c.

### Contrastes medidos (WCAG AA)
Texto: tinta suave sobre panel 7.4:1 (claro) y 7.9:1 (oscuro); texto de marca sobre marca 9.5:1 y 8.2:1; texto de alerta sólida 6.5:1 y 8.1:1; enlace del pie 9.5:1 y 7.8:1; texto en hover de pestañas 5.6:1 (tinta suave, claro) y 7.5:1 (tinta, oscuro). Bordes de campo contra panel 4.6:1 en ambos modos (mínimo 3:1 para controles).

Etiquetas clínicas (claro / oscuro), medidas sobre los tres fondos donde se usan: fila de la tabla (panel), ficha y tarjeta de bitácora (ambas sobre fondo verde `ok-fondo`).
- `CRISIS HIPERTENSIVA`: texto e icono sobre su relleno 6.5:1 / 8.1:1; relleno y borde contra panel 6.5:1 / 6.9:1 y contra `ok-fondo` 5.8:1 / 6.3:1.
- `DATO SOSPECHOSO`: texto e icono sobre su fondo 11.0:1 / 11.6:1; borde contra panel 6.4:1 / 8.4:1 y contra `ok-fondo` 5.6:1 / 7.6:1.
- Textos de apoyo de la tabla y la ficha: tinta sobre panel 16.1:1 / 13.4:1; tinta suave sobre panel 7.4:1 / 7.9:1; tinta suave sobre `ok-fondo` 6.5:1 / 7.1:1; texto verde sobre `ok-fondo` 10.8:1 / 11.2:1.
Todo supera 4.5:1 en texto y 3:1 en bordes, sin cambiar ningún token.

### Named Rules
**The Reserved Red Rule.** El rojo solo significa alerta. No se usa para errores de formulario, borrar, énfasis ni decoración. Los errores de entrada van en gris (rechazado), incluido el bloque del `^`. La única otra aparición del rojo es la etiqueta `CRISIS HIPERTENSIVA`, que nombra esa misma condición clínica.
**The Four Meanings Rule.** Verde, rojo, naranja y gris solo expresan estado; la marca (azul petróleo) nunca se mezcla con ellos.
**The Never Color Alone Rule.** Cada estado = color + icono + texto.

## Typography

**Texto:** IBM Plex Sans (400, 500, 600) con respaldo del sistema. **Mono:** IBM Plex Mono 400. Autoalojadas en `public/fonts/`.

**Character:** técnica y neutra; el mono marca lo que es dato o código del intérprete.

### Hierarchy
- **Título** (600, 1.75rem, 1.2): nombre en cabecera. En la alerta roja, la insignia también usa 1.75rem.
- **Dato** (mono 600, 1.375rem, 1.3): cifras del resumen, valores de lectura, ID del paciente.
- **Cuerpo** (400, 1rem, 1.5): texto general; 0.875rem para detalles y bitácora.
- **Etiqueta** (600, 0.8125rem, +0.04em, mayúsculas): títulos de sección y etiquetas de dato.

Escala: 0.8125 / 0.875 / 1 / 1.125 / 1.375 / 1.75 rem. Cifras con `tabular-nums`.

## Layout

Una columna centrada, ancho máximo 46rem, relleno 1.5rem × 1rem (0.75rem en móvil ≤ 30rem). Espaciado en escala de 0.25 a 3rem (`--esp-1`…`--esp-7`); grupos relacionados a 0.5–0.75rem, bloques separados a 1–1.5rem. Cabecera en banda de marca; pie pegado al borde inferior con la nota orientativa (pasa a pie normal con altura < 30rem). Cuadrículas con `auto-fit`; el resumen pasa de 4 a 2 columnas en móvil; las cinco pestañas se mantienen en una fila (letra de 0.8125rem hasta 30rem y 0.75rem hasta 22rem, con márgenes más ajustados a 320 px). Objetivos táctiles de 44 px mínimo. Revisado en 375, 768 y 1280 px, claro y oscuro, sin desborde horizontal; pestañas, tabla de listado y fechas con hora comprobadas también a 320 px.

## Elevation & Depth

Plana por defecto. Paneles con borde de 1 px y `--sombra-panel` (`0 1px 2px` y `0 2px 8px`, muy tenue); en oscuro, sin sombra. La jerarquía viene del grosor del borde: 1 px normal, 2 px resultado, 3 px tarjeta de alerta, 4 px panel de alerta.

## Shapes

Radios de 4 px (campos, botones), 8 px (paneles, tarjetas) y pastilla (insignias, chips, filtros). Estados vacíos con borde discontinuo. Sin bordes laterales de color.

## Components

### Insignia de estado
Pastilla con icono de trazo (círculo-check, octágono-exclamación, triángulo, círculo-x) y texto. Aceptado, advertencia y rechazado: fondo de panel, borde y texto del color de estado. Alerta: rellena (#b3261e), mayúsculas, peso 700, más grande. Se usa en el panel de resultado, la tarjeta y la ayuda.

### Panel de resultado ("Último resultado")
Borde de 2 px del color de estado y fondo tenue; cabecera con insignia, ID en mono y número de línea; cuadrícula de datos (sistólica, diastólica, frecuencia) sobre panel; motivo del rechazo o recomendación debajo. **Alerta:** borde de 4 px y cabecera rellena de rojo con insignia de 2.25rem; aparece al instante, sin animación. Los demás estados entran en 150 ms; `prefers-reduced-motion` anula todo movimiento.

### Tarjeta de bitácora
Más reciente arriba. Borde y fondo del estado; insignia, ID, número de línea (dos dígitos), instrucción en mono y detalles plegables (`<details>`). La alerta es más grande (relleno de 1rem, borde de 3 px). La lista se filtra por estado sin alterar los contadores.

### Pestañas de captura
ARIA tabs, cinco: "Registro" (paciente), "Lectura", "Consultar", "Listar" y "Directa". Los nombres completos van en el `title`. Flechas, Inicio y Fin navegan. Activa: subrayado de marca de 4 px y peso 600 (no solo color). Los campos solo arman el texto; no validan. "Consultar" tiene un campo de ID con `<datalist>`; "Listar" no tiene campos, solo una nota y el botón Procesar (la vista previa muestra `LISTAR`). El datalist de ID se alimenta de los pacientes de la sesión y de `resultado.pacientes` de `LISTAR`.

### Etiquetas clínicas
Rectángulo de 4 px de radio, borde de 2 px, texto en mayúsculas de 0.8125rem y peso 700, con icono de trazo: `CRISIS HIPERTENSIVA` (octágono-exclamación, relleno rojo, texto claro) y `DATO SOSPECHOSO` (triángulo, fondo y borde naranja). Pueden aparecer juntas. Cada una lleva su propio fondo y borde, así se lee igual sobre la fila de la tabla, la ficha y la tarjeta.
**Regla de uso:** la etiqueta describe la última revisión guardada del paciente y solo aparece en `CONSULTAR` y `LISTAR` (ficha, tarjeta de bitácora y fila de la tabla). No es el estado de la instrucción: el panel conserva su insignia verde «Aceptado». No se anima, no abre `role="alert"` y no sustituye a la ALERTA ROJA, que sigue siendo exclusiva del registro de una lectura en crisis. Siempre icono y texto, nunca solo color.

### Bloque del marcador "^"
Para rechazos léxicos y sintácticos: bloque monoespaciado (`<pre>`, IBM Plex Mono) con la instrucción tal como llegó y debajo una línea que termina en `^` bajo el carácter exacto del error. `white-space: pre`, sin ajuste de línea y sin recortar espacios (el `^` se desalinearía); si es largo, se desplaza dentro del bloque y es enfocable con teclado. Va en gris de rechazo, nunca en rojo. El motivo se escribe aparte, como texto normal bajo el bloque. Se usa en el panel, la tarjeta de bitácora y el ejemplo de la ayuda.

### Tabla de listado
Resultado de `LISTAR`: tabla con columnas ID (mono), Edad, Sexo, Sangre, Última revisión (presión y frecuencia, con la fecha y hora debajo) y Clasificación (categoría de presión, categoría de frecuencia «FC: …» y las etiquetas clínicas). Sobre panel, bordes de 1 px entre filas, encabezados en etiqueta de 0.8125rem, cifras con `tabular-nums`. Va en un contenedor desplazable en horizontal y enfocable (`role="region"`), así la página nunca desborda; la fecha con hora no se parte (`white-space: nowrap`). Pacientes sin lectura muestran «Sin revisiones». Sin pacientes: estado vacío con borde discontinuo, el texto «No hay pacientes registrados.» y el atajo «Registrar un paciente». Bajo la tabla va la nota orientativa.

### Ficha de paciente
Resultado de `CONSULTAR`: panel verde de estado aceptado con las etiquetas clínicas arriba (si las hay), cuadrícula de datos (edad, sexo, sangre, presión, frecuencia con su categoría y clasificación de presión), fecha y hora de la última revisión y la nota orientativa. Sin lecturas: «Sin revisiones registradas todavía.».

### Otros
Botón primario (marca, 44 px, estado "Procesando…" con giro), chips de ejemplo, filtros activos con relleno de marca, resumen de sesión con una marca de color sobre cada cifra, ayuda plegable y pantalla «Acerca de».

## Do's and Don'ts

### Do:
- **Do** usar el rojo únicamente para alerta; la alerta nunca se retrasa, se anima ni se tapa.
- **Do** combinar color, icono y texto en cada estado.
- **Do** mostrar siempre «carácter orientativo, no es diagnóstico médico» (pie y ayuda).
- **Do** medir el contraste de todo color nuevo (4.5:1 texto, 3:1 controles) en claro y oscuro.
- **Do** mantener la interfaz en español y aplicar `overflow-wrap: anywhere` a los textos que vienen del servidor.
- **Do** marcar como PENDIENTE lo que dependa de un endpoint inexistente.
- **Do** mantener separados el estado de la instrucción y la etiqueta clínica: `CONSULTAR` y `LISTAR` siguen en verde aunque el paciente tenga una etiqueta.
- **Do** explicar que las categorías de presión vienen de la NOM-030-SSA2-2017 y que «Crisis hipertensiva» se conserva por encima del grado 3 porque dispara la ALERTA ROJA.

### Don't:
- **Don't** usar los cuatro colores de estado como decoración o para la marca.
- **Don't** añadir historial, gráficas de tendencia ni datos que la API no entrega.
- **Don't** pintar de rojo o naranja el estado de una consulta o listado por la etiqueta clínica, ni usar las etiquetas fuera de `CONSULTAR` y `LISTAR`.
- **Don't** animar la alerta; el resto, máximo 150 ms y respetando `prefers-reduced-motion`.
- **Don't** usar bordes laterales de color, degradados, texto degradado ni sombras duras.

## Pantallas pendientes

- **Pantallas propias de lista y ficha de paciente**: PENDIENTES. Dependen de `GET /api/pacientes` y `GET /api/pacientes/:id`, que aún no existen. Hoy la ficha y la tabla son resultados de `CONSULTAR` y `LISTAR` (vía `POST /api/procesar`), no pantallas con ruta ni enlaces propios.
- **Sugerencias de ID desde el inicio**: PENDIENTE. Hoy el datalist solo conoce los pacientes de la sesión y los que devuelve `LISTAR`; con `GET /api/pacientes` se llenaría al cargar, incluidos los de sesiones anteriores. El único rastro es un `TODO` en `app.js`.
- Cuando existan los endpoints, la ficha seguirá mostrando solo la última revisión (sin historial ni tendencias).
