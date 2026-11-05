# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Personal de enfermería y clínico que captura lecturas de presión arterial y frecuencia cardíaca durante el turno. Necesita registrar rápido y saber al instante si una lectura requiere alerta. Contexto hospitalario. Audiencia secundaria: docente y compañeros de la materia que evalúan el proyecto.

## Product Purpose
Intérprete para el monitoreo de presión arterial y frecuencia cardíaca en entornos hospitalarios. Proyecto de la materia Lenguajes y Autómatas II. Éxito: una instrucción tecleada se valida, se clasifica y devuelve un resultado inequívoco (aceptado, advertencia, alerta o rechazado) con bitácora de auditoría.

## Positioning
La captura se hace con un lenguaje de instrucciones (`REGISTRAR P001, 45, M, O+` y `P001; 118/76, 75`) procesado por un intérprete real (lexer, parser, autómata finito y reglas semánticas), no con formularios de signos vitales. Cada entrada queda en una bitácora de auditoría.

## Operating Context
Servidor Express local (`npm start`, puerto 3000) que sirve `public/` y expone la API. Estado de sesión en memoria (contadores y numeración de línea del navegador se reinician al recargar). Persistencia en `data/pacientes.csv` y una bitácora `.txt` por ejecución del servidor.

## Capabilities and Constraints
- API fija: `POST /api/procesar` recibe `{ texto, numeroLinea }` y responde `{ resultado, lineasBitacora, contadores }`; `GET /api/estado` responde `{ fechaProcesamiento, archivoBitacora, contadores }`. No cambiar el contrato.
- `app.js` depende de `resultado.estado` y `lineasBitacora`; la numeración de línea y el cuerpo del POST no cambian.
- Solo existe la última revisión de cada paciente: sin historial ni gráficas de tendencia.
- `GET /api/pacientes` y `GET /api/pacientes/:id` aún no existen (pendiente de otro integrante, trabaja `src/`); no diseñar pantallas que dependan de ellos sin marcarlas como pendientes.
- Estados: ACEPTADO, ACEPTADO_CON_ALERTA, ACEPTADO_CON_ADVERTENCIA, ACEPTADO_CON_ALERTA_Y_ADVERTENCIA, RECHAZADO.
- Interfaz en español. Stack: HTML/CSS/JS estático servido por Express; sin frameworks.

## Brand Commitments
Nombre: Cardio Guard. Colores por estado obligatorios: verde = aceptado, rojo = alerta, naranja = advertencia, gris = rechazado. Debe mostrarse siempre la nota "carácter orientativo, no es diagnóstico médico".

## Evidence on Hand
Sin testimonios, métricas ni logotipo. Integrantes del equipo: pendiente de confirmar (marcador en la pantalla About us). No inventar datos de pacientes ni cifras.

## Product Principles
- El estado de una lectura debe entenderse de un vistazo y nunca solo por color.
- La alerta roja tiene prioridad absoluta: nada la retrasa ni la tapa.
- Resultado orientativo, no diagnóstico: la nota es parte permanente de la interfaz.
- Mostrar solo lo que la API ya da; lo que no existe se marca como pendiente.
- Sobrio y confiable por encima de llamativo.

## Accessibility & Inclusion
Contraste WCAG AA, respeto a `prefers-reduced-motion`, estado comunicado con texto e icono además del color, operable por teclado.
