# Cardio Guard — Documento de contexto del proyecto

**Propósito de este documento:** este archivo reúne todo lo que el equipo ha definido hasta ahora sobre Cardio Guard (diseño, documentación, estado de la presentación y plan de programación), para que cualquier IA que apoye a algún integrante del equipo tenga el mismo contexto y no proponga cambios que contradigan lo ya decidido. Si un integrante avanza algo nuevo con su IA, se debe actualizar este documento y compartirlo con el otro integrante.

**Materia:** Lenguajes y Autómatas II.
**Tipo de proyecto elegido:** Intérprete (de las tres opciones: compilador, intérprete o traductor).
**Problema que resuelve:** validación y evaluación de lecturas de presión arterial y frecuencia cardíaca de pacientes hospitalarios, con registro de pacientes y seguimiento contra su última revisión.
**Estado general:** el diseño y la documentación están cerrados. La presentación ya se expuso (ver sección 12). La **versión 1 del código ya está programada y probada de punta a punta** (ver secciones 13 y 14): las ocho piezas (lexer, parser, AFD, los tres módulos de semántica, storage, interpreter y server+interfaz web) están implementadas, probadas por separado y en conjunto, y empaquetadas listas para correr con `npm install && npm start`.

---

## 1. Descripción general

Cardio Guard es un intérprete que procesa instrucciones en texto plano, una por línea, desde consola, desde un archivo `.txt` o, en la versión que se va a programar, desde una interfaz web. Reconoce dos tipos de instrucción:

1. **Registrar un paciente** (`REGISTRAR`).
2. **Evaluar una lectura** de presión arterial y frecuencia cardíaca de un paciente ya registrado.
3. **Consultar** (`CONSULTAR`) los datos y la última revisión de un paciente, o **listar** (`LISTAR`) todos los pacientes registrados. Ambas son de solo lectura: no modifican `pacientes.csv`.

Cada instrucción pasa por análisis léxico, sintáctico y semántico, y su flujo es controlado por un **autómata finito determinista (AFD)** que decide si se acepta o se rechaza. El sistema **no** genera código ni traduce a otro lenguaje: actúa directamente sobre cada instrucción (valida, clasifica, compara, alerta, guarda), que es la razón por la que se eligió un intérprete y no un compilador o traductor.

---

## 2. Alcances (versión vigente)

1. Validación léxica y sintáctica mediante tokens.
2. Motor de reglas semánticas: coherencia clínica de las lecturas (sistólica > diastólica, sin ceros/negativos, rangos fisiológicos) y validez de los datos del paciente al registrarlo (ID único, edad, sexo, tipo de sangre).
3. Modelado con AFD que controla el flujo completo de cada instrucción.
4. Registro de pacientes mediante la instrucción `REGISTRAR`.
5. Clasificación clínica y alertas automáticas (crisis hipertensiva = ALERTA ROJA; valores extremos = advertencia de dato sospechoso, ver sección 7).
6. Comparación de la lectura actual contra la última revisión del paciente (positivo / negativo / sin cambio, ver sección 7).
7. Avisos y recomendaciones orientativas (no es diagnóstico médico).
8. Persistencia en archivo `.csv` de pacientes.
9. Consulta de un paciente (`CONSULTAR`) y listado de pacientes (`LISTAR`), de solo lectura.
10. Bitácora de auditoría: se muestra en consola/interfaz **y** se guarda en un archivo nuevo por cada ejecución.

## 3. Limitaciones (versión vigente)

1. Dependencia de formato estricto: cualquier entrada que no cumpla la sintaxis se rechaza.
2. **Comparación limitada a la última revisión únicamente.** El sistema **no** guarda historial completo de lecturas; cada lectura aceptada **reemplaza** la revisión anterior en el archivo de pacientes.
3. Alcance clínico acotado: solo presión arterial y frecuencia cardíaca.
4. Entrada manual, sin conexión a dispositivos o sensores.
5. Almacenamiento en archivos `.csv`/`.txt`, sin las capacidades de una base de datos real (sin consultas complejas, control de acceso ni uso simultáneo robusto; ver nota de concurrencia en sección 14).
6. Carácter orientativo: las alertas y recomendaciones no sustituyen la valoración de un médico.

> ⚠️ **Importante para la IA que lea esto:** en una versión preliminar de los *Objetivos* (ya corregida, ver sección 10) se mencionaba un "módulo de historial" y comparación contra el historial completo. Eso **fue descartado**. La decisión final y vigente es comparar solo contra la última revisión (punto 2 de esta sección). No reintroducir el historial completo salvo que el equipo lo pida explícitamente.

---

## 4. Lenguaje del intérprete

### 4.1 Instrucciones

Cuatro instrucciones, que pueden mezclarse en el mismo archivo, consola o interfaz web:

```
REGISTRAR P001, 45, M, O+       <- da de alta a un paciente
P001; 118/76, 75                <- evalúa una lectura del paciente P001
CONSULTAR P001                  <- muestra los datos y la última revisión de P001
LISTAR                          <- muestra todos los pacientes registrados
```

`CONSULTAR` exige un ID y `LISTAR` no admite argumentos (ej. `LISTAR P001` o `CONSULTAR` sin ID son errores de sintaxis con marcador `^`). Las palabras reservadas distinguen mayúsculas, igual que `REGISTRAR`.

- El **ID del paciente** se forma con la letra **P** seguida de dígitos (ej. P001).
- El **sexo** se captura como una letra (M/F); la validez real (M o F) la revisa el analizador semántico, no el léxico.
- El **tipo de sangre** se captura como letras con signo + o -; el conjunto válido es {A+, A-, B+, B-, AB+, AB-, O+, O-}.

### 4.2 Tokens

`REGISTRAR`, `CONSULTAR`, `LISTAR` (palabras reservadas), `ID`, `NUM`, `SEXO`, `SANGRE`, `/`, `,`, `;`, `-` (el guion es un token propio para poder detectar casos como `120/-80`).

### 4.3 Gramática

```
S   -> REG | LEC | CON | LIS
REG -> registrar id , num , sexo , sangre
LEC -> id ; P , F
P   -> num / num
F   -> num
CON -> consultar id
LIS -> listar
```

> Nota: esta gramática **no** está en notación BNF estricta (con `::=`, símbolos entre `< >`, etc.), es una forma simplificada tipo producción. Si el profesor pide BNF formal, hay que reescribirla con esa notación exacta, pero el contenido (reglas, no terminales) es el que está vigente.

