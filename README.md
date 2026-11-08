# Cardio Guard

Intérprete para el monitoreo de presión arterial y frecuencia cardíaca en
entornos hospitalarios. Proyecto para la materia de Lenguajes y Autómatas II.

## Requisitos

- Node.js (probado con Node 22, pero cualquier versión reciente funciona).

## Instalación

```bash
npm install
```

## Cómo correr el servidor

```bash
npm start
```

Esto abre el servidor en **http://localhost:3000**. Ahí mismo se sirve la
interfaz web (`public/index.html`), donde se puede escribir una instrucción
(`REGISTRAR P001, 45, M, O+` o `P001; 118/76, 75`) y ver el resultado al
instante.

Para usar otro puerto:

```bash
PUERTO=4000 npm start
```

## Qué se genera al correr el servidor

- `data/pacientes.csv` — se crea si no existe. Guarda a los pacientes
  registrados y su última revisión aceptada.
- `data/bitacoras/bitacora_FECHA_HORA.txt` — se crea **una** al arrancar el
  servidor (no una por instrucción), y ahí se van agregando todas las
  instrucciones que se procesen mientras el servidor siga corriendo. Si se
  reinicia el servidor, se crea una bitácora nueva; las anteriores no se
  borran ni se sobrescriben.

## Elegir dónde se guardan los pacientes (CSV o SQL Server)

- Copia `.env.example` como `.env`. `REPOSITORIO=csv` (por defecto) usa `data/pacientes.csv`; `REPOSITORIO=sql` usa SQL Server Express (`SQLEXPRESS`, TCP 1433, autenticación mixta). Solo se guarda la última revisión de cada paciente.
- Crear la base en SSMS: ejecuta `sql/crear_base.sql` y luego `sql/crear_usuario.sql` (cambia antes `CAMBIAR_ESTA_CONTRASENA`). El usuario `cardio_guard_app` solo lee y escribe datos.
- En `.env`: `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` y, si hace falta, `DB_ENCRYPT` / `DB_TRUST_SERVER_CERTIFICATE`. El `.env` no se sube a git.
- Si `REPOSITORIO=sql` y no hay conexión, el servidor avisa qué variable revisar y termina (no usa el CSV de respaldo). Al arrancar muestra el repositorio activo.
- `node tests/storage.sql.manual.js` se omite si no hay SQL Server. Para correrlo, define `DB_TEST_USER` y `DB_TEST_PASSWORD` en `.env`: ese usuario necesita permiso para **crear bases de datos** (`cardio_guard_app` no lo tiene). El test crea y borra su propia base `cardio_guard_test`; nunca toca `cardio_guard`.

## Estructura del proyecto

```
src/
  lexer/lexer.js            cadena de texto -> tokens
  parser/parser.js          tokens -> árbol (REGISTRAR o lectura)
  automaton/afd.js          autómata finito que controla el flujo
  semantics/
    validarRegistro.js      reglas semánticas de REGISTRAR
    validarLectura.js       reglas semánticas de una lectura
    clasificacion.js        categorías de presión/frecuencia y comparación
  storage/
    pacientesRepo.js        lee y escribe pacientes.csv
    pacientesRepoSql.js     pacientes en SQL Server (mssql)
    seleccionarRepo.js      elige csv o sql según REPOSITORIO
    bitacoraRepo.js         crea y escribe la bitácora de cada ejecución
  interpreter.js             junta todo lo anterior, instrucción por instrucción
  server.js                  servidor Express, expone el intérprete como API

public/
  index.html, style.css, app.js    interfaz web

tests/
  *.manual.js                pruebas manuales de cada módulo (ver abajo)
```

## Cómo correr las pruebas

No hay un framework de pruebas instalado todavía (como Jest); por ahora son
scripts que se corren directamente con Node y muestran el resultado en
consola para revisarlo a simple vista:

```bash
node tests/lexer.manual.js
node tests/parser.manual.js
node tests/afd.manual.js
node tests/semantics.manual.js
node tests/storage.manual.js
node tests/storage.sql.manual.js   # se omite sin SQL Server
node tests/interpreter.manual.js   # prueba de integración completa
```

`interpreter.manual.js` reproduce el ejemplo de referencia documentado (9
instrucciones: registros, lecturas normales, una alerta, errores de
sintaxis y semánticos) y verifica automáticamente que `pacientes.csv`
termine con los valores esperados.

## Documentación

El diseño completo (alcances, limitaciones, lenguaje de instrucciones,
tokens, gramática, archivos, flujo, clasificación clínica y manejo de
errores) está en `Cardio_Guard_Contexto_Proyecto.md` y en
`Cardio_Guard_Documentacion.docx`, compartidos aparte de este repositorio.
