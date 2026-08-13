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

// ---------------------------------------------------------------
// Contraste sensor del proveedor (unidad) vs. datalogger independiente
// ---------------------------------------------------------------

// Diferencia máxima admitida entre el promedio del sensor del proveedor
// y el promedio del datalogger antes de marcar el viaje como "discrepancia".
// Referencial — ajustar con el área técnica antes de producción.
const TOLERANCIA_DATALOGGER_C = 0.5;

/**
 * Contrasta la serie de temperatura del sensor del proveedor (unidad)
 * contra la serie de un datalogger independiente (tiempo real o
 * descargado/registrado manualmente tras el viaje).
 * Devuelve null si no hay datos de datalogger todavía.
 */
function contrastarDatalogger(serieSensor, serieDatalogger) {
  if (!serieDatalogger || !serieDatalogger.length) return null;
  const promSensor = promedio(serieSensor.map((s) => s.temp));
  const promDatalogger = promedio(serieDatalogger.map((s) => s.temp));
  if (promSensor == null || promDatalogger == null) return null;
  const delta = +(promDatalogger - promSensor).toFixed(2);
  return {
    promSensor: +promSensor.toFixed(2),
    promDatalogger: +promDatalogger.toFixed(2),
    delta,
    consistente: Math.abs(delta) <= TOLERANCIA_DATALOGGER_C,
  };
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
// Checklist de preparación de galpones (recepción) — FICYB004 v2
// -----------------------------------------------------------------
// Se registra por PLANTEL + GALPÓN (no por viaje puntual): la visita
// técnica se hace ~12 horas antes de la recepción y un mismo galpón
// puede recibir varios lotes en el tiempo. Al programar un viaje hacia
// un plantel/galpón, se consulta el último checklist de esa combinación.
// ---------------------------------------------------------------
const CHECKLIST_DB_KEY = "sf_thermo_checklists_v1";

// 4 niveles por ítem, de peor a mejor (rojo/naranja/amarillo/verde en el
// formato original). `null` = nivel no aplica para ese ítem (celda "—"/"-"
// en el Excel de origen).
const CHECKLIST_ITEMS = [
  { nro: 1, actividad: "Doble cortaviento, doble portón herméticos, cielo raso cerrados en óptimas condiciones, con metros internos correctamente enterrados.", opciones: ["1 items", "2 items", "3 items", "4 items"], peso: 10 },
  { nro: 2, actividad: "Adecuada nivelación de cama (4 corrales)", opciones: ["1 corral", "2 corrales", "3 corrales", "4 corrales"], peso: 5 },
  { nro: 3, actividad: "Corrales de división (mínimo 4 corrales)", opciones: ["1 corral", "2 corrales", "3 corrales", "4 corrales"], peso: 5 },
  { nro: 4, actividad: "Iluminación completa en todo del galpón (Iluminación artificial)", opciones: ["Falta 3 focos", "Falta 2 focos", "Falta 1 foco", "Completo"], peso: 5 },
  { nro: 5, actividad: "Precalentamiento del galpón (campanas encendidas 18 horas).", opciones: ["<10 horas", "10 a 13 horas", "14 a 17 horas", "18 horas"], peso: 10 },
  { nro: 6, actividad: "Criadoras: 1 para (semiautomáticas: max 1800) (Convencionales: max 650)", opciones: ["A ≥ 2100 / C ≥ 800", "A ≥ 2000 / C ≥ 750", "A ≥ 1900 / C ≥ 700", "A ≥ 1800 / C ≥ 650"], peso: 10 },
  { nro: 7, actividad: "Disponibilidad de dos termohigrómetros operativos", opciones: ["0", null, "1", "2"], peso: 5 },
  { nro: 8, actividad: "Disponibilidad de agua en todas las líneas de bebederos", opciones: ["≥3 filas", "2 filas", "1 fila", "Todas las filas"], peso: 10 },
  { nro: 9, actividad: "Nivel de cloración del agua (3 a 5 ppm).", opciones: ["<3 a >6 ppm", "≤6 ppm", null, "≥3 a ≤5 ppm"], peso: 10 },
  { nro: 10, actividad: "Comederos automáticos y logísticos enterrados con disponibilidad de alimento (plato lleno)", opciones: ["No enterrado / vacío", "Enterrado", "Lleno", "Lleno / enterrado"], peso: 10 },
  { nro: 11, actividad: "Medición y control de pH del agua (5.5-6.5)", opciones: ["<5 o >6.5", "≥5.0 a <5.5", null, "≥5.5 a ≤6.5"], peso: 10 },
  { nro: 12, actividad: "Evaluación de presencia de Alphitobius (cero)", opciones: ["Severo >20", "Moderado 11 a 20", "Leve 1 a 10", "Nulo = 0"], peso: 10 },
  { nro: 13, actividad: "¿Con qué densidad se está recibiendo? (Ref: 40 a 50 aves/m² invierno máx.)", opciones: ["<40 a >50 aves/m²", null, null, "≥40 a ≤50 aves/m²"], peso: 10 },
  { nro: 14, actividad: "Disponibilidad de 8 filas de papel Kraft (8 a 10 filas)", opciones: ["<8 filas", null, null, "8 a 10 filas"], peso: 5 },
  { nro: 15, actividad: "Cantidad de comederos infantiles: mínimo 1 por cada 200 pollos por galpón", opciones: ["<1/200 pollos", null, null, "≥1/200 pollos"], peso: 10 },
  { nro: 16, actividad: "Cantidad de bebederos infantiles (tongo) para lote joven: 60 bebederos", opciones: ["<21 und", "≥21 a <41 und", "≥41 a <60 und", "≥60 und"], peso: 10 },
  { nro: 17, actividad: "Disponibilidad de 2 ventiladores instalados en el techo (opcional en las granjas que aplican)", opciones: ["0 ventiladores", null, "1 ventilador", "2 ventiladores"], peso: 5 },
];

const CHECKLIST_PESO_TOTAL = CHECKLIST_ITEMS.reduce((a, it) => a + it.peso, 0); // 140

// Umbrales de %cumplimiento — referenciales, ajustar con el área técnica.
const CHECKLIST_UMBRAL = { cumpleMin: 90, observacionesMin: 70 };

/**
 * Un mismo viaje puede descargar en hasta 3 destinos (destino1/2/3 de la
 * programación SAP), cada uno con su propio galpón. Devuelve la lista de
 * {destino, galpon} realmente usados por el viaje (ignora los vacíos).
 */
function destinosGalpones(viaje) {
  const pares = [
    { destino: viaje.destino1, galpon: viaje.galpon },
    { destino: viaje.destino2, galpon: viaje.galpon2 },
    { destino: viaje.destino3, galpon: viaje.galpon3 },
  ];
  return pares.filter((p) => p.destino);
}

function checklistKey(plantel, galpon) {
  return `${(plantel || "").trim().toLowerCase()}|${(galpon || "").trim().toLowerCase()}`;
}

/**
 * Calcula el puntaje a partir de las selecciones (índice 0-3 por ítem,
 * o null si aún no se evaluó). El puntaje de cada ítem es proporcional
 * al nivel elegido dentro de su peso: nivel 0 (peor) = 0, nivel 3
 * (mejor) = 100% del peso del ítem.
 *
 * Un ítem con `activo === false` está "apagado" para este checklist en
 * particular (no aplica): se excluye tanto del puntaje como del peso
 * total contra el que se calcula el %cumplimiento, y no se exige
 * respuesta para considerar el checklist "completo".
 */
function calcularChecklist(selecciones) {
  let puntaje = 0;
  let pesoTotal = 0;
  let itemsRespondidos = 0;
  let totalItems = 0;
  CHECKLIST_ITEMS.forEach((item, idx) => {
    const entry = selecciones?.[idx];
    if (entry?.activo === false) return;
    totalItems++;
    pesoTotal += item.peso;
    if (entry?.seleccion != null) {
      itemsRespondidos++;
      puntaje += item.peso * (entry.seleccion / 3);
    }
  });
  const pctCumplimiento = itemsRespondidos && pesoTotal ? +((puntaje / pesoTotal) * 100).toFixed(1) : null;
  return {
    puntaje: +puntaje.toFixed(1),
    pesoTotal,
    itemsRespondidos,
    totalItems,
    completo: totalItems > 0 && itemsRespondidos === totalItems,
    pctCumplimiento,
  };
}

/**
 * Clasifica el estado del checklist para mostrarlo como badge en
 * programación / viaje / granja.
 * "sin-checklist" | "en-progreso" | "cumple" | "observaciones" | "no-cumple"
 */
function clasificarChecklist(checklist) {
  if (!checklist) return "sin-checklist";
  const r = calcularChecklist(checklist.selecciones);
  if (r.itemsRespondidos === 0) return "sin-checklist";
  if (!r.completo) return "en-progreso";
  if (r.pctCumplimiento >= CHECKLIST_UMBRAL.cumpleMin) return "cumple";
  if (r.pctCumplimiento >= CHECKLIST_UMBRAL.observacionesMin) return "observaciones";
  return "no-cumple";
}

const CHECKLIST_ESTADO_LABEL = {
  "sin-checklist": "Sin checklist",
  "en-progreso": "En progreso",
  cumple: "Cumple",
  observaciones: "Cumple con observaciones",
  "no-cumple": "No cumple",
};

// Clases de badge reutilizando la paleta ya definida en css/style.css
const CHECKLIST_ESTADO_BADGE = {
  "sin-checklist": "sin-dato",
  "en-progreso": "en-transito",
  cumple: "optimo",
  observaciones: "alerta",
  "no-cumple": "critico",
};

// ---------------------------------------------------------------
// SEED — datos de ejemplo (simulan la carga por transacción Z-SAP)
// ---------------------------------------------------------------
const LINEAS_GENETICAS = ["Ross 308", "Cobb 500", "Hubbard Flex"];

// --- Dimensión geográfica y organizacional por destino (referencial) ---
const UBICACION_POR_DESTINO = {
  "Granja Chincha Norte": { codigoPlantel: "210", zona: "Zona Sur", subzona: "Chincha", circuito: "Circuito 3", tipoPlantel: "Recría", supervisor: "Carla Núñez Vidal", coordinador: "Renzo Ortega Lam", franquicia: "San Fernando" },
  "Granja Cañete Sur": { codigoPlantel: "208", zona: "Zona Sur", subzona: "Cañete", circuito: "Circuito 2", tipoPlantel: "Engorde", supervisor: "Jorge Medina Ruiz", coordinador: "Renzo Ortega Lam", franquicia: "San Fernando" },
  "Granja Ica Km 302": { codigoPlantel: "155", zona: "Zona Sur", subzona: "Ica", circuito: "Circuito 4", tipoPlantel: "Engorde", supervisor: "Patricia Solano Vega", coordinador: "Diego Herrera Paz", franquicia: "San Fernando" },
  "Granja Huaral": { codigoPlantel: "209", zona: "Zona Norte Chico", subzona: "Huaral", circuito: "Circuito 1", tipoPlantel: "Recría", supervisor: "Ana Belén Castro", coordinador: "Diego Herrera Paz", franquicia: "San Fernando" },
};

// ---------------------------------------------------------------
// "Complex" — código de lote de campo: P{plantel}-{año}{rueda}-{galpón}-{sexo}
// Ej. P210-2604-10-01 = plantel 210, campaña 2026 rueda 4, galpón 10, macho.
// 4 ruedas por año. Sexo del galpón: 01 = macho, 02 = hembra (un galpón
// aloja un solo sexo).
// ---------------------------------------------------------------
const SEXO_COMPLEX_CODIGO = { macho: "01", hembra: "02" };

function pad2(n) {
  const s = String(n ?? "").trim();
  return s ? s.padStart(2, "0") : "";
}

// Extrae el número del galpón sin importar el prefijo con el que se
// haya escrito (ej. "G-08" -> "08"), tal como lo pide el complex.
function extraerNumeroGalpon(galpon) {
  const m = String(galpon || "").match(/\d+/);
  return m ? m[0] : "";
}

function construirComplex({ destino, anio, rueda, galpon, sexo }) {
  const codigoPlantel = UBICACION_POR_DESTINO[destino]?.codigoPlantel;
  const numGalpon = extraerNumeroGalpon(galpon);
  const codigoSexo = SEXO_COMPLEX_CODIGO[sexo];
  if (!codigoPlantel || !anio || !rueda || !numGalpon || !codigoSexo) return null;
  return `P${codigoPlantel}-${pad2(anio)}${pad2(rueda)}-${pad2(numGalpon)}-${codigoSexo}`;
}

function fechaISO(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

function seedData() {
  const fecha = fechaISO;

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
      diasOffset: 0,
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
      diasOffset: 0,
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
      diasOffset: 0,
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
      diasOffset: 1,
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
      diasOffset: 0,
    },
    // --- Viajes completos adicionales (Finalizado, en fechas pasadas) para
    // que index.html, viaje.html y sobre todo el dashboard BI tengan
    // suficiente información visible (varias fechas, plantas y granjas). ---
    {
      dtSap: "0080012350",
      ruta: "R-021",
      planta: "Planta Incubación Chincha",
      destino1: "Granja Cañete Sur",
      destino2: "",
      destino3: "",
      cantidad: 19500,
      edadLotes: "Lote 230-C",
      galpon: "G-06",
      puntoCarga: "Andén 2",
      unidad: "T-077",
      placa: "F3M-450",
      conductor: "Rosa Elena Vargas",
      horaSalidaPlan: "05:45",
      horaCargaFinPlan: "06:05",
      esperaMaxMin: 20,
      horaRetornoPlan: "09:40",
      plantaRetorno: "Planta Incubación Chincha",
      estado: "Finalizado",
      horaSalidaReal: "05:48",
      horaLlegadaReal: "08:02",
      diasOffset: -1,
    },
    {
      dtSap: "0080012351",
      ruta: "R-007",
      planta: "Planta Incubación Lurín",
      destino1: "Granja Ica Km 302",
      destino2: "",
      destino3: "",
      cantidad: 22000,
      edadLotes: "Lote 230-D",
      galpon: "G-11",
      puntoCarga: "Andén 1",
      unidad: "T-063",
      placa: "F5N-284",
      conductor: "Hernán Castillo Ruiz",
      horaSalidaPlan: "05:00",
      horaCargaFinPlan: "05:20",
      esperaMaxMin: 25,
      horaRetornoPlan: "08:35",
      plantaRetorno: "Planta Incubación Lurín",
      estado: "Finalizado",
      horaSalidaReal: "05:03",
      horaLlegadaReal: "07:29",
      diasOffset: -1,
    },
    {
      dtSap: "0080012352",
      ruta: "R-030",
      planta: "Planta Incubación Lurín",
      destino1: "Granja Huaral",
      destino2: "",
      destino3: "",
      cantidad: 17500,
      edadLotes: "Lote 229-A",
      galpon: "G-05",
      puntoCarga: "Andén 4",
      unidad: "T-101",
      placa: "F8L-671",
      conductor: "Eduardo Salas Chávez",
      horaSalidaPlan: "06:45",
      horaCargaFinPlan: "07:05",
      esperaMaxMin: 20,
      horaRetornoPlan: "10:20",
      plantaRetorno: "Planta Incubación Lurín",
      estado: "Finalizado",
      horaSalidaReal: "06:47",
      horaLlegadaReal: "08:58",
      diasOffset: -2,
    },
    {
      dtSap: "0080012353",
      ruta: "R-014",
      planta: "Planta Incubación Chincha",
      destino1: "Granja Chincha Norte",
      destino2: "",
      destino3: "",
      cantidad: 23200,
      edadLotes: "Lote 229-B",
      galpon: "G-09",
      puntoCarga: "Andén 3",
      unidad: "T-118",
      placa: "F4X-812",
      conductor: "Julio Ramírez Soto",
      horaSalidaPlan: "05:20",
      horaCargaFinPlan: "05:40",
      esperaMaxMin: 25,
      horaRetornoPlan: "09:00",
      plantaRetorno: "Planta Incubación Chincha",
      estado: "Finalizado",
      horaSalidaReal: "05:22",
      horaLlegadaReal: "07:35",
      diasOffset: -2,
    },
    {
      dtSap: "0080012354",
      ruta: "R-021",
      planta: "Planta Incubación Lurín",
      destino1: "Granja Cañete Sur",
      destino2: "",
      destino3: "",
      cantidad: 18800,
      edadLotes: "Lote 233-B",
      galpon: "G-03",
      puntoCarga: "Andén 1",
      unidad: "T-092",
      placa: "F6Y-233",
      conductor: "Marco Antonio Flores",
      horaSalidaPlan: "06:30",
      horaCargaFinPlan: "06:50",
      esperaMaxMin: 20,
      horaRetornoPlan: "10:15",
      plantaRetorno: "Planta Incubación Lurín",
      estado: "Finalizado",
      horaSalidaReal: "06:33",
      horaLlegadaReal: "08:41",
      diasOffset: 0,
    },
    // --- Viaje multi-galpón: la misma unidad descarga en 3 galpones
    // distintos (destino1/2/3 + galpon/galpon2/galpon3) en una sola ruta. ---
    {
      dtSap: "0080012355",
      ruta: "R-014",
      planta: "Planta Incubación Lurín",
      destino1: "Granja Chincha Norte",
      destino2: "Granja Cañete Sur",
      destino3: "Granja Huaral",
      cantidad: 26000,
      edadLotes: "Lote 233-C",
      galpon: "G-08",
      galpon2: "G-03",
      galpon3: "G-99",
      puntoCarga: "Andén 3",
      unidad: "T-118",
      placa: "F4X-812",
      conductor: "Julio Ramírez Soto",
      horaSalidaPlan: "05:10",
      horaCargaFinPlan: "05:30",
      esperaMaxMin: 30,
      horaRetornoPlan: "10:00",
      plantaRetorno: "Planta Incubación Lurín",
      estado: "Finalizado",
      horaSalidaReal: "05:12",
      horaLlegadaReal: "08:20",
      diasOffset: -1,
    },
  ];

  const viajes = base.map((v, i) => {
    const id = uuid();
    const f = fecha(v.diasOffset ?? 0);

    // --- Datos de campaña, planificados en Programación (SAP) ---
    // El complex en sí (P{plantel}-{año}{rueda}-{galpón}-{sexo}) recién se
    // arma/confirma en Recepción en granja, cuando ese grupo de pollitos
    // BB efectivamente se recepciona — ver más abajo, junto a `granja`.
    const anioCampana = f.slice(2, 4);
    const rueda = String((i % 4) + 1);
    const sexoGalpon = i % 2 === 0 ? "hembra" : "macho";
    const sexoGalpon2 = v.destino2 ? (i % 2 === 0 ? "macho" : "hembra") : "";
    const sexoGalpon3 = v.destino3 ? (i % 2 === 0 ? "hembra" : "macho") : "";

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

    // --- Serie de temperatura ambiente en tránsito (sensor del proveedor / unidad) ---
    const transitoSerie = [];
    const transitoEventos = [];
    const transitoDatalogger = { fuente: null, dispositivoId: "", registradoPor: "", horaRegistro: "", serie: [] };
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

      // --- Datalogger independiente: contrasta al sensor del proveedor ---
      // Casos alternados a propósito para la demo: uno con lectura consistente
      // y otro con una desviación que dispara la alerta de discrepancia.
      const esDiscrepante = i % 3 === 1;
      const offset = esDiscrepante ? 1.1 : 0.15;
      transitoDatalogger.fuente = ["Finalizado", "En Granja"].includes(v.estado) ? "manual" : "tiempo_real";
      transitoDatalogger.dispositivoId = "DL-" + (2200 + i);
      transitoDatalogger.horaRegistro = v.horaLlegadaReal || v.horaSalidaReal || "";
      transitoDatalogger.registradoPor = transitoDatalogger.fuente === "manual" ? "Calidad · Transporte" : "";
      transitoDatalogger.serie = transitoSerie.map((s) => ({
        min: s.min,
        temp: +(s.temp + offset + (Math.random() - 0.5) * 0.2).toFixed(1),
      }));
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
        loteRecepcion: {
          plantel: v.destino1 || "",
          // SAP no llega a detalle de galpón: galpón y sexo del grupo se
          // digitan recién al recepcionar (acá, referenciales para la demo).
          galpon: v.galpon || "",
          sexoGalpon,
          campana: v.edadLotes || "",
          sexo: { F: fLote, M: mLote, total: totalLote },
          transporte: { cantidadDespachada, muertosTraslado, mortalidadPct },
          complex: construirComplex({ destino: v.destino1, anio: anioCampana, rueda, galpon: v.galpon, sexo: sexoGalpon }),
        },
        // Se mantiene por compatibilidad con index.html / bi.html / viaje.html,
        // que ya leen granja.mortalidad directamente. Siempre espejo del cálculo.
        mortalidad: mortalidadPct,
        muestrasLlegada: tempsLlegada.map((t, idx) => ({ n: idx + 1, tempCloacal: t, pesoG: pesos[idx], sexo: sexos[idx] })),
        pesoPromedioG: +promedio(pesos).toFixed(1),
        uniformidadPct: +(88 + Math.random() * 8).toFixed(1),
      };
    }

    const { diasOffset, ...vSinOffset } = v;
    return {
      id,
      fecha: f,
      ...vSinOffset,
      anioCampana,
      rueda,
      sexoGalpon,
      sexoGalpon2,
      sexoGalpon3,
      geocercas,
      cargaPlanta,
      transito: { serie: transitoSerie, eventos: transitoEventos, datalogger: transitoDatalogger },
      granja,
    };
  });

  return { viajes };
}

