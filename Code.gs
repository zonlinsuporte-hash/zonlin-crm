/**
 * ZONLIN DOMINICANA SRL — CRM de Registro de Clientes (Internet)
 * Backend con Google Apps Script + Google Sheets
 *
 * INSTALACIÓN (ver SETUP.md para el paso a paso con capturas):
 * 1. Crea una Google Sheet nueva (puede estar vacía).
 * 2. Extensiones > Apps Script.
 * 3. Borra el contenido de Code.gs y pega TODO este archivo.
 * 4. Guarda (Ctrl+S).
 * 5. Implementar > Nueva implementación > Tipo: Aplicación web.
 *    - Ejecutar como: Yo (tu cuenta)
 *    - Quién tiene acceso: Cualquier usuario
 * 6. Autoriza los permisos cuando Google te lo pida.
 * 7. Copia la URL de la app web y pégala en CONFIG.API_URL dentro de index.html.
 * 8. El valor de SECRET_TOKEN abajo ya viene generado y debe coincidir EXACTO
 *    con CONFIG.TOKEN en index.html (ya vienen sincronizados). Si lo cambias
 *    aquí, cámbialo también en index.html y vuelve a implementar (Nueva versión).
 */

// Token secreto: solo quien lo conozca puede leer o escribir datos de clientes.
// Debe coincidir EXACTAMENTE con CONFIG.TOKEN en index.html.
// Si alguna vez se filtra (por ejemplo si el repo de GitHub se hace público),
// cámbialo aquí y en index.html, y vuelve a implementar (Nueva versión).
const SECRET_TOKEN = 'zln_zd0EJNViIe8c1J6Ap_Zom_Ob';

const SHEET_NAME = 'Clientes';
const USERS_SHEET_NAME = 'Usuarios';
const SESSIONS_SHEET_NAME = 'Sesiones';
const SESSION_HOURS = 12; // horas que dura una sesión iniciada antes de pedir login otra vez

const HEADERS = [
  'ID Cliente',
  'Nombre Completo',
  'Cedula',
  'Telefono',
  'Correo Electronico',
  'Plan',
  'Precio',
  'Sector',
  'Direccion / Referencia',
  'Estado',
  'Fecha de Registro'
];

const USER_HEADERS = ['Usuario', 'Salt', 'PasswordHash', 'Nombre', 'Activo', 'Fecha Creacion'];
const SESSION_HEADERS = ['Token', 'Usuario', 'Nombre', 'Creado', 'Expira'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#13355e')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    for (let c = 1; c <= HEADERS.length; c++) sheet.autoResizeColumn(c);
  }
  return sheet;
}

function getUsersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(USER_HEADERS);
    sheet.getRange(1, 1, 1, USER_HEADERS.length)
      .setFontWeight('bold').setBackground('#13355e').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getSessionsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SESSIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SESSIONS_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SESSION_HEADERS);
    sheet.getRange(1, 1, 1, SESSION_HEADERS.length)
      .setFontWeight('bold').setBackground('#13355e').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ---------- Usuarios y contraseñas ---------- */

function generarSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password);
  return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

/**
 * Crea (o actualiza la contraseña de) un usuario.
 * Llama esta función manualmente desde el editor de Apps Script para crear
 * tu primer usuario administrador. Ver SETUP.md Paso 7.
 */
function crearUsuario_(usuario, contrasena, nombre) {
  const sheet = getUsersSheet_();
  usuario = String(usuario || '').trim().toLowerCase();
  if (!usuario || !contrasena) throw new Error('Usuario y contraseña son obligatorios');

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === usuario) {
      // Ya existe: actualiza su contraseña en lugar de duplicar.
      const salt = generarSalt_();
      const hash = hashPassword_(contrasena, salt);
      sheet.getRange(i + 1, 2).setValue(salt);
      sheet.getRange(i + 1, 3).setValue(hash);
      sheet.getRange(i + 1, 5).setValue(true);
      Logger.log('Contraseña actualizada para: ' + usuario);
      return;
    }
  }

  const salt = generarSalt_();
  const hash = hashPassword_(contrasena, salt);
  sheet.appendRow([usuario, salt, hash, nombre || usuario, true, new Date()]);
  Logger.log('Usuario creado: ' + usuario);
}

