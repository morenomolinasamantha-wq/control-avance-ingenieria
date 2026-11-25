const FALLBACK_DATA = [
  { ID_Req: "ING-001", Proyecto: "T-LAB", Fase_Etapa: "Etapa 1", Solicitante: "Calidad", Responsable: "Samantha Moreno", Descripcion: "Correo sin spam", Detalle: "Experimentar una nueva alternativa de correo automaticos sin spam ni suplantación", Tipo: "Mejora", Es_Adicional: "No", Horas_Est: 20, Horas_Reales: 22, Avance_Pct: 80, Estado: "En Desarrollo", Aprobado: "Aprobado", Fecha_Solicitud: "2026-11-11", Fecha_Registro: "2026-11-20", Prioridad: "1 - Urgente", Horas_Demora_Externa: 24, Comentarios_Externos: "Esperando el correo nuevo de notificaciones. Demora por pruebas con clientes", Cantidad_Ediciones: 0 },
  { ID_Req: "ING-002", Proyecto: "T-LAB", Fase_Etapa: "Etapa 1", Solicitante: "Calidad", Responsable: "Samantha Moreno", Descripcion: "Opción de devolver ficha de aplicación a firma de cliente", Detalle: "Se entrega la opción mas amigable para devolver una ficha de aplicación por edición de datos al cliente, siguiendo el procedimiento y conservando la legibilidad de datos para calibrar.", Tipo: "Funcionalidad Nueva", Es_Adicional: "Sí", Horas_Est: 8, Horas_Reales: 10, Avance_Pct: 80, Estado: "En Desarrollo", Aprobado: "Aprobado", Fecha_Solicitud: "2026-11-11", Fecha_Registro: "2026-11-20", Prioridad: "2 - Alta", Horas_Demora_Externa: 0, Comentarios_Externos: "", Cantidad_Ediciones: 0 },
  { ID_Req: "ING-003", Proyecto: "T-LAB", Fase_Etapa: "Etapa 1", Solicitante: "Calidad", Responsable: "Samantha Moreno", Descripcion: "Rol metrologo y almacen", Detalle: "Se entrega una producción unica por perfil, en este caso, rol metrologo y rol de almacen. Además, se incorpora la asignacion de producción para los metrologos y realicen sus respectivas calibraciones.", Tipo: "Funcionalidad Nueva", Es_Adicional: "Sí", Horas_Est: 8, Horas_Reales: 15, Avance_Pct: 80, Estado: "En Desarrollo", Aprobado: "Aprobado", Fecha_Solicitud: "2026-11-11", Fecha_Registro: "2026-11-20", Prioridad: "2 - Alta", Horas_Demora_Externa: 0, Comentarios_Externos: "", Cantidad_Ediciones: 0 },
  { ID_Req: "ING-004", Proyecto: "CRONOGRAMA", Fase_Etapa: "REPORTE", Solicitante: "Ingenieria", Responsable: "Samantha Moreno", Descripcion: "Crear un sistema de reporte de proyectos/entregables", Detalle: "Entregar un sistema de reportes de proyectos/entregables para el area de ingenieria que se pueda visualizar en tiempo real.", Tipo: "Funcionalidad Nueva", Es_Adicional: "No", Horas_Est: 16, Horas_Reales: 20, Avance_Pct: 100, Estado: "Terminado", Aprobado: "Aprobado", Fecha_Solicitud: "2026-11-18", Fecha_Registro: "2026-11-23", Prioridad: "3 - Normal", Horas_Demora_Externa: 0, Comentarios_Externos: "", Cantidad_Ediciones: 0 }
];

const PIN_STORAGE_KEY = "ing_bi_admin_pin";
const LOCAL_STORAGE_KEY = "ing_bi_local_items_v1";
const holidayMapCache = {};

let adminPin = sessionStorage.getItem(PIN_STORAGE_KEY) || "";
let isUnlocked = Boolean(adminPin);
let simHoursPerDay = 8.0;
let simCapacityMult = 1.0;

let allData = [];
let filteredData = [];
let expandedDetails = new Set();
let shiftedIds = new Set();
let selectedProject = "TODOS";
let selectedCategory = "TODOS";
let selectedScope = "TODOS";
let barAxis = "Proyecto";
let donutAxis = "Responsable";
let viewMode = "list";
let activeMainTab = "resumen";
let isBackendConnected = false;
let chartHours = null;
let chartDistribution = null;

/* ==========================================================================
   UTILIDADES DE SEGURIDAD (ESCAPE HTML / ATRIBUTOS CONTRA XSS)
   ========================================================================== */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsArg(value) {
  return escapeHtml(String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
}

/* ==========================================================================
   NAVEGACIÓN DE 3 PESTAÑAS, MENÚ "MÁS" Y PANEL "MÁS FILTROS"
   ========================================================================== */
function setMainTab(tab) {
  activeMainTab = tab;
  document.querySelectorAll(".tab-panel").forEach(p => {
    p.classList.toggle("active", p.getAttribute("data-panel") === tab);
  });
  document.querySelectorAll(".nav-tab, .mobile-nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  });
  if (tab === "resumen") {
    setTimeout(() => {
      renderCharts();
      if (chartHours) chartHours.resize();
      if (chartDistribution) chartDistribution.resize();
    }, 30);
  } else if (tab === "entregables") {
    renderActiveView();
  } else if (tab === "cronograma") {
    renderGantt();
  }
}

function toggleMoreMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById("moreMenuDropdown");
  const btn = document.getElementById("moreMenuBtn");
  if (!menu) return;
  const open = menu.classList.toggle("open");
  if (btn) btn.setAttribute("aria-expanded", String(open));
}

function closeMoreMenu() {
  const menu = document.getElementById("moreMenuDropdown");
  const btn = document.getElementById("moreMenuBtn");
  if (menu) menu.classList.remove("open");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function toggleMoreFilters() {
  const panel = document.getElementById("advancedFiltersPanel");
  if (!panel) return;
  panel.classList.toggle("open");
  updateMoreFiltersButton();
}

function updateMoreFiltersButton() {
  const btn = document.getElementById("moreFiltersBtn");
  const panel = document.getElementById("advancedFiltersPanel");
  if (!btn) return;
  let activeCount = 0;
  if (document.getElementById("fResponsable").value !== "TODOS") activeCount++;
  if (document.getElementById("fSolicitante").value !== "TODOS") activeCount++;
  if (document.getElementById("fPrioridad").value !== "TODOS") activeCount++;
  if (selectedScope !== "TODOS") activeCount++;
  const isOpen = panel && panel.classList.contains("open");
  btn.textContent = activeCount > 0 ? `Más filtros (${activeCount})` : (isOpen ? "Ocultar filtros" : "Más filtros");
}

/* ==========================================================================
   CONTROL DE ACCESO (SOLO LECTURA vs EDICIÓN CON CLAVE)
   ========================================================================== */
function updateLockUI() {
  const body = document.body;
  const btn = document.getElementById("lockBtn");
  const sub = document.getElementById("workbenchSubtitle");

  if (isUnlocked) {
    body.classList.remove("is-locked");
    btn.className = "btn btn-lock-unlocked";
    btn.textContent = "Editando · Bloquear";
    if (sub) sub.textContent = "Modo edición activo · Los cambios se guardan en tiempo real";
  } else {
    body.classList.add("is-locked");
    btn.className = "btn btn-lock-locked";
    btn.textContent = "Solo Lectura · Activar Edición";
    if (sub) sub.textContent = "Vista de consulta · Activa la edición para modificar avances o crear procedimientos";
  }
  renderActiveView();
}

function toggleAdminLock() {
  if (isUnlocked) {
    adminPin = "";
    isUnlocked = false;
    sessionStorage.removeItem(PIN_STORAGE_KEY);
    updateLockUI();
    showToast("Tablero bloqueado en modo solo lectura");
  } else {
    document.getElementById("adminPasswordInput").value = "";
    document.getElementById("authModal").classList.add("open");
    setTimeout(() => document.getElementById("adminPasswordInput").focus(), 60);
  }
}

function closeAuthModal() {
  document.getElementById("authModal").classList.remove("open");
}

async function submitAuthModal(e) {
  e.preventDefault();
  const pwd = (document.getElementById("adminPasswordInput").value || "").trim();
  if (!pwd) return;

  if (!isBackendConnected) {
    adminPin = "";
    isUnlocked = true;
    closeAuthModal();
    updateLockUI();
    showToast("Modo edición local desbloqueado (sin servidor conectado; los cambios se guardan solo en este navegador)", true);
    return;
  }

  try {
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd })
    });
    if (res.ok) {
      adminPin = pwd;
      isUnlocked = true;
      sessionStorage.setItem(PIN_STORAGE_KEY, pwd);
      closeAuthModal();
      updateLockUI();
      showToast("Modo edición desbloqueado correctamente");
    } else {
      showToast("Contraseña incorrecta", true);
    }
  } catch (err) {
    showToast("No se pudo verificar la clave con el servidor", true);
  }
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Admin-Pin": adminPin
  };
}

function handleUnauthorized() {
  adminPin = "";
  isUnlocked = false;
  sessionStorage.removeItem(PIN_STORAGE_KEY);
  updateLockUI();
  showToast("Sesión bloqueada o clave inválida. Desbloquea para guardar.", true);
}

/* ==========================================================================
   CALENDARIO LABORAL COLOMBIA (FINES DE SEMANA + FESTIVOS LEY EMILIANI)
   ========================================================================== */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function nextMonday(d) {
  const copy = new Date(d.getTime());
  const wd = copy.getDay();
  if (wd === 1) return copy;
  const add = wd === 0 ? 1 : (8 - wd);
  copy.setDate(copy.getDate() + add);
  return copy;
}

