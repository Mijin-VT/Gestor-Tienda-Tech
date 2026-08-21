const { contextBridge, ipcRenderer } = require('electron');

// Exponer de forma segura APIs al proceso renderer
contextBridge.exposeInMainWorld('api', {
  // Conexión
  testConnection: () => ipcRenderer.invoke('db:test-connection'),
  
  // Autenticación
  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  
  // Configuración del sistema
  getSystemConfig: () => ipcRenderer.invoke('db:get-system-config'),
  saveSystemConfig: (config) => ipcRenderer.invoke('db:save-system-config', config),
  getRecentOperations: () => ipcRenderer.invoke('db:get-recent-operations'),
  getUrgentRepairs: () => ipcRenderer.invoke('db:get-urgent-repairs'),
  
  // Clientes
  getClients: (search) => ipcRenderer.invoke('db:get-clients', search),
  saveClient: (client) => ipcRenderer.invoke('db:save-client', client),
  deleteClient: (id) => ipcRenderer.invoke('db:delete-client', id),

  // Reparaciones
  getRepairs: (search) => ipcRenderer.invoke('db:get-repairs', search),
  saveRepair: (repair) => ipcRenderer.invoke('db:save-repair', repair),
  deleteRepair: (id) => ipcRenderer.invoke('db:delete-repair', id),

  // Técnicos
  getTechs: (search = '') => ipcRenderer.invoke('db:get-techs', search),
  saveTech: (tech) => ipcRenderer.invoke('db:save-tech', tech),
  deleteTech: (id) => ipcRenderer.invoke('db:delete-tech', id),

  // Servicios
  getServices: (search) => ipcRenderer.invoke('db:get-services', search),
  saveService: (service) => ipcRenderer.invoke('db:save-service', service),
  deleteService: (id) => ipcRenderer.invoke('db:delete-service', id),

  // Usuarios
  getUsers: (search) => ipcRenderer.invoke('db:get-users', search),
  saveUser: (user) => ipcRenderer.invoke('db:save-user', user),
  deleteUser: (id) => ipcRenderer.invoke('db:delete-user', id),

  // Consultas del Portal y Mensajería
  getQueries: (search) => ipcRenderer.invoke('db:get-queries', search),
  respondQuery: (id, respuesta, estado, canal_envio) => ipcRenderer.invoke('db:respond-query', { id, respuesta, estado, canal_envio }),
  deleteQuery: (id) => ipcRenderer.invoke('db:delete-query', id),
  testMessagingChannel: (channel, config) => ipcRenderer.invoke('db:test-messaging-channel', { channel, config }),

  // WhatsApp Baileys
  startWhatsApp: () => ipcRenderer.invoke('app:whatsapp-start'),
  sendWhatsApp: (to, text) => ipcRenderer.invoke('app:whatsapp-send', { to, text }),
  sendWhatsAppMedia: (to, fileBuffer, fileType, fileName) => ipcRenderer.invoke('app:whatsapp-send-media', { to, fileBuffer, fileType, fileName }),
  getWhatsAppHistory: () => ipcRenderer.invoke('db:get-whatsapp-history'),
  deleteWhatsAppMessage: (msgId) => ipcRenderer.invoke('db:delete-whatsapp-message', msgId),
  openLocalFile: (filePath) => ipcRenderer.invoke('app:open-file', filePath),
  onWhatsAppQR: (callback) => ipcRenderer.on('whatsapp:qr', (event, qrUrl) => callback(qrUrl)),
  onWhatsAppReady: (callback) => ipcRenderer.on('whatsapp:ready', () => callback()),
  onWhatsAppLoggedOut: (callback) => ipcRenderer.on('whatsapp:logged_out', () => callback()),
  onWhatsAppMessage: (callback) => ipcRenderer.on('whatsapp:message', (event, msg) => callback(msg)),

  // Pedidos
  getOrders: (filters) => ipcRenderer.invoke('db:get-orders', filters),
  deleteDeliveredOrders: () => ipcRenderer.invoke('db:delete-delivered-orders'),
  saveOrder: (order) => ipcRenderer.invoke('db:save-order', order),

  // Importar Excel
  downloadTemplate: (type) => ipcRenderer.invoke('db:download-template', type),
  exportData: (data, fileName, sheetName) => ipcRenderer.invoke('db:export-data', { data, fileName, sheetName }),
  previewExcel: (buffer, type) => ipcRenderer.invoke('db:preview-excel', buffer, type),
  importExcel: (buffer, type, fileName) => ipcRenderer.invoke('db:import-excel', buffer, type, fileName),
  getImportHistory: () => ipcRenderer.invoke('db:get-import-history'),
  deleteImportHistory: (id) => ipcRenderer.invoke('db:delete-import-history', id),

  // Inventario (Productos / Piezas)
  getInventory: (search) => ipcRenderer.invoke('db:get-inventory', search),
  deleteAllInventory: () => ipcRenderer.invoke('db:delete-all-inventory'),
  saveInventoryItem: (item) => ipcRenderer.invoke('db:save-inventory-item', item),
  adjustStock: (itemId, tipoItem, cantidad, tipoMovimiento, descripcion) => 
    ipcRenderer.invoke('db:adjust-stock', { itemId, tipoItem, cantidad, tipoMovimiento, descripcion }),

  // Facturación y Reportes
  createInvoice: (invoice) => ipcRenderer.invoke('db:create-invoice', invoice),
  getInvoiceById: (id) => ipcRenderer.invoke('db:get-invoice-by-id', id),
  deleteInvoice: (id) => ipcRenderer.invoke('db:delete-invoice', id),
  printInvoice: (htmlContent) => ipcRenderer.invoke('app:print-invoice', { htmlContent }),
  printInvoicePdf: (htmlContent, invoiceNumber) => ipcRenderer.invoke('app:print-invoice-pdf', { htmlContent, invoiceNumber }),
  getDashboardStats: () => ipcRenderer.invoke('db:get-dashboard-stats'),
  getSalesChartData: (period) => ipcRenderer.invoke('db:get-sales-chart', period),
  getFinancialReports: (startDate, endDate) => ipcRenderer.invoke('db:get-financial-reports', { startDate, endDate }),
  deleteInvoicesByDate: (startDate, endDate) => ipcRenderer.invoke('db:delete-invoices-by-date', { startDate, endDate }),
  emailInvoice: (htmlContent, toEmail, invoiceNumber) => ipcRenderer.invoke('app:email-invoice', { htmlContent, toEmail, invoiceNumber }),

  // Notas Internas
  getNotas: () => ipcRenderer.invoke('db:get-notas'),
  saveNota: (nota) => ipcRenderer.invoke('db:save-nota', nota),
  deleteNota: (id) => ipcRenderer.invoke('db:delete-nota', id),
  toggleNotaFijada: (id) => ipcRenderer.invoke('db:toggle-nota-fijada', id),

  // Modelos de Documentos (Facturas, Recibos, Notas de Venta)
  getModelosDocumentos: (tipo) => ipcRenderer.invoke('db:get-modelos-documentos', tipo),
  saveModeloDocumento: (modelo) => ipcRenderer.invoke('db:save-modelo-documento', modelo),
  deleteModeloDocumento: (id) => ipcRenderer.invoke('db:delete-modelo-documento', id),
  setPredeterminadoModelo: (id, tipo) => ipcRenderer.invoke('db:set-predeterminado-modelo', { id, tipo }),
  processInvoiceTemplate: (params) => ipcRenderer.invoke('app:process-invoice-template', params)
});