/**
 * EJEMPLO LISTO PARA EJECUTAR: crea el usuario administrador inicial.
 * 1. Cambia 'admin' y 'CambiaEsta123' por el usuario/clave que quieras.
 * 2. Selecciona esta función (crearUsuarioAdmin) en el menú desplegable de
 *    funciones del editor de Apps Script y haz clic en "Ejecutar" (▶).
 * 3. Repite el proceso (con otro usuario) para crear más cuentas.
 */
function crearUsuarioAdmin() {
  crearUsuario_('admin', 'CambiaEsta123', 'Administrador');
}

function login_(usuario, contrasena) {
  const sheet = getUsersSheet_();
  const data = sheet.getDataRange().getValues();
  usuario = String(usuario || '').trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]).trim().toLowerCase() === usuario) {
      const activo = row[4];
      if (activo === false) return { ok: false, error: 'Usuario inactivo' };
      const salt = row[1];
      const hash = row[2];
      const intento = hashPassword_(contrasena, salt);
      if (intento === hash) {
        const sessionToken = Utilities.getUuid();
        const now = new Date();
        const expira = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
        const nombre = row[3] || usuario;
        getSessionsSheet_().appendRow([sessionToken, usuario, nombre, now, expira]);
        return { ok: true, sessionToken: sessionToken, nombre: nombre };
      }
      return { ok: false, error: 'Usuario o contraseña incorrectos' };
    }
  }
  return { ok: false, error: 'Usuario o contraseña incorrectos' };
}

function validarSesion_(sessionToken) {
  if (!sessionToken) return null;
  const sheet = getSessionsSheet_();
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === sessionToken) {
      const expira = new Date(data[i][4]);
      if (expira < now) return null;
      return { usuario: data[i][1], nombre: data[i][2] };
    }
  }
  return null;
}

function logout_(sessionToken) {
  if (!sessionToken) return;
  const sheet = getSessionsSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === sessionToken) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

function nextClientId_(sheet) {
  const lastRow = sheet.getLastRow();
  const count = Math.max(0, lastRow - 1) + 1; // fila 1 = encabezados
  return 'ZON-' + String(count).padStart(4, '0');
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Lee todos los clientes (usado por el panel/dashboard) */
function doGet(e) {
  try {
    if (!e.parameter.token || e.parameter.token !== SECRET_TOKEN) {
      return jsonOut_({ ok: false, error: 'No autorizado' });
    }
    const sesion = validarSesion_(e.parameter.session);
    if (!sesion) {
      return jsonOut_({ ok: false, error: 'Sesion invalida o expirada' });
    }
    const sheet = getSheet_();
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonOut_({ ok: true, clients: [] });

    const headers = data[0];
    const clients = data.slice(1)
      .filter(row => row[0] !== '') // ignora filas vacías
      .map((row, idx) => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        obj._row = idx + 2; // número real de fila en la hoja, usado para editar
        return obj;
      });

    return jsonOut_({ ok: true, clients: clients });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

/** Crea o actualiza un cliente, o maneja login/logout */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body.token || body.token !== SECRET_TOKEN) {
      return jsonOut_({ ok: false, error: 'No autorizado' });
    }

    if (body.action === 'login') {
      return jsonOut_(login_(body.usuario, body.contrasena));
    }

    if (body.action === 'logout') {
      logout_(body.session);
      return jsonOut_({ ok: true });
    }

    const sesion = validarSesion_(body.session);
    if (!sesion) {
      return jsonOut_({ ok: false, error: 'Sesion invalida o expirada' });
    }

    const sheet = getSheet_();

    if (body.action === 'update') {
      return updateClient_(sheet, body);
    }

    // Crear nuevo cliente
    const id = nextClientId_(sheet);
    const fecha = new Date();
    sheet.appendRow([
      id,
      body.nombre || '',
      body.cedula || '',
      body.telefono || '',
      body.correo || '',
      body.plan || '',
      body.precio || '',
      body.sector || '',
      body.direccion || '',
      body.estado || 'Pendiente',
      fecha
    ]);

    return jsonOut_({ ok: true, id: id });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function updateClient_(sheet, body) {
  const row = body._row;
  if (!row) return jsonOut_({ ok: false, error: 'Fila no especificada' });

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  headers.forEach((h, i) => {
    if (body.fields && Object.prototype.hasOwnProperty.call(body.fields, h)) {
      sheet.getRange(row, i + 1).setValue(body.fields[h]);
    }
  });

  return jsonOut_({ ok: true });
}
