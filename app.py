import os
import json
import math
import base64
import threading
import urllib.request
import urllib.error
from pathlib import Path
from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

BASE_DIR = Path(__file__).resolve().parent
EXCEL_FILE = BASE_DIR / "requerimientos_ingenieria.xlsx"
INDEX_FILE = BASE_DIR / "index.html"

HORAS_POR_DIA = 8.0

# Configuración para persistencia permanente en GitHub (Render Free Tier)
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
GITHUB_REPO = os.environ.get("GITHUB_REPO", "morenomolinasamantha-wq/control-avance-ingenieria").strip()
GITHUB_BRANCH = os.environ.get("GITHUB_BRANCH", "main").strip()
GITHUB_FILE_PATH = os.environ.get("GITHUB_FILE_PATH", "requerimientos_ingenieria.xlsx").strip()

app = FastAPI(title="Ingeniería BI - Control de Procedimientos, Festivos y Entregas Reales")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

excel_lock = threading.Lock()
github_sync_lock = threading.Lock()
last_github_sync_status = "local_only" if not GITHUB_TOKEN else "pending"

HEADERS = [
    "ID_Req", "Proyecto", "Fase_Etapa", "Solicitante", "Responsable",
    "Descripcion", "Detalle", "Tipo", "Es_Adicional", "Horas_Est",
    "Horas_Reales", "Avance_Pct", "Estado", "Aprobado",
    "Fecha_Solicitud", "Fecha_Registro",
    "Prioridad", "Fecha_Base", "Fecha_Tentativa", "Desplazamiento_Dias",
    "Horas_Demora_Externa", "Comentarios_Externos", "Fecha_Real_Entrega",
    "Dias_Desde_Solicitud"
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
    Fecha_Solicitud: Optional[str] = None
    Fecha_Registro: Optional[str] = None
    Prioridad: str = "3 - Normal"
    Horas_Demora_Externa: float = 0
    Comentarios_Externos: Optional[str] = ""


class ProgressPatchInput(BaseModel):
    Estado: Optional[str] = None
    Avance_Pct: Optional[float] = None
    Horas_Reales: Optional[float] = None


class PriorityPatchInput(BaseModel):
    Prioridad: str


class ExternalDelayPatchInput(BaseModel):
    Horas_Demora_Externa: float = 0
    Comentarios_Externos: Optional[str] = ""


# ==============================================================================
# SINCRONIZACIÓN AUTOMÁTICA CON GITHUB (PERSISTENCIA EN LA NUBE SIN COSTO)
# ==============================================================================
def _github_api_request(method: str, url: str, payload: Optional[dict] = None) -> dict:
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "Ingenieria-BI-Sync",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    data_bytes = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def pull_excel_from_github() -> bool:
    """Descarga la última versión del Excel desde GitHub al arrancar el servidor."""
    global last_github_sync_status
    if not GITHUB_TOKEN or not GITHUB_REPO:
        return False
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE_PATH}?ref={GITHUB_BRANCH}"
        info = _github_api_request("GET", url)
        content_b64 = info.get("content", "")
        if content_b64:
            EXCEL_FILE.write_bytes(base64.b64decode(content_b64))
            last_github_sync_status = "synced"
            return True
    except Exception as e:
        last_github_sync_status = f"pull_error: {e}"
    return False


def push_excel_to_github():
    """Sube el Excel actualizado a GitHub usando [skip ci] para no reiniciar Render."""
    global last_github_sync_status
    if not GITHUB_TOKEN or not GITHUB_REPO or not EXCEL_FILE.exists():
        return
    with github_sync_lock:
        try:
            url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE_PATH}?ref={GITHUB_BRANCH}"
            sha = None
            try:
                current = _github_api_request("GET", url)
                sha = current.get("sha")
            except urllib.error.HTTPError as he:
                if he.code != 404:
                    raise

            encoded = base64.b64encode(EXCEL_FILE.read_bytes()).decode("ascii")
            put_url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE_PATH}"
            body = {
                "message": f"[skip ci] Actualizar {GITHUB_FILE_PATH} desde tablero web",
                "content": encoded,
                "branch": GITHUB_BRANCH
            }
            if sha:
                body["sha"] = sha

            _github_api_request("PUT", put_url, body)
            last_github_sync_status = "synced"
        except Exception as e:
            last_github_sync_status = f"push_error: {e}"


