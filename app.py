import os
import threading
from pathlib import Path
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

# Ruta absoluta garantizada junto a app.py (evita crear archivos duplicados si se ejecuta desde otra carpeta)
BASE_DIR = Path(__file__).resolve().parent
EXCEL_FILE = BASE_DIR / "requerimientos_ingenieria.xlsx"
INDEX_FILE = BASE_DIR / "index.html"

app = FastAPI(title="Ingeniería BI - Control de Procedimientos y Alcance")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

excel_lock = threading.Lock()

HEADERS = [
    "ID_Req", "Proyecto", "Fase_Etapa", "Solicitante", "Responsable",
    "Descripcion", "Detalle", "Tipo", "Es_Adicional", "Horas_Est",
    "Horas_Reales", "Avance_Pct", "Estado", "Aprobado", "Fecha_Registro"
]


class RequerimientoInput(BaseModel):
    Proyecto: str
    Fase_Etapa: str
    Solicitante: str
    Responsable: str
    Descripcion: str
    Detalle: Optional[str] = ""
    Tipo: str
    Es_Adicional: str = "No"
    Horas_Est: float = 0
    Horas_Reales: float = 0
    Avance_Pct: float = 0
    Estado: str = "Pendiente"
    Aprobado: str = "Pendiente"
    Fecha_Registro: Optional[str] = None


class ProgressPatchInput(BaseModel):
    Estado: Optional[str] = None
    Avance_Pct: Optional[float] = None
    Horas_Reales: Optional[float] = None


def sync_estado_y_porcentaje(estado: str, avance: float, changed_field: str = "auto") -> tuple[str, float]:
    """
    Sincroniza bidireccionalmente el Estado del procedimiento y su % de Avance:
    - Si cambia Estado:
        * Pendiente -> 0%
        * En Desarrollo -> 50% (si estaba en 0% o 100%; conserva valores intermedios personalizados)
        * Pausado -> conserva valor actual (o 25% si estaba en 0%)
        * Terminado -> 100%
    - Si cambia Avance_Pct:
        * 0% -> Pendiente
        * 1% a 99% -> En Desarrollo (salvo que estuviera Pausado)
        * 100% -> Terminado
    """
    estado_clean = (estado or "Pendiente").strip()
    pct = max(0.0, min(100.0, float(avance or 0)))

    if changed_field == "estado":
        if estado_clean == "Pendiente":
            pct = 0.0
        elif estado_clean == "Terminado":
            pct = 100.0
        elif estado_clean == "En Desarrollo":
            if pct <= 0.0 or pct >= 100.0:
                pct = 50.0
        elif estado_clean == "Pausado":
            if pct <= 0.0:
                pct = 25.0
    elif changed_field == "avance":
        if pct <= 0.0:
            pct = 0.0
            estado_clean = "Pendiente"
        elif pct >= 100.0:
            pct = 100.0
            estado_clean = "Terminado"
        else:
            if estado_clean in ("Pendiente", "Terminado"):
                estado_clean = "En Desarrollo"

    return estado_clean, round(pct, 1)


def ensure_excel_exists():
    """Verifica que el archivo Excel exista en BASE_DIR con sus pestañas base."""
    if EXCEL_FILE.exists():
        return
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Requerimientos"
    ws.append(HEADERS)
    ws_cat = wb.create_sheet(title="Catalogos")
    ws_cat.append(["Proyectos", "Solicitantes", "Responsables", "Tipos", "Estados"])
    ws_cat.append(["T-LAB", "Laboratorio", "Samantha Moreno", "Funcionalidad Nueva", "Pendiente"])
    ws_cat.append(["Catálogo Válvulas", "Comercial", "Carlos Ramírez", "Mejora", "En Desarrollo"])
    ws_cat.append(["Portal Corporativo", "Almacén", "Andrés Gómez", "Corrección", "Terminado"])
    ws_cat.append(["Infraestructura / BD", "Gerencia", "Luisa Fernanda Ortiz", "Soporte", "Pausado"])
    wb.save(EXCEL_FILE)


def style_row(ws, row_idx: int):
    """Aplica formato limpio a una fila recién insertada o actualizada."""
    zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
    border_side = Side(style="thin", color="CBD5E1")
    cell_border = Border(left=border_side, right=border_side, top=border_side, bottom=border_side)
    fill = zebra_fill if row_idx % 2 == 0 else white_fill
    ws.row_dimensions[row_idx].height = 30

    for col_idx in range(1, len(HEADERS) + 1):
        c = ws.cell(row=row_idx, column=col_idx)
        c.fill = fill
        c.border = cell_border
        c.font = Font(name="Calibri", size=10, color="0F172A")
        if col_idx in [1, 8, 9, 10, 11, 12, 13, 14, 15]:
            c.alignment = Alignment(horizontal="center", vertical="center")
        else:
            c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        if col_idx in [10, 11, 12]:
            c.number_format = "#,##0"


