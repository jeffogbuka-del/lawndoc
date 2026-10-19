/*
  LAWN DOCTOR WEATHERWISE - SPONSOR DEMO VERSION 7
  ---------------------------------------------------------
  Sponsor-facing improvements:
    - Four preset regions plus U.S. ZIP lookup
    - ZIP -> representative coordinates -> NWS /points workflow
    - Five-period forecast cards
    - Responsive mobile presentation
    - Overall lawn health outlook
    - Expandable disease cards with risk, confidence, trend, and drivers
    - 1-day / 7-day Lawn Dryness Outlook
    - External Lawn Doctor services link

  Disease risk logic remains weather-based environmental favorability,
  not diagnosis of disease on a specific lawn.
*/

// ---------------------------------------------------------------------------
// 1. LOCATIONS + APPLICATION STATE
// ---------------------------------------------------------------------------

const LOCATIONS = {
  "washington-dc": {
    name: "Washington, DC",
    latitude: 38.9072,
    longitude: -77.0369,
    source: "Preset region"
  },
  maryland: {
    name: "Maryland — Annapolis",
    latitude: 38.9784,
    longitude: -76.4922,
    source: "Preset region"
  },
  virginia: {
    name: "Virginia — Richmond",
    latitude: 37.5407,
    longitude: -77.4360,
    source: "Preset region"
  },
  dallas: {
    name: "Dallas, Texas",
    latitude: 32.7767,
    longitude: -96.7970,
    source: "Preset region"
  }
};

let selectedLocationKey = "washington-dc";
let activeLocation = { ...LOCATIONS[selectedLocationKey] };

const NUMBER_OF_FORECAST_CARDS = 5;
const HOUR_MS = 60 * 60 * 1000;

let currentDrynessContext = null;
let selectedDrynessHours = 24;

// ---------------------------------------------------------------------------
// 2. PAGE ELEMENTS
// ---------------------------------------------------------------------------

const serviceAreaElement = document.getElementById("service-area");
const summaryLocationElement = document.getElementById("summary-location");
const statusElement = document.getElementById("status");
const statusTextElement = statusElement.querySelector("span:last-child");
const lastUpdatedElement = document.getElementById("last-updated");
const refreshButton = document.getElementById("refresh-button");
const locationSelectElement = document.getElementById("location-select");
const zipFormElement = document.getElementById("zip-form");
const zipInputElement = document.getElementById("zip-input");
const zipSubmitElement = document.getElementById("zip-submit");
const zipErrorElement = document.getElementById("zip-error");
const regionTabElement = document.getElementById("region-tab");
const zipTabElement = document.getElementById("zip-tab");
const regionPanelElement = document.getElementById("region-panel");
const zipPanelElement = document.getElementById("zip-panel");
const forecastDetailsElement = document.getElementById("forecast-details");
const forecastGridElement = document.getElementById("forecast-grid");
const diseaseGridElement = document.getElementById("disease-grid");
const overallOutlookElement = document.getElementById("overall-outlook");
const overallRiskBadgeElement = document.getElementById("overall-risk-badge");
const outlookCopyElement = document.getElementById("outlook-copy");
const outlookToggleElement = document.getElementById("outlook-toggle");
const drynessLevelElement = document.getElementById("dryness-level");
const drynessWindowLabelElement = document.getElementById("dryness-window-label");
const drynessCopyElement = document.getElementById("dryness-copy");
const drynessDriversElement = document.getElementById("dryness-drivers");
const drynessPeriodButtons = [...document.querySelectorAll(".dryness-period")];
const dataAvailabilityElement = document.getElementById("data-availability");
const metricsBodyElement = document.getElementById("metrics-body");

locationSelectElement.value = selectedLocationKey;
updateLocationLabels();

// ---------------------------------------------------------------------------
// 3. HTTP HELPERS
// ---------------------------------------------------------------------------

