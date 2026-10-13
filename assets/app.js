/* Atlas of Me — interactive travel map. Static, no build step. */
(() => {
"use strict";
const $ = s => document.querySelector(s);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const STORE = "atlas-of-me:v1";
const CONTINENTS = ["Africa","Asia","Europe","North America","South America","Oceania"];
const PATTERNS = ["solid","stripes","dots","crosshatch","waves","grid"];
const SWATCHES = ["#22d3ee","#a78bfa","#f472b6","#fb923c","#facc15","#4ade80","#38bdf8","#f87171","#2dd4bf","#e879f9","#94a3b8","#fde68a"];
const DEFAULT_CATS = () => [
  {id:"c1",name:"Visited",color:"#22d3ee",pattern:"solid",counts:true,weather:false},
  {id:"c2",name:"Lived",color:"#f472b6",pattern:"stripes",counts:true,weather:true},
  {id:"c3",name:"Want to visit",color:"#facc15",pattern:"dots",counts:false,weather:true},
  {id:"c4",name:"Transit only",color:"#a78bfa",pattern:"crosshatch",counts:false,weather:false}];
function defaultWeather(name){
  const n = String(name || "").trim().toLowerCase();
  return n === "lived" || n === "want to visit";
}
const THEMES = {
  dark:{bg:"#070b16",o1:"#0f2350",o2:"#060c1d",land:"#24304f",landHi:"#34446d",border:"#0b1226",grat:"rgba(140,170,255,.10)",glow:"#22d3ee",text:"#e8eefc",mut:"#8f9bbb",rim:"rgba(34,211,238,.55)"},
  light:{bg:"#eef3fb",o1:"#cfe6fb",o2:"#a9cdf0",land:"#f8fafc",landHi:"#e2e8f0",border:"#94a3b8",grat:"rgba(30,60,120,.10)",glow:"#0891b2",text:"#0f1b33",mut:"#5b6785",rim:"rgba(8,145,178,.45)"}};

/* ---------- countries ---------- */
const C = {}; // iso2 -> info
const CAPITALS = window.CAPITALS || {}; // iso2 -> [capital, lat, lon]
for (const [iso,name,num,cont,un,lat,lon,flag,area] of window.COUNTRIES) C[iso] = {iso,name,num,cont,un:!!un,lat,lon,flag,area};
const byNum = {}; Object.values(C).forEach(c => { if (c.num) byNum[c.num] = c.iso; });
const ALL = Object.values(C).filter(c => c.cont !== "Antarctica" || c.iso === "AQ").sort((a,b)=>a.name.localeCompare(b.name));
const UN_TOTAL = ALL.filter(c=>c.un).length; // 195
const UN_BY_CONT = {}; CONTINENTS.forEach(k => UN_BY_CONT[k] = ALL.filter(c=>c.un && c.cont===k).length);

/* ---------- state ---------- */
let state = load() || fresh();
let shared = null; // when viewing a shared link
function fresh(){ return {cats:DEFAULT_CATS(),marks:{},active:"c1",theme:"dark",proj:"globe",spin:!REDUCED,tempUnit:"c",weatherBadges:true}; }
function load(){
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (!s || !s.cats || !s.cats.length) return null;
    s.cats.forEach(c => { if (typeof c.weather !== "boolean") c.weather = defaultWeather(c.name); });
    if (s.tempUnit !== "f") s.tempUnit = "c";
    if (typeof s.weatherBadges !== "boolean") s.weatherBadges = true;
    return s;
  } catch { return null; }
}
function save(){
  try {
    if (shared) {
      const raw = JSON.parse(localStorage.getItem(STORE) || "null");
      const base = raw && raw.cats && raw.cats.length ? raw : fresh();
      base.tempUnit = state.tempUnit; base.weatherBadges = !!state.weatherBadges; base.theme = state.theme;
      localStorage.setItem(STORE, JSON.stringify(base));
      return;
    }
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {}
}
const cur = () => shared || state;
const catOf = id => cur().cats.find(c => c.id === id);

/* ---------- projections ---------- */
const mercRaw = (x,y) => d3.geoMercatorRaw(x, Math.max(-1.484, Math.min(1.484, y)));
const PROJ = {
  globe:{label:"3D Globe",raw:d3.geoOrthographicRaw,globe:true},
  natural:{label:"Natural Earth",raw:d3.geoNaturalEarth1Raw},
  equal:{label:"Equal Earth",raw:d3.geoEqualEarthRaw},
  winkel:{label:"Winkel Tripel",raw:d3.geoWinkel3Raw},
  robinson:{label:"Robinson",raw:d3.geoRobinsonRaw},
  mercator:{label:"Mercator",raw:mercRaw}};
if (!PROJ[state.proj]) state.proj = "globe";

const svg = d3.select("#map");
let W, H, fits = {}; for (const k0 in PROJ) fits[k0] = {s:1, t:[0,0]};
let mix = {a:state.proj,b:state.proj,t:1};
let rot = [-10,-25,0]; let k = 1;
const projection = d3.geoProjection((x,y) => {
  const A = PROJ[mix.a].raw(x,y), B = PROJ[mix.b].raw(x,y), fa = fits[mix.a], fb = fits[mix.b], t = mix.t;
  return [(1-t)*fa.s*A[0] + t*fb.s*B[0], (1-t)*fa.s*A[1] + t*fb.s*B[1]];
}).scale(1);
const path = d3.geoPath(projection);
const isGlobe = () => PROJ[mix.b].globe && mix.t === 1 && mix.a === mix.b;

function computeFits(){
  const r = document.getElementById("map").getBoundingClientRect(); W = r.width; H = r.height;
  const mob = W < 820, top = mob ? 100 : 76, side = mob ? 10 : (W > 1100 ? 330 : 290), bot = mob ? 70 : 54;
  const box = [[side, top],[W - side, H - bot]];
  for (const key in PROJ) {
    const p = d3.geoProjection(PROJ[key].raw);
    if (PROJ[key].globe) p.clipAngle(90);
    p.fitExtent(box, {type:"Sphere"});
    fits[key] = {s:p.scale(), t:p.translate()};
  }
}
function applyProjection(){
  const fa = fits[mix.a], fb = fits[mix.b], t = mix.t;
  const ga = PROJ[mix.a].globe ? 1 : 0, gb = PROJ[mix.b].globe ? 1 : 0;
  const g = (1-t)*ga + t*gb; // globe-ness
  projection.translate([(1-t)*fa.t[0]+t*fb.t[0], (1-t)*fa.t[1]+t*fb.t[1]])
    .clipAngle(g > 0 ? 90 + (1-g)*89.999 : null)
    .rotate(g > 0 ? rot : [rot[0], 0, 0])
    .precision(.3);
  projection.scale(isGlobe() ? k / fits.globe.s : 1);
}

/* ---------- svg scaffolding ---------- */
const defs = svg.append("defs");
const grad = defs.append("radialGradient").attr("id","ocean").attr("cx","40%").attr("cy","35%").attr("r","75%");
grad.append("stop").attr("offset","0%").attr("class","o1"); grad.append("stop").attr("offset","100%").attr("class","o2");
const glowF = defs.append("filter").attr("id","glow").attr("x","-30%").attr("y","-30%").attr("width","160%").attr("height","160%");
glowF.append("feGaussianBlur").attr("stdDeviation",14);
const shade = defs.append("radialGradient").attr("id","shade").attr("cx","38%").attr("cy","32%").attr("r","70%");
shade.append("stop").attr("offset","55%").attr("stop-color","#000").attr("stop-opacity",0);
shade.append("stop").attr("offset","100%").attr("stop-color","#000").attr("stop-opacity",.38);
const patDefs = defs.append("g").attr("id","patterns");
const bg = svg.append("rect").attr("class","bg").attr("width","100%").attr("height","100%").attr("fill","transparent");
const world = svg.append("g").attr("id","world");
const glowP = world.append("path").attr("class","sphere-glow").attr("filter","url(#glow)").attr("fill","none").attr("stroke-width",18).attr("pointer-events","none");
const sphereP = world.append("path").attr("class","sphere").attr("fill","url(#ocean)");
const gratP = world.append("path").attr("class","graticule").attr("fill","none").attr("vector-effect","non-scaling-stroke").attr("pointer-events","none");
const landG = world.append("g").attr("class","land");
const shadeP = world.append("path").attr("class","shade").attr("fill","url(#shade)").attr("pointer-events","none");
const rimP = world.append("path").attr("class","rim").attr("fill","none").attr("stroke-width",1.2).attr("vector-effect","non-scaling-stroke").attr("pointer-events","none");
const dotG = world.append("g").attr("class","dots");
const graticule = d3.geoGraticule10();
const SPHERE = {type:"Sphere"};

let features = [], dots = [], countrySel, dotSel, featByIso = {};

/* ---------- patterns ---------- */
function ink(color){ const h = d3.hsl(color); return h.l > .55 ? d3.hsl(h.h, h.s, Math.max(0,h.l-.38)).formatRgb() : d3.hsl(h.h, h.s, Math.min(1,h.l+.35)).formatRgb(); }
function patternInner(p, color, s=1){
  const i = ink(color), sw = 2.2*s;
  switch(p){
    case "stripes": return {size:8*s, rot:45, body:`<rect width="${3*s}" height="${8*s}" fill="${i}"/>`};
    case "dots": return {size:8*s, rot:0, body:`<circle cx="${4*s}" cy="${4*s}" r="${1.8*s}" fill="${i}"/>`};
    case "crosshatch": return {size:8*s, rot:45, body:`<path d="M0 ${4*s}H${8*s}M${4*s} 0V${8*s}" stroke="${i}" stroke-width="${1.3*s}"/>`};
    case "waves": return {size:12*s, rot:0, h:7*s, body:`<path d="M0 ${3.5*s} Q${3*s} ${0.5*s} ${6*s} ${3.5*s} T${12*s} ${3.5*s}" fill="none" stroke="${i}" stroke-width="${1.4*s}"/>`};
    case "grid": return {size:9*s, rot:0, body:`<path d="M0 .5H${9*s}M.5 0V${9*s}" stroke="${i}" stroke-width="${1.2*s}"/>`};
    default: return null;
  }
}
function patternMarkup(id, cat, s=1){
  const p = patternInner(cat.pattern, cat.color, s);
  if (!p) return "";
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${p.size}" height="${p.h||p.size}" data-rot="${p.rot}" patternTransform="rotate(${p.rot})"><rect width="${p.size}" height="${p.h||p.size}" fill="${cat.color}"/>${p.body}</pattern>`;
}
function scalePatterns(z){ patDefs.selectAll("pattern").attr("patternTransform", function(){ return `scale(${1/z}) rotate(${this.dataset.rot})`; }); }
function fillFor(cat){ return cat.pattern === "solid" ? cat.color : `url(#pat-${cat.id})`; }
function updatePatterns(){ patDefs.html(cur().cats.map(c => patternMarkup("pat-"+c.id, c)).join("")); scalePatterns(isGlobe() ? 1 : zt.k); }
function swatchSVG(cat, id){ // mini preview
  const pid = "sw-"+id; const pm = patternMarkup(pid, cat, .75);
  return `<svg viewBox="0 0 30 22" aria-hidden="true"><defs>${pm}</defs><rect width="30" height="22" rx="5" fill="${pm ? `url(#${pid})` : cat.color}"/></svg>`;
}

/* ---------- data ---------- */
function initData(topo){
  const geoms = topojson.feature(topo, topo.objects.countries).features;
  features = geoms.map(f => { f.iso = byNum[f.id] || (window.ATLAS_ALIASES[f.properties.name]) || null; if (f.iso) featByIso[f.iso] = f; return f; });
  // tiny or missing countries get a clickable dot
  dots = ALL.filter(c => c.iso !== "AQ" && (!featByIso[c.iso] || (c.area && c.area < 1500)) ).map(c => ({iso:c.iso, coords:[c.lon,c.lat]}));
  countrySel = landG.selectAll("path").data(features).join("path")
    .attr("class", d => "country" + (d.iso ? "" : " na"))
    .attr("stroke-width", .5).attr("vector-effect","non-scaling-stroke").attr("stroke-linejoin","round")
    .attr("tabindex", -1);
  dotSel = dotG.selectAll("circle").data(dots).join("circle").attr("class","dot").attr("stroke-width",1).attr("vector-effect","non-scaling-stroke");
  for (const sel of [countrySel, dotSel]) {
    sel.on("click", onClick).on("contextmenu", (e,d) => { e.preventDefault(); if (d.iso) setMark(d.iso, null); })
       .on("pointermove", showTip).on("pointerleave", hideTip);
  }
}

/* ---------- render ---------- */
function paint(){
  const T = THEMES[cur().theme === "light" || state.theme === "light" ? "light" : "dark"];
  grad.select(".o1").attr("stop-color", T.o1); grad.select(".o2").attr("stop-color", T.o2);
  glowP.attr("stroke", T.glow).attr("stroke-opacity", .35);
  rimP.attr("stroke", T.rim);
  gratP.attr("stroke", T.grat);
  const marks = cur().marks;
  countrySel.attr("fill", d => { const c = d.iso && catOf(marks[d.iso]); return c ? fillFor(c) : (d.iso ? T.land : T.landHi); })
            .attr("stroke", T.border);
  dotSel.attr("fill", d => { const c = catOf(marks[d.iso]); return c ? c.color : T.landHi; })
        .attr("stroke", d => catOf(marks[d.iso]) ? T.text : T.mut).attr("stroke-opacity", .7);
}
function render(){
  applyProjection();
  const globe = isGlobe(), gness = PROJ[mix.b].globe ? mix.t : (PROJ[mix.a].globe ? 1-mix.t : 0);
  sphereP.attr("d", path(SPHERE)); glowP.attr("d", path(SPHERE)).attr("opacity", gness); rimP.attr("d", path(SPHERE));
  shadeP.attr("d", path(SPHERE)).attr("opacity", gness);
  gratP.attr("d", path(graticule));
  countrySel.attr("d", path);
  const zk = globe ? 1 : zt.k;
  const center = [-projection.rotate()[0], -projection.rotate()[1]];
  dotSel.each(function(d){
    const vis = !(gness > 0) || d3.geoDistance(d.coords, center) < Math.PI/2 * (1 + (1-gness));
    const p = projection(d.coords);
    if (!p || !vis) { this.setAttribute("display","none"); return; }
    this.removeAttribute("display");
    this.setAttribute("cx", p[0]); this.setAttribute("cy", p[1]);
    this.setAttribute("r", (cur().marks[d.iso] ? 4.2 : 3) / zk);
  });
  renderBadges();
}

/* ---------- zoom / rotate ---------- */
let zt = d3.zoomIdentity, last = null, interacting = false;
const zoom = d3.zoom().scaleExtent([1, 40]).clickDistance(5)
  .on("start", () => { interacting = true; idleAt = Infinity; last = null; })
  .on("zoom", e => {
    const t = e.transform;
    if (PROJ[state.proj].globe && mix.t === 1) {
      if (last && last.k === t.k) { const f = 0.28 / t.k; rot[0] += (t.x - last.x) * f; rot[1] = Math.max(-89, Math.min(89, rot[1] - (t.y - last.y) * f)); }
      last = t; k = fits.globe.s * t.k; zt = t; world.attr("transform", null); render();
    } else { zt = t; world.attr("transform", t); scalePatterns(t.k); render(); }
  })
  .on("end", () => { interacting = false; idleAt = performance.now(); });
svg.call(zoom).on("dblclick.zoom", null);

/* ---------- auto spin ---------- */
let idleAt = 0;
d3.timer(() => {
  if (!state.spin || REDUCED || interacting || !isGlobe() || document.hidden) return;
  if (performance.now() - idleAt < 2500) return;
  rot[0] += 0.12; render();
});

/* ---------- projection switching ---------- */
function setProjection(key, instant){
  if (!PROJ[key]) return;
  const from = state.proj; state.proj = key; save(); updateProjNav();
  // reset zoom
  svg.on(".zoom", null); zt = d3.zoomIdentity; world.attr("transform", null); svg.call(zoom.transform, d3.zoomIdentity); svg.call(zoom).on("dblclick.zoom", null);
  k = fits.globe.s;
  if (instant || REDUCED || from === key) { mix = {a:key,b:key,t:1}; render(); return; }
  mix = {a:from, b:key, t:0};
  const r0 = rot.slice(), r1 = PROJ[key].globe ? [rot[0], -25, 0] : [rot[0], 0, 0];
  d3.transition().duration(1400).ease(d3.easeCubicInOut).tween("proj", () => t => {
    mix.t = t; rot = [r0[0], r0[1] + (r1[1]-r0[1])*t, 0]; render();
  }).on("end", () => { mix = {a:key,b:key,t:1}; render(); idleAt = performance.now(); });
}
function updateProjNav(){ d3.selectAll("#projNav button").attr("aria-pressed", function(){ return this.dataset.k === state.proj; }); }
const nav = d3.select("#projNav");
for (const key in PROJ) nav.append("button").attr("data-k", key).text(PROJ[key].label).on("click", () => setProjection(key));

/* ---------- fly to ---------- */
function flyTo(iso){
  const c = C[iso]; if (!c) return;
  const f = featByIso[iso];
  let ctr = [c.lon, c.lat];
  if (f && (!c.area || c.area > 1500)) { const ct = d3.geoCentroid(f); if (isFinite(ct[0])) ctr = ct; }
  if (isGlobe()) {
    const r0 = rot.slice(), r1 = [-ctr[0], -ctr[1], 0];
    let dl = ((r1[0]-r0[0]) % 360 + 540) % 360 - 180;
    idleAt = performance.now() + 4000;
    d3.transition().duration(REDUCED ? 0 : 1100).ease(d3.easeCubicInOut).tween("fly", () => t => { rot = [r0[0]+dl*t, r0[1]+(r1[1]-r0[1])*t, 0]; render(); });
  } else {
    applyProjection(); projection.scale(1);
    const p = projection(ctr); if (!p) return;
    let kk = 3;
    if (f && c.area > 1500) { const b = path.bounds(f); kk = Math.min(12, .5 / Math.max((b[1][0]-b[0][0])/W, (b[1][1]-b[0][1])/H)); kk = Math.max(1.5, Math.min(kk, 8)); }
    else kk = 10;
    const t = d3.zoomIdentity.translate(W/2, H/2).scale(kk).translate(-p[0], -p[1]);
    svg.transition().duration(REDUCED ? 0 : 900).call(zoom.transform, t);
  }
}

/* ---------- marking ---------- */
function onClick(e, d){
  if (!d.iso) return;
  if (e.shiftKey || e.altKey) return setMark(d.iso, null);
  const m = cur().marks[d.iso];
  setMark(d.iso, m === cur().active ? null : cur().active);
  showTip(e, d);
}
function setMark(iso, catId){
  const s = cur();
  if (catId) s.marks[iso] = catId; else delete s.marks[iso];
  save(); paint(); render(); updateUI(); scheduleWeather();
}

/* ---------- tooltip ---------- */
const tip = $("#tooltip");
function showTip(e, d){
  const c = C[d.iso]; const name = c ? c.name : d.properties?.name || "";
  const cat = c && catOf(cur().marks[c.iso]);
  tip.innerHTML = `<div class="t">${c ? c.flag + " " : ""}${esc(name)}</div><div class="c">${cat ? `<span style="color:${cat.color}">●</span> ${esc(cat.name)}` : (c ? "Not marked · click to mark as " + esc(catOf(cur().active)?.name || "") : "Disputed / not selectable")}</div>${c ? tipWeather(c.iso) : ""}`;
  tip.hidden = false;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.max(8, e.clientY - tip.offsetHeight - 10);
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
function hideTip(){ tip.hidden = true; }
const esc = s => String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

/* ---------- UI: categories, stats, legend, list ---------- */
function counts(){ const n = {}; for (const iso in cur().marks) n[cur().marks[iso]] = (n[cur().marks[iso]]||0)+1; return n; }
function ring(el, pct, color, big){
  const r = 16, C2 = 2*Math.PI*r;
  el.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="${big?4:4.5}"/><circle cx="20" cy="20" r="${r}" fill="none" stroke="${color}" stroke-width="${big?4:4.5}" stroke-linecap="round" stroke-dasharray="${C2}" stroke-dashoffset="${C2*(1-pct)}"/></svg><div class="pct">${Math.round(pct*100)}%</div>`;
}
function updateUI(){
  const s = cur(), n = counts();
  // categories
  const cats = d3.select("#cats").selectAll("div.catrow").data(s.cats, d => d.id).join(enter => {
    const row = enter.append("div").attr("class","catrow");
    row.append("button").attr("class","cat").attr("role","radio");
    return row;
  });
  cats.select("button.cat").attr("aria-checked", d => d.id === s.active)
    .html((d,i) => `${swatchSVG(d, "c"+i)}<span class="nm">${esc(d.name)}</span><span class="ct">${n[d.id]||0}</span><span class="wxtog" role="button" tabindex="0" aria-pressed="${d.weather ? "true" : "false"}" title="${d.weather ? "Weather on — click to hide" : "Show weather"}" aria-label="Show weather for ${esc(d.name)}">☀</span><span class="ed" role="button" tabindex="0" title="Edit ${esc(d.name)}" aria-label="Edit ${esc(d.name)}">✎</span>`)
    .on("click", (e,d) => {
      if (e.target.closest(".wxtog")) { d.weather = !d.weather; save(); updateUI(); scheduleWeather(); return; }
      if (e.target.closest(".ed")) return editCat(d);
      s.active = d.id; save(); updateUI();
    })
    .on("keydown", (e,d) => {
      if (e.target.closest(".wxtog") && (e.key==="Enter"||e.key===" ")) { e.preventDefault(); e.stopPropagation(); d.weather = !d.weather; save(); updateUI(); scheduleWeather(); return; }
      if (e.target.closest(".ed") && (e.key==="Enter"||e.key===" ")) { e.preventDefault(); e.stopPropagation(); editCat(d); }
    });
  // stats
  let total = 0, extra = 0; const byCont = {};
  for (const iso in s.marks) { const c = C[iso], cat = catOf(s.marks[iso]); if (!c || !cat || !cat.counts) continue; if (c.un) { total++; byCont[c.cont] = (byCont[c.cont]||0)+1; } else extra++; }
  $("#statCount").textContent = total;
  ring($("#ringWorld"), total/UN_TOTAL, "url(#rg)" , true);
  $("#ringWorld svg").insertAdjacentHTML("afterbegin", `<defs><linearGradient id="rg"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>`);
  const colors = ["#fb923c","#f472b6","#38bdf8","#4ade80","#facc15","#2dd4bf"];
  const cs = d3.select("#contStats").selectAll("div.cs").data(CONTINENTS).join(en => { const d = en.append("div").attr("class","cs"); d.append("div").attr("class","ring"); d.append("b"); d.append("span"); return d; });
  cs.each(function(k,i){ ring(this.querySelector(".ring"), (byCont[k]||0)/UN_BY_CONT[k], colors[i]); this.querySelector("b").textContent = k; this.querySelector("span").textContent = `${byCont[k]||0} / ${UN_BY_CONT[k]}`; });
  $("#extraStat").textContent = extra ? `+ ${extra} territor${extra>1?"ies":"y"} / partially-recognised place${extra>1?"s":""} (not in the 195).` : "";
  // legend
  $("#legend").innerHTML = s.cats.map((c,i) => `<span>${swatchSVG(c,"l"+i)}${esc(c.name)} <b>${n[c.id]||0}</b></span>`).join("");
  $("#markedN").textContent = Object.keys(s.marks).length;
  renderList();
}
let listFilter = "marked";
function rowHTML(c){
  const s = cur(), m = s.marks[c.iso], cat = catOf(m);
  return `<li data-iso="${c.iso}"><span class="flag">${c.flag}</span><span class="n" title="${esc(c.name)}">${esc(c.name)}</span>${cat?`<span class="sw" style="background:${cat.color}"></span>`:""}<select aria-label="Category for ${esc(c.name)}"><option value="">—</option>${s.cats.map(k=>`<option value="${k.id}"${k.id===m?" selected":""}>${esc(k.name)}</option>`).join("")}</select></li>`;
}
function renderList(){
  const s = cur(); let html = "";
  if (listFilter === "marked") {
    for (const cat of s.cats) {
      const items = ALL.filter(c => s.marks[c.iso] === cat.id);
      if (items.length) html += `<li class="grp">${esc(cat.name)} · ${items.length}</li>` + items.map(rowHTML).join("");
    }
    if (!html) html = `<li class="grp" style="text-transform:none;letter-spacing:0">Nothing marked yet. Click a country on the map, or search above.</li>`;
  } else {
    for (const k of [...CONTINENTS, "Antarctica"]) { const items = ALL.filter(c => c.cont === k); html += `<li class="grp">${k} · ${items.length}</li>` + items.map(rowHTML).join(""); }
  }
  $("#list").innerHTML = html;
}
$("#list").addEventListener("change", e => { const li = e.target.closest("li"); if (li) setMark(li.dataset.iso, e.target.value || null); });
$("#list").addEventListener("click", e => { const li = e.target.closest("li[data-iso]"); if (li && e.target.tagName !== "SELECT") flyTo(li.dataset.iso); });
document.querySelectorAll(".listtabs button").forEach(b => b.onclick = () => { listFilter = b.dataset.f; document.querySelectorAll(".listtabs button").forEach(x => x.setAttribute("aria-selected", x === b)); renderList(); });

/* ---------- search (combobox) ---------- */
const sIn = $("#search"), sRes = $("#results"); let sItems = [], sIdx = 0;
const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function doSearch(){
  const q = norm(sIn.value.trim());
  if (!q) { sRes.hidden = true; sIn.setAttribute("aria-expanded","false"); return; }
  sItems = ALL.filter(c => norm(c.name).includes(q) || c.iso.toLowerCase() === q).sort((a,b) => norm(b.name).startsWith(q) - norm(a.name).startsWith(q)).slice(0, 12);
  sIdx = 0; drawRes();
}
function drawRes(){
  sRes.innerHTML = sItems.length ? sItems.map((c,i) => { const cat = catOf(cur().marks[c.iso]); return `<li role="option" id="opt${i}" data-iso="${c.iso}" aria-selected="${i===sIdx}"><span class="flag">${c.flag}</span><span style="flex:1">${esc(c.name)}</span><small style="color:${cat?cat.color:"var(--mut)"}">${cat?esc(cat.name):"Enter to mark"}</small></li>`; }).join("") : `<li>No matches</li>`;
  sRes.hidden = false; sIn.setAttribute("aria-expanded","true"); sIn.setAttribute("aria-activedescendant", sItems.length ? "opt"+sIdx : "");
  sRes.querySelector('[aria-selected="true"]')?.scrollIntoView({block:"nearest"});
}
function pick(iso, toggle=true){ const m = cur().marks[iso]; if (toggle) setMark(iso, m === cur().active ? null : cur().active); flyTo(iso); doSearch(); toast(`${C[iso].flag} ${C[iso].name}: ${catOf(cur().marks[iso])?.name || "cleared"}`); }
sIn.addEventListener("input", doSearch);
sIn.addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { e.preventDefault(); sIdx = Math.min(sItems.length-1, sIdx+1); drawRes(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); sIdx = Math.max(0, sIdx-1); drawRes(); }
  else if (e.key === "Enter" && sItems[sIdx]) { e.preventDefault(); pick(sItems[sIdx].iso); }
  else if (e.key === "Escape") { sIn.value = ""; doSearch(); }
});
sRes.addEventListener("mousedown", e => { const li = e.target.closest("li[data-iso]"); if (li) { e.preventDefault(); pick(li.dataset.iso); } });
sIn.addEventListener("blur", () => setTimeout(() => { sRes.hidden = true; sIn.setAttribute("aria-expanded","false"); }, 150));
document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); sIn.focus(); } });

/* ---------- category dialog ---------- */
const dlg = $("#catDlg"); let editing = null, draft = null;
let wxTouched = false;
function editCat(cat){
  editing = cat; wxTouched = !!cat;
  draft = cat ? {...cat, weather: !!cat.weather} : {id:"c"+Date.now().toString(36), name:"", color:SWATCHES[cur().cats.length % SWATCHES.length], pattern:PATTERNS[cur().cats.length % PATTERNS.length], counts:true, weather:false};
  $("#catDlgTitle").textContent = cat ? "Edit category" : "New category";
  $("#catName").value = draft.name; $("#catColor").value = draft.color; $("#catCounts").checked = draft.counts; $("#catWeather").checked = !!draft.weather;
  $("#catDelete").hidden = !cat || cur().cats.length <= 1;
  drawPatPick(); dlg.showModal(); $("#catName").focus();
}
function drawPatPick(){
  $("#swatches").innerHTML = SWATCHES.map(c => `<button type="button" style="background:${c}" data-c="${c}" aria-label="Colour ${c}"></button>`).join("");
  $("#patPick").innerHTML = PATTERNS.map((p,i) => `<button type="button" data-p="${p}" aria-pressed="${p===draft.pattern}">${swatchSVG({...draft,pattern:p,id:"pp"+i},"pp"+i).replace('viewBox="0 0 30 22"','viewBox="0 0 44 24"').replace('width="30" height="22"','width="44" height="24"')}${p}</button>`).join("");
}
$("#swatches").addEventListener("click", e => { const c = e.target.dataset.c; if (c) { draft.color = c; $("#catColor").value = c; drawPatPick(); } });
$("#catColor").addEventListener("input", e => { draft.color = e.target.value; drawPatPick(); });
$("#catName").addEventListener("input", () => { if (!editing && !wxTouched) $("#catWeather").checked = defaultWeather($("#catName").value); });
$("#catWeather").addEventListener("change", () => { wxTouched = true; });
$("#patPick").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { draft.pattern = b.dataset.p; drawPatPick(); } });
$("#catDelete").onclick = () => {
  const s = cur(); if (!confirm(`Delete “${editing.name}”? Countries marked with it will be unmarked.`)) return;
  s.cats = s.cats.filter(c => c.id !== editing.id); for (const iso in s.marks) if (s.marks[iso] === editing.id) delete s.marks[iso];
  if (s.active === editing.id) s.active = s.cats[0].id; dlg.close(); refreshAll();
};
dlg.addEventListener("close", () => {
  if (dlg.returnValue !== "ok") return;
  draft.name = $("#catName").value.trim() || "Untitled"; draft.counts = $("#catCounts").checked; draft.weather = $("#catWeather").checked;
  const s = cur(); if (editing) Object.assign(editing, draft); else { s.cats.push(draft); s.active = draft.id; }
  refreshAll();
});
$("#addCat").onclick = () => editCat(null);

/* ---------- share / import / export ---------- */
function encodeState(s){
  const cats = s.cats.map(c => [c.name.replace(/[~|;]/g," "), c.color.replace("#",""), PATTERNS.indexOf(c.pattern), c.counts?1:0, c.weather?1:0].join("~")).join("|");
  const groups = s.cats.map((c,i) => { const isos = Object.keys(s.marks).filter(iso => s.marks[iso] === c.id); return isos.length ? i + ":" + isos.join(",") : ""; }).filter(Boolean).join(";");
  return LZString.compressToEncodedURIComponent("1#" + cats + "#" + groups);
}
function decodeState(str){
  const raw = LZString.decompressFromEncodedURIComponent(str); if (!raw) return null;
  const [v, cats, groups] = raw.split("#"); if (v !== "1") return null;
  const s = fresh(); s.cats = cats.split("|").map((x,i) => { const [name,color,p,counts,weather] = x.split("~"); return {id:"c"+(i+1), name, color:"#"+color, pattern:PATTERNS[+p]||"solid", counts:counts==="1", weather: weather === undefined ? defaultWeather(name) : weather === "1"}; });
  s.marks = {}; (groups||"").split(";").filter(Boolean).forEach(g => { const [i, list] = g.split(":"); list.split(",").forEach(iso => { if (C[iso] && s.cats[+i]) s.marks[iso] = s.cats[+i].id; }); });
  s.active = s.cats[0].id; s.theme = state.theme; s.proj = state.proj; s.spin = state.spin; return s;
}
function shareLink(){ return location.origin + location.pathname + "#m=" + encodeState(cur()); }
function download(name, blob){ const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function exportSVGString(){
  const T = THEMES[state.theme], s = cur(), n = counts();
  const node = document.getElementById("map").cloneNode(true);
  node.setAttribute("xmlns","http://www.w3.org/2000/svg"); node.setAttribute("width", W); node.setAttribute("height", H); node.setAttribute("viewBox", `0 0 ${W} ${H}`);
  node.removeAttribute("style"); node.querySelector("rect.bg").setAttribute("fill", T.bg);
  node.querySelectorAll("[tabindex]").forEach(e => e.removeAttribute("tabindex"));
  // legend + title
  const total = Object.keys(s.marks).filter(iso => C[iso]?.un && catOf(s.marks[iso])?.counts).length;
  let lg = `<g font-family="system-ui,Segoe UI,Roboto,sans-serif" fill="${T.text}"><text x="24" y="40" font-size="22" font-weight="700">My travel map</text><text x="24" y="62" font-size="13" fill="${T.mut}">${total} of ${UN_TOTAL} countries (${Math.round(total/UN_TOTAL*100)}%)</text>`;
  let x = 24; const y = H - 28; s.cats.forEach(c => { const pm = patternMarkup("ex-"+c.id, c); lg += `${pm?`<defs>${pm}</defs>`:""}<rect x="${x}" y="${y-11}" width="22" height="14" rx="3" fill="${pm?`url(#ex-${c.id})`:c.color}"/><text x="${x+28}" y="${y}" font-size="13">${esc(c.name)} (${n[c.id]||0})</text>`; x += 40 + c.name.length*7.5 + 24; });
  lg += `</g>`;
  node.insertAdjacentHTML("beforeend", lg);
  return new XMLSerializer().serializeToString(node);
}
function exportPNG(){
  const str = exportSVGString(), img = new Image(), sc = 2;
  img.onload = () => { const cv = document.createElement("canvas"); cv.width = W*sc; cv.height = H*sc; const cx = cv.getContext("2d"); cx.scale(sc,sc); cx.drawImage(img,0,0,W,H); cv.toBlob(b => { download("travel-map.png", b); toast("PNG downloaded"); }, "image/png"); };
  img.onerror = () => toast("PNG export failed — try SVG");
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
}
function act(a){
  $("#menu").hidden = true; $("#menuBtn").setAttribute("aria-expanded","false");
  if (a === "share") { const url = shareLink(); (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast("Share link copied ✨"), () => prompt("Copy this link:", url)); }
  if (a === "png") exportPNG();
  if (a === "svg") { download("travel-map.svg", new Blob([exportSVGString()], {type:"image/svg+xml"})); toast("SVG downloaded"); }
  if (a === "json") { const s = cur(); download("travel-map.json", new Blob([JSON.stringify({app:"atlas-of-me",version:1,exported:new Date().toISOString(),categories:s.cats,marks:s.marks,named:Object.fromEntries(Object.entries(s.marks).map(([k,v])=>[C[k]?.name||k, catOf(v)?.name]))}, null, 2)], {type:"application/json"})); toast("JSON exported"); }
  if (a === "import") $("#fileIn").click();
  if (a === "clear" && confirm("Clear every mark on this map?")) { cur().marks = {}; refreshAll(); toast("Cleared"); }
}
document.querySelectorAll("#menu button").forEach(b => b.onclick = () => act(b.dataset.act));
$("#menuBtn").onclick = e => { const m = $("#menu"); m.hidden = !m.hidden; e.currentTarget.setAttribute("aria-expanded", !m.hidden); if (!m.hidden) m.querySelector("button").focus(); };
document.addEventListener("click", e => { if (!e.target.closest(".menuwrap")) $("#menu").hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape") $("#menu").hidden = true; });
$("#fileIn").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!Array.isArray(j.categories) || typeof j.marks !== "object") throw 0;
    const s = cur(); s.cats = j.categories.map(c => ({id:String(c.id), name:String(c.name).slice(0,24), color:/^#[0-9a-f]{6}$/i.test(c.color)?c.color:"#22d3ee", pattern:PATTERNS.includes(c.pattern)?c.pattern:"solid", counts:!!c.counts, weather: typeof c.weather === "boolean" ? c.weather : defaultWeather(c.name)}));
    s.marks = {}; for (const [iso,id] of Object.entries(j.marks)) if (C[iso] && s.cats.find(c=>c.id===id)) s.marks[iso] = id;
    s.active = s.cats[0].id; refreshAll(); toast(`Imported ${Object.keys(s.marks).length} countries`);
  } catch { toast("That file isn't a travel-map export"); }
  e.target.value = "";
};

/* ---------- theme, spin, reset, mobile ---------- */
function applyTheme(){ document.body.classList.toggle("light", state.theme === "light"); document.body.classList.toggle("dark", state.theme !== "light"); document.querySelector('meta[name=theme-color]').content = THEMES[state.theme].bg; }
$("#themeBtn").onclick = () => { state.theme = state.theme === "light" ? "dark" : "light"; if (shared) shared.theme = state.theme; save(); applyTheme(); paint(); };
$("#spinBtn").onclick = () => { state.spin = !state.spin; save(); $("#spinBtn").setAttribute("aria-pressed", state.spin); };
$("#resetBtn").onclick = () => { if (isGlobe()) { rot = [-10,-25,0]; svg.transition().duration(REDUCED?0:600).call(zoom.transform, d3.zoomIdentity).on("end", render); last = null; k = fits.globe.s; render(); } else svg.transition().duration(REDUCED?0:600).call(zoom.transform, d3.zoomIdentity); };
document.querySelectorAll(".mobtabs button").forEach(b => b.onclick = () => {
  const p = b.dataset.p;
  if (p === "map") { setWeatherOpen(false); document.querySelectorAll(".panel").forEach(x => x.classList.remove("open")); syncMobTabs(); return; }
  const el = document.getElementById(p);
  const willOpen = el && !el.classList.contains("open");
  document.querySelectorAll(".panel").forEach(x => x.classList.toggle("open", willOpen && x.id === p));
  if (p === "weatherPanel") setWeatherOpen(!!willOpen); else setWeatherOpen(false, true);
  syncMobTabs();
});
function syncMobTabs(){
  const open = document.querySelector(".panel.open");
  document.querySelectorAll(".mobtabs button").forEach(x => x.classList.toggle("on", open ? x.dataset.p === open.id : x.dataset.p === "map"));
}
let tt; function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2200); }

/* ---------- shared link mode ---------- */
function readHash(){
  const m = location.hash.match(/#m=([^&]+)/); if (!m) return;
  const s = decodeState(m[1]); if (!s) { toast("Couldn't read that share link"); return; }
  shared = s; $("#sharedBanner").hidden = false;
}
$("#keepShared").onclick = () => { if (!confirm("Replace your saved map with this shared one?")) return; state = {...shared, theme:state.theme, proj:state.proj, spin:state.spin, tempUnit:state.tempUnit || "c", weatherBadges: state.weatherBadges !== false}; shared = null; history.replaceState(null, "", location.pathname); $("#sharedBanner").hidden = true; save(); refreshAll(); toast("Saved as your map"); };
$("#leaveShared").onclick = () => { shared = null; history.replaceState(null, "", location.pathname); $("#sharedBanner").hidden = true; refreshAll(); };
window.addEventListener("hashchange", () => { readHash(); refreshAll(); });

function refreshAll(){ save(); updatePatterns(); paint(); render(); updateUI(); scheduleWeather(); }

/* ---------- weather (Open-Meteo, capitals) ---------- */
const WX_TTL = 15 * 60 * 1000;
const WX_KEY = "atlas-of-me:weather:v1";
const WX_DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let wxData = {}, wxAt = 0, wxError = null, wxLoading = false, wxSort = "name", wxTimer = 0, wxGen = 0;
const badgeNodes = new Map();
try {
  const savedWx = JSON.parse(localStorage.getItem(WX_KEY) || "null");
  if (savedWx && savedWx.by) { wxData = savedWx.by; wxAt = savedWx.at || 0; }
} catch {}

function wmoText(code){
  return ({
    0:"Clear",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
    45:"Fog",48:"Rime fog",
    51:"Light drizzle",53:"Drizzle",55:"Dense drizzle",
    56:"Freezing drizzle",57:"Dense freezing drizzle",
    61:"Light rain",63:"Rain",65:"Heavy rain",
    66:"Freezing rain",67:"Heavy freezing rain",
    71:"Light snow",73:"Snow",75:"Heavy snow",77:"Snow grains",
    80:"Rain showers",81:"Showers",82:"Heavy showers",
    85:"Snow showers",86:"Heavy snow showers",
    95:"Thunderstorm",96:"Thunderstorm, hail",99:"Thunderstorm, heavy hail"
  })[+code] || "Unknown";
}
function wmoKind(code, isDay){
  code = +code;
  if (code === 0 || code === 1) return isDay ? "clear" : "night";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code === 51 || code === 53 || code === 55) return "drizzle";
  if (code === 56 || code === 57 || code === 66 || code === 67) return "sleet";
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return "cloudy";
}
function wxIcon(kind, size){
  const paths = {
    clear:`<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/><path d="M12 3.2v1.8M12 19v1.8M3.2 12H5M19 12h1.8M5.4 5.4l1.3 1.3M17.3 17.3l1.3 1.3M18.6 5.4l-1.3 1.3M6.7 17.3l-1.3 1.3"/>`,
    night:`<path d="M16.8 14.2A6.4 6.4 0 0 1 9.6 4.2 5.6 5.6 0 1 0 16.8 14.2z" fill="currentColor" stroke="none"/>`,
    partly:`<circle cx="8" cy="8" r="2.3" fill="currentColor" stroke="none"/><path d="M8 3.1v1.2M3.4 8H4.6M8 12.8v1.2M12.4 8h-1.2M4.6 4.6l.9.9M11.4 4.6l-.9.9"/><path d="M8.2 18.2h8.2a3.2 3.2 0 0 0 .2-6.4 4.6 4.6 0 0 0-8.8 1.3 2.9 2.9 0 0 0 .4 5.1z" fill="currentColor" fill-opacity=".35"/>`,
    cloudy:`<path d="M7 18h10.2a3.6 3.6 0 0 0 .3-7.2 5.4 5.4 0 0 0-10.4 1.5A3.2 3.2 0 0 0 7 18z" fill="currentColor" stroke="none"/>`,
    fog:`<path d="M4 8.5h16M4 12h16M5 15.5h14"/>`,
    drizzle:`<path d="M7 14h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A3 3 0 0 0 7 14z" fill="currentColor" fill-opacity=".35" stroke="none"/><path d="M9 16.5v2M12 16.5v2M15 16.5v2"/>`,
    rain:`<path d="M7 13.5h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A3 3 0 0 0 7 13.5z" fill="currentColor" fill-opacity=".35" stroke="none"/><path d="M8.5 16l-1 3M12 16l-1 3M15.5 16l-1 3"/>`,
    snow:`<path d="M7 13.5h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A3 3 0 0 0 7 13.5z" fill="currentColor" fill-opacity=".35" stroke="none"/><path d="M9 16.2v2.6M12 16.2v2.6M15 16.2v2.6M8 17.2l2 1.1M14 17.2l2 1.1M10 18.6L8 19.7M16 18.6l-2 1.1"/>`,
    sleet:`<path d="M7 13.5h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A3 3 0 0 0 7 13.5z" fill="currentColor" fill-opacity=".35" stroke="none"/><path d="M9 16l-1 2.4M15 16l-1 2.4M12 16.4v2.4"/>`,
    thunder:`<path d="M7 13h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4A3 3 0 0 0 7 13z" fill="currentColor" fill-opacity=".35" stroke="none"/><path d="M11.2 12.6 8.8 16.4h2.6L10.2 20l4.2-5.2h-2.6l1.6-2.2z" fill="currentColor" stroke="none"/>`
  };
  return `<svg class="wxi ${kind}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] || paths.cloudy}</svg>`;
}
function fmtTemp(c){
  if (c == null || !isFinite(+c)) return "–";
  const v = state.tempUnit === "f" ? (+c) * 9 / 5 + 32 : +c;
  return Math.round(v) + "°";
}
function fmtWind(kmh){
  if (kmh == null || !isFinite(+kmh)) return "–";
  if (state.tempUnit === "f") return Math.round(+kmh * 0.621371) + " mph";
  return Math.round(+kmh) + " km/h";
}
function fmtTime(offset){
  const d = new Date(Date.now() + (+offset || 0) * 1000);
  return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
}
function dayLabel(iso, i){
  if (i === 0) return "Today";
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return "";
  return WX_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function wxTargets(){
  const s = cur();
  const on = new Set(s.cats.filter(c => c.weather).map(c => c.id));
  return Object.keys(s.marks).filter(iso => on.has(s.marks[iso]) && C[iso]);
}
function tipWeather(iso){
  const cat = catOf(cur().marks[iso]);
  if (!cat || !cat.weather) return "";
  const cap = CAPITALS[iso];
  if (!cap) return `<div class="w">No capital coordinates</div>`;
  const w = wxData[iso];
  if (!w) return `<div class="w">${esc(cap[0])} · ${wxLoading ? "loading forecast" : "forecast unavailable"}</div>`;
  return `<div class="w">${wxIcon(wmoKind(w.code, w.isDay), 14)}<span>${esc(cap[0])} · ${fmtTemp(w.temp)} · ${esc(wmoText(w.code))}</span></div>`;
}
function packWx(row){
  const c = row.current || {}, d = row.daily || {};
  return {
    temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m,
    wind: c.wind_speed_10m, code: c.weather_code, isDay: c.is_day ? 1 : 0,
    offset: row.utc_offset_seconds || 0, tz: row.timezone || "",
    days: (d.time || []).slice(0, 4).map((t, i) => ({t, code: d.weather_code?.[i], hi: d.temperature_2m_max?.[i], lo: d.temperature_2m_min?.[i]}))
  };
}
function saveWx(){ try { localStorage.setItem(WX_KEY, JSON.stringify({at: wxAt, by: wxData})); } catch {} }
function updateWxChrome(){
  const btn = $("#wxRefresh");
  if (btn) btn.classList.toggle("spinning", wxLoading);
  const el = $("#wxUpdated");
  if (!el) return;
  const mins = wxAt ? Math.max(0, Math.round((Date.now() - wxAt) / 60000)) : null;
  const when = mins == null ? "" : mins < 1 ? "just now" : mins === 1 ? "1 min ago" : mins + " min ago";
  el.classList.toggle("bad", !!wxError && !wxLoading);
  if (wxLoading && !wxAt) { el.textContent = "Loading…"; return; }
  if (wxError === "offline" && wxAt) { el.textContent = "Offline · saved " + when; return; }
  if (wxError === "offline") { el.textContent = "Offline"; return; }
  if (wxError && wxAt) { el.textContent = "Couldn't refresh · " + when; return; }
  if (wxError) { el.textContent = "Unavailable"; return; }
  if (wxLoading) { el.textContent = "Updating…"; return; }
  el.textContent = wxAt ? "Updated " + when : "";
}
function sortedWx(){
  const rows = wxTargets().map(iso => ({iso, c: C[iso], cap: CAPITALS[iso] || null, w: wxData[iso] || null}));
  if (wxSort === "temp") rows.sort((a, b) => (b.w ? b.w.temp : -999) - (a.w ? a.w.temp : -999) || a.c.name.localeCompare(b.c.name));
  else if (wxSort === "time") rows.sort((a, b) => ((a.w ? a.w.offset : 0) - (b.w ? b.w.offset : 0)) || a.c.name.localeCompare(b.c.name));
  else rows.sort((a, b) => a.c.name.localeCompare(b.c.name));
  return rows;
}
function renderWeather(){
  const list = $("#wxList");
  if (!list) return;
  const rows = sortedWx();
  updateWxChrome();
  if (!rows.length) {
    list.innerHTML = `<li class="wxempty">Nothing to forecast yet. Mark a country as Lived or Want to visit, or turn on the ☀ toggle for another category.</li>`;
    return;
  }
  const missing = rows.filter(r => !r.cap).map(r => r.c.name);
  list.innerHTML = rows.filter(r => r.cap).map(r => {
    const w = r.w;
    const kind = w ? wmoKind(w.code, w.isDay) : "cloudy";
    const today = w && w.days && w.days[0];
    const meta = !w
      ? (wxError === "offline" ? "Offline — no saved forecast for this capital." : wxLoading ? "Loading forecast…" : "Forecast unavailable. Try refresh.")
      : `${esc(wmoText(w.code))} · Feels ${fmtTemp(w.feels)} · Wind ${fmtWind(w.wind)} · Humidity ${Math.round(w.humidity)}%${today ? ` · H ${fmtTemp(today.hi)} L ${fmtTemp(today.lo)}` : ""}`;
    const days = w && w.days ? w.days.map((d, i) => `<div class="wxday">${dayLabel(d.t, i)}${wxIcon(wmoKind(d.code, 1), 14)}<b>${fmtTemp(d.hi)} ${fmtTemp(d.lo)}</b></div>`).join("") : "";
    return `<li class="wxcard" data-iso="${r.iso}" tabindex="0" role="button" aria-label="${esc(r.c.name)} weather"><div class="wxtop"><span class="flag">${r.c.flag}</span><div class="wxwho"><b>${esc(r.c.name)}</b><small>${esc(r.cap[0])}</small></div><span class="wxnow">${w ? wxIcon(kind, 20) : ""}<b class="wxtemp">${w ? fmtTemp(w.temp) : "–"}</b></span><time class="wxtime" data-off="${w ? w.offset : ""}">${w ? fmtTime(w.offset) : ""}</time></div><div class="wxmeta">${meta}</div>${days ? `<div class="wxdays">${days}</div>` : ""}</li>`;
  }).join("") + (missing.length ? `<li class="wxempty">No capital coordinates for ${missing.map(esc).join(", ")}.</li>` : "");
}
function scheduleWeather(){ clearTimeout(wxTimer); renderWeather(); renderBadges(); wxTimer = setTimeout(() => refreshWeather(false), 280); }
function fetchWx(url){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  return fetch(url, {signal: ctrl.signal}).finally(() => clearTimeout(timer));
}
async function refreshWeather(force){
  const gen = ++wxGen;
  const isos = wxTargets().filter(iso => CAPITALS[iso]);
  renderWeather();
  renderBadges();
  if (!isos.length) { wxLoading = false; wxError = null; updateWxChrome(); return; }
  const fresh = !force && wxAt && Date.now() - wxAt < WX_TTL && isos.every(iso => wxData[iso]);
  if (fresh) { wxError = null; updateWxChrome(); return; }
  if (navigator.onLine === false) { wxLoading = false; wxError = "offline"; renderWeather(); renderBadges(); return; }
  wxLoading = true; wxError = null; updateWxChrome();
  try {
    const by = {};
    for (let i = 0; i < isos.length; i += 40) {
      const batch = isos.slice(i, i + 40);
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + batch.map(iso => CAPITALS[iso][1]).join(",")
        + "&longitude=" + batch.map(iso => CAPITALS[iso][2]).join(",")
        + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day"
        + "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4&wind_speed_unit=kmh";
      const res = await fetchWx(url);
      if (gen !== wxGen) return;
      if (!res.ok) throw new Error(String(res.status));
      let data = await res.json();
      if (!Array.isArray(data)) data = [data];
      if (data.length !== batch.length) throw new Error("length");
      batch.forEach((iso, j) => { const row = data[j]; if (row && row.current && !row.error) by[iso] = packWx(row); });
    }
    if (gen !== wxGen) return;
    if (!Object.keys(by).length) throw new Error("empty");
    wxData = {...wxData, ...by};
    wxAt = Date.now();
    saveWx();
    wxError = null;
  } catch {
    if (gen !== wxGen) return;
    wxError = navigator.onLine === false ? "offline" : "error";
  }
  wxLoading = false;
  renderWeather();
  renderBadges();
}
function globeFactor(){
  return PROJ[mix.b].globe ? mix.t : (PROJ[mix.a].globe ? 1 - mix.t : 0);
}
function projectScreen(lon, lat){
  if (!W) return null;
  const coords = [lon, lat];
  const g = globeFactor();
  if (g > 0.02) {
    const center = [-projection.rotate()[0], -projection.rotate()[1]];
    if (d3.geoDistance(coords, center) > Math.PI / 2 - 0.08) return null;
  }
  const p = projection(coords);
  if (!p || !isFinite(p[0]) || !isFinite(p[1])) return null;
  if (!isGlobe() && g < 0.02) return [zt.x + p[0] * zt.k, zt.y + p[1] * zt.k];
  return p;
}
function renderBadges(){
  const layer = $("#wxBadges");
  if (!layer) return;
  if (!state.weatherBadges) {
    if (badgeNodes.size) { layer.replaceChildren(); badgeNodes.clear(); }
    return;
  }
  const want = [];
  for (const iso of wxTargets()) {
    const cap = CAPITALS[iso], w = wxData[iso];
    if (!cap || !w) continue;
    const p = projectScreen(cap[2], cap[1]);
    if (!p || p[0] < -30 || p[1] < -30 || p[0] > W + 30 || p[1] > H + 30) continue;
    want.push({iso, x: p[0], y: p[1], w});
  }
  want.sort((a, b) => a.iso < b.iso ? -1 : 1);
  const kept = [];
  for (const it of want) {
    if (kept.some(k => (k.x - it.x) ** 2 + (k.y - it.y) ** 2 < 46 * 46)) continue;
    kept.push(it);
  }
  const keep = new Set(kept.map(k => k.iso));
  for (const iso of [...badgeNodes.keys()]) if (!keep.has(iso)) { badgeNodes.get(iso).remove(); badgeNodes.delete(iso); }
  for (const it of kept) {
    const sig = state.tempUnit + "|" + Math.round(it.w.temp) + "|" + it.w.code + "|" + it.w.isDay;
    let el = badgeNodes.get(it.iso);
    if (!el) {
      el = document.createElement("div");
      el.className = "wxbadge";
      layer.appendChild(el);
      badgeNodes.set(it.iso, el);
    }
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      el.innerHTML = wxIcon(wmoKind(it.w.code, it.w.isDay), 13) + "<span>" + fmtTemp(it.w.temp) + "</span>";
    }
    el.style.left = it.x + "px";
    el.style.top = it.y + "px";
  }
}
function setWeatherOpen(open, skipPanels){
  const p = $("#weatherPanel");
  if (!p) return;
  if (!skipPanels) p.classList.toggle("open", !!open);
  const on = p.classList.contains("open");
  p.toggleAttribute("inert", !on);
  p.setAttribute("aria-hidden", on ? "false" : "true");
  $("#wxBtn").setAttribute("aria-pressed", on);
  document.body.classList.toggle("wx-open", on);
  if (on) scheduleWeather();
}
function updateUnitBtn(){
  const b = $("#wxUnit");
  if (!b) return;
  const f = state.tempUnit === "f";
  b.textContent = f ? "°F" : "°C";
  b.setAttribute("aria-label", f ? "Temperature unit Fahrenheit. Switch to Celsius." : "Temperature unit Celsius. Switch to Fahrenheit.");
}
$("#wxBtn").onclick = () => { setWeatherOpen(!$("#weatherPanel").classList.contains("open")); syncMobTabs(); };
$("#wxClose").onclick = () => { setWeatherOpen(false); syncMobTabs(); };
$("#wxUnit").onclick = () => { state.tempUnit = state.tempUnit === "f" ? "c" : "f"; save(); updateUnitBtn(); renderWeather(); renderBadges(); };
$("#wxBadgesBtn").onclick = () => {
  state.weatherBadges = !state.weatherBadges; save();
  $("#wxBadgesBtn").setAttribute("aria-pressed", state.weatherBadges);
  renderBadges();
};
$("#wxRefresh").onclick = () => refreshWeather(true);
document.querySelectorAll(".wxsort button").forEach(b => b.onclick = () => {
  wxSort = b.dataset.s;
  document.querySelectorAll(".wxsort button").forEach(x => x.setAttribute("aria-pressed", x === b));
  renderWeather();
});
$("#wxList").addEventListener("click", e => { const li = e.target.closest(".wxcard"); if (li) flyTo(li.dataset.iso); });
$("#wxList").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("wxcard")) { e.preventDefault(); flyTo(e.target.dataset.iso); } });
setInterval(() => { document.querySelectorAll(".wxtime").forEach(el => { if (el.dataset.off !== "") el.textContent = fmtTime(el.dataset.off); }); if ($("#weatherPanel").classList.contains("open")) updateWxChrome(); }, 30000);

function iosSafariNeedsHint(){
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!iOS || navigator.standalone === true) return false;
  if (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua)) return false;
  return /Safari/.test(ua);
}
$("#iosHintDismiss").onclick = () => { $("#iosHint").hidden = true; try { localStorage.setItem("atlas-of-me:ios-hint", "1"); } catch {} };
function bindSheets(){
  document.querySelectorAll(".panel").forEach(panel => {
    let y0 = null;
    panel.addEventListener("pointerdown", e => {
      if (!matchMedia("(max-width: 820px)").matches || !panel.classList.contains("open")) return;
      if (e.clientY - panel.getBoundingClientRect().top > 26) return;
      y0 = e.clientY; panel.style.transition = "none";
      try { panel.setPointerCapture(e.pointerId); } catch {}
    });
    panel.addEventListener("pointermove", e => { if (y0 == null) return; panel.style.transform = "translateY(" + Math.max(0, e.clientY - y0) + "px)"; });
    const end = e => {
      if (y0 == null) return;
      const dy = e.clientY - y0; y0 = null;
      panel.style.transition = ""; panel.style.transform = "";
      if (dy > 72) { panel.classList.remove("open"); if (panel.id === "weatherPanel") setWeatherOpen(false, true); syncMobTabs(); }
    };
    panel.addEventListener("pointerup", end);
    panel.addEventListener("pointercancel", end);
  });
}
["gesturestart", "gesturechange", "gestureend"].forEach(type => document.addEventListener(type, e => e.preventDefault(), {passive: false}));

/* ---------- boot ---------- */
applyTheme(); $("#spinBtn").setAttribute("aria-pressed", state.spin);
updateUnitBtn(); $("#wxBadgesBtn").setAttribute("aria-pressed", state.weatherBadges);
if (iosSafariNeedsHint() && localStorage.getItem("atlas-of-me:ios-hint") !== "1") $("#iosHint").hidden = false;
bindSheets();
syncMobTabs();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").then(() => {}, () => {});
readHash();
d3.json("vendor/countries-50m.json").then(topo => {
  initData(topo); computeFits(); k = fits.globe.s; mix = {a:state.proj,b:state.proj,t:1};
  updateProjNav(); refreshAll();
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { computeFits(); if (isGlobe()) k = fits.globe.s * zt.k; render(); }, 120); });
  window.__atlas = {state:() => cur(), setProjection, setMark, encodeState, flyTo, refreshWeather, ready:true};
}).catch(err => { console.error(err); toast("Couldn't load the map data"); });
})();
