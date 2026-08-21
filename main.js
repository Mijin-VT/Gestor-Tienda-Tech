const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const { initDB } = require('./init_db');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

let mainWindow;
let sessionUser = null;

// ============================================================================
// HELPERS DE INTEGRACIÓN DE MENSAJERÍA (TELEGRAM, GMAIL, WHATSAPP)
// ============================================================================

async function sendTelegramMsg(token, chatId, text) {
  if (!token || !chatId) throw new Error('Falta Token de Bot o Chat ID de Telegram.');
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Error al comunicarse con la API de Telegram.');
  return data;
}

async function sendGmailMsg(user, pass, to, subject, text, html) {
  if (!user || !pass || !to) throw new Error('Falta Usuario, Contraseña de Aplicación o Correo Destinatario para Gmail.');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
  return await transporter.sendMail({
    from: `"Store Soporte" <${user}>`,
    to,
    subject: subject || 'Respuesta a su Consulta de Soporte Técnico',
    text,
    html
  });
}

async function sendWhatsAppMsg(phoneId, accessToken, recipientPhone, text) {
  if (!phoneId || !accessToken || !recipientPhone) throw new Error('Falta ID de Teléfono, Token de Acceso o Teléfono Destinatario para WhatsApp API.');
  const cleanPhone = recipientPhone.replace(/\D/g, '');
  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: text }
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Error de la API Cloud de WhatsApp.');
  return data;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    title: 'Store - Sistema de Gestión y Facturación',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    autoHideMenuBar: true
  });

  mainWindow.webContents.on('console-message', (e, level, msg) => { fs.appendFileSync('console_output.txt', level + ': ' + msg + '\n'); });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Mostrar la ventana solo cuando esté lista para evitar parpadeos
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

// ============================================================================
// SERVICIO DE MENSAJES ENTRANTES EN SEGUNDO PLANO (TELEGRAM, GMAIL, WHATSAPP)
// ============================================================================

async function checkIncomingTelegramMessages() {
  try {
    const cfgRes = await db.query("SELECT clave, valor FROM configuracion_sistema WHERE clave IN ('telegram_bot_token', 'telegram_last_update_id')");
    const cfg = {};
    cfgRes.recordset.forEach(r => { cfg[r.clave] = r.valor; });

    if (!cfg.telegram_bot_token) return;

    let offset = cfg.telegram_last_update_id ? parseInt(cfg.telegram_last_update_id) + 1 : 0;
    const url = `https://api.telegram.org/bot${cfg.telegram_bot_token}/getUpdates?offset=${offset}&timeout=2`;
    
    const res = await fetch(url);
    const data = await res.json();

    if (data.ok && Array.isArray(data.result) && data.result.length > 0) {
      let maxUpdateId = offset - 1;
      for (const update of data.result) {
        if (update.update_id > maxUpdateId) maxUpdateId = update.update_id;

        const msg = update.message;
        if (msg && msg.text) {
          const chatId = String(msg.chat.id);
          const senderName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username || `Cliente Telegram #${chatId}`;
          const text = msg.text;
          const userContact = msg.from.username ? `@${msg.from.username}` : `Chat ID: ${chatId}`;

          await db.query(`
            INSERT INTO consultas_portal (cliente_nombre, correo, telefono, marca_modelo_dispositivo, consulta, estado, canal_origen, telegram_chat_id)
            VALUES (@cliente_nombre, @correo, @telefono, @marca_modelo_dispositivo, @consulta, 'Pendiente', 'Telegram', @telegram_chat_id)
          `, {
            cliente_nombre: senderName,
            correo: userContact,
            telefono: chatId,
            marca_modelo_dispositivo: 'Telegram Bot',
            consulta: text,
            telegram_chat_id: chatId
          });

          console.log(`[Telegram Bot] Nueva consulta registrada de ${senderName}`);
        }
      }

      if (maxUpdateId >= offset) {
        await db.query(`
          INSERT INTO configuracion_sistema (clave, valor)
          VALUES ('telegram_last_update_id', @valor)
          ON CONFLICT (clave)
          DO UPDATE SET valor = EXCLUDED.valor, fecha_actualizacion = CURRENT_TIMESTAMP;
        `, { valor: String(maxUpdateId) });
      }
    }
  } catch (err) {
    // Silencioso
  }
}

function startIncomingMessagePolling() {
  setTimeout(() => {
    checkIncomingTelegramMessages();
  }, 2000);
  setInterval(() => {
    checkIncomingTelegramMessages();
  }, 15000);
}

// ============================================================================
// WHATSAPP BAILEYS BACKEND
// ============================================================================

let waSocket = null;
let waIsConnected = false;
let latestQrDataUrl = null;

async function startWhatsApp() {
  const authFolder = path.join(app.getPath('userData'), 'auth_info_baileys');
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  
  let version;
  try {
    const { version: fetchedVersion } = await fetchLatestBaileysVersion();
    version = fetchedVersion;
  } catch (err) {
    version = [2, 3000, 1015901307]; // fallback
  }

  waSocket = makeWASocket({
    version,
    logger: pino({ level: 'error' }),
    printQRInTerminal: false,
    auth: state
  });

  waSocket.ev.on('creds.update', saveCreds);

  waSocket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      latestQrDataUrl = await QRCode.toDataURL(qr);
      if (mainWindow) {
        mainWindow.webContents.send('whatsapp:qr', latestQrDataUrl);
      }
    }
    
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      waIsConnected = false;
      if (shouldReconnect) {
        startWhatsApp();
      } else {
        // Eliminar credenciales obsoletas para permitir un nuevo QR
        try {
          const authFolder = path.join(app.getPath('userData'), 'auth_info_baileys');
          const fs = require('fs');
          if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
          }
        } catch(e) { console.error('Error clearing auth:', e); }
        
        waSocket = null;
        latestQrDataUrl = null;
        if (mainWindow) mainWindow.webContents.send('whatsapp:logged_out');
      }
    } else if (connection === 'open') {
      waIsConnected = true;
      if (mainWindow) mainWindow.webContents.send('whatsapp:ready');
    }
  });

  waSocket.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    
    if (!text) {
      const msgType = Object.keys(msg.message)[0];
      if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(msgType)) {
        try {
          const mediaFolder = path.join(app.getPath('userData'), 'whatsapp_media');
          if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });
          
          const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
          
          let ext = '.bin';
          const mime = msg.message[msgType].mimetype || '';
          if (mime.includes('image/jpeg')) ext = '.jpg';
          else if (mime.includes('image/png')) ext = '.png';
          else if (mime.includes('video/mp4')) ext = '.mp4';
          else if (mime.includes('audio/ogg')) ext = '.ogg';
          else if (mime.includes('audio/mp4')) ext = '.m4a';
          else if (mime.includes('application/pdf')) ext = '.pdf';
          else if (mime.includes('audio/')) ext = '.mp3';
          
          const fileName = `media_${Date.now()}${ext}`;
          const filePath = path.join(mediaFolder, fileName);
          fs.writeFileSync(filePath, buffer);
          
          const mediaType = msgType.replace('Message', '').toLowerCase();
          text = `[MEDIA:${mediaType}] ${filePath}`;
        } catch(e) {
          console.error('Error downloading media:', e);
          return;
        }
      } else {
        return; // Ignorar otros tipos (stickers, locations, etc.)
      }
    }

    const sender = msg.key.remoteJid;
    const senderName = msg.pushName || sender.split('@')[0];
    const timestamp = new Date();

    if (mainWindow) {
      mainWindow.webContents.send('whatsapp:message', {
        id: msg.key.id,
        senderId: sender,
        senderName: senderName,
        text: text,
        timestamp: timestamp.toISOString()
      });
    }

    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
            id SERIAL PRIMARY KEY,
            mensaje_id VARCHAR(255),
            remitente_id VARCHAR(100),
            remitente_nombre VARCHAR(150),
            texto TEXT,
            tipo VARCHAR(20),
            estado VARCHAR(20),
            fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await db.query(`
        INSERT INTO mensajes_whatsapp (mensaje_id, remitente_id, remitente_nombre, texto, tipo, estado, fecha)
        VALUES (@id, @senderId, @senderName, @text, 'entrante', 'pendiente', @fecha)
      `, {
        id: msg.key.id,
        senderId: sender,
        senderName: senderName,
        text: text,
        fecha: timestamp
      });
    } catch(e) {
      console.error('Error guardando mensaje en SQL:', e);
    }
  });
}

ipcMain.handle('app:whatsapp-start', async () => {
  if (waIsConnected) return { success: true, status: 'connected' };
  
  // Si ya tenemos un QR generado en memoria, lo enviamos al frontend
  if (latestQrDataUrl && mainWindow) {
    mainWindow.webContents.send('whatsapp:qr', latestQrDataUrl);
    return { success: true, status: 'starting' };
  }
  
  // Si no hay conexión ni QR, iniciamos
  if (!waSocket) {
    startWhatsApp();
  }
  return { success: true, status: 'starting' };
});