async function getNwsJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `NWS request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function getGenericJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const error = new Error(
      `Lookup request failed: ${response.status} ${response.statusText}`
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// 4. LOCATION SELECTION
// ---------------------------------------------------------------------------

function updateLocationLabels() {
  serviceAreaElement.textContent = activeLocation.name;
  summaryLocationElement.textContent = activeLocation.name;
}

function setActiveLocation(location) {
  activeLocation = { ...location };
  updateLocationLabels();
}

function clearPreviousResults(message = "Recalculating lawn health outlook...") {
  forecastGridElement.innerHTML = "";
  diseaseGridElement.innerHTML = `<div class="loading-card">${message}</div>`;
  overallRiskBadgeElement.textContent = "—";
  overallRiskBadgeElement.className = "overall-risk risk-neutral";
  drynessLevelElement.textContent = "—";
  drynessLevelElement.className = "dryness-level dryness-neutral";
  drynessWindowLabelElement.textContent =
    selectedDrynessHours === 24 ? "Next 24 hours" : "Next 7 days";
  drynessCopyElement.textContent =
    "Loading NWS weather data to estimate short-term lawn drying stress.";
  drynessDriversElement.innerHTML = "";
  lastUpdatedElement.textContent = "Retrieving NWS grid forecast...";
}

function switchLocationMode(mode) {
  const regionActive = mode === "region";

  regionTabElement.classList.toggle("is-active", regionActive);
  zipTabElement.classList.toggle("is-active", !regionActive);
  regionTabElement.setAttribute("aria-selected", String(regionActive));
  zipTabElement.setAttribute("aria-selected", String(!regionActive));

  regionPanelElement.hidden = !regionActive;
  zipPanelElement.hidden = regionActive;
  regionPanelElement.classList.toggle("is-active", regionActive);
  zipPanelElement.classList.toggle("is-active", !regionActive);

  if (!regionActive) {
    window.setTimeout(() => zipInputElement.focus(), 50);
  }
}

async function lookupZip(zip) {
  const data = await getGenericJson(
    `https://api.zippopotam.us/us/${encodeURIComponent(zip)}`
  );

  const place = data.places?.[0];

  if (!place) {
    throw new Error("No representative location was returned for that ZIP code.");
  }

  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("The ZIP lookup did not return usable coordinates.");
  }

  const state = place["state abbreviation"] || place.state || "";
  const city = place["place name"] || `ZIP ${zip}`;

  return {
    name: `${city}${state ? `, ${state}` : ""} · ${zip}`,
    latitude,
    longitude,
    source: "ZIP centroid",
    zip
  };
}

// ---------------------------------------------------------------------------
// 5. MAIN NWS LOAD
// ---------------------------------------------------------------------------

async function loadWeather() {
  setLoadingState(true);
  clearError();

  try {
    updateLocationLabels();

    const pointsUrl =
      `https://api.weather.gov/points/` +
      `${activeLocation.latitude},${activeLocation.longitude}`;

    const pointsData = await getNwsJson(pointsUrl);

    const forecastUrl = pointsData.properties.forecast;
    const gridDataUrl = pointsData.properties.forecastGridData;
    const timeZone = pointsData.properties.timeZone || "UTC";

    if (!forecastUrl || !gridDataUrl) {
      throw new Error("NWS did not return the required forecast endpoints.");
    }

    const [forecastData, gridData] = await Promise.all([
      getNwsJson(forecastUrl),
      getNwsJson(gridDataUrl)
    ]);

    const periods = forecastData.properties.periods
      .slice(0, NUMBER_OF_FORECAST_CARDS);

    displayForecast(periods);

    const hourlyRecords = buildHourlyRecords(gridData.properties);

    if (hourlyRecords.length < 24) {
      throw new Error("Not enough hourly NWS grid data was available.");
    }

    const qpfPeriods =
      buildQpfPeriods(gridData.properties.quantitativePrecipitation);

    markEstimatedWetHours(hourlyRecords, qpfPeriods);

    currentDrynessContext = {
      hourlyRecords,
      qpfPeriods
    };
    displayDrynessOutlook(selectedDrynessHours);

    const baseResults = evaluateAllDiseases(hourlyRecords, timeZone);
    const results = enrichDiseaseResults(
      baseResults,
      hourlyRecords,
      timeZone
    );

    displayDiseaseResults(results);
    displayOverallOutlook(results);
    displayDataAvailability(gridData.properties, hourlyRecords);
    displayFeatureWindows(gridData.properties, hourlyRecords);

    const updateTime =
      gridData.properties.updateTime || forecastData.properties.updated;

    lastUpdatedElement.textContent = updateTime
      ? `NWS grid updated ${new Date(updateTime).toLocaleString()}`
      : `Page refreshed ${new Date().toLocaleString()}`;

    setStatus(
      `Forecast loaded for ${activeLocation.name}. Lawn health outlook has been recalculated.`
    );
  } catch (error) {
    console.error("Weather/model loading error:", error);

    showError(
      "The weather or disease outlook could not be loaded for this location. " +
      "Try Refresh data or select another location."
    );

    forecastGridElement.innerHTML = "";
    diseaseGridElement.innerHTML =
      `<div class="loading-card">Lawn health outlook unavailable.</div>`;
    currentDrynessContext = null;
    drynessLevelElement.textContent = "Unavailable";
    drynessLevelElement.className = "dryness-level dryness-neutral";
    drynessCopyElement.textContent =
      "The Lawn Dryness Outlook could not be calculated for this location.";
    drynessDriversElement.innerHTML = "";
    dataAvailabilityElement.innerHTML = "";
    metricsBodyElement.innerHTML =
      `<tr><td colspan="10">Weather metrics unavailable.</td></tr>`;
    lastUpdatedElement.textContent = "Weather data unavailable.";
  } finally {
    setLoadingState(false);
  }
}