### 4.4 Árboles sintácticos

**`REGISTRAR P001, 45, M, O+`:**
```
S
└── REG
    ├── registrar
    ├── id      (P001)
    ├── ,
    ├── num     (45)
    ├── ,
    ├── sexo    (M)
    ├── ,
    └── sangre  (O+)
```

**`P001; 118/76, 75`:**
```
S
└── LEC
    ├── id      (P001)
    ├── ;
    ├── P
    │   ├── num (118)
    │   ├── /
    │   └── num (76)
    ├── ,
    └── F
        └── num (75)
```

**`CONSULTAR P001`:**
```
S
└── CON
    ├── consultar
    └── id      (P001)
```

**`LISTAR`:**
```
S
└── LIS
    └── listar
```

---

## 5. Archivos del sistema

| Archivo | Función | Se modifica |
|---|---|---|
| `lecturas.txt` | Entrada con las instrucciones `REGISTRAR` y las lecturas (modo archivo/consola). | No, solo se lee |
| `pacientes.csv` | "Base de datos" de pacientes y su última revisión. | Sí, con cada instrucción aceptada |
| `bitacora_FECHA_HORA.txt` | Reporte de auditoría de cada ejecución. | Se crea uno nuevo cada vez (nunca se sobrescribe; el nombre incluye fecha y hora para evitar choques si se ejecuta más de una vez el mismo día) |

**Estructura de `pacientes.csv`:**
```
id,edad,sexo,sangre,fecha_revision,sistolica,diastolica,frecuencia
P001,45,M,O+,2026-11-04 18:30,118,76,75
P004,30,F,O+,,,,
```
Las primeras 4 columnas se capturan al registrar. Las últimas 4 corresponden a la **última revisión aceptada**; van vacías si el paciente no tiene revisión previa. La **fecha y hora** (`YYYY-MM-DD HH:MM`, hora local) las asigna el sistema en el momento de procesar **cada** lectura (no se escriben en la instrucción). Por compatibilidad, la columna `fecha_revision` admite también filas antiguas que solo traen fecha (`2026-09-18`): se leen, se muestran y se reescriben tal cual, sin migrarlas.

**Decisión descartada:** en una etapa anterior del diseño se consideró que todos los datos del paciente y de su última revisión viajaran dentro de cada línea de lectura (sin archivo de pacientes aparte). Se descartó por ser poco realista para un hospital. La decisión final es la de un archivo `pacientes.csv` consultado y actualizado por el programa.

---

## 6. Flujo de procesamiento

### 6.1 Registro de un paciente (`REGISTRAR id, edad, sexo, sangre`)
1. Análisis léxico y sintáctico: verifica la estructura.
2. Análisis semántico: ID no repetido, edad en rango válido, sexo y tipo de sangre válidos.
3. Si es correcto: se agrega a `pacientes.csv` con los campos de última revisión vacíos.
4. Se anota el resultado en la bitácora. Si falla algo, el paciente no se agrega.

### 6.2 Evaluación de una lectura (`id; sistólica/diastólica, pulso`)
1. Recepción de la línea.
2. Análisis léxico: tokens.
3. Análisis sintáctico: valida contra la gramática. Si falla → **rechazo** (error de sintaxis).
4. Búsqueda del paciente en `pacientes.csv` por su ID. Si no existe → **rechazo** (paciente no encontrado).
5. Análisis semántico: sistólica > diastólica, sin ceros/negativos, valores dentro del rango fisiológico posible. Si falla → **rechazo**.
6. Clasificación clínica (ver sección 7): determina la categoría de presión y de frecuencia; si corresponde, dispara ALERTA ROJA (crisis) o ADVERTENCIA (dato sospechoso).
7. Comparación contra la última revisión guardada (ver sección 7: positivo / negativo / sin revisión previa).
8. Avisos y recomendaciones orientativas según la clasificación y el cambio.
9. Actualización: la lectura aceptada **reemplaza** la revisión anterior en `pacientes.csv`, guardando la fecha y hora locales de ese momento.
10. Se anota el resultado en la bitácora.

Si la línea se rechaza en los pasos 3, 4 o 5, el AFD pasa a estado de rechazo, se anota el motivo, `pacientes.csv` **no se modifica**, y el programa continúa con la siguiente línea.

### 6.3 Consulta de un paciente (`CONSULTAR id`)
1. Análisis léxico y sintáctico (AFD: `INICIO` → `BUSCANDO_PACIENTE_CONSULTA`). Si falla → rechazo con marcador `^`.
2. Análisis semántico (`validarConsulta`): el paciente debe existir. Si no → rechazo (`Error Semántico: paciente Pxxx no encontrado.`).
3. Se muestran edad, sexo, tipo de sangre y la última revisión con su fecha/hora, su **categoría de presión (NOM-030, 7.1)**, su **categoría de frecuencia (7.2)** y, si aplica, `[CRISIS HIPERTENSIVA]` y/o `[DATO SOSPECHOSO]` (o "sin revisiones previas", sin categoría). La clasificación se calcula con las mismas funciones de `clasificacion.js` (`describirRevision`, `esDatoSospechoso`). Estado final: `ACEPTADO`.
4. Se anota en la bitácora. **`pacientes.csv` no se modifica.**

### 6.4 Listado de pacientes (`LISTAR`)
1. Análisis léxico y sintáctico (AFD: `INICIO` → `LISTANDO`). `LISTAR` con cualquier texto después es error de sintaxis.
2. No hay validación semántica de datos. Se muestra una línea por paciente, en orden de registro, con su última revisión y las mismas categorías y avisos que en `CONSULTAR` (6.3). Estado final: `ACEPTADO`.
3. **Decisión:** si no hay pacientes, el listado **no es un error**: se acepta con el mensaje "No hay pacientes registrados.".
4. Se anota en la bitácora. **`pacientes.csv` no se modifica.**

---

## 7. Clasificación clínica, alertas y comparación (vigente)

### 7.1 Categorías de presión arterial

Basado en la **NOM-030-SSA2-2017** (Norma Oficial Mexicana para la prevención, detección, diagnóstico, tratamiento y control de la hipertensión arterial sistémica). **Decisión del equipo (noviembre 2026):** se cambió desde la guía AHA/ACC 2017 a la NOM-030, por ser la norma oficial del país donde se haría el proyecto (ver sección 15).

