# Atlas of Me: travel map

An interactive world map for marking the countries you've visited, lived in, want to visit or passed through, using colours and patterns.

Live: https://double2strand.github.io/travel-map/

- Static site with no build step. D3 v7, d3-geo-projection, topojson-client, lz-string and Natural Earth 1:50m borders (world-atlas) are bundled in `vendor/`, so nothing loads from a CDN.
- Projections: 3D globe (drag to rotate, auto-spins when idle), Natural Earth, Equal Earth, Winkel Tripel, Robinson and Mercator, with animated transitions between them.
- Your marks save in this browser (localStorage). Use Export/Import JSON to back them up, and the share link to show your map to others.
- Stats count out of 195 countries: the 193 UN members plus Vatican City and Palestine. Territories and partially recognised places (e.g. Kosovo, Taiwan, Greenland, Puerto Rico) can be marked too, but are counted separately.
- Weather for capitals in categories with “Show weather” turned on (Lived and Want to visit, by default). Forecasts come from [Open-Meteo](https://open-meteo.com/) — no API key — and are cached for about 15 minutes. Switch °C/°F, refresh, and show or hide the small badges on the map. Each category has its own weather toggle, so renaming Lived or Want to visit does not turn forecasts off.

## Install on iPhone

1. Open the site in **Safari** (other iPhone browsers cannot add this kind of home-screen app).
2. Tap the **Share** button.
3. Tap **Add to Home Screen**, then **Add**.
4. Open **Atlas of Me** from the new icon. The map works offline; weather needs a connection.

The installed app keeps its own saved map, separate from Safari. To move your marks, copy a share link or export JSON in one, then open the link or import JSON in the other.

Deploy: upload everything to the root of the `travel-map` repo, then go to Settings → Pages → Deploy from branch `main` / root.
Country data: world-countries (ODbL); borders: Natural Earth (public domain).
Capitals: REST Countries v3.1 `capitalInfo.latlng` (MPL-2.0), with four corrected coordinates from Wikidata where that field was wrong (Grenada, French Southern Lands, Wallis and Futuna, Western Sahara). Weather: [Open-Meteo](https://open-meteo.com/).
