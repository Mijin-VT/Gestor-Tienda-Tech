# Store - Sistema de Gestión y Facturación (POS & Soporte Técnico)

<p align="center">
  <img src="dashboard.png" width="400" height="400" alt="Dashboard">
</p>
Un sistema integral desarrollado para la administración completa de tiendas, talleres de electrónica y negocios de soporte técnico. Construido con tecnología de escritorio moderna (**Electron.js**) y respaldado por una base de datos robusta (**PostgreSQL**).

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
* **Base de Datos:** PostgreSQL (`pg` driver para Node).
* **Otras integraciones:** Chart.js (gráficos), xlsx (manipulación de Excel), window.speechSynthesis (alertas de voz).

---

## ⚙️ Instalación y Configuración

### 💿 Instalador Rápido (Recomendado para Windows)
Puedes instalar la aplicación completa, incluyendo configuración de base de datos y dependencias en un solo clic, usando nuestro instalador empaquetado:
🔗 **[Descargar Instalador V1.0 para Windows](https://github.com/Mijin-VT/Gestor-Tienda-Tech/releases/download/V1.0/Instalador_GestorTienda.exe)**

### 🐧 Instalador Gráfico Nativo (Linux)
Para sistemas basados en Linux (Ubuntu, Debian, Fedora, Mint, etc.), proporcionamos un asistente de instalación gráfico profesional (`.run`) idéntico a la experiencia en Windows:
🔗 **[Descargar Instalador V1.0 para Linux (.run)](https://github.com/Mijin-VT/Gestor-Tienda-Tech/releases/download/V1.0/Instalador_GestorTienda.run)**

**Pasos de instalación en Linux:**
1. **Base de Datos:** Asegúrate de tener instalado **PostgreSQL** y ejecutándose en el puerto `5432` (con contraseña por defecto `admin`).
2. **Dar Permisos:** Al descargar el archivo `.run`, dale permisos de ejecución (clic derecho > Propiedades > Permisos > Permitir ejecutar el archivo como un programa, o vía terminal con `chmod +x Instalador_GestorTienda.run`).
3. **Instalar:** Dale doble clic al archivo. Se abrirá el asistente gráfico que te guiará y creará automáticamente los accesos directos en tu menú de aplicaciones.

---

### Prerrequisitos (Instalación Manual o Desarrollo)
1. **Node.js** (versión 16+ recomendada).
2. **PostgreSQL** instalado (localmente en el puerto 5432).

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
   * Asegúrate de tener ejecutando PostgreSQL en el puerto 5432.
   * Ejecuta el instalador o los scripts SQL proporcionados para inicializar la base de datos `tienda` y sus tablas.

4. **Ejecutar la aplicación (Modo Desarrollo):**
   ```bash
   npm start
   ```

5. **Credenciales por defecto:**
   * Al iniciar el sistema por primera vez, el usuario es **admin** y la contraseña es **admin**.
   * Puedes cambiar estas credenciales o crear cuentas nuevas en el apartado **Gestión de Usuarios del Sistema** de la aplicación.

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
