#!/usr/bin/env node
import { CONFIG, hasYouTube } from '../lib/config.mjs';
import { listTabs } from '../lib/tabs.mjs';
import { ingestBatch } from '../lib/ingest.mjs';
import { parseCount, todayISO } from '../lib/util.mjs';

const BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_SUBS = Number(process.env.DISCOVERY_MAX_SUBS || 150000);
const MIN_SUBS = Number(process.env.DISCOVERY_MIN_SUBS || 500);
const MAX_PER_TAB = Number(process.env.DISCOVERY_MAX_PER_TAB || 3);
const MAX_SEARCH_QUERIES = Number(process.env.DISCOVERY_MAX_SEARCH_QUERIES || 18);

const nicheQueries = {
  'canada': ['Canada politics news Trump channel', 'Canada economy news channel'],
  'anti-dem': ['anti democrat politics news channel', 'conservative democrat collapse news channel'],
  'new-york': ['New York politics news channel', 'New York governor business leaving news'],
  'british-news': ['UK politics news commentary channel', 'British politics news channel'],
  'china-destroying-the-west-niche': ['China economy collapse west news channel', 'China destroying west news channel'],
  'home-depot-niche': ['Home Depot news retail channel', 'DIY retail Home Depot channel'],
  'fashion-radar': ['fashion trend news channel', 'celebrity fashion commentary channel'],
  'vintage-watches': ['vintage watches channel', 'watch collecting news channel'],
  'sumerian-niche': ['Sumerian history channel', 'ancient Mesopotamia history channel'],
  'old-american-grandma-niche': ['senior america politics commentary channel', 'older Americans retirement news channel'],
  'garden-niche': ['gardening tips channel', 'backyard garden channel'],
  'collapse-niche': ['collapse news channel', 'economic collapse prepper channel']
};

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function yt(endpoint, params){
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('key', CONFIG.youtubeKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${(await res.text()).slice(0,160)}`);
  return res.json();
}
function compact(n){
  if (n == null) return '';
  if (n >= 1e6) return (n/1e6).toFixed(n % 1e6 ? 1 : 0) + 'M subscribers';
  if (n >= 1e3) return (n/1e3).toFixed(n % 1e3 ? 1 : 0) + 'K subscribers';
  return `${n} subscribers`;
}
function median(nums){
  if (!nums.length) return null;
  const s=[...nums].sort((a,b)=>a-b), m=Math.floor(s.length/2);
  return Math.round(s.length%2 ? s[m] : (s[m-1]+s[m])/2);
}
function handleFromSnippet(snippet, channelId){
  const custom = snippet?.customUrl;
  if (custom) return '@' + String(custom).replace(/^@/, '');
  // YouTube may not expose a handle for every channel via API.
  return `channel:${channelId}`;
}
async function channelDetails(ids){
  if (!ids.length) return [];
  const out=[];
  for (let i=0;i<ids.length;i+=50){
    const data=await yt('channels',{part:'snippet,statistics,contentDetails', id:ids.slice(i,i+50).join(',')});
    out.push(...(data.items||[]));
  }
  return out;
}
async function recentUploads(playlistId){
  if (!playlistId) return [];
  try {
    const pl=await yt('playlistItems',{part:'contentDetails', playlistId:playlistId, maxResults:12});
    const ids=(pl.items||[]).map(i=>i.contentDetails?.videoId).filter(Boolean);
    if (!ids.length) return [];
    const vids=await yt('videos',{part:'snippet,statistics,contentDetails', id:ids.join(',')});
    return (vids.items||[]).map(v=>({
      videoId:v.id,
      title:v.snippet?.title||'',
      publishDate:(v.snippet?.publishedAt||'').slice(0,10),
      publishedAt:v.snippet?.publishedAt||'',
      views:v.statistics?.viewCount?Number(v.statistics.viewCount):null,
      duration:v.contentDetails?.duration||''
    })).filter(v=>v.views != null);
  } catch {
    return [];
  }
}
function ageDays(iso){ return (Date.now()-new Date(iso).getTime())/86400000; }
function scoreChannel(ch, uploads){
  const subs=Number(ch.statistics?.subscriberCount || 0);
  const long = uploads.filter(u => !/^PT(?:\d+M)?(?:\d+S)?$/.test(u.duration) || !/^PT(?:[0-2]?\d?M)?(?:\d+S)?$/.test(u.duration));
  const recent = long.filter(u=>ageDays(u.publishedAt)<=45);
  const views = recent.map(u=>u.views).filter(Number.isFinite);
  const baseline = median(views.length>=3?views:long.map(u=>u.views).filter(Number.isFinite));
  const best = recent.slice().sort((a,b)=>b.views-a.views)[0];
  const bestOutlier = best && baseline ? Math.round(best.views / baseline * 100)/100 : null;
  // Up-and-coming proxy: smaller subs + recent long-form volume + at least one strong view result.
  const bestViews = best?.views || 0;
  let score = 0;
  if (subs >= MIN_SUBS && subs <= MAX_SUBS) score += 4;
  else if (subs <= 300000) score += 1;
  score += Math.min(3, recent.length/2);
  if (bestViews > subs*0.4) score += 3;
  if (bestOutlier && bestOutlier >= 2) score += 2;
  if (bestViews >= 5000) score += 1;
  return {subs, long, recent, baseline, best, bestOutlier, score};
}

if (!hasYouTube()) throw new Error('Missing YOUTUBE_API_KEY');
const tabs=listTabs();
const allExisting = new Set();
for (const t of tabs) for (const c of [...t.directCompetitors,...t.risingCompetitors]) allExisting.add(c.handle.toLowerCase());
for (const t of tabs) for (const h of t.activeChannels) allExisting.add(h.toLowerCase());
let searchCalls=0;
const report=[];
for (const tab of tabs) {
  const queries = nicheQueries[tab.slug] || [tab.niche + ' news channel'];
  const ids = new Set();
  for (const q of queries) {
    if (searchCalls >= MAX_SEARCH_QUERIES) break;
    searchCalls++;
    const data=await yt('search',{part:'snippet', type:'channel', q, maxResults:6, relevanceLanguage:'en', regionCode:'US'});
    for (const item of data.items||[]) if (item.id?.channelId) ids.add(item.id.channelId);
    await sleep(80);
  }
  const details=await channelDetails([...ids]);
  const candidates=[];
  for (const ch of details) {
    const handle = handleFromSnippet(ch.snippet, ch.id);
    if (allExisting.has(handle.toLowerCase())) continue;
    const uploads=await recentUploads(ch.contentDetails?.relatedPlaylists?.uploads);
    const s=scoreChannel(ch, uploads);
    if (!s.recent.length || s.subs < MIN_SUBS || s.subs > MAX_SUBS) continue;
    candidates.push({ch, handle, uploads:s.long, ...s});
    await sleep(80);
  }
  candidates.sort((a,b)=>b.score-a.score || (b.best?.views||0)-(a.best?.views||0));
  const chosen=candidates.slice(0,MAX_PER_TAB);
  if (chosen.length) {
    const competitors={rising: chosen.map(c=>({
      handle:c.handle, size:compact(c.subs), baselineVph:c.baseline || null,
      channelId:c.ch.id, url:c.handle.startsWith('@') ? `https://www.youtube.com/${c.handle}` : `https://www.youtube.com/channel/${c.ch.id}`,
      avatar:c.ch.snippet?.thumbnails?.high?.url || c.ch.snippet?.thumbnails?.medium?.url || c.ch.snippet?.thumbnails?.default?.url
    }))};
    const videos=[];
    for (const c of chosen) {
      const baseline=c.baseline;
      for (const u of c.recent.slice(0,8)) videos.push({
        title:u.title, handle:c.handle, videoId:u.videoId, publishDate:u.publishDate, views:u.views,
        outlier: baseline ? Math.round(u.views / baseline * 100)/100 : undefined,
        source:'youtube-discovery'
      });
    }
    const summary=ingestBatch(tab.slug,{date:todayISO(),competitors,videos});
    for (const c of chosen) allExisting.add(c.handle.toLowerCase());
    report.push({slug:tab.slug,niche:tab.niche,found:chosen.map(c=>({handle:c.handle, title:c.ch.snippet?.title, subs:c.subs, score:Number(c.score.toFixed(2)), best:c.best?{title:c.best.title, views:c.best.views, outlier:c.bestOutlier, url:`https://youtu.be/${c.best.videoId}`} : null})), summary});
  } else {
    report.push({slug:tab.slug,niche:tab.niche,found:[],note:'no qualifying small/rising channels from search'});
  }
}
console.log(JSON.stringify({date:todayISO(), searchCalls, maxSubs:MAX_SUBS, minSubs:MIN_SUBS, maxPerTab:MAX_PER_TAB, report}, null, 2));