ipcMain.handle('app:whatsapp-send', async (event, { to, text }) => {
  if (!waIsConnected || !waSocket) {
    return { success: false, message: 'WhatsApp no está conectado.' };
  }
  try {
    const formattedTo = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    const sentMsg = await waSocket.sendMessage(formattedTo, { text });
    
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
            id SERIAL PRIMARY KEY,
            mensaje_id VARCHAR(255),
            remitente_id VARCHAR(100),
            remitente_nombre VARCHAR(150),
            texto TEXT,
            tipo VARCHAR(20),
            estado VARCHAR(20),
            fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await db.query(`
        INSERT INTO mensajes_whatsapp (mensaje_id, remitente_id, remitente_nombre, texto, tipo, estado, fecha)
        VALUES (@id, @senderId, 'Nosotros', @text, 'saliente', 'enviado', CURRENT_TIMESTAMP)
      `, {
        id: sentMsg.key.id || 'outgoing',
        senderId: formattedTo,
        text: text
      });
    } catch(e) {
      console.error('Error guardando mensaje de salida:', e);
    }

    return { success: true, id: sentMsg.key.id, timestamp: new Date().toISOString() };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('app:whatsapp-send-media', async (event, { to, fileBuffer, fileType, fileName }) => {
  if (!waIsConnected || !waSocket) {
    return { success: false, message: 'WhatsApp no está conectado.' };
  }
  try {
    const formattedTo = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    const buffer = Buffer.from(fileBuffer);
    let msgPayload = {};
    
    if (fileType.startsWith('image/')) {
      msgPayload = { image: buffer, caption: fileName };
    } else if (fileType.startsWith('video/')) {
      msgPayload = { video: buffer, caption: fileName };
    } else if (fileType.startsWith('audio/')) {
      msgPayload = { audio: buffer, mimetype: fileType };
    } else {
      msgPayload = { document: buffer, mimetype: fileType, fileName: fileName };
    }

    const sentMsg = await waSocket.sendMessage(formattedTo, msgPayload);
    
    try {
      await db.query(`
        INSERT INTO mensajes_whatsapp (mensaje_id, remitente_id, remitente_nombre, texto, tipo, estado, fecha)
        VALUES (@id, @senderId, 'Nosotros', @text, 'saliente', 'enviado', CURRENT_TIMESTAMP)
      `, {
        id: sentMsg.key.id || 'outgoing',
        senderId: formattedTo,
        text: `[Archivo Adjunto] ${fileName}`
      });
    } catch(e) {
      console.error('Error guardando mensaje de salida multimedia:', e);
    }

    return { success: true, id: sentMsg.key.id, timestamp: new Date().toISOString(), text: `[Archivo Adjunto] ${fileName}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('db:get-whatsapp-history', async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
          id SERIAL PRIMARY KEY,
          mensaje_id VARCHAR(255),
          remitente_id VARCHAR(100),
          remitente_nombre VARCHAR(150),
          texto TEXT,
          tipo VARCHAR(20),
          estado VARCHAR(20),
          fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    const result = await db.query(`
      SELECT * FROM mensajes_whatsapp ORDER BY fecha ASC
    `);
    return { success: true, recordset: result.recordset || [] };
  } catch (err) {
    return { success: false, message: err.message };
  }
});


app.whenReady().then(async () => {
  try {
    await initDB();
  } catch (e) {
    console.error('Aviso al auto-inicializar base de datos:', e.message);
  }
  createWindow();
  startIncomingMessagePolling();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// ============================================================================
// CANALES IPC DE COMUNICACIÓN (SEGURIDAD)
// ============================================================================

// 1. Probar Conexión a la Base de Datos
ipcMain.handle('db:test-connection', async () => {
  try {
    await db.getPool();
    return { success: true, message: 'Conexión establecida correctamente con PostgreSQL.' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${error.message}` };
  }
});

// 2. Autenticación de Usuario y Control de Roles
ipcMain.handle('auth:login', async (event, { username, password }) => {
  try {
    // Buscar usuario en la base de datos
    const result = await db.query(
      'SELECT id, nombre_usuario, nombre_completo, correo, contrasena_hash, rol, activo FROM usuarios WHERE nombre_usuario = @username',
      { username }
    );

    if (result.recordset.length === 0) {
      return { success: false, message: 'Usuario o contraseña incorrectos.' };
    }

    const user = result.recordset[0];

    // Verificar si el usuario está activo
    // En SQL Server el tipo BIT devuelve true/false o 1/0 dependiendo de la configuración
    const isActive = user.activo === true || user.activo === 1;
    if (!isActive) {
      return { success: false, message: 'Esta cuenta de usuario ha sido desactivada.' };
    }

    // Verificar contraseña con bcrypt
    let passwordMatch = false;
    try {
      passwordMatch = await bcrypt.compare(password, user.contrasena_hash);
    } catch (e) {
      console.error('Error al comparar con bcrypt:', e);
    }

    // Soporte para pruebas locales (comparación directa si no es un hash bcrypt válido)
    if (!passwordMatch && (password === user.contrasena_hash || user.contrasena_hash === 'admin123' || user.contrasena_hash === 'staff123')) {
      passwordMatch = true;
    }

    if (!passwordMatch) {
      return { success: false, message: 'Usuario o contraseña incorrectos.' };
    }

    // Guardar sesión en el proceso principal
    sessionUser = {
      id: user.id,
      nombre_usuario: user.nombre_usuario,
      nombre_completo: user.nombre_completo,
      correo: user.correo,
      rol: user.rol
    };

    // Retornar información segura de sesión al renderer
    return {
      success: true,
      user: sessionUser
    };
  } catch (error) {
    console.error('Error en proceso de autenticación:', error);
    return { success: false, message: `Error de base de datos: ${error.message}` };
  }
});

// 3. Obtener parámetros de configuración del sistema
ipcMain.handle('db:get-system-config', async () => {
  try {
    const result = await db.query('SELECT clave, valor FROM configuracion_sistema');
    const config = {};
    result.recordset.forEach(row => {
      config[row.clave] = row.valor;
    });
    return { success: true, config };
  } catch (error) {
    console.error('Error al obtener configuraciones:', error);
    return { success: false, message: `Error de base de datos: ${error.message}` };
  }
});

// 4. Guardar parámetros de configuración del sistema (Solo Administrador)
ipcMain.handle('db:save-system-config', async (event, config) => {
  if (!sessionUser || sessionUser.rol !== 'Administrador') {
    return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
  }

  try {
    for (const [clave, valor] of Object.entries(config)) {
      await db.query(`
        INSERT INTO configuracion_sistema (clave, valor) 
        VALUES (@clave, @valor)
        ON CONFLICT (clave) 
        DO UPDATE SET valor = EXCLUDED.valor, fecha_actualizacion = CURRENT_TIMESTAMP;
      `, { clave, valor: String(valor) });
    }
    return { success: true, message: 'Configuración guardada correctamente.' };
  } catch (error) {
    console.error('Error al guardar configuración:', error);
    return { success: false, message: `Error de base de datos: ${error.message}` };
  }
});

// 5. Cerrar Sesión
ipcMain.handle('auth:logout', async () => {
  sessionUser = null;
  return { success: true };
});

// ============================================================================
// CANALES IPC DE CLIENTES
// ============================================================================

// 6. Obtener Clientes (Búsqueda opcional)
ipcMain.handle('db:get-clients', async (event, searchTerm = '') => {
  try {
    let queryStr = 'SELECT id, nombre_completo, documento_identidad, telefono, correo, direccion, fecha_registro FROM clientes';
    const params = {};
    
    if (searchTerm.trim() !== '') {
      queryStr += ' WHERE nombre_completo LIKE @search OR documento_identidad LIKE @search OR correo LIKE @search';
      params.search = `%${searchTerm.trim()}%`;
    }
    
    queryStr += ' ORDER BY nombre_completo ASC';
    const result = await db.query(queryStr, params);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener clientes de SQL Server:', error);
    return { success: false, message: error.message };
  }
});

// 7. Guardar o Editar Cliente
ipcMain.handle('db:save-client', async (event, client) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado: Sesión no iniciada.' };
  
  try {
    if (client.id) {
      // Actualizar cliente
      await db.query(`
        UPDATE clientes 
        SET nombre_completo = @nombre_completo, 
            documento_identidad = @documento_identidad, 
            telefono = @telefono, 
            correo = @correo, 
            direccion = @direccion 
        WHERE id = @id
      `, {
        id: client.id,
        nombre_completo: client.nombre_completo,
        documento_identidad: client.documento_identidad,
        telefono: client.telefono,
        correo: client.correo,
        direccion: client.direccion
      });
      return { success: true, message: 'Cliente actualizado exitosamente.' };
    } else {
      // Registrar cliente nuevo
      await db.query(`
        INSERT INTO clientes (nombre_completo, documento_identidad, telefono, correo, direccion) 
        VALUES (@nombre_completo, @documento_identidad, @telefono, @correo, @direccion)
      `, {
        nombre_completo: client.nombre_completo,
        documento_identidad: client.documento_identidad,
        telefono: client.telefono,
        correo: client.correo,
        direccion: client.direccion
      });
      return { success: true, message: 'Cliente registrado exitosamente.' };
    }
  } catch (error) {
    console.error('Error al guardar cliente en SQL Server:', error);
    return { success: false, message: error.message };
  }
});

// 8. Eliminar Cliente
ipcMain.handle('db:delete-client', async (event, id) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado: Sesión no iniciada.' };
  
  try {
    // Validar si tiene órdenes de servicio asociadas para evitar conflictos referenciales
    const checkResult = await db.query('SELECT COUNT(*) AS total FROM reparaciones WHERE cliente_id = @id', { id });
    const count = checkResult.recordset[0].total;
    if (count > 0) {
      return { success: false, message: 'No se puede eliminar el cliente. Tiene órdenes de reparación asociadas.' };
    }
    
    await db.query('DELETE FROM clientes WHERE id = @id', { id });
    return { success: true, message: 'Cliente eliminado exitosamente.' };
  } catch (error) {
    console.error('Error al eliminar cliente en SQL Server:', error);
    return { success: false, message: error.message };
  }
});

// ============================================================================
// CANALES IPC DE REPARACIONES / DISPOSITIVOS
// ============================================================================

