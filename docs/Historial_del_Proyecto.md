# Cardio Guard — Historia del proyecto

Este documento cuenta cómo llegó Cardio Guard a su estado actual: qué se decidió, qué problemas aparecieron y cómo se resolvieron. Está pensado para quien llegue al repositorio y quiera entender **por qué** el sistema es como es, no solo cómo se usa (para eso está el [README](../README.md)).

**Materia:** Lenguajes y Autómatas II. **Tipo de proyecto:** intérprete.

---

## 1. La idea

Cardio Guard interpreta instrucciones de texto, una por línea, sobre pacientes hospitalarios:

```
REGISTRAR P001, 45, M, O+
P001; 118/76, 75
CONSULTAR P001
LISTAR
```

Cada línea pasa por análisis léxico, sintáctico y semántico, y un autómata finito determinista (AFD) decide si se **acepta** o se **rechaza**. Las lecturas aceptadas se clasifican (presión y frecuencia), se comparan con la última revisión del paciente y pueden disparar una alerta.

Se eligió un **intérprete** (y no un compilador o un traductor) porque el sistema no genera código ni traduce a otro lenguaje: actúa directamente sobre cada instrucción.

---

## 2. Cómo fue avanzando

### Etapa 1 — Diseño y documentación
Antes de programar se definió el lenguaje (tokens y gramática), el AFD, los archivos del sistema, las reglas semánticas y el catálogo de errores. Se redactó el documento técnico, el resumen, la introducción, las ventajas y desventajas y el marco teórico, y se preparó la presentación (en inglés, expuesta en español).

Aquí ya se tomaron decisiones que se mantuvieron hasta el final:
- Los pacientes viven en un **repositorio aparte** que el programa consulta y actualiza; no viajan dentro de cada línea de lectura (se vio poco realista para un hospital).
- **Registrar es una instrucción más del lenguaje** (`REGISTRAR`), no un formulario aparte, para que pase por las mismas validaciones.
- La **fecha de cada revisión la asigna el sistema**, no se escribe en la instrucción.
- La comparación es contra la **última revisión** únicamente.

### Etapa 2 — Primera versión funcional
Se programó el intérprete completo en Node.js: lexer → parser → AFD → semántica → almacenamiento → servidor Express, con la interfaz web como única entrada. Los pacientes se guardaban en un archivo CSV y cada ejecución del servidor generaba su propia bitácora de auditoría.

### Etapa 3 — Ampliación del lenguaje
Se agregaron `CONSULTAR` y `LISTAR` (de solo lectura, con sus propios estados en el AFD) y un **marcador `^`** en los errores léxicos y sintácticos que señala dónde está la falla, como lo haría un compilador.

También se reemplazó la clasificación de presión: se pasó de la guía AHA/ACC 2017 a la **NOM-030-SSA2-2017**, la norma oficial mexicana. Con la guía anterior, valores como 120/80 salían como hipertensión, más alarmante de lo que marca la norma del país.

### Etapa 4 — Rediseño de la interfaz
La interfaz se rediseñó por completo: captura por campos en cinco pestañas (Registro, Lectura, Consultar, Listar y Directa), panel de resultado con alertas accesibles, ficha de paciente, tabla de pacientes, bitácora de sesión con filtros, modo oscuro y diseño adaptable desde 320 px. Los campos solo arman el texto de la instrucción y la envían por la misma API; **el intérprete sigue siendo la única autoridad que valida**.

El rojo se reservó exclusivamente para la alerta, y el estado de una lectura nunca se comunica solo con color.

### Etapa 5 — Reglas de lectura y alerta por frecuencia
Al revisar el comportamiento aparecieron huecos en las reglas:
- Una lectura como `120/120` (sistólica igual a diastólica) se aceptaba aunque es imposible. Ahora se **rechaza**.
- El estado de **advertencia** (dato sospechoso) era inalcanzable: solo se activaba con presión extrema, y esa siempre es también crisis hipertensiva. Se definieron causas propias del dato sospechoso (presión de pulso muy baja, frecuencia extrema) para que tenga sentido.
- Faltaba una **alerta por frecuencia cardíaca severa** (menos de 40 o más de 150 lpm).
- Con una alerta de emergencia aún se mostraba una recomendación de texto, que la contradecía. Ahora se omite.