| Categoría | Sistólica | | Diastólica | Nivel de severidad |
|---|---|---|---|---|
| Óptima | < 120 | y | < 80 | 0 |
| Subóptima | 120–129 | o | 80–84 | 1 |
| Limítrofe | 130–139 | o | 85–89 | 2 |
| Hipertensión grado 1 | 140–159 | o | 90–99 | 3 |
| Hipertensión grado 2 | 160–179 | o | 100–109 | 4 |
| Hipertensión grado 3 | ≥ 180 | o | ≥ 110 | 5 |
| **Crisis hipertensiva** | > 180 | o | > 120 | 6 |

Si la sistólica y la diastólica caen en categorías distintas, se usa la **categoría más alta de las dos** (ej. 125/85 → Limítrofe, por la diastólica).

Notas sobre la tabla:
- **"Crisis hipertensiva" no es una categoría de la NOM-030.** Se conservó encima de grado 3, con el mismo umbral que ya tenía el proyecto (> 180 o > 120), porque es la que dispara la ALERTA ROJA (sección 7.4) y el AFD depende de ella. Ejemplo: 180/110 es grado 3; 181/110 o 170/121 ya es crisis.
- **"Hipertensión sistólica aislada" (≥ 140 y < 90) de la NOM-030 no se agregó como categoría aparte:** con la regla de "la más alta de las dos" cae en el grado de su sistólica (ej. 150/80 → grado 1).
- **La nota de la norma sobre pacientes con diabetes o insuficiencia renal (meta < 130/85) no se aplica**, porque el sistema no captura esos datos al registrar. Agregarlo requeriría un campo nuevo en `REGISTRAR` y cambiar la gramática.
- Con la tabla anterior (AHA/ACC), 120/80 salía como "Hipertensión etapa 1"; con la NOM-030 es "Subóptima".

### 7.2 Categorías de frecuencia cardíaca (pulso en reposo)

| Categoría | Pulso (lpm) | Nivel de severidad |
|---|---|---|
| Bradicardia | < 60 | 1 |
| Normal | 60–100 | 0 |
| Taquicardia | > 100 | 1 |

### 7.3 Criterio de cambio positivo/negativo

Se calcula el **nivel de severidad** (tablas 7.1 y 7.2) de la lectura actual y el de la última revisión, por separado para presión y para frecuencia, y se comparan:

- Nivel bajó → esa parte **mejoró**.
- Nivel subió → esa parte **empeoró**.
- Nivel igual → esa parte **sin cambio** (aunque los números exactos difieran).

**Regla de combinación (conservadora, pensada para no dar falsa tranquilidad al paciente):**
- Si **cualquiera de los dos (presión o frecuencia) empeoró** → cambio general **NEGATIVO**.
- Si ninguno empeoró y **al menos uno mejoró** → cambio general **POSITIVO**.
- Si ninguno cambió → **SIN CAMBIO**.

Si el paciente no tiene revisión previa, no se compara y se indica "primera revisión registrada".

### 7.4 Presión fuera de rango fisiológico ("dato sospechoso")

Cuando sistólica > 250 o diastólica > 150 (el límite de rechazo ya definido en la sección 8), la decisión final es: **no se rechaza**. La lectura se acepta, se guarda y se compara igual que cualquier otra, pero se agrega un aviso de **"dato sospechoso, verificar captura"**.

Esto deja tres posibles resultados dentro de "aceptado":

| Situación | Estado | Significado |
|---|---|---|
| Presión/frecuencia dentro de rango normal o categorías normales de riesgo | Aceptado | Lectura sin observaciones |
| Clasificación de riesgo = crisis hipertensiva (tabla 7.1) | Aceptado con alerta | ALERTA ROJA, protocolo de emergencia |
| Sistólica > 250 o diastólica > 150 | Aceptado con advertencia | "Dato sospechoso, verificar captura" |

Es posible que una lectura sea **ambas cosas a la vez** (ej. sistólica 260, que es crisis y además dato sospechoso). En ese caso se muestran **ambos avisos** en la misma línea de la bitácora; no se contradicen.

**Decisión descartada:** se consideró rechazar directamente la lectura cuando el valor es fisiológicamente extremo (Opción A). Se descartó porque el sistema ya maneja el concepto de "aceptado con alerta" (crisis), y porque un valor extremo real (aunque poco común, ej. una frecuencia muy alta que el paciente no percibió) no debe perderse sin dejar rastro.

---

## 8. Manejo de errores (vigente)

### Léxicos/sintácticos (todas las instrucciones)
- Símbolo no reconocido → Error Léxico → rechazo.
- Estructura de tokens inválida (ej. `120/-80`) → Error de Sintaxis → rechazo.
- **Marcador de posición (como un compilador):** estos dos errores muestran dónde está la falla. En la bitácora y en la interfaz web el rechazo se ve así:
  ```
  [LÍNEA 03] P002; 120/-80, 75 -> ESTADO: Rechazado
     Error de Sintaxis en la línea 3: Estructura de tokens inválida
     P002; 120/-80, 75
               ^ se esperaba un número positivo después de la diagonal
  ```
  El `^` es **uno solo** (no cubre todo el token) y va bajo el primer carácter de la falla; si falta algo al final de la línea (ej. `P001; 120/80,`), queda justo después del último carácter. El encabezado es genérico ("Estructura de tokens inválida" / "Símbolo no reconocido") y el motivo específico va junto al `^`. En la web se dibuja en un bloque monoespaciado que respeta los espacios.

### Semánticos en lecturas
- Paciente no encontrado en `pacientes.csv` → rechazo.
- Diastólica > sistólica → rechazo.
- Valores nulos o negativos (sistólica, diastólica o frecuencia ≤ 0) → rechazo.
- Presión fuera de rango fisiológico (sistólica > 250 o diastólica > 150) → **no se rechaza**: se acepta con advertencia de "dato sospechoso" (ver sección 7.4).
- Frecuencia fuera de rango (< 30 o > 220) → rechazo.

### Semánticos en consultas
- `CONSULTAR` de un paciente que no existe en `pacientes.csv` → rechazo (error semántico, sin marcador `^`, igual que una lectura de paciente inexistente).
- `LISTAR` no tiene errores semánticos (un listado vacío se acepta, ver 6.4).

