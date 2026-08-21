#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Motor de Procesamiento y Renderizado de Facturas con OpenCV, NumPy y Pillow.

Flujo de Trabajo:
- Fase A (OpenCV + NumPy): Preprocesamiento de imagen base, corrección de perspectiva,
  detección de bordes (Canny, findContours), alineación/desviación, optimización de contraste
  vectorizada con NumPy y detección de recuadros de tabla.
- Fase B (Pillow): Renderizado e inyección de datos tipográficos de alta fidelidad,
  superposición de texto alineado, formato de moneda, y exportación a PNG / PDF (300 DPI).
"""

import sys
import os
import json
import base64
import io
import math
from datetime import datetime

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

# Configuración de codificación para stdout en Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')


# ============================================================================
# FASE A: PREPROCESAMIENTO CON OPENCV + NUMPY
# ============================================================================

class ImagePreprocessor:
    @staticmethod
    def base64_to_cv2(b64_string):
        """Convierte una cadena Base64 (con o sin prefijo data:image/...) a imagen BGR de OpenCV."""
        if ',' in b64_string:
            b64_string = b64_string.split(',', 1)[1]
        
        img_bytes = base64.b64decode(b64_string)
        np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            raise ValueError("No se pudo decodificar la imagen con OpenCV.")
        return img_bgr

    @staticmethod
    def load_image(input_source):
        """Carga imagen desde archivo o Base64."""
        if input_source.startswith("data:image") or (len(input_source) > 500 and not os.path.exists(input_source)):
            return ImagePreprocessor.base64_to_cv2(input_source)
        elif os.path.exists(input_source):
            img = cv2.imread(input_source, cv2.IMREAD_COLOR)
            if img is None:
                raise FileNotFoundError(f"No se pudo leer la imagen desde: {input_source}")
            return img
        else:
            return ImagePreprocessor.base64_to_cv2(input_source)

    @staticmethod
    def correct_perspective(img_bgr, max_dim=2400):
        """
        Detecta el contorno cuadrilátero dominante de la factura / recibo usando Canny + findContours
        y aplica corrección de perspectiva cv2.getPerspectiveTransform() y cv2.warpPerspective().
        """
        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Detección de bordes con Canny
        edged = cv2.Canny(blurred, 50, 200)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        dilated = cv2.dilate(edged, kernel, iterations=1)

        # Encontrar contornos
        contours, _ = cv2.findContours(dilated, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

        doc_contour = None
        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            
            # Debe tener 4 esquinas y abarcar al menos el 25% del área total
            if len(approx) == 4 and cv2.contourArea(approx) > (w * h * 0.25):
                doc_contour = approx
                break

        if doc_contour is None:
            # Si no se detecta contorno nítido de 4 esquinas, retornar imagen original
            return img_bgr, False

        # Ordenar puntos: [top-left, top-right, bottom-right, bottom-left]
        pts = doc_contour.reshape(4, 2)
        rect = np.zeros((4, 2), dtype="float32")
        
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)] # TL
        rect[2] = pts[np.argmax(s)] # BR

        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)] # TR
        rect[3] = pts[np.argmax(diff)] # BL

        (tl, tr, br, bl) = rect

        # Calcular dimensiones del nuevo rectángulo enderezado
        width_a = np.linalg.norm(br - bl)
        width_b = np.linalg.norm(tr - tl)
        max_width = max(int(width_a), int(width_b))

        height_a = np.linalg.norm(tr - br)
        height_b = np.linalg.norm(tl - bl)
        max_height = max(int(height_a), int(height_b))

        # Evitar deformaciones absurdas
        if max_width < 200 or max_height < 200:
            return img_bgr, False

        dst = np.array([
            [0, 0],
            [max_width - 1, 0],
            [max_width - 1, max_height - 1],
            [0, max_height - 1]
        ], dtype="float32")

        matrix = cv2.getPerspectiveTransform(rect, dst)
        warped = cv2.warpPerspective(img_bgr, matrix, (max_width, max_height), flags=cv2.INTER_LANCZOS4)
        return warped, True

    @staticmethod
    def auto_straighten_skew(img_bgr):
        """Corrige la inclinación leve (skew) mediante transformada de Hough y ángulo promedio."""
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=100, maxLineGap=10)

        if lines is None:
            return img_bgr, 0.0

        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if x2 != x1:
                angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
                # Considerar solo inclinaciones leves cerca de horizontal (-15° a 15°)
                if -15.0 < angle < 15.0 and abs(angle) > 0.3:
                    angles.append(angle)

        if not angles:
            return img_bgr, 0.0

        median_angle = float(np.median(angles))
        if abs(median_angle) < 0.2:
            return img_bgr, 0.0

        h, w = img_bgr.shape[:2]
        center = (w // 2, h // 2)
        rot_mat = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        rotated = cv2.warpAffine(img_bgr, rot_mat, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
        return rotated, median_angle

    @staticmethod
    def enhance_contrast_numpy(img_bgr, alpha=1.08, beta=5):
        """Ajusta brillo y contraste de forma vectorizada y ultrarrápida con NumPy."""
        # g(x) = alpha * f(x) + beta
        enhanced = np.clip(alpha * img_bgr.astype(np.float32) + beta, 0, 255).astype(np.uint8)
        return enhanced

    @staticmethod
    def detect_table_regions(img_bgr):
        """
        Utiliza transformaciones morfológicas para detectar líneas horizontales y verticales
        del área de ítems/tabla de la factura.
        """
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, -2)

        h, w = gray.shape

        # Líneas horizontales
        horiz_size = max(w // 30, 15)
        horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (horiz_size, 1))
        horiz_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horiz_kernel)

        # Líneas verticales
        vert_size = max(h // 30, 15)
        vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, vert_size))
        vert_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, vert_kernel)

        table_grid = cv2.add(horiz_lines, vert_lines)
        contours, _ = cv2.findContours(table_grid, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        boxes = []
        for c in contours:
            bx, by, bw, bh = cv2.boundingRect(c)
            # Descartar ruido pequeño y la imagen completa
            if (bw > w * 0.3) and (bh > h * 0.1) and not (bw > w * 0.95 and bh > h * 0.95):
                boxes.append({
                    "x": int(bx),
                    "y": int(by),
                    "w": int(bw),
                    "h": int(bh),
                    "relative": {
                        "x": round(bx / w, 4),
                        "y": round(by / h, 4),
                        "w": round(bw / w, 4),
                        "h": round(bh / h, 4)
                    }
                })

        boxes = sorted(boxes, key=lambda b: (b['w'] * b['h']), reverse=True)
        return boxes[:3]

    @staticmethod
    def validate_empty_zone(img_bgr, x, y, w, h, threshold=0.98):
        """
        Crea una máscara binaria con NumPy para verificar que una zona esté libre de texto
        preexistente antes de escribir. Retorna True si la zona está limpia (>95% blanca/fondo).
        """
        img_h, img_w = img_bgr.shape[:2]
        x1, y1 = max(0, int(x)), max(0, int(y))
        x2, y2 = min(img_w, int(x + w)), min(img_h, int(y + h))

        if x2 <= x1 or y2 <= y1:
            return True

        roi = img_bgr[y1:y2, x1:x2]
        gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        
        # En una plantilla limpia, los píxeles de fondo son claros (> 220)
        white_pixels = np.sum(gray_roi > 210)
        total_pixels = gray_roi.size
        ratio = white_pixels / total_pixels if total_pixels > 0 else 1.0
        return bool(ratio >= threshold)

    @staticmethod
    def bgr_to_pil_rgb(img_bgr):
        """Conversión crítica BGR -> RGB para alimentar a Pillow con fidelidad cromática."""
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        return Image.fromarray(img_rgb)


# ============================================================================
# FASE B: RENDERIZADO Y GENERACIÓN CON PILLOW
# ============================================================================

class InvoiceRenderer:
    @staticmethod
    def get_font(size=14, bold=False, mono=False):
        """Carga fuentes TrueType del sistema con fallback seguro."""
        font_paths = []
        if sys.platform == "win32":
            windir = os.environ.get("WINDIR", "C:\\Windows")
            fonts_dir = os.path.join(windir, "Fonts")
            if mono:
                font_paths = [os.path.join(fonts_dir, "consola.ttf"), os.path.join(fonts_dir, "cour.ttf")]
            elif bold:
                font_paths = [
                    os.path.join(fonts_dir, "segoeuib.ttf"),
                    os.path.join(fonts_dir, "arialbd.ttf"),
                    os.path.join(fonts_dir, "calibrib.ttf")
                ]
            else:
                font_paths = [
                    os.path.join(fonts_dir, "segoeui.ttf"),
                    os.path.join(fonts_dir, "arial.ttf"),
                    os.path.join(fonts_dir, "calibri.ttf")
                ]
        else: # Linux / WSL
            if mono:
                font_paths = ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]
            elif bold:
                font_paths = [
                    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
                ]
            else:
                font_paths = [
                    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
                ]

        for p in font_paths:
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, int(size))
                except Exception:
                    pass

        try:
            return ImageFont.load_default()
        except Exception:
            return ImageFont.load_default()

    @staticmethod
    def render_invoice(pil_image, invoice_data, config=None):
        """
        Superpone con precisión milimétrica todos los datos de la factura/recibo/nota sobre la plantilla.
        """
        img_w, img_h = pil_image.size
        draw = ImageDraw.Draw(pil_image)

        # Escala relativa basada en resolución estándar A4 (~1200x1700 o 2480x3508)
        scale = max(img_w / 1200.0, 0.7)

        # Tipografías adaptativas
        font_title = InvoiceRenderer.get_font(22 * scale, bold=True)
        font_subtitle = InvoiceRenderer.get_font(15 * scale, bold=True)
        font_body = InvoiceRenderer.get_font(13 * scale, bold=False)
        font_body_bold = InvoiceRenderer.get_font(13 * scale, bold=True)
        font_small = InvoiceRenderer.get_font(11 * scale, bold=False)
        font_mono = InvoiceRenderer.get_font(12 * scale, mono=True)
        font_total = InvoiceRenderer.get_font(18 * scale, bold=True)

        # Paleta de colores
        COLOR_PRIMARY = (15, 23, 42)      # Slate 900
        COLOR_TEXT = (30, 41, 59)         # Slate 800
        COLOR_MUTED = (100, 116, 139)     # Slate 500
        COLOR_ACCENT = (37, 99, 235)      # Blue 600
        COLOR_SUCCESS = (16, 185, 129)    # Emerald 600
        COLOR_ROW_ALT = (248, 250, 252)   # Slate 50
        COLOR_LINE = (226, 232, 240)      # Slate 200

        # Coordenadas por defecto o personalizadas
        coords = config.get("coordinates", {}) if config else {}

        # ── 1. Cabecera y Número de Factura ──────────────────────────────────
        num_factura = invoice_data.get("numero_factura", "001-001-000000001")
        fecha_emision = invoice_data.get("fecha", datetime.now().strftime("%Y-%m-%d %H:%M"))
        metodo_pago = invoice_data.get("metodo_pago", "Efectivo")
        clave_acceso = invoice_data.get("clave_acceso", "")

        # Si no hay coordenadas personalizadas, usar layout inteligente proporcional
        header_x = coords.get("header_x", int(img_w * 0.58))
        header_y = coords.get("header_y", int(img_h * 0.08))

        # Número de Factura
        draw.text((header_x, header_y), f"N°: {num_factura}", font=font_title, fill=COLOR_ACCENT)
        draw.text((header_x, header_y + int(30 * scale)), f"Fecha: {fecha_emision}", font=font_body_bold, fill=COLOR_TEXT)
        draw.text((header_x, header_y + int(52 * scale)), f"Método: {metodo_pago}", font=font_body, fill=COLOR_MUTED)

        if clave_acceso:
            draw.text((header_x, header_y + int(74 * scale)), f"Clave SRI: {clave_acceso[:25]}...", font=font_small, fill=COLOR_MUTED)

        # ── 2. Datos del Cliente ──────────────────────────────────────────────
        client_x = coords.get("client_x", int(img_w * 0.08))
        client_y = coords.get("client_y", int(img_h * 0.22))

        cliente_nombre = invoice_data.get("cliente_nombre", "Consumidor Final")
        cliente_doc = invoice_data.get("cliente_doc", "9999999999999")
        cliente_telefono = invoice_data.get("cliente_telefono", "N/A")
        cliente_direccion = invoice_data.get("cliente_direccion", "N/A")
        cliente_email = invoice_data.get("cliente_email", "")

        draw.text((client_x, client_y), f"Cliente: {cliente_nombre}", font=font_body_bold, fill=COLOR_PRIMARY)
        draw.text((client_x, client_y + int(24 * scale)), f"RUC / C.I.: {cliente_doc}", font=font_body, fill=COLOR_TEXT)
        draw.text((client_x, client_y + int(46 * scale)), f"Teléfono: {cliente_telefono}", font=font_body, fill=COLOR_TEXT)
        
        if cliente_direccion != "N/A":
            draw.text((client_x + int(400 * scale), client_y + int(24 * scale)), f"Dirección: {cliente_direccion}", font=font_body, fill=COLOR_TEXT)
        if cliente_email:
            draw.text((client_x + int(400 * scale), client_y + int(46 * scale)), f"Email: {cliente_email}", font=font_body, fill=COLOR_TEXT)

        # ── 3. Tabla de Ítems / Productos y Servicios ─────────────────────────
        table_x = coords.get("table_x", int(img_w * 0.08))
        table_y = coords.get("table_y", int(img_h * 0.36))
        table_w = coords.get("table_w", int(img_w * 0.84))
        row_h = int(28 * scale)

        items = invoice_data.get("items", [])
        
        # Columnas relativas
        col_cant_w = int(table_w * 0.10)
        col_desc_w = int(table_w * 0.55)
        col_unit_w = int(table_w * 0.17)
        col_tot_w = int(table_w * 0.18)

        col_cant_x = table_x
        col_desc_x = col_cant_x + col_cant_w
        col_unit_x = col_desc_x + col_desc_w
        col_tot_x = col_unit_x + col_unit_w

        curr_y = table_y
        for idx, item in enumerate(items):
            cant = str(item.get("cantidad", 1))
            desc = str(item.get("descripcion", item.get("nombre", "Item")))
            p_unit = float(item.get("precio_unitario", item.get("precio", 0.0)))
            total_item = float(item.get("subtotal", item.get("total", p_unit * float(cant))))

            # Truncar descripción larga si excede el ancho
            if len(desc) > 42:
                desc = desc[:39] + "..."

            # Fila de texto
            draw.text((col_cant_x + int(10 * scale), curr_y + int(4 * scale)), cant, font=font_body, fill=COLOR_TEXT)
            draw.text((col_desc_x + int(8 * scale), curr_y + int(4 * scale)), desc, font=font_body, fill=COLOR_TEXT)
            draw.text((col_unit_x + int(10 * scale), curr_y + int(4 * scale)), f"${p_unit:.2f}", font=font_body, fill=COLOR_TEXT)
            draw.text((col_tot_x + int(10 * scale), curr_y + int(4 * scale)), f"${total_item:.2f}", font=font_body_bold, fill=COLOR_TEXT)

            curr_y += row_h

        # ── 4. Totales y Resumen Financiero ──────────────────────────────────
        subtotal = float(invoice_data.get("subtotal", 0.0))
        descuento = float(invoice_data.get("descuento", 0.0))
        abono = float(invoice_data.get("abono", 0.0))
        iva = float(invoice_data.get("iva", subtotal * 0.15))
        total = float(invoice_data.get("total", (subtotal - descuento + iva)))

        totals_x = coords.get("totals_x", int(img_w * 0.62))
        totals_y = coords.get("totals_y", max(curr_y + int(40 * scale), int(img_h * 0.74)))

        # Subtotal
        draw.text((totals_x, totals_y), "SUBTOTAL:", font=font_body_bold, fill=COLOR_MUTED)
        draw.text((totals_x + int(180 * scale), totals_y), f"${subtotal:.2f}", font=font_body_bold, fill=COLOR_TEXT)

        # Descuento (si aplica)
        if descuento > 0:
            totals_y += int(24 * scale)
            draw.text((totals_x, totals_y), "DESCUENTO:", font=font_body, fill=COLOR_MUTED)
            draw.text((totals_x + int(180 * scale), totals_y), f"-${descuento:.2f}", font=font_body, fill=COLOR_TEXT)

        # Abono (si aplica)
        if abono > 0:
            totals_y += int(24 * scale)
            draw.text((totals_x, totals_y), "ABONO PREVIO:", font=font_body, fill=COLOR_MUTED)
            draw.text((totals_x + int(180 * scale), totals_y), f"-${abono:.2f}", font=font_body, fill=COLOR_TEXT)

        # IVA
        totals_y += int(24 * scale)
        draw.text((totals_x, totals_y), "IVA (15%):", font=font_body, fill=COLOR_MUTED)
        draw.text((totals_x + int(180 * scale), totals_y), f"${iva:.2f}", font=font_body, fill=COLOR_TEXT)

        # Línea divisoria
        totals_y += int(28 * scale)
        draw.line([(totals_x, totals_y), (totals_x + int(260 * scale), totals_y)], fill=COLOR_LINE, width=max(1, int(2 * scale)))
        
        # TOTAL A PAGAR
        totals_y += int(10 * scale)
        draw.text((totals_x, totals_y), "TOTAL:", font=font_total, fill=COLOR_PRIMARY)
        draw.text((totals_x + int(140 * scale), totals_y), f"${total:.2f} USD", font=font_total, fill=COLOR_SUCCESS)

        return pil_image

    @staticmethod
    def export_results(pil_image, output_format="PNG", output_pdf_path=None, quality=95):
        """Exporta la imagen a Base64 y opcionalmente a archivo PDF."""
        buf = io.BytesIO()
        
        # Guardar en memoria
        if output_format.upper() in ["JPG", "JPEG"]:
            # Convertir a RGB si tiene alpha
            if pil_image.mode in ("RGBA", "P"):
                pil_image = pil_image.convert("RGB")
            pil_image.save(buf, format="JPEG", quality=quality, optimize=True)
            mime = "image/jpeg"
        else:
            pil_image.save(buf, format="PNG", optimize=True)
            mime = "image/png"

        b64_data = f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

        pdf_saved = None
        if output_pdf_path:
            try:
                pdf_image = pil_image.convert("RGB")
                pdf_image.save(output_pdf_path, "PDF", resolution=300.0)
                pdf_saved = output_pdf_path
            except Exception as e:
                pdf_saved = f"Error al generar PDF: {str(e)}"

        return {
            "image_base64": b64_data,
            "pdf_path": pdf_saved,
            "width": pil_image.width,
            "height": pil_image.height
        }


# ============================================================================
# CONTROLADOR PRINCIPAL / PIPELINE INTEGRADO
# ============================================================================

def process_invoice_pipeline(payload):
    """
    Ejecuta el pipeline completo de visión computacional (OpenCV + NumPy)
    seguido de la inyección tipográfica de datos con Pillow.
    """
    template_src = payload.get("template_image")
    invoice_data = payload.get("invoice_data", {})
    options = payload.get("options", {})

    if not template_src:
        return {"success": False, "message": "No se proporcionó 'template_image'."}

    # 1. Cargar imagen base con OpenCV
    img_bgr = ImagePreprocessor.load_image(template_src)

    # 2. Corrección de Perspectiva (Fase A)
    was_perspective_corrected = False
    if options.get("auto_perspective", True):
        img_bgr, was_perspective_corrected = ImagePreprocessor.correct_perspective(img_bgr)

    # 3. Corrección de Inclinación leve (Skew)
    skew_angle = 0.0
    if options.get("auto_straighten", True):
        img_bgr, skew_angle = ImagePreprocessor.auto_straighten_skew(img_bgr)

    # 4. Optimización de Contraste con NumPy
    if options.get("enhance_contrast", True):
        img_bgr = ImagePreprocessor.enhance_contrast_numpy(img_bgr, alpha=1.05, beta=3)

    # 5. Detección automática de tablas / recuadros
    detected_tables = []
    if options.get("detect_tables", True):
        detected_tables = ImagePreprocessor.detect_table_regions(img_bgr)

    # 6. Conversión a RGB y Pillow (Fase B)
    pil_img = ImagePreprocessor.bgr_to_pil_rgb(img_bgr)

    # 7. Inyección y renderizado de texto de la factura con Pillow
    pil_result = InvoiceRenderer.render_invoice(pil_img, invoice_data, config=options)

    # 8. Exportar resultados
    out_pdf = options.get("output_pdf_path", None)
    export_data = InvoiceRenderer.export_results(pil_result, output_format=options.get("format", "PNG"), output_pdf_path=out_pdf)

    return {
        "success": True,
        "image_base64": export_data["image_base64"],
        "pdf_path": export_data["pdf_path"],
        "dimensions": {
            "width": export_data["width"],
            "height": export_data["height"]
        },
        "preprocessing_report": {
            "perspective_corrected": was_perspective_corrected,
            "skew_angle_deg": round(skew_angle, 2),
            "contrast_enhanced": bool(options.get("enhance_contrast", True)),
            "detected_table_boxes": detected_tables
        }
    }


def main():
    """Punto de entrada CLI para Node.js / Electron."""
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "message": "Uso: python engine_invoice_processor.py --json '<payload>' o archivo.json"}))
        return

    arg = sys.argv[1]
    
    if arg == "--json" and len(sys.argv) > 2:
        raw_json = sys.argv[2]
        try:
            payload = json.loads(raw_json)
        except Exception as e:
            print(json.dumps({"success": False, "message": f"JSON inválido: {str(e)}"}))
            return
    elif arg == "--stdin":
        raw_json = sys.stdin.read()
        try:
            payload = json.loads(raw_json)
        except Exception as e:
            print(json.dumps({"success": False, "message": f"JSON stdin inválido: {str(e)}"}))
            return
    elif os.path.exists(arg):
        with open(arg, "r", encoding="utf-8") as f:
            payload = json.load(f)
    else:
        try:
            payload = json.loads(arg)
        except Exception as e:
            print(json.dumps({"success": False, "message": f"Argumento no reconocido: {str(e)}"}))
            return

    try:
        result = process_invoice_pipeline(payload)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        import traceback
        print(json.dumps({
            "success": False,
            "message": str(e),
            "traceback": traceback.format_exc()
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