function shiftDays(d, days) {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(str) {
  const clean = String(str || "").slice(0, 10);
  const parts = clean.split("-").map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getColombiaHolidaysMap(year) {
  if (holidayMapCache[year]) return holidayMapCache[year];
  const easter = easterSunday(year);
  const entries = [
    [new Date(year, 0, 1), "Año Nuevo"],
    [new Date(year, 4, 1), "Día del Trabajo"],
    [new Date(year, 6, 20), "Día de la Independencia"],
    [new Date(year, 7, 7), "Batalla de Boyacá"],
    [new Date(year, 11, 8), "Inmaculada Concepción"],
    [new Date(year, 11, 25), "Navidad"],
    [nextMonday(new Date(year, 0, 6)), "Reyes Magos"],
    [nextMonday(new Date(year, 2, 19)), "San José"],
    [nextMonday(new Date(year, 5, 29)), "San Pedro y San Pablo"],
    [nextMonday(new Date(year, 7, 15)), "Asunción de la Virgen"],
    [nextMonday(new Date(year, 9, 12)), "Día de la Raza"],
    [nextMonday(new Date(year, 10, 1)), "Todos los Santos"],
    [nextMonday(new Date(year, 10, 11)), "Independencia de Cartagena"],
    [shiftDays(easter, -3), "Jueves Santo"],
    [shiftDays(easter, -2), "Viernes Santo"],
    [nextMonday(shiftDays(easter, 39)), "Ascensión del Señor"],
    [nextMonday(shiftDays(easter, 60)), "Corpus Christi"],
    [nextMonday(shiftDays(easter, 68)), "Sagrado Corazón de Jesús"]
  ];
  const map = new Map();
  entries.forEach(([dt, name]) => map.set(formatIsoDate(dt), name));
  holidayMapCache[year] = map;
  return map;
}

function getHolidayName(d) {
  return getColombiaHolidaysMap(d.getFullYear()).get(formatIsoDate(d)) || null;
}

function isWorkingDay(d) {
  const wd = d.getDay();
  if (wd === 0 || wd === 6) return false;
  return !getHolidayName(d);
}

function addWorkingDays(startDate, workingDays) {
  const curr = new Date(startDate.getTime());
  let added = 0;
  while (added < workingDays) {
    curr.setDate(curr.getDate() + 1);
    if (isWorkingDay(curr)) added++;
  }
  return curr;
}

function nextWorkingDay(d) {
  const nxt = new Date(d.getTime());
  nxt.setDate(nxt.getDate() + 1);
  while (!isWorkingDay(nxt)) {
    nxt.setDate(nxt.getDate() + 1);
  }
  return nxt;
}

function workingDaysDiff(dBase, dNew) {
  const t1 = dBase.getTime();
  const t2 = dNew.getTime();
  if (t1 === t2) return 0;
  const step = t2 > t1 ? 1 : -1;
  const curr = new Date(t1);
  let count = 0;
  while (curr.getTime() !== t2) {
    curr.setDate(curr.getDate() + step);
    if (isWorkingDay(curr)) count += step;
  }
  return count;
}

function computeLocalCascade(items) {
  const effectiveHoursPerDay = simHoursPerDay * simCapacityMult;
  const now = new Date();
  let anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (!isWorkingDay(anchor)) {
    anchor = nextWorkingDay(anchor);
  }

  const byResp = {};
  items.forEach(it => {
    const resp = (it.Responsable || "Sin asignar").trim();
    if (!byResp[resp]) byResp[resp] = [];
    byResp[resp].push(it);
  });

  Object.values(byResp).forEach(rItems => {
    rItems.forEach(it => {
      const regD = it.Fecha_Registro ? parseIsoDate(it.Fecha_Registro) : anchor;
      const solD = it.Fecha_Solicitud ? parseIsoDate(it.Fecha_Solicitud) : regD;
      it.Fecha_Registro = formatIsoDate(regD);
      it.Fecha_Solicitud = formatIsoDate(solD);
      it.Cantidad_Ediciones = Number(it.Cantidad_Ediciones || 0);

      const extHours = Math.max(0, Number(it.Horas_Demora_Externa || 0));
      const extDays = extHours > 0 ? Math.ceil(extHours / effectiveHoursPerDay) : 0;
      if (it.Estado === "Terminado" || Number(it.Avance_Pct || 0) >= 100) {
        const diasUsados = Math.max(1, Math.ceil((Number(it.Horas_Reales || it.Horas_Est || 8)) / effectiveHoursPerDay));
        const doneD = addWorkingDays(regD, diasUsados);
        const realD = extDays > 0 ? addWorkingDays(doneD, extDays) : doneD;
        it.Fecha_Inicio_Calc = formatIsoDate(regD);
        it.Fecha_Base = formatIsoDate(doneD);
        it.Fecha_Tentativa = formatIsoDate(doneD);
        it.Desplazamiento_Dias = 0;
        it.Fecha_Real_Entrega = formatIsoDate(realD);
        it.Dias_Desde_Solicitud = Math.max(0, workingDaysDiff(solD, realD));
      }
    });

    const active = rItems.filter(it => it.Estado !== "Terminado" && Number(it.Avance_Pct || 0) < 100);
    const baseSorted = [...active].sort((a, b) => String(a.ID_Req).localeCompare(String(b.ID_Req)));
    let cursorBase = new Date(anchor.getTime());
    const baseMap = {};

    baseSorted.forEach((it, idx) => {
      const hRest = Math.max(0, Number(it.Horas_Est || 0) * (1 - Number(it.Avance_Pct || 0) / 100));
      const dias = Math.max(1, Math.ceil(hRest / effectiveHoursPerDay));
      const startD = idx === 0 ? cursorBase : nextWorkingDay(cursorBase);
      const endD = addWorkingDays(startD, dias - 1);
      baseMap[it.ID_Req] = endD;
      cursorBase = endD;
    });

    const prioSorted = [...active].sort((a, b) => {
      const pa = String(a.Prioridad || "3 - Normal");
      const pb = String(b.Prioridad || "3 - Normal");
      if (pa !== pb) return pa.localeCompare(pb);
      return String(a.ID_Req).localeCompare(String(b.ID_Req));
    });

    let cursorPrio = new Date(anchor.getTime());
    prioSorted.forEach((it, idx) => {
      const hRest = Math.max(0, Number(it.Horas_Est || 0) * (1 - Number(it.Avance_Pct || 0) / 100));
      const dias = Math.max(1, Math.ceil(hRest / effectiveHoursPerDay));
      const startD = idx === 0 ? cursorPrio : nextWorkingDay(cursorPrio);
      const endD = addWorkingDays(startD, dias - 1);
      cursorPrio = endD;

      const dBase = baseMap[it.ID_Req];
      const extHours = Math.max(0, Number(it.Horas_Demora_Externa || 0));
      const extDays = extHours > 0 ? Math.ceil(extHours / effectiveHoursPerDay) : 0;
      const realEndD = extDays > 0 ? addWorkingDays(endD, extDays) : endD;
      const solD = parseIsoDate(it.Fecha_Solicitud);

      it.Fecha_Inicio_Calc = formatIsoDate(startD);
      it.Fecha_Base = formatIsoDate(dBase);
      it.Fecha_Tentativa = formatIsoDate(endD);
      it.Desplazamiento_Dias = workingDaysDiff(dBase, endD);
      it.Fecha_Real_Entrega = formatIsoDate(realEndD);
      it.Dias_Desde_Solicitud = Math.max(0, workingDaysDiff(solD, anchor));
    });
  });
}

/* ==========================================================================
   SIMULADOR "¿QUÉ PASA SI...?"
   ========================================================================== */
function toggleSimulator() {
  const bar = document.getElementById("simulatorBar");
  if (bar) bar.classList.toggle("open");
}

function setSimHours(h) {
  simHoursPerDay = h;
  document.querySelectorAll("[data-simh]").forEach(b => {
    b.classList.toggle("active", Number(b.getAttribute("data-simh")) === h);
  });
  runSimulation();
}

function setSimCapacity(mult) {
  simCapacityMult = mult;
  document.querySelectorAll("[data-simcap]").forEach(b => {
    b.classList.toggle("active", Number(b.getAttribute("data-simcap")) === mult);
  });
  runSimulation();
}

function resetSimulator() {
  simHoursPerDay = 8.0;
  simCapacityMult = 1.0;
  document.querySelectorAll("[data-simh]").forEach(b => b.classList.toggle("active", Number(b.getAttribute("data-simh")) === 8));
  document.querySelectorAll("[data-simcap]").forEach(b => b.classList.toggle("active", Number(b.getAttribute("data-simcap")) === 1));
  runSimulation();
}

function runSimulation() {
  const prev = snapshotDates();
  computeLocalCascade(allData);
  detectShiftedRows(prev);
  const isDefault = simHoursPerDay === 8 && simCapacityMult === 1;
  const lbl = document.getElementById("simStatusLabel");
  lbl.textContent = isDefault
    ? "Modo real (8h/día · 1x)"
    : `Simulación activa (${simHoursPerDay}h/día · ${simCapacityMult}x = ${(simHoursPerDay * simCapacityMult).toFixed(0)}h/día)`;
  lbl.className = isDefault ? "pill-tag tag-steel" : "pill-tag tag-ochre";
  applyFilters();
}

/* ==========================================================================
   LÓGICA BIDIRECCIONAL: ESTADO <-> % AVANCE
   ========================================================================== */
function computePctFromEstado(estado, currentPct) {
  const pct = Number(currentPct || 0);
  if (estado === "Pendiente") return 0;
  if (estado === "Terminado") return 100;
  if (estado === "En Desarrollo") return (pct <= 0 || pct >= 100) ? 50 : pct;
  if (estado === "Pausado") return pct <= 0 ? 25 : pct;
  return pct;
}

function computeEstadoFromPct(pct, currentEstado) {
  const val = Math.max(0, Math.min(100, Number(pct || 0)));
  if (val <= 0) return "Pendiente";
  if (val >= 100) return "Terminado";
  if (currentEstado === "Pendiente" || currentEstado === "Terminado") return "En Desarrollo";
  return currentEstado || "En Desarrollo";
}

function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "graphite" ? "paper" : "graphite";
  root.setAttribute("data-theme", next);
  localStorage.setItem("ing_bi_theme", next);
  const themeBtn = document.getElementById("themeBtn");
  if (themeBtn) themeBtn.textContent = next === "graphite" ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro";
  renderCharts();
}

function initTheme() {
  const saved = localStorage.getItem("ing_bi_theme") || "paper";
  document.documentElement.setAttribute("data-theme", saved);
  const themeBtn = document.getElementById("themeBtn");
  if (themeBtn) themeBtn.textContent = saved === "graphite" ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro";
}

function showToast(msg, isWarn = false) {
  const el = document.getElementById("toast");
  const icon = isWarn ? "⚠" : "✓";
  el.textContent = `${icon}  ${msg}`;
  el.className = isWarn ? "toast warn show" : "toast show";
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 3800);
}

function renderLoadingSkeletons() {
  const strip = document.getElementById("projectsStrip");
  if (strip && !allData.length) {
    strip.innerHTML = Array.from({ length: 4 }, () => `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-block skeleton-circle"></div>
        <div class="skeleton-stack">
          <div class="skeleton-block" style="height:13px; width:65%;"></div>
          <div class="skeleton-block" style="height:10px; width:85%;"></div>
          <div class="skeleton-block" style="height:10px; width:50%;"></div>
        </div>
      </div>
    `).join("");
  }

  const tbody = document.getElementById("tableBody");
  if (tbody && !allData.length) {
    tbody.innerHTML = Array.from({ length: 4 }, () => `
      <tr class="skeleton-row" aria-hidden="true">
        <td><div class="skeleton-stack"><div class="skeleton-block" style="height:12px; width:55%;"></div><div class="skeleton-block" style="height:10px; width:80%;"></div></div></td>
        <td><div class="skeleton-stack"><div class="skeleton-block" style="height:13px; width:75%;"></div><div class="skeleton-block" style="height:10px; width:92%;"></div></div></td>
        <td><div class="skeleton-stack"><div class="skeleton-block" style="height:22px; width:88px; border-radius:999px;"></div><div class="skeleton-block" style="height:22px; width:96px; border-radius:999px;"></div></div></td>
        <td><div class="skeleton-block" style="height:14px; width:90%;"></div></td>
        <td><div class="skeleton-stack"><div class="skeleton-block" style="height:12px; width:75%;"></div><div class="skeleton-block" style="height:10px; width:60%;"></div></div></td>
        <td class="actions-col-cell"><div class="skeleton-block" style="height:24px; width:100%;"></div></td>
      </tr>
    `).join("");
  }
}

