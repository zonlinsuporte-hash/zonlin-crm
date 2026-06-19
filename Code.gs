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
 * 9. Si vienes de una versión anterior (sin roles/pagos), ejecuta una vez la
 *    función migrarUsuariosV2() desde el editor de Apps Script. Ver SETUP.md.
 */

// Token secreto: solo quien lo conozca puede leer o escribir datos de clientes.
// Debe coincidir EXACTAMENTE con CONFIG.TOKEN en index.html.
// Si alguna vez se filtra (por ejemplo si el repo de GitHub se hace público),
// cámbialo aquí y en index.html, y vuelve a implementar (Nueva versión).
const SECRET_TOKEN = 'zln_zd0EJNViIe8c1J6Ap_Zom_Ob';

const SHEET_NAME = 'Clientes';
const USERS_SHEET_NAME = 'Usuarios';
const SESSIONS_SHEET_NAME = 'Sesiones';
const PAGOS_SHEET_NAME = 'Pagos';
const SESSION_HOURS = 12; // horas que dura una sesión iniciada antes de pedir login otra vez

const MAX_INTENTOS_LOGIN = 5;   // intentos fallidos antes de bloquear la cuenta
const BLOQUEO_MINUTOS = 15;     // minutos que dura el bloqueo temporal

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

// NOTA: 'Rol', 'IntentosFallidos' y 'BloqueadoHasta' se agregaron DESPUÉS de la
// primera versión, al final de la lista a propósito, para no romper hojas ya
// existentes (las columnas viejas A-F no cambian de posición).
// Si tu hoja "Usuarios" es de antes de este cambio, ejecuta migrarUsuariosV2()
// una sola vez desde el editor de Apps Script (ver SETUP.md, Paso 9).
const USER_HEADERS = ['Usuario', 'Salt', 'PasswordHash', 'Nombre', 'Activo', 'Fecha Creacion', 'Rol', 'IntentosFallidos', 'BloqueadoHasta'];
const SESSION_HEADERS = ['Token', 'Usuario', 'Nombre', 'Creado', 'Expira', 'Rol'];
const PAGO_HEADERS = ['ID Pago', 'ID Cliente', 'Cliente', 'Periodo', 'Monto', 'Estado', 'Fecha Registro', 'Registrado Por'];

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

function getPagosSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PAGOS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PAGOS_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(PAGO_HEADERS);
    sheet.getRange(1, 1, 1, PAGO_HEADERS.length)
      .setFontWeight('bold').setBackground('#13355e').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * MIGRACIÓN ÚNICA: ejecuta esta función UNA SOLA VEZ si tu hoja "Usuarios" fue
 * creada con una versión anterior de Code.gs (solo 6 columnas: Usuario, Salt,
 * PasswordHash, Nombre, Activo, Fecha Creacion).
 * Agrega los encabezados nuevos (Rol, IntentosFallidos, BloqueadoHasta) y, para
 * cada usuario que no tenga Rol asignado, le pone 'Administrador' (porque antes
 * de esta versión todos los usuarios existentes tenían acceso total).
 * Selecciónala en el menú de funciones del editor de Apps Script y haz clic en
 * Ejecutar (▶). Ver SETUP.md, Paso 9.
 */
function migrarUsuariosV2() {
  const sheet = getUsersSheet_();
  const lastCol = sheet.getLastColumn();
  if (lastCol < USER_HEADERS.length) {
    sheet.getRange(1, lastCol + 1, 1, USER_HEADERS.length - lastCol)
      .setValues([USER_HEADERS.slice(lastCol)])
      .setFontWeight('bold').setBackground('#13355e').setFontColor('#ffffff');
  }
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === '') continue;
    if (!data[i][6]) sheet.getRange(i + 1, 7).setValue('Administrador'); // Rol
    if (data[i][7] === '' || data[i][7] === undefined) sheet.getRange(i + 1, 8).setValue(0); // IntentosFallidos
  }
  Logger.log('Migración completada. Revisa la pestaña Usuarios.');
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
 * rol debe ser 'Administrador' o 'Empleado' (si no se especifica, 'Empleado').
 */
