# Lawn Health Weather Intelligence — Sponsor Demo v5

A polished sponsor-ready prototype that translates National Weather Service
forecast data into weather-based turf disease pressure.

## Sponsor-demo features

- Four preset test regions:
  - Washington, DC
  - Maryland — Annapolis
  - Virginia — Richmond
  - Dallas, Texas
- U.S. ZIP-code search
  - ZIP is converted to a representative latitude/longitude using Zippopotam.us
  - Those coordinates are then passed into the NWS `/points` workflow
- Five upcoming forecast periods
- Responsive desktop and mobile layouts
- Upcoming forecast collapsed by default on mobile
- Overall Lawn Health Outlook
- Six disease outlooks:
  - Brown Patch
  - Pythium Blight
  - Dollar Spot
  - Gray Leaf Spot
  - Red Thread
  - Rust
- Disease cards show:
  - Risk
  - Prediction Confidence
  - expandable explanation
  - forecast trend
  - primary weather drivers
  - modeling approach
- Developer weather-validation panel remains collapsed at the bottom

## Important interpretation

The disease outlook represents **environmental favorability**, not diagnosis.
Actual disease occurrence can also depend on turfgrass species, irrigation,
fertility, drainage, site history, and pathogen presence.

## Replace the current GitHub Pages files

Upload these four files together to the root of the existing repository:

- `index.html`
- `styles.css`
- `script.js`
- `README.md`

Use one commit, for example:

`Build sponsor-ready lawn health dashboard`

GitHub Pages should then create one deployment from the commit.

## Test checklist after deployment

1. Confirm Washington, DC loads by default.
2. Switch through all four preset regions.
3. Search at least two valid U.S. ZIP codes, for example `20001` and `75201`.
4. Try an invalid ZIP and confirm a clear error appears.
5. Confirm five forecast periods display on desktop.
6. Open the page on a phone and confirm Upcoming Forecast is collapsed initially.
7. Expand several disease cards and verify trend and driver details appear.
8. Expand Developer weather validation and confirm NWS weather fields are populated.
9. Verify the disease outlook changes when switching between materially different locations.

## External data services

- National Weather Service API — forecast and raw forecast-grid data
- Zippopotam.us — U.S. ZIP-code centroid lookup

The current prototype remains compatible with static GitHub Pages hosting.
