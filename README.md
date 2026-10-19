# Lawn Doctor WeatherWise

Sponsor-ready static website for local NWS weather, turf disease favorability, prediction confidence, ZIP/preset location lookup, and lawn dryness outlook.

## Production files

- `index.html` — page structure and content
- `styles.css` — desktop/mobile presentation
- `script.js` — location lookup, NWS weather processing, disease calculations, dryness calculations, and interactions
- `.nojekyll` — tells GitHub Pages to serve the repository as a plain static site
- `README.md` — project documentation only

## Clean GitHub Pages publish

1. Upload all files to the repository root.
2. Commit them together to `main`.
3. In **Settings → Pages**, choose **Deploy from a branch**.
4. Set **Branch = main** and **Folder = / (root)**.
5. Save.
6. In **Actions**, use only the newest Pages deployment as the source of truth.

## Custom domain

Do not add a `CNAME` file manually until the final custom domain has been selected. When a custom domain is entered under **Settings → Pages**, GitHub can create/update the `CNAME` file when publishing from a branch.
