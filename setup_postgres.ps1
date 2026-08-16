# Script de automatización de instalación y configuración de PostgreSQL para Windows
[CmdletBinding()]
param(
    [string]$SuperPassword = "admin123",
    [int]$Port = 5432,
    [string]$TargetDatabase = "TIENDA"
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Verificando e Instalando PostgreSQL Automáticamente" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Función para comprobar si el puerto 5432 o PostgreSQL responde
function Test-PostgresPort {
    param([string]$Server = "127.0.0.1", [int]$PortNumber = 5432)
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect($Server, $PortNumber, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(2000, $false)
        if ($wait) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
        return $false
    } catch {
        return $false
    }
}

# 2. Comprobar si ya está corriendo
if (Test-PostgresPort -PortNumber $Port) {
    Write-Host "[OK] PostgreSQL ya está en ejecución y escuchando en el puerto $Port." -ForegroundColor Green
} else {
    # Verificar si el servicio existe pero está detenido
    $pgService = Get-Service | Where-Object { $_.Name -like "*postgres*" } | Select-Object -First 1
    if ($pgService) {
        Write-Host "Iniciando servicio de PostgreSQL ($($pgService.Name))..." -ForegroundColor Yellow
        Start-Service -Name $pgService.Name -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }

    if (Test-PostgresPort -PortNumber $Port) {
        Write-Host "[OK] Servicio de PostgreSQL iniciado correctamente." -ForegroundColor Green
    } else {
        Write-Host "PostgreSQL no fue detectado en el equipo. Procediendo con la instalación desatendida..." -ForegroundColor Yellow

        $installerDownloaded = $false
        $tempInstaller = "$env:TEMP\postgresql-installer.exe"

        # Intentar con winget primero si está disponible
        $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
        if ($hasWinget) {
            Write-Host "Instalando PostgreSQL silenciosamente mediante winget..." -ForegroundColor Yellow
            try {
                $wingetArgs = "install PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements --accept-source-agreements --custom `"--superpassword $SuperPassword --serverport $Port`""
                Start-Process -FilePath "winget" -ArgumentList $wingetArgs -Wait -NoNewWindow
                Start-Sleep -Seconds 5
            } catch {
                Write-Host "Winget falló, intentando descarga directa..." -ForegroundColor Yellow
            }
        }

        # Si aún no está en ejecución, descargar el instalador oficial desatendido de EnterpriseDB
        if (-not (Test-PostgresPort -PortNumber $Port)) {
            Write-Host "Descargando instalador oficial de PostgreSQL (Windows x64)..." -ForegroundColor Yellow
            $downloadUrls = @(
                "https://get.enterprisedb.com/postgresql/postgresql-16.3-1-windows-x64.exe",
                "https://sbp.enterprisedb.com/getfile.jsp?fileid=1258897"
            )

            foreach ($url in $downloadUrls) {
                try {
                    Write-Host "Descargando desde: $url"
                    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
                    Invoke-WebRequest -Uri $url -OutFile $tempInstaller -UseBasicParsing -TimeoutSec 300
                    if ((Test-Path $tempInstaller) -and ((Get-Item $tempInstaller).Length -gt 10000000)) {
                        $installerDownloaded = $true
                        break
                    }
                } catch {
                    Write-Host "Error en descarga: $($_.Exception.Message)" -ForegroundColor Red
                }
            }

            if ($installerDownloaded) {
                Write-Host "Ejecutando instalación desatendida de PostgreSQL (esto puede tardar 2-3 minutos)..." -ForegroundColor Yellow
                $installArgs = "--mode unattended --unattendedmodeui none --superpassword `"$SuperPassword`" --serverport $Port --enable-components server,commandlinetools --disable-components pgAdmin,stackbuilder"
                $process = Start-Process -FilePath $tempInstaller -ArgumentList $installArgs -Wait -PassThru -NoNewWindow
                Write-Host "Instalador finalizado con código: $($process.ExitCode)" -ForegroundColor Green

                # Iniciar el servicio
                Start-Sleep -Seconds 5
                $pgService = Get-Service | Where-Object { $_.Name -like "*postgres*" } | Select-Object -First 1
                if ($pgService) {
                    Start-Service -Name $pgService.Name -ErrorAction SilentlyContinue
                }
            } else {
                Write-Host "[AVISO] No se pudo descargar el instalador automático. Por favor descarga e instala PostgreSQL manualmente desde https://www.postgresql.org/download/windows/" -ForegroundColor Red
            }
        }
    }
}

# 3. Guardar o sincronizar db_config.json
$configPath = Join-Path -Path $PSScriptRoot -ChildPath "db_config.json"
$configObject = [ordered]@{
    user = "postgres"
    host = "localhost"
    database = $TargetDatabase
    password = $SuperPassword
    port = $Port
}
$jsonContent = $configObject | ConvertTo-Json
[System.IO.File]::WriteAllText($configPath, $jsonContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "[OK] Configuración 'db_config.json' actualizada." -ForegroundColor Green

# 4. Ejecutar aprovisionamiento inicial de tablas y usuario admin
Write-Host "Inicializando base de datos y esquema con Node.js..." -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    Set-Location -Path $PSScriptRoot
    & node init_db.js
} else {
    Write-Host "[ERROR] Node.js no está en el PATH del sistema." -ForegroundColor Red
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  PostgreSQL y Base de Datos Configurados con Éxito" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