function crearUsuario_(usuario, contrasena, nombre, rol) {
  const sheet = getUsersSheet_();
  usuario = String(usuario || '').trim().toLowerCase();
  if (!usuario || !contrasena) throw new Error('Usuario y contraseña son obligatorios');
  rol = (rol === 'Administrador') ? 'Administrador' : 'Empleado';

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === usuario) {
      // Ya existe: actualiza su contraseña y desbloquea intentos, pero conserva
      // su rol actual salvo que se especifique uno nuevo.
      const salt = generarSalt_();
      const hash = hashPassword_(contrasena, salt);
      sheet.getRange(i + 1, 2).setValue(salt);
      sheet.getRange(i + 1, 3).setValue(hash);
      sheet.getRange(i + 1, 5).setValue(true);
      sheet.getRange(i + 1, 8).setValue(0);   // IntentosFallidos
      sheet.getRange(i + 1, 9).setValue('');  // BloqueadoHasta
      if (rol) sheet.getRange(i + 1, 7).setValue(rol);
      Logger.log('Contraseña actualizada para: ' + usuario);
      return;
    }
  }

  const salt = generarSalt_();
  const hash = hashPassword_(contrasena, salt);
  sheet.appendRow([usuario, salt, hash, nombre || usuario, true, new Date(), rol, 0, '']);
  Logger.log('Usuario creado: ' + usuario + ' (' + rol + ')');
}

/**
 * EJEMPLO LISTO PARA EJECUTAR: crea el usuario administrador inicial.
 * 1. Cambia 'admin' y 'CambiaEsta123' por el usuario/clave que quieras.
 * 2. Selecciona esta función (crearUsuarioAdmin) en el menú desplegable de
 *    funciones del editor de Apps Script y haz clic en "Ejecutar" (▶).
 * 3. Repite el proceso (con otro usuario) para crear más cuentas.
 */
function crearUsuarioAdmin() {
  crearUsuario_('admin', 'CambiaEsta123', 'Administrador', 'Administrador');
}

/**
 * EJEMPLO: crea un usuario empleado (acceso normal, sin poder cambiar precios
 * ni eliminar pagos). Cambia usuario/clave/nombre y ejecútala igual que arriba.
 */
function crearUsuarioEmpleado() {
  crearUsuario_('empleado1', 'OtraClaveSegura', 'Nombre del Empleado', 'Empleado');
}

function limpiarSesionesExpiradas_(sheet) {
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === '') continue;
    const expira = new Date(data[i][4]);
    if (isNaN(expira.getTime()) || expira < now) sheet.deleteRow(i + 1);
  }
}

function login_(usuario, contrasena) {
  const sheet = getUsersSheet_();
  limpiarSesionesExpiradas_(getSessionsSheet_());
  const data = sheet.getDataRange().getValues();
  usuario = String(usuario || '').trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]).trim().toLowerCase() === usuario) {
      const activo = row[4];
      if (activo === false) return { ok: false, error: 'Usuario inactivo' };

      const bloqueadoHasta = row[8] ? new Date(row[8]) : null;
      if (bloqueadoHasta && !isNaN(bloqueadoHasta.getTime()) && bloqueadoHasta > new Date()) {
        return { ok: false, error: 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en unos minutos.' };
      }

      const salt = row[1];
      const hash = row[2];
      const intento = hashPassword_(contrasena, salt);

      if (intento === hash) {
        sheet.getRange(i + 1, 8).setValue(0);  // resetea IntentosFallidos
        sheet.getRange(i + 1, 9).setValue(''); // limpia BloqueadoHasta

        const sessionToken = Utilities.getUuid();
        const now = new Date();
        const expira = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
        const nombre = row[3] || usuario;
        const rol = row[6] || 'Empleado';
        getSessionsSheet_().appendRow([sessionToken, usuario, nombre, now, expira, rol]);
        return { ok: true, sessionToken: sessionToken, nombre: nombre, rol: rol };
      }

      const intentos = (Number(row[7]) || 0) + 1;
      sheet.getRange(i + 1, 8).setValue(intentos);
      if (intentos >= MAX_INTENTOS_LOGIN) {
        const hasta = new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000);
        sheet.getRange(i + 1, 9).setValue(hasta);
        return { ok: false, error: 'Demasiados intentos fallidos. Cuenta bloqueada por ' + BLOQUEO_MINUTOS + ' minutos.' };
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
      return { usuario: data[i][1], nombre: data[i][2], rol: data[i][5] || 'Empleado' };
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

function nextPagoId_(sheet) {
  const lastRow = sheet.getLastRow();
  const count = Math.max(0, lastRow - 1) + 1;
  return 'PAG-' + String(count).padStart(5, '0');
}

function normalizarCedula_(c) {
  return String(c || '').replace(/\D/g, '');
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Lee todos los clientes y pagos (usado por el panel/dashboard) */
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
    let clients = [];
    if (data.length >= 2) {
      const headers = data[0];
      clients = data.slice(1)
        .filter(row => row[0] !== '') // ignora filas vacías
        .map((row, idx) => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = row[i]; });
          obj._row = idx + 2; // número real de fila en la hoja, usado para editar
          return obj;
        });
    }

    const pagos = listarPagos_(getPagosSheet_());

    return jsonOut_({ ok: true, clients: clients, pagos: pagos, rol: sesion.rol, nombre: sesion.nombre });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function listarPagos_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(row => row[0] !== '')
    .map((row, idx) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      obj._row = idx + 2;
      return obj;
    });
}