def trigger_async_github_sync():
    if GITHUB_TOKEN and GITHUB_REPO:
        t = threading.Thread(target=push_excel_to_github, daemon=True)
        t.start()


# ==============================================================================
# CALENDARIO LABORAL COLOMBIA (FINES DE SEMANA + FESTIVOS LEY EMILIANI)
# ==============================================================================
_HOLIDAY_CACHE: dict[int, dict[date, str]] = {}


def easter_sunday(year: int) -> date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def next_monday(d: date) -> date:
    if d.weekday() == 0:
        return d
    return d + timedelta(days=(7 - d.weekday()))


def get_colombia_holidays(year: int) -> dict[date, str]:
    if year in _HOLIDAY_CACHE:
        return _HOLIDAY_CACHE[year]
    easter = easter_sunday(year)
    holidays = {
        date(year, 1, 1): "Año Nuevo",
        date(year, 5, 1): "Día del Trabajo",
        date(year, 7, 20): "Día de la Independencia",
        date(year, 8, 7): "Batalla de Boyacá",
        date(year, 12, 8): "Inmaculada Concepción",
        date(year, 12, 25): "Navidad",
        next_monday(date(year, 1, 6)): "Reyes Magos",
        next_monday(date(year, 3, 19)): "San José",
        next_monday(date(year, 6, 29)): "San Pedro y San Pablo",
        next_monday(date(year, 8, 15)): "Asunción de la Virgen",
        next_monday(date(year, 10, 12)): "Día de la Raza",
        next_monday(date(year, 11, 1)): "Todos los Santos",
        next_monday(date(year, 11, 11)): "Independencia de Cartagena",
        easter - timedelta(days=3): "Jueves Santo",
        easter - timedelta(days=2): "Viernes Santo",
        next_monday(easter + timedelta(days=39)): "Ascensión del Señor",
        next_monday(easter + timedelta(days=60)): "Corpus Christi",
        next_monday(easter + timedelta(days=68)): "Sagrado Corazón de Jesús",
    }
    _HOLIDAY_CACHE[year] = dict(sorted(holidays.items()))
    return _HOLIDAY_CACHE[year]


def is_working_day(d: date) -> bool:
    if d.weekday() >= 5:
        return False
    if d in get_colombia_holidays(d.year):
        return False
    return True


def add_working_days(start_date: date, working_days: int) -> date:
    current = start_date
    added = 0
    while added < working_days:
        current += timedelta(days=1)
        if is_working_day(current):
            added += 1
    return current


def next_working_day(d: date) -> date:
    nxt = d + timedelta(days=1)
    while not is_working_day(nxt):
        nxt += timedelta(days=1)
    return nxt


def working_days_diff(d_base: date, d_new: date) -> int:
    if d_base == d_new:
        return 0
    step = 1 if d_new > d_base else -1
    curr = d_base
    count = 0
    while curr != d_new:
        curr += timedelta(days=step)
        if is_working_day(curr):
            count += step
    return count


def safe_iso_date(val, fallback: date) -> date:
    s = str(val or "").strip()[:10]
    if not s:
        return fallback
    try:
        return date.fromisoformat(s)
    except ValueError:
        return fallback