// ---------------------------------------------------------------------------
// 5A. FORECAST CARDS
// ---------------------------------------------------------------------------

function displayForecast(periods) {
  forecastGridElement.innerHTML = "";

  periods.forEach((period) => {
    const rainChance =
      period.probabilityOfPrecipitation?.value ?? "Not available";

    // Desktop: preserve the original five rich forecast cards.
    const card = document.createElement("article");
    card.className = "forecast-card";

    const periodName = document.createElement("p");
    periodName.className = "forecast-period";
    periodName.textContent = period.name;

    const main = document.createElement("div");
    main.className = "forecast-main";

    const temperature = document.createElement("p");
    temperature.className = "temperature";
    temperature.textContent = `${period.temperature}°${period.temperatureUnit}`;

    main.appendChild(temperature);

    if (period.icon) {
      const icon = document.createElement("img");
      icon.className = "forecast-icon";
      icon.src = period.icon;
      icon.alt = "";
      icon.loading = "lazy";
      main.appendChild(icon);
    }

    const summary = document.createElement("p");
    summary.className = "forecast-summary";
    summary.textContent = period.shortForecast || "Forecast details unavailable";

    const meta = document.createElement("div");
    meta.className = "forecast-meta";

    const rain = document.createElement("span");
    rain.className = "forecast-chip";
    rain.textContent = rainChance === "Not available"
      ? "Rain —"
      : `Rain ${rainChance}%`;

    const wind = document.createElement("span");
    wind.className = "forecast-chip";
    wind.textContent = `${period.windSpeed} ${period.windDirection}`;

    meta.append(rain, wind);
    card.append(periodName, main, summary, meta);
    forecastGridElement.appendChild(card);

    // Phone: compact, expandable list row for this same forecast period.
    // The full NWS description, wind and precipitation remain accessible.
    const row = document.createElement("details");
    row.className = "forecast-list-item";

    const rowSummary = document.createElement("summary");
    rowSummary.className = "forecast-row-summary";

    if (period.icon) {
      const smallIcon = document.createElement("img");
      smallIcon.className = "forecast-row-icon";
      smallIcon.src = period.icon;
      smallIcon.alt = "";
      smallIcon.loading = "lazy";
      rowSummary.appendChild(smallIcon);
    } else {
      const iconPlaceholder = document.createElement("span");
      iconPlaceholder.className = "forecast-row-icon forecast-icon-placeholder";
      iconPlaceholder.setAttribute("aria-hidden", "true");
      iconPlaceholder.textContent = "☀";
      rowSummary.appendChild(iconPlaceholder);
    }

    const rowText = document.createElement("span");
    rowText.className = "forecast-row-text";
    const rowPeriod = document.createElement("strong");
    rowPeriod.className = "forecast-row-period";
    rowPeriod.textContent = period.name;
    const rowConditions = document.createElement("span");
    rowConditions.className = "forecast-row-conditions";
    rowConditions.textContent = period.shortForecast || "Forecast details unavailable";
    rowText.append(rowPeriod, rowConditions);

    const rowTemp = document.createElement("strong");
    rowTemp.className = "forecast-row-temp";
    rowTemp.textContent = `${period.temperature}°${period.temperatureUnit}`;

    const rowChevron = document.createElement("span");
    rowChevron.className = "forecast-row-chevron";
    rowChevron.setAttribute("aria-hidden", "true");
    rowChevron.textContent = "⌄";

    rowSummary.append(rowText, rowTemp, rowChevron);

    const fullDetails = document.createElement("div");
    fullDetails.className = "forecast-row-details";
    const fullDescription = document.createElement("p");
    fullDescription.textContent =
      period.detailedForecast || period.shortForecast || "Forecast details unavailable";

    const detailChips = document.createElement("div");
    detailChips.className = "forecast-row-chips";
    const rainDetail = document.createElement("span");
    rainDetail.textContent = rainChance === "Not available"
      ? "Rain chance unavailable"
      : `Chance of rain: ${rainChance}%`;
    const windDetail = document.createElement("span");
    windDetail.textContent = `Wind: ${period.windSpeed} ${period.windDirection}`;
    detailChips.append(rainDetail, windDetail);

    fullDetails.append(fullDescription, detailChips);
    row.append(rowSummary, fullDetails);
    forecastGridElement.appendChild(row);
  });
}

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
// 11. LAWN DRYNESS OUTLOOK
// ---------------------------------------------------------------------------