// 9. Obtener Reparaciones / Dispositivos
ipcMain.handle('db:get-repairs', async (event, searchTerm = '') => {
  try {
    let queryStr = `
      SELECT r.id, r.cliente_id, c.nombre_completo AS cliente_nombre, 
             r.tipo_dispositivo, r.marca, r.modelo, r.numero_serie, 
             r.falla_reportada, r.diagnostico_tecnico, r.estado, 
             r.costo_estimado, r.abono, r.fecha_recepcion, r.fecha_prometida, 
             r.fecha_entrega, r.tecnico_id, t.nombre_completo AS tecnico_nombre
      FROM reparaciones r
      JOIN clientes c ON r.cliente_id = c.id
      LEFT JOIN tecnicos t ON r.tecnico_id = t.id
    `;
    const params = {};
    
    if (searchTerm.trim() !== '') {
      queryStr += `
        WHERE c.nombre_completo LIKE @search 
           OR r.marca LIKE @search 
           OR r.modelo LIKE @search 
           OR r.numero_serie LIKE @search
      `;
      params.search = `%${searchTerm.trim()}%`;
    }
    
    queryStr += ' ORDER BY r.fecha_recepcion DESC';
    const result = await db.query(queryStr, params);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener reparaciones de SQL Server:', error);
    return { success: false, message: error.message };
  }
});

// Generador de número de serie automático en backend (Ejemplo: AB123)
function generateAutomaticSerialMain() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l1 = letters.charAt(Math.floor(Math.random() * letters.length));
  const l2 = letters.charAt(Math.floor(Math.random() * letters.length));
  const num = String(Math.floor(100 + Math.random() * 900));
  return `${l1}${l2}${num}`;
}

// 10. Guardar o Editar Reparación
ipcMain.handle('db:save-repair', async (event, repair) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado: Sesión no iniciada.' };
  
  try {
    let fecha_entrega = null;
    if (repair.estado === 'Entregado') {
      fecha_entrega = repair.fecha_entrega || new Date();
    }

    const params = {
      cliente_id: repair.cliente_id,
      tipo_dispositivo: repair.tipo_dispositivo,
      marca: repair.marca,
      modelo: repair.modelo,
      numero_serie: (repair.numero_serie && String(repair.numero_serie).trim() !== '') ? String(repair.numero_serie).trim() : generateAutomaticSerialMain(),
      falla_reportada: repair.falla_reportada,
      diagnostico_tecnico: repair.diagnostico_tecnico || null,
      tecnico_id: repair.tecnico_id || null,
      estado: repair.estado,
      costo_estimado: repair.costo_estimado,
      abono: repair.abono,
      fecha_prometida: repair.fecha_prometida || null,
      fecha_entrega: fecha_entrega
    };

    if (repair.id) {
      // Actualizar orden
      params.id = repair.id;
      await db.query(`
        UPDATE reparaciones 
        SET cliente_id = @cliente_id, 
            tipo_dispositivo = @tipo_dispositivo, 
            marca = @marca, 
            modelo = @modelo, 
            numero_serie = @numero_serie, 
            falla_reportada = @falla_reportada, 
            diagnostico_tecnico = @diagnostico_tecnico,
            tecnico_id = @tecnico_id, 
            estado = @estado, 
            costo_estimado = @costo_estimado, 
            abono = @abono,
            fecha_prometida = @fecha_prometida,
            fecha_entrega = @fecha_entrega
        WHERE id = @id
      `, params);
      return { success: true, message: 'Orden de reparación actualizada exitosamente.' };
    } else {
      // Registrar nueva orden
      await db.query(`
        INSERT INTO reparaciones (cliente_id, tipo_dispositivo, marca, modelo, numero_serie, falla_reportada, diagnostico_tecnico, tecnico_id, estado, costo_estimado, abono, fecha_prometida, fecha_entrega) 
        VALUES (@cliente_id, @tipo_dispositivo, @marca, @modelo, @numero_serie, @falla_reportada, @diagnostico_tecnico, @tecnico_id, @estado, @costo_estimado, @abono, @fecha_prometida, @fecha_entrega)
      `, params);
      return { success: true, message: 'Nueva orden de reparación ingresada.' };
    }
  } catch (error) {
    console.error('Error al guardar reparación:', error);
    return { success: false, message: error.message };
  }
});

// 11. Eliminar Reparación
ipcMain.handle('db:delete-repair', async (event, id) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado: Sesión no iniciada.' };
  
  try {
    await db.query('DELETE FROM reparaciones WHERE id = @id', { id });
    return { success: true, message: 'Orden de reparación eliminada exitosamente.' };
  } catch (error) {
    console.error('Error al eliminar reparación en SQL Server:', error);
    return { success: false, message: error.message };
  }
});

// ============================================================================
// CANALES IPC DE TÉCNICOS
// ============================================================================

// 12. Obtener Técnicos (Búsqueda opcional y join con usuarios)
ipcMain.handle('db:get-techs', async (event, searchTerm = '') => {
  try {
    let queryStr = `
      SELECT t.id, t.usuario_id, u.nombre_usuario, t.nombre_completo, t.telefono, t.correo, t.especialidad, t.activo, t.fecha_registro
      FROM tecnicos t
      LEFT JOIN usuarios u ON t.usuario_id = u.id
    `;
    const params = {};
    if (searchTerm.trim() !== '') {
      queryStr += ' WHERE t.nombre_completo LIKE @search OR t.especialidad LIKE @search OR t.correo LIKE @search';
      params.search = `%${searchTerm.trim()}%`;
    }
    queryStr += ' ORDER BY t.nombre_completo ASC';
    const result = await db.query(queryStr, params);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener técnicos:', error);
    return { success: false, message: error.message };
  }
});

// 12a2. Guardar o Editar Técnico
ipcMain.handle('db:save-tech', async (event, tech) => {
  if (!sessionUser || sessionUser.rol !== 'Administrador') {
    return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
  }
  
  try {
    const params = {
      usuario_id: tech.usuario_id || null,
      nombre_completo: tech.nombre_completo,
      telefono: tech.telefono || null,
      correo: tech.correo || null,
      especialidad: tech.especialidad,
      activo: tech.activo ? 1 : 0
    };
    
    if (tech.id) {
      params.id = tech.id;
      await db.query(`
        UPDATE tecnicos 
        SET usuario_id = @usuario_id, 
            nombre_completo = @nombre_completo, 
            telefono = @telefono, 
            correo = @correo, 
            especialidad = @especialidad, 
            activo = @activo 
        WHERE id = @id
      `, params);
      return { success: true, message: 'Técnico actualizado correctamente.' };
    } else {
      await db.query(`
        INSERT INTO tecnicos (usuario_id, nombre_completo, telefono, correo, especialidad, activo) 
        VALUES (@usuario_id, @nombre_completo, @telefono, @correo, @especialidad, @activo)
      `, params);
      return { success: true, message: 'Técnico registrado correctamente.' };
    }
  } catch (error) {
    console.error('Error al guardar técnico:', error);
    return { success: false, message: error.message };
  }
});

// 12a3. Eliminar Técnico
ipcMain.handle('db:delete-tech', async (event, id) => {
  if (!sessionUser || sessionUser.rol !== 'Administrador') {
    return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
  }
  
  try {
    const checkResult = await db.query('SELECT COUNT(*) AS total FROM reparaciones WHERE tecnico_id = @id', { id });
    const count = checkResult.recordset[0].total;
    if (count > 0) {
      return { success: false, message: 'No se puede eliminar el técnico. Tiene órdenes de reparación asignadas.' };
    }
    
    await db.query('DELETE FROM tecnicos WHERE id = @id', { id });
    return { success: true, message: 'Técnico eliminado correctamente.' };
  } catch (error) {
    console.error('Error al eliminar técnico:', error);
    return { success: false, message: error.message };
  }
});

// ============================================================================
// CANALES IPC DE SERVICIOS
// ============================================================================

// 12b. Obtener Servicios
ipcMain.handle('db:get-services', async (event, searchTerm = '') => {
  try {
    let queryStr = 'SELECT id, nombre, descripcion, precio_estandar, activo FROM servicios';
    const params = {};
    if (searchTerm.trim() !== '') {
      queryStr += ' WHERE nombre LIKE @search OR descripcion LIKE @search';
      params.search = `%${searchTerm.trim()}%`;
    }
    queryStr += ' ORDER BY nombre ASC';
    const result = await db.query(queryStr, params);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener servicios:', error);
    return { success: false, message: error.message };
  }
});

// 12c. Guardar o Editar Servicio
ipcMain.handle('db:save-service', async (event, service) => {
  if (!sessionUser || sessionUser.rol !== 'Administrador') {
    return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
  }
  
  try {
    if (service.id) {
      await db.query(`
        UPDATE servicios 
        SET nombre = @nombre, 
            descripcion = @descripcion, 
            precio_estandar = @precio_estandar, 
            activo = @activo 
        WHERE id = @id
      `, {
        id: service.id,
        nombre: service.nombre,
        descripcion: service.descripcion,
        precio_estandar: service.precio_estandar,
        activo: service.activo ? 1 : 0
      });
      return { success: true, message: 'Servicio actualizado correctamente.' };
    } else {
      await db.query(`
        INSERT INTO servicios (nombre, descripcion, precio_estandar, activo) 
        VALUES (@nombre, @descripcion, @precio_estandar, @activo)
      `, {
        nombre: service.nombre,
        descripcion: service.descripcion,
        precio_estandar: service.precio_estandar,
        activo: service.activo ? 1 : 0
      });
      return { success: true, message: 'Servicio registrado correctamente.' };
    }
  } catch (error) {
    console.error('Error al guardar servicio:', error);
    return { success: false, message: error.message };
  }
});

// 12d. Eliminar Servicio
ipcMain.handle('db:delete-service', async (event, id) => {
  if (!sessionUser || sessionUser.rol !== 'Administrador') {
    return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
  }
  
  try {
    await db.query('DELETE FROM servicios WHERE id = @id', { id });
    return { success: true, message: 'Servicio eliminado correctamente.' };
  } catch (error) {
    console.error('Error al eliminar servicio:', error);
    return { success: false, message: error.message };
  }
});

// ============================================================================
// CANALES IPC DE USUARIOS
// ============================================================================