### Semánticos en el registro de pacientes
- ID vacío o duplicado → rechazo del registro.
- Edad fuera de rango (< 0 o > 120) → rechazo del registro.
- Sexo no reconocido (no es M ni F) → rechazo del registro.
- Tipo de sangre no reconocido → rechazo del registro.

**Error descartado:** "fecha de revisión futura" ya no aplica como antes, porque el sistema asigna la fecha automáticamente (no se captura en la instrucción). Se eliminó de la tabla de errores vigente.

---

## 9. Ejemplo de ejecución de referencia

**Entrada (`lecturas.txt`):**
```
REGISTRAR P001, 45, M, O+
REGISTRAR P002, 58, F, A+
P001; 130/85, 72
P001; 118/76, 75
REGISTRAR P001, 50, M, A+
REGISTRAR P003, 150, M, B+
P002; 190/125, 110
P002; 120/-80, 75
P009; 120/80, 70
```

**Resultado esperado (resumen):** P001 y P002 se registran correctamente. P001 recibe dos lecturas válidas (la segunda reemplaza a la primera en el archivo; con las categorías de la sección 7, 130/85 es Limítrofe (nivel 2) y 118/76 es Óptima (nivel 0), por lo que el cambio es POSITIVO). El reintento de registrar P001 se rechaza por ID duplicado. P003 se rechaza por edad inválida (150). P002 recibe una lectura con ALERTA ROJA (190/125, válida y se guarda). La misma P002 tiene una lectura con error de sintaxis (`120/-80`). P009 se rechaza por paciente no encontrado. Al final, `pacientes.csv` solo contiene a P001 y P002 con sus últimas lecturas aceptadas.

En la bitácora, el rechazo de `P002; 120/-80, 75` incluye el marcador `^` bajo el guion (ver sección 8).

(El detalle completo de la bitácora línea por línea está en el documento Word `Cardio_Guard_Documentacion.docx`, sección 9. Ese documento se redactó antes de definir las categorías de la sección 7 de este archivo, así que los nombres de clasificación que usa ahí son ilustrativos; las categorías vigentes son las de la sección 7.)

---

## 10. Objetivos del proyecto (versión corregida y vigente)

**Importante:** la primera versión de los objetivos (la que aparece en el primer avance de la presentación) contenía incoherencias con el resto del proyecto (mencionaba "historial completo" y "gramática BNF formal"). La versión corregida y vigente es esta:

**Objetivo general:**
> Desarrollar un intérprete que valide, clasifique y compare lecturas de presión arterial y frecuencia cardíaca de pacientes hospitalarios, aplicando los principios de lenguajes formales y autómatas para garantizar la integridad de los datos clínicos y apoyar la toma de decisiones médicas.

**Objetivos particulares:**
- Definir el alfabeto, los tokens y la gramática que describen el lenguaje de instrucciones del sistema.
- Desarrollar un motor de reglas semánticas que valide la coherencia fisiológica de los datos (relación sistólica/diastólica, rangos válidos de presión, frecuencia y edad, entre otros).
- Modelar el flujo de evaluación de cada instrucción mediante un autómata finito determinista.
- Comparar cada lectura con la última revisión del paciente, para identificar si hubo una mejora o un empeoramiento.
- Establecer un catálogo de errores semánticos que permita identificar y reportar con claridad las inconsistencias detectadas.
- Permitir el registro de pacientes y la persistencia de su información en archivos.

> ⚠️ Esta corrección **todavía no se ha aplicado** en el documento Word completo (`Cardio_Guard_Documentacion.docx`), solo en el contenido de la presentación. Queda pendiente actualizarla ahí también.

---

## 11. Documentación ya generada

1. **`Cardio_Guard_Documentacion.docx`** — documento técnico completo (portada, descripción, objetivos *sin corregir aún*, alcances, limitaciones, funciones y características, lenguaje del intérprete, archivos, flujo de procesamiento, manejo de errores, ejemplo de ejecución). Es la fuente de verdad del diseño técnico original; las categorías clínicas de la sección 7 de este documento son posteriores y más detalladas.
2. **Resumen/Abstract** (español e inglés) — ya redactado, versión breve.
3. **Introducción** — ya redactada, versión breve.
4. **Ventajas y desventajas** — 5 y 5, ya redactadas.
5. **Características principales del tema** — 10 puntos, ya redactadas.
6. **Marco teórico** — con sus 5 apartados (A–E), elaborado por el otro integrante con su propia IA (enfoque en máquinas de estados finitos sobre expedientes médicos y validación con expresiones regulares). Incluye referencias en APA.
7. **Guion de exposición** (versión breve, sin repetir entre secciones lo ya dicho en el abstract) — ya redactado para Abstract, Introducción, Objetivos, Ventajas/desventajas y las primeras 5 Características. Las últimas 5 Características y el Marco Teórico están a cargo del otro integrante.
8. **Presentación (diapositivas) traducida al inglés** — ya se tradujo el contenido completo de la primera versión de la presentación (confirmado por el profesor que la presentación debía entregarse en inglés, exponiendo en español). Al traducir se detectaron y corrigieron dos problemas en la diapositiva de referencias del Marco Teórico: texto de relleno ("Lorem ipsum...") que quedó pegado después de cada referencia, y un apellido de autor mal transcrito en una de las citas. También se identificó que una de las referencias (HL7 EHR-S FM — Dental Health Functional Profile) es una fuente real pero de tema poco relacionado (funcionalidad de expedientes dentales); se marcó para que el equipo la revise.

---

## 12. Estado de la presentación (ya expuesta)