### Etapa 6 — SQL Server e historial
El almacenamiento en CSV reemplazaba la revisión anterior en cada lectura, sin guardar historia. Se agregó **SQL Server como opción** (el CSV sigue siendo el valor por defecto) con una tabla de revisiones, y `CONSULTAR` muestra las 10 más recientes. Cada lectura aceptada actualiza al paciente y agrega su fila al historial **en una sola transacción**: o se guarda todo o nada.

### Etapa 7 — Pulido
Se agregó `GET /api/pacientes` para que los IDs ya registrados aparezcan como sugerencia al cargar la página (antes solo aparecían tras ejecutar `LISTAR`), animaciones sutiles que respetan la preferencia de movimiento reducido y precarga de fuentes para evitar un parpadeo de texto al navegar. Por último, se limpió el repositorio.

---

## 3. Problemas que tuvimos y cómo se resolvieron

| Problema | Qué pasaba | Solución |
|---|---|---|
| **Fecha en UTC** | Las revisiones guardadas por la tarde en Tijuana quedaban con la fecha del día siguiente y no coincidían con el nombre de la bitácora. | Se dejó de usar `toISOString()` para fechas visibles; se usa la hora local. Cada revisión guarda ahora fecha **y hora**. |
| **Comparación contra sí misma** | El mensaje de comparación mostraba la lectura nueva comparada con ella misma: el dato se leía de nuevo *después* de actualizar el repositorio, que lo modificaba por referencia. | Se guarda la revisión anterior en una variable **antes** de actualizar. |
| **Advertencia inalcanzable** | El estado existía en el AFD pero ninguna lectura podía producirlo sola. | Causas propias del dato sospechoso (sección 2, etapa 5). |
| **ID demasiado largo** | Un ID de más de 20 caracteres daba un error interno de SQL Server (la columna es `VARCHAR(20)`) y un fallo 503. | Rechazo semántico claro al registrar, con límite de 20 caracteres también para el CSV, y el repositorio SQL trata un ID más largo como inexistente. |
| **No conectaba con SQL Server** | La autenticación de Windows con la que se entra a SSMS no sirve para Node. | Un usuario propio de la aplicación (`cardio_guard_app`) con permisos mínimos, credenciales en `.env`, autenticación mixta y TCP/IP en el puerto 1433. |
| **Fallo de la base durante el uso** | Con el servicio detenido, el servidor devolvía errores técnicos. | Respuesta 503 con un mensaje genérico en español, sin detalles; el servidor se recupera solo al volver el servicio. Si no puede conectar al arrancar, se detiene con un mensaje claro: **no** usa el CSV a escondidas. |
| **Limpieza de la base de pruebas** | Borrar la base de pruebas fallaba con "base en uso". | La limpieza cambia a `master`, pone la base en modo de un solo usuario con reversión inmediata, cierra los pools y reintenta. |
| **Parpadeo de fuentes** | Al navegar rápido, el título aparecía un instante sin negritas o más pequeño. | Precarga de fuentes y fuentes de respaldo con métricas ajustadas a las reales. |
| **Animaciones "invisibles"** | Una persona no veía las animaciones. | Tenía desactivados los efectos de animación de Windows; el navegador lo trata como movimiento reducido y las apaga, que es lo correcto. |
| **Datos confusos en el CSV** | Reiniciar con `Ctrl + C` o abrir y guardar el CSV desde Excel dejaba datos que no se esperaban. | Para capturas limpias: sesión nueva y no guardar el CSV desde Excel. |
| **Archivos subidos por error** | Se versionó `sql/.vs/` (archivos de Visual Studio con una ruta local). | Se quitó del seguimiento y se agregó `.vs/` a `.gitignore`. |

---

## 4. Decisiones que cambiamos o descartamos