function buildEmptyStateHtml() {
  const hasData = allData.length > 0;
  const title = hasData
    ? "Sin resultados para los filtros actuales"
    : "Aún no hay procedimientos registrados";
  const desc = hasData
    ? "Prueba ajustando la búsqueda o limpia los filtros activos para volver a ver todo el cronograma."
    : "Desbloquea el modo edición para registrar el primer procedimiento y calcular entregas automáticamente.";
  const actionBtn = hasData
    ? `<button type="button" class="btn btn-secondary" onclick="resetFilters()">Limpiar filtros</button>`
    : (isUnlocked
        ? `<button type="button" class="btn btn-primary" onclick="openDrawer()">+ Nuevo procedimiento</button>`
        : `<button type="button" class="btn btn-secondary" onclick="toggleAdminLock()">Desbloquear edición</button>`);

  return `
    <div class="empty-state">
      <div class="empty-state-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.5-3.5"></path>
          <path d="M8.5 11h5"></path>
        </svg>
      </div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-desc">${desc}</div>
      <div class="empty-state-actions">${actionBtn}</div>
    </div>
  `;
}

function getSliderColor(pct) {
  const val = Number(pct || 0);
  if (val >= 100) return "var(--tone-sage)";
  if (val >= 50) return "var(--accent-primary)";
  if (val > 0) return "var(--tone-ochre)";
  return "var(--tone-neutral)";
}

function formatHoursLabel(h) {
  const num = Number(h || 0);
  return Number.isInteger(num) ? `${num}h` : `${num.toFixed(1)}h`;
}

function copyExecutiveReport() {
  const lines = ["📊 *REPORTE DE AVANCE Y ENTREGAS - INGENIERÍA*", ""];
  const byProj = {};
  allData.forEach(r => {
    if (!byProj[r.Proyecto]) byProj[r.Proyecto] = { est: 0, w: 0, maxDate: "" };
    const h = Number(r.Horas_Est || 0);
    byProj[r.Proyecto].est += h;
    byProj[r.Proyecto].w += h * (Number(r.Avance_Pct || 0) / 100);
    const f = r.Fecha_Real_Entrega || r.Fecha_Tentativa || "";
    if (f > byProj[r.Proyecto].maxDate) byProj[r.Proyecto].maxDate = f;
  });

  Object.keys(byProj).forEach(p => {
    const pct = byProj[p].est > 0 ? ((byProj[p].w / byProj[p].est) * 100).toFixed(1) : "0.0";
    lines.push(`• *${p}*: ${pct}% avance ponderado | Cierre real est.: ${byProj[p].maxDate}`);
  });

  lines.push("", "*Detalle de procedimientos:*");
  filteredData.forEach(r => {
    const ext = Number(r.Horas_Demora_Externa || 0) > 0 ? ` (+${r.Horas_Demora_Externa}h demora ext.)` : "";
    const eds = Number(r.Cantidad_Ediciones || 0) > 0 ? ` [${r.Cantidad_Ediciones} ed. · ${formatHoursLabel(r.Horas_Reales)}]` : "";
    const solStr = r.Fecha_Solicitud ? `Pedido: ${r.Fecha_Solicitud} | ` : "";
    lines.push(`- [${r.ID_Req}] ${r.Descripcion}${eds}: ${r.Avance_Pct}% (${r.Estado}) | ${solStr}Entrega real: ${r.Fecha_Real_Entrega}${ext}`);
  });

  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    showToast("Resumen ejecutivo copiado al portapapeles");
  });
}

/* ==========================================================================
   CARGA Y SINCRONIZACIÓN CON EXCEL + RESPALDO LOCALSTORAGE
   ========================================================================== */
function saveLocalBackup() {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(allData));
  } catch (e) {}
}

function loadLocalBackup() {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(FALLBACK_DATA));
}

async function loadData(manualRefresh = false) {
  try {
    const endpoint = manualRefresh ? "/api/data?pull=true" : "/api/data";
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error("No backend");
    const json = await res.json();
    allData = json.requerimientos || [];
    computeLocalCascade(allData);
    saveLocalBackup();
    isBackendConnected = true;

    const dot = document.getElementById("syncDot");
    dot.classList.remove("offline");
    const modTime = json.file_info && json.file_info.last_modified
      ? json.file_info.last_modified.split(" ")[1]
      : "Activo";
    const ghState = json.file_info && json.file_info.github_sync === "synced"
      ? "Nube GitHub"
      : "Excel en disco";
    document.getElementById("syncText").textContent = `${ghState} · ${modTime}`;
    if (manualRefresh) showToast("Cronograma y datos sincronizados");
  } catch (err) {
    allData = loadLocalBackup();
    computeLocalCascade(allData);
    isBackendConnected = false;
    document.getElementById("syncDot").classList.add("offline");
    document.getElementById("syncText").textContent = "Guardado en navegador";
  }
  populateDropdowns();
  applyFilters();
}

function uniqueValues(key) {
  return [...new Set(allData.map(item => (item[key] || "").trim()).filter(Boolean))];
}

function populateSelect(id, values, prefix) {
  const sel = document.getElementById(id);
  const prev = sel.value || "TODOS";
  sel.innerHTML = `<option value="TODOS">${prefix}: Todos</option>`;
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function populateDatalist(id, values) {
  const dl = document.getElementById(id);
  dl.innerHTML = "";
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    dl.appendChild(opt);
  });
}

function populateDropdowns() {
  const proyectos = uniqueValues("Proyecto");
  const responsables = uniqueValues("Responsable");
  const solicitantes = uniqueValues("Solicitante");

  populateSelect("fProyectoSelect", proyectos, "Proyecto");
  populateSelect("fResponsable", responsables, "Responsable");
  populateSelect("fSolicitante", solicitantes, "Solicitante");

  const projSel = document.getElementById("fProyectoSelect");
  if (projSel && [...projSel.options].some(o => o.value === selectedProject)) {
    projSel.value = selectedProject;
  }

  populateDatalist("dlProyectos", proyectos);
  populateDatalist("dlResponsables", responsables);
  populateDatalist("dlSolicitantes", solicitantes);
}

function onProjectSelectChange(projectName) {
  selectedProject = projectName || "TODOS";
  applyFilters();
}

function selectProjectCard(projectName) {
  selectedProject = selectedProject === projectName ? "TODOS" : projectName;
  const projSel = document.getElementById("fProyectoSelect");
  if (projSel && [...projSel.options].some(o => o.value === selectedProject)) {
    projSel.value = selectedProject;
  }
  applyFilters();
  if (projectName !== "TODOS" && activeMainTab === "resumen") {
    setMainTab("entregables");
  }
}

function getItemCategory(r) {
  return String(r && r.Categoria ? r.Categoria : "Proyecto").trim().toLowerCase().startsWith("req")
    ? "Requerimiento"
    : "Proyecto";
}

function setCategoryFilter(catVal) {
  selectedCategory = catVal || "TODOS";
  document.querySelectorAll("[data-cat]").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-cat") === selectedCategory);
  });
  applyFilters();
}

function setScopeFilter(scopeVal) {
  selectedScope = scopeVal;
  document.querySelectorAll("[data-scope]").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-scope") === scopeVal);
  });
  applyFilters();
}

function resetFilters() {
  selectedProject = "TODOS";
  selectedCategory = "TODOS";
  selectedScope = "TODOS";
  document.querySelectorAll("[data-cat]").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-cat") === "TODOS");
  });
  document.querySelectorAll("[data-scope]").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-scope") === "TODOS");
  });
  const projSel = document.getElementById("fProyectoSelect");
  if (projSel) projSel.value = "TODOS";
  document.getElementById("fResponsable").value = "TODOS";
  document.getElementById("fSolicitante").value = "TODOS";
  document.getElementById("fPrioridad").value = "TODOS";
  document.getElementById("fEstado").value = "TODOS";
  document.getElementById("searchInput").value = "";
  applyFilters();
}

