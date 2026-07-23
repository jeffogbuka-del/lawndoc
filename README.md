# Lawn Weather Starter

A beginner static webpage that retrieves a forecast from the National Weather
Service and displays six 12-hour forecast periods.

## Files

- `index.html` — webpage structure
- `styles.css` — colors, spacing, and layout
- `script.js` — NWS connection and automatic page updates

## Change the service area

Open `script.js` and edit:

```javascript
const SERVICE_LOCATION = {
  name: "Lubbock, Texas",
  latitude: 33.5779,
  longitude: -101.8552
};
```

Use the name, latitude, and longitude of the desired service area.

## Publish with GitHub Pages

1. Create a public GitHub repository.
2. Upload all four files to the repository root.
3. Open **Settings** → **Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`.
6. Save and wait for GitHub to provide the public site address.

## Important

Do not put passwords, customer information, private keys, or API secrets in a
public GitHub repository.