def save_workbook_safe(wb):
    """Guarda el libro en disco y captura bloqueo si Microsoft Excel lo tiene abierto."""
    try:
        wb.save(EXCEL_FILE)
    except PermissionError:
        raise HTTPException(
            status_code=423,
            detail="El archivo 'requerimientos_ingenieria.xlsx' está abierto en Excel. Ciérralo para guardar los cambios en el disco."
        )


def get_file_metadata():
    if not EXCEL_FILE.exists():
        return {"path": str(EXCEL_FILE), "last_modified": None}
    mtime = datetime.fromtimestamp(EXCEL_FILE.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
    return {"path": str(EXCEL_FILE), "last_modified": mtime}


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/", response_class=HTMLResponse)
def serve_dashboard():
    if not INDEX_FILE.exists():
        return HTMLResponse("<h3>Coloca index.html en la misma carpeta que app.py</h3>", status_code=404)
    return INDEX_FILE.read_text(encoding="utf-8")


@app.get("/api/data")
def get_all_data():
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
        ws = wb["Requerimientos"]

        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            wb.close()
            return {"requerimientos": [], "catalogos": {}, "file_info": get_file_metadata()}

        headers = [str(h).strip() if h else f"Col_{i}" for i, h in enumerate(rows[0])]
        requerimientos = []
        for r in rows[1:]:
            if not any(r):
                continue
            item = dict(zip(headers, r))
            item["Horas_Est"] = float(item.get("Horas_Est") or 0)
            item["Horas_Reales"] = float(item.get("Horas_Reales") or 0)
            item["Avance_Pct"] = float(item.get("Avance_Pct") or 0)
            item["Es_Adicional"] = str(item.get("Es_Adicional") or "No").strip()
            item["Estado"] = str(item.get("Estado") or "Pendiente").strip()
            requerimientos.append(item)

        catalogos = {
            "Proyectos": [],
            "Solicitantes": [],
            "Responsables": [],
            "Tipos": [],
            "Estados": []
        }
        if "Catalogos" in wb.sheetnames:
            ws_cat = wb["Catalogos"]
            cat_rows = list(ws_cat.iter_rows(values_only=True))
            if len(cat_rows) > 1:
                cat_headers = cat_rows[0]
                for r in cat_rows[1:]:
                    for idx, val in enumerate(r):
                        if idx < len(cat_headers) and cat_headers[idx] in catalogos and val:
                            val_clean = str(val).strip()
                            if val_clean and val_clean not in catalogos[cat_headers[idx]]:
                                catalogos[cat_headers[idx]].append(val_clean)

        wb.close()
        return {
            "requerimientos": requerimientos,
            "catalogos": catalogos,
            "file_info": get_file_metadata()
        }


@app.post("/api/requerimientos")
def create_requerimiento(payload: RequerimientoInput):
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]

        max_num = 0
        for row in ws.iter_rows(min_row=2, max_col=1, values_only=True):
            val = str(row[0] or "")
            if "-" in val:
                try:
                    num = int(val.split("-")[-1])
                    if num > max_num:
                        max_num = num
                except ValueError:
                    pass
        new_id = f"ING-{max_num + 1:03d}"
        fecha = payload.Fecha_Registro or datetime.now().strftime("%Y-%m-%d")

        estado_final, avance_final = sync_estado_y_porcentaje(
            payload.Estado, payload.Avance_Pct, changed_field="estado" if payload.Avance_Pct == 0 and payload.Estado != "Pendiente" else "avance"
        )

        new_row = [
            new_id,
            payload.Proyecto.strip(),
            payload.Fase_Etapa.strip(),
            payload.Solicitante.strip(),
            payload.Responsable.strip(),
            payload.Descripcion.strip(),
            (payload.Detalle or "").strip(),
            payload.Tipo.strip(),
            payload.Es_Adicional.strip(),
            payload.Horas_Est,
            payload.Horas_Reales,
            avance_final,
            estado_final,
            payload.Aprobado.strip(),
            fecha
        ]
        ws.append(new_row)
        style_row(ws, ws.max_row)
        save_workbook_safe(wb)
        wb.close()

        return {
            "status": "ok",
            "ID_Req": new_id,
            "Estado": estado_final,
            "Avance_Pct": avance_final,
            "file_info": get_file_metadata(),
            "message": "Requerimiento guardado en Excel"
        }


