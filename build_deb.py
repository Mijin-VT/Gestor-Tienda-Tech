import os
import shutil
import subprocess

def create_deb():
    base_dir = r"d:\Desktop\AGENTES\GESTION_ELECTRONICA"
    dist_dir = os.path.join(base_dir, "dist")
    staging_dir = os.path.join(dist_dir, "deb_staging")
    unpacked_dir = os.path.join(dist_dir, "linux-unpacked")
    
    # Clean staging
    if os.path.exists(staging_dir):
        shutil.rmtree(staging_dir)
        
    # Create structure
    dirs = [
        "DEBIAN",
        "opt/gestion_electronica",
        "usr/share/applications",
        "usr/share/icons/hicolor/512x512/apps"
    ]
    for d in dirs:
        os.makedirs(os.path.join(staging_dir, d.replace('/', os.sep)))
        
    # Copy unpacked app
    shutil.copytree(unpacked_dir, os.path.join(staging_dir, "opt", "gestion_electronica"), dirs_exist_ok=True)
    
    # Copy icon
    icon_src = os.path.join(base_dir, "build", "icon.png")
    icon_dst = os.path.join(staging_dir, "usr", "share", "icons", "hicolor", "512x512", "apps", "gestion_electronica.png")
    shutil.copy2(icon_src, icon_dst)
    
    # Create Desktop file
    desktop_content = """[Desktop Entry]
Name=Gestor Tienda Tech
Comment=Sistema de Gestión para Tienda Tech
Exec=/opt/gestion_electronica/gestion_electronica %U
Terminal=false
Type=Application
Icon=gestion_electronica
Categories=Office;
"""
    with open(os.path.join(staging_dir, "usr", "share", "applications", "gestion_electronica.desktop"), "w", encoding="utf-8") as f:
        f.write(desktop_content)
        
    # Create Control file
    control_content = """Package: gestion-electronica
Version: 1.0.0
Section: utils
Priority: optional
Architecture: amd64
Depends: postgresql (>= 12)
Maintainer: Mijin-VT <admin@gestortienda.local>
Description: Gestor Tienda Tech
 Sistema de Gestión para Tienda Tech con PostgreSQL integrado.
"""
    with open(os.path.join(staging_dir, "DEBIAN", "control"), "w", encoding="utf-8") as f:
        f.write(control_content)
        
    # Create postinst to automatically configure PostgreSQL and create TIENDA database
    postinst_content = """#!/bin/bash
# Iniciar servicio postgresql
systemctl enable postgresql 2>/dev/null || true
systemctl start postgresql 2>/dev/null || service postgresql start 2>/dev/null || true

# Configurar contraseña de postgres a admin123 y crear base de datos TIENDA si no existe
su - postgres -c "psql -c \\"ALTER USER postgres WITH PASSWORD 'admin123';\\"" 2>/dev/null || true
su - postgres -c "psql -tc \\"SELECT 1 FROM pg_database WHERE datname = 'TIENDA'\\" | grep -q 1 || psql -c \\"CREATE DATABASE \\\\\\"TIENDA\\\\\\";\\"" 2>/dev/null || true

echo "=========================================================="
echo " Instalación de Gestor Tienda Tech y PostgreSQL completada."
echo " Base de datos TIENDA configurada con éxito."
echo "=========================================================="
exit 0
"""
    postinst_path = os.path.join(staging_dir, "DEBIAN", "postinst")
    with open(postinst_path, "w", encoding="utf-8", newline='\n') as f:
        f.write(postinst_content)
    
    # Compile with WSL to ensure correct linux file permissions inside the DEB
    print("Compilando .deb usando dpkg-deb en WSL (copiando a /tmp para evitar problemas de permisos NTFS)...")
    subprocess.run(["wsl", "rm", "-rf", "/tmp/deb_staging"], cwd=base_dir, check=True)
    subprocess.run(["wsl", "cp", "-r", "dist/deb_staging", "/tmp/deb_staging"], cwd=base_dir, check=True)
    subprocess.run(["wsl", "chmod", "-R", "755", "/tmp/deb_staging"], cwd=base_dir, check=True)
    subprocess.run(["wsl", "dpkg-deb", "--root-owner-group", "--build", "/tmp/deb_staging", "/tmp/gestion_electronica-1.0.0.deb"], cwd=base_dir, check=True)
    subprocess.run(["wsl", "cp", "/tmp/gestion_electronica-1.0.0.deb", "dist/gestion_electronica-1.0.0.deb"], cwd=base_dir, check=True)
    subprocess.run(["wsl", "rm", "-rf", "/tmp/deb_staging", "/tmp/gestion_electronica-1.0.0.deb"], cwd=base_dir, check=True)
    
    print("¡Archivo .deb generado exitosamente en dist/gestion_electronica-1.0.0.deb!")

if __name__ == "__main__":
    create_deb()
