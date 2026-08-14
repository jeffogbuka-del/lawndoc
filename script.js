/*
  LAWN WEATHER FEATURE ENGINE - VERSION 2
  ---------------------------------------
  Purpose:
  1. Load normal NWS forecast cards.
  2. Load forecastGridData.
  3. Expand compressed NWS time intervals into hourly records.
  4. Calculate 24-, 48-, and 72-hour features.
  5. Display a temporary development panel.

  Disease rules are intentionally not included yet.
*/

const SERVICE_LOCATION = {
  name: "Lubbock, Texas",
  latitude: 33.5779,
  longitude: -101.8552
};

const NUMBER_OF_FORECAST_CARDS = 6;
const HOUR_MS = 60 * 60 * 1000;

const serviceAreaElement = document.getElementById("service-area");
const statusElement = document.getElementById("status");
const lastUpdatedElement = document.getElementById("last-updated");
const forecastGridElement = document.getElementById("forecast-grid");
const refreshButton = document.getElementById("refresh-button");
const dataAvailabilityElement = document.getElementById("data-availability");
const metricsBodyElement = document.getElementById("metrics-body");

serviceAreaElement.textContent = SERVICE_LOCATION.name;

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/geo+json" }
  });

  if (!response.ok) {
    throw new Error(
      `Weather request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function loadWeather() {
  setLoadingState(true);
  clearError();

  try {
    const pointsUrl =
      `https://api.weather.gov/points/` +
      `${SERVICE_LOCATION.latitude},${SERVICE_LOCATION.longitude}`;

    const pointsData = await getJson(pointsUrl);

    const forecastUrl = pointsData.properties.forecast;
    const gridDataUrl = pointsData.properties.forecastGridData;

    if (!forecastUrl || !gridDataUrl) {
      throw new Error("NWS did not provide the required forecast links.");
    }

    const [forecastData, gridData] = await Promise.all([
      getJson(forecastUrl),
      getJson(gridDataUrl)
    ]);

    displayForecast(
      forecastData.properties.periods.slice(0, NUMBER_OF_FORECAST_CARDS)
    );

    const hourlyRecords = buildHourlyRecords(gridData.properties);

    if (hourlyRecords.length === 0) {
      throw new Error("No usable hourly grid records were produced.");
    }

    displayDataAvailability(gridData.properties, hourlyRecords);
    displayFeatureWindows(gridData.properties, hourlyRecords);

    const updateTime =
      gridData.properties.updateTime ||
      forecastData.properties.updated;

    lastUpdatedElement.textContent = updateTime
      ? `NWS grid forecast updated: ${new Date(updateTime).toLocaleString()}`
      : `Page refreshed: ${new Date().toLocaleString()}`;

    statusElement.textContent =
      "NWS forecast and weather feature data loaded successfully.";

  } catch (error) {
    console.error("Weather loading error:", error);

    showError(
      "The NWS weather data could not be loaded. Open the browser console " +
      "for the detailed error, then try Refresh forecast."
    );

    forecastGridElement.innerHTML = "";
    dataAvailabilityElement.innerHTML = "";
    metricsBodyElement.innerHTML =
      `<tr><td colspan="10">Weather metrics unavailable.</td></tr>`;
    lastUpdatedElement.textContent = "";
  } finally {
    setLoadingState(false);
  }
}

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
    rain.textContent =
      rainChance === "Not available"
        ? "Rain chance: Not available"
        : `Rain chance: ${rainChance}%`;

    const wind = document.createElement("p");
    wind.className = "forecast-detail";
    wind.textContent =
      `Wind: ${period.windSpeed} ${period.windDirection}`;

    card.append(periodName, temperature, summary, rain, wind);
    forecastGridElement.appendChild(card);
  });
}

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
      map.set(
        hourKey(timestamp),
        converter(entry.value, layer.uom)
      );
    }
  });

  return map;
}

function temperatureToF(value, uom = "") {
  if (value === null || value === undefined) return null;
  if (uom.includes("degC")) return value * 9 / 5 + 32;
  return value;
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

  if (
    uom.includes("m") &&
    !uom.includes("mm") &&
    !uom.includes("cm")
  ) {
    return value * 39.3701;
  }

  return value;
}

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

  const popMap = expandLayerToHourly(
    properties.probabilityOfPrecipitation
  );

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
        pop: popMap.get(timestamp) ?? null
      };
    });

  const cutoff = Date.now() - HOUR_MS;

  return records.filter(
    (record) => record.time.getTime() >= cutoff
  );
}

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
        inches: precipitationToInches(
          entry.value,
          qpfLayer.uom
        )
      };
    });
}

