# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Personal de enfermería y clínico que captura lecturas de presión arterial y frecuencia cardíaca durante el turno. Necesita registrar rápido y saber al instante si una lectura requiere alerta. Contexto hospitalario. Audiencia secundaria: docente y compañeros de la materia que evalúan el proyecto.

## Product Purpose
Intérprete para el monitoreo de presión arterial y frecuencia cardíaca en entornos hospitalarios. Proyecto de la materia Lenguajes y Autómatas II. Éxito: una instrucción (armada por campos o tecleada) se valida, se clasifica y devuelve un resultado inequívoco (aceptado, advertencia, alerta o rechazado) con bitácora de auditoría.

## Positioning
La captura se hace por campos (pestañas "Registro", "Lectura", "Consultar" y "Listar") o con la "Instrucción directa", pero siempre termina en el mismo lenguaje de instrucciones procesado por un intérprete real (lexer, parser, autómata finito y reglas semánticas):

| Instrucción | Qué hace | Cambia datos |
|---|---|---|
| `REGISTRAR P001, 45, M, O+` | Da de alta un paciente | Sí |
| `P001; 118/76, 75` | Registra una lectura (clasifica, compara y puede disparar la ALERTA ROJA) | Sí |
| `CONSULTAR P001` | Muestra la ficha del paciente y su última revisión | No |
| `LISTAR` | Muestra todos los pacientes en una tabla | No |

Los campos solo arman el texto de la instrucción; no son un formulario de signos vitales con validación propia. Cada entrada queda en una bitácora de auditoría.

## Operating Context
Servidor Express local (`npm start`, puerto 3000) que sirve `public/` y expone la API. Estado de sesión en memoria (contadores y numeración de línea del navegador se reinician al recargar). Persistencia en `data/pacientes.csv` y una bitácora `.txt` por ejecución del servidor.

## Capabilities and Constraints
- API fija: `POST /api/procesar` recibe `{ texto, numeroLinea }` y responde `{ resultado, lineasBitacora, contadores }`; `GET /api/estado` responde `{ fechaProcesamiento, archivoBitacora, contadores }`. No cambiar el contrato.
- `app.js` depende de `resultado.estado` y `lineasBitacora`; la numeración de línea y el cuerpo del POST no cambian.
- Solo existe la última revisión de cada paciente: sin historial ni gráficas de tendencia.
- `GET /api/pacientes` y `GET /api/pacientes/:id` aún no existen (pendiente de otro integrante, trabaja `src/`); no diseñar pantallas que dependan de ellos sin marcarlas como pendientes. La ficha y el listado de hoy salen de `POST /api/procesar` con `CONSULTAR` y `LISTAR`.
- `resultado` de `CONSULTAR` trae `paciente` (con `ultimaRevision` y `clasificacion`); el de `LISTAR` trae `total` y `pacientes`. Son campos dentro de `resultado`: el contrato de la API no cambia. Ambas instrucciones terminan en estado ACEPTADO (verde) y no modifican datos; un ID inexistente se rechaza (error semántico).
- Captura con cinco pestañas: "Registro" (ID, edad, sexo, sangre), "Lectura" (ID, sistólica, diastólica, frecuencia), "Consultar" (ID), "Listar" (sin campos, solo el botón) e "Instrucción directa" (campo único, para probar errores). Las etiquetas son cortas para que las cinco quepan en una fila desde 320 px; el nombre completo va como tooltip. Los campos son de texto simple (sin `type="number"` ni límites; Sexo y Tipo de sangre sugieren valores con `<datalist>` sin restringir) y no validan reglas clínicas ni de formato: solo se exige que no estén vacíos. Los ID de Lectura y Consultar sugieren los pacientes de la sesión y los que devuelve `LISTAR` (`resultado.pacientes`). Hay vista previa de la instrucción generada y se envía por el mismo `POST { texto, numeroLinea }`.
- Clasificación de presión: las categorías (Óptima, Subóptima, Limítrofe, Hipertensión grado 1, 2 y 3) vienen de la NOM-030-SSA2-2017. "Crisis hipertensiva" no es una categoría de la norma: se conserva por encima del grado 3 porque dispara la ALERTA ROJA y el autómata depende de ella. La frecuencia se clasifica como Bradicardia, Normal o Taquicardia.
- Etiquetas clínicas `CRISIS HIPERTENSIVA` y `DATO SOSPECHOSO`: describen la última revisión guardada del paciente en `CONSULTAR` y `LISTAR`. No son el estado de la instrucción, que sigue ACEPTADO. Cada una lleva icono y texto, y pueden aparecer juntas.
- Un rechazo léxico o sintáctico se muestra con la instrucción tal como llegó y una marca `^` bajo el punto del error, más el motivo como texto aparte.
- Solo se capturan los datos que el sistema guarda: ID, edad, sexo, tipo de sangre y la última lectura. No se piden nombre, teléfono, dirección, médico ni historial.
- Estados: ACEPTADO, ACEPTADO_CON_ALERTA, ACEPTADO_CON_ADVERTENCIA, ACEPTADO_CON_ALERTA_Y_ADVERTENCIA, RECHAZADO.
- Interfaz en español. Stack: HTML/CSS/JS estático servido por Express; sin frameworks.

## Brand Commitments
Nombre: Cardio Guard. Colores por estado obligatorios: verde = aceptado, rojo = alerta, naranja = advertencia, gris = rechazado. Debe mostrarse siempre la nota "carácter orientativo, no es diagnóstico médico".

## Evidence on Hand
Sin testimonios, métricas ni logotipo. Los integrantes del equipo se muestran en la pantalla About us. No inventar datos de pacientes ni cifras.

## Product Principles
- El estado de una lectura debe entenderse de un vistazo y nunca solo por color.
- El formulario no valida: el intérprete es la única autoridad que acepta o rechaza un valor.
- La alerta roja tiene prioridad absoluta: nada la retrasa ni la tapa.
- Resultado orientativo, no diagnóstico: la nota es parte permanente de la interfaz.
- El estado dice qué pasó con la instrucción; la etiqueta clínica dice qué muestra la última revisión del paciente. Nunca se confunden: consultar a un paciente en crisis es una consulta aceptada.
- Mostrar solo lo que la API ya da; lo que no existe se marca como pendiente.
- Sobrio y confiable por encima de llamativo.

## Accessibility & Inclusion
Contraste WCAG AA, respeto a `prefers-reduced-motion`, estado comunicado con texto e icono además del color, operable por teclado (cinco pestañas con flechas, Inicio y Fin; campos vacíos señalados por campo y anunciados; tabla de listado desplazable con teclado), sin desborde horizontal de la página a 320 y 375 px.
