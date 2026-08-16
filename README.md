# Store - Sistema de Gestión y Facturación (POS & Soporte Técnico)

<p align="center">
  <img src="dashboard.png" width="400" height="400" alt="Dashboard">
</p>

Un sistema integral desarrollado para la administración completa de tiendas, talleres de electrónica y negocios de soporte técnico. Construido con tecnología de escritorio moderna (**Electron.js**) y respaldado por una base de datos robusta (**PostgreSQL**) con instalación y configuración **100% automatizada**.

---

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
* Sistema de notificaciones visuales (badges) y **alertas de voz integradas** cuando llega un nuevo mensaje.

### 🛠️ Control de Taller (Reparaciones)
* Ingreso detallado de dispositivos por cliente (marcas, modelos, contraseñas, descripción del problema).
* Asignación de técnicos y estados (Recibido, En Diagnóstico, En Reparación, Listo para Entrega, Entregado).
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
* Protección de módulos críticos (Eliminar datos, Finanzas y Configuración) solo para cuentas administradoras.

---

## 🛠️ Stack Tecnológico

* **Frontend:** HTML5, CSS3, JavaScript Vanilla (sin frameworks pesados para un rendimiento nativo ultrarrápido). Iconos de FontAwesome.
* **Backend / Desktop Framework:** [Electron.js](https://www.electronjs.org/) (Node.js integrado).
* **Base de Datos:** PostgreSQL (`pg` driver para Node).
* **Otras integraciones:** Chart.js (gráficos), xlsx (manipulación de Excel), Baileys / WhatsApp Cloud API, Nodemailer, Telegram Bot API, window.speechSynthesis (alertas de voz).

---

## ⚙️ Instalación y Puesta en Marcha

El sistema cuenta con **instalación y auto-configuración desatendida de PostgreSQL**. No necesitas configurar manualmente la base de datos: el instalador y la aplicación se encargan de crear la base de datos `TIENDA`, las tablas y el usuario administrador inicial.

### 🪟 En Windows

#### Opción 1: Instalador Oficial `.exe` (Recomendado)
1. Descarga y ejecuta el instalador:
   🔗 **[Descargar Gestor Tienda Tech Setup 1.0.0.exe](https://github.com/Mijin-VT/Gestor-Tienda-Tech/releases)**
2. El instalador detecta si PostgreSQL está activo; si no está presente, lo instala e inicializa silenciosamente en segundo plano.
3. Al finalizar, la aplicación estará lista en tu Escritorio y Menú Inicio.

#### Opción 2: Instalador Asistido por Lotes (`INSTALL.bat`)
Si ejecutas desde el código fuente o paquete portable:
1. Ejecuta **`INSTALL.bat`**.
2. Instalará automáticamente los módulos de Node.js y ejecutará `setup_postgres.ps1` para aprovisionar PostgreSQL y la base de datos `TIENDA`.
3. Inicia el sistema con **`INICIAR.bat`** (o `INICIAR_OCULTO.vbs`).

---

### 🐧 En Linux (Debian / Ubuntu / Derivados)

#### Opción 1: Paquete Nativo `.deb`
1. Descarga el paquete `.deb`:
   🔗 **[Descargar gestion_electronica-1.0.0.deb](https://github.com/Mijin-VT/Gestor-Tienda-Tech/releases)**
2. Instala con `apt` (esto descargará e instalará automáticamente PostgreSQL como dependencia si no lo tienes):
   ```bash
   sudo apt update
   sudo apt install ./gestion_electronica-1.0.0.deb -y
   ```
3. El script de post-instalación iniciará PostgreSQL, configurará el usuario `postgres` y creará la base de datos `TIENDA` automáticamente.
4. Abre la aplicación desde tu menú de inicio buscando **"Gestor Tienda Tech"**.

---

### 💻 Instalación para Desarrollo (Desde Código Fuente)

1. **Prerrequisitos:** Node.js (v16+) y PostgreSQL.
2. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Mijin-VT/Gestor-Tienda-Tech.git
   cd Gestor-Tienda-Tech
   ```
3. **Instalar dependencias y aprovisionar base de datos:**
   ```bash
   npm install
   node init_db.js
   ```
4. **Iniciar en modo desarrollo:**
   ```bash
   npm start
   ```

---

## 🔑 Credenciales de Acceso por Defecto

* **Usuario:** `admin`
* **Contraseña:** `admin123`

*(Puedes cambiar las credenciales o crear nuevos usuarios desde el módulo de Gestión de Usuarios)*

---

## 🔧 Configuración de Conexión (`db_config.json`)

Los parámetros de conexión a PostgreSQL se gestionan en [`db_config.json`](db_config.json) en la raíz del proyecto:

```json
{
  "user": "postgres",
  "host": "localhost",
  "database": "TIENDA",
  "password": "admin123",
  "port": 5432
}
```

---

## 📝 Personalización

Desde el panel de **Configuración** del sistema (acceso Administrador) puedes ajustar:
* Nombre comercial, eslogan y RUC/NIT de la empresa.
* Impuestos predeterminados (Ej. IVA 15%).
* Credenciales de Gmail (App Password).
* Tokens de WhatsApp Business Cloud API.
* Token de Bot de Telegram y Chat ID.

---

> Desarrollado como una solución integral moderna para llevar el control total de talleres y negocios retail electrónicos.