/*
  This is a transparent weather-based drying-stress heuristic, not an
  official drought classification.

  Inputs are all derived from the NWS forecast already used by the site:
    - quantitative precipitation forecast (QPF)
    - air temperature
    - relative humidity
    - wind speed
    - persistence of rain-free forecast hours

  The 1-day and 7-day modes use slightly different precipitation and
  persistence bands because short-term lawn drying and week-long moisture
  stress occur on different timescales.
*/

function drynessClass(level) {
  return {
    Low: "dryness-low",
    Moderate: "dryness-moderate",
    Elevated: "dryness-elevated",
    High: "dryness-high"
  }[level] || "dryness-neutral";
}

function drynessLevelFromScore(score) {
  if (score >= 6) return "High";
  if (score >= 4) return "Elevated";
  if (score >= 2) return "Moderate";
  return "Low";
}

function longestRainFreeRun(records) {
  return longestConsecutiveRun(
    records,
    (record) => !record.qpfWet
  );
}

function evaluateDryness(records, qpfPeriods, hours) {
  if (!records.length) {
    return {
      level: "Low",
      score: 0,
      actualHours: 0,
      drivers: [],
      copy: "Not enough forecast data is available to estimate lawn drying stress."
    };
  }

  const start = records[0].time;
  const requestedEnd = new Date(start.getTime() + hours * HOUR_MS);
  const windowRecords = records.filter(
    (record) => record.time >= start && record.time < requestedEnd
  );

  const actualHours = windowRecords.length;
  const end = actualHours
    ? new Date(windowRecords[actualHours - 1].time.getTime() + HOUR_MS)
    : requestedEnd;

  const qpf = qpfForWindow(qpfPeriods, start, end);
  const maxTemp = maxValue(windowRecords.map((record) => record.temperatureF));
  const meanRH = average(windowRecords.map((record) => record.rh));
  const meanWind = average(windowRecords.map((record) => record.windMph));
  const longestDryHours = longestRainFreeRun(windowRecords);
  const hotHours = countWhere(
    windowRecords,
    (record) => record.temperatureF !== null && record.temperatureF >= 90
  );

  let score = 0;
  const drivers = [];

  if (hours <= 24) {
    if (qpf < 0.05) {
      score += 2;
      drivers.push("Little or no forecast rainfall");
    } else if (qpf < 0.20) {
      score += 1;
      drivers.push("Only light forecast rainfall");
    } else {
      drivers.push(`${formatNumber(qpf, 2)} in forecast rainfall`);
    }

    if (maxTemp !== null && maxTemp >= 95) {
      score += 2;
      drivers.push(`Very hot conditions up to ${formatNumber(maxTemp, 0)}°F`);
    } else if (maxTemp !== null && maxTemp >= 88) {
      score += 1;
      drivers.push(`Warm conditions up to ${formatNumber(maxTemp, 0)}°F`);
    }

    if (meanRH !== null && meanRH < 40) {
      score += 2;
      drivers.push(`Low mean humidity near ${formatNumber(meanRH, 0)}%`);
    } else if (meanRH !== null && meanRH < 55) {
      score += 1;
      drivers.push(`Moderately dry air near ${formatNumber(meanRH, 0)}% RH`);
    }

    if (meanWind !== null && meanWind >= 15) {
      score += 1;
      drivers.push(`Drying winds averaging ${formatNumber(meanWind, 0)} mph`);
    } else if (meanWind !== null && meanWind >= 10) {
      score += 0.5;
      drivers.push(`Breezy conditions averaging ${formatNumber(meanWind, 0)} mph`);
    }

    if (longestDryHours >= 20) {
      score += 1;
      drivers.push(`${longestDryHours} consecutive forecast hours without rainfall`);
    } else if (longestDryHours >= 14) {
      score += 0.5;
      drivers.push(`${longestDryHours} consecutive forecast hours without rainfall`);
    }
  } else {
    if (qpf < 0.25) {
      score += 2;
      drivers.push("Very limited rainfall across the forecast week");
    } else if (qpf < 0.75) {
      score += 1;
      drivers.push("Below-moderate forecast rainfall for the week");
    } else {
      drivers.push(`${formatNumber(qpf, 2)} in forecast rainfall across the week`);
    }

    if (hotHours >= 36) {
      score += 2;
      drivers.push(`${hotHours} forecast hours at or above 90°F`);
    } else if (hotHours >= 18) {
      score += 1;
      drivers.push(`${hotHours} forecast hours at or above 90°F`);
    }

    if (meanRH !== null && meanRH < 45) {
      score += 2;
      drivers.push(`Low week-average humidity near ${formatNumber(meanRH, 0)}%`);
    } else if (meanRH !== null && meanRH < 60) {
      score += 1;
      drivers.push(`Relatively dry week-average humidity near ${formatNumber(meanRH, 0)}%`);
    }

    if (meanWind !== null && meanWind >= 15) {
      score += 1;
      drivers.push(`Persistent drying winds near ${formatNumber(meanWind, 0)} mph`);
    } else if (meanWind !== null && meanWind >= 10) {
      score += 0.5;
      drivers.push(`Breezy week-average wind near ${formatNumber(meanWind, 0)} mph`);
    }

    if (longestDryHours >= 96) {
      score += 2;
      drivers.push(`${Math.round(longestDryHours / 24)}-day rain-free forecast stretch`);
    } else if (longestDryHours >= 48) {
      score += 1;
      drivers.push(`${Math.round(longestDryHours / 24)}-day rain-free forecast stretch`);
    }
  }

  score = Math.max(0, score);
  const level = drynessLevelFromScore(score);

  const copy = {
    Low:
      "Forecast conditions do not currently suggest meaningful short-term lawn drying stress.",
    Moderate:
      "Some drying conditions are present. Lawns may begin using stored soil moisture more quickly.",
    Elevated:
      "Several drying factors overlap. Moisture stress may increase, especially on exposed or shallow-rooted turf.",
    High:
      "Strong drying conditions are forecast. Lawns may lose moisture quickly without rainfall or irrigation."
  }[level];

  return {
    level,
    score,
    actualHours,
    qpf,
    maxTemp,
    meanRH,
    meanWind,
    longestDryHours,
    hotHours,
    drivers: drivers.slice(0, 4),
    copy
  };
}

