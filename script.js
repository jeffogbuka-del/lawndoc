/*
  LAWN WEATHER DISEASE ENGINE - VERSION 3
  ---------------------------------------
  MVP diseases:
    - Brown Patch
    - Pythium Blight
    - Dollar Spot
    - Gray Leaf Spot
    - Red Thread
    - Rust

  Customer-facing disease cards show ONLY:
    - Risk
    - Prediction Confidence

  IMPORTANT:
  Risk means weather-based environmental favorability, not diagnosis.
*/

// ---------------------------------------------------------------------------
// 1. SELECTABLE SERVICE LOCATIONS
// ---------------------------------------------------------------------------

// Representative points for the first four service regions.
// Maryland and Virginia use their state capitals for this first version.
const LOCATIONS = {
  "washington-dc": {
    name: "Washington, DC",
    latitude: 38.9072,
    longitude: -77.0369
  },
  maryland: {
    name: "Maryland — Annapolis",
    latitude: 38.9784,
    longitude: -76.4922
  },
  virginia: {
    name: "Virginia — Richmond",
    latitude: 37.5407,
    longitude: -77.4360
  },
  dallas: {
    name: "Dallas, Texas",
    latitude: 32.7767,
    longitude: -96.7970
  }
};

let selectedLocationKey = "washington-dc";

const NUMBER_OF_FORECAST_CARDS = 5;
const HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 2. PAGE ELEMENTS
// ---------------------------------------------------------------------------

const serviceAreaElement = document.getElementById("service-area");
const statusElement = document.getElementById("status");
const lastUpdatedElement = document.getElementById("last-updated");
const forecastGridElement = document.getElementById("forecast-grid");
const refreshButton = document.getElementById("refresh-button");
const locationSelectElement = document.getElementById("location-select");
const diseaseGridElement = document.getElementById("disease-grid");
const dataAvailabilityElement = document.getElementById("data-availability");
const metricsBodyElement = document.getElementById("metrics-body");

locationSelectElement.value = selectedLocationKey;
serviceAreaElement.textContent = LOCATIONS[selectedLocationKey].name;

// ---------------------------------------------------------------------------
// 3. HTTP HELPER
// ---------------------------------------------------------------------------

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Weather request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// 4. MAIN LOAD
// ---------------------------------------------------------------------------

async function loadWeather() {
  setLoadingState(true);
  clearError();

  try {
    const serviceLocation = LOCATIONS[selectedLocationKey];
    serviceAreaElement.textContent = serviceLocation.name;

    const pointsUrl =
      `https://api.weather.gov/points/` +
      `${serviceLocation.latitude},${serviceLocation.longitude}`;

    const pointsData = await getJson(pointsUrl);

    const forecastUrl = pointsData.properties.forecast;
    const gridDataUrl = pointsData.properties.forecastGridData;
    const timeZone = pointsData.properties.timeZone || "UTC";

    if (!forecastUrl || !gridDataUrl) {
      throw new Error("NWS did not return the required forecast endpoints.");
    }

    const [forecastData, gridData] = await Promise.all([
      getJson(forecastUrl),
      getJson(gridDataUrl)
    ]);

    const periods =
      forecastData.properties.periods.slice(0, NUMBER_OF_FORECAST_CARDS);

    displayForecast(periods);

    const hourlyRecords = buildHourlyRecords(gridData.properties);

    if (hourlyRecords.length < 24) {
      throw new Error("Not enough hourly NWS grid data was available.");
    }

    const qpfPeriods =
      buildQpfPeriods(gridData.properties.quantitativePrecipitation);

    markEstimatedWetHours(hourlyRecords, qpfPeriods);

    const diseaseResults = evaluateAllDiseases(
      hourlyRecords,
      timeZone
    );

    displayDiseaseResults(diseaseResults);
    displayDataAvailability(gridData.properties, hourlyRecords);
    displayFeatureWindows(gridData.properties, hourlyRecords);

    const updateTime =
      gridData.properties.updateTime || forecastData.properties.updated;

    lastUpdatedElement.textContent = updateTime
      ? `NWS grid forecast updated: ${new Date(updateTime).toLocaleString()}`
      : `Page refreshed: ${new Date().toLocaleString()}`;

    statusElement.textContent =
      "NWS forecast and lawn disease risk calculations loaded successfully.";

  } catch (error) {
    console.error("Weather/model loading error:", error);

    showError(
      "The weather or disease outlook could not be loaded. Open the browser " +
      "console for the detailed error, then try Refresh forecast."
    );

    forecastGridElement.innerHTML = "";
    diseaseGridElement.innerHTML =
      `<div class="loading-card">Disease outlook unavailable.</div>`;
    dataAvailabilityElement.innerHTML = "";
    metricsBodyElement.innerHTML =
      `<tr><td colspan="10">Weather metrics unavailable.</td></tr>`;
    lastUpdatedElement.textContent = "";
  } finally {
    setLoadingState(false);
  }
}

