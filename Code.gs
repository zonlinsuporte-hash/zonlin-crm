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

/** Crea o actualiza un cliente */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body.token || body.token !== SECRET_TOKEN) {
      return jsonOut_({ ok: false, error: 'No autorizado' });
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