function applyFilters() {
  const resp = document.getElementById("fResponsable").value;
  const sol = document.getElementById("fSolicitante").value;
  const prio = document.getElementById("fPrioridad").value;
  const est = document.getElementById("fEstado").value;
  const q = (document.getElementById("searchInput").value || "").toLowerCase().trim();

  const hasActiveFilters = selectedProject !== "TODOS" || selectedCategory !== "TODOS" || selectedScope !== "TODOS" ||
    resp !== "TODOS" || sol !== "TODOS" || prio !== "TODOS" || est !== "TODOS" || q !== "";
  document.getElementById("resetBtn").style.display = hasActiveFilters ? "inline-flex" : "none";

  filteredData = allData.filter(r => {
    if (selectedCategory !== "TODOS" && getItemCategory(r) !== selectedCategory) return false;
    if (selectedProject !== "TODOS" && r.Proyecto !== selectedProject) return false;
    if (selectedScope !== "TODOS" && r.Es_Adicional !== selectedScope) return false;
    if (resp !== "TODOS" && r.Responsable !== resp) return false;
    if (sol !== "TODOS" && r.Solicitante !== sol) return false;
    if (prio !== "TODOS" && (r.Prioridad || "3 - Normal") !== prio) return false;
    if (est !== "TODOS" && r.Estado !== est) return false;
    if (q) {
      const text = `${r.ID_Req} ${getItemCategory(r)} ${r.Proyecto} ${r.Fase_Etapa} ${r.Solicitante} ${r.Responsable} ${r.Descripcion} ${r.Detalle} ${r.Fecha_Solicitud || ""} ${r.Comentarios_Externos || ""}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  filteredData.sort((a, b) => {
    const doneA = a.Estado === "Terminado" ? 1 : 0;
    const doneB = b.Estado === "Terminado" ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    const pa = String(a.Prioridad || "3 - Normal");
    const pb = String(b.Prioridad || "3 - Normal");
    if (pa !== pb) return pa.localeCompare(pb);
    return String(a.ID_Req).localeCompare(String(b.ID_Req));
  });

  const navBadge = document.getElementById("navCountBadge");
  if (navBadge) navBadge.textContent = String(filteredData.length);
  updateMoreFiltersButton();

  renderExecutiveKpis();
  renderProjectStrip();
  renderCharts();
  renderActiveView();
  if (activeMainTab === "cronograma") renderGantt();
}

function renderExecutiveKpis() {
  const grid = document.getElementById("kpiGrid");
  if (!grid) return;

  let totEst = 0;
  let weighted = 0;
  let activeCount = 0;
  let doneCount = 0;
  let extDelayCount = 0;
  let extDelayHours = 0;
  let maxActiveDate = "";
  let maxAnyDate = "";

  allData.forEach(r => {
    const hEst = Number(r.Horas_Est || 0);
    const pct = Number(r.Avance_Pct || 0);
    const ext = Number(r.Horas_Demora_Externa || 0);
    const fReal = String(r.Fecha_Real_Entrega || r.Fecha_Tentativa || "");
    const isDone = r.Estado === "Terminado" || pct >= 100;

    totEst += hEst;
    weighted += hEst * (pct / 100);
    if (isDone) doneCount++;
    else {
      activeCount++;
      if (fReal && fReal > maxActiveDate) maxActiveDate = fReal;
    }
    if (fReal && fReal > maxAnyDate) maxAnyDate = fReal;
    if (ext > 0) {
      extDelayCount++;
      extDelayHours += ext;
    }
  });

  const projCount = allData.filter(r => getItemCategory(r) === "Proyecto").length;
  const reqCount = allData.length - projCount;
  const globalPct = totEst > 0 ? (weighted / totEst) * 100 : 0;
  const targetDate = maxActiveDate || maxAnyDate || "—";

  grid.innerHTML = `
    <article class="kpi-card">
      <span class="kpi-label">Avance General Ponderado</span>
      <span class="kpi-value tabular" style="color:var(--accent-primary);">${globalPct.toFixed(1)}%</span>
      <span class="kpi-meta">${projCount} en proyectos · ${reqCount} requerimientos (${formatHoursLabel(totEst)})</span>
    </article>
    <article class="kpi-card">
      <span class="kpi-label">Entregables en Curso</span>
      <span class="kpi-value tabular">${activeCount}</span>
      <span class="kpi-meta" style="color:var(--tone-sage); font-weight:600;">${doneCount} terminados</span>
    </article>
    <article class="kpi-card">
      <span class="kpi-label">Con Demora Externa</span>
      <span class="kpi-value tabular" style="color:${extDelayCount > 0 ? "var(--tone-ochre)" : "var(--ink-primary)"};">${extDelayCount}</span>
      <span class="kpi-meta">${extDelayHours > 0 ? `+${extDelayHours}h acumuladas por terceros` : "Sin bloqueos externos"}</span>
    </article>
    <article class="kpi-card">
      <span class="kpi-label">Cierre Real Estimado</span>
      <span class="kpi-value tabular">${escapeHtml(targetDate)}</span>
      <span class="kpi-meta">${activeCount > 0 ? "Según cola activa y festivos" : "Todo entregado"}</span>
    </article>
  `;
}

function renderProjectStrip() {
  const strip = document.getElementById("projectsStrip");
  strip.innerHTML = "";

  const byProject = {};
  const reqItems = [];
  let globalEst = 0;
  let globalWeighted = 0;
  let globalExtra = 0;
  let globalExtDelay = 0;
  let globalEdiciones = 0;
  let globalMaxRealDate = "";

  allData.forEach(r => {
    const hEst = Number(r.Horas_Est || 0);
    const pct = Number(r.Avance_Pct || 0);
    const isExtra = r.Es_Adicional === "Sí";
    const extH = Number(r.Horas_Demora_Externa || 0);
    const eds = Number(r.Cantidad_Ediciones || 0);
    const fReal = String(r.Fecha_Real_Entrega || r.Fecha_Tentativa || "");

    globalEst += hEst;
    globalWeighted += hEst * (pct / 100);
    if (isExtra) globalExtra += hEst;
    globalExtDelay += extH;
    globalEdiciones += eds;
    if (fReal && fReal > globalMaxRealDate) globalMaxRealDate = fReal;

    if (getItemCategory(r) === "Requerimiento") {
      reqItems.push(r);
      return;
    }

    if (!byProject[r.Proyecto]) {
      byProject[r.Proyecto] = { est: 0, weighted: 0, extra: 0, extDelay: 0, ediciones: 0, count: 0, maxDate: "" };
    }
    byProject[r.Proyecto].est += hEst;
    byProject[r.Proyecto].weighted += hEst * (pct / 100);
    if (isExtra) byProject[r.Proyecto].extra += hEst;
    byProject[r.Proyecto].extDelay += extH;
    byProject[r.Proyecto].ediciones += eds;
    byProject[r.Proyecto].count += 1;
    if (fReal && fReal > byProject[r.Proyecto].maxDate) {
      byProject[r.Proyecto].maxDate = fReal;
    }
  });

  const globalPct = globalEst > 0 ? (globalWeighted / globalEst) * 100 : 0;
  const projectNames = Object.keys(byProject);

  strip.appendChild(createProjectCapsule({
    key: "TODOS",
    title: "Todos (Proyectos + Req.)",
    pct: globalPct,
    hours: globalEst,
    extraHours: globalExtra,
    extDelay: globalExtDelay,
    ediciones: globalEdiciones,
    count: allData.length,
    maxDate: globalMaxRealDate
  }));

  projectNames.forEach(name => {
    const info = byProject[name];
    const pct = info.est > 0 ? (info.weighted / info.est) * 100 : 0;
    strip.appendChild(createProjectCapsule({
      key: name,
      title: name,
      pct,
      hours: info.est,
      extraHours: info.extra,
      extDelay: info.extDelay,
      ediciones: info.ediciones,
      count: info.count,
      maxDate: info.maxDate
    }));
  });

  // Sección separada: Requerimientos Puntuales
  const reqSec = document.getElementById("reqsSummarySection");
  const reqStrip = document.getElementById("reqsStrip");
  if (reqSec && reqStrip) {
    if (!reqItems.length) {
      reqSec.style.display = "none";
      reqStrip.innerHTML = "";
    } else {
      reqSec.style.display = "block";
      reqStrip.innerHTML = "";
      let rEst = 0, rW = 0, rExtra = 0, rExt = 0, rEds = 0, rMaxDate = "";
      const byArea = {};
      reqItems.forEach(r => {
        const hEst = Number(r.Horas_Est || 0);
        const pct = Number(r.Avance_Pct || 0);
        const isExtra = r.Es_Adicional === "Sí";
        const extH = Number(r.Horas_Demora_Externa || 0);
        const eds = Number(r.Cantidad_Ediciones || 0);
        const fReal = String(r.Fecha_Real_Entrega || r.Fecha_Tentativa || "");
        const area = (r.Solicitante || "General").trim();

        rEst += hEst;
        rW += hEst * (pct / 100);
        if (isExtra) rExtra += hEst;
        rExt += extH;
        rEds += eds;
        if (fReal && fReal > rMaxDate) rMaxDate = fReal;

        if (!byArea[area]) byArea[area] = { est: 0, weighted: 0, extra: 0, extDelay: 0, ediciones: 0, count: 0, maxDate: "" };
        byArea[area].est += hEst;
        byArea[area].weighted += hEst * (pct / 100);
        if (isExtra) byArea[area].extra += hEst;
        byArea[area].extDelay += extH;
        byArea[area].ediciones += eds;
        byArea[area].count += 1;
        if (fReal && fReal > byArea[area].maxDate) byArea[area].maxDate = fReal;
      });

      const allReqCard = createProjectCapsule({
        key: "__REQ_ALL__",
        title: "Todos los Requerimientos",
        pct: rEst > 0 ? (rW / rEst) * 100 : 0,
        hours: rEst,
        extraHours: rExtra,
        extDelay: rExt,
        ediciones: rEds,
        count: reqItems.length,
        maxDate: rMaxDate
      });
      allReqCard.onclick = () => {
        selectedProject = "TODOS";
        const projSel = document.getElementById("fProyectoSelect");
        if (projSel) projSel.value = "TODOS";
        document.getElementById("fSolicitante").value = "TODOS";
        setCategoryFilter("Requerimiento");
        setMainTab("entregables");
      };
      reqStrip.appendChild(allReqCard);

      Object.keys(byArea).forEach(area => {
        const info = byArea[area];
        const card = createProjectCapsule({
          key: `__REQ_${area}`,
          title: `Solicitudes · ${area}`,
          pct: info.est > 0 ? (info.weighted / info.est) * 100 : 0,
          hours: info.est,
          extraHours: info.extra,
          extDelay: info.extDelay,
          ediciones: info.ediciones,
          count: info.count,
          maxDate: info.maxDate
        });
        card.onclick = () => {
          selectedProject = "TODOS";
          const projSel = document.getElementById("fProyectoSelect");
          if (projSel) projSel.value = "TODOS";
          document.getElementById("fSolicitante").value = area;
          setCategoryFilter("Requerimiento");
          setMainTab("entregables");
        };
        reqStrip.appendChild(card);
      });
    }
  }
}

function createProjectCapsule({ key, title, pct, hours, extraHours, extDelay, ediciones, count, maxDate }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "project-card" + (selectedProject === key ? " active" : "");
  btn.onclick = () => selectProjectCard(key);

  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference;
  const strokeColor = pct >= 100 ? "var(--tone-sage)" : pct > 0 ? "var(--tone-steel)" : "var(--tone-neutral)";
  const extraBadge = extraHours > 0 ? `<span class="pill-tag tag-extra">+${formatHoursLabel(extraHours)} alcance</span>` : "";
  const extBadge = extDelay > 0 ? `<span class="pill-tag tag-ochre">+${extDelay}h ext.</span>` : "";
  const edBadge = ediciones > 0 ? `<span class="pill-tag tag-early">${ediciones} ediciones</span>` : "";

  btn.innerHTML = `
    <div class="ring-wrap">
      <svg viewBox="0 0 46 46">
        <circle cx="23" cy="23" r="${radius}" fill="none" stroke="var(--border-strong)" stroke-width="4" />
        <circle cx="23" cy="23" r="${radius}" fill="none" stroke="${strokeColor}" stroke-width="4"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" />
      </svg>
      <span class="ring-text tabular">${Math.round(pct)}%</span>
    </div>
    <div class="project-info">
      <div class="project-name" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
      <div class="project-stats">
        <span class="tabular"><strong>${pct.toFixed(1)}%</strong></span>
        <span>·</span>
        <span class="tabular">${formatHoursLabel(hours)}</span>
        <span>·</span>
        <span>${count} proc.</span>
        ${extraBadge}
        ${extBadge}
        ${edBadge}
      </div>
      <div class="project-delivery tabular">
        <span>Entrega real est.: <strong>${escapeHtml(maxDate || "—")}</strong></span>
      </div>
    </div>
  `;
  return btn;
}

/* ==========================================================================
   GRÁFICOS ECHARTS
   ========================================================================== */
function setBarAxis(axis) {
  barAxis = axis;
  document.getElementById("btnAxisProy").classList.toggle("active", axis === "Proyecto");
  document.getElementById("btnAxisFase").classList.toggle("active", axis === "Fase_Etapa");
  renderCharts();
}

function setDonutAxis(axis) {
  donutAxis = axis;
  document.getElementById("btnDonutEmp").classList.toggle("active", axis === "Responsable");
  document.getElementById("btnDonutSol").classList.toggle("active", axis === "Solicitante");
  renderCharts();
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function initCharts() {
  chartHours = echarts.init(document.getElementById("chartHours"));
  chartDistribution = echarts.init(document.getElementById("chartDistribution"));

  chartHours.on("click", params => {
    if (barAxis === "Proyecto") selectProjectCard(params.name);
  });

  chartDistribution.on("click", params => {
    const targetId = donutAxis === "Responsable" ? "fResponsable" : "fSolicitante";
    const sel = document.getElementById(targetId);
    sel.value = sel.value === params.name ? "TODOS" : params.name;
    applyFilters();
  });

  window.addEventListener("resize", () => {
    if (chartHours) chartHours.resize();
    if (chartDistribution) chartDistribution.resize();
  });
}

function renderCharts() {
  const panel = document.getElementById("panelResumen");
  if (panel && !panel.classList.contains("active")) return;
  if (!chartHours) initCharts();

  const gridColor = getCssVar("--chart-grid");
  const labelColor = getCssVar("--chart-label");
  const inkColor = getCssVar("--chart-ink");
  const steel = getCssVar("--tone-steel");
  const terracotta = getCssVar("--tone-terracotta");
  const sage = getCssVar("--tone-sage");
  const ochre = getCssVar("--tone-ochre");

  const groupMap = {};
  filteredData.forEach(r => {
    const key = r[barAxis] || "Sin definir";
    if (!groupMap[key]) groupMap[key] = { orig: 0, extra: 0, real: 0, extDelay: 0 };
    const est = Number(r.Horas_Est || 0);
    const real = Number(r.Horas_Reales || 0);
    const ext = Number(r.Horas_Demora_Externa || 0);
    if (r.Es_Adicional === "Sí") groupMap[key].extra += est;
    else groupMap[key].orig += est;
    groupMap[key].real += real;
    groupMap[key].extDelay += ext;
  });

  const categories = Object.keys(groupMap);
  chartHours.setOption({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0, right: 0, textStyle: { color: labelColor, fontSize: 11 } },
    grid: { left: 10, right: 14, top: 36, bottom: 10, containLabel: true },
    xAxis: {
      type: "category",
      data: categories,
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: labelColor, fontSize: 11, interval: 0 }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: labelColor, fontSize: 11, formatter: "{value}h" },
      splitLine: { lineStyle: { color: gridColor, type: "dashed" } }
    },
    series: [
      {
        name: "Plan Base",
        type: "bar",
        stack: "estimado",
        barMaxWidth: 26,
        data: categories.map(k => Math.round(groupMap[k].orig * 10) / 10),
        itemStyle: { color: steel }
      },
      {
        name: "Cambios Alcance",
        type: "bar",
        stack: "estimado",
        barMaxWidth: 26,
        data: categories.map(k => Math.round(groupMap[k].extra * 10) / 10),
        itemStyle: { color: terracotta }
      },
      {
        name: "Demora Externa",
        type: "bar",
        stack: "estimado",
        barMaxWidth: 26,
        data: categories.map(k => groupMap[k].extDelay),
        itemStyle: { color: ochre, borderRadius: [4, 4, 0, 0] }
      },
      {
        name: "Horas Reales",
        type: "bar",
        barMaxWidth: 22,
        data: categories.map(k => Math.round(groupMap[k].real * 10) / 10),
        itemStyle: { color: sage, borderRadius: [4, 4, 0, 0] }
      }
    ]
  }, true);

  const distMap = {};
  let totalDistHours = 0;
  filteredData.forEach(r => {
    const key = r[donutAxis] || "Sin asignar";
    const h = Number(r.Horas_Est || 0);
    distMap[key] = (distMap[key] || 0) + h;
    totalDistHours += h;
  });

  const pieData = Object.keys(distMap).map(k => ({ name: k, value: Math.round(distMap[k] * 10) / 10 }));
  chartDistribution.setOption({
    tooltip: { trigger: "item", formatter: "{b}: <b>{c}h</b> ({d}%)" },
    legend: { bottom: 0, textStyle: { color: labelColor, fontSize: 11 } },
    color: [steel, sage, ochre, terracotta, "#848B96"],
    series: [{
      type: "pie",
      radius: ["52%", "74%"],
      center: ["50%", "43%"],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 5, borderColor: getCssVar("--bg-surface"), borderWidth: 2 },
      label: { color: inkColor, fontSize: 11, formatter: "{b} ({c}h)" },
      data: pieData
    }],
    graphic: [{
      type: "text",
      left: "center",
      top: "39%",
      style: {
        text: formatHoursLabel(totalDistHours),
        fill: inkColor,
        font: "600 18px 'JetBrains Mono', monospace",
        textAlign: "center"
      }
    }]
  }, true);
}

/* ==========================================================================
   MULTI-VISTA: LISTA ZERO-SCROLL · CRONOGRAMA GANTT · TABLERO KANBAN
   ========================================================================== */
function setViewMode(mode) {
  viewMode = mode;
  const btnList = document.getElementById("viewBtnList");
  const btnKanban = document.getElementById("viewBtnKanban");
  if (btnList) btnList.classList.toggle("active", mode === "list");
  if (btnKanban) btnKanban.classList.toggle("active", mode === "kanban");

  document.getElementById("listViewContainer").style.display = mode === "list" ? "block" : "none";
  document.getElementById("kanbanViewContainer").classList.toggle("active", mode === "kanban");
  renderActiveView();
}

function renderActiveView() {
  updateSummaryStrip();
  if (viewMode === "kanban") renderKanban();
  else renderTable();
}

function updateSummaryStrip() {
  const totEst = filteredData.reduce((s, r) => s + Number(r.Horas_Est || 0), 0);
  const totExt = filteredData.reduce((s, r) => s + Number(r.Horas_Demora_Externa || 0), 0);
  const totEds = filteredData.reduce((s, r) => s + Number(r.Cantidad_Ediciones || 0), 0);
  const totPend = filteredData.reduce((s, r) => {
    return s + Math.max(0, Number(r.Horas_Est || 0) * (1 - Number(r.Avance_Pct || 0) / 100));
  }, 0);
  const weighted = filteredData.reduce((s, r) => s + (Number(r.Horas_Est || 0) * (Number(r.Avance_Pct || 0) / 100)), 0);
  const viewPct = totEst > 0 ? (weighted / totEst) * 100 : 0;

  document.getElementById("tableSummaryStrip").innerHTML = `
    <span><strong>${filteredData.length}</strong> proc.</span>
    <span>Avance: <strong class="tabular">${viewPct.toFixed(1)}%</strong></span>
    <span>Pendiente: <strong class="tabular">${formatHoursLabel(totPend)}</strong></span>
    ${totEds > 0 ? `<span class="pill-tag tag-early tabular">${totEds} ed. acumuladas</span>` : ""}
    ${totExt > 0 ? `<span class="pill-tag tag-ochre tabular">+${totExt}h ext.</span>` : ""}
  `;
}

function getInitials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || "")
    .join("");
}

function toggleDetailExpand(idReq) {
  if (expandedDetails.has(idReq)) expandedDetails.delete(idReq);
  else expandedDetails.add(idReq);
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  const disabledAttr = isUnlocked ? "" : "disabled";

  if (!filteredData.length) {
    const emptyTr = document.createElement("tr");
    emptyTr.innerHTML = `<td colspan="6" style="padding:0; border-bottom:none;">${buildEmptyStateHtml()}</td>`;
    tbody.appendChild(emptyTr);
    return;
  }

  filteredData.forEach(r => {
    const tr = document.createElement("tr");
    if (r.Es_Adicional === "Sí") tr.classList.add("is-extra");
    if (shiftedIds.has(r.ID_Req)) tr.classList.add("row-shifted");

    const idSafe = escapeHtml(r.ID_Req);
    const idArg = escapeJsArg(r.ID_Req);
    const statusClass = "status-" + String(r.Estado || "Pendiente").replace(/[^a-zA-Z0-9]/g, "");
    const prioVal = r.Prioridad || "3 - Normal";
    const prioDigit = /^[1-4]$/.test(prioVal.charAt(0)) ? prioVal.charAt(0) : "3";
    const prioClass = "prio-" + prioDigit;
    const extraTag = r.Es_Adicional === "Sí"
      ? `<span class="pill-tag tag-extra" style="margin-left:6px;">+${formatHoursLabel(r.Horas_Est)} alcance</span>`
      : "";

    const cantEd = Number(r.Cantidad_Ediciones || 0);
    const minsTotal = Math.round(Number(r.Horas_Reales || 0) * 60);
    const microBadgeHtml = cantEd > 0
      ? `<div class="micro-badge-row">
           <span class="pill-tag tag-early tabular">${cantEd} ediciones acumuladas</span>
           <span class="pill-tag tag-steel tabular">Tiempo invertido: ${formatHoursLabel(r.Horas_Reales)} (${minsTotal} min)</span>
         </div>`
      : "";

    const solDate = escapeHtml(r.Fecha_Solicitud || r.Fecha_Registro || "—");
    const daysSinceSol = Number(r.Dias_Desde_Solicitud || 0);
    const solAgeBadge = daysSinceSol > 0
      ? `<span class="pill-tag tag-neutral tabular" title="Días hábiles transcurridos desde que se pidió (${solDate})">${daysSinceSol}d desde solicitud</span>`
      : "";

    const detalleTxt = (r.Detalle || "").trim();
    const isLong = detalleTxt.length > 110;
    const isExpanded = expandedDetails.has(r.ID_Req);
    const detailHtml = detalleTxt
      ? `<div class="proc-sub ${isLong && !isExpanded ? "clamped" : ""}">${escapeHtml(detalleTxt)}</div>
         ${isLong ? `<button type="button" class="expand-link" onclick="toggleDetailExpand('${idArg}')">${isExpanded ? "Ver menos" : "Ver detalle completo"}</button>` : ""}`
      : "";

    const extHours = Number(r.Horas_Demora_Externa || 0);
    const extComment = (r.Comentarios_Externos || "").trim();
    const commentBlock = (extComment || extHours > 0)
      ? `<div class="ext-comment-box">
           <span class="ext-comment-label">${extHours > 0 ? `+${extHours}h demora externa:` : "Nota:"}</span>
           ${extComment ? escapeHtml(extComment) : "Tiempo adicional registrado por factor externo."}
         </div>`
      : "";

    const shift = Number(r.Desplazamiento_Dias || 0);
    const fTent = escapeHtml(r.Fecha_Tentativa || "—");
    const fReal = escapeHtml(r.Fecha_Real_Entrega || r.Fecha_Tentativa || "—");
    const overrun = Math.round((Number(r.Horas_Reales || 0) - Number(r.Horas_Est || 0)) * 10) / 10;

    let metaLines = "";
    if (r.Estado === "Terminado" || Number(r.Avance_Pct) >= 100) {
      metaLines = `<span style="color:var(--tone-sage);">Entregado</span>`;
    } else {
      if (extHours > 0) {
        metaLines += `<span><span class="pill-tag tag-ochre tabular">+${extHours}h ext.</span> Ing: ${fTent}</span>`;
      } else {
        const effH = simHoursPerDay * simCapacityMult;
        const hRest = Math.max(0, Number(r.Horas_Est || 0) * (1 - Number(r.Avance_Pct || 0) / 100));
        metaLines += `<span>${Math.max(1, Math.ceil(hRest / effH))}d háb. rest.</span>`;
      }
      if (shift > 0) metaLines += `<span><span class="pill-tag tag-extra tabular">+${shift}d cola</span></span>`;
      else if (shift < 0) metaLines += `<span><span class="pill-tag tag-early tabular">${shift}d cola</span></span>`;
    }

    const overrunHtml = overrun > 0
      ? `<span class="pill-tag tag-extra tabular" title="Horas reales superan estimadas">+${formatHoursLabel(overrun)}</span>`
      : "";

    const respFirst = escapeHtml(String(r.Responsable || "Sin asignar").split(" ")[0]);
    const respFull = escapeHtml(r.Responsable || "Sin asignar");
    const solFull = escapeHtml(r.Solicitante || "");

    const catName = getItemCategory(r);
    const catBadge = catName === "Requerimiento"
      ? `<span class="pill-tag tag-cat-req">Requerimiento</span>`
      : `<span class="pill-tag tag-cat-proj">Proyecto</span>`;

    tr.innerHTML = `
      <td data-label="Proyecto y Solicitud">
        <div class="id-cat-row">
          <span class="id-badge tabular">${idSafe}</span>
          ${catBadge}
        </div>
        <div class="proj-chip">${escapeHtml(r.Proyecto)} · <span style="font-weight:400; color:var(--ink-secondary);">${escapeHtml(r.Fase_Etapa)}</span></div>
        <div class="person-line" title="Responsable: ${respFull} | Solicita: ${solFull}">
          <span class="avatar-mini">${escapeHtml(getInitials(r.Responsable))}</span>
          <span>${respFirst} · <em>${solFull}</em></span>
        </div>
        <div class="req-date-line tabular">
          <span>Pedido: <strong>${solDate}</strong></span>
          ${solAgeBadge}
        </div>
      </td>
      <td data-label="Procedimiento">
        <div class="proc-title">${escapeHtml(r.Descripcion)}${extraTag}</div>
        ${microBadgeHtml}
        ${detailHtml}
        ${commentBlock}
      </td>
      <td data-label="Prioridad y Estado">
        <div class="stack-pills">
          <select class="pill-select ${prioClass}" ${disabledAttr} aria-label="Prioridad ${idSafe}"
            onchange="handleInlinePrioridadChange('${idArg}', this.value)">
            <option value="1 - Urgente" ${prioVal === "1 - Urgente" ? "selected" : ""}>1 - Urgente</option>
            <option value="2 - Alta" ${prioVal === "2 - Alta" ? "selected" : ""}>2 - Alta</option>
            <option value="3 - Normal" ${prioVal === "3 - Normal" ? "selected" : ""}>3 - Normal</option>
            <option value="4 - Baja" ${prioVal === "4 - Baja" ? "selected" : ""}>4 - Baja</option>
          </select>
          <select class="pill-select ${statusClass}" ${disabledAttr} aria-label="Estado ${idSafe}"
            onchange="handleInlineEstadoChange('${idArg}', this.value)">
            <option value="Pendiente" ${r.Estado === "Pendiente" ? "selected" : ""}>Pendiente</option>
            <option value="En Desarrollo" ${r.Estado === "En Desarrollo" ? "selected" : ""}>En Desarrollo</option>
            <option value="Pausado" ${r.Estado === "Pausado" ? "selected" : ""}>Pausado</option>
            <option value="Terminado" ${r.Estado === "Terminado" ? "selected" : ""}>Terminado</option>
          </select>
        </div>
      </td>
      <td data-label="Avance %">
        <div class="progress-stack">
          <div class="progress-top-row">
            <input type="range" class="progress-slider" min="0" max="100" step="5" ${disabledAttr}
              value="${Number(r.Avance_Pct || 0)}"
              style="--slider-pct:${Number(r.Avance_Pct || 0)}%; --slider-color:${getSliderColor(r.Avance_Pct)};"
              oninput="previewSliderPct('${idArg}', this.value, this)"
              onchange="handleInlineAvanceChange('${idArg}', this.value)" />
            <span class="pct-box">
              <input type="number" id="pct-num-${idSafe}" min="0" max="100" step="1" ${disabledAttr}
                value="${Math.round(Number(r.Avance_Pct || 0))}"
                onchange="handleInlineAvanceChange('${idArg}', this.value)" />%
            </span>
          </div>
          <div class="quick-step-row">
            <button type="button" class="step-chip" onclick="stepProgress('${idArg}', 10)">+10%</button>
            <button type="button" class="step-chip" onclick="stepProgress('${idArg}', 25)">+25%</button>
            <button type="button" class="step-chip" onclick="handleInlineAvanceChange('${idArg}', 100)">100%</button>
          </div>
        </div>
      </td>
      <td data-label="Entrega Real y Horas">
        <span class="delivery-date tabular">${fReal}</span>
        <div class="delivery-meta">${metaLines}</div>
        <div class="hours-line tabular">
          <strong>${formatHoursLabel(r.Horas_Reales)}</strong> / ${formatHoursLabel(r.Horas_Est)} ${overrunHtml}
        </div>
      </td>
      <td data-label="Acciones" class="actions-col-cell">
        <div class="row-actions-col">
          <button class="icon-btn micro-btn" onclick="openMicroModal('${idArg}')">+ Ediciones</button>
          <button class="icon-btn ext-btn" onclick="openDelayModal('${idArg}')">+ Demora</button>
          <button class="icon-btn" onclick="openEditDrawer('${idArg}')">Editar</button>
          <button class="icon-btn danger" onclick="deleteProc('${idArg}')">Eliminar</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function stepProgress(idReq, delta) {
  if (!isUnlocked) return;
  const item = allData.find(r => r.ID_Req === idReq);
  if (!item) return;
  const next = Math.min(100, Math.max(0, Number(item.Avance_Pct || 0) + delta));
  handleInlineAvanceChange(idReq, next);
}

/* ==========================================================================
   VISTA GANTT
   ========================================================================== */
function renderGantt() {
  const container = document.getElementById("ganttViewContainer");
  if (!filteredData.length) {
    container.innerHTML = buildEmptyStateHtml();
    return;
  }

  const startDates = filteredData.map(r => parseIsoDate(r.Fecha_Solicitud || r.Fecha_Inicio_Calc || r.Fecha_Registro));
  const endDates = filteredData.map(r => parseIsoDate(r.Fecha_Real_Entrega || r.Fecha_Tentativa));
  let minD = new Date(Math.min(...startDates.map(d => d.getTime())));
  let maxD = new Date(Math.max(...endDates.map(d => d.getTime())));
  maxD = shiftDays(maxD, 2);

  const minAllowed = shiftDays(maxD, -65);
  if (minD.getTime() < minAllowed.getTime()) minD = minAllowed;

  const daysList = [];
  let curr = new Date(minD.getTime());
  let safety = 0;
  while (curr.getTime() <= maxD.getTime() && safety < 66) {
    daysList.push(new Date(curr.getTime()));
    curr.setDate(curr.getDate() + 1);
    safety++;
  }

  const dayNames = ["D", "L", "M", "X", "J", "V", "S"];
  const headCols = daysList.map(d => {
    const hol = getHolidayName(d);
    const isWknd = d.getDay() === 0 || d.getDay() === 6;
    const cls = hol ? "gantt-day-col is-holiday" : (isWknd ? "gantt-day-col is-weekend" : "gantt-day-col");
    const title = hol ? `Festivo Colombia: ${hol}` : formatIsoDate(d);
    return `<th class="${cls}" title="${title}">
      <div>${dayNames[d.getDay()]}</div>
      <div class="tabular">${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}</div>
    </th>`;
  }).join("");

  const bodyRows = filteredData.map(r => {
    const solD = parseIsoDate(r.Fecha_Solicitud || r.Fecha_Registro);
    const sD = parseIsoDate(r.Fecha_Inicio_Calc || r.Fecha_Registro);
    const tD = parseIsoDate(r.Fecha_Tentativa);
    const rD = parseIsoDate(r.Fecha_Real_Entrega || r.Fecha_Tentativa);
    const isDone = r.Estado === "Terminado" || Number(r.Avance_Pct) >= 100;

    const cells = daysList.map(d => {
      const hol = getHolidayName(d);
      const isWknd = d.getDay() === 0 || d.getDay() === 6;
      const cls = hol ? "gantt-day-col is-holiday" : (isWknd ? "gantt-day-col is-weekend" : "gantt-day-col");

      if (isWknd || hol) {
        return `<td class="${cls}" title="${hol || "Fin de semana"}"></td>`;
      }
      const t = d.getTime();
      if (t >= solD.getTime() && t < sD.getTime()) {
        const label = t === solD.getTime() ? "SOL" : "···";
        return `<td class="${cls}"><div class="gantt-bar-queue" title="En cola desde solicitud (${r.Fecha_Solicitud})">${label}</div></td>`;
      }
      if (t >= sD.getTime() && t <= tD.getTime()) {
        const barCls = isDone ? "gantt-bar-done" : "gantt-bar-ing";
        return `<td class="${cls}"><div class="${barCls}" title="Ejecución Ingeniería">${r.Avance_Pct}%</div></td>`;
      }
      if (t > tD.getTime() && t <= rD.getTime()) {
        return `<td class="${cls}"><div class="gantt-bar-ext" title="Demora externa (+${r.Horas_Demora_Externa}h)">EXT</div></td>`;
      }
      return `<td class="${cls}"></td>`;
    }).join("");

    return `<tr>
      <td class="task-col">
        <div class="id-badge tabular">${escapeHtml(r.ID_Req)} · ${escapeHtml(r.Prioridad)}</div>
        <div class="proc-title" style="font-size:0.8rem;">${escapeHtml(r.Descripcion)}</div>
        <div class="proc-sub">Pedido: ${escapeHtml(r.Fecha_Solicitud)} · Entrega: <strong>${escapeHtml(r.Fecha_Real_Entrega)}</strong></div>
      </td>
      ${cells}
    </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="gantt-legend">
      <span class="legend-item"><span class="legend-swatch" style="background:var(--queue-bg); border:1px dashed var(--border-strong);"></span> Espera en cola desde solicitud (SOL)</span>
      <span class="legend-item"><span class="legend-swatch" style="background:var(--tone-steel);"></span> Ejecución Ingeniería</span>
      <span class="legend-item"><span class="legend-swatch" style="background:var(--tone-ochre);"></span> Demora Externa</span>
      <span class="legend-item"><span class="legend-swatch" style="background:var(--tone-sage);"></span> Terminado</span>
      <span class="legend-item"><span class="legend-swatch" style="background:var(--holiday-bg); border:1px solid var(--tone-terracotta);"></span> Festivo Colombia / Fin de semana</span>
    </div>
    <div class="gantt-grid-wrap">
      <table class="gantt-table">
        <thead>
          <tr>
            <th class="task-col">Procedimiento</th>
            ${headCols}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

/* ==========================================================================
   VISTA TABLERO KANBAN
   ========================================================================== */
function renderKanban() {
  const container = document.getElementById("kanbanViewContainer");
  const columns = ["Pendiente", "En Desarrollo", "Pausado", "Terminado"];

  container.innerHTML = columns.map(status => {
    const items = filteredData.filter(r => r.Estado === status);
    const cardsHtml = items.map(r => {
      const ext = Number(r.Horas_Demora_Externa || 0);
      const eds = Number(r.Cantidad_Ediciones || 0);
      const idSafe = escapeHtml(r.ID_Req);
      const idArg = escapeJsArg(r.ID_Req);
      const prioStr = String(r.Prioridad || "3 - Normal");
      const prioDigit = /^[1-4]$/.test(prioStr.charAt(0)) ? prioStr.charAt(0) : "3";
      const actionButtons = isUnlocked
        ? `<div style="display:flex; gap:6px; margin-top:4px;">
             <button class="icon-btn micro-btn" style="flex:1;" onclick="openMicroModal('${idArg}')">+ Ediciones</button>
             <button class="icon-btn ext-btn" style="flex:1;" onclick="openDelayModal('${idArg}')">+ Demora</button>
             <button class="icon-btn" style="flex:1;" onclick="openEditDrawer('${idArg}')">Editar</button>
           </div>`
        : "";

      const catName = getItemCategory(r);
      const catBadge = catName === "Requerimiento"
        ? `<span class="pill-tag tag-cat-req">Req.</span>`
        : `<span class="pill-tag tag-cat-proj">Proy.</span>`;

      return `<div class="kanban-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
          <span class="id-cat-row"><span class="id-badge tabular">${idSafe}</span>${catBadge}</span>
          <span class="pill-tag prio-${prioDigit}">${escapeHtml(prioStr)}</span>
        </div>
        <div class="proc-title" style="font-size:0.82rem;">${escapeHtml(r.Descripcion)}</div>
        <div class="proc-sub">${escapeHtml(r.Proyecto)} · ${escapeHtml(r.Responsable)}</div>
        <div class="proc-sub tabular">Pedido: <strong>${escapeHtml(r.Fecha_Solicitud || r.Fecha_Registro)}</strong></div>
        ${eds > 0 ? `<span class="pill-tag tag-early tabular">${eds} ed. · ${formatHoursLabel(r.Horas_Reales)}</span>` : ""}
        ${ext > 0 ? `<span class="pill-tag tag-ochre tabular">+${ext}h demora externa</span>` : ""}
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; font-size:0.74rem;">
          <span class="tabular">Entrega: <strong>${escapeHtml(r.Fecha_Real_Entrega)}</strong></span>
          <span class="tabular"><strong>${Number(r.Avance_Pct || 0)}%</strong></span>
        </div>
        ${actionButtons}
      </div>`;
    }).join("");

    return `<div class="kanban-col">
      <div class="kanban-col-head">
        <span>${status}</span>
        <span class="pill-tag tag-steel tabular">${items.length}</span>
      </div>
      ${cardsHtml || `<div class="proc-sub" style="text-align:center; padding:18px 0;">Sin tareas</div>`}
    </div>`;
  }).join("");
}

function previewSliderPct(idReq, val, sliderEl) {
  const box = document.getElementById(`pct-num-${idReq}`);
  if (box) box.value = val;
  if (sliderEl) {
    sliderEl.style.setProperty("--slider-pct", `${Number(val || 0)}%`);
    sliderEl.style.setProperty("--slider-color", getSliderColor(val));
  }
}

function snapshotDates() {
  const map = {};
  allData.forEach(r => { map[r.ID_Req] = `${r.Fecha_Tentativa}|${r.Fecha_Real_Entrega}`; });
  return map;
}

function detectShiftedRows(prevMap) {
  shiftedIds = new Set();
  allData.forEach(r => {
    const curr = `${r.Fecha_Tentativa}|${r.Fecha_Real_Entrega}`;
    if (prevMap[r.ID_Req] && prevMap[r.ID_Req] !== curr) {
      shiftedIds.add(r.ID_Req);
    }
  });
  setTimeout(() => { shiftedIds.clear(); }, 1500);
}

/* ==========================================================================
   MODAL RÁPIDO: SUMAR MICRO-EDICIONES Y MINUTOS
   ========================================================================== */
function openMicroModal(idReq) {
  if (!isUnlocked) return toggleAdminLock();
  const item = allData.find(r => r.ID_Req === idReq);
  if (!item) return;
  document.getElementById("microIdReq").value = idReq;
  document.getElementById("microModalTitle").textContent = `${idReq} · Sumar Ediciones y Tiempo`;
  document.getElementById("microCountInput").value = 1;
  document.getElementById("microMinutesInput").value = 15;
  document.getElementById("microNoteInput").value = "";
  updateMicroHoursPreview();
  document.getElementById("microModal").classList.add("open");
}

function closeMicroModal() {
  document.getElementById("microModal").classList.remove("open");
}

function setMicroPreset(count, mins) {
  document.getElementById("microCountInput").value = count;
  document.getElementById("microMinutesInput").value = mins;
  updateMicroHoursPreview();
}

function updateMicroHoursPreview() {
  const c = Number(document.getElementById("microCountInput").value || 0);
  const m = Number(document.getElementById("microMinutesInput").value || 0);
  const hrs = (m / 60).toFixed(2);
  document.getElementById("microPreviewHint").innerHTML =
    `Se sumará <strong>+${c} edición(es)</strong> y <strong>+${hrs} h</strong> (${m} min) al acumulado real.`;
}

async function submitMicroModal(e) {
  e.preventDefault();
  const idReq = document.getElementById("microIdReq").value;
  const cant = Math.max(0, parseInt(document.getElementById("microCountInput").value || "0", 10));
  const mins = Math.max(0, Number(document.getElementById("microMinutesInput").value || 0));
  const nota = (document.getElementById("microNoteInput").value || "").trim();

  const item = allData.find(r => r.ID_Req === idReq);
  if (!item) return;

  const prevDates = snapshotDates();
  const hrsAdd = Math.round((mins / 60) * 100) / 100;
  item.Cantidad_Ediciones = Number(item.Cantidad_Ediciones || 0) + cant;
  item.Horas_Reales = Math.round((Number(item.Horas_Reales || 0) + hrsAdd) * 100) / 100;
  if (Number(item.Horas_Est || 0) < item.Horas_Reales) {
    item.Horas_Est = item.Horas_Reales;
  }

  computeLocalCascade(allData);
  detectShiftedRows(prevDates);
  closeMicroModal();
  applyFilters();

  if (!isBackendConnected) {
    saveLocalBackup();
    showToast(`${idReq}: +${cant} ed. (+${mins} min) sumadas en navegador`, true);
    return;
  }

  try {
    const res = await fetch(`/api/requerimientos/${idReq}/ediciones`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({
        cantidad_sumar: cant,
        minutos_sumar: mins,
        nota
      })
    });
    if (res.status === 401) return handleUnauthorized();
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || "Error al sumar ediciones", true);
      await loadData(false);
      return;
    }
    allData = data.requerimientos || allData;
    computeLocalCascade(allData);
    saveLocalBackup();
    detectShiftedRows(prevDates);
    applyFilters();
    showToast(`${idReq}: total ${data.Cantidad_Ediciones} ediciones (${formatHoursLabel(data.Horas_Reales)})`);
  } catch (err) {
    showToast("Error de conexión al guardar ediciones", true);
  }
}

/* ==========================================================================
   MODAL RÁPIDO: DEMORA POR MOTIVOS EXTERNOS Y COMENTARIOS
   ========================================================================== */
function openDelayModal(idReq) {
  if (!isUnlocked) return toggleAdminLock();
  const item = allData.find(r => r.ID_Req === idReq);
  if (!item) return;
  document.getElementById("delayIdReq").value = idReq;
  document.getElementById("delayModalTitle").textContent = `${idReq} · Demora Externa y Comentarios`;
  document.getElementById("delayHoursInput").value = Number(item.Horas_Demora_Externa || 0);
  document.getElementById("delayCommentInput").value = item.Comentarios_Externos || "";
  document.getElementById("delayModal").classList.add("open");
}

function closeDelayModal() {
  document.getElementById("delayModal").classList.remove("open");
}

function setDelayHours(h) {
  document.getElementById("delayHoursInput").value = h;
}

function addDelayHours(delta) {
  const inp = document.getElementById("delayHoursInput");
  inp.value = Math.max(0, Number(inp.value || 0) + delta);
}

async function submitDelayModal(e) {
  e.preventDefault();
  const idReq = document.getElementById("delayIdReq").value;
  const horasExt = Math.max(0, Number(document.getElementById("delayHoursInput").value || 0));
  const commentExt = (document.getElementById("delayCommentInput").value || "").trim();

  const item = allData.find(r => r.ID_Req === idReq);
  if (!item) return;

  const prevDates = snapshotDates();
  item.Horas_Demora_Externa = horasExt;
  item.Comentarios_Externos = commentExt;
  computeLocalCascade(allData);
  detectShiftedRows(prevDates);
  closeDelayModal();
  applyFilters();

  if (!isBackendConnected) {
    saveLocalBackup();
    showToast(`${idReq}: demora externa (+${horasExt}h) guardada en navegador`, true);
    return;
  }

  try {
    const res = await fetch(`/api/requerimientos/${idReq}/demora`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({
        Horas_Demora_Externa: horasExt,
        Comentarios_Externos: commentExt
      })
    });
    if (res.status === 401) return handleUnauthorized();
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || "Error al guardar demora externa", true);
      await loadData(false);
      return;
    }
    allData = data.requerimientos || allData;
    computeLocalCascade(allData);
    saveLocalBackup();
    detectShiftedRows(prevDates);
    applyFilters();
    showToast(`${idReq}: nueva fecha real de entrega ${data.Fecha_Real_Entrega}`);
  } catch (err) {
    showToast("Error de conexión al guardar en Excel", true);
  }
}

/* ==========================================================================
   EDICIONES EN LÍNEA (PRIORIDAD, ESTADO, % AVANCE)
   ========================================================================== */
async function handleInlinePrioridadChange(idReq, nuevaPrioridad) {
  if (!isUnlocked) return toggleAdminLock();
  const item = allData.find(r => r.ID_Req === idReq);
  if (!item) return;

  const prevDates = snapshotDates();
  item.Prioridad = nuevaPrioridad;
  computeLocalCascade(allData);
  detectShiftedRows(prevDates);
  applyFilters();

  if (!isBackendConnected) {
    saveLocalBackup();
    showToast(`${idReq} -> ${nuevaPrioridad}: guardado en navegador`, true);
    return;
  }

  try {
    const res = await fetch(`/api/requerimientos/${idReq}/prioridad`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ Prioridad: nuevaPrioridad })
    });
    if (res.status === 401) return handleUnauthorized();
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || "No se pudo actualizar en Excel", true);
      await loadData(false);
      return;
    }
    allData = data.requerimientos || allData;
    computeLocalCascade(allData);
    saveLocalBackup();
    detectShiftedRows(prevDates);
    applyFilters();
    showToast(`${idReq} -> ${nuevaPrioridad}. Fechas actualizadas`);
  } catch (e) {
    showToast("Error de conexión al guardar prioridad", true);
  }
}

async function handleInlineEstadoChange(idReq, nuevoEstado) {
  if (!isUnlocked) return toggleAdminLock();
  const item = allData.find(r => r.ID_Req === idReq);
  if (!item) return;

  const prevDates = snapshotDates();
  item.Estado = nuevoEstado;
  item.Avance_Pct = computePctFromEstado(nuevoEstado, item.Avance_Pct);
  computeLocalCascade(allData);
  detectShiftedRows(prevDates);
  applyFilters();

  await persistInlineProgress(idReq, { Estado: nuevoEstado }, prevDates);
}

async function handleInlineAvanceChange(idReq, rawVal) {
  if (!isUnlocked) return toggleAdminLock();
  const item = allData.find(r => r.ID_Req === idReq);
  if (!item) return;

  const prevDates = snapshotDates();
  const nuevoPct = Math.max(0, Math.min(100, Number(rawVal || 0)));
  item.Avance_Pct = nuevoPct;
  item.Estado = computeEstadoFromPct(nuevoPct, item.Estado);
  computeLocalCascade(allData);
  detectShiftedRows(prevDates);
  applyFilters();

  await persistInlineProgress(idReq, { Avance_Pct: nuevoPct }, prevDates);
}

async function persistInlineProgress(idReq, patchPayload, prevDates) {
  if (!isBackendConnected) {
    saveLocalBackup();
    showToast(`${idReq}: actualizado en navegador`, true);
    return;
  }
  try {
    const res = await fetch(`/api/requerimientos/${idReq}/progreso`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(patchPayload)
    });
    if (res.status === 401) return handleUnauthorized();
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || "No se pudo guardar en Excel", true);
      await loadData(false);
      return;
    }
    if (data.requerimientos) {
      allData = data.requerimientos;
      computeLocalCascade(allData);
      saveLocalBackup();
      detectShiftedRows(prevDates);
      applyFilters();
    }
    showToast(`${idReq} actualizado (${data.Estado} · ${data.Avance_Pct}%)`);
  } catch (e) {
    showToast("Error de conexión al guardar en Excel", true);
  }
}

/* ==========================================================================
   DRAWER CREAR / EDITAR COMPLETO
   ========================================================================== */
function onDrawerCategoriaChange() {
  const cat = document.getElementById("inpCategoria").value;
  const inpProy = document.getElementById("inpProyecto");
  const inpFase = document.getElementById("inpFase");
  const lblProy = document.getElementById("lblProyecto");
  const lblFase = document.getElementById("lblFase");

  if (cat === "Requerimiento") {
    inpProy.required = false;
    inpFase.required = false;
    if (lblProy) lblProy.textContent = "Proyecto relacionado (Opcional)";
    if (lblFase) lblFase.textContent = "Área o tema (Opcional)";
    inpProy.placeholder = "Opcional · Si queda vacío: Requerimientos Generales";
    inpFase.placeholder = "Opcional · Ej. Solicitud puntual";
  } else {
    inpProy.required = true;
    inpFase.required = true;
    if (lblProy) lblProy.textContent = "Proyecto *";
    if (lblFase) lblFase.textContent = "Fase / Etapa *";
    inpProy.placeholder = "Ej. T-LAB";
    inpFase.placeholder = "Ej. Etapa 1 / Soporte";
  }
}

function onDrawerEstadoChange() {
  const est = document.getElementById("inpEstado").value;
  const currentPct = document.getElementById("inpAvance").value;
  document.getElementById("inpAvance").value = computePctFromEstado(est, currentPct);
}

function onDrawerAvanceChange() {
  const pct = document.getElementById("inpAvance").value;
  const currentEst = document.getElementById("inpEstado").value;
  document.getElementById("inpEstado").value = computeEstadoFromPct(pct, currentEst);
}

function todayIsoString() {
  const now = new Date();
  return formatIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

function openDrawer(req = null) {
  if (!isUnlocked) {
    showToast("Activa el modo edición para crear o modificar procedimientos", true);
    return toggleAdminLock();
  }
  const advDetails = document.getElementById("drawerAdvancedDetails");
  document.getElementById("drawerOverlay").classList.add("open");
  if (req) {
    document.getElementById("drawerTitle").textContent = `Editar ${req.ID_Req}`;
    document.getElementById("editIdReq").value = req.ID_Req;
    document.getElementById("inpCategoria").value = getItemCategory(req);
    onDrawerCategoriaChange();
    document.getElementById("inpProyecto").value = req.Proyecto;
    document.getElementById("inpFase").value = req.Fase_Etapa;
    document.getElementById("inpSolicitante").value = req.Solicitante;
    document.getElementById("inpResponsable").value = req.Responsable;
    document.getElementById("inpFechaSolicitud").value = (req.Fecha_Solicitud || req.Fecha_Registro || todayIsoString()).slice(0, 10);
    document.getElementById("inpFechaRegistro").value = (req.Fecha_Registro || todayIsoString()).slice(0, 10);
    document.getElementById("inpDescripcion").value = req.Descripcion;
    document.getElementById("inpDetalle").value = req.Detalle || "";
    document.getElementById("inpCantEdiciones").value = Number(req.Cantidad_Ediciones || 0);
    document.getElementById("inpPrioridad").value = req.Prioridad || "3 - Normal";
    document.getElementById("inpAdicional").value = req.Es_Adicional;
    document.getElementById("inpHorasEst").value = req.Horas_Est;
    document.getElementById("inpHorasReales").value = req.Horas_Reales;
    document.getElementById("inpEstado").value = req.Estado;
    document.getElementById("inpAvance").value = req.Avance_Pct;
    document.getElementById("inpHorasExt").value = Number(req.Horas_Demora_Externa || 0);
    document.getElementById("inpComentariosExt").value = req.Comentarios_Externos || "";
    document.getElementById("inpTipo").value = req.Tipo;
    document.getElementById("inpAprobado").value = req.Aprobado || "Aprobado";
    if (advDetails) {
      advDetails.open = Boolean(Number(req.Horas_Demora_Externa || 0) > 0 || (req.Comentarios_Externos || "").trim() || Number(req.Cantidad_Ediciones || 0) > 0);
    }
  } else {
    const today = todayIsoString();
    document.getElementById("drawerTitle").textContent = "Nuevo Procedimiento";
    document.getElementById("editIdReq").value = "";
    document.getElementById("procForm").reset();
    document.getElementById("inpCategoria").value = "Proyecto";
    onDrawerCategoriaChange();
    document.getElementById("inpFechaSolicitud").value = today;
    document.getElementById("inpFechaRegistro").value = today;
    document.getElementById("inpCantEdiciones").value = 0;
    document.getElementById("inpPrioridad").value = "3 - Normal";
    document.getElementById("inpEstado").value = "Pendiente";
    document.getElementById("inpAvance").value = 0;
    document.getElementById("inpHorasExt").value = 0;
    if (advDetails) advDetails.open = false;
  }
}

function openEditDrawer(idReq) {
  const found = allData.find(r => r.ID_Req === idReq);
  if (found) openDrawer(found);
}

function closeDrawer() {
  document.getElementById("drawerOverlay").classList.remove("open");
}

async function submitDrawerForm(e) {
  e.preventDefault();
  const editId = document.getElementById("editIdReq").value;
  const today = todayIsoString();
  const fechaReg = document.getElementById("inpFechaRegistro").value || today;
  const fechaSol = document.getElementById("inpFechaSolicitud").value || fechaReg;

  const categoria = document.getElementById("inpCategoria").value || "Proyecto";
  const rawProy = (document.getElementById("inpProyecto").value || "").trim();
  const rawFase = (document.getElementById("inpFase").value || "").trim();

  const payload = {
    Categoria: categoria,
    Proyecto: rawProy || (categoria === "Requerimiento" ? "Requerimientos Generales" : ""),
    Fase_Etapa: rawFase || (categoria === "Requerimiento" ? "Solicitud puntual" : "General"),
    Solicitante: document.getElementById("inpSolicitante").value,
    Responsable: document.getElementById("inpResponsable").value,
    Fecha_Solicitud: fechaSol,
    Fecha_Registro: fechaReg,
    Descripcion: document.getElementById("inpDescripcion").value,
    Detalle: document.getElementById("inpDetalle").value,
    Cantidad_Ediciones: Number(document.getElementById("inpCantEdiciones").value || 0),
    Prioridad: document.getElementById("inpPrioridad").value,
    Es_Adicional: document.getElementById("inpAdicional").value,
    Horas_Est: Number(document.getElementById("inpHorasEst").value || 0),
    Horas_Reales: Number(document.getElementById("inpHorasReales").value || 0),
    Estado: document.getElementById("inpEstado").value,
    Avance_Pct: Number(document.getElementById("inpAvance").value || 0),
    Horas_Demora_Externa: Number(document.getElementById("inpHorasExt").value || 0),
    Comentarios_Externos: document.getElementById("inpComentariosExt").value,
    Tipo: document.getElementById("inpTipo").value,
    Aprobado: document.getElementById("inpAprobado").value
  };

  const prevDates = snapshotDates();

  if (!isBackendConnected) {
    if (editId) {
      const idx = allData.findIndex(r => r.ID_Req === editId);
      if (idx > -1) allData[idx] = { ...allData[idx], ...payload };
    } else {
      const nextNum = allData.length + 1;
      allData.push({ ID_Req: `ING-${String(nextNum).padStart(3, "0")}`, ...payload });
    }
    computeLocalCascade(allData);
    detectShiftedRows(prevDates);
    closeDrawer();
    populateDropdowns();
    applyFilters();
    saveLocalBackup();
    showToast("Procedimiento guardado en este navegador", true);
    return;
  }

  const url = editId ? `/api/requerimientos/${editId}` : "/api/requerimientos";
  const method = editId ? "PUT" : "POST";
  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  if (res.status === 401) {
    closeDrawer();
    return handleUnauthorized();
  }
  const data = await res.json();
  if (res.ok) {
    closeDrawer();
    await loadData(false);
    detectShiftedRows(prevDates);
    applyFilters();
    showToast(`${data.ID_Req || editId} guardado (Pedido: ${fechaSol})`);
  } else {
    showToast(data.detail || "Error al guardar en Excel", true);
  }
}

async function deleteProc(idReq) {
  if (!isUnlocked) return toggleAdminLock();
  if (!confirm(`¿Eliminar ${idReq} del archivo Excel?`)) return;
  const prevDates = snapshotDates();
  if (!isBackendConnected) {
    allData = allData.filter(r => r.ID_Req !== idReq);
    computeLocalCascade(allData);
    saveLocalBackup();
    detectShiftedRows(prevDates);
    populateDropdowns();
    applyFilters();
    showToast(`${idReq} eliminado del navegador`, true);
    return;
  }
  const res = await fetch(`/api/requerimientos/${idReq}`, {
    method: "DELETE",
    headers: authHeaders()
  });
  if (res.status === 401) return handleUnauthorized();
  const data = await res.json();
  if (res.ok) {
    await loadData(false);
    detectShiftedRows(prevDates);
    applyFilters();
    showToast(`${idReq} eliminado y fechas recalculadas`);
  } else {
    showToast(data.detail || "No se pudo eliminar", true);
  }
}

document.addEventListener("click", e => {
  const wrap = document.querySelector(".more-menu-wrap");
  if (wrap && !wrap.contains(e.target)) closeMoreMenu();
});

window.addEventListener("keydown", e => {
  if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    if (activeMainTab !== "entregables") setMainTab("entregables");
    document.getElementById("searchInput").focus();
  } else if (e.key === "Escape") {
    closeMoreMenu();
    closeAuthModal();
    closeMicroModal();
    closeDelayModal();
    closeDrawer();
  }
});

window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  updateLockUI();
  renderLoadingSkeletons();
  loadData(false);
});