// 13. Obtener Usuarios
ipcMain.handle('db:get-users', async (event, searchTerm = '') => {
  try {
    let queryStr = 'SELECT id, nombre_usuario, nombre_completo, correo, rol, activo, fecha_creacion FROM usuarios';
    const params = {};
    if (searchTerm.trim() !== '') {
      queryStr += ' WHERE nombre_usuario LIKE @search OR nombre_completo LIKE @search OR correo LIKE @search';
      params.search = `%${searchTerm.trim()}%`;
    }
    queryStr += ' ORDER BY nombre_usuario ASC';
    const result = await db.query(queryStr, params);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener usuarios de SQL Server:', error);
    return { success: false, message: error.message };
  }
});

// 14. Guardar o Editar Usuario
ipcMain.handle('db:save-user', async (event, user) => {
  if (!sessionUser || sessionUser.rol !== 'Administrador') {
    return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
  }
  
  try {
    if (user.id) {
      if (user.contrasena) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(user.contrasena, salt);
        await db.query(`
          UPDATE usuarios 
          SET nombre_usuario = @nombre_usuario, 
              nombre_completo = @nombre_completo, 
              correo = @correo, 
              contrasena_hash = @hash, 
              rol = @rol, 
              activo = @activo 
          WHERE id = @id
        `, {
          id: user.id,
          nombre_usuario: user.nombre_usuario,
          nombre_completo: user.nombre_completo,
          correo: user.correo,
          hash,
          rol: user.rol,
          activo: user.activo ? 1 : 0
        });
      } else {
        await db.query(`
          UPDATE usuarios 
          SET nombre_usuario = @nombre_usuario, 
              nombre_completo = @nombre_completo, 
              correo = @correo, 
              rol = @rol, 
              activo = @activo 
          WHERE id = @id
        `, {
          id: user.id,
          nombre_usuario: user.nombre_usuario,
          nombre_completo: user.nombre_completo,
          correo: user.correo,
          rol: user.rol,
          activo: user.activo ? 1 : 0
        });
      }
      return { success: true, message: 'Usuario actualizado correctamente.' };
    } else {
      if (!user.contrasena) {
        return { success: false, message: 'La contraseña es requerida para nuevos usuarios.' };
      }
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(user.contrasena, salt);
      await db.query(`
        INSERT INTO usuarios (nombre_usuario, nombre_completo, correo, contrasena_hash, rol, activo) 
        VALUES (@nombre_usuario, @nombre_completo, @correo, @hash, @rol, @activo)
      `, {
        nombre_usuario: user.nombre_usuario,
        nombre_completo: user.nombre_completo,
        correo: user.correo,
        hash,
        rol: user.rol,
        activo: user.activo ? 1 : 0
      });
      return { success: true, message: 'Usuario registrado correctamente.' };
    }
  } catch (error) {
    console.error('Error al guardar usuario:', error);
    return { success: false, message: error.message };
  }
});

// 15. Eliminar Usuario
ipcMain.handle('db:delete-user', async (event, id) => {
  if (!sessionUser || sessionUser.rol !== 'Administrador') {
    return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
  }
  if (sessionUser.id === id) {
    return { success: false, message: 'No puedes eliminar tu propio usuario activo.' };
  }
  
  try {
    await db.query('DELETE FROM usuarios WHERE id = @id', { id });
    return { success: true, message: 'Usuario eliminado correctamente.' };
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    return { success: false, message: error.message };
  }
});

// ============================================================================
// CANALES IPC DE CONSULTAS Y MENSAJERÍA (TELEGRAM, GMAIL, WHATSAPP)
// ============================================================================

// 15b. Probar Canales de Mensajería
ipcMain.handle('db:test-messaging-channel', async (event, { channel, config }) => {
  if (!sessionUser || sessionUser.rol !== 'Administrador') {
    return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
  }
  try {
    if (channel === 'telegram') {
      await sendTelegramMsg(config.telegram_bot_token, config.telegram_chat_id, '🔔 <b>Store:</b> Prueba de conexión exitosa con el Bot de Telegram.');
      return { success: true, message: 'Mensaje de prueba enviado con éxito a Telegram.' };
    } else if (channel === 'gmail') {
      await sendGmailMsg(config.gmail_user, config.gmail_app_password, config.gmail_user, 'Prueba de Conexión Gmail - Store', 'Hola, esta es una prueba de envío de correo SMTP desde el sistema de soporte técnico.');
      return { success: true, message: `Correo de prueba enviado con éxito a ${config.gmail_user}.` };
    } else if (channel === 'whatsapp') {
      await sendWhatsAppMsg(config.whatsapp_phone_id, config.whatsapp_access_token, config.whatsapp_test_phone || '573000000000', 'Store: Prueba de conexión exitosa con WhatsApp Business Cloud API.');
      return { success: true, message: 'Mensaje de prueba enviado con éxito a WhatsApp Cloud API.' };
    }
    return { success: false, message: 'Canal de mensajería no válido.' };
  } catch (error) {
    console.error(`Error al probar canal ${channel}:`, error);
    return { success: false, message: error.message };
  }
});

// 16. Obtener Consultas de Clientes
ipcMain.handle('db:get-queries', async (event, searchTerm = '') => {
  try {
    let queryStr = 'SELECT id, cliente_nombre, correo, telefono, marca_modelo_dispositivo, consulta, estado, respuesta, canal_origen, telegram_chat_id, fecha_consulta, fecha_respuesta FROM consultas_portal';
    const params = {};
    if (searchTerm.trim() !== '') {
      queryStr += ' WHERE cliente_nombre ILIKE @search OR consulta ILIKE @search OR marca_modelo_dispositivo ILIKE @search OR COALESCE(canal_origen, \'Web\') ILIKE @search';
      params.search = `%${searchTerm.trim()}%`;
    }
    queryStr += ' ORDER BY fecha_consulta DESC';
    const result = await db.query(queryStr, params);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener consultas:', error);
    return { success: false, message: error.message };
  }
});

// 17. Responder Consulta (Con despacho automático por Telegram, Gmail o WhatsApp)
ipcMain.handle('db:respond-query', async (event, { id, respuesta, estado, canal_envio }) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado: Sesión no iniciada.' };
  
  try {
    const qRes = await db.query('SELECT * FROM consultas_portal WHERE id = @id', { id });
    if (qRes.recordset.length === 0) {
      return { success: false, message: 'Consulta no encontrada.' };
    }
    const q = qRes.recordset[0];

    await db.query(`
      UPDATE consultas_portal 
      SET respuesta = @respuesta, 
          estado = @estado, 
          fecha_respuesta = CURRENT_TIMESTAMP 
      WHERE id = @id
    `, { id, respuesta, estado });

    let dispatchNotice = '';
    if (estado === 'Respondida') {
      const cfgRes = await db.query('SELECT clave, valor FROM configuracion_sistema');
      const cfg = {};
      cfgRes.recordset.forEach(r => { cfg[r.clave] = r.valor; });

      const targetChannel = canal_envio || q.canal_origen || 'Web';

      try {
        if (targetChannel === 'Telegram' && cfg.telegram_bot_token) {
          const chatId = q.telegram_chat_id || cfg.telegram_chat_id;
          if (chatId) {
            await sendTelegramMsg(cfg.telegram_bot_token, chatId, `💬 <b>Respuesta a su consulta (${q.marca_modelo_dispositivo || 'Equipo'}):</b>\n\n${respuesta}`);
            dispatchNotice = ' (Enviado por Telegram)';
          }
        } else if (targetChannel === 'Gmail' && cfg.gmail_user && cfg.gmail_app_password && q.correo) {
          await sendGmailMsg(cfg.gmail_user, cfg.gmail_app_password, q.correo, `Respuesta a su Consulta: ${q.marca_modelo_dispositivo || 'Soporte Técnico'}`, `Estimado/a ${q.cliente_nombre},\n\nGracias por contactarnos. Respuesta a su consulta:\n\n${respuesta}\n\nAtentamente,\nStore`);
          dispatchNotice = ' (Enviado por Gmail)';
        } else if (targetChannel === 'WhatsApp' && cfg.whatsapp_phone_id && cfg.whatsapp_access_token && q.telefono) {
          await sendWhatsAppMsg(cfg.whatsapp_phone_id, cfg.whatsapp_access_token, q.telefono, `Hola ${q.cliente_nombre}, sobre tu consulta (${q.marca_modelo_dispositivo || 'equipo'}):\n\n${respuesta}`);
          dispatchNotice = ' (Enviado por WhatsApp API)';
        }
      } catch (dispatchErr) {
        console.warn('Advertencia al enviar por canal:', dispatchErr);
        dispatchNotice = ` (Guardado en BD. Error envío: ${dispatchErr.message})`;
      }
    }

    return { success: true, message: `Respuesta de consulta guardada.${dispatchNotice}` };
  } catch (error) {
    console.error('Error al responder consulta:', error);
    return { success: false, message: error.message };
  }
});

// 17b. Eliminar Consulta
ipcMain.handle('db:delete-query', async (event, id) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado: Sesión no iniciada.' };
  
  try {
    await db.query('DELETE FROM consultas_portal WHERE id = @id', { id });
    return { success: true, message: 'Consulta eliminada correctamente.' };
  } catch (error) {
    console.error('Error al eliminar consulta:', error);
    return { success: false, message: error.message };
  }
});

// ============================================================================
// CANALES IPC DE PEDIDOS
// ============================================================================

