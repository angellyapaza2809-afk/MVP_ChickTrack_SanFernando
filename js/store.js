/**
 * store.js — Capa de datos del MVP "Ciclo Térmico Pollito BB"
 * -----------------------------------------------------------
 * Simula el backend / integración SAP usando localStorage.
 * En una versión productiva, este archivo se reemplaza por
 * llamadas fetch() a una API real (SAP RFC/OData, GPS, IoT, BI).
 *
 * Rango objetivo de temperatura cloacal (referencial, configurable):
 *   ÓPTIMO   39.4 °C – 40.6 °C
 *   ALERTA   38.9–39.4 °C  ó  40.6–41.1 °C
 *   CRÍTICO  < 38.9 °C  ó  > 41.1 °C
 */

const DB_KEY = "sf_thermo_db_v1";

const RANGO = {
  optimoMin: 39.4,
  optimoMax: 40.6,
  alertaMin: 38.9,
  alertaMax: 41.1,
};

// Peso de referencia del pollito BB al nacer (g) — referencial, para
// estimar la tasa de crecimiento del lote al llegar a granja.
const PESO_REFERENCIA_G = 40;

function tasaCrecimientoPct(pesoPromedioG) {
  if (pesoPromedioG == null || isNaN(pesoPromedioG)) return null;
  return +(((pesoPromedioG - PESO_REFERENCIA_G) / PESO_REFERENCIA_G) * 100).toFixed(2);
}

function clasificarTemp(t) {
  if (t == null || isNaN(t)) return "sin-dato";
  if (t >= RANGO.optimoMin && t <= RANGO.optimoMax) return "optimo";
  if (t >= RANGO.alertaMin && t <= RANGO.alertaMax) return "alerta";
  return "critico";
}