function displayDrynessOutlook(hours) {
  if (!currentDrynessContext) return;

  const result = evaluateDryness(
    currentDrynessContext.hourlyRecords,
    currentDrynessContext.qpfPeriods,
    hours
  );

  drynessLevelElement.textContent = result.level;
  drynessLevelElement.className =
    `dryness-level ${drynessClass(result.level)}`;

  drynessWindowLabelElement.textContent =
    hours === 24 ? "Next 24 hours" : "Next 7 days";

  drynessCopyElement.textContent = result.copy;
  drynessDriversElement.innerHTML = "";

  const drivers = result.drivers.length
    ? result.drivers
    : ["Forecast conditions are relatively balanced"];

  drivers.forEach((driver) => {
    const item = document.createElement("li");
    item.textContent = driver;
    drynessDriversElement.appendChild(item);
  });
}

// ---------------------------------------------------------------------------
// 12. BROWN PATCH
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


// ---------------------------------------------------------------------------
// 17. RUN + ENRICH DISEASE MODELS
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

function confidenceRank(confidence) {
  return { Low: 0, Moderate: 1, High: 2 }[confidence] ?? 0;
}

function pressureCount(disease, records) {
  return countWhere(records, (r) => {
    if (r.temperatureF === null) return false;

    switch (disease) {
      case "Brown Patch":
        return r.temperatureF >= 65 && r.temperatureF <= 90 &&
          r.rh !== null && r.rh >= 85;
      case "Pythium Blight":
        return r.temperatureF > 68 && r.rh !== null && r.rh > 90;
      case "Dollar Spot":
        return r.temperatureF >= 60 && r.temperatureF <= 85 &&
          r.rh !== null && r.rh >= 80;
      case "Gray Leaf Spot":
        return r.temperatureF >= 68 && r.temperatureF <= 90 && r.estimatedWet;
      case "Red Thread":
        return r.temperatureF >= 65 && r.temperatureF <= 75 &&
          ((r.rh !== null && r.rh >= 85) || r.estimatedWet);
      case "Rust":
        return r.temperatureF >= 65 && r.temperatureF <= 85 &&
          ((r.rh !== null && r.rh >= 85) || r.estimatedWet);
      default:
        return 0;
    }
  });
}

function calculateTrend(disease, records) {
  const first = records.slice(0, 36);
  const later = records.slice(36, 72);

  if (first.length < 18 || later.length < 18) {
    return { label: "Stable", className: "trend-stable" };
  }

  const earlyPressure = pressureCount(disease, first) / first.length;
  const laterPressure = pressureCount(disease, later) / later.length;
  const delta = laterPressure - earlyPressure;

  if (delta >= 0.12) {
    return { label: "Increasing", className: "trend-increasing" };
  }

  if (delta <= -0.12) {
    return { label: "Easing", className: "trend-easing" };
  }

  return { label: "Stable", className: "trend-stable" };
}