- **Idioma confirmado:** inglés (el profesor lo confirmó). El contenido de las diapositivas se tradujo completo; la exposición oral se hizo en español, con un guion breve preparado para evitar repetir entre secciones lo que ya se dijo en el abstract.
- **`CONSULTAR` y `LISTAR` (noviembre 2026):** instrucciones de solo lectura, con sus propios estados/eventos en el AFD (`BUSCANDO_PACIENTE_CONSULTA`, `LISTANDO`; eventos `LEXICO_SINTACTICO_OK_CON/LIS`, `CONSULTA_PACIENTE_ENCONTRADO/NO_ENCONTRADO`, `LISTADO_OK`) separados de los de las lecturas, y terminan en el mismo `ACEPTADO`/`RECHAZADO` (sin alerta ni advertencia). Decisiones: (a) `LISTAR` vacío se acepta con "No hay pacientes registrados."; (b) ambas se escriben en la bitácora y cuentan en los contadores de la interfaz; (c) `LISTAR` no admite filtros ni argumentos. `pacientesRepo.listar()` regresa **copias**, no las referencias internas (mismo patrón de bug de arriba). Pruebas añadidas en todos los `tests/*.manual.js` relevantes, incluida la verificación de que `pacientes.csv` no cambia.
- **Reparto de trabajo:** un integrante preparó Resumen, Introducción, Objetivos, Ventajas/desventajas y Características (con guion de exposición). El otro integrante preparó el Marco Teórico.
- **Formato de diapositivas:**
  - Portada: título, subtítulo, materia, integrantes, profesor, fecha.
  - Índice.
  - Resumen: 4 viñetas cortas.
  - Introducción: frase introductoria + 3 viñetas.
  - Objetivos: frase introductoria (general) arriba + viñetas (particulares) abajo.
  - Ventajas y desventajas: una diapositiva, dos columnas.
  - Características principales: repartidas en 2 diapositivas (5 y 5).
  - Marco teórico: 5 diapositivas (A–E), a cargo del otro integrante.
  - Referencias bibliográficas.
  - Cierre ("Thank You").

---

## 13. Lenguaje y arquitectura de programación (decisión tomada)

**Tecnología elegida:** JavaScript, dividido en dos partes:

- **Backend: Node.js.** Aquí vive el intérprete completo (léxico, sintáctico, semántico, AFD) y el manejo de archivos (`pacientes.csv`, bitácora). Se eligió Node.js y no JavaScript de navegador porque el navegador no tiene acceso libre al sistema de archivos, y el diseño del proyecto depende de leer y escribir archivos reales.
- **Comunicación backend-frontend: Express** (o framework similar de Node.js), para exponer el intérprete mediante peticiones HTTP.
- **Frontend: HTML + CSS + JavaScript de navegador.** Una página con un formulario donde se escribe una instrucción (`REGISTRAR ...` o una lectura), un botón para enviarla, y un área que muestra el resultado al instante (aceptado, aceptado con alerta, aceptado con advertencia, rechazado), sin recargar la página.

**Arquitectura:**
```
Navegador (HTML + JS)  <-- HTTP -->  Servidor Node.js + Express
  - Formulario                         - Lexer, Parser, Semántica, AFD
  - Muestra resultado                  - Lee/escribe pacientes.csv
                                        - Escribe bitácora
```

**Decisión descartada:** hacer todo en JavaScript de navegador (sin Node.js), guardando los datos con `localStorage`/`IndexedDB` en vez de archivos. Se descartó porque contradice el diseño ya documentado (persistencia en archivos `.csv`/`.txt` reales, consultables fuera del navegador).

La entrada por archivo `.txt`/consola (diseño original) y la entrada por interfaz web son dos formas de usar el mismo intérprete; no se excluyen entre sí. El intérprete (`interpreter.js`, ver sección 14) debe ser independiente de cómo le llega la instrucción. **Nota:** por ahora solo se implementó la entrada por interfaz web (sección 14); el modo consola/archivo sigue siendo parte del diseño pero no se ha programado todavía (ver sección 16).

### 13.1 Cómo se numera "la línea" sin un archivo (decisión tomada)

El concepto de "línea X" (usado en los mensajes de error y en la bitácora) venía del diseño original, pensado para un archivo `.txt` con líneas numeradas. En la interfaz web no hay un archivo: la persona escribe una instrucción a la vez en un formulario. Se decidió que **el navegador lleve su propia numeración**: cada vez que alguien manda una instrucción desde la página, el frontend (`public/app.js`) le asigna el siguiente número (1, 2, 3...) y se lo manda al servidor junto con el texto. Esa numeración se reinicia si la persona recarga la página. El servidor no lleva ningún estado para esto; solo confía en el número que le llega en cada petición.

### 13.2 Qué cuenta como "una ejecución" para la bitácora, en el servidor (decisión tomada)

En el diseño original, "una ejecución" era clara: el programa corría una vez sobre un lote completo de instrucciones, y al terminar se cerraba una sola bitácora. Un servidor web no termina solo: se queda corriendo indefinidamente. Se decidió que **"una ejecución" equivale a "una vez que arranca el servidor"**: al iniciar `server.js` se crea una sola bitácora (con su nombre `bitacora_FECHA_HORA.txt`), y todas las instrucciones que lleguen de cualquier persona mientras el servidor siga corriendo se agregan a esa misma bitácora. Si el servidor se reinicia, se crea una bitácora nueva.

Nota: lo único que depende del arranque es la bitácora; la fecha y hora de cada revisión se toman por instrucción (ver 14.3).

**Alternativa descartada:** una bitácora nueva por día (más parecido a un log de auditoría real que corre de forma continua). Se descartó porque el equipo solo piensa tener el servidor encendido ratos cortos (hasta ~30 minutos, para hacer pruebas), no de forma continua por días, así que no aporta nada frente a la opción más simple.

---

## 14. Estructura del código (implementada — versión 1 completa)

```
cardio-guard/
│
├── package.json                    <- dependencia: express
├── README.md                       <- instalación, cómo correr, estructura, pruebas
├── .gitignore                      <- excluye node_modules/ y data/
│
├── data/                           <- NO se versiona; se crea solo al correr el servidor
│   ├── pacientes.csv                  (se crea automáticamente si no existe)
│   └── bitacoras/
│       └── bitacora_FECHA_HORA.txt    (una por cada arranque del servidor, ver 13.2)
│
├── src/
│   ├── lexer/lexer.js              <- cadena -> tokens
│   ├── parser/parser.js            <- tokens -> árbol (REG, LEC, CON o LIS) / error de sintaxis
│   ├── semantics/
│   │   ├── validarRegistro.js
│   │   ├── validarLectura.js
│   │   ├── validarConsulta.js      <- CONSULTAR: el paciente debe existir
│   │   └── clasificacion.js        <- tablas de la sección 7 (categorías, severidad, comparación)
│   ├── automaton/afd.js            <- tabla de transiciones del AFD
│   ├── diagnostico.js              <- arma la instrucción + línea del "^" para errores léxicos/sintácticos
│   ├── storage/
│   │   ├── pacientesRepo.js        <- leer/escribir pacientes.csv
│   │   └── bitacoraRepo.js         <- crear/escribir bitácora
│   ├── interpreter.js              <- orquesta: línea de texto -> resultado final
│   └── server.js                   <- servidor Express, expone el intérprete como API
│
├── public/                         <- frontend
│   ├── index.html                     formulario + resumen en vivo + historial de tarjetas
│   ├── style.css                      colores por estado (verde/rojo/naranja/gris)
│   └── app.js                         numera instrucciones (ver 13.1) y llama a /api/procesar
│
└── tests/                          <- scripts manuales (ver 14.4), no usan un framework todavía
    ├── lexer.manual.js
    ├── parser.manual.js
    ├── afd.manual.js
    ├── semantics.manual.js
    ├── storage.manual.js
    ├── diagnostico.manual.js       <- el marcador "^" (posición, final de línea, tabs)
    └── interpreter.manual.js       <- prueba de integración completa, reproduce la sección 9
```

