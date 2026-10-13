# Atlas of Me: travel map

An interactive world map for marking the countries you've visited, lived in, want to visit or passed through, using colours and patterns.

Live: https://double2strand.github.io/travel-map/

- Static site with no build step. D3 v7, d3-geo-projection, topojson-client, lz-string and Natural Earth 1:50m borders (world-atlas) are bundled in `vendor/`, so nothing loads from a CDN.
- Projections: 3D globe (drag to rotate, auto-spins when idle), Natural Earth, Equal Earth, Winkel Tripel, Robinson and Mercator, with animated transitions between them.
- Your marks save in this browser (localStorage). Use Export/Import JSON to back them up, and the share link to show your map to others.
- Stats count out of 195 countries: the 193 UN members plus Vatican City and Palestine. Territories and partially recognised places (e.g. Kosovo, Taiwan, Greenland, Puerto Rico) can be marked too, but are counted separately.

Deploy: upload everything to the root of the `travel-map` repo, then go to Settings → Pages → Deploy from branch `main` / root.
Country data: world-countries (ODbL); borders: Natural Earth (public domain).
