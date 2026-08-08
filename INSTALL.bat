@echo off
title Instalador - tienda
echo ====================================================================
echo             Instalador de Dependencias - Tienda
echo ====================================================================
echo.
echo 1. Instalando modulos de Node.js y dependencias de Electron (pg, bcryptjs)...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un problema al instalar las dependencias con npm.
    echo Asegurate de tener Node.js instalado en tu sistema.
    pause
    exit /b %errorlevel%
)

echo.
echo ====================================================================
echo         �Dependencias de Node.js instaladas correctamente!
echo ====================================================================
echo.
echo CONFIGURACION DE LA BASE DE DATOS POSTGRESQL (TIENDA):
echo La base de datos tienda ya ha sido creada e inicializada en tu
echo servidor local de PostgreSQL (puerto 5432) con la contrasena 'admin'.
echo.
echo Si deseas cambiar el host o el puerto, edita el archivo 'db_config.json'.
echo.
echo Todo listo. Ahora puedes iniciar la aplicacion usando "INICIAR.bat".
echo.
pause