**Entrega:** el proyecto completo está empaquetado en un .zip (`cardio-guard.zip`), compartido aparte de este documento, listo para `npm install && npm start`.

**Principio de diseño (aplicado tal cual):** `interpreter.js` recibe una línea de texto y la pasa, en orden, por lexer → parser → afd → semántica/clasificación → storage, y regresa un objeto de resultado. `server.js` reutiliza ese mismo `interpreter.js` sin duplicar lógica; un futuro modo consola/archivo (no implementado aún) podría reutilizarlo igual.

### 14.1 Formato de los objetos de resultado (implementado)

`interpreter.js` siempre regresa `{ resultado, lineasBitacora }`. `lineasBitacora` es un arreglo de texto ya formateado, listo para `bitacoraRepo.registrarEntrada()` y para mostrarse tal cual en la interfaz. `resultado` tiene esta forma real:

```js
// Rechazo (léxico, sintáctico o semántico; REGISTRO, LECTURA o CONSULTA):
{ estado: "RECHAZADO", instruccion: "LECTURA", tipo: "SINTACTICO", linea: 3, mensaje: "...", recorridoAFD: [...] }
// Los rechazos LEXICO y SINTACTICO (aún sin árbol, así que sin campo `instruccion`) agregan además:
//   posicion: 10,                      <- índice del carácter con la falla
//   detalle: "se esperaba ...",        <- el motivo (lo que va junto al ^)
//   diagnostico: { instruccion: "P002; 120/-80, 75", marcador: "          ^ se esperaba ..." }

// REGISTRAR aceptado:
{ estado: "ACEPTADO", instruccion: "REGISTRO", linea: 1, recorridoAFD: [...], id: "P001", edad: 45, sexo: "M", sangre: "O+" }

// CONSULTAR aceptado (no modifica pacientes.csv). `paciente` es una copia: { id, edad, sexo, sangre, ultimaRevision | null }
{ estado: "ACEPTADO", instruccion: "CONSULTA", linea: 10, recorridoAFD: [...], id: "P001", paciente: {...} }
// `paciente` (y cada elemento de `pacientes` en LISTAR) trae además `clasificacion`:
//   { presion: {nombre, nivel}, frecuencia: {nombre, nivel}, crisis: bool, datoSospechoso: bool }  (null si no tiene revisión)

// LISTAR aceptado (también con total: 0 si no hay pacientes):
{ estado: "ACEPTADO", instruccion: "LISTADO", linea: 12, recorridoAFD: [...], total: 2, pacientes: [...] }

// Lectura aceptada (normal, con alerta, con advertencia, o ambas):
{ estado: "ACEPTADO_CON_ALERTA", instruccion: "LECTURA", linea: 7, recorridoAFD: [...],
  id: "P002", clasificacionPresion: { nombre: "Crisis hipertensiva", nivel: 4 },
  comparacion: { resultado: "NEGATIVO", presion: {...}, frecuencia: {...} } }
```

`estado` es siempre uno de: `ACEPTADO`, `ACEPTADO_CON_ALERTA`, `ACEPTADO_CON_ADVERTENCIA`, `ACEPTADO_CON_ALERTA_Y_ADVERTENCIA`, `RECHAZADO` (los mismos nombres de estado del AFD, sección 7). `recorridoAFD` es el historial de estados por los que pasó esa instrucción (útil para depurar o para mostrar visualmente el recorrido del autómata en la exposición, si se quiere).

### 14.2 Convención de nombres: `REG`/`LEC`/`CON`/`LIS` vs. `REGISTRO`/`LECTURA`/`CONSULTA`/`LISTADO`

En el código conviven dos vocabularios a propósito, no es un error:
- **`parser.js`** usa `arbol.tipo === 'REG' | 'LEC' | 'CON' | 'LIS'`, porque son los nombres exactos de los no terminales de la gramática (sección 4.3: `S -> REG | LEC | CON | LIS`). Se mantienen así para que el código del parser se pueda comparar directo contra la gramática documentada.
- **`interpreter.js`** traduce eso a `resultado.instruccion === 'REGISTRO' | 'LECTURA' | 'CONSULTA' | 'LISTADO'` (palabra completa), porque ese campo ya es parte de lo que ve una persona (vía `server.js`/la interfaz), y ahí conviene texto claro en vez de abreviaturas internas del parser.

No existe una palabra reservada "LECTURA" en el lenguaje de instrucciones (las palabras reservadas son `REGISTRAR`, `CONSULTAR` y `LISTAR`): el parser decide la instrucción con el primer token (`REGISTRAR` → registro, `CONSULTAR` → consulta, `LISTAR` → listado, `ID` → lectura), ya que ningún otro tipo de instrucción empieza con un ID. Por diseño, no hace falta anunciar una lectura con una palabra, a diferencia del registro.

### 14.3 Cosas que se resolvieron al programar (más allá del diseño)