// ---------------------------------------------------------------------------
// 5. NORMAL FORECAST CARDS
// ---------------------------------------------------------------------------

function displayForecast(periods) {
  forecastGridElement.innerHTML = "";

  periods.forEach((period) => {
    const rainChance =
      period.probabilityOfPrecipitation?.value ?? "Not available";

    const card = document.createElement("article");
    card.className = "forecast-card";

    const periodName = document.createElement("h3");
    periodName.textContent = period.name;

    const temperature = document.createElement("p");
    temperature.className = "temperature";
    temperature.textContent =
      `${period.temperature}°${period.temperatureUnit}`;

    const summary = document.createElement("p");
    summary.className = "forecast-detail";
    summary.textContent = period.shortForecast;

    const rain = document.createElement("p");
    rain.className = "forecast-detail";
    rain.textContent = rainChance === "Not available"
      ? "Rain chance: Not available"
      : `Rain chance: ${rainChance}%`;

    const wind = document.createElement("p");
    wind.className = "forecast-detail";
    wind.textContent = `Wind: ${period.windSpeed} ${period.windDirection}`;

    card.append(periodName, temperature, summary, rain, wind);
    forecastGridElement.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// 6. NWS INTERVAL PARSING
// ---------------------------------------------------------------------------

function parseIsoDurationToMs(durationText) {
  if (!durationText) return HOUR_MS;

  const match = durationText.match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
  );

  if (!match) {
    console.warn("Unrecognized ISO duration:", durationText);
    return HOUR_MS;
  }

  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);

  return (
    days * 24 * HOUR_MS +
    hours * HOUR_MS +
    minutes * 60 * 1000 +
    seconds * 1000
  );
}

function parseValidTime(validTime) {
  const [startText, durationText] = validTime.split("/");
  const start = new Date(startText);
  const durationMs = parseIsoDurationToMs(durationText);

  return {
    start,
    end: new Date(start.getTime() + durationMs),
    durationMs
  };
}

function hourKey(date) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function expandLayerToHourly(layer, converter = (value) => value) {
  const map = new Map();

  if (!layer?.values) return map;

  layer.values.forEach((entry) => {
    if (entry.value === null || entry.value === undefined) return;

    const { start, durationMs } = parseValidTime(entry.validTime);
    const hourCount = Math.max(1, Math.ceil(durationMs / HOUR_MS));

    for (let i = 0; i < hourCount; i += 1) {
      const timestamp = new Date(start.getTime() + i * HOUR_MS);
      map.set(hourKey(timestamp), converter(entry.value, layer.uom));
    }
  });

  return map;
}

// ---------------------------------------------------------------------------
// 7. UNIT CONVERSION
// ---------------------------------------------------------------------------

function temperatureToF(value, uom = "") {
  if (value === null || value === undefined) return null;
  return uom.includes("degC") ? value * 9 / 5 + 32 : value;
}

function fToC(valueF) {
  return (valueF - 32) * 5 / 9;
}

function windToMph(value, uom = "") {
  if (value === null || value === undefined) return null;

  if (uom.includes("km_h") || uom.includes("km/h")) {
    return value / 1.609344;
  }

  if (uom.includes("m_s") || uom.includes("m/s")) {
    return value * 2.236936;
  }

  return value;
}

function precipitationToInches(value, uom = "") {
  if (value === null || value === undefined) return null;
  if (uom.includes("mm")) return value / 25.4;
  if (uom.includes("cm")) return value / 2.54;

  if (uom.includes("m") && !uom.includes("mm") && !uom.includes("cm")) {
    return value * 39.3701;
  }

  return value;
}

// ---------------------------------------------------------------------------
// 8. BUILD HOURLY WEATHER TABLE
// ---------------------------------------------------------------------------

function buildHourlyRecords(properties) {
  const temperatureMap = expandLayerToHourly(
    properties.temperature,
    temperatureToF
  );

  const rhMap = expandLayerToHourly(properties.relativeHumidity);

  const dewpointMap = expandLayerToHourly(
    properties.dewpoint,
    temperatureToF
  );

  const windMap = expandLayerToHourly(
    properties.windSpeed,
    windToMph
  );

  const skyMap = expandLayerToHourly(properties.skyCover);
  const popMap = expandLayerToHourly(properties.probabilityOfPrecipitation);

  const records = [...temperatureMap.keys()]
    .sort()
    .map((timestamp) => {
      const temperatureF = temperatureMap.get(timestamp) ?? null;
      const dewpointF = dewpointMap.get(timestamp) ?? null;

      return {
        time: new Date(timestamp),
        temperatureF,
        rh: rhMap.get(timestamp) ?? null,
        dewpointF,
        dewSpreadF:
          temperatureF !== null && dewpointF !== null
            ? temperatureF - dewpointF
            : null,
        windMph: windMap.get(timestamp) ?? null,
        skyCover: skyMap.get(timestamp) ?? null,
        pop: popMap.get(timestamp) ?? null,
        qpfWet: false,
        estimatedWet: false
      };
    });

  const cutoff = Date.now() - HOUR_MS;

  return records.filter(
    (record) => record.time.getTime() >= cutoff
  );
}

// ---------------------------------------------------------------------------
// 9. QPF / PRECIPITATION PERIODS
// ---------------------------------------------------------------------------

function buildQpfPeriods(qpfLayer) {
  if (!qpfLayer?.values) return [];

  return qpfLayer.values
    .filter(
      (entry) =>
        entry.value !== null &&
        entry.value !== undefined
    )
    .map((entry) => {
      const timing = parseValidTime(entry.validTime);

      return {
        start: timing.start,
        end: timing.end,
        durationMs: timing.durationMs,
        inches: precipitationToInches(entry.value, qpfLayer.uom)
      };
    });
}

function qpfForWindow(qpfPeriods, start, end) {
  let total = 0;

  qpfPeriods.forEach((period) => {
    const overlapStart = Math.max(start.getTime(), period.start.getTime());
    const overlapEnd = Math.min(end.getTime(), period.end.getTime());
    const overlapMs = Math.max(0, overlapEnd - overlapStart);

    if (overlapMs <= 0 || period.durationMs <= 0) return;

    total += period.inches * (overlapMs / period.durationMs);
  });

  return total;
}

/*
  Estimated wetness proxy for the MVP.

  An hour is treated as wetness-favorable when either:
    A) NWS QPF indicates liquid precipitation in the overlapping period, OR
    B) RH >= 90% AND temperature is within 3°F of dew point.

  This is intentionally called ESTIMATED wetness. It is not a physical
  leaf-wetness measurement and therefore lowers confidence for models that
  depend on wetness duration.
*/
function markEstimatedWetHours(records, qpfPeriods) {
  records.forEach((record) => {
    const hourStart = record.time.getTime();
    const hourEnd = hourStart + HOUR_MS;

    const qpfWet = qpfPeriods.some((period) => {
      if (period.inches <= 0) return false;

      return (
        Math.max(hourStart, period.start.getTime()) <
        Math.min(hourEnd, period.end.getTime())
      );
    });

    record.qpfWet = qpfWet;

    const dewWet =
      record.rh !== null &&
      record.rh >= 90 &&
      record.dewSpreadF !== null &&
      record.dewSpreadF <= 3;

    record.estimatedWet = qpfWet || dewWet;
  });
}

// ---------------------------------------------------------------------------
// 10. GENERAL FEATURE HELPERS
// ---------------------------------------------------------------------------

function nonNull(values) {
  return values.filter(
    (value) =>
      value !== null &&
      value !== undefined &&
      Number.isFinite(value)
  );
}

function average(values) {
  const usable = nonNull(values);
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function minValue(values) {
  const usable = nonNull(values);
  return usable.length ? Math.min(...usable) : null;
}

function maxValue(values) {
  const usable = nonNull(values);
  return usable.length ? Math.max(...usable) : null;
}

function longestConsecutiveRun(records, predicate) {
  let longest = 0;
  let current = 0;

  records.forEach((record) => {
    if (predicate(record)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });

  return longest;
}

function countWhere(records, predicate) {
  return records.reduce(
    (count, record) => predicate(record) ? count + 1 : count,
    0
  );
}

function localParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour)
  };
}

