# Store - Sistema de Gestión y Facturación (POS & Soporte Técnico)

Un sistema integral desarrollado para la administración completa de tiendas, talleres de electrónica y negocios de soporte técnico. Construido con tecnología de escritorio moderna (**Electron.js**) y respaldado por una base de datos robusta (**Microsoft SQL Server**).

## 🚀 Características Principales

### 📊 Dashboard Inteligente
* Gráficas financieras automáticas (semanal, mensual, anual).
* Paneles en tiempo real de reparaciones urgentes y diagnósticos pendientes.
* Historial dinámico de las últimas facturas generadas.
* Alertas de stock bajo e indicadores de ganancias del día.

### 💬 Mensajería Omnicanal (Consultas)
* Bandeja unificada para comunicarte con tus clientes directamente desde el sistema.
* **WhatsApp Cloud API**: Envío y recepción de mensajes, imágenes, audios y videos.
* **Gmail**: Soporte directo vía correo electrónico.
* **Telegram Bot**: Notificaciones y comunicación automatizada.
* Sistema de notificaciones visuales (badges rojos) y **alertas de voz integradas** cuando llega un nuevo mensaje.

### 🛠️ Control de Taller (Reparaciones)
* Ingreso detallado de dispositivos por cliente (marcas, modelos, contraseñas, descripción del problema).
* Asignación de técnicos y estados (Recibido, En Diagnóstico, En Reparación, Reparado, Entregado).
* Conversión directa de una Orden de Reparación a una Factura comercial al concluir el trabajo.

### 📦 Gestión de Inventario Inteligente
* Control de stock de piezas y productos terminados.
* Alertas automáticas de stock mínimo.
* **Importación desde Excel masiva inteligente**: Si el producto ya existe, suma el stock automáticamente en lugar de sobreescribirlo; si es nuevo, lo crea.
* Módulo de servicios (Mano de obra y mantenimientos).

### 🧾 Facturación Electrónica (POS)
* Punto de Venta rápido para sumar servicios y repuestos al carrito.
* Cálculo automático de subtotales, IVA y descuentos.
* Generación de números secuenciales e identificadores clave compatibles con facturación (ej. SRI).
* Descarga directa en PDF e impresión. El inventario se descuenta de forma automática, a menos que solo se facture mano de obra/servicios.

### 📈 Reportes y Finanzas
* Módulo contable para consultar ingresos y facturación generada por fechas exactas (Diario, Semanal, Mensual o Personalizado).
* Historial de pedidos para revisar cualquier venta del pasado usando filtros por año y mes automático.

### 🔐 Seguridad y Usuarios
* Sistema de roles (Administrador y Staff).
* Protección de módulos críticos (Eliminar datos, Finanzas, y Configuración) solo para cuentas administradoras.

---

## 🛠️ Stack Tecnológico

* **Frontend:** HTML5, CSS3, JavaScript Vanilla (sin frameworks pesados para un rendimiento nativo ultrarrápido). Iconos de FontAwesome.
* **Backend / Desktop Framework:** [Electron.js](https://www.electronjs.org/) (Node.js integrado).
* **Base de Datos:** Microsoft SQL Server (`mssql` driver para Node).
* **Otras integraciones:** Chart.js (gráficos), xlsx (manipulación de Excel), window.speechSynthesis (alertas de voz).

---

## ⚙️ Instalación y Configuración

### Prerrequisitos
1. **Node.js** (versión 16+ recomendada).
2. **Microsoft SQL Server** instalado (localmente o en red).

### Pasos
1. **Clonar el repositorio:**
   ```bash
   git clone <url-del-repositorio>
   cd GESTION_ELECTRONICA
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Base de Datos:**
   * Asegúrate de tener ejecutando una instancia de SQL Server.
   * El sistema creará automáticamente la base de datos `GestionElectronicaDB` y todas sus tablas y datos iniciales en la primera ejecución si el servidor local está disponible.

4. **Ejecutar la aplicación (Modo Desarrollo):**
   ```bash
   npm start
   ```

5. **Credenciales por defecto:**
   * Al iniciar el sistema por primera vez, utiliza el usuario administrador base que se genera para entrar al panel y ajustar tu configuración (tienda, RUC/NIT, bots de mensajería).

---

## 📝 Personalización

Desde el panel de **Configuración** del sistema (solo acceso Administrador) puedes ajustar:
* Nombre comercial y RUC/NIT de la empresa.
* Impuestos predeterminados (Ej. IVA 15%).
* Credenciales de Gmail (App Password).
* Tokens de WhatsApp Business Cloud API.
* Token de Bot de Telegram.

---

> Desarrollado como una solución integral moderna para llevar el control total de talleres y negocios retail electrónicos.
