const HERO_FILE = "/assets/home.webp";
const state = { county: "", town: "", price: "all", type: "all", results: [], controller: null };
const $ = (id) => document.getElementById(id);
const home = $("home");
const details = $("details");
let townList = {};
const norm = (s) => (s || "").replace(/^臺/, "台").replace("桃園縣", "桃園市").replace("台東", "台東");
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}
function discoverHero() {
  const img = $("heroImage");
  img.addEventListener("load", () => { img.hidden = false; home.classList.add("has-hero"); });
  img.addEventListener("error", () => { img.hidden = true; home.classList.remove("has-hero"); });
  img.src = HERO_FILE;
}
function decodeMap(topology) {
  const { scale, translate } = topology.transform;
  const arcCache = new Map();
  function arcAt(n) {
    const positive = n >= 0 ? n : ~n;
    if (!arcCache.has(positive)) {
      let x = 0, y = 0;
      const points = topology.arcs[positive].map(([dx, dy]) => {
        x += dx; y += dy;
        return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
      });
      arcCache.set(positive, points);
    }
    const pts = arcCache.get(positive);
    return n >= 0 ? pts : [...pts].reverse();
  }
  function rings(arcs) {
    return arcs.map(line => line.flatMap((n, i) => {
      const coords = arcAt(n);
      return i ? coords.slice(1) : coords;
    }));
  }
  return topology.objects.layer1.geometries.map(g => ({
    name: norm(g.properties.COUNTYNAME || g.properties.name),
    polys: g.type === "Polygon" ? [rings(g.arcs)] : g.arcs.map(rings)
  }));
}
function mapPoint([lon, lat]) {
  return [(lon - 119.0) * 136, (25.7 - lat) * 165];
}
function renderMap(topology) {
  const map = $("countyMap");
  const ns = "http://www.w3.org/2000/svg";
  for (const region of decodeMap(topology)) {
    if (region.name === "金門縣" || region.name === "連江縣") continue;
    const visible = region.polys.map(poly => poly.map(ring => ring.filter(([lon, lat]) => lon > 119.05 && lon < 123 && lat > 21.7 && lat < 26.1))).filter(poly => poly.some(r => r.length > 2));
    let pathData = "", positions = [];
    for (const poly of visible) for (const ring of poly) {
      if (ring.length < 3) continue;
      const coords = ring.map(mapPoint);
      pathData += coords.map(([x,y],i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + "Z ";
      positions.push(...coords);
    }
    if (!pathData) continue;
    const path = document.createElementNS(ns, "path");
    path.setAttribute("class", "county-path");
    path.setAttribute("d", pathData);
    path.setAttribute("role", "button");
    path.setAttribute("tabindex", "0");
    path.setAttribute("aria-label", region.name);
    path.appendChild(document.createElementNS(ns, "title")).textContent = region.name;
    path.addEventListener("click", () => showCounty(region.name));
    path.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showCounty(region.name); } });
    map.appendChild(path);
    if (positions.length && region.name !== "澎湖縣") {
      const xs = positions.map(p => p[0]), ys = positions.map(p => p[1]);
      let x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2;
      const label = document.createElementNS(ns, "text");
      label.setAttribute("class", "county-name");
      label.setAttribute("x", x); label.setAttribute("y", y);
      label.setAttribute("text-anchor", "middle");
      label.textContent = region.name.replace(/[縣市]$/,"");
      map.appendChild(label);
    }
  }
}
function setButtons(groupId, value) {
  $(groupId).querySelectorAll("button").forEach(button => {
    const selected = button.dataset.value === value;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}
function updateTownChoices() {
  const select = $("townSelect");
  select.replaceChildren(new Option("全區", ""));
  for (const town of townList[state.county] || []) select.add(new Option(town, town));
  select.value = state.town;
}
function navigateHome() {
  if (state.controller) state.controller.abort();
  state.county = ""; state.results = [];
  home.hidden = false; details.hidden = true;
  document.title = "台灣景點地圖";
  history.replaceState(null,"",location.pathname);
}
async function showCounty(county, push = true) {
  state.county = norm(county);
  state.town = ""; state.price = "all"; state.type = "all"; state.results = [];
  $("countyTitle").textContent = state.county;
  setButtons("priceFilter", state.price);
  setButtons("typeFilter", state.type);
  updateTownChoices();
  home.hidden = true; details.hidden = false;
  document.title = state.county + "景點推薦 | 台灣景點地圖";
  if (push) history.pushState({county:state.county},"", "?county=" + encodeURIComponent(state.county));
  window.scrollTo(0,0);
  await loadPlaces();
}
function showLoading() {
  $("resultCount").textContent = "";
  $("results").replaceChildren(...Array.from({length:6}, () => el("div","skeleton")));
}
function showMessage(message) {
  $("resultCount").textContent = "";
  $("results").replaceChildren(el("div","state",message));
}
function matches(spot) {
  if (state.type !== "all" && spot.type !== state.type) return false;
  if (state.price === "all") return true;
  if (typeof spot.admission !== "number") return false;
  return state.price === "under200" ? spot.admission <= 200
    : state.price === "200to600" ? spot.admission > 200 && spot.admission <= 600
    : spot.admission > 600;
}
function createCard(spot) {
  const card = el("article","spot-card");
  const picture = el("div","spot-picture");
  if (spot.photoUrl) {
    const img = el("img");
    img.loading = "lazy"; img.alt = spot.name; img.src = spot.photoUrl;
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove());
    picture.appendChild(img);
    if (spot.photoCredit) picture.appendChild(el("span","photo-credit",spot.photoCredit));
  }
  const main = el("div","spot-main");
  const titleRow = el("div","spot-title-row");
  titleRow.appendChild(el("h3","spot-title",spot.name));
  const score = el("div","score");
  score.append(el("strong","",spot.score),el("small","","分"));
  score.setAttribute("aria-label",`本站綜合推薦評分 ${spot.score} 分`);
  score.title = "本站綜合推薦評分";
  titleRow.appendChild(score);
  const desc = el("p","spot-description",spot.feature || "查看景點資訊與近期遊客評價。");
  const link = el("a","map-link","Google Maps");
  link.href = spot.mapsUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
  link.setAttribute("translate","no");
  main.append(titleRow,desc,link);card.append(picture,main);
  return card;
}
function displayPlaces() {
  if (!state.county) return;
  const items = state.results.filter(matches);
  $("resultCount").textContent = items.length ? `${items.length} 個景點` : "";
  if (!items.length) {
    showMessage(state.price === "all" ? "沒有符合條件的景點" : "沒有查到票價已確認的符合景點");
    return;
  }
  $("results").replaceChildren(...items.map(createCard));
}
async function loadPlaces() {
  if (state.controller) state.controller.abort();
  const ctl = new AbortController(); state.controller = ctl;
  showLoading();
  try {
    const params = new URLSearchParams({county:state.county});
    if (state.town) params.set("town", state.town);
    const response = await fetch("/api/places?" + params.toString(),{signal:ctl.signal,headers:{"Accept":"application/json"}});
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "目前無法取得景點資料");
    if (ctl.signal.aborted) return;
    state.results = Array.isArray(data.places) ? data.places : [];
    displayPlaces();
  } catch(error) {
    if (error.name !== "AbortError") showMessage(error.message || "景點搜尋失敗");
  }
}
document.addEventListener("click", e => {
  const choice = e.target.closest(".choice-group button");
  if (choice) {
    const isPrice = choice.closest("#priceFilter");
    if (isPrice) state.price = choice.dataset.value;
    else state.type = choice.dataset.value;
    setButtons(isPrice ? "priceFilter" : "typeFilter", choice.dataset.value);
    displayPlaces();
  }
  const island = e.target.closest(".island-choices button");
  if (island) showCounty(island.dataset.county);
});
$("townSelect").addEventListener("change", e => {state.town = e.target.value;loadPlaces();});
$("returnBtn").addEventListener("click", () => history.length > 1 && history.state?.county ? history.back() : navigateHome());
window.addEventListener("popstate", () => {
  const county = new URLSearchParams(location.search).get("county");
  if (county && townList[norm(county)]) showCounty(county,false);
  else navigateHome();
});
async function start() {
  discoverHero();
  try {
    const [ts, cs] = await Promise.all([fetch("/data/towns.json"),fetch("/data/counties.topo.json")]);
    townList = await ts.json();
    renderMap(await cs.json());
  } catch (error) {
    console.error("地圖資料載入失敗",error);
    const fallback = el("div","county-fallback");
    fallback.style.cssText = "position:absolute;inset:20% 8% auto;display:flex;gap:10px;flex-wrap:wrap;justify-content:center";
    for (const name of ["台北市","新北市","桃園市","新竹縣","苗栗縣","台中市","彰化縣","南投縣","雲林縣","嘉義縣","台南市","高雄市","屏東縣","宜蘭縣","花蓮縣","台東縣"]) {
      const button = el("button","",name);
      button.style.cssText = "border:0;background:#fffaf1dd;border-radius:10px;padding:8px;color:#637366";
      button.addEventListener("click",()=>showCounty(name));
      fallback.append(button);
    }
    home.append(fallback);
  }
  const county = norm(new URLSearchParams(location.search).get("county"));
  if (county && townList[county]) await showCounty(county,false);
}
start();
