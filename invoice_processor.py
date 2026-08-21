#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GESTOR TIENDA TECH - MOTOR DE PROCESAMIENTO DE FACTURAS Y DOCUMENTOS
Tecnologías: OpenCV + NumPy (Visión & Preprocesamiento) + Pillow (Renderizado)
=============================================================================
"""

import os
import sys
import json
import base64
import argparse
from io import BytesIO
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# =============================================================================
# 1. FASE A: VISIÓN COMPUTACIONAL Y PREPROCESAMIENTO (OpenCV + NumPy)
# =============================================================================

class InvoiceVisionPreprocessor:
    """
    Se encarga de la corrección geométrica, enderezamiento (deskew),
    detección de bordes, alineación de perspectiva y normalización de imagen.
    """

    @staticmethod
    def load_image_from_source(source):
        """
        Carga una imagen desde ruta de archivo, buffer binario o Base64 Data URL.
        Retorna imagen en formato NumPy array BGR (uint8).
        """
        if isinstance(source, str):
            if source.upper() in ('BLANK', 'DEFAULT', 'NONE', ''):
                # Generar lienzo en blanco nítido
                img = np.full((1100, 800, 3), 255, dtype=np.uint8)
            elif source.startswith('data:image'):
                # Base64 string
                header, encoded = source.split(',', 1)
                data = base64.b64decode(encoded)
                nparr = np.frombuffer(data, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            elif os.path.exists(source):
                # Archivo local
                img = cv2.imread(source, cv2.IMREAD_COLOR)
            else:
                # Intento de decodificar Base64 directo
                try:
                    data = base64.b64decode(source)
                    nparr = np.frombuffer(data, np.uint8)
                    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                except Exception:
                    # Fallback a lienzo en blanco si no se pudo abrir
                    img = np.full((1100, 800, 3), 255, dtype=np.uint8)
        elif isinstance(source, (bytes, bytearray)):
            nparr = np.frombuffer(source, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        elif isinstance(source, np.ndarray):
            img = source.copy()
        else:
            img = np.full((1100, 800, 3), 255, dtype=np.uint8)

        if img is None:
            raise ValueError("OpenCV no pudo decodificar la imagen (formato no soportado o archivo dañado).")

        return img

    @classmethod
    def deskew_and_align(cls, img_bgr, max_angle=15.0):
        """
        Detecta la inclinación de la factura escaneada/fotografiada y la endereza.
        """
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        
        # Filtro de bordes Canny
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        
        # Detección de líneas con Transformada de Hough probabilística
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=100, maxLineGap=10)
        
        angle = 0.0
        if lines is not None and len(lines) > 0:
            angles = []
            for line in lines:
                x1, y1, x2, y2 = line[0]
                if abs(x2 - x1) > 0:
                    rad = np.arctan2(y2 - y1, x2 - x1)
                    deg = np.degrees(rad)
                    # Solo considerar líneas casi horizontales
                    if abs(deg) <= max_angle:
                        angles.append(deg)
            if angles:
                angle = np.median(angles)

        # Si el ángulo es significativo, rotar la imagen
        if abs(angle) > 0.3:
            h, w = img_bgr.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            img_bgr = cv2.warpAffine(img_bgr, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

        return img_bgr, angle

    @classmethod
    def correct_perspective(cls, img_bgr):
        """
        Detecta el contorno rectangular dominante (factura física) y corrige perspectiva.
        """
        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edged = cv2.Canny(blurred, 75, 200)

        contours, _ = cv2.findContours(edged, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

        doc_contour = None
        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4 and cv2.contourArea(c) > (w * h * 0.25):
                doc_contour = approx
                break

        if doc_contour is not None:
            pts = doc_contour.reshape(4, 2)
            # Ordenar esquinas: top-left, top-right, bottom-right, bottom-left
            rect = np.zeros((4, 2), dtype="float32")
            s = pts.sum(axis=1)
            rect[0] = pts[np.argmin(s)]
            rect[2] = pts[np.argmax(s)]
            diff = np.diff(pts, axis=1)
            rect[1] = pts[np.argmin(diff)]
            rect[3] = pts[np.argmax(diff)]

            (tl, tr, br, bl) = rect
            widthA = np.linalg.norm(br - bl)
            widthB = np.linalg.norm(tr - tl)
            maxWidth = max(int(widthA), int(widthB))

            heightA = np.linalg.norm(tr - br)
            heightB = np.linalg.norm(tl - bl)
            maxHeight = max(int(heightA), int(heightB))

            dst = np.array([
                [0, 0],
                [maxWidth - 1, 0],
                [maxWidth - 1, maxHeight - 1],
                [0, maxHeight - 1]
            ], dtype="float32")

            M = cv2.getPerspectiveTransform(rect, dst)
            img_bgr = cv2.warpPerspective(img_bgr, M, (maxWidth, maxHeight), flags=cv2.INTER_CUBIC)

        return img_bgr

    @classmethod
    def enhance_and_normalize(cls, img_bgr, contrast=1.05, brightness=5):
        """
        Ajuste vectorizado con NumPy de contraste y brillo para garantizar
        fondo nítido y legible.
        """
        enhanced = np.clip(img_bgr.astype(np.float32) * contrast + brightness, 0, 255).astype(np.uint8)
        return enhanced

    @classmethod
    def preprocess_pipeline(cls, source, auto_deskew=True, auto_perspective=False, enhance=True):
        """
        Flujo completo de preprocesamiento de OpenCV.
        Retorna la imagen en espacio de color RGB (8-bit uint8).
        """
        img_bgr = cls.load_image_from_source(source)

        if auto_perspective:
            img_bgr = cls.correct_perspective(img_bgr)

        if auto_deskew:
            img_bgr, _ = cls.deskew_and_align(img_bgr)

        if enhance:
            img_bgr = cls.enhance_and_normalize(img_bgr)

        # Conversión fundamental: BGR (OpenCV) -> RGB (Pillow)
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        return img_rgb


# =============================================================================
# 2. FASE B: INYECCIÓN Y RENDERIZADO TIPOGRÁFICO (Pillow / PIL)
# =============================================================================

class InvoicePillowRenderer:
    """
    Superpone los datos dinámicos del comprobante sobre la plantilla preprocesada
    con alta fidelidad tipográfica, cálculo de coordenadas y exportación a PNG/PDF.
    """

    @staticmethod
    def get_font(font_name=None, size=16, bold=False):
        """
        Carga de fuentes TrueType con fallbacks multiplataforma (Windows/Linux).
        """
        candidates = []
        if font_name:
            candidates.append(font_name)

        if bold:
            candidates.extend([
                "arialbd.ttf", "calibrib.ttf", "seguiemb.ttf", "DejaVuSans-Bold.ttf",
                "C:\\Windows\\Fonts\\arialbd.ttf", "C:\\Windows\\Fonts\\calibrib.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
            ])
        else:
            candidates.extend([
                "arial.ttf", "calibri.ttf", "segoeui.ttf", "DejaVuSans.ttf",
                "C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\calibri.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
            ])

        for c in candidates:
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                continue

        return ImageFont.load_default()

    @classmethod
    def render_invoice_onto_template(cls, template_rgb, invoice_data, config=None):
        """
        Inyecta los datos de la factura sobre la imagen de plantilla preprocesada.
        """
        # Conversión de NumPy array a Imagen PIL
        if isinstance(template_rgb, np.ndarray):
            pil_img = Image.fromarray(template_rgb)
        elif isinstance(template_rgb, Image.Image):
            pil_img = template_rgb.copy()
        else:
            raise ValueError("Formato de plantilla no válido para Pillow.")

        # Garantizar modo RGB (8-bit por canal)
        if pil_img.mode != 'RGB':
            pil_img = pil_img.convert('RGB')

        draw = ImageDraw.Draw(pil_img)
        w, h = pil_img.size

        # Factores de escala relativos a base de referencia (800x1100 px)
        scale_x = w / 800.0
        scale_y = h / 1100.0
        scale = (scale_x + scale_y) / 2.0

        # Fuentes tipográficas escaladas
        font_header_title = cls.get_font(size=int(22 * scale), bold=True)
        font_header_sub   = cls.get_font(size=int(14 * scale), bold=True)
        font_bold         = cls.get_font(size=int(13 * scale), bold=True)
        font_regular      = cls.get_font(size=int(12 * scale), bold=False)
        font_small        = cls.get_font(size=int(10 * scale), bold=False)

        # Paleta de colores
        color_text_dark   = (20, 24, 33)       # #141821
        color_text_muted  = (71, 85, 105)      # #475569
        color_primary     = (37, 99, 235)      # #2563eb
        color_accent      = (16, 185, 129)     # #10b981
        color_highlight   = (239, 68, 68)      # #ef4444

        # Extraer campos de factura
        empresa_nombre   = invoice_data.get('empresa_nombre', 'GESTOR TIENDA TECH')
        empresa_ruc      = invoice_data.get('empresa_ruc', '1799999999001')
        empresa_dir      = invoice_data.get('empresa_direccion', 'Av. Principal #123 y Central')
        empresa_tel      = invoice_data.get('empresa_telefono', '+593 99 999 9999')
        
        tipo_doc         = invoice_data.get('tipo_documento', 'FACTURA DE VENTA').upper()
        numero_factura   = invoice_data.get('numero_factura', '001-001-00000001')
        fecha_emision    = invoice_data.get('fecha', invoice_data.get('fecha_emision', ''))
        clave_acceso     = invoice_data.get('clave_acceso_sri', '')

        cliente_nombre   = invoice_data.get('cliente_nombre', 'CONSUMIDOR FINAL')
        cliente_doc      = invoice_data.get('cliente_documento', '9999999999999')
        cliente_tel      = invoice_data.get('cliente_telefono', '')
        cliente_correo   = invoice_data.get('cliente_correo', '')
        cliente_dir      = invoice_data.get('cliente_direccion', 'Quito, Ecuador')
        metodo_pago      = invoice_data.get('metodo_pago', 'Efectivo')

        items            = invoice_data.get('items', [])
        subtotal         = float(invoice_data.get('subtotal', 0.0))
        abono            = float(invoice_data.get('abono', 0.0))
        iva              = float(invoice_data.get('impuesto', invoice_data.get('iva', 0.0)))
        total            = float(invoice_data.get('total', 0.0))

        # ---------------------------------------------------------------------
        # SECCIÓN 1: ENCABEZADO Y DATOS DE LA EMPRESA
        # ---------------------------------------------------------------------
        x_margin = int(45 * scale_x)
        y_pos = int(40 * scale_y)

        # Nombre y RUC de la Empresa
        draw.text((x_margin, y_pos), empresa_nombre, fill=color_text_dark, font=font_header_title)
        y_pos += int(26 * scale_y)
        draw.text((x_margin, y_pos), f"RUC/NIT: {empresa_ruc}", fill=color_text_muted, font=font_regular)
        y_pos += int(18 * scale_y)
        draw.text((x_margin, y_pos), f"Dir: {empresa_dir} | Tel: {empresa_tel}", fill=color_text_muted, font=font_small)

        # Bloque de Identificación del Comprobante (Derecha)
        box_right_w = int(260 * scale_x)
        box_right_h = int(95 * scale_y)
        box_right_x = w - x_margin - box_right_w
        box_right_y = int(35 * scale_y)

        draw.rounded_rectangle(
            [box_right_x, box_right_y, box_right_x + box_right_w, box_right_y + box_right_h],
            radius=int(8 * scale),
            fill=(248, 250, 252),
            outline=color_primary,
            width=2
        )

        draw.text((box_right_x + 15, box_right_y + 12), tipo_doc, fill=color_primary, font=font_header_sub)
        draw.text((box_right_x + 15, box_right_y + 36), f"N°: {numero_factura}", fill=color_text_dark, font=font_bold)
        draw.text((box_right_x + 15, box_right_y + 58), f"Fecha: {fecha_emision}", fill=color_text_muted, font=font_regular)
        if clave_acceso:
            draw.text((box_right_x + 15, box_right_y + 76), f"Aut. SRI: {clave_acceso[:22]}...", fill=color_text_muted, font=font_small)

        # ---------------------------------------------------------------------
        # SECCIÓN 2: CAJA DE DATOS DEL CLIENTE
        # ---------------------------------------------------------------------
        y_pos = int(145 * scale_y)
        client_box_h = int(80 * scale_y)
        draw.rounded_rectangle(
            [x_margin, y_pos, w - x_margin, y_pos + client_box_h],
            radius=int(6 * scale),
            fill=(255, 255, 255),
            outline=(203, 213, 225),
            width=1
        )

        cy = y_pos + int(10 * scale_y)
        draw.text((x_margin + 15, cy), "Cliente / Razón Social: ", fill=color_text_muted, font=font_small)
        draw.text((x_margin + int(150 * scale_x), cy - 2), cliente_nombre, fill=color_text_dark, font=font_bold)

        cy += int(22 * scale_y)
        draw.text((x_margin + 15, cy), f"RUC / C.I.: {cliente_doc}", fill=color_text_dark, font=font_regular)
        draw.text((x_margin + int(380 * scale_x), cy), f"Teléfono: {cliente_tel or 'N/A'}", fill=color_text_dark, font=font_regular)

        cy += int(20 * scale_y)
        draw.text((x_margin + 15, cy), f"Dirección: {cliente_dir}", fill=color_text_muted, font=font_small)
        draw.text((x_margin + int(380 * scale_x), cy), f"Pago: {metodo_pago}", fill=color_text_dark, font=font_regular)

        # ---------------------------------------------------------------------
        # SECCIÓN 3: TABLA DE PRODUCTOS / SERVICIOS / REPUESTOS
        # ---------------------------------------------------------------------
        table_top_y = y_pos + client_box_h + int(20 * scale_y)
        header_h = int(28 * scale_y)

        # Encabezado de la tabla
        draw.rectangle(
            [x_margin, table_top_y, w - x_margin, table_top_y + header_h],
            fill=color_primary
        )

        col_cant_x  = x_margin + int(15 * scale_x)
        col_desc_x  = x_margin + int(80 * scale_x)
        col_prec_x  = w - x_margin - int(190 * scale_x)
        col_subt_x  = w - x_margin - int(80 * scale_x)

        draw.text((col_cant_x, table_top_y + 6), "CANT", fill=(255, 255, 255), font=font_bold)
        draw.text((col_desc_x, table_top_y + 6), "DESCRIPCIÓN / SERVICIO", fill=(255, 255, 255), font=font_bold)
        draw.text((col_prec_x, table_top_y + 6), "P. UNIT", fill=(255, 255, 255), font=font_bold)
        draw.text((col_subt_x, table_top_y + 6), "TOTAL", fill=(255, 255, 255), font=font_bold)

        # Filas de ítems
        cur_row_y = table_top_y + header_h
        row_h = int(24 * scale_y)
        max_rows = 14

        for idx, item in enumerate(items[:max_rows]):
            bg_row = (248, 250, 252) if idx % 2 == 1 else (255, 255, 255)
            draw.rectangle([x_margin, cur_row_y, w - x_margin, cur_row_y + row_h], fill=bg_row)
            draw.line([x_margin, cur_row_y + row_h, w - x_margin, cur_row_y + row_h], fill=(226, 232, 240), width=1)

            cant = str(item.get('cantidad', 1))
            desc = str(item.get('descripcion', item.get('nombre', 'Ítem general')))
            if len(desc) > 42:
                desc = desc[:39] + "..."
            prec = f"${float(item.get('precio_unitario', item.get('precio', 0.0))):.2f}"
            subt = f"${float(item.get('subtotal', 0.0)):.2f}"

            draw.text((col_cant_x + 5, cur_row_y + 4), cant, fill=color_text_dark, font=font_regular)
            draw.text((col_desc_x, cur_row_y + 4), desc, fill=color_text_dark, font=font_regular)
            draw.text((col_prec_x, cur_row_y + 4), prec, fill=color_text_dark, font=font_regular)
            draw.text((col_subt_x, cur_row_y + 4), subt, fill=color_text_dark, font=font_bold)

            cur_row_y += row_h

        # Línea de cierre de tabla
        draw.line([x_margin, cur_row_y, w - x_margin, cur_row_y], fill=color_primary, width=2)

        # ---------------------------------------------------------------------
        # SECCIÓN 4: TOTALES Y DESGLOSE FINANCIERO (Inferior Derecha)
        # ---------------------------------------------------------------------
        tot_box_w = int(260 * scale_x)
        tot_box_x = w - x_margin - tot_box_w
        tot_box_y = cur_row_y + int(15 * scale_y)

        draw.rounded_rectangle(
            [tot_box_x, tot_box_y, tot_box_x + tot_box_w, tot_box_y + int(115 * scale_y)],
            radius=int(6 * scale),
            fill=(255, 255, 255),
            outline=(203, 213, 225),
            width=1
        )

        ty = tot_box_y + int(8 * scale_y)
        draw.text((tot_box_x + 15, ty), "Subtotal:", fill=color_text_muted, font=font_regular)
        draw.text((tot_box_x + tot_box_w - int(85 * scale_x), ty), f"${subtotal:.2f}", fill=color_text_dark, font=font_bold)

        if abono > 0:
            ty += int(20 * scale_y)
            draw.text((tot_box_x + 15, ty), "Abono / Anticipo:", fill=(234, 88, 12), font=font_regular)
            draw.text((tot_box_x + tot_box_w - int(85 * scale_x), ty), f"-${abono:.2f}", fill=(234, 88, 12), font=font_bold)

        ty += int(20 * scale_y)
        draw.text((tot_box_x + 15, ty), "IVA (15%):", fill=color_text_muted, font=font_regular)
        draw.text((tot_box_x + tot_box_w - int(85 * scale_x), ty), f"${iva:.2f}", fill=color_text_dark, font=font_bold)

        ty += int(22 * scale_y)
        draw.line([tot_box_x + 10, ty, tot_box_x + tot_box_w - 10, ty], fill=(203, 213, 225), width=1)
        ty += int(6 * scale_y)
        draw.text((tot_box_x + 15, ty), "TOTAL A PAGAR:", fill=color_text_dark, font=font_header_sub)
        draw.text((tot_box_x + tot_box_w - int(95 * scale_x), ty), f"${total:.2f} USD", fill=color_accent, font=font_header_sub)

        # ---------------------------------------------------------------------
        # SECCIÓN 5: PIE DE PÁGINA Y NOTA DE GARANTÍA
        # ---------------------------------------------------------------------
        footer_y = h - int(55 * scale_y)
        draw.line([x_margin, footer_y, w - x_margin, footer_y], fill=(226, 232, 240), width=1)
        footer_text = "¡Gracias por su preferencia! Garantía de 30 días en repuestos y servicio técnico especializado."
        draw.text((x_margin, footer_y + int(12 * scale_y)), footer_text, fill=color_text_muted, font=font_small)

        return pil_img

    @classmethod
    def export_image(cls, pil_img, output_path=None, format="PNG", dpi=300):
        """
        Exporta la imagen a PNG, JPG o PDF de alta resolución (300 DPI).
        """
        if output_path:
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            pil_img.save(output_path, format=format, dpi=(dpi, dpi), quality=95)
            return output_path
        else:
            buf = BytesIO()
            pil_img.save(buf, format=format, dpi=(dpi, dpi), quality=95)
            return buf.getvalue()


# =============================================================================
# 3. INTERFAZ PRINCIPAL / CLI PARA ELECTRON
# =============================================================================

def process_invoice_flow(template_source, invoice_data, output_path=None, output_format="PNG", auto_deskew=True, auto_perspective=False):
    """
    Orquestador completo:
    1. Preprocesamiento con OpenCV + NumPy (corrección de ángulo, perspectiva y contraste)
    2. Inyección de texto y renderizado de precisión con Pillow
    3. Exportación final en alta resolución
    """
    # 1. OpenCV + NumPy
    preprocessed_rgb = InvoiceVisionPreprocessor.preprocess_pipeline(
        template_source,
        auto_deskew=auto_deskew,
        auto_perspective=auto_perspective,
        enhance=True
    )

    # 2. Pillow
    rendered_pil = InvoicePillowRenderer.render_invoice_onto_template(
        preprocessed_rgb,
        invoice_data
    )

    # 3. Exportación
    if output_path:
        out = InvoicePillowRenderer.export_image(rendered_pil, output_path=output_path, format=output_format)
        
        # Generar también Base64 para visualización instantánea en Electron
        buf = BytesIO()
        rendered_pil.save(buf, format="PNG")
        b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode('utf-8')
        
        return {
            "success": True,
            "output_path": out,
            "base64": b64,
            "width": rendered_pil.width,
            "height": rendered_pil.height
        }
    else:
        raw_bytes = InvoicePillowRenderer.export_image(rendered_pil, format="PNG")
        b64 = "data:image/png;base64," + base64.b64encode(raw_bytes).decode('utf-8')
        return {
            "success": True,
            "base64": b64,
            "width": rendered_pil.width,
            "height": rendered_pil.height
        }


def main():
    parser = argparse.ArgumentParser(description="Motor OpenCV + Pillow para Facturas y Documentos")
    parser.add_argument("--template", required=True, help="Ruta o Base64 de la imagen de plantilla")
    parser.add_argument("--data", required=True, help="Ruta a archivo JSON o string JSON con datos de factura")
    parser.add_argument("--output", default=None, help="Ruta de destino para la imagen o PDF generado")
    parser.add_argument("--format", default="PNG", choices=["PNG", "JPEG", "PDF"], help="Formato de exportación")
    parser.add_argument("--deskew", action="store_true", default=True, help="Enderezar automáticamente")
    parser.add_argument("--perspective", action="store_true", default=False, help="Corregir perspectiva automáticamente")
    
    args = parser.parse_args()

    try:
        # Cargar datos JSON
        if os.path.exists(args.data):
            with open(args.data, 'r', encoding='utf-8') as f:
                invoice_data = json.load(f)
        else:
            invoice_data = json.loads(args.data)

        res = process_invoice_flow(
            template_source=args.template,
            invoice_data=invoice_data,
            output_path=args.output,
            output_format=args.format,
            auto_deskew=args.deskew,
            auto_perspective=args.perspective
        )

        print(json.dumps(res, ensure_ascii=False))
        sys.exit(0)

    except Exception as e:
        error_res = {"success": False, "error": str(e)}
        print(json.dumps(error_res, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
