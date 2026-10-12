const COUNTY_NAMES = [
  "台北市","新北市","基隆市","桃園市","新竹市","新竹縣","苗栗縣",
  "台中市","彰化縣","南投縣","雲林縣","嘉義市","嘉義縣",
  "台南市","高雄市","屏東縣","宜蘭縣","花蓮縣","台東縣",
  "澎湖縣","金門縣","連江縣"
];
const COUNTY_SET = new Set(COUNTY_NAMES);
const MAX_RESULTS = 20;
const MAX_RESEARCH = 8;
const FIELD_MASK = [
  "places.id","places.displayName","places.formattedAddress",
  "places.rating","places.userRatingCount","places.googleMapsUri",
  "places.photos","places.types","places.primaryType",
  "places.businessStatus"
].join(",");
const BLOCK_TYPES = new Set([
  "restaurant","cafe","bar","night_club","hotel","lodging",
  "convenience_store","supermarket","shopping_mall","car_dealer",
  "gas_station","pharmacy","bank","atm","dentist","doctor",
  "real_estate_agency","school","university","beauty_salon",
  "hair_care","laundry","store","meal_delivery","meal_takeaway",
  "electronics_store","clothing_store","car_repair",
  "travel_agency","parking","bus_station","train_station",
  "transit_station","airport","gym"
]);
const INDOOR_TYPES = new Set(["museum","art_gallery","aquarium","library","movie_theater","bowling_alley"]);
const OUTDOOR_TYPES = new Set(["park","national_park","campground","hiking_area","zoo","beach"]);
const NEGATIVE = /管理差|服務差|環境髒|髒亂|危險|收費不合理|排隊過久|停車困難|踩雷|不推薦|評價很差|態度惡劣|衛生不佳/g;
const rateTable = new Map();