- **AFD en código:** implementado como tabla de transiciones (`afd.js`), exactamente como se planeó: un objeto que mapea `"ESTADO:EVENTO" -> ESTADO_SIGUIENTE`. Una transición no contemplada en la tabla lanza una excepción (`TransicionInvalidaError`), en vez de fallar en silencio.
- **Concurrencia en `pacientes.csv`:** resuelta de forma simple: `pacientesRepo.js` reescribe el archivo completo, de forma síncrona, en cada cambio. Como Node.js es de un solo hilo y la escritura es síncrona, dos actualizaciones nunca se mezclan a medias.
- **Bug real encontrado y corregido durante las pruebas:** al comparar una lectura contra la última revisión, `interpreter.js` leía `paciente.ultimaRevision` una segunda vez *después* de haber llamado a `pacientesRepo.actualizarRevision()`, que modifica ese mismo objeto por referencia. El resultado era que el mensaje de comparación mostraba la lectura nueva comparada contra sí misma. Se corrigió guardando la revisión anterior en una variable (`ultimaRevisionAnterior`) antes de actualizar el archivo. Vale la pena que, si se modifica `interpreter.js`, se tenga cuidado con este mismo patrón (leer un dato de un repositorio, actualizar el repositorio, y solo después usar el dato leído: para entonces ya puede estar desactualizado si era el mismo objeto).
- **Recomendaciones de texto por categoría de presión:** no estaban definidas en el diseño (solo había ejemplos sueltos en la documentación original). Se agregó un primer borrador en `interpreter.js` (objeto `RECOMENDACIONES_PRESION`); el equipo debería revisarlo y ajustarlo (ver sección 16). Al cambiar a la NOM-030 se adaptaron a las categorías nuevas (Óptima, Subóptima, Limítrofe, Hipertensión grado 1/2/3). Las llaves de ese objeto deben coincidir **exactamente** con los nombres de `CATEGORIAS_PRESION` en `clasificacion.js`; si no coinciden, la recomendación simplemente no aparece. "Crisis hipertensiva" no lleva recomendación a propósito (ya se muestra la alerta de emergencia).
- **Bug de fecha corregido (noviembre 2026):** `server.js` y `bitacoraRepo.js` sacaban la fecha con `toISOString()`, que da la fecha en **UTC**. En Tijuana, después de las 4–5 pm, las revisiones se guardaban con la fecha del día siguiente, y además no coincidían con el nombre del archivo de bitácora (que sí usaba hora local). Se corrigió con `fechaLocalISO()` en `bitacoraRepo.js`. **Actualización (noviembre 2026):** cada revisión ahora guarda fecha **y hora** (`fechaHoraLocal()`, también en `bitacoraRepo.js`, formato `YYYY-MM-DD HH:MM`), tomadas **por instrucción**: `crearInterpreter` recibe un reloj `ahora: () => Date` (reemplaza al antiguo parámetro `fechaProcesamiento`; `server.js` pasa `() => new Date()` y los tests un reloj fijo). `bitacora.fechaProcesamiento` (fecha de arranque) queda solo para el encabezado de la bitácora y `/api/estado`. Se agregó una prueba en `tests/storage.manual.js` que simula las 23:30 hora local. **No volver a usar `toISOString()` para fechas que ve el usuario.**
- **Marcador `^` en errores léxicos/sintácticos (noviembre 2026):** `ErrorLexico` y `ErrorSintactico` ya guardaban `posicion` pero no se usaba. Ahora ambos reciben `(detalle, posicion)` y exponen `.detalle` (el parser ya no repite "Estructura de tokens inválida" en cada mensaje; lo agrega la clase en `.message`). `interpreter.js` arma el diagnóstico con `construirMarcador()` de `diagnostico.js` y lo agrega como las dos últimas líneas de `lineasBitacora`. Cuidado en el frontend: `public/app.js` pinta el diagnóstico en un `<pre class="diagnostico">` a partir de `resultado.diagnostico`, **sin `trim()`**; recortar o usar una fuente proporcional desalinea el `^`. Los tabuladores se conservan en el relleno para que alinee igual. Pruebas en `tests/diagnostico.manual.js` y al final de `tests/interpreter.manual.js`. **Tarjeta web (noviembre 2026):** para que un motivo largo no cause scroll horizontal ni se vea cortado, la tarjeta dibuja la línea del marcador con **solo el `^`** y el motivo (`resultado.detalle`) en un `<p class="motivo">` debajo, con ajuste de línea normal (si no hay `detalle`, muestra el marcador completo). La bitácora `.txt` y `lineasBitacora` **no cambian**: siguen con `^ motivo` en una sola línea (sección 8).
- **Cambio de guía clínica (noviembre 2026):** `clasificacion.js` pasó de AHA/ACC 2017 a NOM-030-SSA2-2017 (sección 7.1). Se agregó en `tests/semantics.manual.js` una prueba con todas las fronteras de la tabla (ej. 129/84 → Subóptima, 130/75 → Limítrofe, 180/120 → grado 3, 181/100 → Crisis).
- **Reparto de trabajo:** no se repartió por módulos ni por capas; la versión 1 completa se programó en una sola sesión, con el AFD actuando de "columna vertebral" que fue guiando el orden (lexer → parser → afd → semántica → storage → interpreter → server/frontend). El reparto entre integrantes, si lo hay, sería para revisar, extender o ajustar esta versión 1, no para construirla desde cero.
- **Control de versiones:** aún no se subió a Git/GitHub (sigue pendiente, ver sección 16).
- **Pruebas:** implementadas como scripts manuales con `console.log` (no un framework como Jest), uno por módulo más una prueba de integración completa (`interpreter.manual.js`) que reproduce el ejemplo de la sección 9 y verifica automáticamente el `pacientes.csv` final con aserciones simples.
- **README:** ya existe, con instalación, cómo correr el servidor, qué archivos genera, la estructura del proyecto y cómo correr las pruebas.

### 14.4 Cómo correr el proyecto

```bash
npm install
npm start                 # abre el servidor en http://localhost:3000
```

Para correr las pruebas (no requieren el servidor encendido):
```bash
node tests/lexer.manual.js
node tests/parser.manual.js
node tests/afd.manual.js
node tests/semantics.manual.js
node tests/storage.manual.js
node tests/diagnostico.manual.js
node tests/interpreter.manual.js
```

**En PowerShell (el equipo usa Windows):** los comandos de arriba son iguales. La única diferencia es cambiar el puerto, que en PowerShell es `$env:PUERTO = 4000` (dos líneas) en vez de `PUERTO=4000 npm start` (una línea, sintaxis de bash). Para apagar el servidor: `Ctrl + C` en la misma ventana donde quedó corriendo.

---

## 15. Decisiones de diseño descartadas (para no repetir errores)