def compute_cascade_schedule(items: list[dict], anchor_date: Optional[date] = None) -> list[dict]:
    if anchor_date is None:
        anchor_date = date.today()
    while not is_working_day(anchor_date):
        anchor_date = next_working_day(anchor_date)

    by_resp: dict[str, list[dict]] = {}
    for item in items:
        resp = str(item.get("Responsable") or "Sin asignar").strip()
        by_resp.setdefault(resp, []).append(item)

    for resp, r_items in by_resp.items():
        for it in r_items:
            reg_d = safe_iso_date(it.get("Fecha_Registro"), anchor_date)
            sol_d = safe_iso_date(it.get("Fecha_Solicitud"), reg_d)
            it["Fecha_Registro"] = reg_d.isoformat()
            it["Fecha_Solicitud"] = sol_d.isoformat()

            ext_hours = max(0.0, float(it.get("Horas_Demora_Externa") or 0))
            ext_days = math.ceil(ext_hours / HORAS_POR_DIA) if ext_hours > 0 else 0
            if str(it.get("Estado", "")).strip() == "Terminado" or float(it.get("Avance_Pct", 0)) >= 100:
                dias_usados = max(1, math.ceil(float(it.get("Horas_Reales") or it.get("Horas_Est") or 8) / HORAS_POR_DIA))
                done_d = add_working_days(reg_d, dias_usados)
                real_d = add_working_days(done_d, ext_days) if ext_days > 0 else done_d
                it["Fecha_Base"] = done_d.isoformat()
                it["Fecha_Tentativa"] = done_d.isoformat()
                it["Desplazamiento_Dias"] = 0
                it["Fecha_Real_Entrega"] = real_d.isoformat()
                it["Dias_Desde_Solicitud"] = max(0, working_days_diff(sol_d, real_d))

        active_items = [
            it for it in r_items
            if str(it.get("Estado", "")).strip() != "Terminado" and float(it.get("Avance_Pct", 0)) < 100
        ]

        base_sorted = sorted(active_items, key=lambda x: str(x.get("ID_Req", "")))
        cursor_base = anchor_date
        base_dates_map: dict[str, date] = {}
        for idx, it in enumerate(base_sorted):
            h_est = float(it.get("Horas_Est") or 0)
            pct = float(it.get("Avance_Pct") or 0)
            h_rest = max(0.0, h_est * (1.0 - pct / 100.0))
            dias = max(1, math.ceil(h_rest / HORAS_POR_DIA))
            start_d = cursor_base if idx == 0 else next_working_day(cursor_base)
            end_d = add_working_days(start_d, dias - 1)
            base_dates_map[str(it["ID_Req"])] = end_d
            cursor_base = end_d

        prio_sorted = sorted(
            active_items,
            key=lambda x: (str(x.get("Prioridad") or "3 - Normal"), str(x.get("ID_Req", "")))
        )
        cursor_prio = anchor_date
        for idx, it in enumerate(prio_sorted):
            h_est = float(it.get("Horas_Est") or 0)
            pct = float(it.get("Avance_Pct") or 0)
            h_rest = max(0.0, h_est * (1.0 - pct / 100.0))
            dias = max(1, math.ceil(h_rest / HORAS_POR_DIA))
            start_d = cursor_prio if idx == 0 else next_working_day(cursor_prio)
            end_d = add_working_days(start_d, dias - 1)
            cursor_prio = end_d

            d_base = base_dates_map[str(it["ID_Req"])]
            ext_hours = max(0.0, float(it.get("Horas_Demora_Externa") or 0))
            ext_days = math.ceil(ext_hours / HORAS_POR_DIA) if ext_hours > 0 else 0
            real_end_d = add_working_days(end_d, ext_days) if ext_days > 0 else end_d
            sol_d = safe_iso_date(it.get("Fecha_Solicitud"), anchor_date)

            it["Fecha_Base"] = d_base.isoformat()
            it["Fecha_Tentativa"] = end_d.isoformat()
            it["Desplazamiento_Dias"] = working_days_diff(d_base, end_d)
            it["Fecha_Real_Entrega"] = real_end_d.isoformat()
            it["Dias_Desde_Solicitud"] = max(0, working_days_diff(sol_d, anchor_date))

    return items