function promedio(arr) {
  const nums = arr.filter((n) => typeof n === "number" && !isNaN(n));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function maximo(arr) {
  const nums = arr.filter((n) => typeof n === "number" && !isNaN(n));
  if (!nums.length) return null;
  return Math.max(...nums);
}

function minimo(arr) {
  const nums = arr.filter((n) => typeof n === "number" && !isNaN(n));
  if (!nums.length) return null;
  return Math.min(...nums);
}

function desviacionEstandar(arr) {
  const nums = arr.filter((n) => typeof n === "number" && !isNaN(n));
  if (nums.length < 2) return null;
  const prom = promedio(nums);
  const varianza = nums.reduce((a, b) => a + (b - prom) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(varianza);
}

function uuid() {
  return "v" + Math.random().toString(36).slice(2, 9);
}

// ---------------------------------------------------------------
// Recepción en granja — Control de llegada (lote / sexo / mortalidad)
// ---------------------------------------------------------------

/**
 * Calcula el % de mortalidad a partir de los muertos durante el trayecto.
 * El usuario NUNCA edita este valor directamente: siempre se deriva.
 * Devuelve null si no hay cantidad despachada válida (evita división por 0).
 */
function calcularMortalidad(muertosTraslado, cantidadDespachada) {
  const muertos = Number(muertosTraslado);
  const despachados = Number(cantidadDespachada);
  if (!despachados || despachados <= 0 || isNaN(muertos) || isNaN(despachados)) return null;
  return +((muertos / despachados) * 100).toFixed(2);
}

/**
 * Valida los datos de "Control de llegada" antes de guardar.
 * Devuelve { ok: boolean, errores: string[] }.
 * Se usa en el frontend (granja.html); las mismas reglas deben
 * re-validarse en backend/DB cuando exista API real (ver README).
 */
function validarControlLlegada({ f, m, total, cantidadDespachada, muertosTraslado }) {
  const errores = [];

  if (f != null && f < 0) errores.push("La cantidad de hembras (F) no puede ser negativa.");
  if (m != null && m < 0) errores.push("La cantidad de machos (M) no puede ser negativa.");

  if (f != null && m != null && total != null) {
    const suma = f + m;
    if (suma !== total) {
      errores.push(`F + M (${suma}) no coincide con el total del lote (${total}).`);
    }
  }

  if (cantidadDespachada != null && cantidadDespachada < 0) {
    errores.push("La cantidad despachada no puede ser negativa.");
  }

  if (muertosTraslado != null) {
    if (muertosTraslado < 0) {
      errores.push("Los muertos durante el trayecto no pueden ser negativos.");
    }
    if (cantidadDespachada != null && muertosTraslado > cantidadDespachada) {
      errores.push("Los muertos durante el trayecto no pueden superar la cantidad despachada.");
    }
  }

  return { ok: errores.length === 0, errores };
}

// ---------------------------------------------------------------
// SEED — datos de ejemplo (simulan la carga por transacción Z-SAP)
// ---------------------------------------------------------------
const LINEAS_GENETICAS = ["Ross 308", "Cobb 500", "Hubbard Flex"];

// --- Dimensión geográfica y organizacional por destino (referencial) ---
const UBICACION_POR_DESTINO = {
  "Granja Chincha Norte": { zona: "Zona Sur", subzona: "Chincha", circuito: "Circuito 3", tipoPlantel: "Recría", supervisor: "Carla Núñez Vidal", coordinador: "Renzo Ortega Lam", franquicia: "San Fernando" },
  "Granja Cañete Sur": { zona: "Zona Sur", subzona: "Cañete", circuito: "Circuito 2", tipoPlantel: "Engorde", supervisor: "Jorge Medina Ruiz", coordinador: "Renzo Ortega Lam", franquicia: "San Fernando" },
  "Granja Ica Km 302": { zona: "Zona Sur", subzona: "Ica", circuito: "Circuito 4", tipoPlantel: "Engorde", supervisor: "Patricia Solano Vega", coordinador: "Diego Herrera Paz", franquicia: "San Fernando" },
  "Granja Huaral": { zona: "Zona Norte Chico", subzona: "Huaral", circuito: "Circuito 1", tipoPlantel: "Recría", supervisor: "Ana Belén Castro", coordinador: "Diego Herrera Paz", franquicia: "San Fernando" },
};

function seedData() {
  const hoy = new Date();
  const fecha = (offsetDias = 0) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + offsetDias);
    return d.toISOString().slice(0, 10);
  };

  const base = [
    {
      dtSap: "0080012345",
      ruta: "R-014",
      planta: "Planta Incubación Lurín",
      destino1: "Granja Chincha Norte",
      destino2: "",
      destino3: "",
      cantidad: 24000,
      edadLotes: "Lote 231-A",
      galpon: "G-08",
      puntoCarga: "Andén 3",
      unidad: "T-118",
      placa: "F4X-812",
      conductor: "Julio Ramírez Soto",
      horaSalidaPlan: "05:30",
      horaCargaFinPlan: "05:50",
      esperaMaxMin: 25,
      horaRetornoPlan: "09:10",
      plantaRetorno: "Planta Incubación Lurín",
      estado: "Finalizado",
      horaSalidaReal: "05:34",
      horaLlegadaReal: "07:48",
    },
    {
      dtSap: "0080012346",
      ruta: "R-021",
      planta: "Planta Incubación Lurín",
      destino1: "Granja Cañete Sur",
      destino2: "",
      destino3: "",
      cantidad: 18000,
      edadLotes: "Lote 231-B",
      galpon: "G-03",
      puntoCarga: "Andén 1",
      unidad: "T-092",
      placa: "F6Y-233",
      conductor: "Marco Antonio Flores",
      horaSalidaPlan: "06:00",
      horaCargaFinPlan: "06:20",
      esperaMaxMin: 20,
      horaRetornoPlan: "10:05",
      plantaRetorno: "Planta Incubación Lurín",
      estado: "En Tránsito",
      horaSalidaReal: "06:05",
      horaLlegadaReal: "",
    },
    {
      dtSap: "0080012347",
      ruta: "R-007",
      planta: "Planta Incubación Chincha",
      destino1: "Granja Ica Km 302",
      destino2: "",
      destino3: "",
      cantidad: 21000,
      edadLotes: "Lote 232-A",
      galpon: "G-11",
      puntoCarga: "Andén 2",
      unidad: "T-045",
      placa: "F2K-509",
      conductor: "Luis Alberto Peña",
      horaSalidaPlan: "05:15",
      horaCargaFinPlan: "05:35",
      esperaMaxMin: 25,
      horaRetornoPlan: "08:50",
      plantaRetorno: "Planta Incubación Chincha",
      estado: "En Carga",
      horaSalidaReal: "",
      horaLlegadaReal: "",
    },
    {
      dtSap: "0080012348",
      ruta: "R-030",
      planta: "Planta Incubación Lurín",
      destino1: "Granja Huaral",
      destino2: "",
      destino3: "",
      cantidad: 16000,
      edadLotes: "Lote 232-B",
      galpon: "G-05",
      puntoCarga: "Andén 4",
      unidad: "T-101",
      placa: "F8L-671",
      conductor: "Eduardo Salas Chávez",
      horaSalidaPlan: "07:00",
      horaCargaFinPlan: "07:20",
      esperaMaxMin: 20,
      horaRetornoPlan: "10:40",
      plantaRetorno: "Planta Incubación Lurín",
      estado: "Programado",
      horaSalidaReal: "",
      horaLlegadaReal: "",
    },
    {
      dtSap: "0080012349",
      ruta: "R-014",
      planta: "Planta Incubación Lurín",
      destino1: "Granja Chincha Norte",
      destino2: "",
      destino3: "",
      cantidad: 24500,
      edadLotes: "Lote 233-A",
      galpon: "G-08",
      puntoCarga: "Andén 3",
      unidad: "T-118",
      placa: "F4X-812",
      conductor: "Julio Ramírez Soto",
      horaSalidaPlan: "05:30",
      horaCargaFinPlan: "05:50",
      esperaMaxMin: 25,
      horaRetornoPlan: "09:10",
      plantaRetorno: "Planta Incubación Lurín",
      estado: "En Granja",
      horaSalidaReal: "05:31",
      horaLlegadaReal: "07:39",
    },
  ];

  const viajes = base.map((v, i) => {
    const id = uuid();
    const f = fecha(i === 3 ? 1 : 0);

    // --- Geocercas simuladas ---
    const geocercas = [
      { nombre: "Planta - Salida", hora: v.horaSalidaReal || "", estado: v.horaSalidaReal ? "Cruzada" : "Pendiente" },
      { nombre: "Panamericana Sur Km 60", hora: v.horaSalidaReal ? sumarMin(v.horaSalidaReal, 35) : "", estado: v.horaSalidaReal ? "Cruzada" : "Pendiente" },
      { nombre: v.destino1 + " - Llegada", hora: v.horaLlegadaReal || "", estado: v.horaLlegadaReal ? "Cruzada" : "Pendiente" },
    ];

    // --- Carga en planta (temperatura cloacal de n muestras) ---
    const nMuestrasCarga = 5;
    const tempsCarga = ["Finalizado", "En Tránsito", "En Granja"].includes(v.estado)
      ? Array.from({ length: nMuestrasCarga }, () => +(40.1 + (Math.random() - 0.5) * 1.0).toFixed(1))
      : [];
    const cargaPlanta = {
      tempAmbienteUnidad: tempsCarga.length ? +(30.5 + (Math.random() - 0.5) * 1.5).toFixed(1) : null,
      muestras: tempsCarga.map((t, idx) => ({ n: idx + 1, tempCloacal: t })),
      horaRegistro: v.horaCargaFinPlan,
      // --- Dimensión productiva de origen ---
      horaNacimiento: v.horaSalidaPlan ? sumarMin(v.horaSalidaPlan, -60 * (20 + Math.round(Math.random() * 6))) : "",
      edadLoteSemanas: +(38 + Math.random() * 20).toFixed(0),
      lineaGenetica: LINEAS_GENETICAS[i % LINEAS_GENETICAS.length],
    };

    // --- Serie de temperatura ambiente en tránsito (sensores IoT) ---
    const transitoSerie = [];
    const transitoEventos = [];
    if (["En Tránsito", "En Granja", "Finalizado"].includes(v.estado)) {
      const puntos = 8;
      let t0 = 30.5;
      for (let p = 0; p < puntos; p++) {
        t0 += (Math.random() - 0.5) * 0.6;
        transitoSerie.push({ min: p * 15, temp: +t0.toFixed(1) });
      }
      transitoEventos.push({ hora: v.horaSalidaReal || v.horaSalidaPlan, descripcion: "Salida de planta registrada" });
      if (["En Granja", "Finalizado"].includes(v.estado) && v.horaLlegadaReal) {
        transitoEventos.push({ hora: v.horaLlegadaReal, descripcion: "Llegada a destino registrada" });
      }
    }

    // --- Registro en granja ---
    let granja = null;
    if (["En Granja", "Finalizado"].includes(v.estado)) {
      const nMuestrasLlegada = 5;
      const tempsLlegada = Array.from({ length: nMuestrasLlegada }, () =>
        +(39.9 + (Math.random() - 0.5) * 1.3).toFixed(1)
      );
      const pesos = Array.from({ length: nMuestrasLlegada }, () => +(38 + (Math.random() - 0.5) * 4).toFixed(1));
      const sexos = Array.from({ length: nMuestrasLlegada }, () => (Math.random() < 0.5 ? "F" : "M"));

      // --- Sexo del lote (independiente del sexo de cada muestra) ---
      const totalLote = v.cantidad;
      const fLote = Math.round(totalLote / 2);
      const mLote = totalLote - fLote;

      // --- Mortalidad en traslado: el usuario solo carga "muertos"; el % siempre se calcula ---
      const cantidadDespachada = v.cantidad;
      const muertosTraslado = Math.round(cantidadDespachada * (Math.random() * 0.005));
      const mortalidadPct = calcularMortalidad(muertosTraslado, cantidadDespachada);

      granja = {
        // --- Dimensión geográfica y organizacional ---
        ubicacionOrganizacional: UBICACION_POR_DESTINO[v.destino1] || null,
        galpones: [
          {
            galpon: v.galpon,
            nh3: +(8 + Math.random() * 6).toFixed(1),
            temp: +(31 + Math.random() * 2).toFixed(1),
            humedad: +(55 + Math.random() * 10).toFixed(0),
            ventilacion: +(0.4 + Math.random() * 0.3).toFixed(2),
            co2: +(900 + Math.random() * 400).toFixed(0),
            iluminacion: +(20 + Math.random() * 10).toFixed(0),
          },
        ],
        loteRecepcion: {
          plantel: v.destino1 || "",
          galpon: v.galpon || "",
          campana: v.edadLotes || "",
          sexo: { F: fLote, M: mLote, total: totalLote },
          transporte: { cantidadDespachada, muertosTraslado, mortalidadPct },
        },
        // Se mantiene por compatibilidad con index.html / bi.html / viaje.html,
        // que ya leen granja.mortalidad directamente. Siempre espejo del cálculo.
        mortalidad: mortalidadPct,
        muestrasLlegada: tempsLlegada.map((t, idx) => ({ n: idx + 1, tempCloacal: t, pesoG: pesos[idx], sexo: sexos[idx] })),
        pesoPromedioG: +promedio(pesos).toFixed(1),
        uniformidadPct: +(88 + Math.random() * 8).toFixed(1),
      };
    }

    return {
      id,
      fecha: f,
      ...v,
      geocercas,
      cargaPlanta,
      transito: { serie: transitoSerie, eventos: transitoEventos },
      granja,
    };
  });

  return { viajes };
}

