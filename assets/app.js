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
  {id:"c1",name:"Visited",color:"#22d3ee",pattern:"solid",counts:true},
  {id:"c2",name:"Lived",color:"#f472b6",pattern:"stripes",counts:true},
  {id:"c3",name:"Want to visit",color:"#facc15",pattern:"dots",counts:false},
  {id:"c4",name:"Transit only",color:"#a78bfa",pattern:"crosshatch",counts:false}];
const THEMES = {
  dark:{bg:"#070b16",o1:"#0f2350",o2:"#060c1d",land:"#24304f",landHi:"#34446d",border:"#0b1226",grat:"rgba(140,170,255,.10)",glow:"#22d3ee",text:"#e8eefc",mut:"#8f9bbb",rim:"rgba(34,211,238,.55)"},
  light:{bg:"#eef3fb",o1:"#cfe6fb",o2:"#a9cdf0",land:"#f8fafc",landHi:"#e2e8f0",border:"#94a3b8",grat:"rgba(30,60,120,.10)",glow:"#0891b2",text:"#0f1b33",mut:"#5b6785",rim:"rgba(8,145,178,.45)"}};

/* ---------- countries ---------- */
const C = {}; // iso2 -> info
for (const [iso,name,num,cont,un,lat,lon,flag,area] of window.COUNTRIES) C[iso] = {iso,name,num,cont,un:!!un,lat,lon,flag,area};
const byNum = {}; Object.values(C).forEach(c => { if (c.num) byNum[c.num] = c.iso; });
const ALL = Object.values(C).filter(c => c.cont !== "Antarctica" || c.iso === "AQ").sort((a,b)=>a.name.localeCompare(b.name));
const UN_TOTAL = ALL.filter(c=>c.un).length; // 195
const UN_BY_CONT = {}; CONTINENTS.forEach(k => UN_BY_CONT[k] = ALL.filter(c=>c.un && c.cont===k).length);

/* ---------- state ---------- */
let state = load() || fresh();
let shared = null; // when viewing a shared link
function fresh(){ return {cats:DEFAULT_CATS(),marks:{},active:"c1",theme:"dark",proj:"globe",spin:!REDUCED}; }
function load(){ try { const s = JSON.parse(localStorage.getItem(STORE)); return s && s.cats && s.cats.length ? s : null; } catch { return null; } }
function save(){ if (shared) return; try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }
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
  save(); paint(); render(); updateUI();
}

/* ---------- tooltip ---------- */
const tip = $("#tooltip");
function showTip(e, d){
  const c = C[d.iso]; const name = c ? c.name : d.properties?.name || "";
  const cat = c && catOf(cur().marks[c.iso]);
  tip.innerHTML = `<div class="t">${c ? c.flag + " " : ""}${esc(name)}</div><div class="c">${cat ? `<span style="color:${cat.color}">●</span> ${esc(cat.name)}` : (c ? "Not marked · click to mark as " + esc(catOf(cur().active)?.name || "") : "Disputed / not selectable")}</div>`;
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
    .html((d,i) => `${swatchSVG(d, "c"+i)}<span class="nm">${esc(d.name)}</span><span class="ct">${n[d.id]||0}</span><span class="ed" role="button" tabindex="0" title="Edit ${esc(d.name)}" aria-label="Edit ${esc(d.name)}">✎</span>`)
    .on("click", (e,d) => { if (e.target.closest(".ed")) return editCat(d); s.active = d.id; save(); updateUI(); })
    .on("keydown", (e,d) => { if (e.target.closest(".ed") && (e.key==="Enter"||e.key===" ")) { e.preventDefault(); e.stopPropagation(); editCat(d); } });
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
function editCat(cat){
  editing = cat; draft = cat ? {...cat} : {id:"c"+Date.now().toString(36), name:"", color:SWATCHES[cur().cats.length % SWATCHES.length], pattern:PATTERNS[cur().cats.length % PATTERNS.length], counts:true};
  $("#catDlgTitle").textContent = cat ? "Edit category" : "New category";
  $("#catName").value = draft.name; $("#catColor").value = draft.color; $("#catCounts").checked = draft.counts;
  $("#catDelete").hidden = !cat || cur().cats.length <= 1;
  drawPatPick(); dlg.showModal(); $("#catName").focus();
}
function drawPatPick(){
  $("#swatches").innerHTML = SWATCHES.map(c => `<button type="button" style="background:${c}" data-c="${c}" aria-label="Colour ${c}"></button>`).join("");
  $("#patPick").innerHTML = PATTERNS.map((p,i) => `<button type="button" data-p="${p}" aria-pressed="${p===draft.pattern}">${swatchSVG({...draft,pattern:p,id:"pp"+i},"pp"+i).replace('viewBox="0 0 30 22"','viewBox="0 0 44 24"').replace('width="30" height="22"','width="44" height="24"')}${p}</button>`).join("");
}
$("#swatches").addEventListener("click", e => { const c = e.target.dataset.c; if (c) { draft.color = c; $("#catColor").value = c; drawPatPick(); } });
$("#catColor").addEventListener("input", e => { draft.color = e.target.value; drawPatPick(); });
$("#patPick").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { draft.pattern = b.dataset.p; drawPatPick(); } });
$("#catDelete").onclick = () => {
  const s = cur(); if (!confirm(`Delete “${editing.name}”? Countries marked with it will be unmarked.`)) return;
  s.cats = s.cats.filter(c => c.id !== editing.id); for (const iso in s.marks) if (s.marks[iso] === editing.id) delete s.marks[iso];
  if (s.active === editing.id) s.active = s.cats[0].id; dlg.close(); refreshAll();
};
dlg.addEventListener("close", () => {
  if (dlg.returnValue !== "ok") return;
  draft.name = $("#catName").value.trim() || "Untitled"; draft.counts = $("#catCounts").checked;
  const s = cur(); if (editing) Object.assign(editing, draft); else { s.cats.push(draft); s.active = draft.id; }
  refreshAll();
});
$("#addCat").onclick = () => editCat(null);