def sync_estado_y_porcentaje(estado: str, avance: float, changed_field: str = "auto") -> tuple[str, float]:
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
    if not EXCEL_FILE.exists():
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Requerimientos"
        ws.append(HEADERS)
        ws_cat = wb.create_sheet(title="Catalogos")
        ws_cat.append(["Proyectos", "Solicitantes", "Responsables", "Tipos", "Estados", "Prioridades"])
        ws_cat.append(["T-LAB", "Calidad", "Samantha Moreno", "Funcionalidad Nueva", "Pendiente", "1 - Urgente"])
        ws_cat.append(["Catálogo Válvulas", "Laboratorio", "Carlos Ramírez", "Mejora", "En Desarrollo", "2 - Alta"])
        ws_cat.append(["Portal Corporativo", "Comercial", "Andrés Gómez", "Corrección", "Terminado", "3 - Normal"])
        ws_cat.append(["Infraestructura / BD", "Gerencia", "Luisa Fernanda Ortiz", "Soporte", "Pausado", "4 - Baja"])
        wb.save(EXCEL_FILE)
        return

    wb = openpyxl.load_workbook(EXCEL_FILE)
    ws = wb["Requerimientos"]
    current_headers = [str(c.value).strip() if c.value else "" for c in ws[1]]
    if current_headers != HEADERS:
        old_rows = list(ws.iter_rows(min_row=2, values_only=True))
        ws.delete_rows(1, ws.max_row)
        ws.append(HEADERS)
        items = []
        for r in old_rows:
            if not any(r):
                continue
            d = dict(zip(current_headers, r))
            reg_str = str(d.get("Fecha_Registro") or date.today().isoformat())[:10]
            sol_str = str(d.get("Fecha_Solicitud") or reg_str)[:10]
            d["Fecha_Registro"] = reg_str
            d["Fecha_Solicitud"] = sol_str
            d.setdefault("Prioridad", "3 - Normal")
            d.setdefault("Horas_Demora_Externa", 0)
            d.setdefault("Comentarios_Externos", "")
            items.append(d)
        compute_cascade_schedule(items)
        for idx, it in enumerate(items, start=2):
            ws.append([it.get(h, "") for h in HEADERS])
            style_row(ws, idx)
        wb.save(EXCEL_FILE)
        trigger_async_github_sync()
    wb.close()


def style_row(ws, row_idx: int):
    zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
    border_side = Side(style="thin", color="CBD5E1")
    cell_border = Border(left=border_side, right=border_side, top=border_side, bottom=border_side)
    fill = zebra_fill if row_idx % 2 == 0 else white_fill
    ws.row_dimensions[row_idx].height = 34

    center_cols = {1, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24}
    for col_idx in range(1, len(HEADERS) + 1):
        c = ws.cell(row=row_idx, column=col_idx)
        c.fill = fill
        c.border = cell_border
        c.font = Font(name="Calibri", size=10, color="0F172A")
        c.alignment = Alignment(
            horizontal="center" if col_idx in center_cols else "left",
            vertical="center",
            wrap_text=True
        )
        if col_idx in {10, 11, 12, 21, 24}:
            c.number_format = "#,##0"
        elif col_idx == 20:
            c.number_format = "+#,##0;-#,##0;0"


def save_workbook_safe(wb, sync_cloud: bool = True):
    try:
        wb.save(EXCEL_FILE)
    except PermissionError:
        raise HTTPException(
            status_code=423,
            detail="El archivo 'requerimientos_ingenieria.xlsx' está abierto en Excel. Ciérralo para guardar los cambios en disco."
        )
    if sync_cloud:
        trigger_async_github_sync()