Para evitar que la IA del otro integrante proponga de nuevo algo ya descartado:

- ❌ Comparar contra historial completo de revisiones → se decidió comparar solo contra la **última revisión**.
- ❌ Que todos los datos del paciente viajen en cada línea de lectura → se decidió usar un **archivo `pacientes.csv`** separado, consultado por ID.
- ❌ Registrar pacientes mediante un menú/formulario fuera del lenguaje → se decidió que el registro sea **una instrucción más del lenguaje** (`REGISTRAR`), para que pase por el mismo análisis léxico/sintáctico/semántico.
- ❌ Capturar la fecha de revisión en la instrucción de lectura → la **asigna el sistema automáticamente** (fecha y hora locales de cada instrucción).
- ❌ Una sola fecha de procesamiento calculada al arrancar el servidor para todas las revisiones → ahora se toma la hora por instrucción (revisiones de un servidor encendido varias horas ya no comparten fecha/hora). Guardar solo la fecha también se descartó.
- ❌ Sobrescribir la bitácora en cada ejecución → se decidió generar **un archivo nuevo por ejecución**, con fecha y hora en el nombre, sin sobrescribir las anteriores.
- ❌ Incluir el análisis FODA en la documentación técnica nueva → se decidió **no** incluirlo (es de una etapa anterior del semestre).
- ❌ Rechazar directamente una presión fuera de rango fisiológico extremo → se decidió **aceptar con advertencia de "dato sospechoso"** en vez de rechazar (ver sección 7.4).
- ❌ Programar todo en JavaScript de navegador con almacenamiento en `localStorage`/`IndexedDB` → se decidió usar **Node.js en el backend** con archivos reales, y el navegador solo como interfaz (ver sección 13).
- ❌ Una bitácora por sesión/usuario individual en la interfaz web → se decidió **una sola bitácora por cada vez que arranca el servidor** (ver sección 13.2), ya que complicaba el proyecto sin aportar mucho para una demostración de clase.
- ❌ Una bitácora nueva cada día (como un log de auditoría real de uso continuo) → descartada porque el servidor solo se prendería ratos cortos (~30 min) para hacer pruebas, no de forma continua.
- ❌ Clasificar la presión con la guía AHA/ACC 2017 (Normal / Elevada / Hipertensión etapa 1 y 2) → se cambió a la **NOM-030-SSA2-2017** (sección 7.1), por ser la norma oficial de México. Con AHA/ACC, valores como 120/80 salían como hipertensión, lo cual era más alarmante que lo que marca la norma mexicana.

- ❌ `LISTAR` con filtros o argumentos (ej. `LISTAR P001`) → no se implementó; para ver un paciente está `CONSULTAR`. `LISTAR` vacío tampoco se rechaza (ver 6.4).

---

## 16. Pendientes abiertos (aún sin decidir)

- **Corregir los Objetivos dentro del documento Word técnico completo** (ya se corrigieron para la presentación, falta aplicarlo ahí).
- **Revisar y ajustar los textos de `RECOMENDACIONES_PRESION`** en `interpreter.js` (sección 14.3): es un primer borrador agregado durante la programación, nunca se decidió la redacción exacta con el equipo.
- **Subir el proyecto a Git/GitHub.**
- **Decidir si conviene migrar las pruebas manuales a un framework como Jest**, o si los scripts `*.manual.js` son suficientes para el alcance de este proyecto.
- **Implementar (o descartar) el modo de entrada por archivo/consola** (`lecturas.txt`), que seguía siendo parte del diseño original pero no se programó en esta versión 1 (solo se implementó la entrada vía interfaz web). `interpreter.js` ya está hecho para poder reutilizarse en ese modo sin cambios, si se decide agregarlo.
- **Revisión cruzada del código entre los integrantes**, ya que la versión 1 se programó en una sola sesión, sin repartir el trabajo (ver sección 14.3).
- **Decidir si una lectura con sistólica igual a la diastólica (ej. `120/120`) se rechaza.** Hoy se acepta: el código solo rechaza si la diastólica es *mayor* que la sistólica (sección 8), pero los alcances (sección 2) dicen "sistólica > diastólica", lo que implicaría rechazar también el caso de igualdad. Pendiente de decidir con el equipo.
- **Actualizar el documento Word técnico y la presentación con la tabla NOM-030** (sección 7.1), si en ellos aparece la clasificación AHA/ACC anterior.

---

## 17. Siguiente paso inmediato

La versión 1 del intérprete ya está programada, probada (por módulo y de punta a punta) y empaquetada. El siguiente paso ya no es "empezar a programar", sino: que el equipo corra el proyecto (`npm install && npm start`), lo pruebe con sus propios casos, y resuelva los pendientes de la sección 16, en particular revisar las recomendaciones de texto agregadas durante la programación y subir el código a control de versiones.

---

### Instrucciones para la IA que reciba este documento

- Usa este documento como fuente de verdad del diseño y el estado actual del proyecto.
- No reintroduzcas las decisiones marcadas como descartadas (sección 15) salvo que el equipo lo pida explícitamente.
- Si el otro integrante avanza algo nuevo (código, ajustes al diseño), ese avance debe agregarse a este documento y compartirse de vuelta, para mantener sincronizados a ambos integrantes.
- Ante cualquier ambigüedad, revisa primero la sección de "Pendientes abiertos" (16) antes de asumir una decisión no tomada por el equipo.
- **El código ya existe (versión 1 completa, sección 14).** Antes de generar código nuevo para alguna de las ocho piezas (lexer, parser, afd, semantics/, storage/, interpreter, server/frontend), parte del código ya implementado (compartido aparte, en `cardio-guard.zip`) en vez de reescribirlo desde cero; úsalo como referencia de estilo y de las convenciones ya establecidas (sección 14.1 y 14.2), salvo que el equipo pida explícitamente una reescritura.
- Al generar o modificar código, sigue la estructura de carpetas y el formato de objetos de resultado de la sección 14, y los criterios de clasificación/comparación de la sección 7 exactamente como están definidos (no inventar otros umbrales ni otra regla de combinación para el cambio positivo/negativo).
- Ten cuidado con el patrón de bug descrito en la sección 14.3 (leer un objeto de un repositorio y usarlo después de que el repositorio lo haya modificado por referencia) al tocar `interpreter.js` o `pacientesRepo.js`.