// --- SEED de checklists de galpón (independiente de los viajes) ---
function construirSelecciones(niveles, observacionesPorIndice = {}) {
  return CHECKLIST_ITEMS.map((item, idx) => ({
    seleccion: niveles[idx] ?? null,
    observaciones: observacionesPorIndice[idx] || "",
    activo: true,
  }));
}

function seedChecklists() {
  const checklists = {};

  const cl1 = {
    plantel: "Granja Chincha Norte",
    galpon: "G-08",
    fecha: fechaISO(-1),
    auditor: "Milagros Chávez Ríos",
    supervisor: UBICACION_POR_DESTINO["Granja Chincha Norte"].supervisor,
    firma: "Milagros Chávez Ríos",
    selecciones: construirSelecciones(
      [3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 3],
      {
        6: "Falta el segundo termohigrómetro; se gestiona antes de las 12h previas a la recepción.",
        15: "48 de 60 bebederos infantiles instalados; se completa el lote antes de la recepción.",
      }
    ),
  };

  const cl2 = {
    plantel: "Granja Cañete Sur",
    galpon: "G-03",
    fecha: fechaISO(-2),
    auditor: "Iván Salcedo Bravo",
    supervisor: UBICACION_POR_DESTINO["Granja Cañete Sur"].supervisor,
    firma: "Iván Salcedo Bravo",
    selecciones: construirSelecciones(
      [3, 2, 2, 3, 2, 3, 2, 2, 1, 3, 3, 2, 3, 0, 3, 2, 2],
      { 13: "Solo 5 de 8 filas de papel Kraft disponibles; se refuerza antes de la recepción." }
    ),
  };

  const cl3 = {
    plantel: "Granja Huaral",
    galpon: "G-05",
    fecha: fechaISO(0),
    auditor: "Fiorella Ramos Ibáñez",
    supervisor: UBICACION_POR_DESTINO["Granja Huaral"].supervisor,
    firma: "",
    // Visita técnica en curso: solo los primeros 10 ítems evaluados.
    selecciones: construirSelecciones([3, 2, 3, 2, 3, 2, 2, 3, 1, 2]),
  };

  const cl4 = {
    plantel: "Granja Ica Km 302",
    galpon: "G-11",
    fecha: fechaISO(-1),
    auditor: "Milagros Chávez Ríos",
    supervisor: UBICACION_POR_DESTINO["Granja Ica Km 302"].supervisor,
    firma: "Milagros Chávez Ríos",
    selecciones: construirSelecciones(
      [3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      { 3: "Falta 1 foco en el sector norte del galpón; se repone antes de la recepción." }
    ),
  };

  const cl5 = {
    plantel: "Granja Cañete Sur",
    galpon: "G-06",
    fecha: fechaISO(-2),
    auditor: "Iván Salcedo Bravo",
    supervisor: UBICACION_POR_DESTINO["Granja Cañete Sur"].supervisor,
    firma: "Iván Salcedo Bravo",
    selecciones: construirSelecciones(
      [2, 3, 2, 2, 3, 2, 2, 3, 1, 2, 3, 3, 3, 0, 2, 3, 2],
      { 13: "Solo 4 de 8 filas de papel Kraft disponibles; se refuerza antes de la recepción." }
    ),
  };

  const cl6 = {
    plantel: "Granja Chincha Norte",
    galpon: "G-09",
    fecha: fechaISO(-2),
    auditor: "Fiorella Ramos Ibáñez",
    supervisor: UBICACION_POR_DESTINO["Granja Chincha Norte"].supervisor,
    firma: "Fiorella Ramos Ibáñez",
    selecciones: construirSelecciones([3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2]),
  };

  // Nota: "Granja Huaral · G-99" (3er galpón del viaje multi-galpón
  // 0080012355) queda deliberadamente sin checklist, para mostrar el
  // estado "Sin checklist" junto a los otros dos galpones del mismo viaje.

  [cl1, cl2, cl3, cl4, cl5, cl6].forEach((cl) => {
    checklists[checklistKey(cl.plantel, cl.galpon)] = cl;
  });

  return checklists;
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
  TOLERANCIA_DATALOGGER_C,
  CHECKLIST_ITEMS,
  CHECKLIST_PESO_TOTAL,
  CHECKLIST_UMBRAL,
  CHECKLIST_ESTADO_LABEL,
  CHECKLIST_ESTADO_BADGE,
  clasificarTemp,
  promedio,
  maximo,
  minimo,
  desviacionEstandar,
  calcularMortalidad,
  validarControlLlegada,
  tasaCrecimientoPct,
  contrastarDatalogger,
  calcularChecklist,
  clasificarChecklist,
  destinosGalpones,
  UBICACION_POR_DESTINO,
  SEXO_COMPLEX_CODIGO,
  extraerNumeroGalpon,
  construirComplex,

  init() {
    if (!localStorage.getItem(DB_KEY)) {
      localStorage.setItem(DB_KEY, JSON.stringify(seedData()));
    }
    if (!localStorage.getItem(CHECKLIST_DB_KEY)) {
      localStorage.setItem(CHECKLIST_DB_KEY, JSON.stringify(seedChecklists()));
    }
  },

  reset() {
    localStorage.setItem(DB_KEY, JSON.stringify(seedData()));
    localStorage.setItem(CHECKLIST_DB_KEY, JSON.stringify(seedChecklists()));
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
    viaje.transito = viaje.transito || { serie: [], eventos: [], datalogger: { fuente: null, dispositivoId: "", registradoPor: "", horaRegistro: "", serie: [] } };
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

  // --- Checklist de preparación de galpones (FICYB004 v2) ---
  _readChecklists() {
    return JSON.parse(localStorage.getItem(CHECKLIST_DB_KEY) || "{}");
  },

  _writeChecklists(all) {
    localStorage.setItem(CHECKLIST_DB_KEY, JSON.stringify(all));
  },

  getChecklists() {
    return this._readChecklists();
  },

  getChecklist(plantel, galpon) {
    return this._readChecklists()[checklistKey(plantel, galpon)] || null;
  },

  saveChecklist(checklist) {
    const all = this._readChecklists();
    all[checklistKey(checklist.plantel, checklist.galpon)] = checklist;
    this._writeChecklists(all);
    return checklist;
  },

  checklistVacio(plantel, galpon) {
    return {
      plantel: plantel || "",
      galpon: galpon || "",
      fecha: "",
      auditor: "",
      supervisor: "",
      firma: "",
      selecciones: CHECKLIST_ITEMS.map(() => ({ seleccion: null, observaciones: "", activo: true })),
    };
  },
};

window.Store = Store;