def read_items_from_ws(ws) -> list[dict]:
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) <= 1:
        return []
    headers = [str(h).strip() if h else f"Col_{i}" for i, h in enumerate(rows[0])]
    items = []
    for r in rows[1:]:
        if not any(r):
            continue
        item = dict(zip(headers, r))
        reg_str = str(item.get("Fecha_Registro") or date.today().isoformat())[:10]
        sol_str = str(item.get("Fecha_Solicitud") or reg_str)[:10]
        item["Fecha_Registro"] = reg_str
        item["Fecha_Solicitud"] = sol_str
        item["Horas_Est"] = float(item.get("Horas_Est") or 0)
        item["Horas_Reales"] = float(item.get("Horas_Reales") or 0)
        item["Avance_Pct"] = float(item.get("Avance_Pct") or 0)
        item["Es_Adicional"] = str(item.get("Es_Adicional") or "No").strip()
        item["Estado"] = str(item.get("Estado") or "Pendiente").strip()
        item["Prioridad"] = str(item.get("Prioridad") or "3 - Normal").strip()
        item["Desplazamiento_Dias"] = int(item.get("Desplazamiento_Dias") or 0)
        item["Horas_Demora_Externa"] = float(item.get("Horas_Demora_Externa") or 0)
        item["Comentarios_Externos"] = str(item.get("Comentarios_Externos") or "").strip()
        item["Dias_Desde_Solicitud"] = int(item.get("Dias_Desde_Solicitud") or 0)
        items.append(item)
    return items


def write_items_to_ws(ws, items: list[dict]):
    ws.delete_rows(2, ws.max_row)
    for idx, it in enumerate(items, start=2):
        ws.append([it.get(h, "") for h in HEADERS])
        style_row(ws, idx)


def get_file_metadata():
    if not EXCEL_FILE.exists():
        return {"path": str(EXCEL_FILE), "last_modified": None, "github_sync": last_github_sync_status}
    mtime = datetime.fromtimestamp(EXCEL_FILE.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
    return {
        "path": str(EXCEL_FILE),
        "last_modified": mtime,
        "github_sync": last_github_sync_status
    }


@app.on_event("startup")
def on_startup():
    with excel_lock:
        pull_excel_from_github()
        ensure_excel_exists()


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/", response_class=HTMLResponse)
def serve_dashboard():
    if not INDEX_FILE.exists():
        return HTMLResponse("<h3>Coloca index.html en la misma carpeta que app.py</h3>", status_code=404)
    return INDEX_FILE.read_text(encoding="utf-8")


@app.get("/api/data")
def get_all_data(pull: bool = False):
    with excel_lock:
        if pull and GITHUB_TOKEN:
            pull_excel_from_github()
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]

        items = read_items_from_ws(ws)
        compute_cascade_schedule(items)
        write_items_to_ws(ws, items)
        try:
            wb.save(EXCEL_FILE)
        except PermissionError:
            pass

        catalogos = {
            "Proyectos": [], "Solicitantes": [], "Responsables": [],
            "Tipos": [], "Estados": [], "Prioridades": ["1 - Urgente", "2 - Alta", "3 - Normal", "4 - Baja"]
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
            "requerimientos": items,
            "catalogos": catalogos,
            "file_info": get_file_metadata()
        }


@app.post("/api/requerimientos")
def create_requerimiento(payload: RequerimientoInput):
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]
        items = read_items_from_ws(ws)

        max_num = 0
        for it in items:
            val = str(it.get("ID_Req") or "")
            if "-" in val:
                try:
                    num = int(val.split("-")[-1])
                    if num > max_num:
                        max_num = num
                except ValueError:
                    pass
        new_id = f"ING-{max_num + 1:03d}"
        fecha_reg = (payload.Fecha_Registro or datetime.now().strftime("%Y-%m-%d")).strip()[:10]
        fecha_sol = (payload.Fecha_Solicitud or fecha_reg).strip()[:10]

        estado_final, avance_final = sync_estado_y_porcentaje(
            payload.Estado, payload.Avance_Pct,
            changed_field="estado" if payload.Avance_Pct == 0 and payload.Estado != "Pendiente" else "avance"
        )

        items.append({
            "ID_Req": new_id,
            "Proyecto": payload.Proyecto.strip(),
            "Fase_Etapa": payload.Fase_Etapa.strip(),
            "Solicitante": payload.Solicitante.strip(),
            "Responsable": payload.Responsable.strip(),
            "Descripcion": payload.Descripcion.strip(),
            "Detalle": (payload.Detalle or "").strip(),
            "Tipo": payload.Tipo.strip(),
            "Es_Adicional": payload.Es_Adicional.strip(),
            "Horas_Est": payload.Horas_Est,
            "Horas_Reales": payload.Horas_Reales,
            "Avance_Pct": avance_final,
            "Estado": estado_final,
            "Aprobado": payload.Aprobado.strip(),
            "Fecha_Solicitud": fecha_sol,
            "Fecha_Registro": fecha_reg,
            "Prioridad": payload.Prioridad.strip(),
            "Horas_Demora_Externa": max(0.0, float(payload.Horas_Demora_Externa or 0)),
            "Comentarios_Externos": (payload.Comentarios_Externos or "").strip()
        })

        compute_cascade_schedule(items)
        write_items_to_ws(ws, items)
        save_workbook_safe(wb, sync_cloud=True)
        wb.close()

        return {
            "status": "ok",
            "ID_Req": new_id,
            "Estado": estado_final,
            "Avance_Pct": avance_final,
            "requerimientos": items,
            "file_info": get_file_metadata(),
            "message": "Procedimiento guardado permanentemente"
        }