/* ---------- share / import / export ---------- */
function encodeState(s){
  const cats = s.cats.map(c => [c.name.replace(/[~|;]/g," "), c.color.replace("#",""), PATTERNS.indexOf(c.pattern), c.counts?1:0].join("~")).join("|");
  const groups = s.cats.map((c,i) => { const isos = Object.keys(s.marks).filter(iso => s.marks[iso] === c.id); return isos.length ? i + ":" + isos.join(",") : ""; }).filter(Boolean).join(";");
  return LZString.compressToEncodedURIComponent("1#" + cats + "#" + groups);
}
function decodeState(str){
  const raw = LZString.decompressFromEncodedURIComponent(str); if (!raw) return null;
  const [v, cats, groups] = raw.split("#"); if (v !== "1") return null;
  const s = fresh(); s.cats = cats.split("|").map((x,i) => { const [name,color,p,counts] = x.split("~"); return {id:"c"+(i+1), name, color:"#"+color, pattern:PATTERNS[+p]||"solid", counts:counts==="1"}; });
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
    const s = cur(); s.cats = j.categories.map(c => ({id:String(c.id), name:String(c.name).slice(0,24), color:/^#[0-9a-f]{6}$/i.test(c.color)?c.color:"#22d3ee", pattern:PATTERNS.includes(c.pattern)?c.pattern:"solid", counts:!!c.counts}));
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
  const p = b.dataset.p; document.querySelectorAll(".panel").forEach(x => x.classList.toggle("open", x.id === p && !x.classList.contains("open")));
  document.querySelectorAll(".mobtabs button").forEach(x => x.classList.toggle("on", x === b && document.getElementById(p)?.classList.contains("open")));
});
let tt; function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2200); }

/* ---------- shared link mode ---------- */
function readHash(){
  const m = location.hash.match(/#m=([^&]+)/); if (!m) return;
  const s = decodeState(m[1]); if (!s) { toast("Couldn't read that share link"); return; }
  shared = s; $("#sharedBanner").hidden = false;
}
$("#keepShared").onclick = () => { if (!confirm("Replace your saved map with this shared one?")) return; state = {...shared, theme:state.theme, proj:state.proj, spin:state.spin}; shared = null; history.replaceState(null, "", location.pathname); $("#sharedBanner").hidden = true; save(); refreshAll(); toast("Saved as your map"); };
$("#leaveShared").onclick = () => { shared = null; history.replaceState(null, "", location.pathname); $("#sharedBanner").hidden = true; refreshAll(); };
window.addEventListener("hashchange", () => { readHash(); refreshAll(); });

function refreshAll(){ save(); updatePatterns(); paint(); render(); updateUI(); }

/* ---------- boot ---------- */
applyTheme(); $("#spinBtn").setAttribute("aria-pressed", state.spin);
readHash();
d3.json("vendor/countries-50m.json").then(topo => {
  initData(topo); computeFits(); k = fits.globe.s; mix = {a:state.proj,b:state.proj,t:1};
  updateProjNav(); refreshAll();
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { computeFits(); if (isGlobe()) k = fits.globe.s * zt.k; render(); }, 120); });
  window.__atlas = {state:() => cur(), setProjection, setMark, encodeState, flyTo, ready:true};
}).catch(err => { console.error(err); toast("Couldn't load the map data"); });
})();
