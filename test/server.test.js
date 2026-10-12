import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("requires Google Places secret", async () => {
  const req = new Request("https://example.com/api/places?county=彰化縣");
  const res = await worker.fetch(req, {ASSETS:{fetch:()=>{}}});
  assert.equal(res.status, 503);
});
test("rejects invalid county", async () => {
  const req = new Request("https://example.com/api/places?county=錯誤縣");
  const res = await worker.fetch(req, {GOOGLE_PLACES_API_KEY:"test"});
  assert.equal(res.status, 400);
});
test("searches, filters and synthesizes authentic sources", async () => {
  const original = globalThis.fetch;
  let googleCalls=0, langCalls=0;
  globalThis.fetch=async url => {
    if (String(url).includes("places.googleapis.com")) {
      googleCalls++;
      return Response.json({places:[
        {id:"place-1",displayName:{text:"八卦山大佛遊憩園區"},formattedAddress:"台灣彰化縣彰化市",
          rating:4.6,userRatingCount:1400,types:["tourist_attraction"],googleMapsUri:"https://maps.google.com/?cid=1"},
        {id:"place-2",displayName:{text:"彰化咖啡餐廳"},formattedAddress:"台灣彰化縣彰化市",
          rating:4.9,userRatingCount:2500,types:["restaurant"]}
      ]});
    }
    if (String(url).includes("api.langsearch.com")) {
      langCalls++;
      return Response.json({code:200,data:{webPages:{value:[{
        name:"八卦山大佛遊憩園區 門票資訊",
        snippet:"八卦山大佛遊憩園區 全票 300 元。"
      }]}}});
    }
    throw new Error("Unexpected URL: "+url);
  };
  try {
    const env={
      GOOGLE_PLACES_API_KEY:"secret",
      LANGSEARCH_API_KEY:"secret",
      AI:{run:async()=>({response:JSON.stringify([{id:"place-1",feature:"彰化的戶外大佛景點，可規劃漫遊參觀。"}])})}
    };
    const res=await worker.fetch(new Request("https://example.com/api/places?county=彰化縣"),env);
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.places.length,1);
    assert.equal(data.places[0].name,"八卦山大佛遊憩園區");
    assert.equal(data.places[0].admission,300);
    assert.equal(data.places[0].type,"outdoor");
    assert.ok(data.places[0].score>=1 && data.places[0].score<=99);
    assert.equal(data.places[0].feature,"彰化的戶外大佛景點，可規劃漫遊參觀。");
    assert.equal(googleCalls,1);assert.equal(langCalls,1);
  } finally {globalThis.fetch=original;}
});
