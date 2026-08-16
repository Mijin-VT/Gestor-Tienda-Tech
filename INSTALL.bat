@echo off
title Instalador - Gestor Tienda Tech
echo ====================================================================
echo             Instalador de Dependencias y Base de Datos
echo ====================================================================
echo.
echo 1. Instalando modulos de Node.js y dependencias de Electron...
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
echo 2. Verificando, Instalando y Configurando PostgreSQL...
echo ====================================================================
echo.
powershell -ExecutionPolicy Bypass -File setup_postgres.ps1
if %errorlevel% neq 0 (
    echo.
    echo [ADVERTENCIA] Ocurrio un aviso durante la configuracion automatica de PostgreSQL.
    echo Si no tienes PostgreSQL instalado, puedes descargarlo desde:
    echo https://www.postgresql.org/download/windows/
    echo.
) else (
    echo.
    echo [OK] PostgreSQL y Base de Datos listos para operar.
    echo Usuario por defecto: admin
    echo Clave por defecto: admin123
)

echo.
echo ====================================================================
echo                  Instalacion Completada
echo ====================================================================
echo.
echo Si deseas cambiar el host, usuario, clave o puerto, edita 'db_config.json'.
echo.
echo Ahora puedes iniciar la aplicacion usando "INICIAR.bat".
echo.
pause