/** Crea o actualiza un cliente, registra/elimina pagos, o maneja login/logout */
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

    if (body.action === 'update') {
      return updateClient_(getSheet_(), body, sesion);
    }

    if (body.action === 'pago_nuevo') {
      return registrarPago_(getPagosSheet_(), body, sesion);
    }

    if (body.action === 'pago_eliminar') {
      return eliminarPago_(getPagosSheet_(), body, sesion);
    }

    // Crear nuevo cliente
    const sheet = getSheet_();

    const nombre = String(body.nombre || '').trim();
    const cedula = String(body.cedula || '').trim();
    const telefono = String(body.telefono || '').trim();
    if (!nombre || !cedula || !telefono) {
      return jsonOut_({ ok: false, error: 'Nombre, cédula y teléfono son obligatorios' });
    }

    const cedulaNorm = normalizarCedula_(cedula);
    if (cedulaNorm) {
      const existentes = sheet.getDataRange().getValues();
      for (let i = 1; i < existentes.length; i++) {
        if (normalizarCedula_(existentes[i][2]) === cedulaNorm) {
          return jsonOut_({ ok: false, error: 'Ya existe un cliente con esta cédula: ' + existentes[i][1] + ' (' + existentes[i][0] + ')' });
        }
      }
    }

    const id = nextClientId_(sheet);
    const fecha = new Date();
    sheet.appendRow([
      id,
      nombre,
      cedula,
      telefono,
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

function updateClient_(sheet, body, sesion) {
  const row = body._row;
  if (!row) return jsonOut_({ ok: false, error: 'Fila no especificada' });

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const fields = body.fields || {};

  // Solo un Administrador puede cambiar el precio de un cliente.
  if (Object.prototype.hasOwnProperty.call(fields, 'Precio') && sesion.rol !== 'Administrador') {
    return jsonOut_({ ok: false, error: 'Solo un administrador puede cambiar el precio de un cliente.' });
  }

  headers.forEach((h, i) => {
    if (Object.prototype.hasOwnProperty.call(fields, h)) {
      sheet.getRange(row, i + 1).setValue(fields[h]);
    }
  });

  return jsonOut_({ ok: true });
}

function registrarPago_(sheet, body, sesion) {
  const idCliente = String(body.idCliente || '').trim();
  const periodo = String(body.periodo || '').trim();
  const monto = Number(body.monto) || 0;
  if (!idCliente || !periodo) {
    return jsonOut_({ ok: false, error: 'Cliente y periodo son obligatorios' });
  }

  const id = nextPagoId_(sheet);
  const fecha = new Date();
  sheet.appendRow([
    id,
    idCliente,
    body.clienteNombre || '',
    periodo,
    monto,
    body.estadoPago || 'Pagado',
    fecha,
    sesion.nombre || sesion.usuario
  ]);

  return jsonOut_({ ok: true, id: id });
}

function eliminarPago_(sheet, body, sesion) {
  if (sesion.rol !== 'Administrador') {
    return jsonOut_({ ok: false, error: 'Solo un administrador puede eliminar pagos.' });
  }
  const row = body._row;
  if (!row) return jsonOut_({ ok: false, error: 'Fila no especificada' });
  sheet.deleteRow(row);
  return jsonOut_({ ok: true });
}