@app.put("/api/requerimientos/{id_req}")
def update_requerimiento(id_req: str, payload: RequerimientoInput):
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]

        target_row = None
        for idx in range(2, ws.max_row + 1):
            if str(ws.cell(row=idx, column=1).value).strip() == id_req.strip():
                target_row = idx
                break

        if not target_row:
            wb.close()
            raise HTTPException(status_code=404, detail=f"No se encontró el requerimiento {id_req}")

        fecha_actual = ws.cell(row=target_row, column=15).value
        fecha = payload.Fecha_Registro or str(fecha_actual or datetime.now().strftime("%Y-%m-%d"))

        updated_values = [
            id_req.strip(),
            payload.Proyecto.strip(),
            payload.Fase_Etapa.strip(),
            payload.Solicitante.strip(),
            payload.Responsable.strip(),
            payload.Descripcion.strip(),
            (payload.Detalle or "").strip(),
            payload.Tipo.strip(),
            payload.Es_Adicional.strip(),
            payload.Horas_Est,
            payload.Horas_Reales,
            round(float(payload.Avance_Pct or 0), 1),
            payload.Estado.strip(),
            payload.Aprobado.strip(),
            fecha
        ]

        for col_idx, val in enumerate(updated_values, start=1):
            ws.cell(row=target_row, column=col_idx, value=val)

        style_row(ws, target_row)
        save_workbook_safe(wb)
        wb.close()

        return {
            "status": "ok",
            "ID_Req": id_req,
            "file_info": get_file_metadata(),
            "message": "Requerimiento actualizado en Excel"
        }


@app.patch("/api/requerimientos/{id_req}/progreso")
def patch_progreso_requerimiento(id_req: str, payload: ProgressPatchInput):
    """Actualización rápida en línea desde la tabla: sincroniza Estado <-> % Avance y guarda en Excel."""
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]

        target_row = None
        for idx in range(2, ws.max_row + 1):
            if str(ws.cell(row=idx, column=1).value).strip() == id_req.strip():
                target_row = idx
                break

        if not target_row:
            wb.close()
            raise HTTPException(status_code=404, detail=f"No se encontró el requerimiento {id_req}")

        estado_actual = str(ws.cell(row=target_row, column=13).value or "Pendiente").strip()
        avance_actual = float(ws.cell(row=target_row, column=12).value or 0)
        horas_reales_actual = float(ws.cell(row=target_row, column=11).value or 0)

        if payload.Estado is not None and payload.Avance_Pct is None:
            nuevo_estado, nuevo_avance = sync_estado_y_porcentaje(payload.Estado, avance_actual, changed_field="estado")
        elif payload.Avance_Pct is not None and payload.Estado is None:
            nuevo_estado, nuevo_avance = sync_estado_y_porcentaje(estado_actual, payload.Avance_Pct, changed_field="avance")
        else:
            nuevo_estado = payload.Estado if payload.Estado is not None else estado_actual
            nuevo_avance = payload.Avance_Pct if payload.Avance_Pct is not None else avance_actual

        nuevas_horas_reales = float(payload.Horas_Reales) if payload.Horas_Reales is not None else horas_reales_actual

        ws.cell(row=target_row, column=11, value=nuevas_horas_reales)
        ws.cell(row=target_row, column=12, value=nuevo_avance)
        ws.cell(row=target_row, column=13, value=nuevo_estado)

        style_row(ws, target_row)
        save_workbook_safe(wb)
        wb.close()

        return {
            "status": "ok",
            "ID_Req": id_req,
            "Estado": nuevo_estado,
            "Avance_Pct": nuevo_avance,
            "Horas_Reales": nuevas_horas_reales,
            "file_info": get_file_metadata()
        }


@app.delete("/api/requerimientos/{id_req}")
def delete_requerimiento(id_req: str):
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]

        target_row = None
        for idx in range(2, ws.max_row + 1):
            if str(ws.cell(row=idx, column=1).value).strip() == id_req.strip():
                target_row = idx
                break

        if not target_row:
            wb.close()
            raise HTTPException(status_code=404, detail=f"No se encontró el requerimiento {id_req}")

        ws.delete_rows(target_row, 1)
        save_workbook_safe(wb)
        wb.close()
        return {
            "status": "ok",
            "file_info": get_file_metadata(),
            "message": f"Requerimiento {id_req} eliminado del Excel"
        }


@app.get("/api/export")
def export_excel():
    with excel_lock:
        ensure_excel_exists()
        return FileResponse(
            path=str(EXCEL_FILE),
            filename="requerimientos_ingenieria.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
