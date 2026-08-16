[Setup]
AppName=Gestor Tienda Tech
AppVersion=1.0
DefaultDirName={autopf}\Gestor Tienda Tech
DefaultGroupName=Gestor Tienda Tech
OutputDir=d:\Desktop\AGENTES\GESTION_ELECTRONICA\Output
OutputBaseFilename=Instalador_GestorTienda
SetupIconFile=d:\Desktop\AGENTES\GESTION_ELECTRONICA\icon.ico
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin

[Files]
Source: "d:\Desktop\AGENTES\GESTION_ELECTRONICA\*"; DestDir: "{app}"; Excludes: ".git,node_modules,Output,*.exe,*.iss"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Gestor Tienda Tech"; Filename: "wscript.exe"; Parameters: """{app}\INICIAR_OCULTO.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"
Name: "{commondesktop}\Gestor Tienda Tech"; Filename: "wscript.exe"; Parameters: """{app}\INICIAR_OCULTO.vbs"""; WorkingDir: "{app}"; Tasks: desktopicon; IconFilename: "{app}\icon.ico"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Run]
Filename: "{app}\INSTALL.bat"; Description: "Instalando dependencias y base de datos (por favor espere)"; Flags: waituntilterminated runascurrentuser

[UninstallDelete]
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\*"
Type: dirifempty; Name: "{app}"
