/*
 * Lawn Doctor WeatherWise — approved service ZIP codes.
 * SOURCE: Full Territory with Zip Codes.pdf, territory tables pp. 2–4 (dated May 19, 2021).
 * TO EXPAND SERVICE: Add a five-digit ZIP as a quoted string in the appropriate
 * territory below, verify business coverage, and redeploy the website.
 * This is a client-side UX restriction, NOT a security boundary.
 */
const SERVICE_TERRITORIES = Object.freeze({
  "HYP-MD 2": [
    "20606",
    "20608",
    "20609",
    "20611",
    "20612",
    "20615",
    "20618",
    "20619",
    "20620",
    "20621",
    "20622",
    "20624",
    "20625",
    "20626",
    "20628",
    "20629",
    "20630",
    "20632",
    "20634",
    "20636",
    "20637",
    "20639",
    "20645",
    "20650",
    "20653",
    "20656",
    "20657",
    "20659",
    "20664",
    "20667",
    "20670",
    "20674",
    "20676",
    "20678",
    "20680",
    "20684",
    "20685",
    "20686",
    "20687",
    "20688",
    "20690",
    "20692"
  ],
  "HYP MD 3": [
    "20623",
    "20735",
    "20744",
    "20745",
    "20746",
    "20748",
    "20762"
  ],
  "HYP-MD": [
    "20601",
    "20602",
    "20603",
    "20607",
    "20613",
    "20616",
    "20617",
    "20640",
    "20646",
    "20658",
    "20662",
    "20675",
    "20677",
    "20693",
    "20695"
  ]
});
const ALLOWED_ZIP_CODES = new Set(Object.values(SERVICE_TERRITORIES).flat());