function diseaseDetailProfile(result, records, timeZone) {
  const next72 = records.slice(0, 72);
  const trend = calculateTrend(result.disease, records);
  const meanRH = average(next72.map((r) => r.rh));
  const minTemp = minValue(next72.map((r) => r.temperatureF));
  const maxTemp = maxValue(next72.map((r) => r.temperatureF));
  const longestRH90 = longestConsecutiveRun(
    next72,
    (r) => r.rh !== null && r.rh > 90
  );
  const wetHours = countWhere(next72, (r) => r.estimatedWet);

  const common = {
    trend,
    windowLabel: "Next 72 hours",
    drivers: [],
    explanation: "Forecast conditions are being evaluated for disease-favorable weather.",
    method: "Weather favorability estimate"
  };

  if (result.disease === "Brown Patch") {
    const days = groupByLocalCalendarDay(records, timeZone)
      .filter((day) => day.records.length >= 20)
      .slice(0, 4);

    const warningDays = days.filter((day) => {
      const rh = average(day.records.map((r) => r.rh));
      const tF = minValue(day.records.map((r) => r.temperatureF));
      if (rh === null || tF === null) return false;
      const tC = fToC(tF);
      const e = -21.5 + 0.15 * rh + 1.4 * tC - 0.033 * tC * tC;
      return e >= 6;
    }).length;

    return {
      ...common,
      windowLabel: "Daily forecast model",
      explanation:
        result.risk === "Low"
          ? "The current temperature and humidity pattern is not reaching the Brown Patch warning level in the forecast model."
          : "Warm minimum temperatures and sustained humidity are creating a more favorable Brown Patch environment.",
      drivers: [
        `72-hour minimum temperature: ${formatNumber(minTemp)}°F`,
        `72-hour mean relative humidity: ${formatNumber(meanRH)}%`,
        `${warningDays} forecast day${warningDays === 1 ? "" : "s"} at or above the published warning index`
      ],
      method: "Published Brown Patch warning equation"
    };
  }

  if (result.disease === "Pythium Blight") {
    return {
      ...common,
      windowLabel: "Noon-to-noon warning windows",
      explanation:
        result.risk === "Low"
          ? "The forecast is not currently combining hot temperatures with a sufficiently long period of very high humidity."
          : "Hot conditions and prolonged very high humidity are moving toward or meeting the Pythium warning environment.",
      drivers: [
        `72-hour maximum temperature: ${formatNumber(maxTemp)}°F`,
        `72-hour minimum temperature: ${formatNumber(minTemp)}°F`,
        `Longest continuous RH above 90%: ${longestRH90} h`
      ],
      method: "Published Pythium weather-warning criteria"
    };
  }

  if (result.disease === "Dollar Spot") {
    const days = groupByLocalCalendarDay(records, timeZone)
      .filter((day) => day.records.length >= 20)
      .slice(0, 5);
    const avgTemp = average(days.flatMap((d) => d.records).map((r) => r.temperatureF));
    const avgRh = average(days.flatMap((d) => d.records).map((r) => r.rh));

    return {
      ...common,
      windowLabel: "Rolling 5-day forecast pressure",
      explanation:
        "Dollar Spot pressure is estimated from sustained temperature and humidity across a multi-day window rather than a single humid period.",
      drivers: [
        `5-day forecast mean temperature: ${formatNumber(avgTemp)}°F`,
        `5-day forecast mean relative humidity: ${formatNumber(avgRh)}%`,
        "Current prototype uses forecast data until historical storage is added"
      ],
      method: "Published Dollar Spot equation adapted to forecast data"
    };
  }

  if (result.disease === "Gray Leaf Spot") {
    const favorableWetHours = countWhere(
      next72,
      (r) => r.estimatedWet && r.temperatureF !== null &&
        r.temperatureF >= 68 && r.temperatureF <= 90
    );

    return {
      ...common,
      explanation:
        "Gray Leaf Spot favorability increases when warm temperatures overlap with extended estimated canopy wetness.",
      drivers: [
        `Warm + estimated-wet hours: ${favorableWetHours} h`,
        `Estimated wet hours from rain/dew proxy: ${wetHours} h`,
        `72-hour maximum temperature: ${formatNumber(maxTemp)}°F`
      ],
      method: "Temperature × estimated wetness proxy"
    };
  }

  if (result.disease === "Red Thread") {
    const favorable = pressureCount("Red Thread", next72);
    return {
      ...common,
      explanation:
        "Cool-to-moderate temperatures combined with prolonged damp or humid weather can increase Red Thread favorability.",
      drivers: [
        `Favorable weather hours: ${favorable} h`,
        `72-hour mean relative humidity: ${formatNumber(meanRH)}%`,
        "Turf fertility/vigor is not available from NWS weather data"
      ],
      method: "Weather favorability estimate"
    };
  }

  if (result.disease === "Rust") {
    const favorable = pressureCount("Rust", next72);
    return {
      ...common,
      explanation:
        "Moderate temperatures and prolonged humid or wet periods can increase environmental favorability for turf rust.",
      drivers: [
        `Favorable weather hours: ${favorable} h`,
        `Estimated wet hours: ${wetHours} h`,
        "Turf growth and nutrient status are not available from NWS weather data"
      ],
      method: "Weather favorability estimate"
    };
  }

  return common;
}

