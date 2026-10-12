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
  img.addEventListener("load", () => {
    // Use the actual image dimensions: the same artwork and county hit areas
    // now scale as one contained image on mobile, tablet and desktop.
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (width > 0 && height > 0) {
      $("heroStage").style.setProperty("--hero-ratio", String(width / height));
    }
    img.hidden = false;
    home.classList.add("has-hero");
    if(illustration)renderIllustratedMap(illustration);
  });
  img.addEventListener("error", () => {
    img.hidden = true;
    home.classList.remove("has-hero");
  });
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

const COUNTY_GROUPS = {
  "台北市":["台北市","新北市","基隆市"],
  "新竹縣":["新竹縣","新竹市"],
  "嘉義縣":["嘉義縣","嘉義市"]
};
let illustration = null;
function groupForCounty(county) {
  return Object.keys(COUNTY_GROUPS).find(key=>COUNTY_GROUPS[key].includes(county)) || null;
}
function createCountyPath(map, name, data) {
  const ns="http://www.w3.org/2000/svg";
  const path=document.createElementNS(ns,"path");
  path.setAttribute("class","county-path illustrated-path");
  path.setAttribute("d",data);
  path.setAttribute("role","button");
  path.setAttribute("tabindex","0");
  path.setAttribute("aria-label",name);
  path.setAttribute("fill-rule","evenodd");
  const title=document.createElementNS(ns,"title"); title.textContent=name;
  path.appendChild(title);
  path.addEventListener("click",()=>showCounty(name));
  path.addEventListener("keydown",e=>{
    if(e.key==="Enter"||e.key===" "){e.preventDefault();showCounty(name);}
  });
  map.appendChild(path);
}
function renderIllustratedMap(data) {
  if(!data || !data.viewBox || !data.regions)return;
  const [width,height]=data.viewBox;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
  const map=$("countyMap");
  map.replaceChildren();
  map.setAttribute("viewBox",`0 0 ${width} ${height}`);
  map.setAttribute("preserveAspectRatio","none");
  $("mapArea").classList.add("illustrated-map");
  // Shapes are extracted from the 15 colored sections *in the artwork*.
  // They are distinct from administrative boundaries and do not overlap.
  for(const [name,path] of Object.entries(data.regions)) {
    if(typeof path==="string"&&path.startsWith("M"))createCountyPath(map,name,path);
  }
}
function renderMap(topology) {
  const map=$("countyMap");
  const ns="http://www.w3.org/2000/svg";
  map.replaceChildren();
  $("mapArea").classList.remove("illustrated-map");
  map.setAttribute("viewBox","0 0 450 700");
  const {scale,translate}=topology.transform;
  const arcs=new Map();
  function ringOf(arcsList) {
    return arcsList.flatMap((n,i)=>{
      const k=n>=0?n:~n;
      if(!arcs.has(k)){
        let x=0,y=0;
        arcs.set(k,topology.arcs[k].map(([dx,dy])=>{
          x+=dx;y+=dy;
          return [x*scale[0]+translate[0],y*scale[1]+translate[1]];
        }));
      }
      const coords=n>=0?arcs.get(k):[...arcs.get(k)].reverse();
      return i?coords.slice(1):coords;
    });
  }
  const shapes=[];
  for(const feature of topology.objects.layer1.geometries){
    const name=norm(feature.properties.COUNTYNAME||feature.properties.name);
    if(name==="金門縣"||name==="連江縣")continue;
    const polys=feature.type==="Polygon"?[feature.arcs]:feature.arcs;
    let path="",area=0;
    for(const poly of polys)for(const rings of poly){
      const coords=ringOf(rings);
      if(coords.length<3)continue;
      let twiceArea=0;
      const pts=coords.map(([lon,lat])=>[(lon-119)*136,(25.7-lat)*165]);
      for(let i=0;i<pts.length;i++){
        const a=pts[i],b=pts[(i+1)%pts.length];
        twiceArea+=a[0]*b[1]-b[0]*a[1];
      }
      area+=Math.abs(twiceArea);
      path+=pts.map(([x,y],i)=>(i?"L":"M")+x.toFixed(1)+","+y.toFixed(1)).join(" ")+"Z ";
    }
    shapes.push({name,path,area});
  }
  shapes.sort((a,b)=>b.area-a.area);
  for(const item of shapes)if(item.path){
    const path=document.createElementNS(ns,"path");
    path.setAttribute("class","county-path");
    path.setAttribute("d",item.path);
    path.setAttribute("fill-rule","evenodd");
    path.setAttribute("role","button");
    path.setAttribute("tabindex","0");
    path.setAttribute("aria-label",item.name);
    const title=document.createElementNS(ns,"title"); title.textContent=item.name;
    path.appendChild(title);
    const activate=()=>showCounty(item.name);
    path.addEventListener("click",activate);
    path.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate();}});
    map.appendChild(path);
  }
}
function setButtons(groupId, value) {
  $(groupId).querySelectorAll("button").forEach(button => {
    const selected = button.dataset.value === value;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}
function updateCountyChoices() {
  const group = groupForCounty(state.county);
  const select = $("countySelect");
  $("countyPicker").hidden = !group;
  select.replaceChildren();
  if(group){for(const county of COUNTY_GROUPS[group])select.add(new Option(county,county));}
  select.value=state.county;
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
  updateCountyChoices();
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
    if (spot.photoCredit) {
      const credit = el(spot.photoCreditUrl ? "a" : "span","photo-credit",spot.photoCredit);
      if (spot.photoCreditUrl) {credit.href=spot.photoCreditUrl;credit.target="_blank";credit.rel="noopener noreferrer";}
      picture.appendChild(credit);
    }
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
$("countySelect").addEventListener("change", e => {
  if(!e.target.value)return;
  state.county=e.target.value;state.town="";state.results=[];
  $("countyTitle").textContent=state.county;
  document.title=state.county+"景點推薦 | 台灣景點地圖";
  history.replaceState({county:state.county},"","?county="+encodeURIComponent(state.county));
  updateTownChoices();loadPlaces();
});
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
    const topology=await cs.json();
    renderMap(topology);
    try {
      const response=await fetch("/data/illustrated-regions.json");
      if(response.ok){illustration=await response.json();if(home.classList.contains("has-hero"))renderIllustratedMap(illustration);}
    }catch(error){console.warn("旅遊地圖色塊載入失敗，使用行政區備援",error);}
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