function localDateKey(date, timeZone) {
  const p = localParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function previousDateKey(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - 1);

  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function groupByLocalCalendarDay(records, timeZone) {
  const groups = new Map();

  records.forEach((record) => {
    const key = localDateKey(record.time, timeZone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({ key, records: values }));
}

/*
  Pythium's published forecasting day runs noon-to-noon.
  Hours before local noon belong to the previous forecasting day.
*/
function groupByNoonToNoon(records, timeZone) {
  const groups = new Map();

  records.forEach((record) => {
    const p = localParts(record.time, timeZone);

    const key = p.hour >= 12
      ? `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
      : previousDateKey(p.year, p.month, p.day);

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({ key, records: values }));
}

function lowerConfidence(level) {
  if (level === "High") return "Moderate";
  if (level === "Moderate") return "Low";
  return "Low";
}

function requiredCoverage(records, fieldNames) {
  if (!records.length) return 0;

  const expected = records.length * fieldNames.length;
  let available = 0;

  records.forEach((record) => {
    fieldNames.forEach((field) => {
      if (record[field] !== null && record[field] !== undefined) {
        available += 1;
      }
    });
  });

  return expected ? available / expected : 0;
}

function confidenceWithCoverage(base, coverage) {
  if (coverage >= 0.90) return base;
  if (coverage >= 0.70) return lowerConfidence(base);
  return "Low";
}

function riskRank(risk) {
  return {
    Low: 0,
    Watch: 1,
    Elevated: 2,
    High: 3
  }[risk] ?? 0;
}

function highestRisk(results) {
  return results.reduce(
    (best, current) =>
      riskRank(current.risk) > riskRank(best.risk) ? current : best,
    { risk: "Low" }
  );
}

// ---------------------------------------------------------------------------
// 11. BROWN PATCH
// ---------------------------------------------------------------------------

/*
  Published E2 warning model:

    E = -21.5 + 0.15(RH) + 1.4(T) - 0.033(T^2)

  RH = mean daily relative humidity (%)
  T  = minimum daily air temperature (°C)
  Published warning threshold: E >= 6

  MVP display convention:
    E < 5                       -> Low
    5 <= E < 6                 -> Watch  (engineering early-warning buffer)
    E >= 6 on one forecast day -> Elevated
    E >= 6 on >=2 forecast days-> High   (engineering persistence class)
*/
function evaluateBrownPatch(records, timeZone) {
  const days = groupByLocalCalendarDay(records, timeZone)
    .filter((day) => day.records.length >= 20)
    .slice(0, 4);

  const evaluated = days.map((day) => {
    const meanRH = average(day.records.map((r) => r.rh));
    const minTempF = minValue(day.records.map((r) => r.temperatureF));

    if (meanRH === null || minTempF === null) {
      return { risk: "Low", e: null };
    }

    const tC = fToC(minTempF);
    const e = -21.5 + 0.15 * meanRH + 1.4 * tC - 0.033 * tC * tC;

    let risk = "Low";
    if (e >= 6) risk = "Elevated";
    else if (e >= 5) risk = "Watch";

    return { risk, e };
  });

  const warningDays = evaluated.filter((item) => item.e !== null && item.e >= 6).length;
  let risk = highestRisk(evaluated).risk;
  if (warningDays >= 2) risk = "High";

  const relevant = days.flatMap((day) => day.records);
  const coverage = requiredCoverage(relevant, ["temperatureF", "rh"]);

  return {
    disease: "Brown Patch",
    risk,
    confidence: confidenceWithCoverage("High", coverage)
  };
}

// ---------------------------------------------------------------------------
// 12. PYTHIUM BLIGHT
// ---------------------------------------------------------------------------

/*
  Published warning conditions:
    - maximum daily temperature > 86°F (30°C)
    - minimum temperature > 68°F (20°C)
    - >=14 hours RH > 90%
    - published forecasting day: noon-to-noon

  MVP display convention:
    Full published threshold met         -> Elevated
    Full threshold met in >=2 windows    -> High
    Temperature criteria met + 10-13 h RH>90 -> Watch
*/
function evaluatePythium(records, timeZone) {
  const windows = groupByNoonToNoon(records, timeZone)
    .filter((window) => window.records.length >= 20)
    .slice(0, 4);

  const evaluated = windows.map((window) => {
    const maxTemp = maxValue(window.records.map((r) => r.temperatureF));
    const minTemp = minValue(window.records.map((r) => r.temperatureF));
    const longestRH90 = longestConsecutiveRun(
      window.records,
      (r) => r.rh !== null && r.rh > 90
    );

    const tempCriteria =
      maxTemp !== null &&
      minTemp !== null &&
      maxTemp > 86 &&
      minTemp > 68;

    let risk = "Low";

    if (tempCriteria && longestRH90 >= 14) {
      risk = "Elevated";
    } else if (tempCriteria && longestRH90 >= 10) {
      risk = "Watch";
    }

    return { risk, fullWarning: tempCriteria && longestRH90 >= 14 };
  });

  const fullWarnings = evaluated.filter((item) => item.fullWarning).length;
  let risk = highestRisk(evaluated).risk;
  if (fullWarnings >= 2) risk = "High";

  const relevant = windows.flatMap((window) => window.records);
  const coverage = requiredCoverage(relevant, ["temperatureF", "rh"]);

  return {
    disease: "Pythium Blight",
    risk,
    confidence: confidenceWithCoverage("High", coverage)
  };
}

// ---------------------------------------------------------------------------
// 13. DOLLAR SPOT
// ---------------------------------------------------------------------------

/*
  Published ATRH logistic model (FUNG = 0 for untreated turf):

    logit(mu) = -11.404 + 0.089(RH5) + 0.193(AT5)

  RH5 = five-day moving average daily RH (%)
  AT5 = five-day moving average daily mean air temperature (°C)

  probability = 1 / (1 + exp(-logit))

  Published action threshold: 20%.

  IMPORTANT MVP ADAPTATION:
  The published system uses a five-day moving weather history. GitHub Pages
  does not yet persist historical weather, so this version applies the same
  equation to rolling five-day FORECAST averages as a forward pressure
  estimate. Confidence is therefore Moderate rather than High.

  MVP display convention:
    probability < 10%            -> Low
    10% <= probability < 20%     -> Watch
    probability >= 20%           -> Elevated
    >=20% in >=2 rolling windows -> High
*/
function evaluateDollarSpot(records, timeZone) {
  const days = groupByLocalCalendarDay(records, timeZone)
    .filter((day) => day.records.length >= 20)
    .map((day) => ({
      key: day.key,
      meanTempF: average(day.records.map((r) => r.temperatureF)),
      meanRH: average(day.records.map((r) => r.rh)),
      records: day.records
    }))
    .filter((day) => day.meanTempF !== null && day.meanRH !== null);

  const windows = [];

  for (let i = 0; i <= days.length - 5; i += 1) {
    const slice = days.slice(i, i + 5);
    const rh5 = average(slice.map((day) => day.meanRH));
    const at5C = average(slice.map((day) => fToC(day.meanTempF)));

    const logit = -11.404 + 0.089 * rh5 + 0.193 * at5C;
    const probability = 1 / (1 + Math.exp(-logit));

    let risk = "Low";
    if (probability >= 0.20) risk = "Elevated";
    else if (probability >= 0.10) risk = "Watch";

    windows.push({ risk, probability });
  }

  if (!windows.length) {
    return {
      disease: "Dollar Spot",
      risk: "Low",
      confidence: "Low"
    };
  }

  const actionWindows = windows.filter((item) => item.probability >= 0.20).length;
  let risk = highestRisk(windows).risk;
  if (actionWindows >= 2) risk = "High";

  const relevant = days.flatMap((day) => day.records);
  const coverage = requiredCoverage(relevant, ["temperatureF", "rh"]);

  return {
    disease: "Dollar Spot",
    risk,
    confidence: confidenceWithCoverage("Moderate", coverage)
  };
}

// ---------------------------------------------------------------------------
// 14. GRAY LEAF SPOT
// ---------------------------------------------------------------------------

/*
  Research basis:
    - temperature x leaf-wetness-duration interaction
    - experimental temperatures: 20, 24, 28, 32°C (68, 75, 82, 90°F)
    - 28°C (~82°F) was most favorable in the referenced study
    - disease increased as leaf wetness duration increased

  NWS does not measure turf leaf wetness. This model uses estimatedWet.

  Engineering classification for the first MVP:
    favorable estimated-wet hours in 68-90°F over next 72h
      <3 h   -> Low
      3-8 h  -> Watch
      9-17 h -> Elevated
      >=18 h -> High

  These category boundaries are engineering assumptions, not published
  field action thresholds. Prediction confidence is therefore Moderate.
*/
function evaluateGrayLeafSpot(records) {
  const next72 = records.slice(0, 72);

  const favorableWetHours = countWhere(
    next72,
    (r) =>
      r.estimatedWet &&
      r.temperatureF !== null &&
      r.temperatureF >= 68 &&
      r.temperatureF <= 90
  );

  let risk = "Low";
  if (favorableWetHours >= 18) risk = "High";
  else if (favorableWetHours >= 9) risk = "Elevated";
  else if (favorableWetHours >= 3) risk = "Watch";

  const coverage = requiredCoverage(
    next72,
    ["temperatureF", "rh", "dewpointF"]
  );

  return {
    disease: "Gray Leaf Spot",
    risk,
    confidence: confidenceWithCoverage("Moderate", coverage)
  };
}

// ---------------------------------------------------------------------------
// 15. RED THREAD
// ---------------------------------------------------------------------------

/*
  Literature-supported broad environment:
    - air temperatures around 65-75°F
    - prolonged rainy or humid weather

  No quantitative field warning equation has been adopted here.

  MVP engineering proxy over next 72h:
    favorable hour = 65-75°F AND (RH >=85% OR estimatedWet)

      <6 h    -> Low
      6-17 h  -> Watch
      18-35 h -> Elevated
      >=36 h  -> High

  Important missing site modifier: turf fertility/vigor.
  Confidence remains Low.
*/
function evaluateRedThread(records) {
  const next72 = records.slice(0, 72);

  const favorableHours = countWhere(
    next72,
    (r) =>
      r.temperatureF !== null &&
      r.temperatureF >= 65 &&
      r.temperatureF <= 75 &&
      (
        (r.rh !== null && r.rh >= 85) ||
        r.estimatedWet
      )
  );

  let risk = "Low";
  if (favorableHours >= 36) risk = "High";
  else if (favorableHours >= 18) risk = "Elevated";
  else if (favorableHours >= 6) risk = "Watch";

  const coverage = requiredCoverage(
    next72,
    ["temperatureF", "rh", "dewpointF"]
  );

  return {
    disease: "Red Thread",
    risk,
    confidence: confidenceWithCoverage("Low", coverage)
  };
}

// ---------------------------------------------------------------------------
// 16. RUST
// ---------------------------------------------------------------------------

/*
  Broad turf-rust environment used for this MVP:
    - moderate/warm temperatures
    - prolonged dew/wet foliage / humid mornings
    - slow-growing or nutrient-stressed turf raises susceptibility

  NWS cannot observe turf vigor or fertility.

  MVP engineering proxy over next 72h:
    favorable hour = 65-85°F AND (RH >=85% OR estimatedWet)

      <6 h    -> Low
      6-17 h  -> Watch
      18-29 h -> Elevated
      >=30 h  -> High

  Confidence remains Low because this is environmental favorability only.
*/
function evaluateRust(records) {
  const next72 = records.slice(0, 72);

  const favorableHours = countWhere(
    next72,
    (r) =>
      r.temperatureF !== null &&
      r.temperatureF >= 65 &&
      r.temperatureF <= 85 &&
      (
        (r.rh !== null && r.rh >= 85) ||
        r.estimatedWet
      )
  );

  let risk = "Low";
  if (favorableHours >= 30) risk = "High";
  else if (favorableHours >= 18) risk = "Elevated";
  else if (favorableHours >= 6) risk = "Watch";

  const coverage = requiredCoverage(
    next72,
    ["temperatureF", "rh", "dewpointF"]
  );

  return {
    disease: "Rust",
    risk,
    confidence: confidenceWithCoverage("Low", coverage)
  };
}

// ---------------------------------------------------------------------------
// 17. RUN ALL DISEASE MODELS
// ---------------------------------------------------------------------------

function evaluateAllDiseases(records, timeZone) {
  return [
    evaluateBrownPatch(records, timeZone),
    evaluatePythium(records, timeZone),
    evaluateDollarSpot(records, timeZone),
    evaluateGrayLeafSpot(records),
    evaluateRedThread(records),
    evaluateRust(records)
  ];
}

function riskClass(risk) {
  return `risk-${risk.toLowerCase()}`;
}

function displayDiseaseResults(results) {
  diseaseGridElement.innerHTML = "";

  results.forEach((result) => {
    const card = document.createElement("article");
    card.className = `disease-card ${riskClass(result.risk)}`;

    const heading = document.createElement("h3");
    heading.textContent = result.disease;

    const riskRow = document.createElement("div");
    riskRow.className = "disease-result-row";

    const riskLabel = document.createElement("span");
    riskLabel.textContent = "Risk";

    const riskValue = document.createElement("span");
    riskValue.className = "result-value";
    riskValue.textContent = result.risk;

    riskRow.append(riskLabel, riskValue);

    const confidenceRow = document.createElement("div");
    confidenceRow.className = "disease-result-row";

    const confidenceLabel = document.createElement("span");
    confidenceLabel.textContent = "Prediction Confidence";

    const confidenceValue = document.createElement("span");
    confidenceValue.className = "result-value";
    confidenceValue.textContent = result.confidence;

    confidenceRow.append(confidenceLabel, confidenceValue);

    card.append(heading, riskRow, confidenceRow);
    diseaseGridElement.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// 18. DEVELOPMENT METRICS PANEL
// ---------------------------------------------------------------------------

function calculateWindowMetrics(allRecords, qpfPeriods, start, hours) {
  const end = new Date(start.getTime() + hours * HOUR_MS);

  const records = allRecords.filter(
    (record) => record.time >= start && record.time < end
  );

  return {
    hoursRequested: hours,
    minTempF: minValue(records.map((record) => record.temperatureF)),
    maxTempF: maxValue(records.map((record) => record.temperatureF)),
    meanRH: average(records.map((record) => record.rh)),
    hoursRh80: countWhere(
      records,
      (record) => record.rh !== null && record.rh >= 80
    ),
    hoursRh90: countWhere(
      records,
      (record) => record.rh !== null && record.rh >= 90
    ),
    longestRh90: longestConsecutiveRun(
      records,
      (record) => record.rh !== null && record.rh >= 90
    ),
    minDewSpreadF: minValue(records.map((record) => record.dewSpreadF)),
    qpfInches: qpfForWindow(qpfPeriods, start, end),
    meanWindMph: average(records.map((record) => record.windMph))
  };
}

function layerCoverage(records, fieldName) {
  if (!records.length) return 0;

  const available = records.filter(
    (record) => record[fieldName] !== null && record[fieldName] !== undefined
  ).length;

  return Math.round(available / records.length * 100);
}

function availabilityStatus(coverage) {
  if (coverage >= 90) return "available";
  if (coverage > 0) return "partial";
  return "unavailable";
}

function availabilityLabel(coverage) {
  if (coverage >= 90) return "Available";
  if (coverage > 0) return "Partial";
  return "Unavailable";
}

function displayDataAvailability(properties, hourlyRecords) {
  const first72 = hourlyRecords.slice(0, 72);

  const items = [
    { label: "Temperature", coverage: layerCoverage(first72, "temperatureF") },
    { label: "Relative humidity", coverage: layerCoverage(first72, "rh") },
    { label: "Dew point", coverage: layerCoverage(first72, "dewpointF") },
    { label: "Wind speed", coverage: layerCoverage(first72, "windMph") },
    { label: "Sky cover", coverage: layerCoverage(first72, "skyCover") },
    { label: "Precipitation probability", coverage: layerCoverage(first72, "pop") },
    {
      label: "Quantitative precipitation",
      coverage: properties.quantitativePrecipitation?.values?.length ? 100 : 0
    }
  ];

  dataAvailabilityElement.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "availability-card";

    const name = document.createElement("strong");
    name.textContent = item.label;

    const status = document.createElement("span");
    status.className = availabilityStatus(item.coverage);
    status.textContent =
      `${availabilityLabel(item.coverage)} (${item.coverage}%)`;

    card.append(name, status);
    dataAvailabilityElement.appendChild(card);
  });
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(digits);
}

function displayFeatureWindows(properties, hourlyRecords) {
  const start = hourlyRecords[0].time;
  const qpfPeriods = buildQpfPeriods(properties.quantitativePrecipitation);

  const metrics = [24, 48, 72].map((hours) =>
    calculateWindowMetrics(hourlyRecords, qpfPeriods, start, hours)
  );

  metricsBodyElement.innerHTML = "";

  metrics.forEach((metric) => {
    const row = document.createElement("tr");

    const cells = [
      `Next ${metric.hoursRequested} h`,
      `${formatNumber(metric.minTempF)}°F`,
      `${formatNumber(metric.maxTempF)}°F`,
      `${formatNumber(metric.meanRH)}%`,
      `${metric.hoursRh80} h`,
      `${metric.hoursRh90} h`,
      `${metric.longestRh90} h`,
      `${formatNumber(metric.minDewSpreadF)}°F`,
      `${formatNumber(metric.qpfInches, 2)} in`,
      `${formatNumber(metric.meanWindMph)} mph`
    ];

    cells.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    metricsBodyElement.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// 19. PAGE STATE
// ---------------------------------------------------------------------------

function setLoadingState(isLoading) {
  refreshButton.disabled = isLoading;
  locationSelectElement.disabled = isLoading;

  if (isLoading) {
    refreshButton.textContent = "Loading...";
    statusElement.textContent =
      "Requesting the latest NWS forecast and recalculating disease risk...";
  } else {
    refreshButton.textContent = "Refresh forecast";
  }
}

function showError(message) {
  statusElement.textContent = message;
  statusElement.classList.add("error");
}

function clearError() {
  statusElement.classList.remove("error");
}

// ---------------------------------------------------------------------------
// 20. STARTUP + AUTO-REFRESH
// ---------------------------------------------------------------------------

loadWeather();

refreshButton.addEventListener("click", loadWeather);

locationSelectElement.addEventListener("change", (event) => {
  selectedLocationKey = event.target.value;
  serviceAreaElement.textContent = LOCATIONS[selectedLocationKey].name;

  // Clear the prior location's results while the new NWS request runs.
  forecastGridElement.innerHTML = "";
  diseaseGridElement.innerHTML =
    `<div class="loading-card">Recalculating disease risk...</div>`;
  lastUpdatedElement.textContent = "";

  loadWeather();
});

setInterval(loadWeather, 30 * 60 * 1000);
