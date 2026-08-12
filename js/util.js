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

// Convierte una hora en formato 24h "HH:MM" (el que usan los <input type="time">)
// a formato 12h con a. m. / p. m. para que no haya ambigüedad al leerla:
// "13:15" -> "1:15 p. m." · "01:15" -> "1:15 a. m."
function fmtHora(hhmm) {
  if (!hhmm) return "—";
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  if (isNaN(h) || mStr == null) return hhmm;
  const periodo = h < 12 ? "a. m." : "p. m.";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${mStr} ${periodo}`;
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

window.Util = { slug, badgeEstado, badgeTemp, fmtFecha, fmtHora, minutosEntre, fillSelectViajes, qs };