@app.put("/api/requerimientos/{id_req}")
def update_requerimiento(id_req: str, payload: RequerimientoInput):
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]
        items = read_items_from_ws(ws)

        target = next((it for it in items if str(it.get("ID_Req")).strip() == id_req.strip()), None)
        if not target:
            wb.close()
            raise HTTPException(status_code=404, detail=f"No se encontró el requerimiento {id_req}")

        fecha_reg = (payload.Fecha_Registro or target.get("Fecha_Registro") or datetime.now().strftime("%Y-%m-%d")).strip()[:10]
        fecha_sol = (payload.Fecha_Solicitud or target.get("Fecha_Solicitud") or fecha_reg).strip()[:10]

        target.update({
            "Proyecto": payload.Proyecto.strip(),
            "Fase_Etapa": payload.Fase_Etapa.strip(),
            "Solicitante": payload.Solicitante.strip(),
            "Responsable": payload.Responsable.strip(),
            "Descripcion": payload.Descripcion.strip(),
            "Detalle": (payload.Detalle or "").strip(),
            "Tipo": payload.Tipo.strip(),
            "Es_Adicional": payload.Es_Adicional.strip(),
            "Horas_Est": payload.Horas_Est,
            "Horas_Reales": payload.Horas_Reales,
            "Avance_Pct": round(float(payload.Avance_Pct or 0), 1),
            "Estado": payload.Estado.strip(),
            "Aprobado": payload.Aprobado.strip(),
            "Fecha_Solicitud": fecha_sol,
            "Fecha_Registro": fecha_reg,
            "Prioridad": payload.Prioridad.strip(),
            "Horas_Demora_Externa": max(0.0, float(payload.Horas_Demora_Externa or 0)),
            "Comentarios_Externos": (payload.Comentarios_Externos or "").strip()
        })

        compute_cascade_schedule(items)
        write_items_to_ws(ws, items)
        save_workbook_safe(wb, sync_cloud=True)
        wb.close()

        return {
            "status": "ok",
            "ID_Req": id_req,
            "requerimientos": items,
            "file_info": get_file_metadata(),
            "message": "Procedimiento actualizado permanentemente"
        }


