/**
 * util.js — helpers compartidos de formato y UI
 */

function slug(estado) {
  return estado
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

function badgeEstado(estado) {
  return `<span class="badge ${slug(estado)}">${estado}</span>`;
}

function badgeTemp(temp) {
  if (temp == null || isNaN(temp)) return `<span class="badge sin-dato">Sin dato</span>`;
  const cls = Store.clasificarTemp(temp);
  const label = { optimo: "Óptimo", alerta: "Alerta", critico: "Crítico" }[cls];
  return `<span class="badge ${cls}">${temp.toFixed(1)}°C · ${label}</span>`;
}

function fmtFecha(f) {
  if (!f) return "—";
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y}`;
}

function minutosEntre(hhmm1, hhmm2) {
  if (!hhmm1 || !hhmm2) return null;
  const [h1, m1] = hhmm1.split(":").map(Number);
  const [h2, m2] = hhmm2.split(":").map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

function fillSelectViajes(selectEl, viajes, { placeholder = "Selecciona un viaje…" } = {}) {
  selectEl.innerHTML =
    `<option value="">${placeholder}</option>` +
    viajes
      .map(
        (v) =>
          `<option value="${v.id}">${v.dtSap} · ${v.ruta} · ${v.destino1} · ${v.placa} (${v.estado})</option>`
      )
      .join("");
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

window.Util = { slug, badgeEstado, badgeTemp, fmtFecha, minutosEntre, fillSelectViajes, qs };
