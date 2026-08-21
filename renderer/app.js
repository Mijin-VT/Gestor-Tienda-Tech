
window.addEventListener('error', function(event) {
  try {
    const fs = require('fs');
    fs.appendFileSync('error.log', (event.error ? event.error.stack : event.message) + '\n');
  } catch(e) {
    console.error('Failed to log error', e);
  }
});
window.addEventListener('unhandledrejection', function(event) {
  try {
    const fs = require('fs');
    fs.appendFileSync('error.log', (event.reason ? event.reason.stack : event.reason) + '\n');
  } catch(e) {
    console.error('Failed to log rejection', e);
  }
});
/* ============================================================================
   CONTROLADOR DE RENDERIZADO (FRONTEND LOGIC) - ELECTROFIX
   ============================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // --- CACHE DE ELEMENTOS DOM ---
  
  // Pantallas
  const loginScreen = document.getElementById('login-screen');
  const appScreen = document.getElementById('app-screen');
  
  // Login Form & UI
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('login-btn');
  const loginBtnText = document.getElementById('login-btn-text');
  const errorMessage = document.getElementById('error-message');
  
  // Status de Conexión
  const testConnBtn = document.getElementById('test-conn-btn');
  const dbStatus = document.getElementById('db-status');
  const dbStatusText = document.getElementById('db-status-text');
  
  // Sidebar & Navegación
  const menuItems = document.querySelectorAll('.menu-item');
  const viewPanels = document.querySelectorAll('.view-panel');
  const pageTitle = document.getElementById('page-title');
  const userRoleBadge = document.getElementById('user-role-badge');
  const profileName = document.getElementById('profile-name');
  const profileEmail = document.getElementById('profile-email');
  const logoutBtn = document.getElementById('logout-btn');
  
  // Variables de Sesión
  let currentUser = null;
  let systemConfig = {};
  
  // Variables del Carrito de Compras
  window.shoppingCart = [];
  
  window.addToCart = function(id, type, name, price) {
    const existing = window.shoppingCart.find(i => i.id === id && i.type === type);
    if (existing) {
      existing.qty++;
    } else {
      window.shoppingCart.push({
        id: id,
        type: type, // 'Producto' o 'Pieza'
        name: name,
        price: parseFloat(price),
        qty: 1
      });
    }
    showToast(`${name} añadido al carrito`, 'success');
    if (window.updateInvoiceCartUI) window.updateInvoiceCartUI();
  };

  window.clearCart = function() {
    window.shoppingCart = [];
    if (window.updateInvoiceCartUI) window.updateInvoiceCartUI();
  };

  function formatCurrency(amount) {
    const symbol = systemConfig.moneda_simbolo || '$';
    const code = systemConfig.moneda_codigo || 'USD';
    return `${symbol}${amount.toLocaleString()} ${code}`;
  }

  // --- 1. VERIFICACIÓN Y PRUEBA DE CONEXIÓN A BASE DE DATOS ---
  
  async function checkDbConnection() {
    dbStatusText.textContent = 'Verificando conexión...';
    dbStatus.className = 'db-status-badge status-disconnected';
    
    try {
      const response = await window.api.testConnection();
      if (response.success) {
        dbStatusText.textContent = 'PostgreSQL Conectado';
        dbStatus.className = 'db-status-badge status-connected';
        await loadSystemSettings();
      } else {
        dbStatusText.textContent = 'PostgreSQL Desconectado';
        dbStatus.className = 'db-status-badge status-disconnected';
        console.warn('Detalle error BD:', response.message);
      }
    } catch (error) {
      dbStatusText.textContent = 'Error de IPC';
      dbStatus.className = 'db-status-badge status-disconnected';
      console.error(error);
    }
  }

  // Verificar conexión inmediatamente al abrir la app
  checkDbConnection();

  // Botón para reintentar la conexión
  testConnBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    testConnBtn.disabled = true;
    testConnBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Probando...';
    
    await checkDbConnection();
    
    testConnBtn.disabled = false;
    testConnBtn.innerHTML = '<i class="fa-solid fa-database"></i> Probar Conexión SQL Server';
  });

  // --- 2. INICIO DE SESIÓN ---

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) return;

    // Resetear alertas
    errorMessage.style.display = 'none';
    errorMessage.textContent = '';
    
    // UI Loading state
    loginBtn.disabled = true;
    loginBtnText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';

    try {
      const response = await window.api.login(username, password);
      
      if (response.success) {
        currentUser = response.user;
        
        // Cargar configuración de negocio
        await loadSystemSettings();
        
        // Inicializar interfaz según el rol
        initializeRoleView(currentUser.rol);
        
        // Transicionar pantalla
        showMainApp();
      } else {
        showError(response.message);
      }
    } catch (error) {
      showError('Error de comunicación interna.');
      console.error(error);
    } finally {
      loginBtn.disabled = false;
      loginBtnText.textContent = 'Iniciar Sesión';
    }
  });

  function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.style.display = 'block';
    
    // Efecto de sacudida para indicar error
    const card = document.querySelector('.login-card');
    card.style.animation = 'none';
    setTimeout(() => {
      card.style.animation = 'shake 0.3s ease';
    }, 10);
  }

  // --- 3. CARGAR CONFIGURACIÓN GLOBAL ---

  async function loadSystemSettings() {
    try {
      const response = await window.api.getSystemConfig();
      if (response.success) {
        systemConfig = response.config;
        console.log('Configuración del sistema cargada.');
        
        // Actualizar elementos visuales dinámicos
        const shortName = systemConfig.empresa_nombre_corto || 'MAXItiendasTecserled';
        document.querySelectorAll('.sidebar-logo').forEach(el => {
          el.innerHTML = `<i class="fa-solid fa-microchip"></i> ${shortName}`;
        });
        
        const loginLogo = document.querySelector('.login-logo');
        if (loginLogo) loginLogo.innerHTML = `<i class="fa-solid fa-microchip"></i> ${shortName}`;
        
        document.title = `${shortName} - Sistema de Gestión y Facturación`;

        const welcomeTitle = document.getElementById('welcome-title');
        const welcomeText = document.getElementById('welcome-text');
        if (welcomeTitle) welcomeTitle.textContent = `¡Bienvenido a ${shortName}!`;
        if (welcomeText) welcomeText.textContent = systemConfig.contenido_bienvenida || 'Cargando configuraciones...';

        // Llenar el formulario de configuraciones
        populateSettingsForm();
      }
    } catch (error) {
      console.error('Error al cargar config de BD:', error);
    }
  }

  function populateSettingsForm() {
    const fields = {
      'set-empresa-nombre': systemConfig.empresa_nombre || '',
      'set-empresa-nombre-corto': systemConfig.empresa_nombre_corto || '',
      'set-contenido-bienvenida': systemConfig.contenido_bienvenida || '',
      'set-empresa-logo': systemConfig.empresa_logo || '',
      'set-empresa-banner': systemConfig.empresa_banner || '',
      'set-empresa-nit': systemConfig.empresa_nit || '',
      'set-empresa-telefono': systemConfig.empresa_telefono || '',
      'set-empresa-correo': systemConfig.empresa_correo || '',
      'set-empresa-direccion': systemConfig.empresa_direccion || '',
      'set-moneda-simbolo': systemConfig.moneda_simbolo || '',
      'set-moneda-codigo': systemConfig.moneda_codigo || '',
      'set-impuesto-iva': systemConfig.impuesto_iva_porcentaje || '',
      'set-telegram-bot-token': systemConfig.telegram_bot_token || '',
      'set-telegram-chat-id': systemConfig.telegram_chat_id || '',
      'set-gmail-user': systemConfig.gmail_user || '',
      'set-gmail-app-password': systemConfig.gmail_app_password || '',
      'set-whatsapp-phone-id': systemConfig.whatsapp_phone_id || '',
      'set-whatsapp-access-token': systemConfig.whatsapp_access_token || ''
    };

    for (const [id, value] of Object.entries(fields)) {
      const input = document.getElementById(id);
      if (input) input.value = value;
    }
  }

  // --- 4. CONFIGURAR VISTAS POR ROL (ADMIN VS STAFF) ---

  function initializeRoleView(role) {
    // Actualizar badges
    userRoleBadge.textContent = role;
    profileName.textContent = currentUser.nombre_completo;
    profileEmail.textContent = currentUser.correo;

    if (role === 'Administrador') {
      userRoleBadge.className = 'role-badge role-admin';
      
      // Mostrar todos los menús de administración
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
      document.querySelectorAll('.admin-only-card').forEach(el => el.style.display = 'flex');
      
      // Mostrar pantallas de control admin
      document.querySelectorAll('.admin-view-container').forEach(el => el.style.display = 'block');
      document.querySelectorAll('.staff-denied-container').forEach(el => el.style.display = 'none');
    } else {
      userRoleBadge.className = 'role-badge role-staff';
      
      // Ocultar menús y tarjetas de caja diarios para el staff ordinario
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.admin-only-card').forEach(el => el.style.display = 'none');
      
      // Mostrar vista de denegado en paneles protegidos (por si acaso acceden por consola)
      document.querySelectorAll('.admin-view-container').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.staff-denied-container').forEach(el => el.style.display = 'block');
    }
  }

  // --- 5. CAMBIO DE VENTANAS Y NAVEGACIÓN ---

  function showMainApp() {
    loginScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    // Esperar un frame para aplicar transición de opacidad suave
    requestAnimationFrame(() => {
      appScreen.classList.add('active');
    });
    
    // Regresar al dashboard por defecto
    switchView('dashboard-view');
  }

  function switchView(viewId) {
    // Desactivar todos los menús
    menuItems.forEach(item => item.classList.remove('active'));
    
    // Activar el menú clickeado
    const activeItem = Array.from(menuItems).find(item => item.getAttribute('data-target') === viewId);
    if (activeItem) activeItem.classList.add('active');
    
    // Ocultar todos los paneles
    viewPanels.forEach(panel => panel.classList.remove('active'));
    
    // Mostrar el panel objetivo
    const activePanel = document.getElementById(viewId);
    if (activePanel) {
      activePanel.classList.add('active');
      
      // Cambiar título superior
      const linkText = activeItem ? activeItem.querySelector('.menu-link').textContent.trim() : 'Dashboard';
      pageTitle.textContent = linkText;

      // Cargar datos asíncronos dinámicamente según la sección
      if (viewId === 'dashboard-view') {
        refreshDashboardStats();
      } else if (viewId === 'clients-view') {
        renderClients();
      } else if (viewId === 'repairs-view') {
        renderRepairs();
      } else if (viewId === 'queries-view') {
        renderQueries();
      } else if (viewId === 'users-view') {
        renderUsers();
      } else if (viewId === 'inventory-view') {
        renderInventory();
      } else if (viewId === 'orders-view') {
        renderOrders();
      } else if (viewId === 'import-view') {
        if (window.renderImportHistory) window.renderImportHistory();
      } else if (viewId === 'invoices-view') {
        renderInvoices();
      } else if (viewId === 'reports-view') {
        renderReports();
      } else if (viewId === 'services-view') {
        renderServices();
      } else if (viewId === 'techs-view') {
        renderTechs();
      } else if (viewId === 'notas-view') {
        if (typeof renderNotas === 'function') renderNotas();
      }
    }
  }

  // Eventos de clicks en el menú lateral
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      
      // Bloquear navegación si es Staff e intenta ir a reportes/configuración
      if (currentUser.rol !== 'Administrador' && (target === 'reports-view' || target === 'settings-view')) {
        console.warn('Acceso bloqueado: Requiere rol de Administrador.');
        return;
      }
      
      switchView(target);
    });
  });

  // --- 6. CERRAR SESIÓN (LOGOUT) ---

  logoutBtn.addEventListener('click', async () => {
    currentUser = null;
    appScreen.classList.remove('active');
    
    try {
      await window.api.logout();
    } catch (err) {
      console.error('Error durante el cierre de sesión:', err);
    }
    
    setTimeout(() => {
      appScreen.style.display = 'none';
      loginScreen.style.display = 'flex';
      
      // Limpiar inputs
      usernameInput.value = '';
      passwordInput.value = '';
      errorMessage.style.display = 'none';
      
      // Re-verificar conexión BD
      checkDbConnection();
    }, 200);
  });

  // --- 7. EVENTOS DE CONFIGURACIÓN ---
  const settingsForm = document.getElementById('settings-form');
  const resetSettingsBtn = document.getElementById('reset-settings-btn');
  const saveSettingsBtn = document.getElementById('save-settings-btn');

  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      saveSettingsBtn.disabled = true;
      saveSettingsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

      const configData = {
        empresa_nombre: document.getElementById('set-empresa-nombre').value.trim(),
        empresa_nombre_corto: document.getElementById('set-empresa-nombre-corto').value.trim(),
        contenido_bienvenida: document.getElementById('set-contenido-bienvenida').value.trim(),
        empresa_logo: document.getElementById('set-empresa-logo').value.trim(),
        empresa_banner: document.getElementById('set-empresa-banner').value.trim(),
        empresa_nit: document.getElementById('set-empresa-nit').value.trim(),
        empresa_telefono: document.getElementById('set-empresa-telefono').value.trim(),
        empresa_correo: document.getElementById('set-empresa-correo').value.trim(),
        empresa_direccion: document.getElementById('set-empresa-direccion').value.trim(),
        moneda_simbolo: document.getElementById('set-moneda-simbolo').value.trim(),
        moneda_codigo: document.getElementById('set-moneda-codigo').value.trim(),
        impuesto_iva_porcentaje: document.getElementById('set-impuesto-iva').value.trim(),
        telegram_bot_token: document.getElementById('set-telegram-bot-token').value.trim(),
        telegram_chat_id: document.getElementById('set-telegram-chat-id').value.trim(),
        gmail_user: document.getElementById('set-gmail-user').value.trim(),
        gmail_app_password: document.getElementById('set-gmail-app-password').value.trim()
      };

      try {
        const response = await window.api.saveSystemConfig(configData);
        if (response.success) {
          showToast('Configuración del sistema actualizada correctamente.', 'success');
          await loadSystemSettings();
        } else {
          showToast(`Error al guardar: ${response.message}`, 'error');
        }
      } catch (error) {
        console.error('Error al guardar configuración:', error);
        showToast('Error de red o IPC al guardar configuración.', 'error');
      } finally {
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Configuración';
      }
    });

    // Pruebas de Canales de Mensajería
    const testTelegramBtn = document.getElementById('test-telegram-btn');
    if (testTelegramBtn) {
      testTelegramBtn.addEventListener('click', async () => {
        const config = {
          telegram_bot_token: document.getElementById('set-telegram-bot-token').value.trim(),
          telegram_chat_id: document.getElementById('set-telegram-chat-id').value.trim()
        };
        if (!config.telegram_bot_token || !config.telegram_chat_id) {
          showToast('Debes ingresar el Bot Token y Chat ID de Telegram.', 'warning');
          return;
        }
        testTelegramBtn.disabled = true;
        testTelegramBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Probando...';
        try {
          const res = await window.api.testMessagingChannel('telegram', config);
          showToast(res.message, res.success ? 'success' : 'error');
        } catch (e) {
          showToast('Error al probar Telegram.', 'error');
        } finally {
          testTelegramBtn.disabled = false;
          testTelegramBtn.innerHTML = '<i class="fa-brands fa-telegram"></i> Probar Telegram';
        }
      });
    }

    const testGmailBtn = document.getElementById('test-gmail-btn');
    if (testGmailBtn) {
      testGmailBtn.addEventListener('click', async () => {
        const config = {
          gmail_user: document.getElementById('set-gmail-user').value.trim(),
          gmail_app_password: document.getElementById('set-gmail-app-password').value.trim()
        };
        if (!config.gmail_user || !config.gmail_app_password) {
          showToast('Debes ingresar el Correo Gmail y Contraseña de Aplicación.', 'warning');
          return;
        }
        testGmailBtn.disabled = true;
        testGmailBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
        try {
          const res = await window.api.testMessagingChannel('gmail', config);
          showToast(res.message, res.success ? 'success' : 'error');
        } catch (e) {
          showToast('Error al probar Gmail.', 'error');
        } finally {
          testGmailBtn.disabled = false;
          testGmailBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Probar Gmail';
        }
      });
    }



    resetSettingsBtn.addEventListener('click', () => {
      showConfirm('¿Descartar Cambios?', 'Se restablecerán los campos al último estado guardado en la base de datos.', () => {
        populateSettingsForm();
        showToast('Cambios descartados.', 'info');
      });
    });
  }

  // --- 8. SISTEMA DE NOTIFICACIONES TOAST ---
  function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${iconClass} toast-icon"></i>
      <div class="toast-content">
        <p class="toast-message">${message}</p>
      </div>
    `;

    toastContainer.appendChild(toast);

    // Auto eliminar después de 4 segundos
    setTimeout(() => {
      toast.style.animation = 'toastFadeOut 0.4s ease forwards';
      setTimeout(() => {
        toast.remove();
      }, 400);
    }, 3600);
  }
  window.showToast = showToast; // Exponer a consola o scripts externos

  // --- 9. DIÁLOGO DE CONFIRMACIÓN PERSONALIZADO ---
  const confirmModal = document.getElementById('confirm-modal');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmText = document.getElementById('confirm-text');
  const confirmYesBtn = document.getElementById('confirm-yes-btn');
  const confirmNoBtn = document.getElementById('confirm-no-btn');
  let currentConfirmCallback = null;

  function showConfirm(title, text, callback) {
    if (!confirmModal) return;
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    currentConfirmCallback = callback;
    confirmModal.style.display = 'flex';
  }
  window.showConfirm = showConfirm;

  if (confirmNoBtn) {
    confirmNoBtn.addEventListener('click', () => {
      confirmModal.style.display = 'none';
      currentConfirmCallback = null;
    });
  }

  if (confirmYesBtn) {
    confirmYesBtn.addEventListener('click', () => {
      confirmModal.style.display = 'none';
      if (currentConfirmCallback) currentConfirmCallback();
      currentConfirmCallback = null;
    });
  }

  // --- 10. OPERACIONES CRUD CON SQL SERVER ---
  let clientsData = [];
  let repairsData = [];
  let techsData = [];

  // MOCK temporal para consultas del portal (se mantendrá en memoria por ahora)
  let queriesData = [
    { id: 1, cliente_nombre: 'Alejandra Gómez', correo: 'ale.gomez@yahoo.com', telefono: '+57 320 888 7766', marca_modelo_dispositivo: 'Tablet Samsung S6 Lite', consulta: '¿Cuánto cuesta el cambio de pin de carga para este modelo?', estado: 'Pendiente', respuesta: '' }
  ];

  // Renderizar Clientes desde la Base de Datos
  async function renderClients(filterText = '') {
    const tbody = document.getElementById('clients-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando clientes...</td></tr>';
    
    try {
      const response = await window.api.getClients(filterText);
      if (response.success) {
        clientsData = response.recordset;
        tbody.innerHTML = '';
        
        if (clientsData.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dark);">No se encontraron clientes registrados.</td></tr>';
          return;
        }

        clientsData.forEach(c => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${c.nombre_completo}</strong></td>
            <td><code>${c.documento_identidad || 'Sin Documento'}</code></td>
            <td>${c.telefono || '-'}</td>
            <td>${c.correo || '-'}</td>
            <td>${c.direccion || '-'}</td>
            <td style="text-align: right;">
              <button class="action-btn action-edit" onclick="editClient(${c.id})" title="Editar"><i class="fa-solid fa-pencil"></i></button>
              <button class="action-btn action-delete" onclick="deleteClient(${c.id})" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error: ${response.message}</td></tr>`;
      }
    } catch (error) {
      console.error(error);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error de conexión al obtener clientes.</td></tr>';
    }
  }
  window.renderClients = renderClients;

  // Renderizar Reparaciones / Dispositivos desde la Base de Datos
  async function renderRepairs(filterText = '', filterStatus = '') {
    const tbody = document.getElementById('repairs-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando órdenes...</td></tr>';
    
    try {
      const response = await window.api.getRepairs(filterText);
      if (response.success) {
        repairsData = response.recordset;
        tbody.innerHTML = '';
        
        // Actualizar métricas del dashboard si estamos en él
        const activeRepairsCount = repairsData.filter(r => r.estado !== 'Entregado' && r.estado !== 'Devuelto sin Reparar').length;
        const activeRepairsCard = document.querySelector('.stats-grid .stat-card:first-child .stat-value');
        if (activeRepairsCard) activeRepairsCard.textContent = activeRepairsCount;

        let displayRepairs = repairsData;
        if (filterStatus && filterStatus !== '') {
          displayRepairs = displayRepairs.filter(r => r.estado === filterStatus);
        }

        if (displayRepairs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-dark);">No se encontraron órdenes de reparación.</td></tr>';
          return;
        }

        const statusOptions = [
          { value: 'Recibido', label: 'Recibido' },
          { value: 'En Diagnostico', label: 'En Diagnóstico' },
          { value: 'Presupuestado', label: 'Presupuestado' },
          { value: 'En Reparacion', label: 'En Reparación' },
          { value: 'Listo para Entrega', label: 'Listo para Entrega' },
          { value: 'Entregado', label: 'Entregado' },
          { value: 'Devuelto sin Reparar', label: 'Devuelto sin Reparar' }
        ];

        displayRepairs.forEach(r => {
          let badgeColor = '#3b82f6';
          if (r.estado === 'En Diagnostico' || r.estado === 'Presupuestado' || r.estado === 'En Reparacion') badgeColor = '#f59e0b';
          else if (r.estado === 'Listo para Entrega' || r.estado === 'Entregado') badgeColor = '#10b981';
          else if (r.estado === 'Devuelto sin Reparar') badgeColor = '#ef4444';

          const optionsHtml = statusOptions.map(opt => 
            `<option value="${opt.value}" ${r.estado === opt.value ? 'selected' : ''} style="background: var(--bg-secondary); color: var(--text-main); font-weight: 600;">${opt.label}</option>`
          ).join('');

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${r.cliente_nombre}</strong></td>
            <td>${r.tipo_dispositivo}</td>
            <td>${r.marca}</td>
            <td>${r.modelo}</td>
            <td><code>${r.numero_serie || '-'}</code></td>
            <td>$${Number(r.costo_estimado || 0).toLocaleString()}</td>
            <td>$${Number(r.abono || 0).toLocaleString()}</td>
            <td>
              <select onchange="changeRepairStatus(${r.id}, this.value)" 
                      title="Cambiar estado de la reparación en tiempo real" 
                      style="background-color: ${badgeColor}20; color: ${badgeColor}; border: 1px solid ${badgeColor}60; border-radius: 20px; padding: 4px 24px 4px 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; outline: none; transition: all 0.2s;">
                ${optionsHtml}
              </select>
            </td>
            <td style="text-align: right;">
              <button onclick="editRepair(${r.id})" title="Editar" style="background: none; border: none; padding: 0; cursor: pointer; color: #fbbf24; font-size: 1.1rem; margin-right: 15px;"><i class="fa-solid fa-pencil"></i></button>
              <button onclick="deleteRepair(${r.id})" title="Eliminar" style="background: none; border: none; padding: 0; cursor: pointer; color: #ef4444; font-size: 1.1rem;"><i class="fa-solid fa-trash-can"></i></button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">Error: ${response.message}</td></tr>`;
      }
    } catch (error) {
      console.error(error);
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--danger);">Error de conexión al obtener reparaciones.</td></tr>';
    }
  }
  window.renderRepairs = renderRepairs;

  window.changeRepairStatus = async function(id, newStatus) {
    const r = repairsData.find(x => x.id === id);
    if (!r) return;
    const oldStatus = r.estado;
    if (oldStatus === newStatus) return;

    r.estado = newStatus;
    if (newStatus === 'Entregado') {
      r.fecha_entrega = new Date();
    }
    showToast(`Actualizando orden #${r.id} a "${newStatus}"...`, 'info');
    try {
      const response = await window.api.saveRepair(r);
      if (response.success) {
        showToast(`Orden #${r.id}: Estado cambiado a "${newStatus}" exitosamente.`, 'success');
        const searchVal = document.getElementById('search-repairs') ? document.getElementById('search-repairs').value : '';
        const statusVal = document.getElementById('filter-repair-status') ? document.getElementById('filter-repair-status').value : '';
        renderRepairs(searchVal, statusVal);
      } else {
        r.estado = oldStatus;
        showToast(`No se pudo cambiar el estado: ${response.message}`, 'error');
        renderRepairs();
      }
    } catch (error) {
      console.error(error);
      r.estado = oldStatus;
      showToast('Error de conexión al cambiar estado de la reparación.', 'error');
      renderRepairs();
    }
  };

  // Renderizar Consultas del Portal desde la Base de Datos
  async function renderQueries(filterText = '') {
    const tbody = document.getElementById('queries-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando consultas...</td></tr>';
    
    try {
      const response = await window.api.getQueries(filterText);
      if (response.success) {
        queriesData = response.recordset;
        tbody.innerHTML = '';
        
        if (queriesData.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dark);">No hay consultas registradas de clientes.</td></tr>';
          return;
        }

        queriesData.forEach(q => {
          let badgeClass = 'badge-warning';
          if (q.estado === 'Respondida') badgeClass = 'badge-success';
          else if (q.estado === 'Cerrada') badgeClass = 'badge-danger';

          let channelBadge = '<span class="badge badge-primary"><i class="fa-solid fa-globe"></i> Web</span>';
          const ch = (q.canal_origen || 'Web').toLowerCase();
          if (ch === 'telegram') channelBadge = '<span class="badge" style="background:#0284c7;color:white;"><i class="fa-brands fa-telegram"></i> Telegram</span>';
          else if (ch === 'gmail') channelBadge = '<span class="badge" style="background:#dc2626;color:white;"><i class="fa-solid fa-envelope"></i> Gmail</span>';
          else if (ch === 'whatsapp') channelBadge = '<span class="badge" style="background:#16a34a;color:white;"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>';

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${channelBadge}</td>
            <td><strong>${q.cliente_nombre}</strong></td>
            <td>${q.correo}<br><span style="font-size:0.8rem;color:var(--text-dark);">${q.telefono || ''}</span></td>
            <td>${q.marca_modelo_dispositivo || '-'}</td>
            <td><span style="font-size:0.85rem;" title="${q.consulta}">${q.consulta.length > 50 ? q.consulta.substring(0, 50) + '...' : q.consulta}</span></td>
            <td><span class="badge ${badgeClass}">${q.estado}</span></td>
            <td style="text-align: right;">
              <div style="display: flex; gap: 5px; justify-content: flex-end;">
                <button class="action-btn action-view" onclick="respondQuery(${q.id})" style="font-size: 0.8rem;" title="Atender"><i class="fa-solid fa-reply"></i> Atender</button>
                <button class="action-btn action-delete" onclick="deleteQuery(${q.id})" style="font-size: 0.8rem;" title="Eliminar"><i class="fa-solid fa-trash"></i> Eliminar</button>
              </div>
            </td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error: ${response.message}</td></tr>`;
      }
    } catch (error) {
      console.error(error);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error de conexión al cargar consultas.</td></tr>';
    }
  }
  window.renderQueries = renderQueries;

  // --- 11. BINDINGS PARA SELECTORES COMBOBOX ---

  async function populateSelects() {
    const clientSelect = document.getElementById('repair-client');
    const techSelect = document.getElementById('repair-tech');
    
    try {
      const clientsResponse = await window.api.getClients('');
      const techsResponse = await window.api.getTechs();
      
      if (clientsResponse.success && clientSelect) {
        clientSelect.innerHTML = '';
        clientsResponse.recordset.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.nombre_completo} (${c.documento_identidad || 'Sin ID'})`;
          clientSelect.appendChild(opt);
        });
      }
      
      if (techsResponse.success && techSelect) {
        techsData = techsResponse.recordset;
        techSelect.innerHTML = '<option value="">Sin Técnico Asignado</option>';
        techsData.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.nombre_completo;
          techSelect.appendChild(opt);
        });
      }
    } catch (error) {
      console.error('Error al cargar datos para selectores:', error);
    }
  }

  // --- 12. OPERACIONES CRUD EN WINDOW (EXPOSICIÓN GLOBAL) ---

  // Editar Cliente
  window.editClient = function(id) {
    const c = clientsData.find(x => x.id === id);
    if (!c) return;
    
    document.getElementById('client-id').value = c.id;
    document.getElementById('client-name').value = c.nombre_completo;
    document.getElementById('client-document').value = c.documento_identidad || '';
    document.getElementById('client-phone').value = c.telefono || '';
    document.getElementById('client-email').value = c.correo || '';
    document.getElementById('client-address').value = c.direccion || '';
    
    document.getElementById('client-modal-title').textContent = 'Editar Cliente';
    document.getElementById('client-modal').style.display = 'flex';
  };

  // Eliminar Cliente
  window.deleteClient = function(id) {
    showConfirm('¿Eliminar Cliente?', 'Esta acción borrará al cliente de SQL Server.', async () => {
      try {
        const response = await window.api.deleteClient(id);
        if (response.success) {
          showToast('Cliente eliminado exitosamente.', 'success');
          renderClients();
        } else {
          showToast(`No se pudo eliminar: ${response.message}`, 'error');
        }
      } catch (error) {
        console.error(error);
        showToast('Error de conexión al eliminar cliente.', 'error');
      }
    });
  };

  // Generador de Número de Serie Automático (Ejemplo: AB123)
  function generateAutomaticSerial() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const l1 = letters.charAt(Math.floor(Math.random() * letters.length));
    const l2 = letters.charAt(Math.floor(Math.random() * letters.length));
    const num = String(Math.floor(100 + Math.random() * 900));
    return `${l1}${l2}${num}`;
  }
  window.generateAutomaticSerial = generateAutomaticSerial;

  // Editar Reparación
  window.editRepair = function(id) {
    const r = repairsData.find(x => x.id === id);
    if (!r) return;
    
    populateSelects().then(() => {
      document.getElementById('repair-id').value = r.id;
      document.getElementById('repair-client').value = r.cliente_id;
      document.getElementById('repair-device').value = r.tipo_dispositivo;
      document.getElementById('repair-brand').value = r.marca;
      document.getElementById('repair-model').value = r.modelo;
      document.getElementById('repair-serial').value = r.numero_serie || generateAutomaticSerial();
      document.getElementById('repair-fault').value = r.falla_reportada;
      document.getElementById('repair-diagnostico').value = r.diagnostico_tecnico || '';
      document.getElementById('repair-tech').value = r.tecnico_id || '';
      document.getElementById('repair-status').value = r.estado;
      document.getElementById('repair-cost').value = r.costo_estimado;
      document.getElementById('repair-advance').value = r.abono;

      // Formatear fecha para el input date (yyyy-MM-dd)
      if (r.fecha_prometida) {
        try {
          const dateObj = new Date(r.fecha_prometida);
          const yyyy = dateObj.getFullYear();
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(dateObj.getDate()).padStart(2, '0');
          document.getElementById('repair-promised-date').value = `${yyyy}-${mm}-${dd}`;
        } catch (e) {
          document.getElementById('repair-promised-date').value = '';
        }
      } else {
        document.getElementById('repair-promised-date').value = '';
      }

      document.getElementById('repair-modal-title').textContent = 'Editar Orden de Reparación';
      document.getElementById('repair-modal').style.display = 'flex';
    });
  };

  // Eliminar Reparación
  window.deleteRepair = function(id) {
    showConfirm('¿Eliminar Orden?', 'Esta acción eliminará la orden de reparación permanentemente de la base de datos.', async () => {
      try {
        const response = await window.api.deleteRepair(id);
        if (response.success) {
          showToast('Orden de reparación eliminada.', 'success');
          renderRepairs();
        } else {
          showToast(`No se pudo eliminar: ${response.message}`, 'error');
        }
      } catch (error) {
        console.error(error);
        showToast('Error de conexión al eliminar reparación.', 'error');
      }
    });
  };

  // Atender Consulta con Interfaz de Chat Multicanal
  window.respondQuery = function(id) {
    const q = queriesData.find(x => x.id === id);
    if (!q) return;

    document.getElementById('query-id').value = q.id;
    
    // Encabezado del cliente
    const senderHeader = document.getElementById('query-info-sender-header');
    if (senderHeader) {
      senderHeader.innerHTML = `<strong>${q.cliente_nombre}</strong> &bull; ${q.correo} &bull; ${q.telefono || ''}`;
    }

    // Equipo de referencia
    const deviceEl = document.getElementById('query-info-device');
    if (deviceEl) deviceEl.textContent = q.marca_modelo_dispositivo || 'Equipo General';

    // Insignia de canal en modal
    const modalBadge = document.getElementById('query-channel-badge-modal');
    const channel = q.canal_origen || 'Web';
    if (modalBadge) {
      let bHtml = '<span class="badge badge-primary"><i class="fa-solid fa-globe"></i> Web</span>';
      if (channel === 'Telegram') bHtml = '<span class="badge" style="background:#0284c7;color:white;"><i class="fa-brands fa-telegram"></i> Telegram</span>';
      else if (channel === 'Gmail') bHtml = '<span class="badge" style="background:#dc2626;color:white;"><i class="fa-solid fa-envelope"></i> Gmail</span>';
      else if (channel === 'WhatsApp') bHtml = '<span class="badge" style="background:#16a34a;color:white;"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>';
      modalBadge.innerHTML = bHtml;
    }

    // Avatar de canal
    const avatarEl = document.getElementById('query-info-avatar');
    if (avatarEl) {
      let icon = '<i class="fa-solid fa-comments"></i>';
      let color = 'var(--primary)';
      if (channel === 'Telegram') { icon = '<i class="fa-brands fa-telegram"></i>'; color = '#0284c7'; }
      else if (channel === 'Gmail') { icon = '<i class="fa-solid fa-envelope"></i>'; color = '#f87171'; }
      else if (channel === 'WhatsApp') { icon = '<i class="fa-brands fa-whatsapp"></i>'; color = '#16a34a'; }
      avatarEl.innerHTML = icon;
      avatarEl.style.color = color;
    }

    // Renderizar Burbujas de Chat
    const timeline = document.getElementById('query-chat-timeline');
    if (timeline) {
      timeline.innerHTML = '';

      // Burbuja entrante (Cliente)
      const incomingDiv = document.createElement('div');
      incomingDiv.className = 'chat-bubble chat-bubble-incoming';
      const dateStr = q.fecha_consulta ? new Date(q.fecha_consulta).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : 'Reciente';
      incomingDiv.innerHTML = `
        <div class="chat-bubble-header">
          <span style="font-weight: 600; color: var(--primary);"><i class="fa-solid fa-user"></i> ${q.cliente_nombre} (${channel})</span>
          <span style="color: var(--text-muted); font-size: 0.72rem;">${dateStr}</span>
        </div>
        <div>${q.consulta}</div>
      `;
      timeline.appendChild(incomingDiv);

      // Burbuja saliente (Staff - si existe respuesta previa)
      if (q.respuesta) {
        const outgoingDiv = document.createElement('div');
        outgoingDiv.className = 'chat-bubble chat-bubble-outgoing';
        const respDateStr = q.fecha_respuesta ? new Date(q.fecha_respuesta).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : 'Enviado';
        outgoingDiv.innerHTML = `
          <div class="chat-bubble-header">
            <span style="font-weight: 600; color: #a5b4fc;"><i class="fa-solid fa-headset"></i> Soporte MAXItiendas</span>
            <span style="color: rgba(255,255,255,0.7); font-size: 0.72rem;">${respDateStr}</span>
          </div>
          <div>${q.respuesta}</div>
        `;
        timeline.appendChild(outgoingDiv);
      }
      timeline.scrollTop = timeline.scrollHeight;
    }

    document.getElementById('query-response').value = q.respuesta || '';
    document.getElementById('query-status').value = q.estado === 'Pendiente' ? 'Respondida' : q.estado;
    
    const channelSelect = document.getElementById('query-channel-send');
    if (channelSelect) {
      channelSelect.value = channel;
      updateChannelNotice(channel, q);
    }

    document.getElementById('query-modal').style.display = 'flex';
  };

  function updateChannelNotice(channel, qData) {
    const noticeText = document.getElementById('query-channel-notice-text');
    const submitBtn = document.getElementById('query-submit-btn');
    if (!noticeText) return;

    let targetDesc = 'Portal Web Interno';
    let btnIcon = 'fa-paper-plane';

    if (channel === 'Telegram') {
      targetDesc = `Bot de Telegram &bull; Chat ID: ${qData ? (qData.telegram_chat_id || qData.telefono || 'ID de Chat') : 'Chat ID'}`;
      btnIcon = 'fa-telegram';
    } else if (channel === 'Gmail') {
      targetDesc = `Correo SMTP &bull; Destinatario: ${qData ? qData.correo : 'Correo del Cliente'}`;
      btnIcon = 'fa-envelope';
    } else if (channel === 'WhatsApp') {
      targetDesc = `WhatsApp Business API &bull; Número: ${qData ? qData.telefono : 'Teléfono'}`;
      btnIcon = 'fa-whatsapp';
    }

    noticeText.innerHTML = `Vía de Salida: <strong>${channel}</strong> (${targetDesc})`;
    if (submitBtn) {
      submitBtn.innerHTML = `<i class="fa-brands ${btnIcon} fa-solid"></i> Enviar por ${channel}`;
    }
  }

  // Listener para cambio en el selector de canal dentro de la modal
  const channelSelectModal = document.getElementById('query-channel-send');
  if (channelSelectModal) {
    channelSelectModal.addEventListener('change', (e) => {
      const qId = parseInt(document.getElementById('query-id').value);
      const qData = queriesData.find(x => x.id === qId);
      updateChannelNotice(e.target.value, qData);
    });
  }

  // Bindings para botones de respuesta rápida (plantillas)
  document.querySelectorAll('.quick-template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tmpl = btn.getAttribute('data-template');
      const textEl = document.getElementById('query-response');
      if (textEl && tmpl) {
        textEl.value = tmpl;
        textEl.focus();
      }
    });
  });

  // Eliminar Consulta
  window.deleteQuery = function(id) {
    showConfirm('¿Eliminar Consulta?', 'Esta acción eliminará la consulta permanentemente de la base de datos.', async () => {
      try {
        const response = await window.api.deleteQuery(id);
        if (response.success) {
          showToast('Consulta eliminada correctamente.', 'success');
          const modal = document.getElementById('query-modal');
          if (modal) modal.style.display = 'none';
          renderQueries();
        } else {
          showToast(`Error al eliminar: ${response.message}`, 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Error de conexión al eliminar consulta.', 'error');
      }
    });
  };

  // --- 13. BINDINGS PARA CREACIÓN Y ENVÍO DE FORMULARIOS ---

  // Cerrar modales genérico
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = btn.closest('.modal-overlay');
      if (modal) modal.style.display = 'none';
    });
  });

  // Abrir Nuevo Cliente
  const addClientBtn = document.getElementById('add-client-btn');
  if (addClientBtn) {
    addClientBtn.addEventListener('click', () => {
      document.getElementById('client-form').reset();
      document.getElementById('client-id').value = '';
      document.getElementById('client-modal-title').textContent = 'Registrar Cliente';
      document.getElementById('client-modal').style.display = 'flex';
    });
  }

  // Abrir Nueva Reparación
  const addRepairBtn = document.getElementById('add-repair-btn');
  if (addRepairBtn) {
    addRepairBtn.addEventListener('click', () => {
      populateSelects().then(() => {
        document.getElementById('repair-form').reset();
        document.getElementById('repair-id').value = '';
        document.getElementById('repair-modal-title').textContent = 'Registrar Reparación';
        const serialInput = document.getElementById('repair-serial');
        if (serialInput) {
          serialInput.value = generateAutomaticSerial();
        }
        document.getElementById('repair-modal').style.display = 'flex';
      });
    });
  }

  // Botón manual en modal para regenerar serie auto (ej: AB123)
  const btnGenSerial = document.getElementById('btn-generate-serial');
  if (btnGenSerial) {
    btnGenSerial.addEventListener('click', (e) => {
      e.preventDefault();
      const serialInput = document.getElementById('repair-serial');
      if (serialInput) {
        serialInput.value = generateAutomaticSerial();
        showToast(`Número de serie automático asignado: ${serialInput.value}`, 'info');
      }
    });
  }

  // Enviar Formulario de Cliente
  const clientForm = document.getElementById('client-form');
  if (clientForm) {
    clientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const id = document.getElementById('client-id').value;
      const nombre_completo = document.getElementById('client-name').value.trim();
      const documento_identidad = document.getElementById('client-document').value.trim();
      const telefono = document.getElementById('client-phone').value.trim();
      const correo = document.getElementById('client-email').value.trim();
      const direccion = document.getElementById('client-address').value.trim();

      const client = {
        nombre_completo,
        documento_identidad,
        telefono,
        correo,
        direccion
      };
      if (id) client.id = parseInt(id);

      try {
        const response = await window.api.saveClient(client);
        if (response.success) {
          showToast(response.message, 'success');
          document.getElementById('client-modal').style.display = 'none';
          renderClients();
        } else {
          showToast(`Error al guardar: ${response.message}`, 'error');
        }
      } catch (error) {
        console.error(error);
        showToast('Error de red al guardar cliente.', 'error');
      }
    });
  }

  // Enviar Formulario de Reparación
  const repairForm = document.getElementById('repair-form');
  if (repairForm) {
    repairForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const id = document.getElementById('repair-id').value;
      const cliente_id = parseInt(document.getElementById('repair-client').value);
      const tipo_dispositivo = document.getElementById('repair-device').value.trim();
      const marca = document.getElementById('repair-brand').value.trim();
      const modelo = document.getElementById('repair-model').value.trim();
      const numero_serie = document.getElementById('repair-serial').value.trim();
      const falla_reportada = document.getElementById('repair-fault').value.trim();
      const diagnostico_tecnico = document.getElementById('repair-diagnostico').value.trim();
      
      const techVal = document.getElementById('repair-tech').value;
      const tecnico_id = techVal ? parseInt(techVal) : null;
      
      const estado = document.getElementById('repair-status').value;
      const costo_estimado = parseFloat(document.getElementById('repair-cost').value) || 0;
      const abono = parseFloat(document.getElementById('repair-advance').value) || 0;
      const fecha_prometida = document.getElementById('repair-promised-date').value || null;

      const repair = {
        cliente_id,
        tipo_dispositivo,
        marca,
        modelo,
        numero_serie,
        falla_reportada,
        diagnostico_tecnico,
        tecnico_id,
        estado,
        costo_estimado,
        abono,
        fecha_prometida
      };
      if (id) repair.id = parseInt(id);

      try {
        const response = await window.api.saveRepair(repair);
        if (response.success) {
          showToast(response.message, 'success');
          document.getElementById('repair-modal').style.display = 'none';
          renderRepairs();
        } else {
          showToast(`Error al guardar: ${response.message}`, 'error');
        }
      } catch (error) {
        console.error(error);
        showToast('Error de red al guardar orden.', 'error');
      }
    });
  }

    // Enviar Formulario de Respuesta a Consulta
  const queryForm = document.getElementById('query-form');
  if (queryForm) {
    queryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = parseInt(document.getElementById('query-id').value);
      const respuesta = document.getElementById('query-response').value.trim();
      const estado = document.getElementById('query-status').value;
      const canal_envio = document.getElementById('query-channel-send') ? document.getElementById('query-channel-send').value : 'Web';

      try {
        const response = await window.api.respondQuery(id, respuesta, estado, canal_envio);
        if (response.success) {
          showToast(response.message, 'success');
          document.getElementById('query-modal').style.display = 'none';
          renderQueries();
        } else {
          showToast(`Error: ${response.message}`, 'error');
        }
      } catch (err) {
        showToast('Error de red al guardar respuesta.', 'error');
      }
    });
  }

  const deleteQueryModalBtn = document.getElementById('delete-query-modal-btn');
  if (deleteQueryModalBtn) {
    deleteQueryModalBtn.addEventListener('click', () => {
      const id = parseInt(document.getElementById('query-id').value);
      if (id) {
        deleteQuery(id);
      }
    });
  }

  // --- 14. CONTROLADOR DE USUARIOS ---
  async function renderUsers(filterText = '') {
    const tbody = document.getElementById('users-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando usuarios...</td></tr>';
    
    try {
      const response = await window.api.getUsers(filterText);
      if (response.success) {
        tbody.innerHTML = '';
        if (response.recordset.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dark);">No hay usuarios registrados.</td></tr>';
          return;
        }
        response.recordset.forEach(u => {
          const tr = document.createElement('tr');
          const badgeClass = u.activo ? 'badge-success' : 'badge-danger';
          const activeText = u.activo ? 'Activo' : 'Inactivo';
          tr.innerHTML = `
            <td><strong>${u.nombre_usuario}</strong></td>
            <td>${u.nombre_completo}</td>
            <td>${u.correo}</td>
            <td>${u.rol}</td>
            <td><span class="badge ${badgeClass}">${activeText}</span></td>
            <td style="text-align: right;">
              <button class="action-btn action-edit" onclick="editUser(${u.id})" title="Editar"><i class="fa-solid fa-pencil"></i></button>
              <button class="action-btn action-delete" onclick="deleteUser(${u.id})" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error: ${response.message}</td></tr>`;
      }
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error de conexión.</td></tr>';
    }
  }
  window.renderUsers = renderUsers;

  window.editUser = async function(id) {
    try {
      const response = await window.api.getUsers('');
      if (response.success) {
        const u = response.recordset.find(x => x.id === id);
        if (!u) return;
        
        document.getElementById('user-id').value = u.id;
        document.getElementById('user-username').value = u.nombre_usuario;
        document.getElementById('user-fullname').value = u.nombre_completo;
        document.getElementById('user-email').value = u.correo;
        document.getElementById('user-password').value = '';
        document.getElementById('user-role').value = u.rol;
        document.getElementById('user-active').checked = u.activo;
        
        document.getElementById('user-modal-title').textContent = 'Editar Usuario';
        document.getElementById('user-modal').style.display = 'flex';
      }
    } catch (e) {
      showToast('Error al cargar datos del usuario.', 'error');
    }
  };

  window.deleteUser = function(id) {
    showConfirm('¿Eliminar Usuario?', 'Esta acción removerá el usuario del sistema.', async () => {
      try {
        const response = await window.api.deleteUser(id);
        if (response.success) {
          showToast('Usuario eliminado correctamente.', 'success');
          renderUsers();
        } else {
          showToast(`Error al eliminar: ${response.message}`, 'error');
        }
      } catch (e) {
        showToast('Error de red al eliminar usuario.', 'error');
      }
    });
  };

  const userForm = document.getElementById('user-form');
  if (userForm) {
    userForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('user-id').value;
      const nombre_usuario = document.getElementById('user-username').value.trim();
      const nombre_completo = document.getElementById('user-fullname').value.trim();
      const correo = document.getElementById('user-email').value.trim();
      const contrasena = document.getElementById('user-password').value;
      const rol = document.getElementById('user-role').value;
      const activo = document.getElementById('user-active').checked;

      const user = { nombre_usuario, nombre_completo, correo, contrasena, rol, activo };
      if (id) user.id = parseInt(id);

      try {
        const response = await window.api.saveUser(user);
        if (response.success) {
          showToast(response.message, 'success');
          document.getElementById('user-modal').style.display = 'none';
          renderUsers();
        } else {
          showToast(`Error al guardar: ${response.message}`, 'error');
        }
      } catch (e) {
        showToast('Error de red al guardar usuario.', 'error');
      }
    });
  }

  const addUserBtn = document.getElementById('add-user-btn');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', () => {
      document.getElementById('user-form').reset();
      document.getElementById('user-id').value = '';
      document.getElementById('user-modal-title').textContent = 'Registrar Usuario';
      document.getElementById('user-modal').style.display = 'flex';
    });
  }

  // --- 14b. CONTROLADOR DE SERVICIOS ---
  let servicesData = [];

  async function renderServices(filterText = '') {
    const tbody = document.getElementById('services-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando servicios...</td></tr>';
    
    try {
      const response = await window.api.getServices(filterText);
      if (response.success) {
        servicesData = response.recordset;
        tbody.innerHTML = '';
        if (servicesData.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dark);">No hay servicios registrados.</td></tr>';
          return;
        }
        servicesData.forEach(s => {
          const tr = document.createElement('tr');
          const isAct = s.activo === true || s.activo === 1;
          const badgeClass = isAct ? 'badge-success' : 'badge-danger';
          const activeText = isAct ? 'Activo' : 'Inactivo';
          const price = parseFloat(s.precio_estandar) || 0;
          tr.innerHTML = `
            <td><strong>${s.nombre}</strong></td>
            <td>${s.descripcion || '-'}</td>
            <td><strong>${formatCurrency(price)}</strong></td>
            <td><span class="badge ${badgeClass}">${activeText}</span></td>
            <td style="text-align: right; display: flex; justify-content: flex-end; gap: 4px;">
              <button class="action-btn action-edit" onclick="editService(${s.id})" title="Editar"><i class="fa-solid fa-pencil"></i></button>
              <button class="action-btn action-delete" onclick="deleteService(${s.id})" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
              <button class="action-btn" onclick="addToCart(${s.id}, 'Servicio', '${s.nombre.replace(/'/g, "\\'")}', ${price})" title="Añadir a Nueva Factura" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-cart-plus"></i></button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Error: ${response.message}</td></tr>`;
      }
    } catch (e) {
      console.error(e);
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger);">Error de conexión al cargar servicios.</td></tr>';
    }
  }
  window.renderServices = renderServices;

  window.editService = function(id) {
    const s = servicesData.find(x => x.id === id);
    if (!s) return;
    
    document.getElementById('service-id').value = s.id;
    document.getElementById('service-name').value = s.nombre;
    document.getElementById('service-desc').value = s.descripcion || '';
    document.getElementById('service-price').value = s.precio_estandar;
    document.getElementById('service-active').checked = s.activo === true || s.activo === 1;
    
    document.getElementById('service-modal-title').textContent = 'Editar Servicio';
    document.getElementById('service-modal').style.display = 'flex';
  };

  window.deleteService = function(id) {
    showConfirm('¿Eliminar Servicio?', 'Esta acción removerá el servicio del catálogo.', async () => {
      try {
        const response = await window.api.deleteService(id);
        if (response.success) {
          showToast('Servicio eliminado correctamente.', 'success');
          renderServices();
        } else {
          showToast(`Error al eliminar: ${response.message}`, 'error');
        }
      } catch (e) {
        showToast('Error de red al eliminar servicio.', 'error');
      }
    });
  };

  const addServiceBtn = document.getElementById('add-service-btn');
  if (addServiceBtn) {
    addServiceBtn.addEventListener('click', () => {
      document.getElementById('service-form').reset();
      document.getElementById('service-id').value = '';
      document.getElementById('service-modal-title').textContent = 'Agregar Servicio';
      document.getElementById('service-modal').style.display = 'flex';
    });
  }

  const serviceForm = document.getElementById('service-form');
  if (serviceForm) {
    serviceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('service-id').value;
      const nombre = document.getElementById('service-name').value.trim();
      const descripcion = document.getElementById('service-desc').value.trim();
      const precio_estandar = parseFloat(document.getElementById('service-price').value) || 0;
      const activo = document.getElementById('service-active').checked;

      const service = { nombre, descripcion, precio_estandar, activo };
      if (id) service.id = parseInt(id);

      try {
        const response = await window.api.saveService(service);
        if (response.success) {
          showToast(response.message, 'success');
          document.getElementById('service-modal').style.display = 'none';
          renderServices();
        } else {
          showToast(`Error al guardar: ${response.message}`, 'error');
        }
      } catch (e) {
        showToast('Error de red al guardar servicio.', 'error');
      }
    });
  }

  // --- 14c. CONTROLADOR DE TÉCNICOS ---
  let fullTechsData = [];

  async function renderTechs(filterText = '') {
    const tbody = document.getElementById('techs-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando técnicos...</td></tr>';
    
    try {
      const response = await window.api.getTechs(filterText);
      if (response.success) {
        fullTechsData = response.recordset;
        tbody.innerHTML = '';
        if (fullTechsData.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-dark);">No hay técnicos registrados.</td></tr>';
          return;
        }
        fullTechsData.forEach(t => {
          const tr = document.createElement('tr');
          const isAct = t.activo === true || t.activo === 1;
          const badgeClass = isAct ? 'badge-success' : 'badge-danger';
          const activeText = isAct ? 'Activo' : 'Inactivo';
          const contact = [t.telefono, t.correo].filter(Boolean).join(' / ') || '-';
          const linkedUser = t.nombre_usuario ? `<code>@${t.nombre_usuario}</code>` : '<span style="color: var(--text-muted);">-</span>';
          
          tr.innerHTML = `
            <td><strong>${t.nombre_completo}</strong></td>
            <td>${t.especialidad}</td>
            <td>${contact}</td>
            <td>${linkedUser}</td>
            <td><span class="badge ${badgeClass}">${activeText}</span></td>
            <td style="text-align: right;">
              <button class="action-btn action-edit" onclick="editTech(${t.id})" title="Editar"><i class="fa-solid fa-pencil"></i></button>
              <button class="action-btn action-delete" onclick="deleteTech(${t.id})" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error: ${response.message}</td></tr>`;
      }
    } catch (e) {
      console.error(e);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Error de conexión al cargar técnicos.</td></tr>';
    }
  }
  window.renderTechs = renderTechs;

  async function populateUserSelectForTech(selectedUserId = '') {
    const userSelect = document.getElementById('tech-user-id');
    if (!userSelect) return;
    userSelect.innerHTML = '<option value="">Sin Usuario Enlazado</option>';
    try {
      const response = await window.api.getUsers('');
      if (response.success) {
        response.recordset.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = `${u.nombre_completo} (@${u.nombre_usuario})`;
          if (String(u.id) === String(selectedUserId)) opt.selected = true;
          userSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.error('Error al cargar lista de usuarios para técnicos:', e);
    }
  }

  window.editTech = async function(id) {
    const t = fullTechsData.find(x => x.id === id);
    if (!t) return;
    
    await populateUserSelectForTech(t.usuario_id || '');
    
    document.getElementById('tech-id').value = t.id;
    document.getElementById('tech-name').value = t.nombre_completo;
    document.getElementById('tech-specialty').value = t.especialidad;
    document.getElementById('tech-phone').value = t.telefono || '';
    document.getElementById('tech-email').value = t.correo || '';
    document.getElementById('tech-user-id').value = t.usuario_id || '';
    document.getElementById('tech-active').checked = t.activo === true || t.activo === 1;
    
    document.getElementById('tech-modal-title').textContent = 'Editar Técnico';
    document.getElementById('tech-modal').style.display = 'flex';
  };

  window.deleteTech = function(id) {
    showConfirm('¿Eliminar Técnico?', 'Esta acción borrará al técnico del sistema.', async () => {
      try {
        const response = await window.api.deleteTech(id);
        if (response.success) {
          showToast('Técnico eliminado correctamente.', 'success');
          renderTechs();
        } else {
          showToast(`Error al eliminar: ${response.message}`, 'error');
        }
      } catch (e) {
        showToast('Error de red al eliminar técnico.', 'error');
      }
    });
  };

  const addTechBtn = document.getElementById('add-tech-btn');
  if (addTechBtn) {
    addTechBtn.addEventListener('click', async () => {
      document.getElementById('tech-form').reset();
      document.getElementById('tech-id').value = '';
      await populateUserSelectForTech();
      document.getElementById('tech-modal-title').textContent = 'Agregar Técnico';
      document.getElementById('tech-modal').style.display = 'flex';
    });
  }

  const techForm = document.getElementById('tech-form');
  if (techForm) {
    techForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('tech-id').value;
      const nombre_completo = document.getElementById('tech-name').value.trim();
      const especialidad = document.getElementById('tech-specialty').value.trim();
      const telefono = document.getElementById('tech-phone').value.trim();
      const correo = document.getElementById('tech-email').value.trim();
      const userVal = document.getElementById('tech-user-id').value;
      const usuario_id = userVal ? parseInt(userVal) : null;
      const activo = document.getElementById('tech-active').checked;

      const tech = { nombre_completo, especialidad, telefono, correo, usuario_id, activo };
      if (id) tech.id = parseInt(id);

      try {
        const response = await window.api.saveTech(tech);
        if (response.success) {
          showToast(response.message, 'success');
          document.getElementById('tech-modal').style.display = 'none';
          renderTechs();
        } else {
          showToast(`Error al guardar: ${response.message}`, 'error');
        }
      } catch (e) {
        showToast('Error de red al guardar técnico.', 'error');
      }
    });
  }

  // --- 15. CONTROLADOR DE INVENTARIO ---
  let currentInventoryPage = 1;
  const INVENTORY_ITEMS_PER_PAGE = 50;
  let allInventoryData = [];

  async function renderInventory(filterText = '') {
    const tbody = document.getElementById('inventory-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando inventario...</td></tr>';
    
    try {
      const response = await window.api.getInventory(filterText);
      if (response.success) {
        allInventoryData = response.recordset;
        renderInventoryPage();
      } else {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 20px;">Error: ${response.message}</td></tr>`;
      }
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 20px;">Error de conexión.</td></tr>';
    }
  }

  function renderInventoryPage() {
    const tbody = document.getElementById('inventory-list-tbody');
    if (!tbody) return;
    
    const totalItems = allInventoryData.length;
    const totalPages = Math.ceil(totalItems / INVENTORY_ITEMS_PER_PAGE) || 1;
    if (currentInventoryPage > totalPages) currentInventoryPage = totalPages;
    if (currentInventoryPage < 1) currentInventoryPage = 1;
    
    const startIndex = (currentInventoryPage - 1) * INVENTORY_ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + INVENTORY_ITEMS_PER_PAGE, totalItems);
    
    // Update pagination info text
    const infoText = document.getElementById('inventory-pagination-info');
    if (infoText) {
      infoText.textContent = `Mostrando ${totalItems === 0 ? 0 : startIndex + 1}–${endIndex} de ${totalItems} productos`;
    }

    // Update pagination controls
    const controlsContainer = document.getElementById('inventory-pagination-controls');
    if (controlsContainer) {
      let controlsHtml = `
        <button class="btn-page" onclick="window.goToInventoryPage(${currentInventoryPage - 1})" ${currentInventoryPage === 1 ? 'disabled' : ''} style="background: ${currentInventoryPage === 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}; border: none; color: ${currentInventoryPage === 1 ? '#6b7280' : '#fff'}; cursor: ${currentInventoryPage === 1 ? 'not-allowed' : 'pointer'}; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem;">&laquo;</button>
        <button class="btn-page" onclick="window.goToInventoryPage(${currentInventoryPage - 1})" ${currentInventoryPage === 1 ? 'disabled' : ''} style="background: ${currentInventoryPage === 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}; border: none; color: ${currentInventoryPage === 1 ? '#6b7280' : '#fff'}; cursor: ${currentInventoryPage === 1 ? 'not-allowed' : 'pointer'}; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem;">Anterior</button>
      `;

      // Calculate which page numbers to show (e.g. max 5 buttons)
      let startPage = Math.max(1, currentInventoryPage - 2);
      let endPage = Math.min(totalPages, startPage + 4);
      if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
      }

      for (let i = startPage; i <= endPage; i++) {
        const isActive = i === currentInventoryPage;
        controlsHtml += `
          <button class="btn-page" onclick="window.goToInventoryPage(${i})" style="background: ${isActive ? '#3b82f6' : 'rgba(255,255,255,0.05)'}; border: none; color: #fff; cursor: pointer; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: ${isActive ? 'bold' : 'normal'};">${i}</button>
        `;
      }

      controlsHtml += `
        <button class="btn-page" onclick="window.goToInventoryPage(${currentInventoryPage + 1})" ${currentInventoryPage === totalPages ? 'disabled' : ''} style="background: ${currentInventoryPage === totalPages ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}; border: none; color: ${currentInventoryPage === totalPages ? '#6b7280' : '#fff'}; cursor: ${currentInventoryPage === totalPages ? 'not-allowed' : 'pointer'}; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem;">Siguiente</button>
        <button class="btn-page" onclick="window.goToInventoryPage(${currentInventoryPage + 1})" ${currentInventoryPage === totalPages ? 'disabled' : ''} style="background: ${currentInventoryPage === totalPages ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}; border: none; color: ${currentInventoryPage === totalPages ? '#6b7280' : '#fff'}; cursor: ${currentInventoryPage === totalPages ? 'not-allowed' : 'pointer'}; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem;">&raquo;</button>
      `;
      controlsContainer.innerHTML = controlsHtml;
    }
    
    // Clear old text from somewhere else if it exists
    const countText = document.getElementById('inventory-count-text');
    if (countText) countText.textContent = '';
    
    tbody.innerHTML = '';
    if (totalItems === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-dark); padding: 40px;">No se encontraron productos.</td></tr>';
      return;
    }
    
    const pageItems = allInventoryData.slice(startIndex, endIndex);

    pageItems.forEach((i, index) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--card-border)';
      tr.style.transition = 'background-color 0.2s';
      tr.onmouseover = () => tr.style.backgroundColor = 'rgba(255,255,255,0.02)';
      tr.onmouseout = () => tr.style.backgroundColor = 'transparent';

      const isLow = i.stock <= i.stock_minimo;
      
      const itemNumber = startIndex + index + 1;
      
      tr.innerHTML = `
        <td style="padding: 12px 16px; color: var(--text-muted); font-size: 0.9rem;">${itemNumber}</td>
        <td style="padding: 12px 16px; color: var(--text-muted); font-size: 0.9rem;">${i.id}</td>
        <td style="padding: 12px 16px; color: var(--text-muted); font-size: 0.9rem;">${i.codigo || '-'}</td>
        <td style="padding: 12px 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(255,255,255,0.05); display: flex; justify-content: center; align-items: center; flex-shrink: 0;">
              <i class="fa-solid fa-box-open" style="color: rgba(255,255,255,0.3); font-size: 1.2rem;"></i>
            </div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 600; color: var(--text-main); font-size: 0.9rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${i.nombre}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${i.compatibilidad || 'N/A'}</span>
            </div>
          </div>
        </td>
        <td style="padding: 12px 16px; color: var(--text-muted); font-size: 0.9rem;">${i.tipo_item}</td>
        <td style="padding: 12px 16px; font-weight: 600; color: #3b82f6; font-size: 0.95rem;">$${i.precio_venta.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td style="padding: 12px 16px; text-align: center;">
          <span style="font-weight: 600; font-size: 0.9rem; ${isLow ? 'color: var(--danger);' : 'color: var(--success);'}">${i.stock}</span>
        </td>
        <td style="padding: 12px 16px; text-align: right;">
          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button class="action-btn" onclick="adjustStockModal(${i.id}, '${i.tipo_item}', '${i.nombre.replace(/'/g, "\\'")}')" title="Ajustar Stock" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.05); color: var(--text-muted); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">
              <i class="fa-solid fa-boxes-stacked"></i>
            </button>
            <button class="action-btn" onclick="editInventoryItem(${i.id}, '${i.tipo_item}')" title="Editar" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.05); color: var(--text-muted); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">
              <i class="fa-solid fa-pencil"></i>
            </button>
            <button class="action-btn" onclick="addToCart(${i.id}, '${i.tipo_item}', '${i.nombre.replace(/'/g, "\\'")}', ${i.precio_venta})" title="Añadir a Nueva Factura" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: 4px;">
              <i class="fa-solid fa-cart-plus"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  window.renderInventory = renderInventory;
  window.renderInventoryPage = renderInventoryPage;
  window.goToInventoryPage = function(page) {
    currentInventoryPage = page;
    renderInventoryPage();
  };

  window.editInventoryItem = async function(id, tipo) {
    try {
      const response = await window.api.getInventory('');
      if (response.success) {
        const item = response.recordset.find(x => x.id === id && x.tipo_item === tipo);
        if (!item) return;
        
        document.getElementById('inventory-id').value = item.id;
        document.getElementById('inventory-type').value = item.tipo_item;
        document.getElementById('inventory-code').value = item.codigo;
        document.getElementById('inventory-name').value = item.nombre;
        document.getElementById('inventory-desc').value = item.descripcion || '';
        document.getElementById('inventory-cost').value = item.precio_compra;
        document.getElementById('inventory-price').value = item.precio_venta;
        
        document.getElementById('inventory-stock-row').style.display = 'none';
        document.getElementById('inventory-min-stock').value = item.stock_minimo;
        document.getElementById('inventory-compat').value = item.compatibilidad || '';
        
        document.getElementById('inventory-active').checked = item.activo;
        document.getElementById('inventory-modal-title').textContent = 'Editar Artículo';
        document.getElementById('inventory-modal').style.display = 'flex';
      }
    } catch (e) {
      showToast('Error al cargar datos del artículo.', 'error');
    }
  };

  window.adjustStockModal = function(id, tipo, name) {
    document.getElementById('stock-item-id').value = id;
    document.getElementById('stock-item-type').value = tipo;
    document.getElementById('stock-item-name').textContent = name;
    document.getElementById('stock-qty').value = 1;
    document.getElementById('stock-reason').value = '';
    
    document.getElementById('stock-modal').style.display = 'flex';
  };

  const inventoryForm = document.getElementById('inventory-form');
  if (inventoryForm) {
    inventoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('inventory-id').value;
      const tipo_item = document.getElementById('inventory-type').value;
      const codigo = document.getElementById('inventory-code').value.trim();
      const nombre = document.getElementById('inventory-name').value.trim();
      const descripcion = document.getElementById('inventory-desc').value.trim();
      const precio_compra = parseFloat(document.getElementById('inventory-cost').value) || 0;
      const precio_venta = parseFloat(document.getElementById('inventory-price').value) || 0;
      const stock = parseFloat(document.getElementById('inventory-stock').value) || 0;
      const stock_minimo = parseFloat(document.getElementById('inventory-min-stock').value) || 0;
      const compatibilidad = document.getElementById('inventory-compat').value.trim();
      const activo = document.getElementById('inventory-active').checked;

      const item = { tipo_item, codigo, nombre, descripcion, precio_compra, precio_venta, stock, stock_minimo, compatibilidad, activo };
      if (id) item.id = parseInt(id);

      try {
        const response = await window.api.saveInventoryItem(item);
        if (response.success) {
          showToast(response.message, 'success');
          document.getElementById('inventory-modal').style.display = 'none';
          renderInventory();
          refreshDashboardStats();
        } else {
          showToast(`Error al guardar: ${response.message}`, 'error');
        }
      } catch (e) {
        showToast('Error de red al guardar artículo.', 'error');
      }
    });
  }

  const stockForm = document.getElementById('stock-form');
  if (stockForm) {
    stockForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const itemId = parseInt(document.getElementById('stock-item-id').value);
      const tipoItem = document.getElementById('stock-item-type').value;
      const cantidad = parseInt(document.getElementById('stock-qty').value);
      const tipoMovimiento = document.getElementById('stock-move-type').value;
      const descripcion = document.getElementById('stock-reason').value.trim();

      try {
        const response = await window.api.adjustStock(itemId, tipoItem, cantidad, tipoMovimiento, descripcion);
        if (response.success) {
          showToast(response.message, 'success');
          document.getElementById('stock-modal').style.display = 'none';
          renderInventory();
          refreshDashboardStats();
        } else {
          showToast(`Error al ajustar stock: ${response.message}`, 'error');
        }
      } catch (e) {
        showToast('Error al conectar con la base de datos.', 'error');
      }
    });
  }

  const addInventoryBtn = document.getElementById('add-inventory-btn');
  if (addInventoryBtn) {
    addInventoryBtn.addEventListener('click', () => {
      document.getElementById('inventory-form').reset();
      document.getElementById('inventory-id').value = '';
      document.getElementById('inventory-stock-row').style.display = 'grid';
      document.getElementById('inventory-modal-title').textContent = 'Agregar Artículo';
      document.getElementById('inventory-modal').style.display = 'flex';
    });
  }

  // --- 16. CONTROLADOR DE FACTURACIÓN Y REPORTES ---
  async function renderInvoices() {
    const tbody = document.getElementById('invoices-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando facturas...</td></tr>';
    
    try {
      const response = await window.api.getFinancialReports('', '');
      if (response.success) {
        tbody.innerHTML = '';
        if (response.recordset.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-dark);">No hay facturas emitidas.</td></tr>';
          return;
        }
        response.recordset.forEach(f => {
          const dateStr = new Date(f.fecha_emision).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${f.numero_factura}</strong></td>
            <td>${f.cliente_nombre || 'Cliente General'}</td>
            <td>${dateStr}</td>
            <td>${f.metodo_pago}</td>
            <td><strong>${formatCurrency(f.total)}</strong></td>
            <td>
              <code class="sri-key-copy" title="Haga clic para copiar clave de acceso" style="cursor: pointer; background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 0.8rem; border: 1px solid var(--card-border);" onclick="navigator.clipboard.writeText('${f.clave_acceso || ''}').then(() => alert('Clave de acceso copiada al portapapeles.'))">
                ${f.clave_acceso || 'N/D'}
              </code>
            </td>
            <td style="text-align: right;">
              <div style="display: flex; gap: 6px; justify-content: flex-end;">
                <button class="action-btn action-view" onclick="previewInvoice(${f.id})" title="Ver / Imprimir en Impresora o PDF"><i class="fa-solid fa-print"></i></button>
                <button class="action-btn action-email" onclick="sendInvoiceEmail(${f.id})" title="Enviar Factura por Email" style="color: #10b981; border-color: rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.05);"><i class="fa-solid fa-envelope"></i></button>
                <button class="action-btn action-delete" onclick="deleteInvoice(${f.id})" title="Eliminar Factura"><i class="fa-solid fa-trash-can"></i></button>
              </div>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (e) {
      console.error(e);
    }
  }
  window.renderInvoices = renderInvoices;

  window.deleteInvoice = function(id) {
    showConfirm('¿Eliminar Factura?', 'Esta acción eliminará la factura y todos sus detalles de la base de datos de manera irreversible.', async () => {
      try {
        const response = await window.api.deleteInvoice(id);
        if (response.success) {
          showToast('Factura eliminada correctamente.', 'success');
          renderInvoices();
        } else {
          showToast(`No se pudo eliminar: ${response.message}`, 'error');
        }
      } catch (error) {
        console.error(error);
        showToast('Error al intentar eliminar la factura.', 'error');
      }
    });
  };

  function buildInvoiceHtml(inv, items, cfg) {
    const currency = cfg.moneda_codigo || 'USD';
    const companyName = cfg.empresa_nombre || 'MAXItiendasTecserled';
    const ruc = cfg.empresa_nit || '1790012345001';
    const addr = cfg.empresa_direccion || 'Ecuador';
    const phone = cfg.empresa_telefono || '';
    const email = cfg.empresa_correo || '';
    const dateStr = new Date(inv.fecha_emision).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    let itemsHtml = '';
    items.forEach(it => {
      itemsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 8px; text-align: center;">${it.cantidad}</td>
          <td style="padding: 10px 8px;">${it.descripcion}</td>
          <td style="padding: 10px 8px; text-align: right;">$${Number(it.precio_unitario).toFixed(2)}</td>
          <td style="padding: 10px 8px; text-align: right; font-weight: bold;">$${Number(it.subtotal).toFixed(2)}</td>
        </tr>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Factura ${inv.numero_factura}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; margin: 0; padding: 15px; }
          .invoice-box { max-width: 780px; margin: auto; padding: 25px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 18px; margin-bottom: 18px; }
          .company-title { font-size: 22px; font-weight: 800; color: #1d4ed8; margin: 0 0 5px 0; }
          .company-sub { font-size: 13px; color: #64748b; line-height: 1.4; }
          .invoice-title { font-size: 19px; font-weight: 700; color: #0f172a; text-align: right; margin: 0; }
          .sri-box { font-size: 11px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; margin-top: 8px; font-family: monospace; word-break: break-all; }
          .client-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; margin-bottom: 20px; font-size: 13px; }
          .table-items { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
          .table-items th { background: #1e293b; color: #fff; padding: 10px 8px; text-align: left; }
          .totals-box { width: 280px; margin-left: auto; font-size: 14px; }
          .totals-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
          .totals-row.grand { font-size: 16px; font-weight: 800; color: #1d4ed8; border-top: 2px solid #2563eb; border-bottom: none; padding-top: 10px; }
          .footer { margin-top: 35px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px; }
          @media print {
            body { padding: 0; }
            .invoice-box { border: none; box-shadow: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <div class="header">
            <div>
              <h1 class="company-title">${companyName}</h1>
              <div class="company-sub">
                <strong>RUC/NIT:</strong> ${ruc}<br>
                <strong>Dirección:</strong> ${addr}<br>
                <strong>Teléfono:</strong> ${phone} | <strong>Correo:</strong> ${email}
              </div>
            </div>
            <div>
              <h2 class="invoice-title">FACTURA ELECTRÓNICA<br><span style="color:#2563eb;">${inv.numero_factura}</span></h2>
              <div style="font-size: 12px; color: #475569; margin-top: 5px; text-align: right;">
                <strong>Fecha Emisión:</strong> ${dateStr}<br>
                <strong>Método de Pago:</strong> ${inv.metodo_pago}
              </div>
              <div class="sri-box">
                <strong>CLAVE DE ACCESO SRI:</strong><br>${inv.clave_acceso || 'N/D'}
              </div>
            </div>
          </div>

          <div class="client-section">
            <div>
              <strong style="color: #475569; text-transform: uppercase; font-size: 11px;">Datos del Cliente</strong><br>
              <strong style="font-size: 15px; color: #0f172a;">${inv.cliente_nombre || 'Consumidor Final'}</strong><br>
              <strong>CI/RUC:</strong> ${inv.documento_identidad || 'N/D'}
            </div>
            <div>
              <strong style="color: #475569; text-transform: uppercase; font-size: 11px;">Contacto y Dirección</strong><br>
              <strong>Teléfono:</strong> ${inv.telefono || 'N/D'}<br>
              <strong>Correo:</strong> ${inv.correo || 'N/D'}<br>
              <strong>Dirección:</strong> ${inv.direccion || 'N/D'}
            </div>
          </div>

          <table class="table-items">
            <thead>
              <tr>
                <th style="width: 60px; text-align: center;">CANT.</th>
                <th>DESCRIPCIÓN DEL ÍTEM / SERVICIO</th>
                <th style="width: 110px; text-align: right;">P. UNITARIO</th>
                <th style="width: 110px; text-align: right;">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="totals-box">
            <div class="totals-row">
              <span>Subtotal:</span>
              <span>$${Number(inv.subtotal).toFixed(2)} ${currency}</span>
            </div>
            <div class="totals-row">
              <span>IVA (15% SRI):</span>
              <span>$${Number(inv.impuesto).toFixed(2)} ${currency}</span>
            </div>
            ${inv.descuento > 0 ? `
              <div class="totals-row" style="color: #dc2626;">
                <span>Descuento:</span>
                <span>-$${Number(inv.descuento).toFixed(2)} ${currency}</span>
              </div>
            ` : ''}
            <div class="totals-row grand">
              <span>TOTAL A PAGAR:</span>
              <span>$${Number(inv.total).toFixed(2)} ${currency}</span>
            </div>
          </div>

          <div class="footer">
            <p><strong>¡Gracias por confiar en ${companyName}!</strong></p>
            <p>Documento electrónico generado conforme a las disposiciones y estándares técnicos del SRI.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  window.previewInvoice = async function(id) {
    try {
      const res = await window.api.getInvoiceById(id);
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      const html = buildInvoiceHtml(res.invoice, res.items || [], res.config || {});
      const container = document.getElementById('invoice-preview-container');
      if (container) {
        container.innerHTML = html;
      }
      const modal = document.getElementById('invoice-print-modal');
      if (modal) {
        modal.style.display = 'flex';
      }

      const btnPrinter = document.getElementById('btn-print-printer');
      if (btnPrinter) {
        btnPrinter.onclick = async () => {
          showToast('Enviando a la impresora detectada...', 'info');
          const printRes = await window.api.printInvoice(html);
          if (printRes && printRes.success) {
            showToast(printRes.message, 'success');
          } else {
            showToast(printRes ? printRes.message : 'Error en la impresión.', 'error');
          }
        };
      }

      const btnPdf = document.getElementById('btn-print-pdf');
      if (btnPdf) {
        btnPdf.onclick = async () => {
          showToast('Seleccionando ruta de guardado PDF...', 'info');
          const pdfRes = await window.api.printInvoicePdf(html, res.invoice.numero_factura);
          if (pdfRes && pdfRes.success) {
            showToast(pdfRes.message, 'success');
          } else {
            showToast(pdfRes ? pdfRes.message : 'Error en guardado de PDF.', 'error');
          }
        };
      }
    } catch (err) {
      console.error(err);
      showToast('Error al cargar la factura para vista previa.', 'error');
    }
  };

  window.sendInvoiceEmail = async function(id) {
    try {
      const res = await window.api.getInvoiceById(id);
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      
      const defaultEmail = res.invoice.cliente_correo || '';
      const email = prompt('Ingrese el correo electrónico para enviar la factura:', defaultEmail);
      if (!email) {
        return; // Cancelado
      }

      showToast('Generando y enviando factura, por favor espere...', 'info');
      const html = buildInvoiceHtml(res.invoice, res.items || [], res.config || {});
      
      const emailRes = await window.api.emailInvoice(html, email, res.invoice.numero_factura);
      if (emailRes && emailRes.success) {
        showToast(emailRes.message, 'success');
      } else {
        showToast(emailRes ? emailRes.message : 'Error al enviar factura por correo.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error al procesar el envío de factura.', 'error');
    }
  };

  const addInvoiceBtn = document.getElementById('add-invoice-btn');
  const invoiceModelsBtn = document.getElementById('invoice-models-btn');
  const invoiceRepairSelect = document.getElementById('invoice-repair');
  
  if (invoiceModelsBtn) {
    invoiceModelsBtn.addEventListener('click', () => {
      // Evento para el botón de modelos de facturación
      if (typeof window.openInvoiceModelsModal === 'function') {
        window.openInvoiceModelsModal();
      } else {
        showToast('Módulo de Modelos de Factura listo para configurar.', 'info');
      }
    });
  }
  
  if (addInvoiceBtn) {
    addInvoiceBtn.addEventListener('click', async () => {
      const invoiceClientSelect = document.getElementById('invoice-client');
      if (invoiceClientSelect) {
        invoiceClientSelect.innerHTML = '<option value="">Cargando clientes...</option>';
        try {
          const clientRes = await window.api.getClients('');
          if (clientRes.success) {
            invoiceClientSelect.innerHTML = '<option value="">-- Seleccionar Cliente (Solo Venta Directa) --</option>';
            clientRes.recordset.forEach(c => {
              const opt = document.createElement('option');
              opt.value = c.id;
              opt.textContent = `${c.nombre_completo} (${c.documento_identidad})`;
              invoiceClientSelect.appendChild(opt);
            });
          }
        } catch(e) { console.error('Error clientes:', e); }
      }

      if (invoiceRepairSelect) {
        invoiceRepairSelect.innerHTML = '<option value="">Cargando órdenes...</option>';
        try {
          const response = await window.api.getRepairs('');
          if (response.success) {
            const listos = response.recordset.filter(r => r.estado === 'Listo para Entrega');
            if (listos.length === 0 && window.shoppingCart.length === 0) {
              showToast('No hay órdenes listas ni productos en el carrito para facturar.', 'warning');
              return;
            }
            invoiceRepairSelect.innerHTML = '<option value="">-- Seleccionar Reparación --</option>';
            listos.forEach(r => {
              const opt = document.createElement('option');
              opt.value = r.id;
              opt.textContent = `OT #${r.id} - ${r.cliente_nombre} - ${r.marca} ${r.modelo}`;
              opt.dataset.cost = r.costo_estimado;
              opt.dataset.advance = r.abono;
              opt.dataset.clientId = r.cliente_id;
              invoiceRepairSelect.appendChild(opt);
            });
          }
        } catch (e) {
          showToast('Error al cargar órdenes de reparación.', 'error');
        }
      }
      
      if (window.updateInvoiceCartUI) window.updateInvoiceCartUI();
      document.getElementById('invoice-modal').style.display = 'flex';
    });
  }

  window.updateInvoiceCartUI = function() {
    const section = document.getElementById('invoice-cart-section');
    const ul = document.getElementById('invoice-cart-items');
    
    if (window.shoppingCart.length > 0) {
      if(section) section.style.display = 'block';
      if(ul) {
        ul.innerHTML = '';
        window.shoppingCart.forEach(item => {
          const li = document.createElement('li');
          li.style.display = 'flex';
          li.style.justifyContent = 'space-between';
          li.style.marginBottom = '5px';
          li.innerHTML = `<span>${item.qty}x ${item.name}</span> <span>${formatCurrency(item.price * item.qty)}</span>`;
          ul.appendChild(li);
        });
      }
    } else {
      if(section) section.style.display = 'none';
      if(ul) ul.innerHTML = '';
    }

    // Calcular totales
    let repairCost = 0;
    let repairAdvance = 0;
    
    if (invoiceRepairSelect) {
      const opt = invoiceRepairSelect.selectedOptions[0];
      if (opt && opt.value) {
        repairCost = parseFloat(opt.dataset.cost) || 0;
        repairAdvance = parseFloat(opt.dataset.advance) || 0;
      }
    }

    let cartTotal = 0;
    window.shoppingCart.forEach(i => cartTotal += (i.price * i.qty));

    const subtotal = repairCost + cartTotal;
    const iva = subtotal * 0.15;
    const total = subtotal + iva - repairAdvance;

    const elCost = document.getElementById('invoice-calc-cost');
    const elAdv = document.getElementById('invoice-calc-advance');
    const elIva = document.getElementById('invoice-calc-iva');
    const elTot = document.getElementById('invoice-calc-total');

    if(elCost) elCost.textContent = formatCurrency(subtotal);
    if(elAdv) elAdv.textContent = formatCurrency(repairAdvance);
    if(elIva) elIva.textContent = formatCurrency(iva);
    if(elTot) elTot.textContent = formatCurrency(total);
  };

  if (invoiceRepairSelect) {
    invoiceRepairSelect.addEventListener('change', () => {
      if (window.updateInvoiceCartUI) window.updateInvoiceCartUI();
    });
  }

  const invoiceForm = document.getElementById('invoice-form');
  if (invoiceForm) {
    invoiceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const invoiceRepairSelect = document.getElementById('invoice-repair');
      const invoiceClientSelect = document.getElementById('invoice-client');
      
      const optRepair = invoiceRepairSelect ? invoiceRepairSelect.selectedOptions[0] : null;
      const optClient = invoiceClientSelect ? invoiceClientSelect.selectedOptions[0] : null;
      
      const hasRepair = optRepair && optRepair.value;
      const hasCart = window.shoppingCart && window.shoppingCart.length > 0;
      
      if (!hasRepair && !hasCart) {
        showToast('Debes seleccionar una orden válida o agregar productos al carrito.', 'warning');
        return;
      }

      let clientId = null;
      let repairId = null;
      let repairBalance = 0;
      let items = [];

      if (hasRepair) {
        clientId = parseInt(optRepair.dataset.clientId);
        repairId = parseInt(optRepair.value);
        const cost = parseFloat(optRepair.dataset.cost) || 0;
        const advance = parseFloat(optRepair.dataset.advance) || 0;
        repairBalance = cost - advance;

        items.push({
          tipo_item: 'Servicio',
          item_id: 1,
          descripcion: `Servicio de Reparación - OT #${repairId}`,
          cantidad: 1,
          precio_unitario: repairBalance,
          subtotal: repairBalance
        });
      } else {
        if (!optClient || !optClient.value) {
          showToast('Selecciona un cliente para la venta directa.', 'warning');
          return;
        }
        clientId = parseInt(optClient.value);
      }

      let cartTotal = 0;
      if (hasCart) {
        window.shoppingCart.forEach(i => {
          const lineTotal = i.price * i.qty;
          cartTotal += lineTotal;
          items.push({
            tipo_item: i.type,
            item_id: i.id,
            descripcion: i.name,
            cantidad: i.qty,
            precio_unitario: i.price,
            subtotal: lineTotal
          });
        });
      }

      const totalBalance = repairBalance + cartTotal;
      const paymentMethod = document.getElementById('invoice-payment-method').value;

      const impuesto = totalBalance * 0.15;
      const invoice = {
        cliente_id: clientId,
        reparacion_id: repairId,
        subtotal: totalBalance,
        impuesto: impuesto,
        total: totalBalance + impuesto,
        descuento: 0,
        metodo_pago: paymentMethod,
        items: items
      };

      try {
        const response = await window.api.createInvoice(invoice);
        if (response.success) {
          showToast(`Factura ${response.numero_factura} generada exitosamente.`, 'success');
          document.getElementById('invoice-modal').style.display = 'none';
          if (window.clearCart) window.clearCart();
          renderInvoices();
          renderRepairs();
          renderInventoryPage(1); // Refrescar inventario para ver nuevo stock
          refreshDashboardStats();
        } else {
          showToast(`Error al facturar: ${response.message}`, 'error');
        }
      } catch (error) {
        showToast('Error de conexión al facturar.', 'error');
      }
    });
  }

  async function renderReports() {
    const tbody = document.getElementById('reports-list-tbody');
    if (!tbody) return;
    
    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando reporte...</td></tr>';
    
    try {
      const response = await window.api.getFinancialReports(startDate, endDate);
      if (response.success) {
        tbody.innerHTML = '';
        let totalRev = 0;
        
        if (response.recordset.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-dark);">No hay movimientos financieros.</td></tr>';
          document.getElementById('report-total-revenue').textContent = formatCurrency(0);
          window.currentReportData = [];
          return;
        }
        
        window.currentReportData = response.recordset;
        
        response.recordset.forEach(f => {
          totalRev += f.total;
          const dateStr = new Date(f.fecha_emision).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${f.numero_factura}</strong></td>
            <td>${dateStr}</td>
            <td>${f.metodo_pago}</td>
            <td><strong>${formatCurrency(f.total)}</strong></td>
          `;
          tbody.appendChild(tr);
        });
        
        document.getElementById('report-total-revenue').textContent = formatCurrency(totalRev);
      }
    } catch (e) {
      console.error(e);
    }
  }
  window.renderReports = renderReports;

  const filterReportBtn = document.getElementById('filter-report-btn');
  if (filterReportBtn) {
    filterReportBtn.addEventListener('click', () => {
      renderReports();
    });
  }

  const exportReportBtn = document.getElementById('export-report-btn');
  if (exportReportBtn) {
    exportReportBtn.addEventListener('click', async () => {
      if (!window.currentReportData || window.currentReportData.length === 0) {
        showToast('No hay datos para exportar. Filtre un reporte primero.', 'warning');
        return;
      }
      
      exportReportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      exportReportBtn.disabled = true;
      try {
        const dataToExport = window.currentReportData.map(row => ({
          'Factura': row.numero_factura,
          'Fecha': new Date(row.fecha_emision).toLocaleDateString('es-ES'),
          'Cliente': row.cliente_nombre || '',
          'Método Pago': row.metodo_pago,
          'Total USD': row.total
        }));
        
        const res = await window.api.exportData(
          dataToExport, 
          `Reporte_Financiero_${new Date().toISOString().split('T')[0]}`, 
          'Reporte'
        );
        
        if (res.success) {
          showToast(res.message, 'success');
        } else if (res.message.includes('cancelada')) {
          // Ignorar silenciosamente si el usuario cancela
        } else {
          showToast(res.message, 'error');
        }
      } catch (err) {
        showToast('Error al exportar.', 'error');
      } finally {
        exportReportBtn.innerHTML = '<i class="fa-solid fa-file-excel"></i>';
        exportReportBtn.disabled = false;
      }
    });
  }

  const clearReportBtn = document.getElementById('clear-report-btn');
  if (clearReportBtn) {
    clearReportBtn.addEventListener('click', () => {
      document.getElementById('reports-list-tbody').innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-dark);">Seleccione un rango de fechas y presione Filtrar.</td></tr>';
      document.getElementById('report-total-revenue').textContent = formatCurrency(0);
      window.currentReportData = [];
      document.getElementById('report-start-date').value = '';
      document.getElementById('report-end-date').value = '';
    });
  }

  const deleteReportBtn = document.getElementById('delete-report-btn');
  const deleteModal = document.getElementById('delete-report-modal');
  const deleteConfirmInput = document.getElementById('delete-report-confirm-input');
  const confirmDeleteBtn = document.getElementById('confirm-delete-report-btn');

  if (deleteReportBtn && deleteModal) {
    deleteReportBtn.addEventListener('click', () => {
      const startDate = document.getElementById('report-start-date').value;
      const endDate = document.getElementById('report-end-date').value;
      
      if (!startDate || !endDate) {
        showToast('Seleccione un rango de fechas (Inicio y Fin) para borrar los registros.', 'warning');
        return;
      }
      
      document.getElementById('del-start-date-text').textContent = startDate;
      document.getElementById('del-end-date-text').textContent = endDate;
      
      deleteConfirmInput.value = '';
      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.style.opacity = '0.5';
      confirmDeleteBtn.style.cursor = 'not-allowed';
      
      deleteModal.style.display = 'flex';
    });

    deleteConfirmInput.addEventListener('input', (e) => {
      if (e.target.value === 'ELIMINAR REGISTRO') {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.style.opacity = '1';
        confirmDeleteBtn.style.cursor = 'pointer';
      } else {
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.style.opacity = '0.5';
        confirmDeleteBtn.style.cursor = 'not-allowed';
      }
    });

    confirmDeleteBtn.addEventListener('click', async () => {
      const startDate = document.getElementById('report-start-date').value;
      const endDate = document.getElementById('report-end-date').value;
      
      try {
        const res = await window.api.deleteInvoicesByDate(startDate, endDate);
        if (res.success) {
          showToast(res.message, 'success');
          renderReports();
        } else {
          showToast('Error: ' + res.message, 'error');
        }
      } catch(e) {
        showToast('Error al procesar la eliminación.', 'error');
      }
      
      deleteModal.style.display = 'none';
    });
  }
  async function renderRecentOperations() {
    const list = document.getElementById('recent-operations-list');
    if (!list) return;
    try {
      const response = await window.api.getRecentOperations();
      if (response.success && response.recordset.length > 0) {
        list.innerHTML = response.recordset.map(op => `
          <div onclick="previewInvoice(${op.id})" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--card-border); padding: 8px; margin-bottom: 4px; border-radius: 6px; transition: background 0.2s;" onmouseover="this.style.background='var(--card-border)'" onmouseout="this.style.background='transparent'">
            <div>
              <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">Factura ${op.referencia || ''}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${new Date(op.fecha).toLocaleString()}</div>
            </div>
            <div style="text-align: right;">
              <div style="color: #10b981; font-weight: bold;">$${parseFloat(op.total || 0).toFixed(2)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${op.estado}</div>
            </div>
          </div>
        `).join('');
      } else {
        list.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; flex-direction: column; opacity: 0.5; padding: 20px;">
            <i class="fa-solid fa-history" style="font-size: 2rem; margin-bottom: 10px;"></i>
            <p>No hay facturas recientes.</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Error al cargar operaciones recientes:', error);
    }
  }

  async function renderUrgentRepairs() {
    const list = document.getElementById('urgent-repairs-list');
    if (!list) return;
    try {
      const response = await window.api.getUrgentRepairs();
      if (response.success && response.recordset.length > 0) {
        list.innerHTML = response.recordset.map(rep => {
          let badgeColor = 'var(--text-main)';
          if (rep.estado === 'En Diagnóstico') badgeColor = '#f59e0b';
          else if (rep.estado === 'Reparado') badgeColor = '#10b981';
          else if (rep.estado === 'Recibido') badgeColor = '#3b82f6';
          else if (rep.estado === 'En Progreso' || rep.estado === 'En Reparación') badgeColor = '#0ea5e9';
          
          return `
          <div onclick="editRepair(${rep.id})" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--card-border); padding: 8px; margin-bottom: 4px; border-radius: 6px; transition: background 0.2s;" onmouseover="this.style.background='var(--card-border)'" onmouseout="this.style.background='transparent'">
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;">${rep.dispositivo || 'Equipo'} - ${rep.cliente_nombre || 'Cliente'}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${new Date(rep.fecha_recepcion).toLocaleDateString()}</div>
            </div>
            <div style="text-align: right; padding-left: 10px;">
              <div style="color: ${badgeColor}; font-weight: bold; font-size: 0.85rem; border: 1px solid ${badgeColor}; padding: 2px 6px; border-radius: 4px; display: inline-block;">${rep.estado}</div>
            </div>
          </div>
        `}).join('');
      } else {
        list.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; flex-direction: column; opacity: 0.5; padding: 20px;">
            <i class="fa-solid fa-check-circle" style="font-size: 2rem; margin-bottom: 10px; color: #10b981;"></i>
            <p>¡Todo al día! No hay equipos pendientes.</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Error al cargar reparaciones urgentes:', error);
    }
  }

  async function refreshDashboardStats() {
    try {
      const response = await window.api.getDashboardStats();
      if (response.success) {
        const activeRepairsCard = document.getElementById('stat-active-repairs');
        const lowStockCard = document.getElementById('stat-low-stock');
        const earningsCard = document.getElementById('stat-earnings');
        
        if (activeRepairsCard) activeRepairsCard.textContent = response.stats.activeRepairs;
        if (lowStockCard) lowStockCard.textContent = response.stats.lowStockAlerts;
        if (earningsCard) earningsCard.textContent = formatCurrency(response.stats.earningsToday);
      }
      if (window.loadSalesChart) {
        window.loadSalesChart('month');
      }
      renderRecentOperations();
      renderUrgentRepairs();
    } catch (error) {
      console.error('Error al actualizar estadísticas del dashboard:', error);
    }
  }
  window.refreshDashboardStats = refreshDashboardStats;

  // Búsqueda en Listados (Filtros en SQL Server)
  const searchClients = document.getElementById('search-clients');
  if (searchClients) {
    searchClients.addEventListener('input', (e) => {
      renderClients(e.target.value);
    });
  }

  const searchRepairs = document.getElementById('search-repairs');
  const filterRepairStatus = document.getElementById('filter-repair-status');
  if (searchRepairs) {
    searchRepairs.addEventListener('input', (e) => {
      const statusVal = filterRepairStatus ? filterRepairStatus.value : '';
      renderRepairs(e.target.value, statusVal);
    });
  }
  if (filterRepairStatus) {
    filterRepairStatus.addEventListener('change', (e) => {
      const searchVal = searchRepairs ? searchRepairs.value : '';
      renderRepairs(searchVal, e.target.value);
    });
  }

  const searchQueries = document.getElementById('search-queries');
  if (searchQueries) {
    searchQueries.addEventListener('input', (e) => {
      renderQueries(e.target.value);
    });
  }

  const searchInventory = document.getElementById('search-inventory');
  if (searchInventory) {
    searchInventory.addEventListener('input', (e) => {
      currentInventoryPage = 1;
      renderInventory(e.target.value);
    });
  }

  const prevInventoryBtn = document.getElementById('inventory-prev-page');
  const nextInventoryBtn = document.getElementById('inventory-next-page');
  const inventoryContainer = document.getElementById('inventory-table-container');
  const inventoryProgressBar = document.getElementById('inventory-progress-bar');
  
  if (inventoryContainer) {
    const updateScrollUI = () => {
      const scrollWidth = inventoryContainer.scrollWidth;
      const clientWidth = inventoryContainer.clientWidth;
      const maxScroll = scrollWidth - clientWidth;
      
      if (maxScroll <= 0 || scrollWidth === 0) {
        if (inventoryProgressBar) {
          inventoryProgressBar.style.width = '100%';
          inventoryProgressBar.style.left = '0%';
        }
        return;
      }
      
      const widthPercent = (clientWidth / scrollWidth) * 100;
      const scrollPercent = inventoryContainer.scrollLeft / maxScroll;
      const maxLeft = 100 - widthPercent;
      
      if (inventoryProgressBar) {
        inventoryProgressBar.style.width = `${widthPercent}%`;
        inventoryProgressBar.style.left = `${scrollPercent * maxLeft}%`;
      }
    };
    
    inventoryContainer.addEventListener('scroll', updateScrollUI);
    window.addEventListener('resize', updateScrollUI);
    setInterval(updateScrollUI, 1000); 

    if (inventoryProgressBar) {
      let isDragging = false;

      inventoryProgressBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        inventoryProgressBar.style.cursor = 'grabbing';
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        
        const track = inventoryProgressBar.parentElement;
        const trackRect = track.getBoundingClientRect();
        
        let widthPercent = inventoryContainer.clientWidth / inventoryContainer.scrollWidth;
        let thumbWidth = trackRect.width * widthPercent; 
        let mouseX = e.clientX - trackRect.left - (thumbWidth / 2);
        
        let maxThumbMove = trackRect.width - thumbWidth;
        let percent = mouseX / maxThumbMove;
        
        if (percent < 0) percent = 0;
        if (percent > 1) percent = 1;
        
        const maxScroll = inventoryContainer.scrollWidth - inventoryContainer.clientWidth;
        inventoryContainer.scrollLeft = percent * maxScroll;
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
        inventoryProgressBar.style.cursor = 'grab';
      });
    }
  }

  if (prevInventoryBtn && inventoryContainer) {
    prevInventoryBtn.addEventListener('click', () => {
      inventoryContainer.scrollBy({ left: -300, behavior: 'smooth' });
    });
  }
  if (nextInventoryBtn && inventoryContainer) {
    nextInventoryBtn.addEventListener('click', () => {
      inventoryContainer.scrollBy({ left: 300, behavior: 'smooth' });
    });
  }

  const searchServices = document.getElementById('search-services');
  if (searchServices) {
    searchServices.addEventListener('input', (e) => {
      renderServices(e.target.value);
    });
  }

  const exportExcelBtn = document.getElementById('export-excel-btn');
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', async () => {
      if (allInventoryData.length === 0) {
        showToast('No hay datos para exportar.', 'warning');
        return;
      }
      exportExcelBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exportando...';
      exportExcelBtn.disabled = true;
      try {
        const dataToExport = allInventoryData.map(p => ({
          'ID': p.id,
          'Código': p.codigo_barras || '',
          'Nombre': p.nombre,
          'Tipo': p.tipo_item,
          'Compatibilidad': p.compatibilidad || '',
          'Costo': p.precio_compra,
          'Venta': p.precio_venta,
          'Stock': p.stock,
          'Stock Mínimo': p.stock_minimo
        }));

        const res = await window.api.exportData(
          dataToExport,
          `Inventario_Export_${new Date().toISOString().slice(0,10)}`,
          'Inventario'
        );

        if (res.success) {
          showToast('Datos exportados correctamente.', 'success');
        } else if (!res.message.includes('cancelada')) {
          showToast(res.message, 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Error al exportar los datos.', 'error');
      } finally {
        exportExcelBtn.innerHTML = '<i class="fa-solid fa-file-excel"></i> Exportar Excel';
        exportExcelBtn.disabled = false;
      }
    });
  }

  const deleteDataBtn = document.getElementById('delete-data-btn');
  if (deleteDataBtn) {
    deleteDataBtn.addEventListener('click', () => {
      showConfirm('¿Borrar Datos del Inventario?', 'Esta acción eliminará TODOS los productos y piezas del sistema. Es irreversible. ¿Estás seguro?', async () => {
        try {
          const res = await window.api.deleteAllInventory();
          if (res.success) {
            showToast('Inventario borrado exitosamente.', 'success');
            renderInventory();
          } else {
            showToast(`Error al borrar: ${res.message}`, 'error');
          }
        } catch (e) {
          showToast('Error de red al borrar inventario.', 'error');
        }
      });
    });
  }

  const searchTechs = document.getElementById('search-techs');
  if (searchTechs) {
    searchTechs.addEventListener('input', (e) => {
      renderTechs(e.target.value);
    });
  }

  // Carga inicial tras abrir la app
  setTimeout(() => {
    renderClients();
    renderRepairs();
    renderQueries();
    refreshDashboardStats();
  }, 100);

  // Auto-refresco silencioso de Consultas Clientes en segundo plano
  setInterval(() => {
    const queriesPanel = document.getElementById('queries-view');
    if (queriesPanel && queriesPanel.classList.contains('active')) {
      const searchVal = document.getElementById('search-queries') ? document.getElementById('search-queries').value : '';
      renderQueries(searchVal);
    }
  }, 15000);
});

// Estilos de sacudida añadidos dinámicamente para errores de formulario
const styleEl = document.createElement('style');
styleEl.innerHTML = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}
`;
document.head.appendChild(styleEl);

// ============================================================================
// LÓGICA DE PEDIDOS (Órdenes)
// ============================================================================
let currentOrderFilters = {
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  status: 'Todos',
  search: ''
};
let allOrdersData = [];

async function renderOrders() {
  const tbody = document.getElementById('orders-list-tbody');
  const emptyState = document.getElementById('orders-empty-state');
  const tableContainer = document.getElementById('orders-table-container');
  const countText = document.getElementById('orders-count-text');
  
  if (!tbody) return;
  
  try {
    const response = await window.api.getOrders(currentOrderFilters);
    if (response.success) {
      allOrdersData = response.recordset;
      
      if (countText) countText.textContent = `${allOrdersData.length} pedidos en total`;
      
      if (allOrdersData.length === 0) {
        emptyState.style.display = 'flex';
        tableContainer.style.display = 'none';
      } else {
        emptyState.style.display = 'none';
        tableContainer.style.display = 'block';
        
        tbody.innerHTML = '';
        allOrdersData.forEach(o => {
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid var(--card-border)';
          tr.style.transition = 'background-color 0.2s';
          tr.onmouseover = () => tr.style.backgroundColor = 'rgba(255,255,255,0.02)';
          tr.onmouseout = () => tr.style.backgroundColor = 'transparent';

          let statusColor = '#9ca3af';
          if (o.estado === 'Pendiente') statusColor = '#f59e0b';
          if (o.estado === 'Confirmado') statusColor = '#3b82f6';
          if (o.estado === 'Enviado') statusColor = '#8b5cf6';
          if (o.estado === 'Despachado') statusColor = '#10b981';
          if (o.estado === 'Entregado') statusColor = '#14b8a6';
          
          const dateStr = new Date(o.fecha_creacion).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
          
          tr.innerHTML = `
            <td style="padding: 16px; color: var(--text-main); font-weight: 600; font-size: 0.95rem;">#${o.numero_pedido}</td>
            <td style="padding: 16px; color: var(--text-muted); font-size: 0.9rem;">
              <div style="display: flex; flex-direction: column;">
                <span style="color: #fff; font-weight: 500;">${o.cliente_nombre}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${o.productos || 'Sin productos'}</span>
              </div>
            </td>
            <td style="padding: 16px; color: var(--text-muted); font-size: 0.9rem;">${dateStr}</td>
            <td style="padding: 16px;">
              <span style="background: ${statusColor}20; color: ${statusColor}; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${o.estado}</span>
            </td>
            <td style="padding: 16px; font-weight: 600; color: #10b981; font-size: 0.95rem; text-align: right;">$${Number(o.total).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  } catch (e) {
    console.error(e);
  }
}

// Event Listeners para Controles de Pedidos
document.addEventListener('DOMContentLoaded', () => {
  const monthFilter = document.getElementById('orders-month-filter');
  const yearFilter = document.getElementById('orders-year-filter');
  const searchOrders = document.getElementById('search-orders');
  const statusTabs = document.querySelectorAll('.order-tab');
  
  if (monthFilter) {
    monthFilter.value = currentOrderFilters.month;
    monthFilter.addEventListener('change', (e) => {
      currentOrderFilters.month = e.target.value;
      renderOrders();
    });
  }
  if (yearFilter) {
    const currentYear = new Date().getFullYear();
    yearFilter.innerHTML = ''; // Limpiar opciones quemadas en HTML
    // Llenar desde el año actual bajando hasta 2024
    for (let y = currentYear; y >= 2024; y--) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearFilter.appendChild(opt);
    }
    yearFilter.value = currentOrderFilters.year;
    yearFilter.addEventListener('change', (e) => {
      currentOrderFilters.year = e.target.value;
      renderOrders();
    });
  }
  if (searchOrders) {
    searchOrders.addEventListener('input', (e) => {
      currentOrderFilters.search = e.target.value;
      renderOrders();
    });
  }
  
  statusTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      statusTabs.forEach(t => {
        t.classList.remove('active');
        t.style.background = 'rgba(255,255,255,0.05)';
        t.style.color = 'var(--text-muted)';
      });
      tab.classList.add('active');
      tab.style.background = '#3b82f6';
      tab.style.color = '#fff';
      currentOrderFilters.status = tab.getAttribute('data-status');
      renderOrders();
    });
  });

  const exportOrdersBtn = document.getElementById('orders-export-btn');
  if (exportOrdersBtn) {
    exportOrdersBtn.addEventListener('click', async () => {
      if (allOrdersData.length === 0) {
        showToast('No hay pedidos para exportar.', 'warning');
        return;
      }
      exportOrdersBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exportando...';
      try {
        const dataToExport = allOrdersData.map(o => ({
          'ID': o.id,
          'Numero': o.numero_pedido,
          'Cliente': o.cliente_nombre,
          'Productos': o.productos,
          'Estado': o.estado,
          'Total': o.total,
          'Fecha': new Date(o.fecha_creacion).toLocaleString('es-ES')
        }));

        const res = await window.api.exportData(
          dataToExport,
          `Pedidos_Export_${new Date().toISOString().slice(0,10)}`,
          'Pedidos'
        );

        if (res.success) {
          showToast('Pedidos exportados correctamente.', 'success');
        } else if (!res.message.includes('cancelada')) {
          showToast(res.message, 'error');
        }
      } catch (e) {
        showToast('Error al exportar.', 'error');
      } finally {
        exportOrdersBtn.innerHTML = '<i class="fa-solid fa-file-excel"></i> Exportar Excel';
      }
    });
  }

  const deleteDeliveredBtn = document.getElementById('orders-delete-delivered-btn');
  if (deleteDeliveredBtn) {
    deleteDeliveredBtn.addEventListener('click', () => {
      showConfirm('¿Borrar Entregados?', 'Se eliminarán todos los pedidos en estado "Entregado". Esto no se puede deshacer.', async () => {
        try {
          const res = await window.api.deleteDeliveredOrders();
          if (res.success) {
            showToast('Pedidos borrados.', 'success');
            renderOrders();
          } else {
            showToast('Error: ' + res.message, 'error');
          }
        } catch(e) {
          showToast('Error de conexión.', 'error');
        }
      });
    });
  }

  window.renderOrders = renderOrders;
});

// ============================================================================
// LÓGICA DE IMPORTACIÓN
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const btnTemplateProducts = document.getElementById('btn-template-products');
  const btnTemplateOrders = document.getElementById('btn-template-orders');
  
  const typeButtons = document.querySelectorAll('.import-type-btn');
  let currentImportType = 'products'; // 'products', 'orders', 'both'
  
  const dropzone = document.getElementById('import-dropzone');
  const fileInput = document.getElementById('import-file-input');
  
  const emptyState = document.getElementById('import-empty-state');
  const fileSelected = document.getElementById('import-file-selected');
  const fileNameDisplay = document.getElementById('import-filename');
  const fileSizeDisplay = document.getElementById('import-filesize');
  const btnClearFile = document.getElementById('import-clear-file');
  
  const previewContainer = document.getElementById('import-preview-container');
  const previewHead = document.getElementById('import-preview-head');
  const previewBody = document.getElementById('import-preview-body');
  
  const btnSubmit = document.getElementById('import-submit-btn');
  const btnCancel = document.getElementById('import-cancel-btn');
  
  let currentFile = null;

  // Descargar Plantillas
  if (btnTemplateProducts) {
    btnTemplateProducts.addEventListener('click', async () => {
      btnTemplateProducts.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
      const res = await window.api.downloadTemplate('products');
      btnTemplateProducts.innerHTML = '<i class="fa-solid fa-file-excel"></i> Plantilla Productos';
      if (res.success) showToast(res.message, 'success');
      else if (res.message !== 'Guardado cancelado.') showToast(res.message, 'error');
    });
  }
  
  if (btnTemplateOrders) {
    btnTemplateOrders.addEventListener('click', async () => {
      btnTemplateOrders.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
      const res = await window.api.downloadTemplate('orders');
      btnTemplateOrders.innerHTML = '<i class="fa-solid fa-file-excel"></i> Plantilla Pedidos';
      if (res.success) showToast(res.message, 'success');
      else if (res.message !== 'Guardado cancelado.') showToast(res.message, 'error');
    });
  }

  // Selector de Tipo de Importación
  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      typeButtons.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'rgba(255,255,255,0.05)';
        b.style.color = 'var(--text-muted)';
        b.style.border = '1px solid var(--card-border)';
      });
      btn.classList.add('active');
      btn.style.background = '#3b82f6';
      btn.style.color = '#fff';
      btn.style.border = '1px solid #3b82f6';
      currentImportType = btn.getAttribute('data-type');
      
      // Si hay archivo, regenerar la preview
      if (currentFile) processPreview(currentFile);
    });
  });

  // Manejo de Drag & Drop y Selección
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', (e) => {
      if (e.target === btnClearFile || btnClearFile.contains(e.target)) return;
      fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '#3b82f6';
      dropzone.style.background = 'rgba(59, 130, 246, 0.05)';
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--card-border)';
      dropzone.style.background = 'rgba(255,255,255,0.01)';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--card-border)';
      dropzone.style.background = 'rgba(255,255,255,0.01)';
      
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        handleFileSelection(file);
      } else {
        showToast('Formato no soportado. Usa .xlsx o .xls', 'error');
      }
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFileSelection(file);
    });
  }

  function handleFileSelection(file) {
    currentFile = file;
    fileNameDisplay.textContent = file.name;
    fileSizeDisplay.textContent = (file.size / 1024).toFixed(1) + ' KB';
    
    emptyState.style.display = 'none';
    fileSelected.style.display = 'flex';
    
    btnSubmit.disabled = false;
    btnSubmit.style.opacity = '1';
    btnSubmit.style.cursor = 'pointer';
    btnCancel.style.display = 'inline-block';
    
    processPreview(file);
  }

  function resetImportUI() {
    currentFile = null;
    if (fileInput) fileInput.value = '';
    emptyState.style.display = 'block';
    fileSelected.style.display = 'none';
    previewContainer.style.display = 'none';
    btnSubmit.disabled = true;
    btnSubmit.style.opacity = '0.5';
    btnSubmit.style.cursor = 'not-allowed';
    btnCancel.style.display = 'none';
    previewHead.innerHTML = '';
    previewBody.innerHTML = '';
  }

  if (btnClearFile) {
    btnClearFile.addEventListener('click', resetImportUI);
  }
  if (btnCancel) {
    btnCancel.addEventListener('click', resetImportUI);
  }

  async function processPreview(file) {
    try {
      const buffer = await file.arrayBuffer();
      const res = await window.api.previewExcel(buffer, currentImportType);
      if (res.success) {
        previewHead.innerHTML = `<tr>${res.headers.map(h => `<th style="padding: 12px; border-bottom: 1px solid var(--card-border); color: var(--text-muted); font-weight: 600;">${h}</th>`).join('')}</tr>`;
        previewBody.innerHTML = res.rows.map(row => {
          return `<tr style="border-bottom: 1px solid var(--card-border);">
            ${res.headers.map(h => `<td style="padding: 12px; color: #fff; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${row[h] !== undefined ? row[h] : ''}</td>`).join('')}
          </tr>`;
        }).join('');
        previewContainer.style.display = 'block';
      } else {
        previewContainer.style.display = 'none';
        showToast(res.message, 'warning');
      }
    } catch (err) {
      console.error(err);
      previewContainer.style.display = 'none';
    }
  }

  // Enviar archivo a importar
  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      if (!currentFile) return;
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando...';
      
      try {
        const buffer = await currentFile.arrayBuffer();
      const res = await window.api.importExcel(buffer, currentImportType, currentFile.name);
        if (res.success) {
          showToast(res.message, 'success');
          resetImportUI();
        } else {
          showToast('Error: ' + res.message, 'error');
        }
        if (window.renderImportHistory) window.renderImportHistory();
      } catch (err) {
        showToast('Error en la importación', 'error');
        if (window.renderImportHistory) window.renderImportHistory();
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-upload"></i> Importar Datos';
      }
    });
  }

  // Renderizar historial de importaciones
  window.renderImportHistory = async () => {
    const tbody = document.getElementById('import-history-tbody');
    if (!tbody) return;
    
    try {
      const res = await window.api.getImportHistory();
      if (res.success && res.recordset.length > 0) {
        tbody.innerHTML = res.recordset.map(log => {
          const isError = log.estado.toLowerCase() === 'error';
          const badgeClass = isError ? 'badge-devuelto' : 'badge-confirmado'; // rojo vs verde
          
          const dateObj = new Date(log.fecha);
          const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          
          return `<tr style="border-bottom: 1px solid var(--card-border); hover:bg-secondary/20 transition-colors">
            <td style="padding: 12px 24px; color: #fff;">${dateStr}</td>
            <td style="padding: 12px 24px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-file-excel" style="color: #3b82f6;"></i>
                <span style="font-weight: 500; color: #fff;">${log.archivo_nombre}</span>
              </div>
            </td>
            <td style="padding: 12px 24px; color: var(--text-muted);">${log.tipo}</td>
            <td style="padding: 12px 24px; text-align: center; color: #fff; font-weight: 600;">${log.total_registros}</td>
            <td style="padding: 12px 24px; text-align: right;">
               <span class="${badgeClass} px-2 py-0.5 rounded-full text-xs font-medium" title="${isError ? log.mensaje : 'Completado'}">${log.estado}</span>
            </td>
            <td style="padding: 12px 24px; text-align: center;">
              <button onclick="deleteImportHistory(${log.id})" style="background: transparent; border: none; color: var(--danger); cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Eliminar registro">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>`;
        }).join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-muted);">Aún no hay importaciones registradas.</td></tr>`;
      }
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--danger);">Error al cargar historial.</td></tr>`;
    }
  };

  window.deleteImportHistory = async (id) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este registro del historial?')) return;
    try {
      const res = await window.api.deleteImportHistory(id);
      if (res.success) {
        showToast('Registro eliminado.', 'success');
        if (window.renderImportHistory) window.renderImportHistory();
      } else {
        showToast('Error al eliminar registro.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error de conexión.', 'error');
    }
  };

  // Gráficos de Ventas
  let salesChartInstance = null;
  let currentChartPeriod = 'week'; // por defecto

  window.loadSalesChart = async (period) => {
    if (period) currentChartPeriod = period;
    
    const canvas = document.getElementById('salesChart');
    if (!canvas) return;

    try {
      const res = await window.api.getSalesChartData(currentChartPeriod);
      if (!res.success) throw new Error(res.message);

      const ctx = canvas.getContext('2d');
      
      const labels = [];
      const data = [];
      
      const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

      if (currentChartPeriod === 'year') {
        // Generar los 12 meses
        for (let i = 0; i < 12; i++) {
          labels.push(monthNames[i]);
          const found = res.data.find(r => r.mes === i + 1);
          data.push(found ? Number(found.total) : 0);
        }
      } else {
        // Generar últimos N días
        const days = currentChartPeriod === 'week' ? 6 : 29;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = days; i >= 0; i--) {
          const targetDate = new Date(today);
          targetDate.setDate(today.getDate() - i);
          
          labels.push(`${targetDate.getDate()} ${monthNames[targetDate.getMonth()]}`);

          const found = res.data.find(r => {
            const rowDate = new Date(r.fecha);
            rowDate.setMinutes(rowDate.getMinutes() + rowDate.getTimezoneOffset());
            return rowDate.getDate() === targetDate.getDate() && 
                   rowDate.getMonth() === targetDate.getMonth() && 
                   rowDate.getFullYear() === targetDate.getFullYear();
          });

          data.push(found ? Number(found.total) : 0);
        }
      }

      if (salesChartInstance) {
        salesChartInstance.destroy();
      }

      // Evitar que Chart.js use sus colores por defecto que desentonan
      Chart.defaults.color = '#9ca3af'; // var(--text-muted)
      Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

      salesChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Ventas Totales ($)',
            data: data,
            borderColor: '#3b82f6', // var(--primary)
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#3b82f6',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(17, 24, 39, 0.9)',
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 10,
              displayColors: false,
              callbacks: {
                label: function(context) {
                  let val = context.parsed.y;
                  return '$' + val.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: {
                color: 'rgba(255, 255, 255, 0.05)',
                drawBorder: false,
              },
              ticks: {
                callback: function(value) {
                  return '$' + value;
                }
              }
            },
            x: {
              grid: {
                display: false,
                drawBorder: false,
              }
            }
          }
        }
      });
    } catch (err) {
      console.error('Error cargando gráfico:', err);
    }
  };

  // Listeners para los tabs del gráfico
  const chartTabs = document.querySelectorAll('.chart-tab');
  chartTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      chartTabs.forEach(t => {
        t.classList.remove('active');
        t.style.background = 'transparent';
        t.style.color = 'var(--text-muted)';
      });
      const target = e.target;
      target.classList.add('active');
      target.style.background = 'var(--primary)';
      target.style.color = '#fff';
      
      const period = target.getAttribute('data-period');
      window.loadSalesChart(period);
    });
  });


  // --- 19. WHATSAPP BAILEYS CHAT UI ---
  const waConnectBtn = document.getElementById('wa-connect-btn');
  const waQrModal = document.getElementById('wa-qr-modal');
  const waQrContainer = document.getElementById('wa-qr-container');
  const waStatusText = document.getElementById('wa-status-text');
  
  const waChatList = document.getElementById('wa-chat-list');
  const waMessagesContainer = document.getElementById('wa-messages-container');
  const waInputArea = document.getElementById('wa-input-area');
  const waMessageInput = document.getElementById('wa-message-input');
  const waSendBtn = document.getElementById('wa-send-btn');
  const waActiveName = document.getElementById('wa-active-name');
  const waActiveNumber = document.getElementById('wa-active-number');

  let whatsappChats = {}; // senderId -> {name, number, messages: []}
  let activeChatId = null;

  if (waConnectBtn) {
    waConnectBtn.addEventListener('click', async () => {
      waQrModal.style.display = 'flex';
      waStatusText.textContent = 'Solicitando conexión...';
      waQrContainer.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: #cbd5e1;"></i>';
      try {
        const res = await window.api.startWhatsApp();
        if (res.status === 'connected') {
          waQrModal.style.display = 'none';
          showToast('WhatsApp ya está conectado.', 'success');
          loadWhatsAppHistory();
        }
      } catch (e) {
        showToast('Error al iniciar WhatsApp.', 'error');
      }
    });
  }

  if (window.api.onWhatsAppQR) {
    window.api.onWhatsAppQR((qrDataUrl) => {
      if (waStatusText) waStatusText.textContent = 'Escanea el código con tu WhatsApp';
      if (waQrContainer) waQrContainer.innerHTML = `<img src="${qrDataUrl}" alt="QR Code" style="width: 200px; height: 200px; border-radius: 8px;">`;
    });
  }

  if (window.api.onWhatsAppReady) {
    window.api.onWhatsAppReady(() => {
      if (waQrModal) waQrModal.style.display = 'none';
      showToast('WhatsApp vinculado exitosamente.', 'success');
      loadWhatsAppHistory();
    });
  }

  if (window.api.onWhatsAppLoggedOut) {
    window.api.onWhatsAppLoggedOut(() => {
      showToast('Se cerró la sesión de WhatsApp.', 'warning');
    });
  }

  window.notifyNewMessage = function(platform) {
    // 1. Mostrar badge rojo
    const badge = document.getElementById(`badge-${platform}`);
    if (badge) badge.style.display = 'block';

    // 2. Reproducir voz femenina
    if ('speechSynthesis' in window) {
      const msg = new SpeechSynthesisUtterance("ATENCIÓN, TIENE UN MENSAJE");
      msg.lang = 'es-ES';
      // Intentar buscar una voz femenina
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(v => 
        v.name.toLowerCase().includes('female') || 
        v.name.toLowerCase().includes('mujer') || 
        v.name.toLowerCase().includes('helena') || 
        v.name.toLowerCase().includes('laura')
      );
      if (femaleVoice) {
        msg.voice = femaleVoice;
      }
      msg.rate = 1.0;
      msg.pitch = 1.3; // Más agudo para simular voz femenina si no se encuentra
      window.speechSynthesis.speak(msg);
    }
  };

  if (window.api.onWhatsAppMessage) {
    window.api.onWhatsAppMessage((msg) => {
      msg.type = 'entrante';
      addMessageToChat(msg);
      renderWhatsAppChatsList();
      
      // Notificar si no estamos activamente en ese chat (opcional), pero por ahora siempre notifica
      window.notifyNewMessage('whatsapp');

      if (activeChatId === msg.senderId) {
        renderActiveChatMessages();
      }
    });
  }

  function addMessageToChat(msg) {
    if (!whatsappChats[msg.senderId]) {
      whatsappChats[msg.senderId] = {
        name: msg.senderName || msg.senderId.split('@')[0],
        number: msg.senderId.split('@')[0],
        messages: []
      };
    }
    // Evitar duplicados
    if (!whatsappChats[msg.senderId].messages.find(m => m.id === msg.id)) {
      whatsappChats[msg.senderId].messages.push(msg);
    }
  }

  async function loadWhatsAppHistory() {
    try {
      const res = await window.api.getWhatsAppHistory();
      if (res.success && res.recordset.length > 0) {
        res.recordset.forEach(row => {
          addMessageToChat({
            id: row.mensaje_id,
            senderId: row.remitente_id,
            senderName: row.remitente_nombre,
            text: row.texto,
            type: row.tipo, // 'entrante' o 'saliente'
            timestamp: row.fecha
          });
        });
        renderWhatsAppChatsList();
        if (activeChatId) renderActiveChatMessages();
      }
    } catch(e) { console.error('Error cargando historial de WA', e); }
  }
  
  // Exponer para llamarlo al hacer login (opcional)
  window.loadWhatsAppHistory = loadWhatsAppHistory;

  function renderWhatsAppChatsList() {
    if (!waChatList) return;
    waChatList.innerHTML = '';
    const chatKeys = Object.keys(whatsappChats);
    if (chatKeys.length === 0) {
      waChatList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No hay chats disponibles.</div>';
      return;
    }

    chatKeys.sort((a, b) => {
      const msgsA = whatsappChats[a].messages;
      const msgsB = whatsappChats[b].messages;
      const dateA = msgsA.length > 0 ? new Date(msgsA[msgsA.length - 1].timestamp).getTime() : 0;
      const dateB = msgsB.length > 0 ? new Date(msgsB[msgsB.length - 1].timestamp).getTime() : 0;
      return dateB - dateA;
    });

    chatKeys.forEach(senderId => {
      const chatData = whatsappChats[senderId];
      const msgs = chatData.messages;
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : { text: 'Nuevo chat', timestamp: new Date() };
      const timeStr = msgs.length > 0 ? new Date(lastMsg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
      
      const div = document.createElement('div');
      div.className = 'wa-chat-item';
      div.style.padding = '12px 15px';
      div.style.borderBottom = '1px solid var(--card-border)';
      div.style.cursor = 'pointer';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.gap = '10px';
      div.style.transition = 'background 0.2s';
      if (activeChatId === senderId) {
        div.style.background = 'rgba(255,255,255,0.08)';
      }

      div.onmouseenter = () => { if(activeChatId !== senderId) div.style.background = 'rgba(255,255,255,0.03)'; };
      div.onmouseleave = () => { if(activeChatId !== senderId) div.style.background = 'transparent'; };
      
      div.innerHTML = `
        <div style="width: 45px; height: 45px; border-radius: 50%; background: #3b82f6; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; flex-shrink: 0;">
          ${chatData.name.charAt(0).toUpperCase()}
        </div>
        <div style="flex: 1; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${chatData.name}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted); flex-shrink: 0;">${timeStr}</span>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 3px;">
            ${lastMsg.type === 'saliente' ? '<i class="fa-solid fa-check-double" style="color: #3b82f6; font-size: 0.7rem;"></i> ' : ''}${lastMsg.text}
          </div>
        </div>
      `;
      
      div.onclick = () => {
        activeChatId = senderId;
        if(waActiveName) waActiveName.textContent = chatData.name;
        if(waActiveNumber) waActiveNumber.textContent = '+' + chatData.number;
        if(waInputArea) waInputArea.style.display = 'flex';
        renderWhatsAppChatsList(); // Para resaltar el activo
        renderActiveChatMessages();
      };
      
      waChatList.appendChild(div);
    });
  }

  function renderActiveChatMessages() {
    if (!waMessagesContainer || !activeChatId) return;
    waMessagesContainer.innerHTML = '';
    
    const msgs = whatsappChats[activeChatId].messages;
    
    // Sort ascending for chat view
    const sortedMsgs = [...msgs].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

    sortedMsgs.forEach(msg => {
      const isOutgoing = msg.type === 'saliente';
      
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.justifyContent = isOutgoing ? 'flex-end' : 'flex-start';
      wrap.style.width = '100%';
      
      const bubble = document.createElement('div');
      bubble.style.maxWidth = '65%';
      bubble.style.padding = '8px 12px';
      bubble.style.borderRadius = '8px';
      bubble.style.fontSize = '0.9rem';
      bubble.style.position = 'relative';
      bubble.style.lineHeight = '1.4';
      bubble.style.boxShadow = '0 1px 1px rgba(0,0,0,0.2)';
      
      if (isOutgoing) {
        bubble.style.background = '#005c4b'; // WA Web dark green
        bubble.style.color = '#e9edef';
        bubble.style.borderTopRightRadius = '0px';
      } else {
        bubble.style.background = '#202c33'; // WA Web dark gray
        bubble.style.color = '#e9edef';
        bubble.style.borderTopLeftRadius = '0px';
      }
      
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      let contentHtml = `<div style="margin-bottom: 15px; word-wrap: break-word; white-space: pre-wrap; padding-right: 20px;">${msg.text}</div>`;
      
      const mediaMatch = msg.text.match(/^\[MEDIA:(.*?)\]\s+(.*)$/);
      let mediaPath = null;
      if (mediaMatch) {
        const type = mediaMatch[1];
        mediaPath = mediaMatch[2];
        const icon = type === 'image' ? 'fa-image' : type === 'video' ? 'fa-video' : type === 'audio' ? 'fa-music' : 'fa-file';
        const label = type === 'image' ? 'Ver Imagen' : type === 'video' ? 'Ver Video' : type === 'audio' ? 'Escuchar Audio' : 'Abrir Documento';
        
        let preview = '';
        if (type === 'image') {
          preview = `<img src="file:///${mediaPath.replace(/\\/g, '/')}" style="max-width: 100%; border-radius: 5px; margin-bottom: 8px; max-height: 200px; object-fit: cover;">`;
        }
        
        contentHtml = `
          <div style="margin-bottom: 15px; padding-right: 20px;">
            ${preview}
            <button class="wa-media-btn" data-path="${mediaPath.replace(/\\/g, '/')}" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 0.85rem; width: 100%; justify-content: center;">
              <i class="fa-solid ${icon}"></i> ${label}
            </button>
          </div>
        `;
      }

      bubble.innerHTML = `
        ${contentHtml}
        <div style="font-size: 0.65rem; color: rgba(255,255,255,0.6); display: flex; justify-content: flex-end; align-items: center; gap: 4px; position: absolute; bottom: 4px; right: 8px;">
          ${timeStr}
          ${isOutgoing ? '<i class="fa-solid fa-check-double" style="color: #53bdeb;"></i>' : ''}
        </div>
      `;
      
      const deleteBtn = document.createElement('div');
      deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      deleteBtn.style.position = 'absolute';
      deleteBtn.style.top = '4px';
      deleteBtn.style.right = '4px';
      deleteBtn.style.fontSize = '0.7rem';
      deleteBtn.style.color = 'rgba(255,255,255,0.4)';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.padding = '4px';
      deleteBtn.title = 'Eliminar mensaje de la base de datos';
      deleteBtn.onmouseenter = () => deleteBtn.style.color = '#ef4444';
      deleteBtn.onmouseleave = () => deleteBtn.style.color = 'rgba(255,255,255,0.4)';
      
      deleteBtn.onclick = async () => {
        const confirmDelete = confirm('¿Seguro que deseas eliminar este mensaje del historial?');
        if (!confirmDelete) return;
        
        try {
          const res = await window.api.deleteWhatsAppMessage(msg.id);
          if (res.success) {
            whatsappChats[activeChatId].messages = whatsappChats[activeChatId].messages.filter(m => m.id !== msg.id);
            renderWhatsAppChatsList();
            renderActiveChatMessages();
            showToast('Mensaje eliminado.', 'success');
          } else {
            showToast('Error al eliminar: ' + res.message, 'error');
          }
        } catch (e) {
          showToast('Error de red al intentar eliminar.', 'error');
        }
      };
      
      bubble.appendChild(deleteBtn);
      
      wrap.appendChild(bubble);
      waMessagesContainer.appendChild(wrap);
    });
    
    // Add listeners to media buttons
    const mediaBtns = waMessagesContainer.querySelectorAll('.wa-media-btn');
    mediaBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const path = btn.getAttribute('data-path');
        const res = await window.api.openLocalFile(path);
        if (!res.success) {
          showToast('Error al abrir archivo: ' + res.message, 'error');
        }
      });
    });
    
    // Scroll al final
    waMessagesContainer.scrollTop = waMessagesContainer.scrollHeight;
  }

  async function sendWhatsAppMsg() {
    if (!activeChatId) return;
    const text = waMessageInput.value.trim();
    if (!text) return;
    
    waMessageInput.disabled = true;
    waSendBtn.disabled = true;
    
    try {
      const res = await window.api.sendWhatsApp(activeChatId, text);
      if (res.success) {
        waMessageInput.value = '';
        addMessageToChat({
          id: res.id || 'local_' + Date.now(),
          senderId: activeChatId,
          senderName: 'Nosotros',
          text: text,
          type: 'saliente',
          timestamp: res.timestamp || new Date().toISOString()
        });
        renderWhatsAppChatsList();
        renderActiveChatMessages();
      } else {
        showToast('Error al enviar mensaje: ' + res.message, 'error');
      }
    } catch (e) {
      showToast('Error de red al enviar mensaje.', 'error');
    } finally {
      waMessageInput.disabled = false;
      waSendBtn.disabled = false;
      waMessageInput.focus();
    }
  }

  if (waSendBtn) {
    waSendBtn.addEventListener('click', sendWhatsAppMsg);
  }
  if (waMessageInput) {
    waMessageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendWhatsAppMsg();
    });
  }

  const waAttachBtn = document.getElementById('wa-attach-btn');
  const waAttachInput = document.getElementById('wa-attach-input');
  
  if (waAttachBtn && waAttachInput) {
    waAttachBtn.addEventListener('click', () => {
      if (!activeChatId) {
        showToast('Selecciona un chat primero.', 'warning');
        return;
      }
      waAttachInput.click();
    });
    
    waAttachInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !activeChatId) return;
      
      const fileType = file.type;
      const fileName = file.name;
      
      waMessageInput.disabled = true;
      waSendBtn.disabled = true;
      showToast('Enviando archivo...', 'info');
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        
        const res = await window.api.sendWhatsAppMedia(activeChatId, arrayBuffer, fileType, fileName);
        if (res.success) {
          addMessageToChat({
            id: res.id || 'local_' + Date.now(),
            senderId: activeChatId,
            senderName: 'Nosotros',
            text: res.text || ('[Archivo Adjunto] ' + fileName),
            type: 'saliente',
            timestamp: res.timestamp || new Date().toISOString()
          });
          renderWhatsAppChatsList();
          renderActiveChatMessages();
          showToast('Archivo enviado.', 'success');
        } else {
          showToast('Error al enviar archivo: ' + res.message, 'error');
        }
      } catch (err) {
        showToast('Error de red al enviar archivo.', 'error');
      } finally {
        waMessageInput.disabled = false;
        waSendBtn.disabled = false;
        waAttachInput.value = ''; // reset input
        waMessageInput.focus();
      }
    });
  }


  // --- 20. PESTAÑAS DE PLATAFORMAS DE CHAT ---
  const chatTabBtns = document.querySelectorAll('.chat-tab-btn');
  const chatPanes = document.querySelectorAll('.chat-pane');

  if (chatTabBtns.length > 0) {
    chatTabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Remover clase active de todos los botones y restaurar estilos inactivos
        chatTabBtns.forEach(b => {
          b.classList.remove('active');
          b.style.background = 'rgba(99, 102, 241, 0.2)';
          b.style.color = '#818cf8';
        });

        // Ocultar el badge rojo de la pestaña que acabamos de abrir
        let platform = '';
        const dataTarget = btn.getAttribute('data-target');
        if (dataTarget.includes('wa')) platform = 'whatsapp';
        else if (dataTarget.includes('gmail')) platform = 'gmail';
        else if (dataTarget.includes('telegram')) platform = 'telegram';
        
        if (platform) {
          const badge = document.getElementById(`badge-${platform}`);
          if (badge) badge.style.display = 'none';
        }

        // Ocultar todos los paneles
        chatPanes.forEach(pane => {
          pane.style.display = 'none';
        });

        // Activar el botón clicado
        const targetBtn = e.target;
        targetBtn.classList.add('active');
        targetBtn.style.background = 'var(--primary)';
        targetBtn.style.color = 'white';

        // Mostrar el panel correspondiente
        const targetPaneId = targetBtn.getAttribute('data-target');
        const targetPane = document.getElementById(targetPaneId);
        if (targetPane) {
          targetPane.style.display = 'block';
        }
      });
    });
  }

});


// SINCRONIZACION DEL SCROLL HORIZONTAL SUPERIOR E INFERIOR EN REPARACIONES
document.addEventListener('DOMContentLoaded', () => {
  const topScroll = document.getElementById('repairs-top-scroll');
  const topScrollContent = document.getElementById('repairs-top-scroll-content');
  const tableWrapper = document.getElementById('repairs-table-wrapper');
  const table = document.getElementById('repairs-table');

  if (topScroll && topScrollContent && tableWrapper && table) {
    // Sincronizar el scroll de arriba hacia abajo
    topScroll.addEventListener('scroll', () => {
      tableWrapper.scrollLeft = topScroll.scrollLeft;
    });

    // Sincronizar el scroll de abajo hacia arriba
    tableWrapper.addEventListener('scroll', () => {
      topScroll.scrollLeft = tableWrapper.scrollLeft;
    });

    // Observar cambios en el tamaño de la tabla para ajustar el "falso" contenido de arriba
    const resizeObserver = new ResizeObserver(() => {
      topScrollContent.style.width = table.offsetWidth + 'px';
    });
    
    resizeObserver.observe(table);
  }
});


// BUSCADOR / INICIAR NUEVO CHAT WHATSAPP
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('wa-search-chats');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = searchInput.value.trim();
        if (val) {
          // Asumimos que si ingresa puros numeros, quiere iniciar un chat
          const isNumber = /^[0-9]+$/.test(val);
          if (isNumber) {
            const senderId = val + '@s.whatsapp.net';
            if (typeof whatsappChats !== 'undefined') {
              if (!whatsappChats[senderId]) {
                whatsappChats[senderId] = {
                  name: val,
                  number: val,
                  messages: []
                };
              }
              if (typeof renderWhatsAppChatsList === 'function') {
                renderWhatsAppChatsList();
              }
              // Seleccionar el chat automáticamente
              setTimeout(() => {
                const chatEl = document.querySelector(`.wa-chat-item[data-sender="${senderId}"]`);
                if (chatEl) chatEl.click();
              }, 100);
              searchInput.value = '';
            }
          }
        }
      }
    });
  }
});

// ============================================================================
// MÓDULO DE NOTAS
// ============================================================================

(function () {
  let allNotas = [];
  let notaColorSeleccionado = 'default';

  const notaModal      = document.getElementById('nota-modal');
  const notaForm       = document.getElementById('nota-form');
  const notaIdInput    = document.getElementById('nota-id');
  const notaTituloInput= document.getElementById('nota-titulo');
  const notaContenido  = document.getElementById('nota-contenido');
  const notaFijada     = document.getElementById('nota-fijada');
  const notaModalTitle = document.getElementById('nota-modal-title');
  const notaGrid       = document.getElementById('notas-grid');
  const notaEmpty      = document.getElementById('notas-empty');
  const notaCounter    = document.getElementById('notas-counter');
  const notaSearch     = document.getElementById('notas-search');
  const addNotaBtn     = document.getElementById('add-nota-btn');

  // ── Helpers de fecha ──────────────────────────────────────────────────────
  function formatNotaDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ── Render de tarjetas ────────────────────────────────────────────────────
  window.renderNotas = async function () {
    try {
      allNotas = await window.api.getNotas();
    } catch (e) {
      allNotas = [];
    }
    renderNotasGrid(allNotas);
  };

  function renderNotasGrid(notas) {
    const termino = notaSearch ? notaSearch.value.trim().toLowerCase() : '';
    const filtered = termino
      ? notas.filter(n =>
          (n.titulo || '').toLowerCase().includes(termino) ||
          (n.contenido || '').toLowerCase().includes(termino)
        )
      : notas;

    if (notaCounter) {
      notaCounter.textContent = filtered.length === 1 ? '1 nota' : `${filtered.length} notas`;
    }

    if (!notaGrid) return;
    notaGrid.innerHTML = '';

    if (filtered.length === 0) {
      if (notaEmpty) notaEmpty.style.display = 'flex';
      return;
    }
    if (notaEmpty) notaEmpty.style.display = 'none';

    filtered.forEach(nota => {
      const card = document.createElement('div');
      card.className = 'nota-card';
      card.dataset.color = nota.color || 'default';
      card.dataset.id = nota.id;

      const tituloText = nota.titulo && nota.titulo.trim() ? nota.titulo : 'Sin título';
      const esSinTitulo = !nota.titulo || !nota.titulo.trim();

      card.innerHTML = `
        <div class="nota-card-header">
          <span class="nota-card-titulo${esSinTitulo ? ' sin-titulo' : ''}">${escapeHtml(tituloText)}</span>
          ${nota.fijada ? '<i class="fa-solid fa-thumbtack nota-pin-badge"></i>' : ''}
        </div>
        ${nota.contenido ? `<div class="nota-card-contenido">${escapeHtml(nota.contenido)}</div>` : ''}
        <div class="nota-card-footer">
          <span class="nota-card-date">${formatNotaDate(nota.fecha_actualizacion || nota.fecha_creacion)}</span>
          <div class="nota-card-actions">
            <button class="nota-action-btn pin" title="${nota.fijada ? 'Desfijar' : 'Fijar'}" data-action="pin">
              <i class="fa-solid fa-thumbtack"></i>
            </button>
            <button class="nota-action-btn edit" title="Editar" data-action="edit">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="nota-action-btn delete" title="Eliminar" data-action="delete">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;

      // Clic en la tarjeta → editar
      card.addEventListener('click', (e) => {
        if (e.target.closest('.nota-card-actions')) return;
        openNotaModal(nota);
      });

      // Botones de acción
      card.querySelector('[data-action="pin"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.api.toggleNotaFijada(nota.id);
        await window.renderNotas();
      });

      card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
        e.stopPropagation();
        openNotaModal(nota);
      });

      // Botón eliminar con confirmación inline de 2 pasos
      const deleteBtn = card.querySelector('[data-action="delete"]');
      let deleteConfirmTimer = null;

      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        if (deleteBtn.dataset.confirming === 'true') {
          // Segundo click — confirmar eliminación
          clearTimeout(deleteConfirmTimer);
          deleteBtn.dataset.confirming = 'false';
          deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
          deleteBtn.style.color = '';
          deleteBtn.style.borderColor = '';
          deleteBtn.style.background = '';
          await window.api.deleteNota(nota.id);
          await window.renderNotas();
        } else {
          // Primer click — pedir confirmación visual
          deleteBtn.dataset.confirming = 'true';
          deleteBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
          deleteBtn.style.color = '#f87171';
          deleteBtn.style.borderColor = 'rgba(239,68,68,0.5)';
          deleteBtn.style.background = 'rgba(239,68,68,0.12)';
          deleteBtn.title = 'Clic de nuevo para confirmar';

          // Resetear después de 2.5s si no confirma
          deleteConfirmTimer = setTimeout(() => {
            deleteBtn.dataset.confirming = 'false';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            deleteBtn.style.color = '';
            deleteBtn.style.borderColor = '';
            deleteBtn.style.background = '';
            deleteBtn.title = 'Eliminar';
          }, 2500);
        }
      });


      notaGrid.appendChild(card);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function openNotaModal(nota = null) {
    if (!notaModal) return;

    if (nota) {
      notaModalTitle.textContent = 'Editar Nota';
      notaIdInput.value = nota.id;
      notaTituloInput.value = nota.titulo || '';
      notaContenido.value = nota.contenido || '';
      notaFijada.checked = !!nota.fijada;
      notaColorSeleccionado = nota.color || 'default';
    } else {
      notaModalTitle.textContent = 'Nueva Nota';
      notaIdInput.value = '';
      notaTituloInput.value = '';
      notaContenido.value = '';
      notaFijada.checked = false;
      notaColorSeleccionado = 'default';
    }

    // Actualizar selector de color
    document.querySelectorAll('.nota-color-dot').forEach(dot => {
      dot.classList.toggle('selected', dot.dataset.color === notaColorSeleccionado);
    });

    notaModal.style.display = 'flex';
    setTimeout(() => notaTituloInput.focus(), 80);
  }

  function closeNotaModal() {
    if (notaModal) notaModal.style.display = 'none';
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  if (addNotaBtn) {
    addNotaBtn.addEventListener('click', () => openNotaModal());
  }

  if (notaModal) {
    // Cerrar al click en overlay
    notaModal.addEventListener('click', (e) => {
      if (e.target === notaModal) closeNotaModal();
    });

    // Botón ×
    const closeBtns = notaModal.querySelectorAll('.nota-modal-close, .modal-close-btn');
    closeBtns.forEach(btn => btn.addEventListener('click', closeNotaModal));
  }

  // Selector de color
  document.querySelectorAll('.nota-color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      notaColorSeleccionado = dot.dataset.color;
      document.querySelectorAll('.nota-color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
  });

  // Guardar nota
  if (notaForm) {
    notaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = notaIdInput.value ? parseInt(notaIdInput.value) : null;
      const nota = {
        id,
        titulo: notaTituloInput.value.trim(),
        contenido: notaContenido.value.trim(),
        color: notaColorSeleccionado,
        fijada: notaFijada.checked
      };

      const res = await window.api.saveNota(nota);
      if (res && res.success !== false) {
        closeNotaModal();
        await window.renderNotas();
      }
    });
  }

  // Buscador en tiempo real
  if (notaSearch) {
    notaSearch.addEventListener('input', () => renderNotasGrid(allNotas));
  }

})();

// ============================================================================
// MÓDULO DE MODELOS DE DOCUMENTOS (Facturas, Recibos, Notas de Venta)
// ============================================================================

(function () {
  let allModels = [];
  let currentTab = 'Todos';
  let selectedFileBase64 = null;
  let selectedFileName = '';
  let selectedFileType = '';

  const modelsModal       = document.getElementById('invoice-models-modal');
  const modelsGrid        = document.getElementById('models-grid');
  const modelsEmpty       = document.getElementById('models-empty-state');
  const modelsSearchInput = document.getElementById('models-search-input');
  const toggleUploadBtn   = document.getElementById('toggle-upload-model-btn');
  const uploadPanel       = document.getElementById('models-upload-panel');
  const closeUploadBtn    = document.getElementById('close-upload-panel-btn');
  const cancelUploadBtn   = document.getElementById('cancel-upload-btn');
  const modelForm         = document.getElementById('model-upload-form');
  const modelFormTitle    = document.getElementById('model-form-title');
  const modelEditId       = document.getElementById('model-edit-id');
  const modelDropzone     = document.getElementById('model-dropzone');
  const modelFileInput    = document.getElementById('model-file-input');
  const dropzonePrompt    = document.getElementById('dropzone-prompt');
  const previewBox        = document.getElementById('model-preview-box');
  const previewImg        = document.getElementById('model-preview-img');
  const fileInfoEl        = document.getElementById('model-file-info');
  const modelNameInput    = document.getElementById('model-name-input');
  const modelTypeSelect   = document.getElementById('model-type-select');
  const modelDescInput    = document.getElementById('model-desc-input');
  const modelIsDefault    = document.getElementById('model-is-default-check');

  // Lightbox
  const lightboxModal     = document.getElementById('model-lightbox-modal');
  const lightboxImg       = document.getElementById('lightbox-img');
  const lightboxTitle     = document.getElementById('lightbox-title');
  const lightboxBadge     = document.getElementById('lightbox-badge-type');
  const lightboxDesc      = document.getElementById('lightbox-desc');
  const lightboxDate      = document.getElementById('lightbox-date');
  const lightboxDownload  = document.getElementById('lightbox-download-btn');

  const VALID_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

  function formatModelDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getBadgeClass(tipo) {
    if (!tipo) return 'otro';
    const t = tipo.toLowerCase().trim();
    if (t.includes('factura')) return 'factura';
    if (t.includes('recibo')) return 'recibo';
    if (t.includes('nota')) return 'nota-de-venta';
    return 'otro';
  }

  // ── Abrir y Cerrar Modal Principal ──────────────────────────────────────────
  window.openInvoiceModelsModal = async function () {
    if (modelsModal) {
      modelsModal.style.display = 'flex';
      hideUploadPanel();
      await loadAndRenderModels();
    }
  };

  // ── Cargar modelos de base de datos ─────────────────────────────────────────
  async function loadAndRenderModels() {
    try {
      const res = await window.api.getModelosDocumentos();
      allModels = (res && res.success && res.recordset) ? res.recordset : [];
    } catch (e) {
      console.error('Error al cargar modelos:', e);
      allModels = [];
    }
    renderModelsGrid();
  }

  // ── Renderizado de la cuadrícula ──────────────────────────────────────────
  function renderModelsGrid() {
    if (!modelsGrid) return;
    const searchTerm = modelsSearchInput ? modelsSearchInput.value.trim().toLowerCase() : '';

    let filtered = allModels;

    // Filtro por pestaña
    if (currentTab !== 'Todos') {
      filtered = filtered.filter(m => (m.tipo || '').toLowerCase() === currentTab.toLowerCase());
    }

    // Filtro por búsqueda
    if (searchTerm) {
      filtered = filtered.filter(m =>
        (m.nombre || '').toLowerCase().includes(searchTerm) ||
        (m.descripcion || '').toLowerCase().includes(searchTerm) ||
        (m.tipo || '').toLowerCase().includes(searchTerm)
      );
    }

    modelsGrid.innerHTML = '';

    if (filtered.length === 0) {
      if (modelsEmpty) modelsEmpty.style.display = 'block';
      return;
    }
    if (modelsEmpty) modelsEmpty.style.display = 'none';

    filtered.forEach(model => {
      const card = document.createElement('div');
      card.className = `model-card${model.es_predeterminado ? ' is-default' : ''}`;
      card.dataset.id = model.id;

      const badgeClass = getBadgeClass(model.tipo);
      const isDefaultBadge = model.es_predeterminado
        ? `<div class="model-badge-default"><i class="fa-solid fa-star"></i> Predeterminado</div>`
        : '';

      card.innerHTML = `
        <div class="model-thumb-container" title="Clic para ampliar">
          <span class="model-badge-type ${badgeClass}">${escapeHtml(model.tipo || 'Documento')}</span>
          ${isDefaultBadge}
          <img src="${model.archivo_data || ''}" alt="${escapeHtml(model.nombre)}" loading="lazy">
          <div class="model-thumb-overlay"><i class="fa-solid fa-magnifying-glass-plus"></i></div>
        </div>
        <div class="model-card-body">
          <div class="model-card-title" title="${escapeHtml(model.nombre)}">${escapeHtml(model.nombre)}</div>
          <div class="model-card-desc">${escapeHtml(model.descripcion || 'Sin descripción adicional')}</div>
          <div class="model-card-footer">
            <span class="model-card-date"><i class="fa-regular fa-calendar"></i> ${formatModelDate(model.fecha_subida)}</span>
            <div class="model-card-actions">
              <button class="model-action-btn calibrate" title="Diseñar / Calibrar Campos y Cuadrícula" data-action="calibrate" style="color: #60a5fa; border-color: rgba(59, 130, 246, 0.4); background: rgba(59, 130, 246, 0.1);">
                <i class="fa-solid fa-crosshairs"></i>
              </button>
              <button class="model-action-btn star${model.es_predeterminado ? ' active' : ''}" title="${model.es_predeterminado ? 'Modelo predeterminado' : 'Marcar como predeterminado'}" data-action="default">
                <i class="fa-solid fa-star"></i>
              </button>
              <button class="model-action-btn view" title="Ver en alta resolución" data-action="view">
                <i class="fa-solid fa-eye"></i>
              </button>
              <button class="model-action-btn delete" title="Eliminar modelo" data-action="delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `;

      // Clic en la miniatura → Abrir lightbox
      card.querySelector('.model-thumb-container').addEventListener('click', () => {
        openLightbox(model);
      });

      // Botón Calibrar
      card.querySelector('[data-action="calibrate"]').addEventListener('click', (e) => {
        e.stopPropagation();
        openCalibratorModal(model);
      });

      // Botón Ver
      card.querySelector('[data-action="view"]').addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(model);
      });

      // Botón Predeterminado
      card.querySelector('[data-action="default"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.api.setPredeterminadoModelo(model.id, model.tipo);
        showToast(`Modelo marcado como predeterminado para ${model.tipo}`, 'success');
        await loadAndRenderModels();
      });

      // Botón Eliminar con confirmación
      card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`¿Deseas eliminar el modelo "${model.nombre}"?`)) {
          const res = await window.api.deleteModeloDocumento(model.id);
          if (res && res.success) {
            showToast('Modelo eliminado correctamente.', 'info');
            await loadAndRenderModels();
          } else {
            showToast('Error al eliminar modelo.', 'error');
          }
        }
      });

      modelsGrid.appendChild(card);
    });
  }

  // ── Lightbox / Visualizador en alta resolución ───────────────────────────────
  function openLightbox(model) {
    if (!lightboxModal) return;
    lightboxImg.src = model.archivo_data || '';
    lightboxTitle.textContent = model.nombre || 'Modelo';
    lightboxBadge.textContent = model.tipo || 'Documento';
    lightboxBadge.className = `model-badge-type ${getBadgeClass(model.tipo)}`;
    lightboxBadge.style.position = 'static';
    lightboxDesc.textContent = model.descripcion || '';
    lightboxDate.textContent = `Subido el ${formatModelDate(model.fecha_subida)}`;
    
    lightboxDownload.href = model.archivo_data || '#';
    lightboxDownload.download = `${(model.nombre || 'modelo').replace(/\s+/g, '_')}_${model.archivo_nombre || 'documento.png'}`;

    lightboxModal.style.display = 'flex';
  }

  // ── Manejo de Archivos e Imágenes (Drag & Drop + File Input) ─────────────────
  function handleFileSelection(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!VALID_EXTENSIONS.includes(ext) && !file.type.startsWith('image/')) {
      showToast(`Formato no compatible (.${ext}). Usa JPG, JPEG, PNG, GIF, WebP o SVG.`, 'warning');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showToast('La imagen excede el límite recomendado de 15MB.', 'warning');
      return;
    }

    selectedFileName = file.name;
    selectedFileType = file.type || `image/${ext}`;

    const reader = new FileReader();
    reader.onload = (e) => {
      selectedFileBase64 = e.target.result;
      if (previewImg) previewImg.src = selectedFileBase64;
      if (previewBox) previewBox.style.display = 'block';
      if (dropzonePrompt) dropzonePrompt.style.display = 'none';
      if (fileInfoEl) fileInfoEl.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

      // Autocompletar nombre si está vacío
      if (modelNameInput && !modelNameInput.value.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        modelNameInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      }
    };
    reader.readAsDataURL(file);
  }

  // ── Drag & Drop Listeners ───────────────────────────────────────────────────
  if (modelDropzone) {
    modelDropzone.addEventListener('click', () => {
      if (modelFileInput) modelFileInput.click();
    });

    modelDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      modelDropzone.classList.add('dragover');
    });

    modelDropzone.addEventListener('dragleave', () => {
      modelDropzone.classList.remove('dragover');
    });

    modelDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      modelDropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelection(e.dataTransfer.files[0]);
      }
    });
  }

  if (modelFileInput) {
    modelFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelection(e.target.files[0]);
      }
    });
  }

  // ── Toggle / Mostrar / Ocultar Panel de Subida ──────────────────────────────
  function showUploadPanel(isEdit = false, model = null) {
    if (!uploadPanel) return;
    uploadPanel.style.display = 'block';
    uploadPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (isEdit && model) {
      if (modelFormTitle) modelFormTitle.innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> Editar Modelo';
      if (modelEditId) modelEditId.value = model.id;
      if (modelNameInput) modelNameInput.value = model.nombre || '';
      if (modelTypeSelect) modelTypeSelect.value = model.tipo || 'Factura';
      if (modelDescInput) modelDescInput.value = model.descripcion || '';
      if (modelIsDefault) modelIsDefault.checked = !!model.es_predeterminado;
      selectedFileBase64 = model.archivo_data || null;
      selectedFileName = model.archivo_nombre || '';
      selectedFileType = model.archivo_tipo || '';

      if (selectedFileBase64 && previewImg) {
        previewImg.src = selectedFileBase64;
        if (previewBox) previewBox.style.display = 'block';
        if (dropzonePrompt) dropzonePrompt.style.display = 'none';
        if (fileInfoEl) fileInfoEl.textContent = model.archivo_nombre || 'Imagen actual';
      }
    } else {
      if (modelFormTitle) modelFormTitle.innerHTML = '<i class="fa-solid fa-file-image" style="color: var(--primary);"></i> Subir Nueva Imagen de Modelo';
      if (modelForm) modelForm.reset();
      if (modelEditId) modelEditId.value = '';
      selectedFileBase64 = null;
      selectedFileName = '';
      selectedFileType = '';
      if (previewBox) previewBox.style.display = 'none';
      if (dropzonePrompt) dropzonePrompt.style.display = 'block';
      if (modelFileInput) modelFileInput.value = '';
    }
  }

  function hideUploadPanel() {
    if (uploadPanel) uploadPanel.style.display = 'none';
    if (modelForm) modelForm.reset();
    if (modelEditId) modelEditId.value = '';
    selectedFileBase64 = null;
    selectedFileName = '';
    selectedFileType = '';
    if (previewBox) previewBox.style.display = 'none';
    if (dropzonePrompt) dropzonePrompt.style.display = 'block';
  }

  if (toggleUploadBtn) {
    toggleUploadBtn.addEventListener('click', () => {
      if (uploadPanel.style.display === 'none' || !uploadPanel.style.display) {
        showUploadPanel(false);
      } else {
        hideUploadPanel();
      }
    });
  }

  if (closeUploadBtn) closeUploadBtn.addEventListener('click', hideUploadPanel);
  if (cancelUploadBtn) cancelUploadBtn.addEventListener('click', hideUploadPanel);

  // ── Guardar Modelo (Submit Form) ────────────────────────────────────────────
  if (modelForm) {
    modelForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const editId = modelEditId && modelEditId.value ? parseInt(modelEditId.value, 10) : null;

      if (!editId && !selectedFileBase64) {
        showToast('Por favor selecciona o arrastra una imagen de modelo (JPG, PNG, GIF, WebP o SVG).', 'warning');
        return;
      }

      const nombre = modelNameInput ? modelNameInput.value.trim() : '';
      const tipo = modelTypeSelect ? modelTypeSelect.value : 'Factura';
      const descripcion = modelDescInput ? modelDescInput.value.trim() : '';
      const esPredeterminado = modelIsDefault ? modelIsDefault.checked : false;

      if (!nombre) {
        showToast('El nombre del modelo es obligatorio.', 'warning');
        return;
      }

      const payload = {
        id: editId,
        nombre,
        tipo,
        descripcion,
        archivo_nombre: selectedFileName || 'modelo.png',
        archivo_tipo: selectedFileType || 'image/png',
        archivo_data: selectedFileBase64,
        es_predeterminado: esPredeterminado
      };

      const res = await window.api.saveModeloDocumento(payload);
      if (res && res.success) {
        showToast(editId ? 'Modelo actualizado exitosamente.' : '¡Modelo subido con éxito! Abriendo calibrador de cuadrícula...', 'success');
        hideUploadPanel();
        await loadAndRenderModels();

        // Si es un modelo nuevo recién creado, abrir el calibrador directamente
        const savedId = res.id || editId;
        const savedModel = allModels.find(m => m.id === savedId) || { ...payload, id: savedId };
        openCalibratorModal(savedModel);
      } else {
        showToast('Error al guardar el modelo: ' + (res ? res.message : ''), 'error');
      }
    });
  }

  // ── Filtros por pestaña ─────────────────────────────────────────────────────
  document.querySelectorAll('.models-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.models-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab || 'Todos';
      renderModelsGrid();
    });
  });

  // ── Buscador en tiempo real ─────────────────────────────────────────────────
  if (modelsSearchInput) {
    modelsSearchInput.addEventListener('input', () => {
      renderModelsGrid();
    });
  }

  // ==========================================================================
  // CALIBRADOR / DISEÑADOR DE CAMPOS CON CUADRÍCULA Y TRANSPARENCIA
  // ==========================================================================

  const DEFAULT_FIELDS_DEF = [
    { id: 'fecha_emision',      label: 'FECHA DE EMISION:',   cat: 'header',    sample: 'Loja, 1/8/2026 12:6:51', x: 22.0, y: 20.5 },
    { id: 'cliente',            label: 'CLIENTE:',            cat: 'header',    sample: 'Yeison Fernando Campoverde', x: 20.0, y: 24.0 },
    { id: 'direccion',          label: 'DIRECCION:',          cat: 'header',    sample: 'Los Rosales', x: 18.0, y: 27.5 },
    { id: 'usuario',            label: 'Ususario:',           cat: 'header',    sample: 'administrador', x: 53.0, y: 20.5 },
    { id: 'forma_pago',         label: 'Forma pago:',         cat: 'header',    sample: 'Efectivo', x: 53.0, y: 22.5 },
    { id: 'guia_remision',      label: 'GUIA DE REMISION:',   cat: 'header',    sample: '001-001', x: 74.0, y: 20.5 },
    { id: 'ruc_ci',             label: 'R.U.C./C.I.:',        cat: 'header',    sample: '2150507511', x: 74.0, y: 23.8 },
    { id: 'telfs',              label: 'TELFS:',              cat: 'header',    sample: '0980252022', x: 74.0, y: 27.0 },
    { id: 'cambio',             label: 'Cambio:',             cat: 'total',     sample: '$ 9.68', x: 91.0, y: 95.0 },
    { id: 'col_cant',           label: 'CANT.',               cat: 'table',     sample: '1', x: 4.8, y: 31.5 },
    { id: 'col_codigo',         label: 'CODIGO',              cat: 'table',     sample: '00442-SC', x: 11.5, y: 31.5 },
    { id: 'col_descripcion',    label: 'DESCRIPCION',         cat: 'table',     sample: '*IC TTL 74LS11/NTE74LS11', x: 45.0, y: 31.5 },
    { id: 'col_unitario',       label: 'VALOR UNITARIO',      cat: 'table',     sample: '1.2599', x: 83.5, y: 31.5 },
    { id: 'col_total',          label: 'VALOR TOTAL',         cat: 'table',     sample: '1.2599', x: 94.5, y: 31.5 },
    { id: 'valor_total_usd',    label: 'VALOR TOTAL $',       cat: 'total',     sample: '10.32', x: 86.0, y: 80.5 },
    { id: 'entregue_conforme',  label: 'ENTREGUE CONFORME',   cat: 'signature', sample: 'Firma Emisor', x: 40.0, y: 95.0 },
    { id: 'recibi_conforme',    label: 'RECIBI CONFORME',     cat: 'signature', sample: 'Firma Cliente', x: 65.0, y: 95.0 }
  ];

  let activeCalibratorModel = null;
  let activeFieldsData = [];
  let selectedMarkerId = null;
  let isDragging = false;
  let dragFieldId = null;
  let currentZoom = 1;
  let isSnapEnabled = true;

  const calibratorModal     = document.getElementById('model-calibrator-modal');
  const calibratorTitle     = document.getElementById('calibrator-modal-title');
  const calibratorCanvas    = document.getElementById('calibrator-canvas');
  const calibratorBgImg     = document.getElementById('calibrator-bg-img');
  const calibratorGridLayer = document.getElementById('calibrator-grid-overlay');
  const calibratorMarkers   = document.getElementById('calibrator-markers-layer');
  const calibratorFieldsList= document.getElementById('calibrator-fields-list');
  const opacitySlider       = document.getElementById('calibrator-opacity-slider');
  const opacityValText      = document.getElementById('calibrator-opacity-val');
  const toggleGridBtn       = document.getElementById('calibrator-toggle-grid-btn');
  const gridSizeSelect      = document.getElementById('calibrator-grid-size-select');
  const snapBtn             = document.getElementById('calibrator-snap-btn');
  const zoomInBtn           = document.getElementById('calibrator-zoom-in');
  const zoomOutBtn          = document.getElementById('calibrator-zoom-out');
  const zoomFitBtn          = document.getElementById('calibrator-zoom-fit');
  const zoomValText         = document.getElementById('calibrator-zoom-val');
  const resetBtn            = document.getElementById('calibrator-reset-btn');
  const saveCalibratorBtn   = document.getElementById('calibrator-save-btn');

  window.openCalibratorModal = function (model) {
    if (!calibratorModal || !model) return;
    activeCalibratorModel = model;

    if (calibratorTitle) {
      calibratorTitle.innerHTML = `<i class="fa-solid fa-object-ungroup" style="color: var(--primary);"></i> Calibrando: <strong>${escapeHtml(model.nombre || 'Modelo')}</strong> (${model.tipo || 'Documento'})`;
    }

    if (calibratorBgImg) {
      calibratorBgImg.src = model.archivo_data || '';
    }

    // Cargar o inicializar campos
    let savedFields = [];
    if (model.campos_config) {
      try {
        savedFields = typeof model.campos_config === 'string' ? JSON.parse(model.campos_config) : model.campos_config;
      } catch (e) {
        savedFields = [];
      }
    }

    // Merge con la lista base de 17 campos
    activeFieldsData = DEFAULT_FIELDS_DEF.map(def => {
      const found = Array.isArray(savedFields) ? savedFields.find(s => s.id === def.id) : null;
      return {
        ...def,
        x: found && typeof found.x === 'number' ? found.x : def.x,
        y: found && typeof found.y === 'number' ? found.y : def.y
      };
    });

    selectedMarkerId = null;
    currentZoom = 1;
    applyZoom();

    calibratorModal.style.display = 'flex';

    // Renderizar una vez cargue la imagen
    if (calibratorBgImg.complete) {
      renderCalibratorWorkspace();
    } else {
      calibratorBgImg.onload = () => renderCalibratorWorkspace();
    }
  };

  window.closeCalibratorModal = function () {
    if (calibratorModal) calibratorModal.style.display = 'none';
  };

  function renderCalibratorWorkspace() {
    renderMarkers();
    renderSidebarList();
  }

  function renderMarkers() {
    if (!calibratorMarkers) return;
    calibratorMarkers.innerHTML = '';

    activeFieldsData.forEach(field => {
      const marker = document.createElement('div');
      marker.className = `calibrator-marker${selectedMarkerId === field.id ? ' selected' : ''}`;
      marker.dataset.id = field.id;
      marker.dataset.cat = field.cat || 'header';
      marker.style.left = `${field.x}%`;
      marker.style.top = `${field.y}%`;

      marker.innerHTML = `
        <div class="calibrator-marker-pin"></div>
        <span class="calibrator-marker-label">${escapeHtml(field.label)}</span>
        <span class="calibrator-marker-val">${escapeHtml(field.sample)}</span>
      `;

      // Eventos de selección y arrastre
      marker.addEventListener('mousedown', (e) => startDragging(e, field.id));

      calibratorMarkers.appendChild(marker);
    });
  }

  function renderSidebarList() {
    if (!calibratorFieldsList) return;
    calibratorFieldsList.innerHTML = '';

    activeFieldsData.forEach(field => {
      const row = document.createElement('div');
      row.className = `calibrator-field-row${selectedMarkerId === field.id ? ' active' : ''}`;
      row.dataset.id = field.id;

      row.innerHTML = `
        <div class="calibrator-field-info">
          <span class="calibrator-field-title">${escapeHtml(field.label)}</span>
          <span class="calibrator-field-coords">X: ${field.x.toFixed(1)}% | Y: ${field.y.toFixed(1)}%</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--primary);"><i class="fa-solid fa-arrows-up-down-left-right"></i></div>
      `;

      row.addEventListener('click', () => {
        selectMarker(field.id);
      });

      calibratorFieldsList.appendChild(row);
    });
  }

  function selectMarker(id) {
    selectedMarkerId = id;
    document.querySelectorAll('.calibrator-marker').forEach(m => {
      m.classList.toggle('selected', m.dataset.id === id);
    });
    document.querySelectorAll('.calibrator-field-row').forEach(r => {
      r.classList.toggle('active', r.dataset.id === id);
    });
  }

  // ── Drag & Drop de Marcadores sobre el Canvas ───────────────────────────────
  function startDragging(e, fieldId) {
    e.preventDefault();
    e.stopPropagation();

    isDragging = true;
    dragFieldId = fieldId;
    selectMarker(fieldId);

    const markerEl = document.querySelector(`.calibrator-marker[data-id="${fieldId}"]`);
    if (markerEl) markerEl.classList.add('dragging');

    window.addEventListener('mousemove', onDragging);
    window.addEventListener('mouseup', stopDragging);
  }

  function onDragging(e) {
    if (!isDragging || !dragFieldId || !calibratorCanvas) return;

    const rect = calibratorCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Coordenadas relativas al canvas en porcentaje
    let xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    let yPercent = ((e.clientY - rect.top) / rect.height) * 100;

    // Snap to grid (redondeo a múltiplos de 1% o 0.5%)
    if (isSnapEnabled) {
      xPercent = Math.round(xPercent * 2) / 2;
      yPercent = Math.round(yPercent * 2) / 2;
    }

    // Límites 0% a 100%
    xPercent = Math.max(0.5, Math.min(99.5, xPercent));
    yPercent = Math.max(0.5, Math.min(99.5, yPercent));

    // Actualizar datos
    const field = activeFieldsData.find(f => f.id === dragFieldId);
    if (field) {
      field.x = xPercent;
      field.y = yPercent;

      const markerEl = document.querySelector(`.calibrator-marker[data-id="${dragFieldId}"]`);
      if (markerEl) {
        markerEl.style.left = `${xPercent}%`;
        markerEl.style.top = `${yPercent}%`;
      }

      // Actualizar coords en sidebar
      const row = document.querySelector(`.calibrator-field-row[data-id="${dragFieldId}"] .calibrator-field-coords`);
      if (row) {
        row.textContent = `X: ${xPercent.toFixed(1)}% | Y: ${yPercent.toFixed(1)}%`;
      }
    }
  }

  function stopDragging() {
    if (!isDragging) return;
    isDragging = false;

    if (dragFieldId) {
      const markerEl = document.querySelector(`.calibrator-marker[data-id="${dragFieldId}"]`);
      if (markerEl) markerEl.classList.remove('dragging');
      dragFieldId = null;
    }

    window.removeEventListener('mousemove', onDragging);
    window.removeEventListener('mouseup', stopDragging);
  }

  // ── Mover marcador seleccionado con flechas del teclado ─────────────────────
  window.addEventListener('keydown', (e) => {
    if (!calibratorModal || calibratorModal.style.display === 'none' || !selectedMarkerId) return;

    let step = e.shiftKey ? 1.0 : 0.2;
    let handled = false;

    const field = activeFieldsData.find(f => f.id === selectedMarkerId);
    if (!field) return;

    if (e.key === 'ArrowLeft') {
      field.x = Math.max(0.5, field.x - step);
      handled = true;
    } else if (e.key === 'ArrowRight') {
      field.x = Math.min(99.5, field.x + step);
      handled = true;
    } else if (e.key === 'ArrowUp') {
      field.y = Math.max(0.5, field.y - step);
      handled = true;
    } else if (e.key === 'ArrowDown') {
      field.y = Math.min(99.5, field.y + step);
      handled = true;
    }

    if (handled) {
      e.preventDefault();
      const markerEl = document.querySelector(`.calibrator-marker[data-id="${selectedMarkerId}"]`);
      if (markerEl) {
        markerEl.style.left = `${field.x}%`;
        markerEl.style.top = `${field.y}%`;
      }
      const row = document.querySelector(`.calibrator-field-row[data-id="${selectedMarkerId}"] .calibrator-field-coords`);
      if (row) {
        row.textContent = `X: ${field.x.toFixed(1)}% | Y: ${field.y.toFixed(1)}%`;
      }
    }
  });

  // ── Control de Opacidad de Imagen de Fondo ─────────────────────────────────
  if (opacitySlider) {
    opacitySlider.addEventListener('input', (e) => {
      const val = e.target.value;
      if (opacityValText) opacityValText.textContent = `${val}%`;
      if (calibratorBgImg) calibratorBgImg.style.opacity = (val / 100).toString();
    });
  }

  // ── Control de Cuadrícula ──────────────────────────────────────────────────
  if (toggleGridBtn) {
    toggleGridBtn.addEventListener('click', () => {
      if (calibratorGridLayer.style.display === 'none') {
        calibratorGridLayer.style.display = 'block';
        toggleGridBtn.classList.add('active');
      } else {
        calibratorGridLayer.style.display = 'none';
        toggleGridBtn.classList.remove('active');
      }
    });
  }

  if (gridSizeSelect) {
    gridSizeSelect.addEventListener('change', (e) => {
      calibratorGridLayer.className = `calibrator-grid-overlay ${e.target.value}`;
    });
  }

  if (snapBtn) {
    snapBtn.addEventListener('click', () => {
      isSnapEnabled = !isSnapEnabled;
      snapBtn.classList.toggle('active', isSnapEnabled);
      showToast(isSnapEnabled ? 'Ajuste a cuadrícula activado' : 'Ajuste a cuadrícula desactivado', 'info');
    });
  }

  // ── Controles de Zoom ──────────────────────────────────────────────────────
  function applyZoom() {
    if (calibratorCanvas) {
      calibratorCanvas.style.transform = `scale(${currentZoom})`;
    }
    if (zoomValText) {
      zoomValText.textContent = `${Math.round(currentZoom * 100)}%`;
    }
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      currentZoom = Math.min(2.5, currentZoom + 0.15);
      applyZoom();
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      currentZoom = Math.max(0.4, currentZoom - 0.15);
      applyZoom();
    });
  }

  if (zoomFitBtn) {
    zoomFitBtn.addEventListener('click', () => {
      currentZoom = 1;
      applyZoom();
    });
  }

  // ── Restablecer Posiciones por Defecto ──────────────────────────────────────
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('¿Restablecer las posiciones de todos los campos a los valores predeterminados?')) {
        activeFieldsData = DEFAULT_FIELDS_DEF.map(d => ({ ...d }));
        renderCalibratorWorkspace();
        showToast('Posiciones restablecidas.', 'info');
      }
    });
  }

  // ── Guardar Calibración en la Base de Datos ─────────────────────────────────
  if (saveCalibratorBtn) {
    saveCalibratorBtn.addEventListener('click', async () => {
      if (!activeCalibratorModel || !activeCalibratorModel.id) {
        showToast('No hay un modelo activo para guardar.', 'warning');
        return;
      }

      const payload = {
        id: activeCalibratorModel.id,
        nombre: activeCalibratorModel.nombre,
        tipo: activeCalibratorModel.tipo,
        campos_config: activeFieldsData
      };

      const res = await window.api.saveModeloDocumento(payload);
      if (res && res.success) {
        showToast('¡Calibración y posiciones de campos guardadas con éxito!', 'success');
        activeCalibratorModel.campos_config = activeFieldsData;
        await loadAndRenderModels();
      } else {
        showToast('Error al guardar calibración: ' + (res ? res.message : ''), 'error');
      }
    });
  }

})();