function qpfForWindow(qpfPeriods, start, end) {
  let total = 0;

  qpfPeriods.forEach((period) => {
    const overlapStart = Math.max(
      start.getTime(),
      period.start.getTime()
    );

    const overlapEnd = Math.min(
      end.getTime(),
      period.end.getTime()
    );

    const overlapMs = Math.max(0, overlapEnd - overlapStart);

    if (overlapMs <= 0 || period.durationMs <= 0) return;

    const overlapFraction = overlapMs / period.durationMs;
    total += period.inches * overlapFraction;
  });

  return total;
}

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
  if (usable.length === 0) return null;

  return usable.reduce((sum, value) => sum + value, 0)
    / usable.length;
}

function minValue(values) {
  const usable = nonNull(values);
  return usable.length ? Math.min(...usable) : null;
}

function maxValue(values) {
  const usable = nonNull(values);
  return usable.length ? Math.max(...usable) : null;
}

function countWhere(records, predicate) {
  return records.reduce(
    (count, record) =>
      predicate(record) ? count + 1 : count,
    0
  );
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

function calculateWindowMetrics(
  allRecords,
  qpfPeriods,
  start,
  hours
) {
  const end =
    new Date(start.getTime() + hours * HOUR_MS);

  const records = allRecords.filter(
    (record) =>
      record.time >= start &&
      record.time < end
  );

  return {
    hoursRequested: hours,

    minTempF: minValue(
      records.map((record) => record.temperatureF)
    ),

    maxTempF: maxValue(
      records.map((record) => record.temperatureF)
    ),

    meanRH: average(
      records.map((record) => record.rh)
    ),

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

    minDewSpreadF: minValue(
      records.map((record) => record.dewSpreadF)
    ),

    qpfInches: qpfForWindow(
      qpfPeriods,
      start,
      end
    ),

    meanWindMph: average(
      records.map((record) => record.windMph)
    )
  };
}

function layerCoverage(records, fieldName) {
  if (records.length === 0) return 0;

  const available = records.filter(
    (record) =>
      record[fieldName] !== null &&
      record[fieldName] !== undefined
  ).length;

  return Math.round(
    available / records.length * 100
  );
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
    {
      label: "Temperature",
      coverage: layerCoverage(first72, "temperatureF")
    },
    {
      label: "Relative humidity",
      coverage: layerCoverage(first72, "rh")
    },
    {
      label: "Dew point",
      coverage: layerCoverage(first72, "dewpointF")
    },
    {
      label: "Wind speed",
      coverage: layerCoverage(first72, "windMph")
    },
    {
      label: "Sky cover",
      coverage: layerCoverage(first72, "skyCover")
    },
    {
      label: "Precipitation probability",
      coverage: layerCoverage(first72, "pop")
    },
    {
      label: "Quantitative precipitation",
      coverage:
        properties.quantitativePrecipitation?.values?.length
          ? 100
          : 0
    }
  ];

  dataAvailabilityElement.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "availability-card";

    const name = document.createElement("strong");
    name.textContent = item.label;

    const status = document.createElement("span");
    const statusClass = availabilityStatus(item.coverage);

    status.className = statusClass;
    status.textContent =
      `${availabilityLabel(item.coverage)} (${item.coverage}%)`;

    card.append(name, status);
    dataAvailabilityElement.appendChild(card);
  });
}

function formatNumber(value, digits = 1) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return value.toFixed(digits);
}

function displayFeatureWindows(properties, hourlyRecords) {
  const start = hourlyRecords[0].time;

  const qpfPeriods =
    buildQpfPeriods(properties.quantitativePrecipitation);

  const windows = [24, 48, 72];

  const metrics = windows.map((hours) =>
    calculateWindowMetrics(
      hourlyRecords,
      qpfPeriods,
      start,
      hours
    )
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

function setLoadingState(isLoading) {
  refreshButton.disabled = isLoading;

  if (isLoading) {
    refreshButton.textContent = "Loading...";
    statusElement.textContent =
      "Requesting the latest NWS forecast and grid data...";
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

loadWeather();

refreshButton.addEventListener(
  "click",
  loadWeather
);

setInterval(
  loadWeather,
  30 * 60 * 1000
);