const normalize = value => String(value || "").replace(/臺/g,"台").replace(/桃園縣/g,"桃園市").trim();
const limit = (value,a,b) => Math.min(b,Math.max(a,value));
const chars = text => [...String(text || "")];
const tidy = text => String(text || "").replace(/[\u0000-\u001f<>]/g," ").replace(/\s+/g," ").trim();
const short = (text, max=50) => chars(tidy(text)).slice(0,max).join("");
const jsonReply = (value,status=200) => Response.json(value,{
  status,
  headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin"}
});
function allowRequest(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && !["same-origin","none"].includes(site)) return false;
  const now = Date.now();
  const ip = (request.headers.get("CF-Connecting-IP") || "unidentified") + (new URL(request.url).pathname === "/api/photo" ? ":photo" : ":search");
  const entry = rateTable.get(ip);
  if (!entry || now - entry.start > 60000) {
    rateTable.set(ip,{start:now,count:1});
  } else if (++entry.count > (ip.endsWith(":photo") ? 100 : 24)) return false;
  if (rateTable.size > 2500) {
    for (const [key,val] of rateTable) if (now-val.start > 60000) rateTable.delete(key);
  }
  return true;
}
function typeOf(place) {
  const ts = new Set([...(place.types || []),place.primaryType].filter(Boolean));
  const name = normalize(place.displayName?.text || "");
  if ([...ts].some(t=>INDOOR_TYPES.has(t)) || /博物館|美術館|展示館|展覽館|科學館|文化館|紀念館|圖書館|水族館|故事館|觀光工廠|遊客中心|室內樂園|手作工坊/.test(name)) return "indoor";
  if ([...ts].some(t=>OUTDOOR_TYPES.has(t)) || /公園|步道|瀑布|海灘|海水浴場|沙灘|山|濕地|森林|風景區|老街|湖|溪|草原|露營|觀景台|吊橋|古道|燈塔|夕陽|港|沙洲|地熱|花園|河堤|農場|牧場|自行車道/.test(name)) return "outdoor";
  return null;
}
function eligible(place,county,town) {
  const name = normalize(place.displayName?.text || "");
  const address = normalize(place.formattedAddress || "");
  const reviews = Number(place.userRatingCount || 0);
  if (!place.id || !name || name.length > 85) return false;
  if (!address.includes(county) || (town && !address.includes(town))) return false;
  if (place.businessStatus === "CLOSED_PERMANENTLY" || place.businessStatus === "CLOSED_TEMPORARILY") return false;
  if ((Number(place.rating)||0) < 3.7 || reviews < 20) return false;
  if ((place.types||[]).some(t=>BLOCK_TYPES.has(t)) || BLOCK_TYPES.has(place.primaryType)) return false;
  if (/飯店|旅館|民宿|汽車旅館|餐廳|咖啡|早午餐|火鍋|手搖飲|停車場|便利商店|超市|診所|補習班/.test(name)) return false;
  return true;
}
function baseScore(rating,count) {
  const n = Math.max(0,Number(count)||0);
  const bayesian = (n*rating + 90*3.9)/(n+90);
  return limit(Math.round(50+(bayesian-3.5)*26+Math.min(12,Math.log10(n+1)*3)),1,99);
}
function googlePhoto(place) {
  const p = (place.photos||[])[0];
  if (!p?.name) return {photoUrl:null,photoCredit:null,photoCreditUrl:null};
  return {
    photoUrl:"/api/photo?name="+encodeURIComponent(p.name),
    photoCredit: (p.authorAttributions||[]).map(a=>a.displayName).filter(Boolean).slice(0,2).join("、") || "Google Maps",
    photoCreditUrl: (p.authorAttributions||[]).find(a=>a.uri?.startsWith("https://"))?.uri || null
  };
}
async function googleSearch(county,town,key) {
  const textQuery = [county,town,"旅遊景點 觀光 景點推薦"].filter(Boolean).join(" ");
  const response = await fetch("https://places.googleapis.com/v1/places:searchText",{
    method:"POST",
    headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":FIELD_MASK},
    body:JSON.stringify({textQuery,languageCode:"zh-TW",regionCode:"TW",maxResultCount:MAX_RESULTS}),
    signal:AbortSignal.timeout(14000)
  });
  if (!response.ok) throw new Error("Google Places 搜尋暫時無法使用");
  const payload = await response.json();
  const used = new Set();
  return (payload.places || []).filter(p=>{
    if (!eligible(p,county,town)||used.has(p.id)) return false;
    used.add(p.id);
    return true;
  }).map(p=>{
    const img = googlePhoto(p);
    const count = Number(p.userRatingCount)||0;
    return {
      id:p.id,
      name:tidy(p.displayName.text),
      address:tidy(p.formattedAddress),
      googleRating:Number(p.rating)||0,
      reviewCount:count,
      score:baseScore(Number(p.rating)||0,count),
      type:typeOf(p),
      admission:null,
      feature:"",
      mapsUrl:p.googleMapsUri || ("https://www.google.com/maps/place/?q=place_id:"+encodeURIComponent(p.id)),
      ...img,
      evidence:[]
    };
  }).sort((a,b)=>b.score-a.score||b.reviewCount-a.reviewCount);
}
function parseAdmission(pages,placeName) {
  const values=[];
  const free=/免門票|免收門票|免費入場|免費入園|免入園費|免費參觀|無需門票/;
  const paid=/(?:全票|成人票|一般票|入場費|入園費|門票|票價)\s*(?:為|是|約|每人|：|:|NT\$|NTD|新台幣|\$|台幣|\s|\-|起|從){0,12}\s*(\d{1,4})\s*(?:元|塊)?/g;
  const inverse=/(?:NT\$|NTD|新台幣|\$)\s*(\d{1,4})\s*元?\s*(?:全票|成人票|一般票|門票|票價|入場費|入園費)/g;
  for (const page of pages) {
    const body=normalize(page.title+" "+page.snippet);
    const compact=normalize(placeName).replace(/\s+/g,"");
    if (compact.length >= 3 && !body.replace(/\s+/g,"").includes(compact)) continue;
    if (free.test(body) && !/部分免費|不免費|非免費/.test(body)) values.push(0);
    for (const re of [paid,inverse]) {
      re.lastIndex=0;
      for (const m of body.matchAll(re)) {
        const value=Number(m[1]);
        if (value>0 && value<=1500) values.push(value);
      }
    }
  }
  if (!values.length) return null;
  values.sort((a,b)=>a-b);
  if (values[0]===0 && values[values.length-1]>0) return null;
  // Multiple conflicting public prices may reflect ticket categories or outdated pages.
  if (values[values.length-1]-values[0]>100) return null;
  return values[Math.floor(values.length/2)];
}
async function langResearch(spot,county,key) {
  if (!key) return spot;
  try {
    const query = '"' + spot.name.replace(/"/g,"") + '" ' + county + " 景點 旅遊評價 缺點 門票 全票";
    const response = await fetch("https://api.langsearch.com/v1/web-search",{
      method:"POST",
      headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({query,count:5,contents:{text:true}}),
      signal:AbortSignal.timeout(9000)
    });
    if (!response.ok) return spot;
    const payload=await response.json();
    const raw=payload?.data?.webPages?.value || [];
    const pages=raw.slice(0,5).map(p=>({
      title:short(p.name || p.title || "",105),
      snippet:short(p.snippet || p.summary || p.text || "",310)
    }));
    const evidence=pages.map(p=>p.title+" "+p.snippet);
    const issueCount=Math.min(3,(evidence.join(" ").match(NEGATIVE)||[]).length);
    spot.score=limit(spot.score-issueCount*2,1,99);
    spot.admission=parseAdmission(pages,spot.name);
    spot.evidence=evidence.map(t=>short(t,320)).filter(Boolean).slice(0,3);
  } catch { /* Keep a valid Google listing when external web search fails. */ }
  return spot;
}
function safeFallback(spot) {
  if (spot.type==="indoor") return "室內參觀型景點，可依開放時段安排走訪。";
  if (spot.type==="outdoor") return "戶外走訪型景點，適合規劃散步與欣賞風景。";
  return "依遊客評分與評論數綜合排序，適合納入旅遊清單。";
}
async function writeFeatures(spots,env) {
  spots.forEach(s=>{s.feature=safeFallback(s);});
  if (!env.AI || !spots.length) return;
  try {
    const input=spots.slice(0,MAX_RESEARCH).map(s=>({
      id:s.id,name:s.name,address:s.address,
      kind:s.type || "未分類",webEvidence:s.evidence.slice(0,2)
    }));
    const instructions = "你是台灣景點推薦的編輯。僅使用提供的景點名稱、地址、景點類型和檢索證據寫特色，不得自行補充票價、交通、設施或過度保證。以繁體中文寫具體且自然、最多50個中文字。若資料不足，保守介紹景點類型。僅回覆JSON陣列，每筆格式為 {\"id\":\"原id\",\"feature\":\"說明\"}。";
    const generated=await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8",{
      messages:[
        {role:"system",content:instructions},
        {role:"user",content:JSON.stringify(input)}
      ],
      max_tokens:900,temperature:0.15
    });
    const output=typeof generated==="string" ? generated : (generated?.response || generated?.choices?.[0]?.message?.content || "");
    const chunk=String(output).match(/\[[\s\S]*\]/)?.[0];
    if (!chunk) return;
    const arr=JSON.parse(chunk);
    const lookup=new Map(arr.filter(x=>x && typeof x.id==="string" && typeof x.feature==="string").map(x=>[x.id,x.feature]));
    for(const s of spots) if (lookup.has(s.id)) {
      const value=short(lookup.get(s.id),50);
      if (value && !/^(沒有資料|不知道|無法確認)/.test(value)) s.feature=value;
    }
  } catch { /* AI feature is optional; never display an invented success state. */ }
}
async function attractions(request,env) {
  if (!env.GOOGLE_PLACES_API_KEY) return jsonReply({message:"Google Places API 尚未連接"},503);
  const url=new URL(request.url);
  const county=normalize(url.searchParams.get("county"));
  const town=normalize(url.searchParams.get("town"));
  if (!COUNTY_SET.has(county)) return jsonReply({message:"請選擇正確的縣市"},400);
  if (town && (!/^[\u3400-\u9fff]{1,9}[市區鄉鎮]$/.test(town) || town.length>12)) return jsonReply({message:"鄉鎮格式不正確"},400);
  try {
    const places=await googleSearch(county,town,env.GOOGLE_PLACES_API_KEY);
    // Search first, research a bounded shortlist, then rerank; no D1 or persistent caching.
    const research=places.slice(0,MAX_RESEARCH);
    for (let i=0;i<research.length;i+=4) {
      await Promise.all(research.slice(i,i+4).map(s=>langResearch(s,county,env.LANGSEARCH_API_KEY)));
    }
    await writeFeatures(places,env);
    places.sort((a,b)=>b.score-a.score||b.reviewCount-a.reviewCount);
    return jsonReply({places:places.map(({evidence,googleRating,reviewCount,address,id,...shown})=>shown)});
  } catch (error) {
    console.error("Places API error",error?.message || error);
    return jsonReply({message:"景點資料暫時無法取得，請稍後重試"},502);
  }
}
async function photoProxy(request,env) {
  if (!env.GOOGLE_PLACES_API_KEY) return new Response(null,{status:404});
  const name=new URL(request.url).searchParams.get("name") || "";
  if (!/^places\/[^/\s?#]+\/photos\/[^/\s?#]+$/.test(name)) return new Response(null,{status:400});
  try {
    const response=await fetch("https://places.googleapis.com/v1/"+name+"/media?maxWidthPx=500&skipHttpRedirect=true",{
      headers:{"X-Goog-Api-Key":env.GOOGLE_PLACES_API_KEY},
      signal:AbortSignal.timeout(7500)
    });
    if (!response.ok) return new Response(null,{status:404});
    const data=await response.json();
    if (!data.photoUri || !data.photoUri.startsWith("https://")) return new Response(null,{status:404});
    return Response.redirect(data.photoUri,302);
  } catch { return new Response(null,{status:404}); }
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "GET") return jsonReply({message:"不支援此請求"},405);
    if (!allowRequest(request)) return jsonReply({message:"請稍後再試"},429);
    if (url.pathname==="/api/places") return attractions(request,env);
    if (url.pathname==="/api/photo") return photoProxy(request,env);
    return jsonReply({message:"查無此項目"},404);
  }
};