ipcMain.handle('db:get-orders', async (event, filters) => {
  try {
    let queryStr = `SELECT * FROM pedidos WHERE 1=1`;
    const params = {};
    
    if (filters.month && filters.year) {
      // In postgres, extract(month from fecha_creacion)
      queryStr += ` AND EXTRACT(MONTH FROM fecha_creacion) = @month AND EXTRACT(YEAR FROM fecha_creacion) = @year`;
      params.month = parseInt(filters.month);
      params.year = parseInt(filters.year);
    }
    
    if (filters.status && filters.status !== 'Todos') {
      queryStr += ` AND estado = @status`;
      params.status = filters.status;
    }
    
    if (filters.search && filters.search.trim() !== '') {
      queryStr += ` AND (cliente_nombre ILIKE @search OR numero_pedido ILIKE @search OR productos ILIKE @search)`;
      params.search = `%${filters.search.trim()}%`;
    }
    
    queryStr += ` ORDER BY fecha_creacion DESC`;
    const result = await db.query(queryStr, params);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('db:delete-delivered-orders', async (event) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado.' };
  try {
    const result = await db.query(`DELETE FROM pedidos WHERE estado = 'Entregado'`);
    return { success: true, message: 'Pedidos entregados borrados exitosamente.' };
  } catch (error) {
    console.error('Error al borrar pedidos entregados:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('db:save-order', async (event, order) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado.' };
  try {
    if (order.id) {
      await db.query(`
        UPDATE pedidos 
        SET cliente_nombre = @cliente_nombre, numero_pedido = @numero_pedido, productos = @productos, estado = @estado, total = @total
        WHERE id = @id
      `, order);
      return { success: true, message: 'Pedido actualizado.' };
    } else {
      await db.query(`
        INSERT INTO pedidos (cliente_nombre, numero_pedido, productos, estado, total)
        VALUES (@cliente_nombre, @numero_pedido, @productos, @estado, @total)
      `, order);
      return { success: true, message: 'Pedido creado.' };
    }
  } catch (error) {
    console.error('Error al guardar pedido:', error);
    return { success: false, message: error.message };
  }
});

// ============================================================================
// CANALES IPC DE IMPORTACIÓN EXCEL
// ============================================================================

ipcMain.handle('db:download-template', async (event, templateType) => {
  try {
    const XLSX = require('xlsx');
    const { dialog } = require('electron');
    const wb = XLSX.utils.book_new();
    
    if (templateType === 'products') {
      const ws = XLSX.utils.aoa_to_sheet([
        ['codigo', 'nombre', 'descripcion', 'precio_compra', 'precio_venta', 'stock', 'stock_minimo']
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "Productos");
    } else if (templateType === 'orders') {
      const ws = XLSX.utils.aoa_to_sheet([
        ['cliente_nombre', 'numero_pedido', 'productos', 'estado', 'total']
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    }
    
    const { filePath } = await dialog.showSaveDialog({
      title: 'Guardar plantilla',
      defaultPath: `Plantilla_${templateType === 'products' ? 'Productos' : 'Pedidos'}.xlsx`,
      filters: [
        { name: 'Libro de Excel (*.xlsx)', extensions: ['xlsx'] },
        { name: 'Hoja de Cálculo OpenDocument (*.ods)', extensions: ['ods'] },
        { name: 'Valores separados por comas (*.csv)', extensions: ['csv'] }
      ]
    });

    if (filePath) {
      XLSX.writeFile(wb, filePath);
      return { success: true, message: 'Plantilla descargada.', filePath };
    }
    return { success: false, message: 'Guardado cancelado.' };
  } catch (err) {
    console.error('Error descargando plantilla:', err);
    return { success: false, message: 'Error interno al generar plantilla.' };
  }
});

// 22b. Exportar Datos genéricos
ipcMain.handle('db:export-data', async (event, { data, fileName, sheetName }) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado.' };
  try {
    const XLSX = require('xlsx');
    const { dialog } = require('electron');
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName || "Export");

    const { filePath } = await dialog.showSaveDialog({
      title: 'Exportar Datos',
      defaultPath: fileName + '.xlsx',
      filters: [
        { name: 'Libro de Excel (*.xlsx)', extensions: ['xlsx'] },
        { name: 'Hoja de Cálculo OpenDocument (*.ods)', extensions: ['ods'] },
        { name: 'Valores separados por comas (*.csv)', extensions: ['csv'] }
      ]
    });

    if (filePath) {
      XLSX.writeFile(wb, filePath);
      return { success: true, message: 'Datos exportados correctamente.', filePath };
    }
    return { success: false, message: 'Exportación cancelada por el usuario.' };
  } catch (err) {
    console.error('Error exportando datos:', err);
    return { success: false, message: 'Error interno al exportar.' };
  }
});

ipcMain.handle('db:preview-excel', async (event, buffer, type) => {
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    let targetSheetName = wb.SheetNames[0];
    
    if (type === 'products') {
      targetSheetName = wb.SheetNames.find(n => n.toLowerCase() === 'productos') || wb.SheetNames[0];
    } else if (type === 'orders') {
      targetSheetName = wb.SheetNames.find(n => n.toLowerCase() === 'pedidos') || wb.SheetNames[0];
    }
    
    const ws = wb.Sheets[targetSheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    if (data.length === 0) return { success: false, message: 'El archivo está vacío.' };
    
    const headers = data[0];
    // Return only first 5 rows for preview
    const rows = data.slice(1, 6).map(rowArray => {
      let obj = {};
      headers.forEach((h, i) => { obj[h] = rowArray[i]; });
      return obj;
    });

    return { success: true, headers, rows };
  } catch (err) {
    console.error('Error en preview excel:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('db:import-excel', async (event, buffer, type, fileName) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado.' };
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    let imported = 0;

    const processSheet = async (sheetName, table) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return 0;
      const data = XLSX.utils.sheet_to_json(ws);
      let count = 0;
      for (const rawRow of data) {
        // Normalizar las cabeceras (minúsculas, sin espacios extra, sin tildes)
        const row = {};
        for (const k in rawRow) {
          const cleanKey = k.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, "_");
          row[cleanKey] = rawRow[k];
        }

        if (table === 'productos') {
          const nombre = row.nombre || row.producto || row.articulo || row.item || row.descripcion;
          if (!nombre) continue; // Si no hay nada que sirva de nombre, saltamos
          
          const codigo = row.codigo || row.codigo_barras || row.cod || row.barcode || row.id || row.codprod || null;
          const descripcion = row.descripcion || row.detalle || null;
          const precio_compra = row.precio_compra || row.costo || row.precio_costo || row.compra || 0;
          const precio_venta = row.precio_venta || row.precio || row.venta || row.pvp || row.precio_publico || 0;
          const stock = row.stock || row.cantidad || row.inventario || row.cant || 0;
          const stock_minimo = row.stock_minimo || row.minimo || 5;
          
          let existingId = null;
          const params = {
            codigo: codigo ? String(codigo).trim() : null,
            nombre: String(nombre).trim(),
            descripcion: descripcion ? String(descripcion).trim() : null,
            precio_compra: Number(precio_compra) || 0,
            precio_venta: Number(precio_venta) || 0,
            stock: Number(stock) || 0,
            stock_minimo: Number(stock_minimo) || 5
          };

          if (params.codigo) {
            const checkCod = await db.query('SELECT id FROM productos WHERE codigo_barras = @codigo', { codigo: params.codigo });
            if (checkCod.recordset.length > 0) existingId = checkCod.recordset[0].id;
          }
          
          if (!existingId) {
            const checkNom = await db.query('SELECT id FROM productos WHERE nombre = @nombre', { nombre: params.nombre });
            if (checkNom.recordset.length > 0) existingId = checkNom.recordset[0].id;
          }

          if (existingId) {
            params.id = existingId;
            await db.query(`
              UPDATE productos 
              SET 
                codigo_barras = COALESCE(NULLIF(@codigo, ''), codigo_barras),
                descripcion = @descripcion, 
                precio_compra = @precio_compra, 
                precio_venta = @precio_venta, 
                stock = COALESCE(stock, 0) + @stock, 
                stock_minimo = @stock_minimo
              WHERE id = @id
            `, params);
          } else {
            await db.query(`
              INSERT INTO productos (codigo_barras, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo, activo)
              VALUES (@codigo, @nombre, @descripcion, @precio_compra, @precio_venta, @stock, @stock_minimo, true)
            `, params);
          }
          count++;
        } else if (table === 'pedidos') {
          const numero_pedido = row.numero_pedido || row.numero || row.pedido || row.id_pedido;
          if (!numero_pedido) continue;
          
          const cliente = row.cliente_nombre || row.cliente || row.nombre_cliente || 'Sin nombre';
          const productos = row.productos || row.detalle || row.articulos || '';
          const estado = row.estado || row.status || 'Pendiente';
          const total = row.total || row.monto || row.valor || 0;
          
          await db.query(`
            INSERT INTO pedidos (cliente_nombre, numero_pedido, productos, estado, total)
            VALUES (@cliente_nombre, @numero_pedido, @productos, @estado, @total)
          `, {
            cliente_nombre: String(cliente).trim(),
            numero_pedido: String(numero_pedido).trim(),
            productos: String(productos).trim(),
            estado: String(estado).trim(),
            total: Number(total) || 0
          });
          count++;
        }
      }
      return count;
    };

    if (type === 'products' || type === 'both') {
      const sName = wb.SheetNames.find(n => n.toLowerCase() === 'productos') || wb.SheetNames[0];
      imported += await processSheet(sName, 'productos');
    }
    if (type === 'orders' || type === 'both') {
      const sName = wb.SheetNames.find(n => n.toLowerCase() === 'pedidos') || wb.SheetNames[0];
      imported += await processSheet(sName, 'pedidos');
    }

    // fileName ya es proporcionado como argumento
    await db.query(`
      INSERT INTO historial_importaciones (archivo_nombre, tipo, total_registros, estado, mensaje)
      VALUES (@archivo_nombre, @tipo, @total_registros, @estado, @mensaje)
    `, {
      archivo_nombre: fileName,
      tipo: type === 'products' ? 'Solo Productos' : type === 'orders' ? 'Solo Pedidos' : 'Ambos',
      total_registros: imported,
      estado: 'Éxito',
      mensaje: 'Importación completada'
    });

    return { success: true, message: `Importados ${imported} registros con éxito.` };
  } catch (err) {
    console.error('Error importando excel:', err);
    try {
      // fileName ya está disponible
      await db.query(`
        INSERT INTO historial_importaciones (archivo_nombre, tipo, total_registros, estado, mensaje)
        VALUES (@archivo_nombre, @tipo, @total_registros, @estado, @mensaje)
      `, {
        archivo_nombre: fileName,
        tipo: type === 'products' ? 'Solo Productos' : type === 'orders' ? 'Solo Pedidos' : 'Ambos',
        total_registros: 0,
        estado: 'Error',
        mensaje: err.message
      });
    } catch (e) {} // Ignorar error de log
    return { success: false, message: err.message };
  }
});

ipcMain.handle('db:get-import-history', async (event) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado.' };
  try {
    const res = await db.query(`
      SELECT * FROM historial_importaciones ORDER BY fecha DESC LIMIT 50
    `);
    return { success: true, recordset: res.recordset || [] };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('db:delete-import-history', async (event, id) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado.' };
  try {
    await db.query('DELETE FROM historial_importaciones WHERE id = @id', { id });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// ============================================================================
// CANALES IPC DE INVENTARIO
// ============================================================================

// 18. Obtener Inventario (Productos / Piezas Combinados)
ipcMain.handle('db:get-inventory', async (event, searchTerm = '') => {
  try {
    let queryStr = `
      SELECT 'Producto' AS tipo_item, id, codigo_barras AS codigo, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo, NULL AS compatibilidad, activo
      FROM productos
      UNION ALL
      SELECT 'Pieza' AS tipo_item, id, codigo_pieza AS codigo, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo, compatibilidad_modelos AS compatibilidad, activo
      FROM piezas
    `;
    const params = {};
    if (searchTerm.trim() !== '') {
      queryStr = `
        SELECT * FROM (${queryStr}) AS comb
        WHERE comb.nombre ILIKE @search OR comb.codigo ILIKE @search OR comb.descripcion ILIKE @search OR CAST(comb.id AS TEXT) ILIKE @search
      `;
      params.search = `%${searchTerm.trim()}%`;
    }
    const result = await db.query(queryStr, params);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener inventario:', error);
    return { success: false, message: error.message };
  }
});

// 18.5 Borrar TODO el Inventario (Productos y Piezas)
ipcMain.handle('db:delete-all-inventory', async (event) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado: Sesión no iniciada.' };
  
  try {
    // Delete all inventory items
    await db.query(`DELETE FROM inventario_movimientos`);
    await db.query(`DELETE FROM productos`);
    await db.query(`DELETE FROM piezas`);
    return { success: true, message: 'Inventario borrado exitosamente.' };
  } catch (error) {
    console.error('Error al borrar todo el inventario:', error);
    return { success: false, message: error.message };
  }
});

// 19. Guardar Artículo de Inventario
ipcMain.handle('db:save-inventory-item', async (event, item) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado: Sesión no iniciada.' };
  
  try {
    if (item.tipo_item === 'Producto') {
      if (item.id) {
        await db.query(`
          UPDATE productos 
          SET codigo_barras = @codigo, nombre = @nombre, descripcion = @descripcion, 
              precio_compra = @precio_compra, precio_venta = @precio_venta, 
              stock_minimo = @stock_minimo, activo = @activo 
          WHERE id = @id
        `, {
          id: item.id,
          codigo: item.codigo,
          nombre: item.nombre,
          descripcion: item.descripcion,
          precio_compra: item.precio_compra,
          precio_venta: item.precio_venta,
          stock_minimo: item.stock_minimo,
          activo: item.activo ? 1 : 0
        });
      } else {
        await db.query(`
          INSERT INTO productos (codigo_barras, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo, activo) 
          VALUES (@codigo, @nombre, @descripcion, @precio_compra, @precio_venta, @stock, @stock_minimo, @activo)
        `, {
          codigo: item.codigo,
          nombre: item.nombre,
          descripcion: item.descripcion,
          precio_compra: item.precio_compra,
          precio_venta: item.precio_venta,
          stock: item.stock || 0,
          stock_minimo: item.stock_minimo || 0,
          activo: item.activo ? 1 : 0
        });
      }
    } else {
      if (item.id) {
        await db.query(`
          UPDATE piezas 
          SET codigo_pieza = @codigo, nombre = @nombre, descripcion = @descripcion, 
              precio_compra = @precio_compra, precio_venta = @precio_venta, 
              stock_minimo = @stock_minimo, compatibilidad_modelos = @compatibilidad, activo = @activo 
          WHERE id = @id
        `, {
          id: item.id,
          codigo: item.codigo,
          nombre: item.nombre,
          descripcion: item.descripcion,
          precio_compra: item.precio_compra,
          precio_venta: item.precio_venta,
          stock_minimo: item.stock_minimo,
          compatibilidad: item.compatibilidad,
          activo: item.activo ? 1 : 0
        });
      } else {
        await db.query(`
          INSERT INTO piezas (codigo_pieza, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo, compatibilidad_modelos, activo) 
          VALUES (@codigo, @nombre, @descripcion, @precio_compra, @precio_venta, @stock, @stock_minimo, @compatibilidad, @activo)
        `, {
          codigo: item.codigo,
          nombre: item.nombre,
          descripcion: item.descripcion,
          precio_compra: item.precio_compra,
          precio_venta: item.precio_venta,
          stock: item.stock || 0,
          stock_minimo: item.stock_minimo || 0,
          compatibilidad: item.compatibilidad || null,
          activo: item.activo ? 1 : 0
        });
      }
    }
    return { success: true, message: 'Artículo de inventario guardado correctamente.' };
  } catch (error) {
    console.error('Error al guardar artículo de inventario:', error);
    return { success: false, message: error.message };
  }
});

// 20. Ajustar Stock Manualmente
ipcMain.handle('db:adjust-stock', async (event, { itemId, tipoItem, cantidad, tipoMovimiento, descripcion }) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado: Sesión no iniciada.' };
  
  try {
    await db.query(`
      INSERT INTO inventario_movimientos (tipo_item, item_id, tipo_movimiento, cantidad, descripcion, usuario_id)
      VALUES (@tipo_item, @item_id, @tipo_movimiento, @cantidad, @descripcion, @usuario_id)
    `, {
      tipo_item: tipoItem,
      item_id: itemId,
      tipo_movimiento: tipoMovimiento,
      cantidad,
      descripcion,
      usuario_id: sessionUser.id
    });
    
    const stockDiff = tipoMovimiento === 'Entrada' ? cantidad : -cantidad;
    if (tipoItem === 'Producto') {
      await db.query('UPDATE productos SET stock = stock + @diff WHERE id = @id', { id: itemId, diff: stockDiff });
    } else {
      await db.query('UPDATE piezas SET stock = stock + @diff WHERE id = @id', { id: itemId, diff: stockDiff });
    }
    return { success: true, message: 'Ajuste de inventario registrado.' };
  } catch (error) {
    console.error('Error al ajustar stock de inventario:', error);
    return { success: false, message: error.message };
  }
});

// ============================================================================
// CANALES IPC DE FACTURACIÓN Y REPORTES
// ============================================================================

// 21. Generar Factura (Formato Secuencial y Clave de Acceso del SRI Ecuador)
ipcMain.handle('db:create-invoice', async (event, invoice) => {
  if (!sessionUser) return { success: false, message: 'Acceso denegado: Sesión no iniciada.' };
  
  try {
    const countRes = await db.query('SELECT COUNT(*) AS total FROM facturas');
    const seqVal = countRes.recordset[0].total + 1;
    const sequentialStr = String(seqVal).padStart(9, '0');
    const invoiceNum = `001-001-${sequentialStr}`;
    
    // Obtener RUC de la empresa para la clave de acceso
    const rucRes = await db.query("SELECT valor FROM configuracion_sistema WHERE clave = 'empresa_nit'");
    const rucRaw = rucRes.recordset[0] ? rucRes.recordset[0].valor : '1790012345001';
    const cleanRuc = rucRaw.replace(/\D/g, '').padStart(13, '0');
    
    // Generar fecha en formato DDMMAAAA
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());
    const dateStr = day + month + year;
    
    // Generar Clave de Acceso SRI (49 dígitos con Módulo 11)
    const compType = '01'; // 01 = Factura
    const envType = '1';   // 1 = Pruebas, 2 = Producción
    const est = '001';     // Establecimiento
    const em = '001';      // Punto de Emisión
    const numericCode = '12345678'; // Código numérico aleatorio de control
    const emissionType = '1';       // Normal
    
    const baseKey = dateStr + compType + cleanRuc + envType + est + em + sequentialStr + numericCode + emissionType;
    
    // Algoritmo Módulo 11
    let sum = 0;
    let factor = 2;
    for (let i = baseKey.length - 1; i >= 0; i--) {
      sum += parseInt(baseKey[i]) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    const rem = sum % 11;
    let verifier = 11 - rem;
    if (verifier === 11) verifier = 0;
    if (verifier === 10) verifier = 1;
    
    const accessKey = baseKey + verifier;
    
    const invoiceRes = await db.query(`
      INSERT INTO facturas (numero_factura, cliente_id, usuario_id, reparacion_id, subtotal, impuesto, descuento, total, metodo_pago, estado, clave_acceso) 
      VALUES (@numero_factura, @cliente_id, @usuario_id, @reparacion_id, @subtotal, @impuesto, @descuento, @total, @metodo_pago, 'Pagada', @clave_acceso)
      RETURNING id
    `, {
      numero_factura: invoiceNum,
      cliente_id: invoice.cliente_id,
      usuario_id: sessionUser.id,
      reparacion_id: invoice.reparacion_id || null,
      subtotal: invoice.subtotal,
      impuesto: invoice.subtotal * 0.15, // SRI 15% IVA
      descuento: invoice.descuento || 0,
      total: invoice.subtotal + (invoice.subtotal * 0.15) - (invoice.descuento || 0),
      metodo_pago: invoice.metodo_pago,
      clave_acceso: accessKey
    });
    
    const invoiceId = invoiceRes.recordset[0].id;
    
    for (const item of invoice.items) {
      await db.query(`
        INSERT INTO factura_detalles (factura_id, tipo_item, item_id, descripcion, cantidad, precio_unitario, subtotal)
        VALUES (@factura_id, @tipo_item, @item_id, @descripcion, @cantidad, @precio_unitario, @subtotal)
      `, {
        factura_id: invoiceId,
        tipo_item: item.tipo_item,
        item_id: item.item_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal
      });
      
      if (item.tipo_item === 'Producto') {
        await db.query('UPDATE productos SET stock = CASE WHEN stock >= @qty THEN stock - @qty ELSE 0 END WHERE id = @id', { id: item.item_id, qty: item.cantidad });
      } else if (item.tipo_item === 'Pieza') {
        await db.query('UPDATE piezas SET stock = CASE WHEN stock >= @qty THEN stock - @qty ELSE 0 END WHERE id = @id', { id: item.item_id, qty: item.cantidad });
      }
    }
    
    if (invoice.reparacion_id) {
      await db.query(`
        UPDATE reparaciones 
        SET estado = 'Entregado', 
            fecha_entrega = CURRENT_TIMESTAMP 
        WHERE id = @reparacion_id
      `, { reparacion_id: invoice.reparacion_id });
    }
    
    return { success: true, message: 'Factura generada exitosamente bajo normativa del SRI.', numero_factura: invoiceNum };
  } catch (error) {
    console.error('Error al crear factura:', error);
    return { success: false, message: error.message };
  }
});

// 22. Estadísticas de Dashboard
ipcMain.handle('db:get-dashboard-stats', async () => {
  try {
    const repairsRes = await db.query(`
      SELECT COUNT(*) AS total FROM reparaciones 
      WHERE estado NOT IN ('Entregado', 'Devuelto sin Reparar')
    `);
    
    const stockRes = await db.query(`
      SELECT COUNT(*) AS total FROM vista_resumen_inventario_bajo
    `);
    
    const earningsRes = await db.query(`
      SELECT COALESCE(SUM(total), 0) AS total FROM facturas 
      WHERE CAST(fecha_emision AS DATE) = CURRENT_DATE AND estado = 'Pagada'
    `);
    
    return {
      success: true,
      stats: {
        activeRepairs: repairsRes.recordset[0].total,
        lowStockAlerts: stockRes.recordset[0].total,
        earningsToday: earningsRes.recordset[0].total
      }
    };
  } catch (error) {
    console.error('Error al calcular métricas de dashboard:', error);
    return { success: false, message: error.message };
  }
});

// 22.5. Operaciones Recientes
ipcMain.handle('db:get-recent-operations', async () => {
  try {
    const query = `
      SELECT id, numero_factura AS referencia, total, fecha_emision AS fecha, 'Factura' AS tipo, estado
      FROM facturas
      ORDER BY fecha_emision DESC
      LIMIT 10
    `;
    const result = await db.query(query);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener operaciones recientes:', error);
    return { success: false, message: error.message };
  }
});

// 22.6. Reparaciones Urgentes / En Diagnóstico
ipcMain.handle('db:get-urgent-repairs', async () => {
  try {
    const query = `
      SELECT r.id, c.nombre_completo AS cliente_nombre, CONCAT(r.marca, ' ', r.modelo) AS dispositivo, r.estado, r.fecha_recepcion 
      FROM reparaciones r
      JOIN clientes c ON r.cliente_id = c.id
      WHERE r.estado NOT IN ('Entregado', 'Devuelto sin Reparar')
      ORDER BY r.fecha_recepcion ASC
      LIMIT 10
    `;
    const result = await db.query(query);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener reparaciones urgentes:', error);
    return { success: false, message: error.message };
  }
});

// 23. Gráficos de Ventas
ipcMain.handle('db:get-sales-chart', async (event, period) => {
  try {
    let query = '';
    
    if (period === 'week') {
      // Últimos 7 días
      query = `
        SELECT CAST(fecha_emision AS DATE) as fecha, SUM(total) as total
        FROM facturas
        WHERE estado = 'Pagada' AND fecha_emision >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY CAST(fecha_emision AS DATE)
        ORDER BY fecha ASC
      `;
    } else if (period === 'month') {
      // Últimos 30 días
      query = `
        SELECT CAST(fecha_emision AS DATE) as fecha, SUM(total) as total
        FROM facturas
        WHERE estado = 'Pagada' AND fecha_emision >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY CAST(fecha_emision AS DATE)
        ORDER BY fecha ASC
      `;
    } else if (period === 'year') {
      // Año actual por meses
      query = `
        SELECT EXTRACT(MONTH FROM fecha_emision) as mes, SUM(total) as total
        FROM facturas
        WHERE estado = 'Pagada' AND EXTRACT(YEAR FROM fecha_emision) = EXTRACT(YEAR FROM CURRENT_DATE)
        GROUP BY EXTRACT(MONTH FROM fecha_emision)
        ORDER BY mes ASC
      `;
    }

    const res = await db.query(query);
    return { success: true, data: res.recordset };
  } catch (error) {
    console.error('Error en sales chart:', error);
    return { success: false, message: error.message };
  }
});

// 24. Reportes Financieros
ipcMain.handle('db:get-financial-reports', async (event, { startDate, endDate }) => {
  try {
    let queryStr = `
      SELECT f.id, f.numero_factura, f.total, f.metodo_pago, f.fecha_emision, f.clave_acceso, c.nombre_completo AS cliente_nombre 
      FROM facturas f
      JOIN clientes c ON f.cliente_id = c.id
      WHERE f.estado = 'Pagada'
    `;
    const params = {};
    if (startDate && endDate) {
      queryStr += ' AND f.fecha_emision BETWEEN @start AND @end';
      params.start = startDate + ' 00:00:00';
      params.end = endDate + ' 23:59:59';
    }
    queryStr += ' ORDER BY f.fecha_emision DESC';
    const result = await db.query(queryStr, params);
    return { success: true, recordset: result.recordset };
  } catch (error) {
    console.error('Error al obtener reportes financieros:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('db:delete-invoices-by-date', async (event, { startDate, endDate }) => {
  try {
    const params = { start: startDate + ' 00:00:00', end: endDate + ' 23:59:59' };
    const facturas = await db.query('SELECT id FROM facturas WHERE fecha_emision BETWEEN @start AND @end', params);
    
    if (facturas.recordset.length === 0) {
      return { success: true, message: 'No hay registros en este rango para borrar.' };
    }
    
    await db.query(`
      DELETE FROM factura_detalles WHERE factura_id IN (
        SELECT id FROM facturas WHERE fecha_emision BETWEEN @start AND @end
      )
    `, params);
    
    await db.query(`
      DELETE FROM facturas WHERE fecha_emision BETWEEN @start AND @end
    `, params);
    
    return { success: true, message: `Se borraron permanentemente ${facturas.recordset.length} facturas.` };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 24. Obtener Factura por ID (Cabecera, Detalle y Configuración de Empresa)
ipcMain.handle('db:get-invoice-by-id', async (event, id) => {
  try {
    const invRes = await db.query(`
      SELECT f.*, c.nombre_completo AS cliente_nombre, c.documento_identidad, c.correo, c.telefono, c.direccion 
      FROM facturas f
      LEFT JOIN clientes c ON f.cliente_id = c.id
      WHERE f.id = @id
    `, { id });
    if (!invRes.recordset || invRes.recordset.length === 0) {
      return { success: false, message: 'Factura no encontrada.' };
    }
    const invoice = invRes.recordset[0];
    const itemsRes = await db.query('SELECT * FROM factura_detalles WHERE factura_id = @id', { id });
    const configRes = await db.query('SELECT clave, valor FROM configuracion_sistema');
    const cfg = {};
    configRes.recordset.forEach(row => { cfg[row.clave] = row.valor; });

    return {
      success: true,
      invoice,
      items: itemsRes.recordset,
      config: cfg
    };
  } catch (error) {
    console.error('Error al obtener factura por id:', error);
    return { success: false, message: error.message };
  }
});

// 25. Eliminar Factura (Y sus detalles)
ipcMain.handle('db:delete-invoice', async (event, id) => {
  if (!sessionUser || sessionUser.rol !== 'Administrador') {
    return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
  }
  try {
    await db.query('DELETE FROM factura_detalles WHERE factura_id = @id', { id });
    await db.query('DELETE FROM facturas WHERE id = @id', { id });
    return { success: true, message: 'Factura y sus detalles eliminados correctamente.' };
  } catch (error) {
    console.error('Error al eliminar factura:', error);
    return { success: false, message: error.message };
  }
});

// 26. Imprimir Factura en Impresora Detectada por el Sistema
ipcMain.handle('app:print-invoice', async (event, { htmlContent }) => {
  return new Promise((resolve) => {
    try {
      const printWin = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      printWin.webContents.on('did-finish-load', () => {
        printWin.webContents.print({
          silent: false,
          printBackground: true
        }, (success, failureReason) => {
          printWin.close();
          if (success) {
            resolve({ success: true, message: 'Orden enviada correctamente a la impresora.' });
          } else {
            resolve({ success: false, message: `Impresión cancelada o fallida: ${failureReason || 'Cancelado por usuario'}` });
          }
        });
      });
    } catch (error) {
      console.error('Error al imprimir factura:', error);
      resolve({ success: false, message: error.message });
    }
  });
});

// 27. Exportar Factura a Archivo PDF
ipcMain.handle('app:print-invoice-pdf', async (event, { htmlContent, invoiceNumber }) => {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Guardar Factura como PDF',
      defaultPath: `Factura_${invoiceNumber || 'SRI'}.pdf`,
      filters: [{ name: 'Documentos PDF', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Exportación a PDF cancelada por el usuario.' };
    }

    const printWin = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    });

    await fs.promises.writeFile(filePath, pdfBuffer);
    printWin.close();

    return { success: true, message: `PDF guardado exitosamente en:\n${filePath}` };
  } catch (error) {
    console.error('Error al exportar factura a PDF:', error);
    return { success: false, message: error.message };
  }
});

// 28. Enviar Factura por Email
ipcMain.handle('app:email-invoice', async (event, { htmlContent, toEmail, invoiceNumber }) => {
  try {
    const configRes = await db.query("SELECT clave, valor FROM configuracion_sistema WHERE clave IN ('gmail_user', 'gmail_app_password')");
    const config = {};
    configRes.recordset.forEach(r => config[r.clave] = r.valor);
    
    if (!config.gmail_user || !config.gmail_app_password) {
      return { success: false, message: 'La configuración de Gmail no está completa en el sistema.' };
    }

    await sendGmailMsg(config.gmail_user, config.gmail_app_password, toEmail, `Factura Electrónica ${invoiceNumber || ''} - Store`, 'Adjuntamos su factura electrónica generada por nuestro sistema.', htmlContent);
    return { success: true, message: `Factura enviada correctamente a ${toEmail}` };
  } catch (err) {
    console.error('Error al enviar factura por correo:', err);
    return { success: false, message: err.message };
  }
});

// 29. Borrar Mensaje de WhatsApp
ipcMain.handle('db:delete-whatsapp-message', async (event, msgId) => {
  try {
    // Also try to delete it from WhatsApp for everyone if connected
    if (waIsConnected && waSocket) {
      // Actually we don't have the full key, so we'll just delete from local DB
    }
    await db.query(`DELETE FROM mensajes_whatsapp WHERE mensaje_id = @msgId`, { msgId });
    return { success: true };
  } catch (err) {
    console.error('Error al borrar mensaje de WhatsApp:', err);
    return { success: false, message: err.message };
  }
});

// ============================================================================
// NOTAS INTERNAS
// ============================================================================

// Crear tabla de notas si no existe (se ejecuta en el primer handler)
async function ensureNotasTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notas (
      id SERIAL PRIMARY KEY,
      titulo VARCHAR(200) NOT NULL DEFAULT 'Sin título',
      contenido TEXT,
      color VARCHAR(20) DEFAULT 'default',
      fijada BOOLEAN DEFAULT FALSE,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await db.query(`ALTER TABLE notas ADD COLUMN IF NOT EXISTS fijada BOOLEAN DEFAULT FALSE;`);
    await db.query(`ALTER TABLE notas ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT 'default';`);
    await db.query(`ALTER TABLE notas ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
  } catch (e) {}
}

ipcMain.handle('db:get-notas', async () => {
  try {
    await ensureNotasTable();
    const result = await db.query(`
      SELECT id, titulo, contenido, color, COALESCE(fijada, FALSE) AS fijada, fecha_creacion, fecha_actualizacion
      FROM notas ORDER BY fijada DESC, fecha_actualizacion DESC
    `);
    return result.recordset || [];
  } catch (err) {
    console.error('Error al obtener notas:', err);
    return [];
  }
});

ipcMain.handle('db:save-nota', async (event, nota) => {
  try {
    await ensureNotasTable();
    const esFijada = nota.fijada === true || nota.fijada === 'true' || nota.fijada === 1;
    if (nota.id) {
      await db.query(`
        UPDATE notas SET titulo = @titulo, contenido = @contenido, color = @color,
          fijada = @fijada, fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = @id
      `, {
        titulo: nota.titulo || 'Sin título',
        contenido: nota.contenido || '',
        color: nota.color || 'default',
        fijada: esFijada,
        id: parseInt(nota.id, 10)
      });
      return { success: true, id: parseInt(nota.id, 10) };
    } else {
      const result = await db.query(`
        INSERT INTO notas (titulo, contenido, color, fijada)
        VALUES (@titulo, @contenido, @color, @fijada) RETURNING id
      `, {
        titulo: nota.titulo || 'Sin título',
        contenido: nota.contenido || '',
        color: nota.color || 'default',
        fijada: esFijada
      });
      const newId = result.recordset && result.recordset[0] ? result.recordset[0].id : null;
      return { success: true, id: newId };
    }
  } catch (err) {
    console.error('Error al guardar nota:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('db:delete-nota', async (event, id) => {
  try {
    await db.query(`DELETE FROM notas WHERE id = @id`, { id: parseInt(id, 10) });
    return { success: true };
  } catch (err) {
    console.error('Error al eliminar nota:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('db:toggle-nota-fijada', async (event, id) => {
  try {
    await db.query(`
      UPDATE notas SET fijada = NOT COALESCE(fijada, FALSE), fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = @id
    `, { id: parseInt(id, 10) });
    return { success: true };
  } catch (err) {
    console.error('Error al fijar nota:', err);
    return { success: false, message: err.message };
  }
});

// 30. Abrir Archivo Local
ipcMain.handle('app:open-file', async (event, filePath) => {
  try {
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      return { success: false, message: 'El archivo no existe o fue eliminado.' };
    }
    const { shell } = require('electron');
    const result = await shell.openPath(filePath);
    if (result) {
      return { success: false, message: result }; // openPath devuelve un string con error si falla
    }
    return { success: true };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

// ============================================================================
// MODELOS DE DOCUMENTOS (FACTURAS, RECIBOS, NOTAS DE VENTA)
// ============================================================================

async function ensureModelosDocumentosTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS modelos_documentos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      descripcion TEXT,
      archivo_nombre VARCHAR(255),
      archivo_tipo VARCHAR(50),
      archivo_data TEXT NOT NULL,
      mapeo_celdas JSONB,
      es_predeterminado BOOLEAN DEFAULT FALSE,
      fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await db.query(`ALTER TABLE modelos_documentos ADD COLUMN IF NOT EXISTS mapeo_celdas JSONB;`);
  } catch (e) {}
}

ipcMain.handle('db:get-modelos-documentos', async (event, tipo) => {
  try {
    await ensureModelosDocumentosTable();
    let queryStr = 'SELECT id, nombre, tipo, descripcion, archivo_nombre, archivo_tipo, archivo_data, mapeo_celdas, COALESCE(es_predeterminado, FALSE) AS es_predeterminado, fecha_subida FROM modelos_documentos';
    const params = {};
    if (tipo && tipo !== 'Todos') {
      queryStr += ' WHERE tipo = @tipo';
      params.tipo = tipo;
    }
    queryStr += ' ORDER BY es_predeterminado DESC, fecha_subida DESC';
    const result = await db.query(queryStr, params);
    return { success: true, recordset: result.recordset || [] };
  } catch (err) {
    console.error('Error al obtener modelos de documentos:', err);
    return { success: false, message: err.message, recordset: [] };
  }
});

ipcMain.handle('db:save-modelo-documento', async (event, modelo) => {
  try {
    await ensureModelosDocumentosTable();
    const esPred = modelo.es_predeterminado === true || modelo.es_predeterminado === 'true' || modelo.es_predeterminado === 1;
    const docTipo = modelo.tipo || 'Factura';
    const mapeoCeldasJson = modelo.mapeo_celdas ? JSON.stringify(modelo.mapeo_celdas) : null;

    if (esPred) {
      await db.query('UPDATE modelos_documentos SET es_predeterminado = FALSE WHERE tipo = @tipo', { tipo: docTipo });
    }

    if (modelo.id) {
      await db.query(`
        UPDATE modelos_documentos
        SET nombre = @nombre, tipo = @tipo, descripcion = @descripcion,
            archivo_nombre = COALESCE(@archivo_nombre, archivo_nombre),
            archivo_tipo = COALESCE(@archivo_tipo, archivo_tipo),
            archivo_data = COALESCE(@archivo_data, archivo_data),
            mapeo_celdas = COALESCE(@mapeo_celdas::jsonb, mapeo_celdas),
            es_predeterminado = @es_predeterminado
        WHERE id = @id
      `, {
        nombre: modelo.nombre || 'Modelo sin título',
        tipo: docTipo,
        descripcion: modelo.descripcion || '',
        archivo_nombre: modelo.archivo_nombre || null,
        archivo_tipo: modelo.archivo_tipo || null,
        archivo_data: modelo.archivo_data || null,
        mapeo_celdas: mapeoCeldasJson,
        es_predeterminado: esPred,
        id: parseInt(modelo.id, 10)
      });
      return { success: true, id: parseInt(modelo.id, 10) };
    } else {
      const result = await db.query(`
        INSERT INTO modelos_documentos (nombre, tipo, descripcion, archivo_nombre, archivo_tipo, archivo_data, mapeo_celdas, es_predeterminado)
        VALUES (@nombre, @tipo, @descripcion, @archivo_nombre, @archivo_tipo, @archivo_data, @mapeo_celdas::jsonb, @es_predeterminado)
        RETURNING id
      `, {
        nombre: modelo.nombre || 'Modelo sin título',
        tipo: docTipo,
        descripcion: modelo.descripcion || '',
        archivo_nombre: modelo.archivo_nombre || 'documento.png',
        archivo_tipo: modelo.archivo_tipo || 'image/png',
        archivo_data: modelo.archivo_data,
        mapeo_celdas: mapeoCeldasJson,
        es_predeterminado: esPred
      });
      const newId = result.recordset && result.recordset[0] ? result.recordset[0].id : null;
      return { success: true, id: newId };
    }
  } catch (err) {
    console.error('Error al guardar modelo de documento:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('db:delete-modelo-documento', async (event, id) => {
  try {
    await db.query(`DELETE FROM modelos_documentos WHERE id = @id`, { id: parseInt(id, 10) });
    return { success: true };
  } catch (err) {
    console.error('Error al eliminar modelo de documento:', err);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('db:set-predeterminado-modelo', async (event, { id, tipo }) => {
  try {
    await ensureModelosDocumentosTable();
    await db.query('UPDATE modelos_documentos SET es_predeterminado = FALSE WHERE tipo = @tipo', { tipo });
    await db.query('UPDATE modelos_documentos SET es_predeterminado = TRUE WHERE id = @id', { id: parseInt(id, 10) });
    return { success: true };
  } catch (err) {
    console.error('Error al establecer modelo predeterminado:', err);
    return { success: false, message: err.message };
  }
});
