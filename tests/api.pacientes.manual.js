'use strict';

/**
 * Prueba de GET /api/pacientes. Arranca src/server.js como proceso hijo en un
 * puerto temporal, con REPOSITORIO=csv y DATOS_DIR apuntando a una carpeta
 * temporal fuera del repositorio (no toca data/ ni SQL Server).
 *
 *   node tests/api.pacientes.manual.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const { crearPacientesRepo } = require('../src/storage/pacientesRepo');

let fallos = 0;
function comprobar(descripcion, condicion, detalle) {
  console.log(`${condicion ? 'OK    ' : 'FALLA '} ${descripcion}${!condicion && detalle ? ' -> ' + detalle : ''}`);
  if (!condicion) fallos += 1;
}

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

function arrancar(carpeta) {
  return new Promise(async (resolve, reject) => {
    const puerto = await puertoLibre();
    const hijo = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
      env: { ...process.env, REPOSITORIO: 'csv', DATOS_DIR: carpeta, PUERTO: String(puerto) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    const temporizador = setTimeout(() => reject(new Error('El servidor no arrancó: ' + salida)), 10000);
    hijo.stdout.on('data', (d) => {
      salida += d;
      if (salida.includes('escuchando')) {
        clearTimeout(temporizador);
        resolve({ hijo, base: `http://localhost:${puerto}` });
      }
    });
    hijo.stderr.on('data', (d) => { salida += d; });
    hijo.on('exit', (c) => { if (c) reject(new Error('El servidor terminó con código ' + c + ': ' + salida)); });
  });
}

async function json(url, opciones) {
  const r = await fetch(url, opciones);
  return { status: r.status, cuerpo: await r.json() };
}

function leerBitacoras(carpeta) {
  const dir = path.join(carpeta, 'bitacoras');
  const mapa = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    mapa[f] = fs.readFileSync(path.join(dir, f), 'utf8');
  }
  return mapa;
}

async function ejecutar(carpeta, siembra, verificar) {
  const rutaCsv = path.join(carpeta, 'pacientes.csv');
  const repo = crearPacientesRepo(rutaCsv);
  for (const p of siembra) repo.agregar(p);
  const { hijo, base } = await arrancar(carpeta);
  try {
    await verificar(base);
  } finally {
    hijo.removeAllListeners('exit');
    hijo.kill();
  }
}

(async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'cardio-guard-api-'));
  try {
    console.log('=== GET /api/pacientes con pacientes guardados ===');
    const carpeta1 = path.join(raiz, 'con-pacientes');
    fs.mkdirSync(carpeta1);
    await ejecutar(
      carpeta1,
      [
        { id: 'P003', edad: 50, sexo: 'M', sangre: 'A+' },
        { id: 'P001', edad: 45, sexo: 'F', sangre: 'O+' },
        { id: 'P002', edad: 30, sexo: 'F', sangre: 'B-' },
      ],
      async (base) => {
        const antes = await json(`${base}/api/estado`);
        const bitAntes = leerBitacoras(carpeta1);

        const r = await json(`${base}/api/pacientes`);
        comprobar('responde 200', r.status === 200);
        comprobar('solo la clave "pacientes"', JSON.stringify(Object.keys(r.cuerpo)) === '["pacientes"]');
        comprobar(
          'cada elemento tiene únicamente { id }',
          r.cuerpo.pacientes.every((p) => JSON.stringify(Object.keys(p)) === '["id"]')
        );
        comprobar(
          'orden de registro (no alfabético)',
          JSON.stringify(r.cuerpo.pacientes) === JSON.stringify([{ id: 'P003' }, { id: 'P001' }, { id: 'P002' }]),
          JSON.stringify(r.cuerpo)
        );

        for (let i = 0; i < 3; i += 1) await json(`${base}/api/pacientes`);
        const despues = await json(`${base}/api/estado`);
        comprobar('/api/estado: contadores sin cambios', JSON.stringify(antes.cuerpo.contadores) === JSON.stringify(despues.cuerpo.contadores));
        comprobar('/api/estado: contadores en cero', despues.cuerpo.contadores.total === 0);
        comprobar('la bitácora no cambió', JSON.stringify(bitAntes) === JSON.stringify(leerBitacoras(carpeta1)));

        // No consume número de línea: el siguiente POST con la línea 1 se registra bien.
        const post = await json(`${base}/api/procesar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: 'CONSULTAR P001', numeroLinea: 1 }),
        });
        comprobar('POST /api/procesar sigue funcionando con numeroLinea 1', post.status === 200 && post.cuerpo.contadores.total === 1);
        const bit = Object.values(leerBitacoras(carpeta1)).join('\n');
        comprobar('la bitácora solo tiene la línea 1 (sin entradas por el GET)', bit.includes('[LÍNEA 01]') && !bit.includes('[LÍNEA 02]'));
      }
    );

    console.log('\n=== GET /api/pacientes con lista vacía ===');
    const carpeta2 = path.join(raiz, 'vacio');
    fs.mkdirSync(carpeta2);
    await ejecutar(carpeta2, [], async (base) => {
      const r = await json(`${base}/api/pacientes`);
      comprobar('200 y { pacientes: [] }', r.status === 200 && JSON.stringify(r.cuerpo) === '{"pacientes":[]}', JSON.stringify(r.cuerpo));
    });
  } catch (err) {
    console.error('Error en la prueba:', err.message);
    fallos += 1;
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }

  console.log(fallos === 0 ? '\nTodo OK' : `\n${fallos} comprobación(es) fallaron`);
  process.exit(fallos === 0 ? 0 : 1);
})();
