/**
 * thermal-ribbon.js — Elemento firma del MVP.
 * Dibuja una "cinta térmica" SVG que recorre las 3 etapas del ciclo
 * (Planta -> Tránsito -> Granja) y codifica por color cuán cerca
 * estuvo cada lectura del rango óptimo de temperatura cloacal.
 */

function colorForClass(cls) {
  switch (cls) {
    case "optimo": return "#2f93c4";
    case "alerta": return "#c98a1f";
    case "critico": return "#e2231a";
    default: return "#93a8c4";
  }
}

/**
 * puntos: [{ label, temp, sub }]  — orden cronológico
 */
function renderThermalRibbon(containerEl, puntos, { height = 130 } = {}) {
  const w = 1000;
  const h = height;
  const padX = 40;
  const usable = w - padX * 2;
  const step = puntos.length > 1 ? usable / (puntos.length - 1) : 0;

  const tMin = Store.RANGO.alertaMin - 1.2;
  const tMax = Store.RANGO.alertaMax + 1.2;
  const yTop = 26;
  const yBottom = h - 34;

  const yFor = (t) => {
    if (t == null) return (yTop + yBottom) / 2;
    const pct = (t - tMin) / (tMax - tMin);
    return yBottom - pct * (yBottom - yTop);
  };

  // Banda óptima de fondo
  const yOptTop = yFor(Store.RANGO.optimoMax);
  const yOptBottom = yFor(Store.RANGO.optimoMin);

  const coords = puntos.map((p, i) => ({
    x: padX + i * step,
    y: yFor(p.temp),
    ...p,
  }));

  const pathD = coords
    .map((c, i) => (i === 0 ? `M ${c.x} ${c.y}` : `L ${c.x} ${c.y}`))
    .join(" ");

  const dots = coords
    .map((c) => {
      const cls = Store.clasificarTemp(c.temp);
      const color = colorForClass(cls);
      return `
        <g>
          <circle cx="${c.x}" cy="${c.y}" r="9" fill="${color}22" />
          <circle cx="${c.x}" cy="${c.y}" r="4.5" fill="${color}" />
          <text x="${c.x}" y="${c.y - 14}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="${color}" font-weight="700">
            ${c.temp != null ? c.temp.toFixed(1) + "°" : "—"}
          </text>
          <text x="${c.x}" y="${yBottom + 20}" text-anchor="middle" font-family="Nunito Sans, sans-serif" font-size="10.5" font-weight="600" fill="#5c7396">
            ${c.label}
          </text>
          ${c.sub ? `<text x="${c.x}" y="${yBottom + 33}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="9.5" fill="#93a8c4">${c.sub}</text>` : ""}
        </g>`;
    })
    .join("");

  const svg = `
    <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${padX}" y="${yOptTop}" width="${usable}" height="${yOptBottom - yOptTop}" fill="#2f93c412" />
      <line x1="${padX}" y1="${yOptTop}" x2="${w - padX}" y2="${yOptTop}" stroke="#2f93c450" stroke-dasharray="3 3" />
      <line x1="${padX}" y1="${yOptBottom}" x2="${w - padX}" y2="${yOptBottom}" stroke="#2f93c450" stroke-dasharray="3 3" />
      <text x="${w - padX}" y="${yOptTop - 6}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="9.5" fill="#2f93c4a0">rango óptimo</text>
      <path d="${pathD}" fill="none" stroke="#c3d3e8" stroke-width="1.8" />
      ${dots}
    </svg>
  `;

  containerEl.innerHTML = `
    <div class="thermal-ribbon">${svg}</div>
    <div class="ribbon-legend">
      <div class="item"><span class="sw" style="background:#2f93c4"></span>Óptimo (39.4–40.6°C)</div>
      <div class="item"><span class="sw" style="background:#c98a1f"></span>Alerta</div>
      <div class="item"><span class="sw" style="background:#e2231a"></span>Crítico</div>
    </div>
  `;
}

window.renderThermalRibbon = renderThermalRibbon;
