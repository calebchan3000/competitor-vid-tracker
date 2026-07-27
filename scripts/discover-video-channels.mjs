#!/usr/bin/env node
import { CONFIG, hasYouTube } from '../lib/config.mjs';
import { listTabs } from '../lib/tabs.mjs';
import { ingestBatch } from '../lib/ingest.mjs';
import { todayISO } from '../lib/util.mjs';
import { classifyShorts } from '../lib/youtube.mjs';
import { labelVideoForDiscovery } from '../lib/video_labels.mjs';
const BASE='https://www.googleapis.com/youtube/v3';
const MAX_SUBS=Number(process.env.DISCOVERY_MAX_SUBS||200000);
const MIN_SUBS=Number(process.env.DISCOVERY_MIN_SUBS||300);
const MAX_PER_TAB=Number(process.env.DISCOVERY_MAX_PER_TAB||4);
const MAX_SEARCH_QUERIES=Number(process.env.DISCOVERY_MAX_SEARCH_QUERIES||24);
// Home-page-style discovery should feel like current YouTube recommendations,
// not an archive of older evergreen hits. Default to the past 30 days; callers
// can still widen it explicitly with DISCOVERY_DAYS=90/180 for backfills.
const DAYS=Number(process.env.DISCOVERY_DAYS||30);
const queries={
 'anti-dem':['democrats meltdown conservative news','aoc newsom democrat collapse conservative commentary','democratic socialists america politics dsa news','socialist democrats america politics commentary'],
 'canada':['canada trump trade war news','canada rejects maga trump voters','canada oil export strategy us refiners pipeline asia markets','canada tariffs usmca carney trump steel lumber energy'],
 'new-york':['new york governor business leaves state','new jersey governor business leaving texas'],
 'british-news':['uk politics labour reform news commentary','british politics migrant crisis news'],
 'china-destroying-the-west-niche':['china economy collapse west tariffs news','china destroying west economy documentary'],
 'home-depot-niche':['home depot prices diy tools news','home depot shopping secrets tools'],
 'fashion-radar':['fashion trends 2026 celebrity style commentary','luxury fashion news commentary'],
 'vintage-watches':['vintage watches collecting rolex omega','watch collecting market vintage'],
 'sumerian-niche':['sumerian civilization ancient history documentary','ancient mesopotamia sumerian history'],
 'old-american-grandma-niche':['social security medicare seniors news','retirement crisis older americans news'],
 'garden-niche':['gardening tips perennial plants backyard','vegetable garden tips beginners'],
 'collapse-niche':['economic collapse warning news','societal collapse prepper news']
};
async function yt(ep,params){const u=new URL(`${BASE}/${ep}`); for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v)); u.searchParams.set('key',CONFIG.youtubeKey); const r=await fetch(u); if(!r.ok)throw new Error(`${ep} ${r.status}: ${(await r.text()).slice(0,160)}`); return r.json();}
function compact(n){if(n==null)return''; if(n>=1e6)return(n/1e6).toFixed(n%1e6?1:0)+'M subscribers'; if(n>=1e3)return(n/1e3).toFixed(n%1e3?1:0)+'K subscribers'; return n+' subscribers';}
function median(a){if(!a.length)return null; const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2); return Math.round(s.length%2?s[m]:(s[m-1]+s[m])/2)}
function ageDays(iso){return (Date.now()-new Date(iso).getTime())/86400000}
function handle(sn,chid){return sn?.customUrl?'@'+String(sn.customUrl).replace(/^@/,''):`channel:${chid}`}
async function details(ids){let out=[]; for(let i=0;i<ids.length;i+=50){const d=await yt('channels',{part:'snippet,statistics,contentDetails',id:ids.slice(i,i+50).join(',')}); out.push(...(d.items||[]));} return out;}
async function videos(ids){let out=[]; for(let i=0;i<ids.length;i+=50){const d=await yt('videos',{part:'snippet,statistics,contentDetails',id:ids.slice(i,i+50).join(',')}); out.push(...(d.items||[]));} return out;}
async function uploads(plid){try{const pl=await yt('playlistItems',{part:'contentDetails',playlistId:plid,maxResults:12}); const ids=(pl.items||[]).map(i=>i.contentDetails?.videoId).filter(Boolean); const vv=await videos(ids); const raw=vv.map(videoRow).filter(v=>v.views); const classified=await Promise.all(raw.map(classifyShorts)); return classified.filter(v=>!v.isShort)}catch{return[]}}
function videoRow(v){return {videoId:v.id,title:v.snippet?.title||'',publishDate:(v.snippet?.publishedAt||'').slice(0,10),publishedAt:v.snippet?.publishedAt||'',views:v.statistics?.viewCount?Number(v.statistics.viewCount):0,duration:v.contentDetails?.duration||''}}
if(!hasYouTube())throw new Error('missing YOUTUBE_API_KEY');
const publishedAfter=new Date(Date.now()-DAYS*86400000).toISOString();
const tabs=listTabs(); const existing=new Set(); for(const t of tabs){for(const c of[...t.directCompetitors,...t.risingCompetitors])existing.add(c.handle.toLowerCase()); for(const h of t.activeChannels)existing.add(h.toLowerCase())}
let calls=0; const report=[];
for(const tab of tabs){const qs=queries[tab.slug]||[tab.niche+' youtube news']; const ids=new Set(); const seedVideos=[]; for(const q of qs){if(calls>=MAX_SEARCH_QUERIES)break; calls++; const d=await yt('search',{part:'snippet',type:'video',q,maxResults:8,order:'relevance',relevanceLanguage:'en',regionCode:'US',publishedAfter}); for(const it of d.items||[]){if(it.snippet?.channelId)ids.add(it.snippet.channelId); if(it.id?.videoId) seedVideos.push(it.id.videoId)}}
 const chs=await details([...ids]); const vstats=await videos(seedVideos); const seedRows=await Promise.all(vstats.map(v=>classifyShorts(videoRow(v)))); const byCh=new Map(); for(const u of seedRows){if(u.isShort)continue; u.discoverySeed=true; const v=vstats.find(x=>x.id===u.videoId); const cid=v?.snippet?.channelId; if(!cid)continue; const arr=byCh.get(cid)||[]; arr.push(u); byCh.set(cid,arr)}
 const cand=[]; for(const ch of chs){const subs=Number(ch.statistics?.subscriberCount||0); const h=handle(ch.snippet,ch.id); if(existing.has(h.toLowerCase()))continue; if(subs<MIN_SUBS||subs>MAX_SUBS)continue; const ups=await uploads(ch.contentDetails?.relatedPlaylists?.uploads); const merged=[...(byCh.get(ch.id)||[]),...ups]; const ded=[]; const seen=new Set(); for(const u of merged){if(!u.videoId||u.isShort||seen.has(u.videoId))continue; seen.add(u.videoId); ded.push(u)} const recent=ded.filter(u=>ageDays(u.publishedAt)<=DAYS).sort((a,b)=>b.views-a.views); if(!recent.length)continue; const baseline=median(ups.filter(u=>!u.isShort&&ageDays(u.publishedAt)<=45).map(u=>u.views)); const best=recent[0]; const out=baseline?Math.round(best.views/baseline*100)/100:null; const ratio=subs?best.views/subs:0; const score=(Math.min(5,ratio*4)+(out&&out>=2?2:0)+Math.min(2,recent.length/4)+(best.views>10000?1:0)); cand.push({ch,h,subs,recent,baseline,best,out,score}); }
 cand.sort((a,b)=>b.score-a.score||b.best.views-a.best.views); const chosen=cand.slice(0,MAX_PER_TAB); if(chosen.length){const competitors={rising:chosen.map(c=>({handle:c.h,size:compact(c.subs),baselineVph:c.baseline||null,channelId:c.ch.id,url:c.h.startsWith('@')?`https://www.youtube.com/${c.h}`:`https://www.youtube.com/channel/${c.ch.id}`,avatar:c.ch.snippet?.thumbnails?.high?.url||c.ch.snippet?.thumbnails?.medium?.url||c.ch.snippet?.thumbnails?.default?.url}))}; const vids=[]; for(const c of chosen){for(const u of c.recent.slice(0,8)){const labels=labelVideoForDiscovery({slug:tab.slug,niche:tab.niche,title:u.title,sourceWasSeed:Boolean(u.discoverySeed)}); vids.push({title:u.title,handle:c.h,videoId:u.videoId,publishDate:u.publishDate,views:u.views,outlier:c.baseline?Math.round(u.views/c.baseline*100)/100:undefined,labels,source:'youtube-home-style-discovery'})}} const summary=ingestBatch(tab.slug,{date:todayISO(),competitors,videos:vids}); for(const c of chosen)existing.add(c.h.toLowerCase()); report.push({slug:tab.slug,niche:tab.niche,found:chosen.map(c=>({handle:c.h,title:c.ch.snippet?.title,subs:c.subs,score:+c.score.toFixed(2),best:{title:c.best.title,views:c.best.views,outlier:c.out,url:`https://youtu.be/${c.best.videoId}`,labels:labelVideoForDiscovery({slug:tab.slug,niche:tab.niche,title:c.best.title,sourceWasSeed:Boolean(c.best.discoverySeed)})}})),summary});} else report.push({slug:tab.slug,niche:tab.niche,found:[]});}
console.log(JSON.stringify({date:todayISO(),calls,report},null,2));