- **Todo en JavaScript de navegador** con `localStorage`: descartado. El diseño necesita persistencia real, consultable fuera del navegador, así que el intérprete vive en Node.js.
- **Rechazar presiones extremas:** descartado. Un valor extremo real, aunque raro, no debe perderse sin dejar rastro; se acepta y se marca como dato sospechoso. Lo que sí se rechaza es lo imposible (sistólica ≤ diastólica, frecuencia menor de 30 o mayor de 220, ceros y negativos).
- **Comparar contra todo el historial:** descartado. La comparación sigue siendo contra la última revisión; el historial solo se muestra.
- **Guardar categorías o alertas en cada fila del historial:** descartado. Se guardan solo los valores crudos y se calculan al mostrarlos, para que un cambio de reglas reclasifique el historial.
- **Usar el CSV como respaldo si falla SQL Server:** descartado. Es mejor detenerse con un mensaje claro que guardar datos en un lugar inesperado.
- **Una bitácora por día o por usuario:** descartado. Una bitácora por cada arranque del servidor es suficiente para el uso previsto.
- **SQLite:** se evaluó, pero se eligió SQL Server porque el equipo ya lo tenía configurado.
- **Gráficas de tendencia en el historial:** descartado. Solo una tabla, para no inventar interpretación clínica.
- **Campos del diseño de referencia** (nombre, teléfono, dirección, médico): no se implementaron porque el sistema no guarda esos datos.

---

## 5. Alcance clínico: qué es y qué no es

Las alertas y recomendaciones son **orientativas y no sustituyen la valoración de un médico**.

- La **presión arterial** se clasifica con la NOM-030-SSA2-2017. La categoría "Crisis hipertensiva" no es de la norma; se conservó (más de 180 o más de 120) porque dispara la alerta roja.
- Las **categorías de frecuencia** (bradicardia, normal, taquicardia) son los límites habituales de un adulto en reposo; **no vienen de una norma mexicana**.
- Los **umbrales de alerta por frecuencia severa** (menos de 40 y más de 150 lpm) los eligió el equipo como referencia.
- No se capturan datos como diabetes o insuficiencia renal, por lo que la meta diferente que la norma da para esos pacientes no se aplica.

---

## 6. Cómo se trabajó

- Cada cambio se hizo en una **rama propia** a partir de `main` y se fusionó con un pull request. Las ramas, en orden: `diseno`, `integracion-backend`, `integracion-ui`, `correcciones-ui`, `reglas-lectura`, `alerta-frecuencia`, `ui-alerta-frecuencia`, `fix-recomendacion-alerta`, `sql-server`, `historial`, `ui-historial`, `ids-pacientes`, `animaciones-ui` y `limpieza-repo`.
- Los commits llevan un prefijo (`feat`, `fix`, `docs`, `chore`) y una descripción breve.
- La API se mantuvo estable: los cambios solo **agregan** campos, nunca cambian los existentes.
- Las pruebas son scripts manuales (`tests/*.manual.js`), uno por módulo más una de integración que reproduce el ejemplo de referencia. Las de SQL Server usan su propia base de pruebas y nunca tocan la real.

---

## 7. Lo que queda pendiente

- Documentación final de evidencias y manuales, con el comportamiento ya congelado.
- Ensayar la demostración con SQL Server. **Plan B:** si falla, cambiar a `REPOSITORIO=csv` en `.env` y reiniciar (funciona sin más configuración, pero sin historial).
- El modo de entrada por archivo o consola quedó en el diseño pero no se programó.
- Dos detalles visuales menores que se decidieron dejar: un clic ignorado en raras ocasiones al alternar muy rápido entre Inicio y "Acerca de", y la cursiva sintetizada del navegador.

---

## 8. Lo que aprendimos

1. **Revisar el estado completo del autómata:** un estado que existe pero que ninguna entrada puede alcanzar es un defecto de diseño, aunque el código no falle.
2. **Cuidado con los objetos compartidos por referencia:** leer un dato, modificar su origen y usar después el dato leído ya no da el valor original.
3. **Las fechas son un riesgo silencioso:** un `toISOString()` pasa desapercibido hasta que alguien lo prueba por la tarde.
4. **Probar contra un servidor real:** los problemas de SQL Server (autenticación, longitud de columna, servicio detenido) solo aparecieron al conectar de verdad.
5. **Cambios aditivos en una API compartida** permiten avanzar interfaz y backend por separado sin romperse.
6. **Decir qué viene de una norma y qué lo eligió el equipo:** los umbrales de frecuencia son de referencia y así se documentan.