function enrichDiseaseResults(results, records, timeZone) {
  return results.map((result) => ({
    ...result,
    ...diseaseDetailProfile(result, records, timeZone)
  }));
}

function displayDiseaseResults(results) {
  diseaseGridElement.innerHTML = "";

  results.forEach((result) => {
    const card = document.createElement("details");
    card.className = `disease-card ${riskClass(result.risk)}`;

    const summary = document.createElement("summary");

    const titleWrap = document.createElement("div");
    titleWrap.className = "disease-title-wrap";
    const heading = document.createElement("h3");
    heading.className = "disease-name";
    heading.textContent = result.disease;
    const subline = document.createElement("div");
    subline.className = "disease-subline";
    subline.textContent = "Weather-based environmental favorability";
    titleWrap.append(heading, subline);

    const risk = document.createElement("span");
    risk.className = `risk-pill ${riskClass(result.risk)}`;
    risk.textContent = `${result.risk} risk`;

    const confidence = document.createElement("span");
    confidence.className = "confidence-pill";
    confidence.textContent = `${result.confidence} confidence`;

    const chevron = document.createElement("span");
    chevron.className = "card-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";

    summary.append(titleWrap, risk, confidence, chevron);

    const details = document.createElement("div");
    details.className = "disease-details";

    const metaRow = document.createElement("div");
    metaRow.className = "disease-meta-row";

    const riskMeta = document.createElement("div");
    riskMeta.className = "meta-stat";
    const riskMetaLabel = document.createElement("span");
    riskMetaLabel.textContent = "Risk";
    const riskMetaValue = document.createElement("strong");
    riskMetaValue.textContent = `${result.risk}`;
    riskMeta.append(riskMetaLabel, riskMetaValue);

    const confidenceMeta = document.createElement("div");
    confidenceMeta.className = "meta-stat";
    const confidenceMetaLabel = document.createElement("span");
    confidenceMetaLabel.textContent = "Prediction confidence";
    const confidenceMetaValue = document.createElement("strong");
    confidenceMetaValue.textContent = `${result.confidence}`;
    confidenceMeta.append(confidenceMetaLabel, confidenceMetaValue);

    metaRow.append(riskMeta, confidenceMeta);

    const explanation = document.createElement("p");
    explanation.className = "disease-explanation";
    explanation.textContent = result.explanation;

    const detailGrid = document.createElement("div");
    detailGrid.className = "detail-grid";

    const trendBox = document.createElement("div");
    trendBox.className = "detail-box";
    const trendLabel = document.createElement("span");
    trendLabel.textContent = "Forecast trend";
    const trendValue = document.createElement("strong");
    trendValue.className = result.trend.className;
    trendValue.textContent =
      result.trend.label === "Increasing"
        ? "↑ Increasing"
        : result.trend.label === "Easing"
          ? "↓ Easing"
          : "→ Stable";
    trendBox.append(trendLabel, trendValue);

    const windowBox = document.createElement("div");
    windowBox.className = "detail-box";
    const windowLabel = document.createElement("span");
    windowLabel.textContent = "Forecast focus";
    const windowValue = document.createElement("strong");
    windowValue.textContent = result.windowLabel;
    windowBox.append(windowLabel, windowValue);

    detailGrid.append(trendBox, windowBox);

    const driverList = document.createElement("ul");
    driverList.className = "driver-list";
    result.drivers.forEach((driver) => {
      const item = document.createElement("li");
      item.textContent = driver;
      driverList.appendChild(item);
    });

    const methodTag = document.createElement("span");
    methodTag.className = "method-tag";
    methodTag.textContent = result.method;

    details.append(metaRow, explanation, detailGrid, driverList, methodTag);
    card.append(summary, details);
    diseaseGridElement.appendChild(card);
  });
}