@app.patch("/api/requerimientos/{id_req}/progreso")
def patch_progreso_requerimiento(id_req: str, payload: ProgressPatchInput):
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]
        items = read_items_from_ws(ws)

        target = next((it for it in items if str(it.get("ID_Req")).strip() == id_req.strip()), None)
        if not target:
            wb.close()
            raise HTTPException(status_code=404, detail=f"No se encontró el requerimiento {id_req}")

        estado_actual = target["Estado"]
        avance_actual = target["Avance_Pct"]

        if payload.Estado is not None and payload.Avance_Pct is None:
            nuevo_estado, nuevo_avance = sync_estado_y_porcentaje(payload.Estado, avance_actual, changed_field="estado")
        elif payload.Avance_Pct is not None and payload.Estado is None:
            nuevo_estado, nuevo_avance = sync_estado_y_porcentaje(estado_actual, payload.Avance_Pct, changed_field="avance")
        else:
            nuevo_estado = payload.Estado if payload.Estado is not None else estado_actual
            nuevo_avance = payload.Avance_Pct if payload.Avance_Pct is not None else avance_actual

        target["Estado"] = nuevo_estado
        target["Avance_Pct"] = nuevo_avance
        if payload.Horas_Reales is not None:
            target["Horas_Reales"] = float(payload.Horas_Reales)

        compute_cascade_schedule(items)
        write_items_to_ws(ws, items)
        save_workbook_safe(wb, sync_cloud=True)
        wb.close()

        return {
            "status": "ok",
            "ID_Req": id_req,
            "Estado": nuevo_estado,
            "Avance_Pct": nuevo_avance,
            "requerimientos": items,
            "file_info": get_file_metadata()
        }


@app.patch("/api/requerimientos/{id_req}/prioridad")
def patch_prioridad_requerimiento(id_req: str, payload: PriorityPatchInput):
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]
        items = read_items_from_ws(ws)

        target = next((it for it in items if str(it.get("ID_Req")).strip() == id_req.strip()), None)
        if not target:
            wb.close()
            raise HTTPException(status_code=404, detail=f"No se encontró el requerimiento {id_req}")

        target["Prioridad"] = payload.Prioridad.strip()
        compute_cascade_schedule(items)
        write_items_to_ws(ws, items)
        save_workbook_safe(wb, sync_cloud=True)
        wb.close()

        return {
            "status": "ok",
            "ID_Req": id_req,
            "Prioridad": target["Prioridad"],
            "Fecha_Tentativa": target["Fecha_Tentativa"],
            "Fecha_Real_Entrega": target["Fecha_Real_Entrega"],
            "Desplazamiento_Dias": target["Desplazamiento_Dias"],
            "requerimientos": items,
            "file_info": get_file_metadata()
        }


@app.patch("/api/requerimientos/{id_req}/demora")
def patch_demora_externa(id_req: str, payload: ExternalDelayPatchInput):
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]
        items = read_items_from_ws(ws)

        target = next((it for it in items if str(it.get("ID_Req")).strip() == id_req.strip()), None)
        if not target:
            wb.close()
            raise HTTPException(status_code=404, detail=f"No se encontró el requerimiento {id_req}")

        target["Horas_Demora_Externa"] = max(0.0, float(payload.Horas_Demora_Externa or 0))
        target["Comentarios_Externos"] = (payload.Comentarios_Externos or "").strip()

        compute_cascade_schedule(items)
        write_items_to_ws(ws, items)
        save_workbook_safe(wb, sync_cloud=True)
        wb.close()

        return {
            "status": "ok",
            "ID_Req": id_req,
            "Horas_Demora_Externa": target["Horas_Demora_Externa"],
            "Comentarios_Externos": target["Comentarios_Externos"],
            "Fecha_Real_Entrega": target["Fecha_Real_Entrega"],
            "requerimientos": items,
            "file_info": get_file_metadata()
        }


@app.delete("/api/requerimientos/{id_req}")
def delete_requerimiento(id_req: str):
    with excel_lock:
        ensure_excel_exists()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        ws = wb["Requerimientos"]
        items = read_items_from_ws(ws)

        new_items = [it for it in items if str(it.get("ID_Req")).strip() != id_req.strip()]
        if len(new_items) == len(items):
            wb.close()
            raise HTTPException(status_code=404, detail=f"No se encontró el requerimiento {id_req}")

        compute_cascade_schedule(new_items)
        write_items_to_ws(ws, new_items)
        save_workbook_safe(wb, sync_cloud=True)
        wb.close()
        return {
            "status": "ok",
            "requerimientos": new_items,
            "file_info": get_file_metadata(),
            "message": f"Requerimiento {id_req} eliminado permanentemente"
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