function sumarMin(hhmm, min) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m + min, 0, 0);
  return d.toTimeString().slice(0, 5);
}

// ---------------------------------------------------------------
// API pública del store
// ---------------------------------------------------------------
const Store = {
  RANGO,
  PESO_REFERENCIA_G,
  clasificarTemp,
  promedio,
  maximo,
  minimo,
  desviacionEstandar,
  calcularMortalidad,
  validarControlLlegada,
  tasaCrecimientoPct,

  init() {
    if (!localStorage.getItem(DB_KEY)) {
      localStorage.setItem(DB_KEY, JSON.stringify(seedData()));
    }
  },

  reset() {
    localStorage.setItem(DB_KEY, JSON.stringify(seedData()));
  },

  _read() {
    return JSON.parse(localStorage.getItem(DB_KEY) || '{"viajes":[]}');
  },

  _write(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  },

  getViajes() {
    return this._read().viajes;
  },

  getViaje(id) {
    return this._read().viajes.find((v) => v.id === id);
  },

  addViaje(viaje) {
    const db = this._read();
    viaje.id = uuid();
    viaje.geocercas = viaje.geocercas || [
      { nombre: "Planta - Salida", hora: "", estado: "Pendiente" },
      { nombre: "Ruta - Punto medio", hora: "", estado: "Pendiente" },
      { nombre: (viaje.destino1 || "Destino") + " - Llegada", hora: "", estado: "Pendiente" },
    ];
    viaje.cargaPlanta = viaje.cargaPlanta || { tempAmbienteUnidad: null, muestras: [], horaRegistro: "", horaNacimiento: "", edadLoteSemanas: null, lineaGenetica: "" };
    viaje.transito = viaje.transito || { serie: [], eventos: [] };
    viaje.granja = viaje.granja || null;
    viaje.estado = viaje.estado || "Programado";
    db.viajes.unshift(viaje);
    this._write(db);
    return viaje;
  },

  updateViaje(id, patch) {
    const db = this._read();
    const idx = db.viajes.findIndex((v) => v.id === id);
    if (idx === -1) return null;
    db.viajes[idx] = { ...db.viajes[idx], ...patch };
    this._write(db);
    return db.viajes[idx];
  },

  deleteViaje(id) {
    const db = this._read();
    db.viajes = db.viajes.filter((v) => v.id !== id);
    this._write(db);
  },
};

window.Store = Store;