function displayOverallOutlook(results) {
  const credible = results.filter(
    (result) => confidenceRank(result.confidence) >= 1
  );
  const pool = credible.length ? credible : results;

  const sorted = [...pool].sort((a, b) => {
    const riskDifference = riskRank(b.risk) - riskRank(a.risk);
    if (riskDifference !== 0) return riskDifference;
    return confidenceRank(b.confidence) - confidenceRank(a.confidence);
  });

  const lead = sorted[0] || { risk: "Low" };
  const concerns = sorted.filter((item) => riskRank(item.risk) >= 1).slice(0, 2);

  const title = overallOutlookElement.querySelector("h2");
  const copy = overallOutlookElement.querySelector(".outlook-copy");

  title.textContent = `${lead.risk} disease favorability`;

  if (!concerns.length) {
    copy.textContent =
      "No meaningful weather-driven disease concern is currently standing out among the higher-confidence models.";
  } else {
    copy.textContent =
      `${concerns.length} condition${concerns.length === 1 ? "" : "s"} to watch: ` +
      concerns.map((item) => item.disease).join(" and ") + ".";
  }

  outlookCopyElement.classList.remove("is-expanded");
  outlookToggleElement.textContent = "Read more";
  outlookToggleElement.setAttribute("aria-expanded", "false");

  overallRiskBadgeElement.textContent = lead.risk;
  overallRiskBadgeElement.className = `overall-risk ${riskClass(lead.risk)}`;
}


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


// ---------------------------------------------------------------------------
// 19. PAGE STATE + RESPONSIVE BEHAVIOR
// ---------------------------------------------------------------------------

function setStatus(message, isError = false) {
  statusTextElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function setLoadingState(isLoading) {
  refreshButton.disabled = isLoading;
  locationSelectElement.disabled = isLoading;
  zipInputElement.disabled = isLoading;
  zipSubmitElement.disabled = isLoading;

  if (isLoading) {
    refreshButton.textContent = "Loading…";
    zipSubmitElement.textContent = "Loading…";
    setStatus("Requesting NWS forecast data and recalculating lawn health outlook...");
  } else {
    refreshButton.textContent = "Refresh data";
    zipSubmitElement.textContent = "View outlook";
  }
}

function showError(message) {
  setStatus(message, true);
}

function clearError() {
  statusElement.classList.remove("error");
}

function configureForecastDisclosure() {
  const mobileQuery = window.matchMedia("(max-width: 760px)");

  const sync = (event) => {
    forecastDetailsElement.open = !event.matches;
  };

  sync(mobileQuery);

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", sync);
  } else {
    mobileQuery.addListener(sync);
  }
}

// ---------------------------------------------------------------------------
// 20. EVENTS + STARTUP
// ---------------------------------------------------------------------------

refreshButton.addEventListener("click", loadWeather);

regionTabElement.addEventListener("click", () => {
  switchLocationMode("region");
});

zipTabElement.addEventListener("click", () => {
  switchLocationMode("zip");
});

locationSelectElement.addEventListener("change", (event) => {
  selectedLocationKey = event.target.value;
  setActiveLocation(LOCATIONS[selectedLocationKey]);
  zipErrorElement.textContent = "";
  clearPreviousResults();
  loadWeather();
});

zipFormElement.addEventListener("submit", async (event) => {
  event.preventDefault();
  zipErrorElement.textContent = "";

  const zip = zipInputElement.value.trim();

  if (!/^\d{5}$/.test(zip)) {
    zipErrorElement.textContent = "Enter a valid 5-digit U.S. ZIP code.";
    zipInputElement.focus();
    return;
  }

  setLoadingState(true);
  setStatus(`Looking up ZIP ${zip}...`);

  try {
    const location = await lookupZip(zip);
    setActiveLocation(location);
    clearPreviousResults("Loading ZIP-code outlook...");
    await loadWeather();
  } catch (error) {
    console.error("ZIP lookup error:", error);
    zipErrorElement.textContent =
      error.status === 404
        ? "That ZIP code could not be found. Try another U.S. ZIP code."
        : "ZIP lookup is temporarily unavailable. Try again or use a preset region.";
    showError("The ZIP location could not be loaded.");
    setLoadingState(false);
  }
});

outlookToggleElement.addEventListener("click", () => {
  const expanded = outlookCopyElement.classList.toggle("is-expanded");
  outlookToggleElement.textContent = expanded ? "Show less" : "Read more";
  outlookToggleElement.setAttribute("aria-expanded", String(expanded));
});

drynessPeriodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedDrynessHours = Number(button.dataset.drynessHours);

    drynessPeriodButtons.forEach((candidate) => {
      candidate.classList.toggle(
        "is-active",
        Number(candidate.dataset.drynessHours) === selectedDrynessHours
      );
    });

    displayDrynessOutlook(selectedDrynessHours);
  });
});

configureForecastDisclosure();
loadWeather();

setInterval(loadWeather, 30 * 60 * 1000);
