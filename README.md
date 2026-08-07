# Ciclo Térmico BB — MVP

MVP web para **monitorear el ciclo térmico del pollo bebé** durante su
traslado desde la planta de incubación hasta la granja (San Fernando, Perú).

Cubre el flujo **to-be** descrito en el proyecto:

```
Programación (SAP, 4pm día -1)
        │
        ▼
① Carga en planta ──► ② Tránsito (GPS + geocercas + sensores) ──► ③ Recepción en granja ──► Dashboard BI
   temp. cloacal x n        temp. ambiente unidad                    condiciones de galpón
   temp. ambiente unidad    cumplimiento de horario                  mortalidad / temp. cloacal
                                                                       peso promedio / uniformidad
```

## ¿Qué es y qué no es este MVP?

Es un **prototipo funcional 100% frontend** (HTML/CSS/JS, sin build ni
dependencias de servidor) pensado para:

- Validar el flujo y los campos con el área de Transporte / Granjas antes de
  construir la integración real.
- Servir de especificación viva (data model, pantallas, reglas de rango de
  temperatura) para el equipo de desarrollo.
- Desplegarse en segundos en **GitHub Pages**.

**No** implementa: integración real con SAP (transacción Z), GPS/geocercas
reales, sensores IoT, ni el BI final. Todo eso está **simulado** con datos de
ejemplo guardados en `localStorage` del navegador (ver `js/store.js`), de
forma que el equipo pueda ver la experiencia completa sin backend.

## Estructura del proyecto

```
sf-thermo-mvp/
├── index.html          Panel general (KPIs + cinta térmica + tabla de viajes)
├── programacion.html   Carga de programación diaria (simula transacción Z-SAP)
├── planta.html         ① Registro de temp. cloacal (n muestras) + temp. ambiente al cargar
├── transito.html       ② Geocercas GPS, cumplimiento de horario y temp. ambiente (sensor)
├── granja.html         ③ Condiciones del galpón + control de llegada (mortalidad, temp., peso, uniformidad)
├── bi.html             Dashboard BI (Chart.js): comparativas y tendencias
├── viaje.html          Detalle/trazabilidad completa de un viaje puntual
├── css/style.css        Sistema de diseño ("sala de control")
└── js/
    ├── store.js         Modelo de datos + mock DB (localStorage) + datos de ejemplo
    ├── util.js          Helpers de formato (badges, fechas, minutos entre horas)
    ├── nav.js            Shell de navegación (sidebar, topbar, reloj)
    └── thermal-ribbon.js Componente "cinta térmica" (SVG) — elemento central del MVP
```

## Cómo verlo localmente

No requiere instalación. Basta un servidor estático simple:

```bash
cd sf-thermo-mvp
python3 -m http.server 8000
# abrir http://localhost:8000
```

(Abrir `index.html` directamente con doble clic también funciona en la
mayoría de navegadores, ya que no hay módulos ES ni fetch a APIs externas,
salvo Chart.js vía CDN para los gráficos.)

## Cómo publicarlo en GitHub Pages

1. Crear un repositorio nuevo en GitHub y subir el contenido de esta carpeta
   a la rama `main`:
   ```bash
   git init
   git add .
   git commit -m "MVP monitoreo ciclo térmico pollo BB"
   git branch -M main
   git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
   git push -u origin main
   ```
2. En GitHub → **Settings → Pages** → Source: `Deploy from a branch` →
   Branch: `main` / carpeta `/ (root)`.
3. La web quedará publicada en `https://<tu-usuario>.github.io/<tu-repo>/`.

## Modelo de datos (`js/store.js`)

Cada **viaje** (unidad de transporte) contiene los campos de la
programación SAP solicitados (D.T., ruta, planta, destinos, unidad, placa,
conductor, horas programadas, etc.) más tres bloques que se completan en
cada etapa:

- `cargaPlanta`: `tempAmbienteUnidad`, `muestras: [{n, tempCloacal}]`.
- `transito`: `serie: [{min, temp}]` (temperatura ambiente de la unidad
  temperada, leída por sensores) y `geocercas` a nivel de viaje (planta,
  puntos de ruta, destino) con hora de cruce.
- `granja`: `galpones: [{galpon, nh3, temp, humedad, ventilacion, co2,
  iluminacion}]`, `mortalidad`, `muestrasLlegada: [{n, tempCloacal, pesoG}]`,
  `pesoPromedioG`, `uniformidadPct`.

### Rango de temperatura cloacal (referencial, configurable en `store.js`)

| Clasificación | Rango           |
|----------------|-----------------|
| Óptimo         | 39.4 – 40.6 °C  |
| Alerta         | 38.9–39.4 / 40.6–41.1 °C |
| Crítico        | < 38.9 °C o > 41.1 °C |

Estos valores son **referenciales** y deben ajustarse con el área técnica /
veterinaria de San Fernando antes de pasar a producción.

## Roadmap hacia producción

- [ ] Reemplazar `js/store.js` por una API real: lectura de la transacción Z
      de SAP (RFC/OData) para la programación diaria.
- [ ] Integrar proveedor de GPS/geocercas real (ej. webhook o polling a la
      plataforma de flota) para reemplazar la simulación de `transito.html`.
- [ ] Integrar sensores IoT de temperatura cloacal/ambiente (lectura
      automática en vez de digitación manual, cuando esté disponible).
- [ ] Autenticación por rol (Transporte / Planta / Granja / BI) — hoy el MVP
      no tiene login, cualquier persona ve todas las pantallas.
- [ ] Mover el dashboard BI a la herramienta corporativa (Power BI / Tableau)
      consumiendo el mismo modelo de datos vía API.
- [ ] Alertas automáticas (correo/WhatsApp/SAP) cuando una muestra cae en
      rango "Crítico" o se incumple el tiempo máximo de espera en destino.

## Objetivo del proyecto

Dar visibilidad y trazabilidad end-to-end al ciclo térmico del pollo bebé
—desde que sale de la planta de incubación hasta que llega a la granja—
para poder actuar sobre desviaciones de temperatura, tiempos de traslado y
condiciones del galpón antes de que impacten en mortalidad y uniformidad
del lote.
