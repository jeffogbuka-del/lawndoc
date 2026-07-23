/*
  LAWN WEATHER STARTER
  --------------------
  This file:
  1. Sends a location to the National Weather Service.
  2. Receives the correct forecast URL.
  3. Retrieves the forecast.
  4. Displays the forecast on the webpage.
*/

// STEP 1: Change only these three values for your service area.
const SERVICE_LOCATION = {
  name: "Lubbock, Texas",
  latitude: 33.5779,
  longitude: -101.8552
};

// Number of 12-hour forecast periods to display.
const NUMBER_OF_PERIODS = 6;

// Page elements that JavaScript will update.
const serviceAreaElement = document.getElementById("service-area");
const statusElement = document.getElementById("status");
const lastUpdatedElement = document.getElementById("last-updated");
const forecastGridElement = document.getElementById("forecast-grid");
const refreshButton = document.getElementById("refresh-button");

serviceAreaElement.textContent = SERVICE_LOCATION.name;

/**
 * Requests JSON data from a URL and checks for an unsuccessful response.
 */
async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `The weather request failed with status ${response.status}.`
    );
  }

  return response.json();
}

/**
 * Retrieves the NWS forecast for the configured service location.
 */
async function loadForecast() {
  setLoadingState(true);
  clearError();

  try {
    // First NWS request:
    // Convert latitude/longitude into the correct NWS forecast-grid URL.
    const pointsUrl =
      `https://api.weather.gov/points/` +
      `${SERVICE_LOCATION.latitude},${SERVICE_LOCATION.longitude}`;

    const pointsData = await getJson(pointsUrl);
    const forecastUrl = pointsData.properties.forecast;

    if (!forecastUrl) {
      throw new Error("The NWS did not return a forecast URL.");
    }

    // Second NWS request:
    // Retrieve the actual forecast periods.
    const forecastData = await getJson(forecastUrl);
    const periods = forecastData.properties.periods;

    if (!Array.isArray(periods) || periods.length === 0) {
      throw new Error("The NWS forecast did not contain any periods.");
    }

    displayForecast(periods.slice(0, NUMBER_OF_PERIODS));

    const nwsUpdatedTime = forecastData.properties.updated;

    if (nwsUpdatedTime) {
      lastUpdatedElement.textContent =
        `NWS forecast updated: ${new Date(nwsUpdatedTime).toLocaleString()}`;
    } else {
      lastUpdatedElement.textContent =
        `Page refreshed: ${new Date().toLocaleString()}`;
    }

    statusElement.textContent =
      "The latest forecast was loaded successfully.";
  } catch (error) {
    console.error("Forecast loading error:", error);

    showError(
      "The weather forecast could not be loaded. Check your internet " +
      "connection and try the Refresh forecast button."
    );

    forecastGridElement.innerHTML = "";
    lastUpdatedElement.textContent = "";
  } finally {
    setLoadingState(false);
  }
}

/**
 * Creates one weather card for each forecast period.
 */
function displayForecast(periods) {
  forecastGridElement.innerHTML = "";

  periods.forEach((period) => {
    const rainChance =
      period.probabilityOfPrecipitation?.value ?? "Not available";

    const card = document.createElement("article");
    card.className = "forecast-card";

    // textContent is used for external data so it is treated as text,
    // not executable HTML.
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

/**
 * Changes the page while a request is in progress.
 */
function setLoadingState(isLoading) {
  refreshButton.disabled = isLoading;

  if (isLoading) {
    refreshButton.textContent = "Loading...";
    statusElement.textContent = "Requesting the latest NWS forecast...";
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

// Load the forecast when the page first opens.
loadForecast();

// Let the visitor manually request a fresh forecast.
refreshButton.addEventListener("click", loadForecast);

// Refresh every 30 minutes while the page remains open.
setInterval(loadForecast, 30 * 60 * 1000);
