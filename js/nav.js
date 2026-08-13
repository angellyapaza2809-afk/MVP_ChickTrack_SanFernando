/**
 * nav.js — Inyecta el shell de la aplicación (sidebar + topbar)
 * en cada página. Cada página define `PAGE` (id) y `PAGE_TITLE` /
 * `PAGE_SUBTITLE` antes de cargar este script.
 */

const SIDEBAR_COLLAPSE_KEY = "sf_sidebar_collapsed_v1";

const NAV_ITEMS = [
  { group: "Operación" },
  { id: "dashboard", href: "index.html", label: "Panel general", icon: "◆" },
  { id: "programacion", href: "programacion.html", label: "Programación (SAP)", icon: "▤" },
  { group: "Registro por etapa" },
  { id: "planta", href: "planta.html", label: "Carga en planta", icon: "①" },
  { id: "transito", href: "transito.html", label: "Tránsito · GPS", icon: "②" },
  { id: "checklist", href: "checklist.html", label: "Checklist galpón", icon: "☑" },
  { id: "granja", href: "granja.html", label: "Recepción en granja", icon: "③" },
  { group: "Analítica" },
  { id: "bi", href: "bi.html", label: "Dashboard BI", icon: "▦" },
];

function renderShell() {
  document.body.classList.toggle("sidebar-collapsed", localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1");

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const navHtml = NAV_ITEMS.map((item) => {
    if (item.group) {
      return `<div class="nav-label">${item.group}</div>`;
    }
    const active = item.id === window.PAGE ? "active" : "";
    return `<a class="nav-link ${active}" href="${item.href}" title="${item.label}">
      <span class="nav-icon">${item.icon || ""}</span><span class="nav-text">${item.label}</span>
    </a>`;
  }).join("");

  shell.innerHTML = `
    <aside class="sidebar">
      <button class="sidebar-toggle" id="btn-toggle-sidebar" type="button" title="Contraer / expandir menú" aria-label="Contraer / expandir menú">‹</button>
      <div class="brand">
        <div class="brand-mark"><img src="img/SAN-FERNANDO-BAN_abarrotes-1.png" class="brand-logo"/></div>
        <div class="brand-text">
          <strong>Ciclo Térmico BB</strong>
          <span>San Fernando · MVP</span>
        </div>
      </div>
      <nav class="nav-group">${navHtml}</nav>
      <div class="sidebar-footer">
        “Cuidamos cada grado,<br />desde la planta hasta el galpón.”
        <div style="margin-top:14px;">
          <button class="btn btn-sm" id="btn-reset-demo" style="width:100%; background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.18); color:#fff;">↺ Reiniciar datos demo</button>
        </div>
      </div>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1>${window.PAGE_TITLE || ""}</h1>
          <div class="subtitle">${window.PAGE_SUBTITLE || ""}</div>
        </div>
        <div class="live-clock">
          <span class="live-dot"></span>
          <span id="live-clock-text">--:--:--</span>
        </div>
      </div>
      <div id="page-content"></div>
    </main>
  `;

  document.body.prepend(shell);

  function tick() {
    const el = document.getElementById("live-clock-text");
    if (el) {
      const now = new Date();
      el.textContent =
        now.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) +
        " · " +
        now.toLocaleTimeString("es-PE", { hour12: false });
    }
  }
  tick();
  setInterval(tick, 1000);

  document.getElementById("btn-toggle-sidebar")?.addEventListener("click", () => {
    const collapsed = !document.body.classList.contains("sidebar-collapsed");
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0");
  });

  document.getElementById("btn-reset-demo")?.addEventListener("click", () => {
    if (confirm("Esto reemplazará todos los datos por el set de ejemplo original. ¿Continuar?")) {
      Store.reset();
      window.location.href = "index.html";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  Store.init();
  renderShell();
  if (typeof window.initPage === "function") {
    window.initPage();
  }
});
