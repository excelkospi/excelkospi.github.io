/* excelkospi client app
 * Runtime: static Cloudflare Pages page plus /functions/api endpoints.
 * Major areas: settings persistence, update-notes modal, sheet rendering,
 * snapshot/news polling, chat, watchlist/holding controls.
 */
const HOLDING_PNL_MODE_KEY = 'excelkospi:holdingPnlMode';
let selected = (()=>{
  try{
    const v = localStorage.getItem(VIEW_KEY);
    return ['AUTO','KR','US','COIN','ALL','HOLDINGS'].includes(v) ? v : 'AUTO';
  }catch{ return 'AUTO'; }
})();
let readabilityMode = (()=>{
  try{ return localStorage.getItem(READABILITY_KEY)==='1'; }
  catch{ return false; }
})();
let changeWindow = (()=>{
  try{
    const v = localStorage.getItem(CHANGE_WINDOW_KEY);
    return ['day','15','30'].includes(v) ? v : 'day';
  }catch{ return 'day'; }
})();
let quoteSortMode = (()=>{
  try{
    const v = localStorage.getItem(QUOTE_SORT_KEY);
    return ['manual','change-desc','value-desc','pnl-desc','name-asc'].includes(v) ? v : 'manual';
  }catch{ return 'manual'; }
})();
let holdingPnlMode = (()=>{
  try{
    const v = localStorage.getItem(HOLDING_PNL_MODE_KEY);
    return v === 'daily' ? 'daily' : 'total';
  }catch{ return 'total'; }
})();
let holdingInputState = null;
let nextNewsAt = null;
let lastNewsHintState = { live: 0, fresh: 0, fallback: '데이터 헤드라인' };
let communityPosts = [];
let communityLoadInFlight = false;
let communityReplyPostId = '';
let communityReplyParentCommentId = '';
let communityMobileActionPostId = '';
let communityMobileActionCommentId = '';
let communityCompactMode = null;
let communityDraftBody = '';
let communityDraftReplyBody = '';
let communityJustPostedId = '';
let communityJustPostedTimer = null;
let communityJustCommentedId = '';
let communityJustCommentedTimer = null;
let communityRefreshTimer = null;
let communityRefreshSleeping = false;
let communityPostInFlight = false;
let communityCommentInFlight = false;
let communityPage = 1;
const communityPollsByChannel = {};
let communityPollVoteInFlight = false;
const communityReplyVisibleCounts = {};
const QUOTE_NOTE_MARKETS = new Set(['KR','US','COIN','ALL']);
function validCommunityChannel(value){
  const id=String(value || '').trim();
  return (Array.isArray(COMMUNITY_CHANNELS) ? COMMUNITY_CHANNELS : []).some((channel)=>channel.id===id) ? id : 'kr';
}
let communityChannel = (()=>{
  try{ return validCommunityChannel(localStorage.getItem(COMMUNITY_CHANNEL_KEY)); }
  catch{ return 'kr'; }
})();
let inlineAdminToken = '';
try{ inlineAdminToken = sessionStorage.getItem(ADMIN_SESSION_KEY) || ''; }catch{}
let deferredPwaInstallPrompt = null;
let timelineTab = (()=>{
  try{
    const v=localStorage.getItem(TIMELINE_TAB_KEY);
    return v==='community' || v==='etf' ? v : 'news';
  }catch{ return 'news'; }
})();
const ETF_SCRIPT_VERSION = '20260524-485';
let etfModulePromise = null;

function etfModule(){
  return window.ExcelKospiEtf || null;
}

function etfModuleState(){
  try{ return etfModule()?.getState?.() || { hasRows:false, filteredCount:0 }; }
  catch{ return { hasRows:false, filteredCount:0 }; }
}

function etfHasRows(){
  return !!etfModuleState().hasRows;
}

function renderEtfPlaceholder(message='ETF 둘러보기 준비 중...'){
  const table=document.getElementById('timelineTable');
  if(!table) return;
  table.classList.remove('community-table');
  table.classList.add('etf-table');
  const dataCols = 4;
  table.innerHTML = `
    <tr class="etf-colhead-row"><th class="rownum"></th><th class="colhead">A</th><th class="colhead">B</th><th class="colhead">C</th><th class="colhead">D</th></tr>
    <tr class="etf-filter-row"><td class="rownum">1</td><td colspan="${dataCols}" class="etf-filter-cell"><span class="news-loading-spin"></span> ${esc(message)}</td></tr>
    <tr class="etf-subhead-row"><th class="rownum">2</th><th class="subhead">ETF</th><th class="subhead">1개월</th><th class="subhead">1년</th><th class="subhead">분배</th></tr>
    ${makeEmptyRows(3, 18, dataCols)}`;
  updateEtfHint();
}

function loadEtfModule(){
  const loaded=etfModule();
  if(loaded) return Promise.resolve(loaded);
  if(etfModulePromise) return etfModulePromise;
  etfModulePromise = new Promise((resolve, reject)=>{
    const script=document.createElement('script');
    script.src = `/assets/app-etf.js?v=${ETF_SCRIPT_VERSION}`;
    script.async = true;
    script.onload = ()=>{
      const mod=etfModule();
      if(mod) resolve(mod);
      else reject(new Error('etf_module_missing'));
    };
    script.onerror = ()=>reject(new Error('etf_module_load_failed'));
    document.head.appendChild(script);
  }).catch((err)=>{
    etfModulePromise = null;
    throw err;
  });
  return etfModulePromise;
}

function renderEtfBrowser(options={}){
  const mod=etfModule();
  if(mod) return mod.renderEtfBrowser(options);
  renderEtfPlaceholder();
  loadEtfModule()
    .then((loaded)=>{ if(timelineIsEtf()) loaded.renderEtfBrowser(options); })
    .catch((err)=>{
      debugWarn('etf module render failed', err);
      if(timelineIsEtf()) renderEtfPlaceholder('ETF 화면을 준비하지 못했습니다. 새로고침 후 다시 시도해주세요.');
    });
}

async function loadEtfData(options={}){
  try{
    const mod=await loadEtfModule();
    return mod.loadEtfData(options);
  }catch(err){
    debugWarn('etf module load failed', err);
    if(timelineIsEtf()) renderEtfPlaceholder('ETF 화면을 준비하지 못했습니다. 새로고침 후 다시 시도해주세요.');
    return null;
  }
}

function updateEtfHint(filteredCount){
  const mod=etfModule();
  if(mod) return mod.updateEtfHint(filteredCount);
  const tlHintEl=document.getElementById('timelineHint');
  if(tlHintEl && timelineIsEtf()) tlHintEl.textContent='ETF 둘러보기 준비 중';
}

function handleEtfControlInput(ev){
  return !!etfModule()?.handleEtfControlInput?.(ev);
}

function handleEtfControlChange(ev){
  return !!etfModule()?.handleEtfControlChange?.(ev);
}

function handleEtfTableClick(ev){
  return !!etfModule()?.handleEtfTableClick?.(ev);
}

function toggleEtfDetailKey(key){
  return !!etfModule()?.toggleDetailKey?.(key);
}

const IS_STANDALONE = !!(window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true);
if(IS_STANDALONE) document.documentElement.classList.add('pwa-standalone');
const EXCEL_THEMES = new Set(['classic','silver','deep']);
let excelTheme = readStringSetting(EXCEL_THEME_KEY, 'classic', EXCEL_THEMES);
let excelDarkMode = readBoolSetting(EXCEL_DARK_MODE_KEY, false);
function defaultRibbonCollapsed(){
  try{ return !!window.matchMedia?.('(max-width: 760px)')?.matches; }catch{ return false; }
}
function initialRibbonCollapsed(){
  return defaultRibbonCollapsed() ? true : readBoolSetting(RIBBON_COLLAPSED_KEY, false);
}
let ribbonCollapsed = initialRibbonCollapsed();
const CHAT_OPACITY_MIN=50;
const CHAT_OPACITY_MAX=100;
const CHAT_OPACITY_STEP=5;
const CHAT_OPACITY_DEFAULT=100;
const CHAT_DOCK_BREAKPOINT_PX=1600;
let chatPanelOpacity=readChatOpacitySetting();
function applyExcelAppearance(){
  const body=document.body;
  if(!body) return;
  body.classList.remove('excel-theme-silver','excel-theme-classic','excel-theme-deep');
  body.classList.add(`excel-theme-${EXCEL_THEMES.has(excelTheme) ? excelTheme : 'silver'}`);
  body.classList.toggle('excel-dark-mode', !!excelDarkMode);
  const theme=document.querySelector('meta[name="theme-color"]');
  if(theme && !body.classList.contains('theme-outlook')){
    theme.setAttribute('content', excelDarkMode ? '#101418' : (excelTheme === 'silver' ? '#e7e9ed' : (excelTheme === 'deep' ? '#06452b' : '#107c41')));
  }
}
function applyRibbonCollapsed(){
  const body=document.body;
  if(!body) return;
  body.classList.toggle('ribbon-collapsed', !!ribbonCollapsed);
  document.querySelectorAll('[data-ribbon-toggle]').forEach((btn)=>{
    btn.setAttribute('aria-pressed', ribbonCollapsed ? 'true' : 'false');
    btn.setAttribute('aria-label', ribbonCollapsed ? '리본 펼치기' : '리본 접기');
    btn.setAttribute('title', ribbonCollapsed ? '리본 펼치기' : '리본 접기');
    const label = btn.querySelector('[data-ribbon-toggle-label]');
    if(label) label.textContent = ribbonCollapsed ? '리본 펼치기' : '리본 접기';
    else btn.textContent = ribbonCollapsed ? '▾' : '▴';
  });
}
function toggleRibbonCollapsed(){
  ribbonCollapsed = !ribbonCollapsed;
  try{
    localStorage.setItem(RIBBON_COLLAPSED_KEY, ribbonCollapsed ? '1' : '0');
    persistSet(RIBBON_COLLAPSED_KEY, ribbonCollapsed ? '1' : '0');
  }catch{}
  applyRibbonCollapsed();
  showToast(ribbonCollapsed ? '상단 리본을 접었습니다' : '상단 리본을 펼쳤습니다', 'info');
}
function handleRibbonTabClick(){
  toggleRibbonCollapsed();
}
function applyChatPanelOpacity(){
  const opacity=(chatPanelOpacity / 100).toFixed(2);
  document.documentElement?.style.setProperty('--chat-panel-opacity', opacity);
  const range=document.getElementById('settingChatOpacity');
  if(range && String(range.value) !== String(chatPanelOpacity)) range.value=String(chatPanelOpacity);
  const output=document.getElementById('settingChatOpacityValue');
  if(output) output.textContent=`${chatPanelOpacity}%`;
}
function applyReadabilityMode(){
  document.body?.classList.toggle('readability-mode', !!readabilityMode);
  const btn=document.getElementById('readabilityToggle');
  if(btn){
    btn.classList.toggle('active', !!readabilityMode);
    btn.setAttribute('aria-pressed', readabilityMode ? 'true' : 'false');
    btn.textContent = readabilityMode ? '노안 모드 켜짐' : '노안 오신 분?';
  }
}
applyReadabilityMode();
applyExcelAppearance();
applyRibbonCollapsed();
applyChatPanelOpacity();
try{ if('scrollRestoration' in history) history.scrollRestoration='manual'; }catch{}
function resetInitialScroll(){
  window.scrollTo({ top:0, left:0, behavior:'auto' });
}
window.addEventListener('pageshow', ()=>setTimeout(resetInitialScroll, 0), {once:true});
requestAnimationFrame(resetInitialScroll);
async function requestDurableStorage(){
  try{
    if(!navigator.storage) return;
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    if(!persisted && navigator.storage.persist) await navigator.storage.persist();
  }catch{}
}
requestDurableStorage();
window.addEventListener('pointerdown', requestDurableStorage, {once:true, passive:true});
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}

const APP_BUILD_ID = document.querySelector('meta[name="build-id"]')?.getAttribute('content') || '';
const BROWSER_DOCUMENT_STEM = 'market_brief';
const SEARCH_CRAWLER_RE = /\b(googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|naverbot|yeti|daumoa|facebookexternalhit|twitterbot|discordbot|kakaotalk-scrap|crawler|spider|bot)\b/i;
let patchNotesLoaded = false;
let outlookBetaActive = false;
let lastVersionActivityAt=Date.now();
let pendingBuildId='';
let pendingBuildDetectedAt=0;
let versionNoticeBuildId='';
let versionReloading=false;
let versionReloadTimer=null;
let lastVersionVisibleAt=document.hidden ? 0 : Date.now();
const VERSION_VISIBLE_RELOAD_GRACE_MS=15*1000;

function getKstDateStamp(date = new Date()){
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
}
function getBrowserDocumentTitle(){
  return `${BROWSER_DOCUMENT_STEM}_${getKstDateStamp()}.xlsx`;
}
function syncStealthDocumentTitle(){
  const title = getBrowserDocumentTitle();
  document.querySelectorAll('[data-stealth-document-title]').forEach((el)=>{ el.textContent = title; });
  const icon = document.querySelector('.app-icon');
  if(icon){
    icon.setAttribute('aria-label', title);
    if(!isInlineAdmin()) icon.title = title;
  }
  return title;
}
function applyBrowserDocumentTitle(){
  const title = syncStealthDocumentTitle();
  if(SEARCH_CRAWLER_RE.test(navigator.userAgent || '')) return;
  if(outlookBetaActive || document.body?.classList.contains('theme-outlook')) return;
  document.title = title;
}
applyBrowserDocumentTitle();
window.addEventListener('pageshow', applyBrowserDocumentTitle);
window.addEventListener('focus', applyBrowserDocumentTitle);

const TAB_ID = (() => {
  try{ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  catch{ return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
})();
const runtimeShared = {
  snapshot: null,
  newsByMarket: new Map(),
  quotesByToken: new Map(),
  chatMessages: null,
};
let runtimeBus = null;
const ownedSharedPollLocks = new Set();

function postRuntimeMessage(type, payload){
  try{ runtimeBus?.postMessage?.({ type, from:TAB_ID, at:Date.now(), payload }); }catch{}
}

if('BroadcastChannel' in window){
  try{
    runtimeBus = new BroadcastChannel('excelkospi-runtime-v1');
    runtimeBus.onmessage = (event) => {
      const msg = event?.data || {};
      if(!msg || msg.from === TAB_ID) return;
      if(msg.type === 'snapshot' && snapshotMatchesClientSettings(msg.payload)){
        runtimeShared.snapshot = { at: Number(msg.at) || Date.now(), value: msg.payload };
        writeSnapshotCache(msg.payload, null, { preserveEtag:true });
      }
      if(msg.type === 'timeline' && msg.payload?.market && Array.isArray(msg.payload?.data)){
        runtimeShared.newsByMarket.set(msg.payload.market, {
          at: Number(msg.at) || Date.now(),
          data: msg.payload.data,
        });
        writeTimelinePayloadCache(msg.payload.market, msg.payload.data);
      }
      if(msg.type === 'quotes' && Array.isArray(msg.payload?.items)){
        msg.payload.items.forEach((item)=>{
          const runtimeKey = quoteRuntimeKey(item?.token, item?.coinSource);
          if(runtimeKey && item?.quote) {
            runtimeShared.quotesByToken.set(runtimeKey, {
              at: Number(msg.at) || Date.now(),
              quote: item.quote,
            });
          }
        });
      }
      if(msg.type === 'chat-messages' && Array.isArray(msg.payload?.messages)){
        runtimeShared.chatMessages = {
          at: Number(msg.at) || Date.now(),
          limit: Number(msg.payload.limit) || 0,
          data: msg.payload,
        };
      }
    };
  }catch{}
}

function sharedPollLockStorageKey(key){
  return `${SHARED_POLL_LOCK_PREFIX}${String(key || '').replace(/[^a-z0-9:_-]/gi, '_').slice(0, 160)}`;
}

function tryAcquireSharedPollLock(key, ttlMs=12000){
  if(!runtimeBus) return true;
  try{
    const storageKey=sharedPollLockStorageKey(key);
    const now=Date.now();
    const raw=localStorage.getItem(storageKey);
    if(raw){
      const current=JSON.parse(raw);
      if(current?.tab && current.tab !== TAB_ID && Number(current.expiresAt || 0) > now) return false;
    }
    localStorage.setItem(storageKey, JSON.stringify({tab:TAB_ID, expiresAt:now + Math.max(1000, Number(ttlMs) || 12000)}));
    const check=JSON.parse(localStorage.getItem(storageKey) || '{}');
    const acquired = check?.tab === TAB_ID;
    if(acquired) ownedSharedPollLocks.add(key);
    return acquired;
  }catch{
    return true;
  }
}

function releaseSharedPollLock(key){
  if(!runtimeBus) return;
  try{
    const storageKey=sharedPollLockStorageKey(key);
    const current=JSON.parse(localStorage.getItem(storageKey) || '{}');
    if(current?.tab === TAB_ID) localStorage.removeItem(storageKey);
  }catch{}
  ownedSharedPollLocks.delete(key);
}

function releaseOwnedSharedPollLocks(){
  if(!ownedSharedPollLocks.size) return;
  Array.from(ownedSharedPollLocks).forEach((key)=>releaseSharedPollLock(key));
}
window.addEventListener('pagehide', releaseOwnedSharedPollLocks);
window.addEventListener('beforeunload', releaseOwnedSharedPollLocks);

function waitForSharedValue(readValue, timeoutMs=900){
  return new Promise((resolve)=>{
    const started=Date.now();
    const tick=()=>{
      const value=readValue();
      if(value){ resolve(value); return; }
      if(Date.now() - started >= timeoutMs){ resolve(null); return; }
      setTimeout(tick, 80);
    };
    tick();
  });
}

function sharedPollLockRemainingMs(key){
  if(!runtimeBus) return 0;
  try{
    const current=JSON.parse(localStorage.getItem(sharedPollLockStorageKey(key)) || '{}');
    if(!current?.tab || current.tab === TAB_ID) return 0;
    return Math.max(0, Number(current.expiresAt || 0) - Date.now());
  }catch{
    return 0;
  }
}

async function waitForSharedPollValue(key, readValue, maxWaitMs=4500){
  const remaining=sharedPollLockRemainingMs(key);
  if(remaining <= 0) return null;
  const waitMs=Math.max(500, Math.min(Number(maxWaitMs) || 4500, remaining + 160));
  return waitForSharedValue(readValue, waitMs);
}

function noteVersionActivity(){
  lastVersionActivityAt=Date.now();
  maybeResumeCommunityRefresh();
}

['pointerdown','keydown','input','scroll','touchstart'].forEach((eventName)=>{
  window.addEventListener(eventName, noteVersionActivity, {passive:true});
});

function parseBuildIdFromHtml(html){
  const match=String(html || '').match(/<meta\s+name=["']build-id["']\s+content=["']([^"']+)["']/i);
  return match ? match[1] : '';
}

function isTextInputFocused(){
  const el=document.activeElement;
  if(!el || el===document.body) return false;
  return !!el.closest?.('input,textarea,select,[contenteditable="true"],#chatPanel');
}

async function reloadForNewBuild(reason='new-build'){
  if(versionReloading) return;
  versionReloading=true;
  if(versionReloadTimer){
    clearTimeout(versionReloadTimer);
    versionReloadTimer=null;
  }
  try{
    const reg=await navigator.serviceWorker?.getRegistration?.();
    await reg?.update?.();
  }catch{}
  try{ sessionStorage.setItem('kg_last_reload_reason_v1', reason); }catch{}
  try{
    const url=new URL(window.location.href);
    url.searchParams.set('kg_reload', `${pendingBuildId || APP_BUILD_ID || 'build'}-${Date.now()}`);
    window.location.replace(url.toString());
  }catch{
    window.location.reload();
  }
}

let appStyleRecoveryTimer=null;
function appStylesLookBroken(){
  const link=document.querySelector('link[rel="stylesheet"][href*="/assets/app.css"]');
  if(!link) return true;
  const rootStyle=getComputedStyle(document.documentElement);
  const excelColor=rootStyle.getPropertyValue('--excel').trim();
  if(!excelColor) return true;
  const titlebar=document.querySelector('.titlebar');
  if(!titlebar) return false;
  const titlebarStyle=getComputedStyle(titlebar);
  return titlebarStyle.display === 'block' || titlebarStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || titlebarStyle.backgroundColor === 'transparent';
}

async function recoverBrokenAppStyles(reason='style-health'){
  let last=0;
  try{ last=Number(sessionStorage.getItem('kg_style_recover_at_v1') || 0) || 0; }catch{}
  if(Date.now()-last < 60*1000) return;
  try{ sessionStorage.setItem('kg_style_recover_at_v1', String(Date.now())); }catch{}
  try{
    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.filter((key)=>String(key).startsWith('excelkospi-static-')).map((key)=>caches.delete(key)));
    }
  }catch{}
  try{ sessionStorage.setItem('kg_last_reload_reason_v1', reason); }catch{}
  try{
    const url=new URL(window.location.href);
    url.searchParams.set('kg_style_recover', String(Date.now()));
    window.location.replace(url.toString());
  }catch{
    window.location.reload();
  }
}

function verifyAppStylesSoon(reason='style-health', delay=1400){
  if(appStyleRecoveryTimer) clearTimeout(appStyleRecoveryTimer);
  appStyleRecoveryTimer=setTimeout(()=>{
    appStyleRecoveryTimer=null;
    if(appStylesLookBroken()) recoverBrokenAppStyles(reason);
  }, delay);
}

window.addEventListener('load',()=>verifyAppStylesSoon('load-style-health', 1200));
window.addEventListener('pageshow',()=>verifyAppStylesSoon('pageshow-style-health', 900));

function scheduleVersionReload(reason){
  if(versionReloading || versionReloadTimer) return;
  const visibleFor=lastVersionVisibleAt ? Date.now()-lastVersionVisibleAt : VERSION_VISIBLE_RELOAD_GRACE_MS;
  const delay=Math.max(0, VERSION_VISIBLE_RELOAD_GRACE_MS-visibleFor);
  versionReloadTimer=setTimeout(()=>{
    versionReloadTimer=null;
    if(!pendingBuildId || pendingBuildId===APP_BUILD_ID) return;
    if(document.hidden || isTextInputFocused()){
      maybeApplyPendingBuild();
      return;
    }
    reloadForNewBuild(reason);
  }, delay);
}

function maybeApplyPendingBuild(){
  if(!pendingBuildId || pendingBuildId===APP_BUILD_ID) return;
  const staleFor=Date.now()-pendingBuildDetectedAt;
  const idleFor=Date.now()-lastVersionActivityAt;
  if(document.hidden) return;
  const visibleFor=lastVersionVisibleAt ? Date.now()-lastVersionVisibleAt : VERSION_VISIBLE_RELOAD_GRACE_MS;
  if((idleFor>=VERSION_IDLE_RELOAD_MS || staleFor>=VERSION_MAX_STALE_MS) && !isTextInputFocused()){
    if(visibleFor<VERSION_VISIBLE_RELOAD_GRACE_MS){
      scheduleVersionReload(staleFor>=VERSION_MAX_STALE_MS ? 'max-stale-new-build' : 'idle-new-build');
      return;
    }
    reloadForNewBuild(staleFor>=VERSION_MAX_STALE_MS ? 'max-stale-new-build' : 'idle-new-build');
    return;
  }
  if(versionNoticeBuildId!==pendingBuildId){
    versionNoticeBuildId=pendingBuildId;
    showToast('새 기능이 준비됐어요. 잠시 사용하지 않으면 자동으로 반영됩니다.', 'info');
  }
}

async function checkForNewBuild(){
  if(!APP_BUILD_ID || versionReloading) return;
  try{
    // 5분 버킷 쿼리스트링으로 CF 엣지 캐시가 잡히게 한다. 같은 5분 안
    // 들어온 모든 사용자가 같은 URL을 요청하므로 origin hit 한 번이면 충분.
    const bucket = Math.floor(Date.now() / (5*60*1000));
    const res=await fetch(`/index.html?vc=${bucket}`, {cache:'no-store'});
    if(!res.ok) return;
    const nextBuildId=parseBuildIdFromHtml(await res.text());
    if(!nextBuildId || nextBuildId===APP_BUILD_ID) return;
    if(pendingBuildId!==nextBuildId){
      pendingBuildId=nextBuildId;
      pendingBuildDetectedAt=Date.now();
      versionNoticeBuildId='';
    }
    maybeApplyPendingBuild();
  }catch{}
}

setInterval(checkForNewBuild, VERSION_CHECK_MS);
setInterval(maybeApplyPendingBuild, 30*1000);
setTimeout(checkForNewBuild, VERSION_CHECK_MS);
document.addEventListener('visibilitychange', ()=>{
  if(!document.hidden){
    lastVersionVisibleAt=Date.now();
    lastVersionActivityAt=Date.now();
    verifyAppStylesSoon('visible-style-health', 900);
  }
  maybeApplyPendingBuild();
});

function timelineIsCommunity(){
  return timelineTab === 'community';
}

function timelineIsEtf(){
  return timelineTab === 'etf';
}

function timelineTabParts(tab){
  const raw = String(tab || '');
  if(raw === 'news') return { tab:'news', channel:communityActiveChannel() };
  if(raw === 'etf') return { tab:'etf', channel:communityActiveChannel() };
  if(raw === 'community') return { tab:'community', channel:communityActiveChannel() };
  if(raw.startsWith('community-')) return { tab:'community', channel:validCommunityChannel(raw.slice('community-'.length)) };
  return { tab:'news', channel:communityActiveChannel() };
}

function timelineActiveTabKey(){
  if(timelineIsCommunity()) return `community-${communityActiveChannel()}`;
  if(timelineIsEtf()) return 'etf';
  return 'news';
}

function communityChannelMeta(id=communityChannel){
  const key=validCommunityChannel(id);
  return (Array.isArray(COMMUNITY_CHANNELS) ? COMMUNITY_CHANNELS : []).find((channel)=>channel.id===key) || { id:'kr', label:'국내주식토론', placeholder:'국내 주식 이야기를 나누는 공간입니다.' };
}

function communityActiveChannel(){
  return validCommunityChannel(communityChannel);
}

function communityChannelLabel(id=communityChannel){
  return communityChannelMeta(id).label || '국내주식토론';
}

function communityShowsMentionPlaceholder(){
  return communityChannelMeta().id !== 'ops';
}

function communityComposePlaceholder(){
  const meta=communityChannelMeta();
  const base = meta.placeholder || '여러 종목에 걸쳐 이야기를 나누는 공간입니다.';
  return communityShowsMentionPlaceholder()
    ? `${base}\n특정 종목 태그하기 : @종목명`
    : base;
}

function communityReplyPlaceholder(){
  return communityShowsMentionPlaceholder()
    ? '댓글을 입력하세요.\n@종목명을 입력하시면 해당 종목명이 태그됩니다.'
    : '댓글을 입력하세요.';
}

function communityPollEnabledForChannel(channel=communityActiveChannel()){
  return !!(typeof COMMUNITY_POLL_CHANNELS !== 'undefined' && COMMUNITY_POLL_CHANNELS.has(validCommunityChannel(channel)));
}

function communityPollVotesLoad(){
  try{
    const parsed = JSON.parse(localStorage.getItem(COMMUNITY_POLL_VOTES_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  }catch{
    return {};
  }
}

function communityPollVotesSave(map){
  try{
    const compact = Object.fromEntries(Object.entries(map || {}).slice(-60));
    localStorage.setItem(COMMUNITY_POLL_VOTES_KEY, JSON.stringify(compact));
    if(typeof persistSet === 'function') persistSet(COMMUNITY_POLL_VOTES_KEY, JSON.stringify(compact));
  }catch{}
}

function normalizeCommunityPollChoiceValue(value){
  if(value === null || value === undefined || value === '') return null;
  const choice = Number(value);
  return Number.isInteger(choice) ? choice : null;
}

function selectedCommunityPollChoice(poll){
  const serverChoice = normalizeCommunityPollChoiceValue(poll?.selectedChoice);
  if(Number.isInteger(serverChoice)) return serverChoice;
  const saved = communityPollVotesLoad()[poll?.id || ''];
  return normalizeCommunityPollChoiceValue(saved);
}

function rememberCommunityPollVote(poll){
  const selected = normalizeCommunityPollChoiceValue(poll?.selectedChoice);
  if(!poll?.id || !Number.isInteger(selected)) return;
  const votes = communityPollVotesLoad();
  votes[poll.id] = selected;
  communityPollVotesSave(votes);
}

function normalizeCommunityPollPayload(payload, channel=communityActiveChannel()){
  const activeChannel = validCommunityChannel(channel);
  if(!communityPollEnabledForChannel(activeChannel)) return null;
  if(!payload || payload.enabled === false) return null;
  const options = Array.isArray(payload.options) ? payload.options.map((item)=>String(item || '').trim()).filter(Boolean).slice(0,4) : [];
  if(!payload.id || !payload.question || options.length < 2) return null;
  const counts = options.map((_, index)=>Math.max(0, Number(payload.counts?.[index] || 0) || 0));
  const total = Math.max(0, Number(payload.total || counts.reduce((sum, count)=>sum + count, 0)) || 0);
  const percentages = options.map((_, index)=>Number.isFinite(Number(payload.percentages?.[index]))
    ? Number(payload.percentages[index])
    : (total ? Math.round((counts[index] / total) * 1000) / 10 : 0));
  const selectedChoice = selectedCommunityPollChoice(payload);
  return {
    id:String(payload.id),
    channel:activeChannel,
    question:String(payload.question || '').trim().slice(0,80),
    options,
    counts,
    total,
    percentages,
    selectedChoice,
  };
}

function syncCommunityPollFromPayload(payload, channel=communityActiveChannel()){
  const activeChannel = validCommunityChannel(channel);
  if(payload == null && communityPollEnabledForChannel(activeChannel)){
    return communityPollsByChannel[activeChannel] || null;
  }
  const poll = normalizeCommunityPollPayload(payload, activeChannel);
  if(poll){
    communityPollsByChannel[activeChannel] = poll;
    rememberCommunityPollVote(poll);
  }else{
    delete communityPollsByChannel[activeChannel];
  }
  return poll;
}

function communityPollForChannel(channel=communityActiveChannel()){
  const activeChannel = validCommunityChannel(channel);
  if(!communityPollEnabledForChannel(activeChannel)) return null;
  return communityPollsByChannel[activeChannel] || {
    loading:true,
    channel:activeChannel,
    question:'오늘의 투표 불러오는 중...',
    options:['상승','하락','보합'],
    counts:[0,0,0],
    total:0,
    percentages:[0,0,0],
    selectedChoice:null,
  };
}

function communityPollRow(rowNum, dataCols, compact=false){
  const poll = communityPollForChannel();
  if(!poll) return '';
  const selectedChoice = selectedCommunityPollChoice(poll);
  const voted = Number.isInteger(selectedChoice);
  const total = Math.max(0, Number(poll.total || 0) || 0);
  const buttons = poll.options.map((option, index)=>{
    const pct = Number(poll.percentages?.[index] || 0);
    const selected = selectedChoice === index;
    const label = voted ? `${option} ${pct ? `${pct.toFixed(pct % 1 ? 1 : 0)}%` : '0%'}` : option;
    return `<button class="community-poll-choice${selected ? ' selected' : ''}" type="button" data-community-poll-choice="${index}" ${poll.loading || communityPollVoteInFlight || voted ? 'disabled' : ''} aria-pressed="${selected ? 'true' : 'false'}">${esc(label)}</button>`;
  }).join('');
  const resultText = poll.loading ? '준비 중' : (total ? `${total.toLocaleString('ko-KR')}명 참여` : (voted ? '첫 투표 완료' : '첫 투표를 기다리는 중'));
  const tail = compact ? '' : '<td class="center community-action-cell community-poll-tail"></td>';
  const inlineCount = `<span class="community-poll-count">${esc(resultText)}</span>`;
  return `<tr class="community-post-row community-poll-row${voted ? ' is-voted' : ''}${poll.loading ? ' is-loading' : ''}">
    <td class="rownum">${rowNum}</td>
    <td class="center community-author community-poll-author"><span>투표</span></td>
    <td class="left community-post-body community-poll-body">
      <div class="community-poll-inner">
        <span class="community-poll-kicker">오늘의 투표</span>
        <span class="community-poll-question">${esc(poll.question)}</span>
        <span class="community-poll-options">${buttons}</span>
        ${inlineCount}
      </div>
    </td>
    <td class="center time community-poll-time">오늘</td>
    ${tail}
  </tr>`;
}

async function voteCommunityPoll(choice){
  if(communityPollVoteInFlight) return;
  const poll = communityPollForChannel();
  if(!poll || poll.loading) return;
  const selected = Number(choice);
  if(!Number.isInteger(selected)) return;
  const previous = selectedCommunityPollChoice(poll);
  if(Number.isInteger(previous)){
    showToast('오늘 투표는 이미 참여했습니다', 'info');
    return;
  }
  communityPollVoteInFlight = true;
  renderCommunityTable();
  try{
    const data = await fetchJsonClient('/api/community', 7000, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        action:'poll_vote',
        channel:communityActiveChannel(),
        choice:selected,
        user_id:chatUserId(),
      }),
    });
    if(data?.poll){
      const next = syncCommunityPollFromPayload(data.poll, communityActiveChannel());
      if(next) rememberCommunityPollVote(next);
      trackCommunityGaEvent('community_poll_vote', communityGaPayload({
        poll_id:String(data.poll.id || '').slice(0, 80),
        poll_choice:String(data.poll.options?.[data.poll.selectedChoice] || ''),
        value:1,
      }));
      showToast(data.poll.already ? '이미 참여한 투표입니다' : '투표했습니다', 'info');
    }
  }catch(e){
    showToast(`투표 실패: ${e.message || e}`, 'err');
  }finally{
    communityPollVoteInFlight = false;
    renderCommunityTable();
  }
}

let timelineAnalyticsActiveKey = '';
let timelineAnalyticsStartedAt = 0;

function timelineAnalyticsPayload(tabKey=timelineActiveTabKey(), extra={}){
  const parts = timelineTabParts(tabKey);
  const key = parts.tab === 'community' ? `community-${parts.channel}` : parts.tab;
  return {
    event_category:'timeline',
    timeline_tab:parts.tab,
    timeline_tab_key:key,
    community_channel:parts.tab === 'community' ? parts.channel : '',
    community_channel_label:parts.tab === 'community' ? communityChannelLabel(parts.channel) : '',
    ...extra,
  };
}

function trackTimelineGaEvent(name, payload={}, options={}){
  if(typeof window.gtag !== 'function') return;
  try{
    window.gtag('event', name, {
      transport_type:'beacon',
      non_interaction:options.interaction ? false : true,
      ...payload,
    });
  }catch{}
}

function flushTimelineTabEngagement(reason='switch'){
  if(!timelineAnalyticsActiveKey || !timelineAnalyticsStartedAt) return;
  const durationMs = Date.now() - timelineAnalyticsStartedAt;
  if(durationMs >= 1000){
    trackTimelineGaEvent('timeline_tab_engagement', timelineAnalyticsPayload(timelineAnalyticsActiveKey, {
      engagement_reason:reason,
      duration_ms:Math.round(durationMs),
      duration_sec:Math.round(durationMs / 1000),
      value:Math.round(durationMs / 1000),
    }));
  }
  timelineAnalyticsStartedAt = Date.now();
}

function startTimelineTabEngagement(tabKey=timelineActiveTabKey(), reason='view'){
  const key = tabKey || timelineActiveTabKey();
  timelineAnalyticsActiveKey = key;
  timelineAnalyticsStartedAt = Date.now();
  trackTimelineGaEvent('timeline_tab_view', timelineAnalyticsPayload(key, {
    view_reason:reason,
    value:1,
  }));
}

function updateTimelineTabs(){
  const activeKey = timelineActiveTabKey();
  document.querySelectorAll('[data-timeline-tab]').forEach((btn)=>{
    const active=btn.dataset.timelineTab===activeKey;
    const parts = timelineTabParts(btn.dataset.timelineTab);
    const unread = parts.tab === 'community' ? communityUnreadBadgeForChannel(parts.channel) : 0;
    btn.classList.toggle('active', active);
    btn.classList.toggle('has-unread', unread > 0);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    if(unread > 0){
      btn.dataset.unreadCount = String(Math.min(99, unread));
      btn.title = `${communityChannelLabel(parts.channel)} · 새 글 ${unread}개`;
    }else{
      delete btn.dataset.unreadCount;
      btn.removeAttribute('title');
    }
  });
}
// 공지사항 모달 상단 3개 카드 (서버 상태 / Ootlook 베타 / 커피값) 는
// 동일한 .notice-card 포맷을 공유하고 색만 health/accent 로 다르게 한다.
function updatesNoticeHtml(){
  return `<div class="notice-card notice-card-accent" id="updatesDonationCard" data-expanded="false" data-accent="coffee">
    <button class="notice-card-summary" type="button" data-updates-donation-toggle aria-expanded="false">
      <span class="notice-card-dot" aria-hidden="true"></span>
      <span class="notice-card-title" id="updatesDonationTitle">만든사람 커피값 보내주기 <em>(클릭해서 자세히 보기)</em></span>
      <span class="notice-card-caret" aria-hidden="true">▾</span>
    </button>
    <div class="notice-card-detail" id="updatesDonationDetail" hidden>
      <strong>토스뱅크 1000-0005-7738</strong>
      <span>커피값 보내주시면 채팅방 아래쪽 후원자 명단에 약 2~3일간 입금자명을 띄워드립니다. 사람이 수동으로 띄우는거라 바로 뜨진 않고 몇시간 걸립니다.</span>
      <span>현재 접속자가 많아 서버 비용이 사비로 많이 듭니다. 운영비로 잘 사용하겠습니다. 배너 광고는 사용성을 해치고 사무실에서 이용이 불가해지므로 한 줄 텍스트광고만 검토 중입니다. 유료화 계획은 없습니다. 감사합니다.</span>
      <span>만든사람에게 연락하기 : <a href="mailto:excelkospi@outlook.com">excelkospi@outlook.com</a></span>
    </div>
  </div>`;
}
function serverStatusHtml(){
  return `<div class="notice-card server-status-card" id="serverStatusCard" data-health="ok" data-expanded="false" data-pinned="false" data-accent="status">
    <button class="notice-card-summary" type="button" data-server-status-toggle aria-expanded="false">
      <span class="notice-card-dot server-status-dot" aria-hidden="true"></span>
      <span class="notice-card-title server-status-text" id="serverStatusSummary">현재 서버 상태: 확인 중</span>
      <span class="notice-card-caret" aria-hidden="true">▾</span>
    </button>
    <div class="notice-card-detail server-status-detail" id="serverStatusDetail" hidden></div>
  </div>`;
}
function outlookBetaHtml(){
  // 서버 상태판 바로 아래에 들어가는 Ootlook 베타 안내. 다른 두 카드와 동일 포맷.
  if(document.body?.classList?.contains('theme-outlook')) return '';
  return `<button type="button" class="notice-card notice-card-button outlook-beta-banner" data-outlook-beta aria-label="Ootlook 위장 모드 사용해보기" data-accent="outlook">
    <span class="notice-card-summary notice-card-summary-static">
      <span class="notice-card-dot outlook-beta-dot" aria-hidden="true"></span>
      <span class="notice-card-title">Ootlook 위장 모드 (베타) 써보기 <em>피드백은 종토방에 남겨주세요</em></span>
      <span class="notice-card-caret" aria-hidden="true">→</span>
    </span>
  </button>`;
}
/* Ootlook disguise mode lives in app-outlook.js. */
async function openUpdatesModal(options={}){
  const modal=document.getElementById('updatesModal');
  const body=document.getElementById('updatesBody');
  if(!modal || !body) return;
  markUpdatesSeen();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  if(!patchNotesLoaded){
    body.textContent='불러오는 중...';
    try{
      const res=await fetch(PATCH_NOTES_URL, {cache:'no-store'});
      if(!res.ok) throw new Error(`patch-notes ${res.status}`);
      body.innerHTML=serverStatusHtml()+outlookBetaHtml()+updatesNoticeHtml()+renderPatchMarkdown(await res.text());
      patchNotesLoaded=true;
    }catch{
      body.innerHTML=serverStatusHtml()+outlookBetaHtml()+updatesNoticeHtml()+'<p class="updates-error">공지사항을 불러오지 못했습니다.</p>';
    }
  }
  bindServerStatusControls();
  bindDonationNoticeControls();
  serverStatusExpanded=false;
  renderServerStatus();
  if(options.expandDonation) expandDonationCard({ scrollIntoView:true });
}
function expandDonationCard({ scrollIntoView=false }={}){
  const card=document.getElementById('updatesDonationCard');
  if(!card) return;
  const detail=document.getElementById('updatesDonationDetail');
  const toggle=card.querySelector('[data-updates-donation-toggle]');
  const title=card.querySelector('.notice-card-title');
  card.dataset.expanded='true';
  if(detail) detail.hidden=false;
  if(toggle) toggle.setAttribute('aria-expanded', 'true');
  if(title) title.innerHTML='만든사람 커피값 보내주기 <em>(접기)</em>';
  if(scrollIntoView){
    requestAnimationFrame(()=>{
      try{ card.scrollIntoView({block:'start', behavior:'smooth'}); }catch{}
    });
  }
}
function closeUpdatesModal(){
  const modal=document.getElementById('updatesModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
}
function markUpdatesSeen(){
  try{
    localStorage.setItem(UPDATES_SEEN_KEY, PATCH_NOTES_URL);
    persistSet(UPDATES_SEEN_KEY, PATCH_NOTES_URL);
  }catch{}
  syncUpdatesBadge();
}
function syncUpdatesBadge(){
  const btn=document.getElementById('updatesOpen');
  if(!btn) return;
  let seen='';
  try{ seen=localStorage.getItem(UPDATES_SEEN_KEY) || ''; }catch{}
  btn.classList.toggle('has-new', seen !== PATCH_NOTES_URL);
}
function toggleReadabilityMode(){
  readabilityMode = !readabilityMode;
  try{
    localStorage.setItem(READABILITY_KEY, readabilityMode ? '1' : '0');
    persistSet(READABILITY_KEY, readabilityMode ? '1' : '0');
  }catch{}
  applyReadabilityMode();
  showToast(readabilityMode ? '노안 모드를 켰습니다' : '노안 모드를 껐습니다', 'info');
}

/* ============================================================
 *  Settings modal — 통합 설정 UI
 *  - 노안 모드, 화면 슬립 방지(Wake Lock), Ootlook 위장, 떠다니는 버튼,
 *    마지막 시장 기억, 데이터 초기화 등을 한 곳에 모은다.
 * ============================================================ */
const SETTINGS_WAKELOCK_KEY = 'kg_setting_wakelock_v1';
const SETTINGS_REMEMBER_MARKET_KEY = 'kg_setting_remember_market_v1';
let wakeLockSentinel = null;
let wakeLockPending = false;
let wakeLockFallbackVideo = null;
function isScreenWakeLockSupported(){
  return !!(navigator && 'wakeLock' in navigator);
}
function isWakeLockFallbackSupported(){
  return typeof document !== 'undefined' && typeof HTMLVideoElement !== 'undefined';
}
function isWakeLockSupported(){
  return isScreenWakeLockSupported() || isWakeLockFallbackSupported();
}
function readBoolSetting(key, defaultValue=false){
  try{ const v=localStorage.getItem(key); if(v==='1') return true; if(v==='0') return false; }catch{}
  return defaultValue;
}
function writeBoolSetting(key, value){
  try{
    localStorage.setItem(key, value ? '1' : '0');
    persistSet(key, value ? '1' : '0');
  }catch{}
}
function readStringSetting(key, defaultValue='', allowedValues=null){
  try{
    const value=localStorage.getItem(key);
    if(value && (!allowedValues || allowedValues.has(value))) return value;
  }catch{}
  return defaultValue;
}
function writeStringSetting(key, value){
  try{
    localStorage.setItem(key, String(value));
    persistSet(key, String(value));
  }catch{}
}
function ensureWakeLockFallbackVideo(){
  if(wakeLockFallbackVideo) return wakeLockFallbackVideo;
  const video=document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.muted = true;
  video.loop = true;
  video.preload = 'auto';
  video.src = '/assets/keep-awake.mp4';
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;bottom:-10px;';
  document.body?.appendChild(video);
  wakeLockFallbackVideo = video;
  return video;
}
async function requestWakeLockFallback(){
  if(!isWakeLockFallbackSupported()) return false;
  try{
    const video=ensureWakeLockFallbackVideo();
    await video.play();
    return true;
  }catch(_){
    return false;
  }
}
async function requestWakeLockIfNeeded(){
  if(!isWakeLockSupported()) return 'unsupported';
  if(document.visibilityState !== 'visible') return;
  if(!readBoolSetting(SETTINGS_WAKELOCK_KEY)) return;
  if(wakeLockSentinel || wakeLockPending) return 'active';
  wakeLockPending = true;
  try{
    if(isScreenWakeLockSupported()){
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', ()=>{ wakeLockSentinel = null; });
      return 'screen';
    }
  }catch(e){
    wakeLockSentinel = null;
  }finally{
    wakeLockPending = false;
  }
  return await requestWakeLockFallback() ? 'fallback' : 'failed';
}
async function releaseWakeLock(){
  if(wakeLockSentinel) {
    try{ await wakeLockSentinel.release(); }catch{}
  }
  wakeLockSentinel = null;
  if(wakeLockFallbackVideo){
    try{ wakeLockFallbackVideo.pause(); }catch{}
    try{ wakeLockFallbackVideo.remove(); }catch{}
    wakeLockFallbackVideo = null;
  }
}
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible' && readBoolSetting(SETTINGS_WAKELOCK_KEY)){
    requestWakeLockIfNeeded();
  } else if(document.visibilityState !== 'visible'){
    // 브라우저가 자동으로 release하지만 sentinel은 null로.
    wakeLockSentinel = null;
  }
});

function rememberMarketEnabled(){
  // default true — 사용자에게 익숙한 기존 동작.
  return readBoolSetting(SETTINGS_REMEMBER_MARKET_KEY, true);
}

const COIN_QUOTE_SOURCES = new Set(['binance','upbit']);
function normalizeCoinQuoteSourceClient(value){
  return String(value || '').trim().toLowerCase() === 'upbit' ? 'upbit' : 'binance';
}
function coinQuoteSource(){
  return normalizeCoinQuoteSourceClient(readStringSetting(COIN_QUOTE_SOURCE_KEY, 'binance', COIN_QUOTE_SOURCES));
}
function usKrwDisplayEnabled(){
  return readBoolSetting(US_SHEET_KRW_KEY, false);
}

function normalizeChatOpacity(value){
  if(value == null || value === '') return CHAT_OPACITY_DEFAULT;
  const raw=Number(value);
  if(!Number.isFinite(raw)) return CHAT_OPACITY_DEFAULT;
  const clamped=Math.min(CHAT_OPACITY_MAX, Math.max(CHAT_OPACITY_MIN, raw));
  return Math.round(clamped / CHAT_OPACITY_STEP) * CHAT_OPACITY_STEP;
}

function readChatOpacitySetting(){
  try{
    return normalizeChatOpacity(localStorage.getItem(CHAT_OPACITY_KEY));
  }catch{
    return CHAT_OPACITY_DEFAULT;
  }
}

function writeChatOpacitySetting(value){
  const normalized=normalizeChatOpacity(value);
  try{
    localStorage.setItem(CHAT_OPACITY_KEY, String(normalized));
    persistSet(CHAT_OPACITY_KEY, String(normalized));
  }catch{}
  return normalized;
}

function syncSettingsUI(){
  const theme=document.getElementById('settingExcelTheme');
  if(theme) theme.value = EXCEL_THEMES.has(excelTheme) ? excelTheme : 'classic';
  const d=document.getElementById('settingDarkMode');
  if(d) d.checked = !!excelDarkMode;
  const r=document.getElementById('settingReadability');
  if(r) r.checked = !!readabilityMode;
  const w=document.getElementById('settingWakeLock');
  if(w){
    w.checked = readBoolSetting(SETTINGS_WAKELOCK_KEY);
    w.disabled = !isWakeLockSupported();
    const row=w.closest('.settings-row');
    if(row) row.dataset.unsupported = w.disabled ? 'true' : 'false';
  }
  const ft=document.getElementById('settingFloatingTelegram');
  if(ft) ft.checked = !floatingHiddenFor('telegram');
  const fc=document.getElementById('settingFloatingChat');
  if(fc) fc.checked = !floatingHiddenFor('chat');
  const o=document.getElementById('settingOutlook');
  if(o) o.checked = !!document.body.classList.contains('theme-outlook') || outlookBetaActive;
  const m=document.getElementById('settingRememberMarket');
  if(m) m.checked = rememberMarketEnabled();
  const u=document.getElementById('settingUsKrwDisplay');
  if(u) u.checked = usKrwDisplayEnabled();
  const c=document.getElementById('settingCoinQuoteSource');
  if(c) c.value = coinQuoteSource();
  applyChatPanelOpacity();
}

function openSettingsModal(){
  const modal=document.getElementById('settingsModal');
  if(!modal) return;
  try{
    syncSettingsUI();
  }catch(e){
    debugWarn('settings sync failed; opening modal with current DOM state', e);
  }
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
}
function closeSettingsModal(){
  const modal=document.getElementById('settingsModal');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
}

async function handleSettingChange(key, checked){
  if(key === 'excelTheme'){
    const next = EXCEL_THEMES.has(String(checked)) ? String(checked) : 'classic';
    if(excelTheme === next) return;
    excelTheme = next;
    writeStringSetting(EXCEL_THEME_KEY, excelTheme);
    applyExcelAppearance();
    showToast('엑셀 색상 테마를 바꿨습니다.', 'info');
    return;
  }
  if(key === 'darkMode'){
    excelDarkMode = !!checked;
    writeBoolSetting(EXCEL_DARK_MODE_KEY, excelDarkMode);
    applyExcelAppearance();
    showToast(excelDarkMode ? '엑셀 다크모드를 켰습니다.' : '엑셀 다크모드를 껐습니다.', 'info');
    return;
  }
  if(key === 'readability'){
    if(!!readabilityMode === !!checked) return;
    toggleReadabilityMode();
    return;
  }
  if(key === 'wakelock'){
    if(!isWakeLockSupported()){
      showToast('이 브라우저에서는 화면 슬립 방지를 지원하지 않아요.', 'warn');
      syncSettingsUI();
      return;
    }
    writeBoolSetting(SETTINGS_WAKELOCK_KEY, !!checked);
    if(checked){
      const mode=await requestWakeLockIfNeeded();
      if(mode === 'screen') showToast('창이 떠 있는 동안 화면이 꺼지지 않습니다.', 'info');
      else if(mode === 'fallback') showToast('이 브라우저는 보조 방식으로 화면 꺼짐을 줄입니다.', 'info');
      else if(mode === 'active') showToast('화면 슬립 방지가 이미 켜져 있습니다.', 'info');
      else showToast('브라우저/배터리 설정 때문에 화면 슬립 방지를 켜지 못했습니다.', 'warn');
    } else {
      await releaseWakeLock();
      showToast('화면 슬립 방지를 껐습니다.', 'info');
    }
    return;
  }
  if(key === 'floatingTelegram'){
    setFloatingButtonHidden('telegram', !checked);
    showToast(checked ? '시세알림 버튼을 다시 표시합니다.' : '시세알림 버튼을 숨겼습니다.', 'info');
    return;
  }
  if(key === 'floatingChat'){
    setFloatingButtonHidden('chat', !checked);
    showToast(checked ? '채팅 버튼을 다시 표시합니다.' : '채팅 버튼을 숨겼습니다.', 'info');
    return;
  }
  if(key === 'chatOpacity'){
    chatPanelOpacity=writeChatOpacitySetting(checked);
    applyChatPanelOpacity();
    showToast(`채팅창 투명도 ${chatPanelOpacity}%`, 'info');
    return;
  }
  if(key === 'outlook'){
    if(checked && !outlookBetaActive){
      closeSettingsModal();
      activateOutlookTheme();
      // 첫 진입 안내 — 본인이 켠 직후라 짧고 명확하게.
      setTimeout(()=>showToast('새로고침하면 엑셀로 돌아갑니다', 'info'), 400);
    } else if(!checked && outlookBetaActive){
      closeSettingsModal();
      deactivateOutlookTheme();
    }
    return;
  }
  if(key === 'rememberMarket'){
    writeBoolSetting(SETTINGS_REMEMBER_MARKET_KEY, !!checked);
    showToast(checked ? '마지막 시장을 기억합니다.' : '항상 자동(현재 장)으로 시작합니다.', 'info');
    return;
  }
  if(key === 'usKrwDisplay'){
    writeBoolSetting(US_SHEET_KRW_KEY, !!checked);
    if(lastSnapshot) await renderSnapshot(lastSnapshot);
    showToast(checked ? '미장 현재가를 원화로 환산해 표시합니다.' : '미장 현재가를 원래 통화로 표시합니다.', 'info');
    return;
  }
  if(key === 'coinQuoteSource'){
    const next = normalizeCoinQuoteSourceClient(checked);
    if(coinQuoteSource() === next) return;
    writeStringSetting(COIN_QUOTE_SOURCE_KEY, next);
    clearSnapshotMarketCaches();
    setLoading(true, next === 'upbit' ? '업비트 시세로 바꾸는 중...' : '바이낸스 시세로 바꾸는 중...');
    await loadSnapshot({force:true});
    showToast(next === 'upbit' ? '코인 시세 출처를 업비트로 바꿨습니다.' : '코인 시세 출처를 바이낸스로 바꿨습니다.', 'info');
    return;
  }
}

document.addEventListener('change', (ev)=>{
  const row = ev.target?.closest?.('.settings-row[data-setting]');
  if(!row) return;
  const key = row.dataset.setting;
  const control = row.querySelector('input[type="checkbox"], input[type="range"], select');
  if(!key || !control) return;
  const value = control.tagName === 'SELECT' ? control.value : (control.type === 'range' ? control.value : !!control.checked);
  handleSettingChange(key, value);
});

document.addEventListener('input', (ev)=>{
  if(ev.target?.id !== 'settingChatOpacity') return;
  chatPanelOpacity=normalizeChatOpacity(ev.target.value);
  applyChatPanelOpacity();
});

async function handleSettingsReset(){
  if(!window.confirm('정말 이 브라우저의 모든 사용자 데이터를 초기화할까요?\n관심 종목·보유 메모·캐시·노안 설정·시장 기억 등이 모두 사라집니다.')) return;
  try{
    const preserve=['kg_visitor_id_v1'];
    const keep={};
    for(const k of preserve){ try{ keep[k]=localStorage.getItem(k); }catch{} }
    localStorage.clear();
    for(const k of preserve){ if(keep[k] != null) localStorage.setItem(k, keep[k]); }
  }catch{}
  try{ sessionStorage.clear(); }catch{}
  try{
    if('caches' in window){
      const keys = await caches.keys();
      await Promise.all(keys.map((k)=>caches.delete(k)));
    }
  }catch{}
  try{
    if('serviceWorker' in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r)=>r.unregister()));
    }
  }catch{}
  try{
    if(window.indexedDB){
      indexedDB.deleteDatabase('excelkospi_settings_v1');
    }
  }catch{}
  showToast('초기화 완료. 잠시 후 새로고침합니다.', 'info');
  setTimeout(()=>{ window.location.reload(); }, 600);
}
document.addEventListener('click',(ev)=>{
  if(ev.target?.closest?.('[data-outlook-beta]')){
    ev.preventDefault();
    activateOutlookTheme();
    closeUpdatesModal();
    showToast('Ootlook 테마 베타로 전환했습니다. 새로고침하면 Excel로 돌아갑니다.', 'info');
    return;
  }
  const outlookAction=ev.target?.closest?.('[data-outlook-action]');
  if(outlookAction){
    ev.preventDefault();
    const action=outlookAction.dataset.outlookAction;
    if(action==='refresh') manualRefresh();
    if(action==='notices') openUpdatesModal();
    if(action==='chat') setChatOpen(true);
    return;
  }
  if(ev.target?.closest?.('#updatesOpen')){
    ev.preventDefault();
    openUpdatesModal();
    return;
  }
  if(ev.target?.closest?.('#settingsOpen')){
    ev.preventDefault();
    openSettingsModal();
    return;
  }
  if(ev.target?.closest?.('[data-settings-close]')){
    ev.preventDefault();
    closeSettingsModal();
    return;
  }
  const settingToggle=ev.target?.closest?.('[data-setting] input[type="checkbox"]');
  if(settingToggle){
    // 토글 change 이벤트로 처리하므로 click 자체는 통과시킴.
  }
  const settingAction=ev.target?.closest?.('[data-setting-action]');
  if(settingAction){
    ev.preventDefault();
    if(settingAction.dataset.settingAction === 'reset') handleSettingsReset();
    return;
  }
  if(ev.target?.closest?.('#readabilityToggle')){
    ev.preventDefault();
    toggleReadabilityMode();
    return;
  }
  if(ev.target?.closest?.('[data-updates-close]')){
    ev.preventDefault();
    closeUpdatesModal();
  }
});
document.addEventListener('keydown',(ev)=>{
  if(ev.key==='Escape'){
    closeUpdatesModal();
    closeSettingsModal();
  }
});
function bindSettingsModalTriggers(){
  document.querySelectorAll('#settingsOpen,[data-outlook-tool="settings"],.outlook-top-btn[aria-label="설정"]').forEach((el)=>{
    if(el.dataset.settingsTriggerBound === '1') return;
    el.dataset.settingsTriggerBound = '1';
    el.addEventListener('click', (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      openSettingsModal();
      setOutlookMobileNavOpen(false);
    });
  });
}
bindSettingsModalTriggers();
function updateZoomLabel(){
  const el=document.getElementById('zoomLabel');
  if(!el) return;
  let zoom=1;
  try{
    const vv=window.visualViewport;
    if(vv && Math.abs((vv.scale || 1) - 1) > 0.01) zoom = vv.scale || 1;
    else{
      const baselineKey='kg_zoom_baseline_dpr_v1';
      let baseline=Number(sessionStorage.getItem(baselineKey) || 0);
      if(!baseline){
        baseline=window.devicePixelRatio || 1;
        sessionStorage.setItem(baselineKey, String(baseline));
      }
      zoom=(window.devicePixelRatio || baseline) / baseline;
    }
  }catch{}
  const pct=Math.max(50, Math.min(300, Math.round(zoom * 100)));
  el.textContent=`${pct}%`;
}
syncUpdatesBadge();
applyReadabilityMode();
updateZoomLabel();
window.addEventListener('resize', updateZoomLabel, {passive:true});
window.visualViewport?.addEventListener?.('resize', updateZoomLabel, {passive:true});
function num(v){ if(v===null||v===undefined||Number.isNaN(v)) return '-'; return Number(v).toLocaleString('ko-KR'); }
function pct(v){ if(v===null||v===undefined||Number.isNaN(v)) return '-'; const n=Number(v); const s=n>0?'+':''; return s+n.toFixed(2)+'%'; }
function cls(v){ if(v===null||v===undefined||Number.isNaN(v)) return 'flat'; if(v>0) return 'up'; if(v<0) return 'down'; return 'flat'; }
function mapAuto(snapshot){
  if(snapshot?.defaultMarket) return snapshot.defaultMarket;
  const session=String(snapshot?.session || '');
  if(session === 'WEEKEND' || session === 'OFF') return 'ALL';
  return session.startsWith('KR') ? 'KR' : 'US';
}
function marketDisplayName(market){
  const m=String(market||'').toUpperCase();
  return MARKET_LABELS[m] || m;
}
function relativeTimeKR(s){
  if(!s) return '';
  const t = Date.parse(s);
  if(isNaN(t)) return '';
  const diff = Date.now() - t;
  if(diff < 0) return '방금';
  if(diff < 60_000) return '방금';
  const m = Math.floor(diff / 60_000);
  if(m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if(h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

function fmtDt(s){
  if(!s) return '-';
  // ISO timestamp 면 KST 변환해서 표시. 'Tue, 12 May 2026 04:43:00 GMT' 같은 RSS pubDate 도 처리.
  const d = new Date(s);
  if(isNaN(d.getTime())){
    // 폴백: 그냥 첫 16자
    return String(s).slice(0,16).replace('T',' ');
  }
  // KST (UTC+09:00) 로 포맷: 'YYYY-MM-DD HH:MM'
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone:'Asia/Seoul',
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false,
  });
  const parts = fmt.formatToParts(d).reduce((a,p)=>{a[p.type]=p.value;return a;},{});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function fmtTime(s){
  if(!s) return '-';
  const d = new Date(s);
  if(isNaN(d.getTime())) return String(s).slice(11,16) || String(s).slice(0,5);
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone:'Asia/Seoul',
    hour:'2-digit', minute:'2-digit', hour12:false,
  });
  const parts = fmt.formatToParts(d).reduce((a,p)=>{a[p.type]=p.value;return a;},{});
  return `${parts.hour}:${parts.minute}`;
}

function fmtShortDateTime(s){
  if(!s) return '-';
  const d = new Date(s);
  if(isNaN(d.getTime())) return String(s).slice(5,16).replace('T',' ') || String(s).slice(0,10);
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone:'Asia/Seoul',
    month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false,
  });
  const parts = fmt.formatToParts(d).reduce((a,p)=>{a[p.type]=p.value;return a;},{});
  return `${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}`;
}

function fmtCommunityDateTime(s, compact=false){
  if(!compact) return fmtShortDateTime(s);
  if(!s) return '-';
  const d = new Date(s);
  if(isNaN(d.getTime())){
    const raw = String(s).replace('T',' ');
    return raw.slice(5,10) || raw.slice(11,16) || raw.slice(0,5) || '-';
  }
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone:'Asia/Seoul',
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false,
  });
  const parts = fmt.formatToParts(d).reduce((a,p)=>{a[p.type]=p.value;return a;},{});
  const nowParts = fmt.formatToParts(new Date()).reduce((a,p)=>{a[p.type]=p.value;return a;},{});
  const isToday = parts.year === nowParts.year && parts.month === nowParts.month && parts.day === nowParts.day;
  return isToday ? `${parts.hour}:${parts.minute}` : `${Number(parts.month)}/${Number(parts.day)}`;
}

const MOOD_PROTECTED_KEYS = new Set(['수급','국장 15분 변동','국장 30분 변동','미장 15분 변동','미장 30분 변동']);
const DEFAULT_ORDER_STORE = 'kg_default_order_v2';
const DEFAULT_TOP_PRIORITY = new Map([
  ['수급', 0],
  ['국장 15분 변동', 1],
  ['국장 30분 변동', 2],
  ['미장 15분 변동', 3],
  ['미장 30분 변동', 4],
]);
const DEFAULT_CARD_ORDER = new Map([
  'KR:수급',
  'KR:코스피',
  'KR:코스닥',
  'KR:삼성전자',
  'KR:SK하이닉스',
  'KR:LG전자',
  'KR:현대자동차',
  'KR:TIGER 200IT레버리지',
  'KR:국고채 10년',
  'KR:KRW 금현물',
  'KR:원/달러',
  'KR:BTC(USD)',
  'KR:김프(%)',
  'US:코스피야선',
  'US:미국채 10년',
  'US:나스닥 선물',
  'US:나스닥',
  'US:S&P500',
  'US:다우',
  'US:TQQQ',
  'US:SOXL',
  'US:NVIDIA',
  'US:Tesla',
  'US:Apple',
  'US:WTI 원유',
  'US:원/달러',
  'US:BTC(USD)',
  'US:김프(%)',
  'COIN:김프(%)',
  'COIN:BTC',
  'COIN:ETH',
  'COIN:XRP',
  'COIN:SOL',
  'COIN:BNB',
  'COIN:DOGE',
  'COIN:USDT/KRW',
].map((id, idx)=>[id, idx]));
const DEFAULT_QUOTE_TOKENS = new Map([
  ['KR:코스피', 'KOSPI:KR'],
  ['KR:코스닥', 'KOSDAQ:KR'],
  ['KR:삼성전자', '005930:KR'],
  ['KR:SK하이닉스', '000660:KR'],
  ['KR:LG전자', '066570:KR'],
  ['KR:현대자동차', '005380:KR'],
  ['KR:TIGER 200IT레버리지', '243880:KR'],
  ['KR:원/달러', 'KRW=X:US'],
  ['KR:BTC(USD)', 'BTCUSDT:COIN'],
  ['US:나스닥 선물', 'NQ=F:US'],
  ['US:나스닥', '^IXIC:US'],
  ['US:S&P500', '^GSPC:US'],
  ['US:다우', '^DJI:US'],
  ['US:TQQQ', 'TQQQ:US'],
  ['US:SPY', 'SPY:US'],
  ['US:SOXL', 'SOXL:US'],
  ['US:NVIDIA', 'NVDA:US'],
  ['US:Tesla', 'TSLA:US'],
  ['US:Apple', 'AAPL:US'],
  ['US:WTI 원유', 'CL=F:US'],
  ['US:원/달러', 'KRW=X:US'],
  ['US:BTC(USD)', 'BTCUSDT:COIN'],
  ['COIN:BTC', 'BTCUSDT:COIN'],
  ['COIN:ETH', 'ETHUSDT:COIN'],
  ['COIN:XRP', 'XRPUSDT:COIN'],
  ['COIN:SOL', 'SOLUSDT:COIN'],
  ['COIN:BNB', 'BNBUSDT:COIN'],
  ['COIN:DOGE', 'DOGEUSDT:COIN'],
  ['COIN:USDT/KRW', 'USDT:COIN'],
]);
let lastRenderedDefaultOrderIds = [];
let lastRenderedQuoteOrderIds = [];

function normalizeDefaultOrder(order){
  if(!Array.isArray(order)) return [];
  let changed = false;
  const seen = new Set();
  const next = [];
  for(const raw of order){
    let id = String(raw || '');
    if(id === 'US:야선(%)'){ id = 'US:코스피야선'; changed = true; }
    if(id === 'US:QQQ'){ changed = true; continue; }
    if(!id || seen.has(id)){ changed = true; continue; }
    seen.add(id);
    next.push(id);
  }
  const migratedLegacyOrder = changed;
  const moveBeforeMarket = (id, marketPrefix)=>{
    const old = next.indexOf(id);
    if(old >= 0) next.splice(old, 1);
    const target = next.findIndex(x=>x.startsWith(marketPrefix));
    const insertAt = target >= 0 ? target : next.length;
    next.splice(insertAt, 0, id);
    if(old !== insertAt) changed = true;
  };
  if(migratedLegacyOrder && next.includes('US:코스피야선')) moveBeforeMarket('US:코스피야선', 'US:');
  if(migratedLegacyOrder && next.includes('COIN:김프(%)')) moveBeforeMarket('COIN:김프(%)', 'COIN:');
  if(changed){
    try{
      const value=JSON.stringify(next);
      localStorage.setItem(DEFAULT_ORDER_STORE, value);
      persistSet(DEFAULT_ORDER_STORE, value);
    }catch{}
  }
  return next;
}
function defaultOrderLoad(){ try{ return normalizeDefaultOrder(JSON.parse(localStorage.getItem(DEFAULT_ORDER_STORE)||'[]')); }catch{ return []; } }
function defaultOrderSave(order){ const value=JSON.stringify(order); localStorage.setItem(DEFAULT_ORDER_STORE, value); persistSet(DEFAULT_ORDER_STORE, value); }
function cardOrderId(card){ return `${card.market||''}:${card.key}`; }
function quoteRowOrderId(card){
  if(card?._noteRow) return quoteNoteOrderId(card);
  if(card?.userAdded){
    const market=String(card.market||'').toUpperCase();
    const code=String(card.code||card.key||'').toUpperCase();
    return `U:${market}:${code}`;
  }
  return cardOrderId(card);
}
function isMomentumAggregateKey(key){ return ['국장 15분 변동','국장 30분 변동','미장 15분 변동','미장 30분 변동'].includes(key); }
function defaultCardRank(card, fallbackIndex){
  return DEFAULT_CARD_ORDER.get(cardOrderId(card)) ?? (10000 + fallbackIndex);
}
const HOLDING_EXCLUDED_KEYS = new Set(['수급','김프(%)','코스피야선','코스피','코스닥','나스닥 선물','나스닥','S&P500','다우','국고채 10년','미국채 10년']);
const HOLDING_EXCLUDED_CODES = new Set(['KOSPI','KOSDAQ','NQ=F','^IXIC','^GSPC','^DJI']);
function isIndexLikeCard(card){
  const key=String(card?.key||'').trim();
  const code=String(card?.code||'').trim().toUpperCase();
  return HOLDING_EXCLUDED_KEYS.has(key) || HOLDING_EXCLUDED_CODES.has(code);
}
function orderVisibleCards(cards){
  const order = defaultOrderLoad();
  const pos = new Map(order.map((id, idx)=>[id, idx]));
  return cards.map((c,i)=>({c,i})).sort((a,b)=>{
    const ap = DEFAULT_TOP_PRIORITY.get(a.c.key);
    const bp = DEFAULT_TOP_PRIORITY.get(b.c.key);
    if(ap !== undefined || bp !== undefined) return (ap ?? 1000 + a.i) - (bp ?? 1000 + b.i);
    const ai = cardOrderId(a.c);
    const bi = cardOrderId(b.c);
    const ao = pos.has(ai) ? pos.get(ai) : defaultCardRank(a.c, a.i);
    const bo = pos.has(bi) ? pos.get(bi) : defaultCardRank(b.c, b.i);
    return ao - bo;
  }).map(x=>x.c);
}

function orderRenderedQuoteCards(cards){
  const order=defaultOrderLoad();
  if(quoteSortMode !== 'manual') return sortRenderedQuoteCards(cards);
  if(!order.length) return cards;
  const pos=new Map(order.map((id,idx)=>[id,idx]));
  const fallbackRank = (card, index)=>{
    const top = DEFAULT_TOP_PRIORITY.get(card?.key);
    if(top !== undefined) return -1000 + top;
    return 100000 + index;
  };
  return cards.map((c,i)=>({c,i})).sort((a,b)=>{
    const ao=pos.get(quoteRowOrderId(a.c));
    const bo=pos.get(quoteRowOrderId(b.c));
    if(ao !== undefined || bo !== undefined) return (ao ?? fallbackRank(a.c, a.i)) - (bo ?? fallbackRank(b.c, b.i));
    return a.i - b.i;
  }).map(x=>x.c);
}

function sortableQuoteCard(card){
  return card && !card._noteRow && !card._flows && card._momentum === undefined;
}

function holdingSortCalc(card){
  const calc = holdingCalc(card);
  if(!calc) return null;
  return calc;
}

function quoteSortNumber(card){
  if(quoteSortMode === 'change-desc') return Number(changeValueFor(card));
  if(quoteSortMode === 'value-desc') return Number(holdingSortCalc(card)?.value);
  if(quoteSortMode === 'pnl-desc') return Number(holdingSortCalc(card)?.pct);
  return null;
}

function sortRenderedQuoteCards(cards){
  const input = Array.isArray(cards) ? cards : [];
  const topRows = [];
  const sortable = [];
  const noteRows = [];
  input.forEach((card, index)=>{
    const wrapped = { card, index };
    if(card?._noteRow) noteRows.push(wrapped);
    else if(!sortableQuoteCard(card) || MOOD_PROTECTED_KEYS.has(card?.key)) topRows.push(wrapped);
    else sortable.push(wrapped);
  });
  sortable.sort((a,b)=>{
    if(quoteSortMode === 'name-asc'){
      const cmp = String(a.card?.key || '').localeCompare(String(b.card?.key || ''), 'ko-KR', { numeric:true, sensitivity:'base' });
      return cmp || a.index - b.index;
    }
    const av = quoteSortNumber(a.card);
    const bv = quoteSortNumber(b.card);
    const af = Number.isFinite(av);
    const bf = Number.isFinite(bv);
    if(af || bf) return (bf ? bv : -Infinity) - (af ? av : -Infinity) || a.index - b.index;
    return a.index - b.index;
  });
  return topRows.concat(sortable, noteRows).map((item)=>item.card);
}

function visibleCards(cards, market){
  // 수급/15분/30분 변동도 일반 종목 row 와 동일하게 메인 시트에 포함 — 엑셀 위장 우선.
  const hidden = hiddenLoad();
  const isShown = (c) => !hidden.has(c.key) && !isMomentumAggregateKey(c.key);
  const inKr = ['수급','코스피','코스닥','삼성전자','SK하이닉스','LG전자','현대자동차','TIGER 200IT레버리지','국고채 10년','KRW 금현물','원/달러','BTC(USD)','김프(%)'];
  const inUs = ['코스피야선','미국채 10년','나스닥 선물','나스닥','S&P500','다우','TQQQ','SOXL','NVIDIA','Tesla','Apple','WTI 원유','원/달러','BTC(USD)','김프(%)'];
  const inCoin = ['BTC','ETH','XRP','SOL','BNB','DOGE','USDT/KRW','김프(%)'];
  if(market==='KR') return orderVisibleCards(cards.filter(c=>c.market==='KR' && inKr.includes(c.key) && isShown(c)));
  if(market==='US') return orderVisibleCards(cards.filter(c=>c.market==='US' && inUs.includes(c.key) && isShown(c)));
  if(market==='COIN') return orderVisibleCards(cards.filter(c=>c.market==='COIN' && inCoin.includes(c.key) && isShown(c)));
  if(market==='HOLDINGS') return orderVisibleCards(cards.filter(c=>isShown(c) && canHoldCard(c) && holdingLotsFor(c).length > 0));
  const stockCards = cards.filter(c=>STOCK_MARKETS.has(String(c.market||'').toUpperCase()));
  const sharedGroup = (key)=>{
    if(key === 'BTC' || key === 'BTC(USD)') return 'BTC';
    if(key === '원/달러' || key === '김프(%)') return key;
    return '';
  };
  const seenShared = new Set();
  return orderVisibleCards(stockCards.filter((c)=>{
    if(!isShown(c)) return false;
    if(c.market==='US' && c.key==='QQQ') return false;
    const group = sharedGroup(c.key);
    if(!group) return true;
    if(seenShared.has(group)) return false;
    seenShared.add(group);
    return true;
  }));
}

function cardMeta(key){
  const binanceLink = (base)=>`https://www.binance.com/en/trade/${base}_USDT`;
  const upbitLink = (base)=>`https://upbit.com/exchange?code=CRIX.UPBIT.KRW-${base}`;
  const coinTradeLink = (base)=>coinQuoteSource() === 'upbit' ? upbitLink(base) : binanceLink(base);
  const m={
    '코스피':'https://finance.naver.com/sise/sise_index.naver?code=KOSPI',
    '코스닥':'https://finance.naver.com/sise/sise_index.naver?code=KOSDAQ',
    '수급':'https://finance.naver.com/sise/investorDealTrendDay.naver',
    '삼성전자':'https://finance.naver.com/item/main.naver?code=005930',
    'SK하이닉스':'https://finance.naver.com/item/main.naver?code=000660',
    '현대자동차':'https://finance.naver.com/item/main.naver?code=005380',
    'LG전자':'https://finance.naver.com/item/main.naver?code=066570',
    'TIGER 200IT레버리지':'https://finance.naver.com/item/main.naver?code=243880',
    '국고채 10년':'https://m.stock.naver.com/marketindex',
    '미국채 10년':'https://finance.yahoo.com/quote/%5ETNX',
    'KRW 금현물':'https://finance.yahoo.com/quote/GC%3DF',
    '나스닥 선물':'https://finance.yahoo.com/quote/NQ%3DF',
    '나스닥':'https://finance.yahoo.com/quote/%5EIXIC',
    '다우':'https://finance.yahoo.com/quote/%5EDJI',
    'QQQ':'https://finance.yahoo.com/quote/QQQ',
    'TQQQ':'https://finance.yahoo.com/quote/TQQQ',
    'SPY':'https://finance.yahoo.com/quote/SPY',
    'SOXL':'https://finance.yahoo.com/quote/SOXL',
    'S&P500':'https://finance.yahoo.com/quote/%5EGSPC',
    'NVIDIA':'https://finance.yahoo.com/quote/NVDA',
    'Tesla':'https://finance.yahoo.com/quote/TSLA',
    'Apple':'https://finance.yahoo.com/quote/AAPL',
    'WTI 원유':'https://finance.yahoo.com/quote/CL%3DF',
    'BTC(USD)':binanceLink('BTC'),
    'BTC':coinTradeLink('BTC'),
    'ETH':coinTradeLink('ETH'),
    'XRP':coinTradeLink('XRP'),
    'SOL':coinTradeLink('SOL'),
    'BNB':coinTradeLink('BNB'),
    'DOGE':coinTradeLink('DOGE'),
    'USDT/KRW':upbitLink('USDT'),
    '원/달러':'https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW',
    '코스피야선':'https://esignal.co.kr/kospi200-futures-night/',
    '김프(%)':'https://kimpga.com/'
  };
  return m[key] || '';
}

function userCardLink(c){
  if(c.market==='COIN'){
    const raw=String(c.code||c.key||'').toUpperCase().replace(/[\s/_-]+/g,'');
    const base=raw.replace(/USDT$/,'').replace(/USD$/,'') || String(c.key||'').toUpperCase();
    if(base === 'USDT' || String(c.key || '').toUpperCase() === 'USDT/KRW') return `https://upbit.com/exchange?code=CRIX.UPBIT.KRW-USDT`;
    if(coinQuoteSource() === 'upbit') return `https://upbit.com/exchange?code=CRIX.UPBIT.KRW-${esc(base)}`;
    return `https://www.binance.com/en/trade/${esc(base)}_USDT`;
  }
  if(c.market==='KR'){
    if(c.code==='KOSPI'||c.code==='KOSDAQ') return `https://finance.naver.com/sise/sise_index.naver?code=${esc(c.code)}`;
    return `https://finance.naver.com/item/main.naver?code=${esc(c.code)}`;
  }
  return `https://finance.yahoo.com/quote/${esc(c.code)}`;
}

function makeEmptyRows(startIdx, count, cols){
  // 'Excel 처럼 끝까지 뻗어있는' 셀 모양 — 데이터 다음으로 빈 row 채움.
  let out = '';
  for (let i=0; i<count; i++){
    const idx = startIdx + i;
    let tds = `<td class="rownum">${idx}</td>`;
    for (let c=0; c<cols; c++) tds += `<td>&nbsp;</td>`;
    out += `<tr class="empty-row">${tds}</tr>`;
  }
  return out;
}

function sessionHas(session, part){
  return String(session || '').includes(part);
}

function isAlwaysLiveCard(card){
  return card.market === 'COIN' || ['BTC(USD)','김프(%)','원/달러','코스피야선','나스닥 선물','수급','국장 15분 변동','국장 30분 변동','미장 15분 변동','미장 30분 변동','WTI 원유','KRW 금현물','국고채 10년','미국채 10년'].includes(card.key);
}

function holdingsLoad(){ try{ return JSON.parse(localStorage.getItem(HOLDINGS_KEY)||'{}'); }catch{ return {}; } }
function holdingsSave(map){ const value=JSON.stringify(map); localStorage.setItem(HOLDINGS_KEY, value); persistSet(HOLDINGS_KEY, value); }
function holdingId(card){ return card.userAdded ? `${card.market||''}:${card.code||card.key}` : cardOrderId(card); }
function isRateOnlyCard(key){ return ['김프(%)','코스피야선'].includes(key); }
function canHoldCard(card){ return !isIndexLikeCard(card) && !isMomentumAggregateKey(card.key); }
function parseHoldingInput(value){ return Number(String(value || '').replace(/,/g, '').trim()); }
function normalizeHoldingLot(value, fallbackId='0'){
  if(!value || typeof value !== 'object') return null;
  const avg = Number(value.avg);
  const qty = Number(value.qty);
  if(!Number.isFinite(avg) || avg <= 0 || !Number.isFinite(qty) || qty <= 0) return null;
  const lotId = String(value.lotId || value.id || fallbackId || '0').slice(0, 40) || '0';
  const updatedAt = Number(value.updatedAt || Date.now());
  return {
    lotId,
    avg,
    qty,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  };
}
function holdingLotsFromRecord(record){
  if(!record || typeof record !== 'object') return [];
  if(Array.isArray(record)){
    const rawLots = Array.isArray(record[0]) ? record : [record];
    return rawLots
      .map((lot, idx)=>normalizeHoldingLot({
        avg: lot?.[0],
        qty: lot?.[1],
        lotId: lot?.[2],
        updatedAt: lot?.[3],
      }, String(idx)))
      .filter(Boolean)
      .slice(0, 20);
  }
  if(Array.isArray(record.lots)){
    return record.lots
      .map((lot, idx)=>normalizeHoldingLot(lot, String(idx)))
      .filter(Boolean)
      .slice(0, 20);
  }
  const legacy = normalizeHoldingLot(record, '0');
  return legacy ? [legacy] : [];
}
function holdingLotsForId(id){
  if(!id) return [];
  return holdingLotsFromRecord(holdingsLoad()[id]);
}
function holdingLotsFor(card){
  return holdingLotsForId(holdingId(card));
}
function holdingRecordFromLots(lots){
  const clean = (Array.isArray(lots) ? lots : [])
    .map((lot, idx)=>normalizeHoldingLot(lot, String(idx)))
    .filter(Boolean)
    .slice(0, 20);
  if(!clean.length) return null;
  return { lots:clean, updatedAt:Date.now() };
}
function newHoldingLotId(){
  return `lot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
function primaryHoldingLotId(id){
  return holdingLotsForId(id)[0]?.lotId || '';
}
function aggregateHoldingLots(lots){
  const clean = (Array.isArray(lots) ? lots : []).filter(Boolean);
  const qty = clean.reduce((sum, lot)=>sum + Number(lot.qty || 0), 0);
  if(!qty) return null;
  const invested = clean.reduce((sum, lot)=>sum + Number(lot.avg || 0) * Number(lot.qty || 0), 0);
  return { avg:invested / qty, qty, lots:clean.length };
}
function holdingFor(card){
  return aggregateHoldingLots(holdingLotsFor(card));
}
function holdingCalc(card, lot=null){
  const h = lot || holdingFor(card);
  const price = Number(card.price);
  if(!h || !Number.isFinite(price)) return null;
  const invested = h.avg * h.qty;
  const value = price * h.qty;
  const pnl = value - invested;
  const pctValue = (price / h.avg - 1) * 100;
  const dayPct = Number(card.changePct);
  let dayPnl = null;
  let dayBaseValue = null;
  if(Number.isFinite(dayPct) && dayPct > -99.99){
    dayBaseValue = value / (1 + dayPct / 100);
    if(Number.isFinite(dayBaseValue)) dayPnl = value - dayBaseValue;
  }
  return { ...h, invested, value, pnl, pct: pctValue, currency:holdingCalcCurrency(card), dayPct:Number.isFinite(dayPct) ? dayPct : null, dayPnl, dayBaseValue };
}
function holdingCalcCurrency(card){
  const market = String(card?.market || '').toUpperCase();
  const key = String(card?.key || '');
  const source = String(card?.source || '').toLowerCase();
  const unit = String(card?.priceUnit || '');
  if(unit === '원' || source.includes('upbit') || source.includes('krw')) return 'KRW';
  if(market === 'KR' && key !== 'BTC(USD)') return 'KRW';
  if(market === 'US' || market === 'COIN' || key.includes('(USD)') || source.includes('binance') || source.includes('yahoo')) return 'USD';
  return 'KRW';
}
function holdingPnlDisplayMode(){
  return holdingPnlMode === 'daily' ? 'daily' : 'total';
}
function holdingModeMetric(calc){
  if(holdingPnlDisplayMode() === 'daily'){
    return {
      mode:'daily',
      label:'일일',
      pnl:calc.dayPnl,
      pct:calc.dayPct,
      unavailable:calc.dayPnl === null || calc.dayPnl === undefined || !Number.isFinite(Number(calc.dayPnl)),
    };
  }
  return { mode:'total', label:'누적', pnl:calc.pnl, pct:calc.pct, unavailable:false };
}
function holdingAmountText(value, currency='KRW'){
  return currency === 'KRW' ? numKrw(value) : numUsd(value);
}
function holdingCurrencyMark(currency='KRW'){
  return currency === 'USD' ? '$' : '₩';
}
function numOne(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR', {maximumFractionDigits:1});
}
function pctOne(value){
  if(value===null||value===undefined||Number.isNaN(value)) return '-';
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  return `${n>0?'+':''}${n.toFixed(1)}%`;
}
function signedHoldingAmountText(value, currency='KRW'){
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  return `${n>=0?'+':'-'}${holdingCurrencyMark(currency)}${holdingAmountText(Math.abs(n), currency)}`;
}
function holdingSummaryMoneyText(value, currency='KRW'){
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  return `${n<0?'-':''}${holdingCurrencyMark(currency)}${holdingAmountText(Math.abs(n), currency)}`;
}
function holdingMoneyCellHtml(value, currency='KRW'){
  return `<span class="quote-price-currency" aria-hidden="true">${holdingCurrencyMark(currency)}</span><span>${esc(holdingAmountText(value, currency))}</span>`;
}
function signedHoldingSummaryMoneyText(value, currency='KRW'){
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  return `${n>=0?'+':'-'}${holdingCurrencyMark(currency)}${holdingAmountText(Math.abs(n), currency)}`;
}
function holdingLotMetaHtml(calc, index=0, total=1){
  const label = total > 1 ? `<span class="muted holding-lot-label">#${index + 1}</span>` : '';
  return `
    <span class="holding-meta-line">
      ${label}
      <span>수량 ${esc(num(calc.qty))}</span>
      <span class="muted">평단 ${esc(holdingSummaryMoneyText(calc.avg, calc.currency))}</span>
    </span>`;
}
function holdingModeToggleLabel(){
  return holdingPnlDisplayMode() === 'daily' ? '일일' : '누적';
}
function holdingLineHtml(calc){
  const metric = holdingModeMetric(calc);
  if(metric.unavailable){
    return `<span>-</span><span>${metric.label} 손익 -</span><span class="muted">평가액 ${holdingAmountText(calc.value, calc.currency)}</span><span class="muted">누적 ${signedHoldingAmountText(calc.pnl, calc.currency)}</span>`;
  }
  if(metric.mode === 'daily'){
    return `<span>${pct(metric.pct)}</span><span>일일 ${signedHoldingAmountText(metric.pnl, calc.currency)}</span><span class="muted">평가액 ${holdingAmountText(calc.value, calc.currency)}</span><span class="muted">누적 ${signedHoldingAmountText(calc.pnl, calc.currency)}</span>`;
  }
  return `<span>${pct(metric.pct)}</span><span>누적 ${signedHoldingAmountText(metric.pnl, calc.currency)}</span><span class="muted">평가액 ${holdingAmountText(calc.value, calc.currency)}</span><span class="muted">평단 ${holdingAmountText(calc.avg, calc.currency)} · 수량 ${num(calc.qty)}</span>`;
}
function holdingSummaryCurrency(card, fx){
  const market = String(card?.market || '').toUpperCase();
  const key = String(card?.key || '');
  const source = String(card?.source || '').toLowerCase();
  const unit = String(card?.priceUnit || '');
  if(unit === '원' || source.includes('upbit') || source.includes('krw')) return { currency:'KRW', factor:1, converted:false };
  if(market === 'KR' && key !== 'BTC(USD)') return { currency:'KRW', factor:1, converted:false };
  if(market === 'US' || market === 'COIN' || key.includes('(USD)') || source.includes('binance') || source.includes('yahoo')){
    return Number.isFinite(Number(fx)) && Number(fx) > 0
      ? { currency:'KRW', factor:Number(fx), converted:true }
      : { currency:'USD', factor:1, converted:false };
  }
  return { currency:'KRW', factor:1, converted:false };
}
function holdingSummary(cards){
  const fx = usdKrwRate();
  const currencies = new Set();
  let count = 0;
  let invested = 0;
  let value = 0;
  let dayPnl = 0;
  let dayBaseValue = 0;
  let dayCount = 0;
  let converted = 0;
  (cards || []).forEach((card)=>{
    const lots = holdingLotsFor(card);
    lots.forEach((lot)=>{
      const calc = holdingCalc(card, lot);
      if(!calc) return;
      const currency = holdingSummaryCurrency(card, fx);
      count += 1;
      invested += calc.invested * currency.factor;
      value += calc.value * currency.factor;
      if(Number.isFinite(Number(calc.dayPnl)) && Number.isFinite(Number(calc.dayBaseValue))){
        dayPnl += Number(calc.dayPnl) * currency.factor;
        dayBaseValue += Number(calc.dayBaseValue) * currency.factor;
        dayCount += 1;
      }
      if(currency.converted) converted += 1;
      currencies.add(currency.currency);
    });
  });
  if(!count || invested <= 0) return null;
  if(currencies.size > 1){
    return { count, mixed:true, valueText:'환율 확인 중', pctValue:null, pctText:'-', pnlText:'-', title:'원화/달러 보유가 섞여 있어 환율 확인 후 합계를 표시합니다.' };
  }
  const currency = Array.from(currencies)[0] || 'KRW';
  const pnl = value - invested;
  const pctValue = (value / invested - 1) * 100;
  const dailyAvailable = dayCount > 0 && dayBaseValue > 0;
  const valueText = holdingSummaryMoneyText(value, currency);
  const investedText = holdingSummaryMoneyText(invested, currency);
  const pnlText = signedHoldingSummaryMoneyText(pnl, currency);
  const dayPnlText = dailyAvailable ? signedHoldingSummaryMoneyText(dayPnl, currency) : '';
  const title = `보유 입력 ${count}건 · 현재가치 ${valueText} · 원금 ${investedText} · 누적 손익 ${pnlText}${dailyAvailable ? ` · 일일 손익 ${dayPnlText}` : ''}${converted ? ` · 원/달러 ${num(fx)}원 환산` : ''}`;
  return { count, mixed:false, value, invested, pnl, pctValue, pctText:pctOne(pctValue), valueText, pnlText, title, converted, modeLabel:'누적' };
}
function renderHoldingSummaryRow(cards, rowNo){
  const summary = holdingSummary(cards);
  if(!summary) return '';
  const klass = cls(summary.pctValue);
  const meta = summary.mixed ? '환율 확인 후 합계 표시' : `${summary.count}건 · 손익 ${summary.pnlText}`;
  const valueText = summary.mixed ? '-' : summary.valueText;
  return `
    <tr class="holding-row holding-summary-row" title="${esc(summary.title)}">
      <td class="rownum">${rowNo}</td>
      <td class="left holding-summary-merged-cell" colspan="3">
        <span class="holding-summary-content">
          <span class="holding-summary-title">내 보유 합계</span>
          <span class="holding-summary-meta">${esc(meta)}</span>
          <span class="holding-summary-value-label">현재가치</span>
          <span class="holding-summary-value">${esc(valueText)}</span>
          <span class="${klass} holding-summary-pct">${esc(summary.pctText)}</span>
        </span>
      </td>
    </tr>`;
}

function changeValueFor(card){
  if(changeWindow === '15') return card._min15;
  if(changeWindow === '30') return card._min30;
  return card.changePct;
}
function changeHeaderLabel(){
  if(changeWindow === '15') return '15분';
  if(changeWindow === '30') return '30분';
  return '일간';
}

function normalizeQuoteToken(token){
  const m=String(token || '').trim().match(/^(.+):(KR|US|COIN)$/i);
  if(!m) return '';
  return `${m[1].trim().toUpperCase()}:${m[2].toUpperCase()}`;
}

function coinSourceForMarket(market){
  return String(market || '').toUpperCase() === 'COIN' ? coinQuoteSource() : 'binance';
}

function coinSourceForFastQuoteCard(card){
  return coinSourceForMarket(card?.market);
}

function quoteRuntimeKey(token, coinSource='binance'){
  const normalized = normalizeQuoteToken(token);
  if(!normalized) return '';
  return `${normalized}|coin:${normalizeCoinQuoteSourceClient(coinSource)}`;
}

function quoteTokenForCard(card){
  if(!card || card._flows || card._momentum !== undefined || (card.sign && card.priceUnit)) return '';
  if(isRateOnlyCard(card.key)) return '';
  const token = card.userAdded && card.code
    ? `${card.code}:${card.market || ''}`
    : DEFAULT_QUOTE_TOKENS.get(cardOrderId(card));
  return normalizeQuoteToken(token);
}

function quoteFromSnapshotCard(card){
  if(!card) return null;
  const token=quoteTokenForCard(card);
  if(!token) return null;
  const [code, market] = token.split(':');
  return {
    ok:true,
    market:card.market || market,
    code:card.code || code,
    name:card.key,
    price:card.price,
    changePct:card.changePct,
    _min15:card._min15 ?? null,
    _min30:card._min30 ?? null,
    asOf:card.asOf,
    source:card.source,
    marketState:card.marketState,
    sessionTag:card.sessionTag || '',
  };
}

function snapshotQuoteByToken(snapshot=lastSnapshot){
  const map=new Map();
  (snapshot?.cards || []).forEach((card)=>{
    const token=quoteTokenForCard(card);
    const quote=quoteFromSnapshotCard(card);
    if(token && quote) map.set(quoteRuntimeKey(token, coinSourceForFastQuoteCard(card)), quote);
  });
  return map;
}

function mergeFastQuoteCard(card, quote){
  if(!quote || !quote.ok) return card;
  return {
    ...card,
    market: card.userAdded ? (quote.market || card.market) : card.market,
    code: card.userAdded ? (quote.code || card.code) : card.code,
    key: card.userAdded ? (quote.name || card.key) : card.key,
    price: quote.price,
    priceUnit: quote.priceUnit || '',
    changePct: quote.changePct,
    _min15: quote._min15 ?? null,
    _min30: quote._min30 ?? null,
    asOf: quote.asOf || card.asOf,
    source: quote.source || card.source,
    marketState: quote.marketState || card.marketState,
    sessionTag: quote.sessionTag || '',
    error: false,
  };
}

/* 카드 staleness 판정 — session + marketState 결합.
   KR 카드: KR_* session 이 아니면 stale.
   US 카드: yahoo marketState 가 CLOSED/그외 + session 이 US_* 아니면 stale.
            marketState 가 PRE/POST 이면 live (배지로 표기), REGULAR 면 live.    */
function getCardLiveState(card, session){
  const m=(card.market||'').toUpperCase();
  const ms=(card.marketState||'').toUpperCase();
  const src=String(card.source||'');
  if(isAlwaysLiveCard(card)) return {state:'live'};
  if(m==='KR'){
    if(sessionHas(session,'KR_PRE')){
      if(src.includes('NXT')) return {state:'pre'};
      if(String(card.sessionTag || '') === '프리') return {state:'pre'};
      return {state:'closed'};
    }
    if(sessionHas(session,'KR_AFTER')){
      if(src.includes('NXT')) return {state:'post'};
      return {state:'closed'};
    }
    if(src.includes('NXT')) return {state:'closed'};
    if(sessionHas(session,'KR_REG')) return {state:'live'};
    return {state:'closed'};
  }
  if(m==='US'){
    const inPre=sessionHas(session,'US_PRE');
    const inAfter=sessionHas(session,'US_AFTER');
    const inRegular=sessionHas(session,'US_REG');
    const inDay=sessionHas(session,'US_DAY');
    if(inDay) return {state:'day'};
    if(ms==='PRE' && inPre) return {state:'pre'};
    if((ms==='POST'||ms==='POSTPOST') && inAfter) return {state:'post'};
    if(ms==='REGULAR' && inRegular) return {state:'live'};
    // marketState 없거나 CLOSED — session 기반 fallback
    if(inPre) return {state:'pre'};
    if(inAfter) return {state:'post'};
    if(inRegular) return {state:'live'};
    return {state:'closed'};
  }
  return {state:'live'};
}

function liveBadgeHtml(card, session){
  const s=getCardLiveState(card, session);
  if(s.state==='day') return `<span class="market-state day" title="미장 데이마켓 차트 연결">데이</span>`;
  if(s.state==='pre') return `<span class="market-state pre" title="프리장 시세">프리</span>`;
  if(s.state==='post') return `<span class="market-state post" title="애프터마켓 시세">애프터</span>`;
  if(s.state==='closed') return `<span class="stale-icon" title="마지막 거래/마감 시세"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>`;
  return '';
}

function compactSourceLabel(card){
  const market=String(card.market || '').toUpperCase();
  const src=String(card.source || '-').trim();
  if(market==='KR'){
    if(src.includes('NXT')) return 'NXT';
    if(src.includes('Naver')) return 'Naver';
    return src.replace(/^KR\s*[·-]\s*/i, '') || '-';
  }
  if(market==='US'){
    if(src.includes('Yahoo')) return 'Yahoo';
    if(src.includes('eSignal')) return 'eSignal';
    return src.replace(/^US\s*[·-]\s*/i, '') || '-';
  }
  if(market==='COIN'){
    if(src.includes('Upbit') && src.includes('Binance')) return 'Upbit/Binance';
    if(src.includes('Binance')) return 'Binance';
    if(src.includes('Upbit')) return 'Upbit';
    return src || '-';
  }
  if(market && src && src !== '-') return `${market} · ${src}`;
  return src || '-';
}
function sourcePillHtml(card){
  const title=`${card.market||''} ${card.source||'-'} · ${fmtDt(card.asOf)}`.trim();
  return `<span class="source-pill" title="${esc(title)}">${esc(compactSourceLabel(card))}</span>`;
}

const US_KRW_DISPLAY_EXCLUDED_KEYS = new Set([
  '나스닥 선물','나스닥','S&P500','다우','원/달러','BTC(USD)','김프(%)','코스피야선',
  '미장 15분 변동','미장 30분 변동',
]);
function usdKrwRate(snapshot=lastSnapshot){
  const card=(snapshot?.cards || []).find((item)=>item?.key === '원/달러' && Number.isFinite(Number(item.price)));
  const rate=Number(card?.price);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
function numKrw(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR', {maximumFractionDigits:0});
}
function numUsd(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR', {maximumFractionDigits:2});
}
function displayPriceUnit(card){
  const unit = String(card?.priceUnit || '');
  if(String(card?.market || '').toUpperCase() === 'COIN' && unit === '원') return '';
  return unit;
}
function shouldRenderUsPriceInKrw(card){
  if(!usKrwDisplayEnabled()) return false;
  if(!['US','ALL'].includes(String(currentRenderedMarket || '').toUpperCase())) return false;
  if(String(card?.market || '').toUpperCase() !== 'US') return false;
  if(US_KRW_DISPLAY_EXCLUDED_KEYS.has(card?.key)) return false;
  if(card?.priceUnit) return false;
  if(!Number.isFinite(Number(card?.price))) return false;
  return Number.isFinite(Number(usdKrwRate()));
}
function cardPriceDisplayText(card){
  if(card?.price === null || card?.price === undefined || Number.isNaN(Number(card?.price))) return '';
  if(shouldRenderUsPriceInKrw(card)){
    return `₩${numKrw(Number(card.price) * Number(usdKrwRate()))}`;
  }
  const suffix = displayPriceUnit(card) || (isRateOnlyCard(card.key) ? '%' : '');
  const currency = priceCellCurrencyMark(card);
  const valueText = currency === '$' ? numUsd(card.price) : num(card.price);
  return `${valueText}${suffix}`;
}
// 현재가 셀 좌측에 고정되는 통화 표시 ($ / ₩). priceUnit suffix 가 있는 카드 (수급·환율·%
// 등) 와 rate-only 카드, 이미 ₩ 으로 환산되는 카드는 prefix 를 붙이지 않는다.
// key 패턴 (예: BTC(USD), BTC(KRW), 원/달러) 이 가장 신뢰할 수 있는 통화 단서라
// market 분류보다 우선 적용한다 (같은 카드가 여러 시트에 다른 market 으로 보여도 일관).
function priceCellCurrencyMark(card){
  if(!card) return '';
  if(card.priceUnit) return '';
  if(isIndexLikeCard(card)) return '';
  const key = String(card.key || '');
  if(isRateOnlyCard(key)) return '';
  if(shouldRenderUsPriceInKrw(card)) return '';
  if(/\(USD\)|\bUSD\b/.test(key)) return '$';
  if(/\(KRW\)|\bKRW\b/.test(key)) return '₩';
  if(key === '원/달러') return '₩';  // 1 USD = N KRW → 가격은 KRW
  if(key === '달러/원') return '$';
  const source = String(card?.source || '').toLowerCase();
  const market = String(card.market || '').toUpperCase();
  if(market === 'US') return '$';
  if(market === 'KR'){
    // KR sheet 의 환율·코인 듀얼 카드 안전망 — source 에 USD/Binance 가 들어가면 $ 우선.
    if(source.includes('binance') && !source.includes('upbit')) return '$';
    return '₩';
  }
  if(market === 'COIN'){
    if(source.includes('upbit') || source.includes('krw')) return '₩';
    if(source.includes('binance') || source.includes('usd')) return '$';
    return coinQuoteSource() === 'upbit' ? '₩' : '$';
  }
  return '';
}
function cardPriceDisplayHtml(card){
  if(card?.price === null || card?.price === undefined || Number.isNaN(Number(card?.price))){
    return '<span class="flat">조회 실패</span>';
  }
  if(shouldRenderUsPriceInKrw(card)){
    const usd=Number(card.price);
    const fx=Number(usdKrwRate());
    return `<span class="quote-price-currency" aria-hidden="true">₩</span><span title="$${esc(numUsd(usd))} · 환율 ${esc(num(fx))}원">${esc(numKrw(usd * fx))}</span>`;
  }
  const suffix = displayPriceUnit(card);
  const currency = priceCellCurrencyMark(card);
  const currencyHtml = currency ? `<span class="quote-price-currency" aria-hidden="true">${currency}</span>` : '';
  const valueText = currency === '$' ? numUsd(card.price) : num(card.price);
  return `${currencyHtml}${esc(valueText)}${suffix ? esc(suffix) : ''}`;
}

function changeAmountDisplayText(card, changePctValue=card?.changePct){
  if(!card || card.sign || card._flows || card._momentum !== undefined) return '';
  if(isRateOnlyCard(card.key)) return '';
  if(String(card.key || '').includes('채 10년') || String(card.source || '').toLowerCase().includes('bond')) return '';
  if(displayPriceUnit(card) === '%') return '';
  const price = Number(card.price);
  const pctValue = Number(changePctValue);
  if(!Number.isFinite(price) || !Number.isFinite(pctValue) || pctValue <= -99.99) return '';
  const prev = price / (1 + pctValue / 100);
  let delta = price - prev;
  if(!Number.isFinite(delta)) return '';
  let prefix = priceCellCurrencyMark(card);
  let suffix = displayPriceUnit(card);
  if(shouldRenderUsPriceInKrw(card)){
    const fx = Number(usdKrwRate());
    if(Number.isFinite(fx) && fx > 0){
      delta *= fx;
      prefix = '₩';
      suffix = '';
    }
  }else if(!prefix && String(card.market || '').toUpperCase() === 'KR' && !suffix){
    prefix = '₩';
  }else if(!prefix && suffix === '원'){
    prefix = '₩';
    suffix = '';
  }
  const absDelta = Math.abs(delta);
  const amount = prefix === '$'
    ? numUsd(absDelta)
    : (absDelta >= 1000 ? num(absDelta) : absDelta.toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
  return `${delta >= 0 ? '+' : '-'}${prefix}${amount}${suffix || ''}`;
}

function changeCellTitle(card, selectedChange){
  if(changeWindow !== 'day') return '';
  const amount = changeAmountDisplayText(card, card?.changePct ?? selectedChange);
  if(!amount) return '';
  return `일간 금액 변동 ${amount}`;
}

/* Quote table Ootlook preview helpers live in app-outlook-preview.js. */

function holdingInputValue(value){
  return value === undefined || value === null ? '' : String(value);
}

/* Quote table rendering lives in app-quote-table.js. */

function renderLoadingTable(kind='news'){
  const cols = kind==='summary' ? 4 : 6;
  const header = kind==='summary'
    ? `<tr><th class="rownum"></th><th class="colhead">A</th><th class="colhead">B</th><th class="colhead">C</th></tr>
       <tr><th class="rownum">1</th><th class="subhead">지표</th><th class="subhead">현재가</th><th class="subhead">변동률</th></tr>`
    : `<tr><th class="rownum"></th><th class="colhead">A</th><th class="colhead">B</th><th class="colhead">C</th><th class="colhead">D</th><th class="colhead">E</th></tr>
       <tr><th class="rownum">1</th><th class="subhead">시장</th><th class="subhead">시각</th><th class="subhead">헤드라인</th><th class="subhead">요약</th><th class="subhead">링크</th></tr>`;
  const rows = Array.from({length:5}, (_,i)=>`<tr class="loading-row"><td class="rownum">${i+2}</td><td colspan="${cols-1}">데이터 조회 중...</td></tr>`).join('');
  return header + rows;
}

function setLoading(active, text='시장 데이터를 불러오는 중...'){
  document.body.classList.toggle('busy', active);
  const box=document.getElementById('loadingToast');
  const label=document.getElementById('loadingText');
  if(label) label.textContent=text;
  if(box) box.classList.toggle('active', active);
  const status=document.getElementById('statusLeft');
  if(status && active) status.textContent='데이터 조회 중...';
}

function setSheetSwitchLoading(active, text='시트 불러오는 중...'){
  sheetSwitchLoading=!!active;
  const sheet=document.querySelector('.sheet.summary');
  if(sheet){
    sheet.classList.toggle('sheet-switch-loading', !!active);
    if(active) sheet.setAttribute('data-loading-text', text);
    else sheet.removeAttribute('data-loading-text');
  }
  const hint=document.getElementById('summaryHintText');
  if(hint && active) hint.textContent=text;
  const status=document.getElementById('statusLeft');
  if(status && active) status.textContent=text;
  if(!active) tickFreshness();
}

// 클라이언트에서 응답 헤더(x-excelkospi-cache)를 보고 캐시 적중률을 누적한다.
// 304 / edge / edge-304 / kv 는 HIT, origin* 는 MISS, 그 외(disabled/error 등)는 무시.
// 슬라이딩 윈도우 500개 유지 — 너무 많이 쌓이면 옛 트래픽이 지표를 묻어버린다.
const CACHE_STAT_WINDOW = 500;
const cacheStatWindow = [];
let cacheStatTotal = { hit:0, miss:0 };
function noteCacheOutcome(headerValue, status){
  const tag = String(headerValue || '').toLowerCase();
  let outcome = '';
  if(Number(status) === 304) outcome = 'hit';
  else if(/^(edge|kv)/.test(tag)) outcome = 'hit';
  else if(/^origin/.test(tag)) outcome = 'miss';
  if(!outcome) return;
  cacheStatWindow.push(outcome);
  cacheStatTotal[outcome] += 1;
  if(cacheStatWindow.length > CACHE_STAT_WINDOW){
    const drop = cacheStatWindow.shift();
    cacheStatTotal[drop] = Math.max(0, cacheStatTotal[drop] - 1);
  }
}
function clientCacheHitRate(){
  const total = cacheStatTotal.hit + cacheStatTotal.miss;
  if(total < 5) return null;
  return cacheStatTotal.hit / total;
}
function sleep(ms){
  return new Promise((resolve)=>setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
function fetchRetryDelayMs(attempt){
  return Math.min(900, 320 + Math.max(0, attempt) * 260);
}
function fetchMethodFromInit(init){
  return String(init?.method || 'GET').toUpperCase();
}
function canRetryFetch(url, init){
  const method=fetchMethodFromInit(init);
  if(method !== 'GET' && method !== 'HEAD') return false;
  if(init?.body != null) return false;
  let pathname=String(url || '');
  try{ pathname=new URL(apiUrl(pathname), location.href).pathname; }catch{}
  return /^\/api\/(?:snapshot|community|chat-messages|chat-config|timeline|quote|chart|presence)\b/.test(pathname);
}
function isRetryableFetchError(error){
  const msg=String(error?.message || error || '');
  if(error?.aborted) return false;
  if(error?.status && ![500,502,503,504].includes(Number(error.status))) return false;
  return /failed to fetch|networkerror|network error|load failed|api_fetch_failed/i.test(msg)
    || [500,502,503,504].includes(Number(error?.status || 0));
}
async function fetchJsonClient(url, timeoutMs=12000, init={}){
  const { returnMeta, retry, ...fetchInit } = init || {};
  const maxAttempts = Math.max(1, Number.isFinite(Number(retry)) ? Number(retry) : (canRetryFetch(url, fetchInit) ? 2 : 1));
  const requestUrl = apiUrl(url);
  let lastError=null;
  for(let attempt=0; attempt<maxAttempts; attempt++){
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), timeoutMs);
    try{
      const res = await fetch(requestUrl, {cache:'no-store', ...fetchInit, signal:controller.signal});
      noteCacheOutcome(res.headers.get('x-excelkospi-cache') || res.headers.get('x-quote-cache'), res.status);
      if(res.status === 304){
        const notModified = { __notModified:true };
        return returnMeta ? { data:notModified, status:304, headers:res.headers, notModified:true } : notModified;
      }
      if(!res.ok){
        let payload=null;
        try{ payload=await res.json(); }catch{}
        const detail=payload?.error || payload?.reason || '';
        const err=new Error(`${url} ${res.status}${detail ? ` ${detail}` : ''}`);
        err.status=res.status;
        err.payload=payload;
        throw err;
      }
      const data = await res.json();
      return returnMeta ? { data, status:res.status, headers:res.headers, notModified:false } : data;
    }catch(e){
      if(e && (e.name==='AbortError' || /aborted/i.test(String(e)))){
        const err=new Error(`timeout ${timeoutMs}ms: ${url}`);
        err.aborted=true;
        lastError=err;
      }else{
        lastError=e;
      }
      if(attempt < maxAttempts - 1 && isRetryableFetchError(lastError)){
        await sleep(fetchRetryDelayMs(attempt));
        continue;
      }
      throw lastError;
    }finally{
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error(`fetch failed: ${url}`);
}

function visitorId(){
  let id='';
  try{ id=localStorage.getItem(VISITOR_ID_KEY)||''; }catch{}
  if(!id){
    id=(crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    try{ localStorage.setItem(VISITOR_ID_KEY, id); persistSet(VISITOR_ID_KEY, id); }catch{}
  }
  return id;
}

/* 동접 표시
 *  - 사이트 접속자와 채팅을 실제로 열어둔 사람을 분리해서 표시한다.
 *  - 기본 경로는 Durable Object, 서비스 바인딩 장애 시 기존 KV 근사치로 fallback. */
let presenceState = { online: null, chatOnline: null, today: null, peakToday: null, onlineDirectAt: 0 };
const PRESENCE_DIRECT_FRESH_MS = 90 * 1000;
let presenceToggleIdx = 0;
let chatPresenceCount=0;
let chatOpenForPresence=false;
let chatPresencePingTimer=null;
let chatPollingSleeping=false;
function entryRefForPresence(){
  try{
    if(sessionStorage.getItem('referer_reported_v1')) return '';
    sessionStorage.setItem('referer_reported_v1', '1');
    return document.referrer || '';
  }catch{ return ''; }
}
function renderPresenceToggled(){
  const el = document.getElementById('presenceCount');
  if(!el) return;
  const items = [];
  if(Number.isFinite(presenceState.online)) items.push(`현재 접속 ${presenceState.online}명`);
  if(Number.isFinite(presenceState.today) && presenceState.today > 0){
    items.push(`오늘 ${presenceState.today.toLocaleString('ko-KR')}명`);
  }
  if(items.length === 0){ el.textContent = '현재 접속 -'; return; }
  el.textContent = items[presenceToggleIdx % items.length];
  presenceToggleIdx++;
}
setInterval(renderPresenceToggled, 5000);

function startChatPresencePing(){
  if(chatPresencePingTimer) return;
  chatPresencePingTimer=setTimeout(async ()=>{
    chatPresencePingTimer=null;
    if(chatOpenForPresence && !document.hidden) await pingPresence({force:true});
    if(chatOpenForPresence) startChatPresencePing();
  }, chatPresencePingIntervalMs());
}

function stopChatPresencePing(){
  if(chatPresencePingTimer){
    clearTimeout(chatPresencePingTimer);
    chatPresencePingTimer=null;
  }
}

function chatPresencePingIntervalMs(){
  const online=Number(presenceState.online);
  if(Number.isFinite(online) && online >= 1000) return CHAT_PRESENCE_PEAK_POLL_MS;
  if(Number.isFinite(online) && online >= CHAT_BUSY_POLL_ONLINE_THRESHOLD) return CHAT_PRESENCE_BUSY_POLL_MS;
  return CHAT_PRESENCE_POLL_MS;
}

function setChatPresenceOpen(open){
  const next=!!open;
  if(chatOpenForPresence===next && (next ? chatPresencePingTimer : !chatPresencePingTimer)) return;
  chatOpenForPresence=next;
  if(next) startChatPresencePing();
  else stopChatPresencePing();
  pingPresence({force:true});
}

async function pingPresence(options={}){
  if(STATIC_EXPORT) return;
  if(document.hidden && !options.force) return;
  try{
    const entryRef = entryRefForPresence();
    const p=await fetchJsonClient('/api/presence', 3000, {
      method:'POST',
      headers:{'content-type':'application/json'},
      keepalive: !!options.leaving,
      body:JSON.stringify({
        id:visitorId(),
        page_id: VISITOR_PAGE_ID,
        chat_open: !!chatOpenForPresence,
        leaving: !!options.leaving,
        ...(entryRef ? {entry_ref: entryRef} : {}),
      }),
    });
    if(typeof p.online==='number') {
      presenceState.online = p.online;
      presenceState.onlineDirectAt = Date.now();
      rescheduleChatIdleForPresence();
      renderChatStatus();
    }
    if(typeof p.chatOnline==='number') {
      presenceState.chatOnline = p.chatOnline;
      chatPresenceCount = p.chatOnline;
      renderChatStatus();
    }
    if(typeof p.today==='number' && p.today > 0) {
      presenceState.today = p.today;
    }
    if(typeof p.peakToday==='number' && p.peakToday > 0) {
      presenceState.peakToday = p.peakToday;
      updateServerStatusPeak(p.peakToday);
    }
    renderPresenceToggled();
  }catch{}
}

// snapshot 응답으로부터 presence 흡수
function absorbPresence(snap){
  if(!snap || !snap.presence) return;
  if(typeof snap.presence.online === 'number') {
    const hasFreshDirect = Date.now() - (presenceState.onlineDirectAt || 0) < PRESENCE_DIRECT_FRESH_MS;
    const snapshotIsLower = Number.isFinite(presenceState.online) && snap.presence.online < presenceState.online;
    if(!hasFreshDirect || !snapshotIsLower) {
      presenceState.online = snap.presence.online;
      rescheduleChatIdleForPresence();
      renderChatStatus();
    }
  }
  if(typeof snap.presence.chatOnline === 'number') {
    presenceState.chatOnline = snap.presence.chatOnline;
    chatPresenceCount = snap.presence.chatOnline;
    renderChatStatus();
  }
  if(typeof snap.presence.today === 'number') presenceState.today = snap.presence.today;
  if(typeof snap.presence.peakToday === 'number') {
    presenceState.peakToday = snap.presence.peakToday;
    updateServerStatusPeak(snap.presence.peakToday);
  }
  renderPresenceToggled();
}

function newsRowsFromTimeline(rows){
  const out=[];
  for(const r of rows || []){
    const news=(r.news||[]).filter(n=>n && n.title);
    if(news.length){
      news.forEach(n=>out.push({
        market:r.market,
        asOf:r.asOf,
        title:n.title,
        description:n.description || '',
        source:n.source || 'Google News',
        publishedAt:n.publishedAt || '',
        url:n.url || '',
      }));
    }
  }
  return out;
}

function newsTableLayout(){
  const compact = newsCompactLayout();
  const dataCols = compact ? 2 : 5;
  const header = compact ? `
    <colgroup>
      <col class="news-rownum-col">
      <col class="news-time-col">
      <col class="news-title-col">
    </colgroup>
    <tr>
      <th class="rownum"></th>
      <th class="colhead">A</th><th class="colhead">B</th>
    </tr>
    <tr>
      <th class="rownum">1</th>
      <th class="subhead">시각</th><th class="subhead">헤드라인</th>
    </tr>` : `
    <tr>
      <th class="rownum"></th>
      <th class="colhead">A</th><th class="colhead">B</th><th class="colhead">C</th><th class="colhead">D</th><th class="colhead">E</th>
    </tr>
    <tr>
      <th class="rownum">1</th>
      <th class="subhead">시장</th><th class="subhead">시각</th><th class="subhead">헤드라인</th><th class="subhead">요약</th><th class="subhead">링크</th>
    </tr>`;
  return { compact, dataCols, header };
}

function newsTableHeader(){
  return newsTableLayout().header;
}

function makeNewsLoadingEmptyRows(startIdx, count, cols){
  let out = '';
  for (let i=0; i<count; i++){
    const idx = startIdx + i;
    let tds = `<td class="rownum">${idx}</td>`;
    for (let c=0; c<cols; c++) tds += '<td>&nbsp;</td>';
    out += `<tr class="empty-row news-loading-empty-row">${tds}</tr>`;
  }
  return out;
}

function renderNewsFeedTable(rows){
  document.getElementById('timelineTable')?.classList.remove('community-table','etf-table');
  // 호환용: rows 가 timeline 형식이면 변환, 아니면 items 로 간주
  const items=Array.isArray(rows) && rows[0] && rows[0].news !== undefined
    ? newsRowsFromTimeline(rows)
    : (rows || []);
  const { compact, dataCols, header } = newsTableLayout();
  const EMPTY_TARGET = newsPadTarget();
  let rowNo = 2;
  const briefRow = typeof personalFeedRow === 'function' ? personalFeedRow(rowNo, dataCols) : '';
  if(briefRow) rowNo++;
  if(items.length===0){
    const emptyRowNo = rowNo++;
    const empties=makeEmptyRows(rowNo, Math.max(0, EMPTY_TARGET - (rowNo - 2)), dataCols);
    return header + briefRow + `<tr><td class="rownum">${emptyRowNo}</td><td colspan="${dataCols}" class="center flat">표시할 뉴스가 없습니다</td></tr>` + empties;
  }
  const personalKeys = personalNewsKeySet(items);
  const rowsHtml = items.map((n,i)=>{
    const currentRowNo = rowNo + i;
    const title=esc(n.title);
    const mobileMarket = compact ? `<span class="news-mobile-market">${esc(marketDisplayName(n.market)||'-')}</span>` : '';
    const titleHtml=n.url
      ? `<a class="news-title-link" href="${esc(n.url)}" target="_blank" rel="noopener">${mobileMarket}${title}</a>`
      : `<span class="news-title-link">${mobileMarket}${title}</span>`;
    const rel = relativeTimeKR(n.publishedAt);
    const desc = n.description && n.description.length >= 12
      ? esc(n.description)
      : `<span class="flat">${esc([rel, n.source].filter(Boolean).join(' · ')) || '—'}</span>`;
    const link=n.url
      ? `<a class="link-pill" href="${esc(n.url)}" target="_blank" rel="noopener">열기 ↗</a>`
      : `<span class="flat">-</span>`;
    const matchKey = newsKey(n);
    const matchCls = personalKeys.has(matchKey) ? ' is-personal-match' : '';
    const newCls = ` news-row${n._isNew ? ' is-new' : ''}${matchCls}`;
    const newsAttrs = matchKey ? ` data-news-key="${esc(matchKey)}"` : '';
    if(compact){
      return `<tr class="${newCls}"${newsAttrs}>
      <td class="rownum">${currentRowNo}</td>
      <td class="center time">${fmtTime(n.publishedAt || n.asOf)}</td>
      <td class="left">${titleHtml}</td>
    </tr>`;
    }
    return `<tr class="${newCls}"${newsAttrs}>
      <td class="rownum">${currentRowNo}</td>
      <td class="center">${esc(marketDisplayName(n.market)||'-')}</td>
      <td class="center time">${fmtTime(n.publishedAt || n.asOf)}</td>
      <td class="left">${titleHtml}</td>
      <td class="left news-desc">${desc}</td>
      <td class="center">${link}</td>
    </tr>`;
  }).join('');
  const startIdx=rowNo + items.length;
  const padCount=Math.max(0, EMPTY_TARGET - (startIdx - 2));
  const empties=makeEmptyRows(startIdx, padCount, dataCols);
  return header + briefRow + rowsHtml + empties;
}

/* ETF browser implementation lives in /assets/app-etf.js and is lazy-loaded on demand. */

/* Community/news-ad UI helpers live in /assets/community-ui.js. */

/* Excel-style cell selection lives in app-cell-selection.js. */

function watchlistItemsForMarket(list, market){
  const m=String(market||'').toUpperCase();
  if(m==='HOLDINGS') return list.filter((it)=>{
    const card = { userAdded:true, market:String(it.market || '').toUpperCase(), code:it.code, key:it.name || it.code };
    return holdingLotsFor(card).length > 0;
  });
  if(m==='ALL') return list.filter(it=>STOCK_MARKETS.has(String(it.market||'').toUpperCase()));
  if(m==='COIN') return list.filter(it=>String(it.market||'').toUpperCase()==='COIN');
  return list.filter(it=>String(it.market||'').toUpperCase()===m);
}

function quoteTableRowLimit(){
  const limit = (typeof WATCHLIST_TOTAL_ROW_LIMIT === 'number' && Number.isFinite(WATCHLIST_TOTAL_ROW_LIMIT))
    ? WATCHLIST_TOTAL_ROW_LIMIT
    : 100;
  return Math.max(1, Math.floor(limit));
}

function quoteBaseCountForMarket(market){
  if(!lastSnapshot?.cards) return 0;
  try{ return visibleCards(lastSnapshot.cards, market).length; }
  catch{ return 0; }
}

function userWatchlistSlotsForMarket(market, baseCount=quoteBaseCountForMarket(market)){
  return Math.max(0, quoteTableRowLimit() - Math.max(0, Number(baseCount) || 0));
}

function quoteLimitMarketsForItem(item){
  const market=String(item?.market || '').toUpperCase();
  if(STOCK_MARKETS.has(market)) return [market, 'ALL'];
  return market ? [market] : ['ALL'];
}

function watchlistLimitHitForItem(list, item){
  const candidate={ ...item, market:String(item?.market || '').toUpperCase() };
  const projected=(Array.isArray(list) ? list : []).concat(candidate);
  const limit=quoteTableRowLimit();
  for(const market of quoteLimitMarketsForItem(candidate)){
    const baseCount=quoteBaseCountForMarket(market);
    const userCount=watchlistItemsForMarket(projected, market).length;
    if(baseCount + userCount > limit){
      return { market, limit, baseCount, userCount, total:baseCount + userCount };
    }
  }
  return null;
}

function limitedUserWatchlistItemsForMarket(list, market, maxItems=Infinity){
  const items=watchlistItemsForMarket(list, market);
  const limit=Number(maxItems);
  if(!Number.isFinite(limit)) return items;
  return items.slice(0, Math.max(0, Math.floor(limit)));
}

async function fetchUserWatchlistCards(market='ALL', maxItems=Infinity){
  if(STATIC_EXPORT) return [];
  const allList=wlLoad();
  const list=limitedUserWatchlistItemsForMarket(allList, market, maxItems);
  if(list.length===0) return [];
  const snapshotQuotes=snapshotQuoteByToken(lastSnapshot);
  const quotes=new Array(list.length).fill(null);
  const missing=[];
  list.forEach((it, index)=>{
    const token=normalizeQuoteToken(`${it.code}:${it.market||'AUTO'}`);
    const source=coinSourceForMarket(it.market);
    const quote=snapshotQuotes.get(quoteRuntimeKey(token, source));
    if(quote) quotes[index]=quote;
    else missing.push({ it, index, coinSource:source });
  });
  const missingBySource=new Map();
  missing.forEach((item)=>{
    const source=normalizeCoinQuoteSourceClient(item.coinSource);
    if(!missingBySource.has(source)) missingBySource.set(source, []);
    missingBySource.get(source).push(item);
  });
  for(const [coinSource, sourceMissing] of missingBySource){
    const batchSize = Math.max(1, Number(typeof FAST_QUOTE_BATCH_SIZE === 'number' ? FAST_QUOTE_BATCH_SIZE : 30) || 30);
    for(let i=0; i<sourceMissing.length; i+=batchSize){
      const chunk=sourceMissing.slice(i, i+batchSize);
      const codes = chunk.map(({it}) => `${it.code}:${it.market||'AUTO'}`).join(',');
      let chunkQuotes;
      try{
        const r = await fetchJsonClient(quoteApiUrlForCodes(codes, coinSource), 8000);
        chunkQuotes = r && r.results ? r.results : null;
      }catch(_){ chunkQuotes = null; }
      if(!chunkQuotes){
        chunkQuotes = await Promise.all(chunk.map(({it})=>fetchQuote(it.code, it.market).catch(()=>null)));
      }
      chunk.forEach(({index}, offset)=>{
        quotes[index]=chunkQuotes?.[offset] || null;
      });
    }
  }
  const cards=[];
  let mutated=false;
  quotes.forEach((q,i)=>{
    const it=list[i];
    if(!q || !q.ok){
      cards.push({
        market: it.market, key: it.name||it.code,
        price: null, changePct: null, asOf: null, source: '?',
        userAdded: true, code: it.code, error: true,
      });
      return;
    }
    cards.push({
      market: q.market, key: q.name||q.code,
      price: q.price, changePct: q.changePct,
      _min15: q._min15 ?? null, _min30: q._min30 ?? null,
      asOf: q.asOf, source: q.source, priceUnit: q.priceUnit || '', marketState: q.marketState,
      userAdded: true, code: q.code,
    });
    // 종목명이 더 정확해졌으면 localStorage 동기화
    if(q.name && q.name!==it.name){
      it.name=q.name; mutated=true;
    }
  });
  if(mutated) wlSave(allList);
  return cards;
}

let lastLoadAt=null;
let lastQuoteLoadAt=null;
let lastSnapshotInfo={market:'AUTO', baseCount:0, userCount:0};
let currentRenderedMarket='AUTO';
let loadInFlight=false;
let loadQueuedOptions=null;
let sheetSwitchLoading=false;
let renderSnapshotSeq=0;
const USER_WATCHLIST_RENDER_TIMEOUT_MS=2600;
const USER_WATCHLIST_BACKGROUND_TIMEOUT_MS=12000;

function fmtElapsedSec(sec){
  if(sec<5) return '방금';
  if(sec<60) return `${sec}초 전`;
  const m=Math.floor(sec/60);
  if(m<60) return `${m}분 전`;
  const h=Math.floor(m/60);
  return `${h}시간 전`;
}

function fmtFutureSec(sec){
  if(sec<=3) return '곧';
  if(sec<60) return `${sec}초 후`;
  const m=Math.ceil(sec/60);
  if(m<60) return `${m}분 후`;
  const h=Math.ceil(m/60);
  return `${h}시간 후`;
}

function fmtRemainingSec(sec){
  if(sec<=3) return '곧';
  if(sec<60) return `${sec}초`;
  const m=Math.ceil(sec/60);
  if(m<60) return `${m}분`;
  const h=Math.ceil(m/60);
  return `${h}시간`;
}

function refreshCountdownText(label){
  return label === '곧' ? '곧' : `${label} 남음`;
}

function marketRefreshPausedForHoliday(snapshot=lastSnapshot){
  const session=String(snapshot?.session || '');
  const label=String(snapshot?.sessionLabel || '');
  return session === 'WEEKEND' || /휴장|주말/.test(label);
}

function summaryUsesFastQuoteRefresh(){
  if(!featureEnabled('fastQuote') || !lastRenderedCards.length) return false;
  return fastQuoteTargets().some((target)=>!shouldUseSnapshotFastQuote(target));
}

function summaryRefreshClock(){
  if(summaryUsesFastQuoteRefresh()){
    return {
      anchor:lastQuoteLoadAt || lastLoadAt,
      interval:fastQuoteIntervalMs(lastSnapshot),
      stale:Math.max(fastQuoteIntervalMs(lastSnapshot) * 2.5, 90 * 1000),
    };
  }
  return {
    anchor:lastLoadAt,
    interval:lastSnapshot ? pollProfile(lastSnapshot).snapshot : QUOTE_REFRESH_MS,
    stale:lastSnapshot ? pollProfile(lastSnapshot).stale : 90 * 1000,
  };
}

function refreshCadenceHint(){
  // 시세창 우측 상단에 노출되던 '빠른 갱신' / 'N초 간격 갱신' 문구는 너무 잡스럽다는
  // 피드백이 있어 비워둔다. 서버 상태판(공지 패널 펼침)에 동일 정보가 남아 있다.
  return '';
}

function tickFreshness(){
  if(!lastLoadAt) return;
  if(sheetSwitchLoading){
    const el=document.getElementById('summaryHintText');
    if(el) el.textContent='시트 불러오는 중...';
    return;
  }
  const clock=summaryRefreshClock();
  const anchor=clock.anchor || lastLoadAt;
  const elapsedMs=Date.now()-anchor;
  const sec=Math.floor(elapsedMs/1000);
  const intervalMs=clock.interval || QUOTE_REFRESH_MS;
  const refreshStalled=summaryUsesFastQuoteRefresh() && elapsedMs > intervalMs + 6000;
  const remainSec=Math.max(0, Math.ceil((intervalMs - elapsedMs)/1000));
  const nextLabel=fmtRemainingSec(remainSec);
  const m=lastSnapshotInfo.market;
  const refreshText=marketRefreshPausedForHoliday()
    ? '갱신 중단(휴장)'
    : (refreshStalled ? '확인 중' : refreshCountdownText(nextLabel));
  const loadHint=refreshCadenceHint();
  const txt=`${marketDisplayName(m)} · ${refreshText}${loadHint}`;
  const el=document.getElementById('summaryHintText');
  if(el) el.textContent=txt;
  // 세션별 폴링 간격보다 오래 멈추면 dot 회색.
  const dot=document.getElementById('summaryLiveDot');
  if(dot) dot.classList.toggle('stale', sec * 1000 >= clock.stale);
  updateServerStatusClock();
}

/* ============================================================
   부분 로딩 모델:
   - loadSnapshot()  : 세션/혼잡도별 간격으로 시세/카드만 갱신
   - loadNews()      : 세션/혼잡도별 간격으로 뉴스만 별도 fetch + 누적 머지
                       - 새 기사만 상단 추가, .is-new 4초 노란 강조
                       - 누적 capped 80건 (FIFO drop)
   - 탭 변경 시      : 누적 list 는 유지, 즉시 양쪽 다 갱신
   ============================================================ */

let lastSnapshot=null;
let snapshotConsecutiveFailures=0;
let lastRenderedCards=[];
let fastQuoteTimer=null;
let fastQuoteInFlight=false;
let pendingQuoteNoteFocusId = '';
const DEFAULT_FEATURE_FLAGS_CLIENT={fastQuote:true, chart:true, community:true, news:true, degraded:false};
let featureFlags={...DEFAULT_FEATURE_FLAGS_CLIENT};
let pollHint={};
let serverStatusState=null;
let serverStatusExpanded=false;
const HIDDEN_KEYS_STORE = 'kg_hidden_default_v1';
const PERSIST_KEYS = [WATCHLIST_KEY, QUOTE_NOTES_KEY, HOLDINGS_KEY, HOLDING_PNL_MODE_KEY, HIDDEN_KEYS_STORE, DEFAULT_ORDER_STORE, QUOTE_SORT_KEY, CHANGE_WINDOW_KEY, TIMELINE_TAB_KEY, COMMUNITY_CHANNEL_KEY, COMMUNITY_READ_STATE_KEY, COMMUNITY_POLL_VOTES_KEY, VIEW_KEY, FLOATING_HIDDEN_KEY, CHAT_NICK_KEY, COMMUNITY_NICK_KEY, CHAT_SIZE_KEY, CHAT_POSITION_KEY, CHAT_OPACITY_KEY, CHAT_DOCK_KEY, VISITOR_ID_KEY, FIRST_VISIT_KEY, HOLDING_TIP_KEY, CHANGE_WINDOW_TIP_KEY, CHART_TIP_KEY, TV_CHART_HEIGHT_KEY, SHEET_SPLIT_KEY, PANEL_ORDER_KEY, READABILITY_KEY, RIBBON_COLLAPSED_KEY, EXCEL_THEME_KEY, EXCEL_DARK_MODE_KEY, US_SHEET_KRW_KEY, COIN_QUOTE_SOURCE_KEY, UPDATES_SEEN_KEY, SETTINGS_WAKELOCK_KEY, SETTINGS_REMEMBER_MARKET_KEY];
const newsAccumulated=[];               // 평탄화된 누적 뉴스 (newest first)
const newsSeenKeys=new Set();           // url 또는 title 기준 dedup (KR/US 중복도 하나로 합침)

function friendlySnapshotErrorMessage(error){
  const raw = String(error?.message || error || '');
  if(error?.aborted || /timeout|abort/i.test(raw)){
    return '시세 응답이 잠시 늦어지고 있습니다. 곧 자동으로 다시 시도합니다.';
  }
  if(/before initialization|Cannot access|is not defined|undefined|null/i.test(raw)){
    return '일부 저장된 화면 정보를 정리하는 중입니다. 잠시 후 자동으로 다시 시도합니다.';
  }
  if(/Failed to fetch|NetworkError|Load failed|fetch/i.test(raw)){
    return '네트워크가 불안정해 시세를 불러오지 못했습니다. 잠시 후 다시 시도합니다.';
  }
  return '일시적으로 시세를 불러오지 못했습니다. 잠시 후 자동으로 다시 시도합니다.';
}

/* localStorage 뉴스 캐시 — cold start 빈 화면 방지.
 * 첫 진입 시 옛 뉴스 즉시 표시 후 백그라운드에서 fresh fetch. */
const NEWS_CACHE_KEY = 'kg_news_v2';
const NEWS_ETAG_PREFIX = 'kg_news_etag_v1:';
const TIMELINE_PAYLOAD_CACHE_PREFIX = 'kg_timeline_payload_v1:';
const NEWS_CACHE_TTL_MS = 60 * 60 * 1000;
const NEWS_MAX_INITIAL_AGE_MS = 18 * 60 * 60 * 1000;
function readNewsCache(){
  try{
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !Array.isArray(obj.items)) return null;
    if(Date.now() - obj.at > NEWS_CACHE_TTL_MS) return null;
    return obj.items.filter(isReadableFreshNews);
  }catch{return null;}
}
function writeNewsCache(items){
  try{
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({
      at: Date.now(),
      items: items.slice(0, 30).map(n => ({
        title:n.title, url:n.url, source:n.source, market:n.market,
        publishedAt:n.publishedAt, description:n.description,
      })),
    }));
  }catch{}
}
function newsEtagKey(market){
  return `${NEWS_ETAG_PREFIX}${String(market || 'ALL').toUpperCase()}`;
}
function readNewsEtag(market){
  try{ return localStorage.getItem(newsEtagKey(market)) || ''; }catch{ return ''; }
}
function writeNewsEtag(market, etag){
  if(!etag) return;
  try{ localStorage.setItem(newsEtagKey(market), etag); }catch{}
}
function timelinePayloadCacheKey(market){
  return `${TIMELINE_PAYLOAD_CACHE_PREFIX}${String(market || 'ALL').toUpperCase()}`;
}
function isTimelinePayload(value){
  return Array.isArray(value) && value.length > 0 && value.some((row)=>Array.isArray(row?.news) && row.news.length > 0);
}
function readTimelinePayloadCache(market, options={}){
  try{
    const raw = localStorage.getItem(timelinePayloadCacheKey(market));
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !isTimelinePayload(obj.data)) return null;
    if(Date.now() - Number(obj.at || 0) > NEWS_CACHE_TTL_MS && !options.allowStale) return null;
    return obj;
  }catch{return null;}
}
function writeTimelinePayloadCache(market, data, etag=''){
  if(!isTimelinePayload(data)) return;
  try{
    localStorage.setItem(timelinePayloadCacheKey(market), JSON.stringify({ at:Date.now(), data }));
    if(etag) writeNewsEtag(market, etag);
  }catch{}
}

function isLiveDataNews(n){ return n && n.source === 'Live Data'; }
function normalizedNewsTitle(n){ return String(n?.title || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function normalizedNewsUrl(n){
  try{
    const url = new URL(String(n?.url || ''));
    url.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','ocid','ref'].forEach((key)=>url.searchParams.delete(key));
    return url.toString().replace(/\/$/, '').toLowerCase();
  }catch{
    return String(n?.url || '').trim().replace(/\/$/, '').toLowerCase();
  }
}
function newsKey(n){ return isLiveDataNews(n) ? `${n.market}|Live Data` : (normalizedNewsTitle(n) || normalizedNewsUrl(n) || ''); }
function newsTitleSimilarity(a, b){
  const tok = (value)=>new Set(String(value || '').toLowerCase().split(/[\s,.\-–—|·'"“”‘’()[\]{}]+/).filter((token)=>token.length >= 2));
  const ta = tok(a);
  const tb = tok(b);
  if(!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((token)=>{ if(tb.has(token)) inter += 1; });
  return inter / (ta.size + tb.size - inter);
}
function hasDuplicateNews(item){
  if(!item || isLiveDataNews(item)) return false;
  const key = newsKey(item);
  if(key && newsSeenKeys.has(key)) return true;
  const title = normalizedNewsTitle(item);
  if(!title) return false;
  return newsAccumulated.some((existing)=>(
    !isLiveDataNews(existing)
    && newsTitleSimilarity(title, normalizedNewsTitle(existing)) >= 0.86
  ));
}
function newsTimeMs(n){
  const t=Date.parse(n?.publishedAt || n?.asOf || '');
  return Number.isFinite(t) ? t : 0;
}
function isReadableFreshNews(n, maxAge=NEWS_MAX_INITIAL_AGE_MS){
  // 예전 버전에서 뉴스가 비어 있을 때 만들던 시세 요약 행은 더 이상 뉴스로 보이지 않게 한다.
  if(isLiveDataNews(n)) return false;
  const t=newsTimeMs(n);
  if(!t) return false;
  const age=Date.now()-t;
  return age >= -15*60*1000 && age <= maxAge;
}
function sortNewsNewestFirst(){
  newsAccumulated.sort((a,b)=>{
    const byTime=newsTimeMs(b)-newsTimeMs(a);
    if(byTime) return byTime;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
  });
}

const SNAPSHOT_CACHE_KEY='kg_snapshot_v2';
const SNAPSHOT_ETAG_KEY='kg_snapshot_etag_v1';
const DEFAULT_SNAPSHOT_CACHE_TTL_MS=45 * 1000;
const KRX_HOLIDAYS_CLIENT = new Set([
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-03-02',
  '2026-05-01',
  '2026-05-05',
  '2026-05-25',
  '2026-06-06',
  '2026-08-15',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-10-03',
  '2026-10-09',
  '2026-12-25',
  '2026-12-31',
]);
const US_EQUITY_HOLIDAYS_CLIENT = new Set([
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25',
]);
function clearSnapshotMarketCaches(){
  try{
    localStorage.removeItem(SNAPSHOT_CACHE_KEY);
    localStorage.removeItem(SNAPSHOT_ETAG_KEY);
  }catch{}
  runtimeShared.snapshot=null;
  runtimeShared.quotesByToken.clear();
}
function sessionHasClient(session, part){ return String(session || '').includes(part); }
function localMarketParts(date=new Date(), timeZone='Asia/Seoul'){
  try{
    const parts=new Intl.DateTimeFormat('en-US', {
      timeZone,
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
      weekday:'short',
      hour:'2-digit',
      minute:'2-digit',
      hour12:false,
    }).formatToParts(date);
    const out={};
    parts.forEach((p)=>{ out[p.type]=p.value; });
    return {
      date: out.year && out.month && out.day ? `${out.year}-${out.month}-${out.day}` : '',
      weekday:out.weekday || '',
      hour:Number(out.hour === '24' ? 0 : out.hour),
      minute:Number(out.minute),
    };
  }catch{
    return null;
  }
}
function localMinute(parts){
  return Number(parts?.hour || 0) * 60 + Number(parts?.minute || 0);
}
function localWeekday(parts){
  return !!parts?.weekday && !['Sat','Sun'].includes(parts.weekday);
}
function addClientDateDays(dateText, days){
  if(!dateText) return '';
  const date = new Date(`${dateText}T00:00:00Z`);
  if(Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}
function isClientTradingDate(parts, holidays){
  return localWeekday(parts) && !!parts?.date && !holidays.has(parts.date);
}
function clientUsDaySessionTradeDate(parts){
  const weekday=parts?.weekday || '';
  const minute=localMinute(parts);
  if(minute >= 20 * 60 && ['Sun','Mon','Tue','Wed','Thu'].includes(weekday)){
    return addClientDateDays(parts?.date, 1);
  }
  if(minute < 4 * 60 && ['Mon','Tue','Wed','Thu','Fri'].includes(weekday)){
    return parts?.date || '';
  }
  return '';
}
function isUsDaySessionParts(parts){
  const tradeDate=clientUsDaySessionTradeDate(parts);
  return !!tradeDate && !US_EQUITY_HOLIDAYS_CLIENT.has(tradeDate);
}
function clientSessionParts(date=new Date()){
  const k=localMarketParts(date, 'Asia/Seoul');
  const n=localMarketParts(date, 'America/New_York');
  const km=localMinute(k);
  const nm=localMinute(n);
  const parts=[];
  if(isClientTradingDate(k, KRX_HOLIDAYS_CLIENT)){
    if(km >= 8 * 60 && km < 9 * 60) parts.push('KR_PRE');
    else if(km >= 9 * 60 && km <= 15 * 60 + 30) parts.push('KR_REG');
    else if(km > 15 * 60 + 30 && km < 20 * 60) parts.push('KR_AFTER');
  }
  if(isUsDaySessionParts(n)){
    parts.push('US_DAY');
  } else if(isClientTradingDate(n, US_EQUITY_HOLIDAYS_CLIENT)){
    if(nm >= 4 * 60 && nm < 9 * 60 + 30) parts.push('US_PRE');
    else if(nm >= 9 * 60 + 30 && nm < 16 * 60) parts.push('US_REG');
    else if(nm >= 16 * 60 && nm < 20 * 60) parts.push('US_AFTER');
  }
  return parts;
}
function clientSessionCode(date=new Date()){
  const parts=clientSessionParts(date);
  if(parts.length) return parts.join('_');
  const k=localMarketParts(date, 'Asia/Seoul');
  const n=localMarketParts(date, 'America/New_York');
  const krTradingDay=isClientTradingDate(k, KRX_HOLIDAYS_CLIENT);
  const usTradingDay=isClientTradingDate(n, US_EQUITY_HOLIDAYS_CLIENT);
  const usDayTradeDate=clientUsDaySessionTradeDate(n);
  const usDayTradingDay=!!usDayTradeDate && !US_EQUITY_HOLIDAYS_CLIENT.has(usDayTradeDate);
  if(!krTradingDay && !usTradingDay && !usDayTradingDay) return 'WEEKEND';
  return localWeekday(k) ? 'OFF' : 'WEEKEND';
}
function msUntilClientSessionChange(date=new Date(), maxHours=72){
  const current=clientSessionCode(date);
  const start=date.getTime();
  const stepMs=60 * 1000;
  const firstTick=Math.floor(start / stepMs) * stepMs + stepMs;
  const end=start + Math.max(1, Number(maxHours) || 72) * 60 * 60 * 1000;
  for(let tick=firstTick; tick<=end; tick+=stepMs){
    if(clientSessionCode(new Date(tick)) !== current) return Math.max(0, tick - start);
  }
  return null;
}
function snapshotConflictsWithLocalSession(snapshot){
  if(!isValidSnapshot(snapshot)) return false;
  const localParts=clientSessionParts();
  if(!localParts.length) return false;
  const session=String(snapshot.session || '');
  return localParts.some((part)=>!sessionHasClient(session, part));
}
function isValidSnapshot(s){
  return !!(
    s &&
    typeof s === 'object' &&
    typeof s.now === 'string' &&
    typeof s.session === 'string' &&
    typeof s.sessionLabel === 'string' &&
    Array.isArray(s.cards) &&
    s.cards.length >= 4
  );
}
function snapshotCoinSource(snapshot){
  return normalizeCoinQuoteSourceClient(snapshot?._meta?.coinSource || 'binance');
}
function snapshotMatchesClientSettings(snapshot){
  if(!isValidSnapshot(snapshot)) return false;
  return snapshotCoinSource(snapshot) === coinQuoteSource();
}
function featureEnabled(name){
  return featureFlags?.[name] !== false;
}
function pollScale(){
  return featureFlags?.degraded ? 2 : 1;
}
function scaleMs(value){
  return Math.round(Number(value || 0) * pollScale());
}
function applyFeatureFlags(flags){
  if(!flags || typeof flags !== 'object') return;
  featureFlags={...DEFAULT_FEATURE_FLAGS_CLIENT, ...flags};
  if(!featureEnabled('fastQuote')) clearFastQuoteTimer();
  if(!featureEnabled('news') && newsTimer){
    clearTimeout(newsTimer);
    newsTimer=null;
    nextNewsAt=null;
  }
  if(!featureEnabled('community')) clearCommunityRefresh();
  updateNewsHint();
}
function applyPollHint(hint){
  if(!hint || typeof hint !== 'object') return;
  const next={};
  ['snapshot','timeline','fastQuote','community','chatMessages'].forEach((key)=>{
    const value=Number(hint[key]);
    if(Number.isFinite(value) && value > 0) next[key]=value;
  });
  pollHint=next;
}
function hintedMs(key, fallback){
  const hinted=Number(pollHint?.[key]);
  return Number.isFinite(hinted) && hinted > 0 ? hinted : fallback;
}
function basePollIntervals(snapshot=lastSnapshot){
  const kind=pollProfileKind(snapshot);
  if(kind==='weekend') return {
    snapshot: scaleMs(60 * 60 * 1000),
    timeline: scaleMs(15 * 60 * 1000),
    fastQuote: scaleMs(FAST_QUOTE_WEEKEND_MS),
    community: scaleMs(COMMUNITY_REFRESH_MS),
    chatMessages: scaleMs(CHAT_OPEN_POLL_MS),
  };
  if(kind==='regular') return {
    snapshot: scaleMs(60 * 1000),
    timeline: scaleMs(8 * 60 * 1000),
    fastQuote: scaleMs(FAST_QUOTE_REGULAR_MS),
    community: scaleMs(COMMUNITY_REFRESH_MS),
    chatMessages: scaleMs(CHAT_OPEN_POLL_MS),
  };
  return {
    snapshot: scaleMs(2 * 60 * 1000),
    timeline: scaleMs(8 * 60 * 1000),
    fastQuote: scaleMs(FAST_QUOTE_EXTENDED_MS),
    community: scaleMs(COMMUNITY_REFRESH_MS),
    chatMessages: scaleMs(CHAT_OPEN_POLL_MS),
  };
}
function pollHintActive(){
  const base=basePollIntervals();
  return ['snapshot','timeline','fastQuote','community','chatMessages'].some((key)=>(
    Number(pollHint?.[key]) > Number(base[key] || 0) * 1.1
  ));
}
function serverStatusHealthInfo(health){
  const map={
    ok:{label:'정상', cls:'ok'},
    busy:{label:'혼잡', cls:'busy'},
    degraded:{label:'절감 모드', cls:'degraded'},
    down:{label:'지연', cls:'down'},
  };
  return map[health] || map.ok;
}
function statusNumber(value){
  if(value == null || value === '') return '-';
  const n=Number(value);
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : '-';
}
function statusPeople(value){
  return value == null || value === '' ? '-' : `${statusNumber(value)}명`;
}
function statusMsLabel(ms){
  const n=Number(ms);
  if(!Number.isFinite(n) || n <= 0) return '-';
  if(n < 60 * 1000) return `${Math.round(n / 1000)}초`;
  const min=n / 60000;
  if(min < 60) return `${Math.round(min)}분`;
  return `${Math.round(min / 60)}시간`;
}
function statusBuiltAtMs(){
  const built=Number(serverStatusState?.builtAt);
  if(Number.isFinite(built) && built > 0) return built;
  return lastLoadAt || Date.now();
}
function statusBuiltAgeText(){
  const sec=Math.max(0, Math.floor((Date.now() - statusBuiltAtMs()) / 1000));
  return fmtElapsedSec(sec);
}
function statusDelayReasonText(){
  return '';
}
function statusNextSnapshotText(){
  if(marketRefreshPausedForHoliday()) return '갱신 멈춤(휴장일)';
  const interval=lastSnapshot ? pollProfile(lastSnapshot).snapshot : Number(serverStatusState?.pollHint?.snapshot || 0);
  const anchor=lastLoadAt || statusBuiltAtMs();
  const remain=Math.max(0, Math.ceil((Number(interval || 0) - (Date.now() - anchor)) / 1000));
  return fmtFutureSec(remain);
}
function statusSnapshotLineHtml(){
  if(marketRefreshPausedForHoliday()){
    return '전체 시세표 갱신: 휴장일이라 잠시 멈췄어요';
  }
  // 이 줄은 시트 전체(시세표·뉴스·세션·동접)를 한 번에 묶어 받아오는 주기.
  // 화면 위 가격은 더 짧게 따로 새로 받아오니, 별도 줄(보이는 종목 현재가)에서 표시.
  return '전체 시세표 갱신: <span id="serverStatusAge">' + statusBuiltAgeText() + '</span> 전에 받음<span id="serverStatusDelayReason"></span> · 다음 갱신까지 <span id="serverStatusNext">' + statusNextSnapshotText() + '</span>';
}
function kstDayKey(){
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function updateServerStatusPeak(online){
  if(online == null || online === '') return null;
  const n=Number(online);
  if(!Number.isFinite(n) || n < 0) return null;
  const day=kstDayKey();
  let peak=0;
  try{
    const raw=JSON.parse(localStorage.getItem(SERVER_STATUS_PEAK_KEY) || 'null');
    if(raw?.day === day) peak=Number(raw.peak) || 0;
  }catch{}
  peak=Math.max(peak, n);
  try{ localStorage.setItem(SERVER_STATUS_PEAK_KEY, JSON.stringify({day, peak})); }catch{}
  return peak;
}
function readServerStatusPeak(){
  try{
    const raw=JSON.parse(localStorage.getItem(SERVER_STATUS_PEAK_KEY) || 'null');
    return raw?.day === kstDayKey() ? Number(raw.peak) || null : null;
  }catch{ return null; }
}
function apiCondition(item){
  const ok=Number(item?.ok) || 0;
  const fail=Number(item?.fail) || 0;
  const total=ok+fail;
  if(!total) return '대기';
  const rate=fail/total;
  if(rate > 0.5) return '지연';
  if(rate > 0.1) return '느려짐';
  return '정상';
}
function apiCountText(item){
  const ok=Number(item?.ok) || 0;
  const fail=Number(item?.fail) || 0;
  return `성공 ${statusNumber(ok)} · 실패 ${statusNumber(fail)}`;
}
function currentStatusFlags(){
  return {...DEFAULT_FEATURE_FLAGS_CLIENT, ...(serverStatusState?.flags || featureFlags || {})};
}
function currentStatusPollHint(){
  return {...basePollIntervals(), ...(serverStatusState?.pollHint || pollHint || {})};
}
function normalizeServerStatus(snapshot){
  const raw=snapshot?._status || {};
  const flags={...DEFAULT_FEATURE_FLAGS_CLIENT, ...(raw.flags || snapshot?.flags || featureFlags || {})};
  const hint=raw.pollHint || snapshot?.pollHint || pollHint || {};
  const externalApi=raw.externalApi || {};
  const onlineRaw=raw.online ?? snapshot?.presence?.online;
  const online=onlineRaw == null ? null : (Number.isFinite(Number(onlineRaw)) ? Number(onlineRaw) : null);
  const peakRaw=raw.peakToday ?? snapshot?.presence?.peakToday ?? presenceState.peakToday;
  const peakToday=peakRaw == null ? null : (Number.isFinite(Number(peakRaw)) ? Number(peakRaw) : null);
  const apiTotals=Object.values(externalApi).reduce((acc, item)=>({
    ok:acc.ok + (Number(item?.ok) || 0),
    fail:acc.fail + (Number(item?.fail) || 0),
  }), {ok:0, fail:0});
  const total=apiTotals.ok + apiTotals.fail;
  const failRate=total ? apiTotals.fail / total : 0;
  let health=raw.health;
  if(!health){
    if(flags.degraded) health='degraded';
    else if(failRate > 0.5) health='down';
    else if(failRate > 0.1 || (online != null && online > 1000)) health='busy';
    else health='ok';
  }
  return {
    health,
    online,
    peakToday,
    externalApi,
    pollHint:hint,
    flags,
    builtAt:Number(raw.builtAt) || Date.parse(snapshot?.now || '') || Date.now(),
    cacheHitRate:Number.isFinite(Number(raw.cacheHitRate)) ? Number(raw.cacheHitRate) : null,
  };
}
function serverStatusReducedFeatures(flags=currentStatusFlags()){
  const names={
    fastQuote:'빠른 현재가 반영 일시 정지',
    chart:'차트 hover 일시 정지',
    community:'종목토론방 일시 정지',
    news:'뉴스 자동 갱신 일시 정지',
  };
  return Object.keys(names).filter((key)=>flags?.[key] === false).map((key)=>names[key]);
}
function serverStatusDetailHtml(){
  const status=serverStatusState || normalizeServerStatus(lastSnapshot);
  const flags={...DEFAULT_FEATURE_FLAGS_CLIENT, ...(status.flags || {})};
  const hint={...basePollIntervals(), ...(status.pollHint || {})};
  const peak=Number.isFinite(Number(status.peakToday)) ? Number(status.peakToday) : readServerStatusPeak();
  const admin=isInlineAdmin();
  const api=status.externalApi || {};
  const sources=[
    ['yahoo', '야후'],
    ['naver', '네이버'],
    ['binance', '바이낸스'],
  ];
  const apiText=sources.map(([key, label])=>`${label} ${apiCondition(api[key])}`).join(' · ');
  const counts=sources.map(([key, label])=>`<span>${label}: ${apiCountText(api[key])}</span>`).join('');
  const reduced=serverStatusReducedFeatures(flags);
  // 비관리자에게는 "모든 기능 정상" 같은 fluff 안 보여줌. 조정 중일 때만 한 줄.
  const reducedLine=reduced.length
    ? `<div class="server-status-row server-status-features">${reduced.map((t)=>`<span>· ${t}</span>`).join('')}</div>`
    : (admin ? '<div class="server-status-row server-status-features server-status-debug"><span>· 모든 기능 정상</span></div>' : '');
  const busyLine=(flags.degraded || pollHintActive())
    ? `<div class="server-status-row server-status-warn">접속자가 많아 자동으로 갱신 간격을 늘려두었습니다 (아래 주기 표 참고)</div>`
    : '';
  // 클라이언트 측 cache 적중률 — 누구한테든 보여준다. 단, 데이터 누적 5건 이상일 때만.
  const hitRate=clientCacheHitRate();
  const cacheHitLine=hitRate == null
    ? ''
    : `<div class="server-status-row">캐시 적중률: ${Math.round(hitRate * 100)}% <span class="server-status-muted">(이번 방문 중 ${cacheStatTotal.hit + cacheStatTotal.miss}회 기준)</span></div>`;
  const fastQuoteLine=marketRefreshPausedForHoliday()
    ? ''
    : `<div class="server-status-row">보이는 종목 현재가: ${statusMsLabel(hint.fastQuote)} 간격 갱신</div>`;
  const newsLine=`<div class="server-status-row">뉴스·요약: ${statusMsLabel(hint.timeline)} 간격 갱신</div>`;
  const communityLine=`<div class="server-status-row">종목토론방: ${statusMsLabel(hint.community)} 간격 갱신</div>`;
  // 관리자 전용 — 디버그/카운트/플래그/액션
  const countsLine=admin && counts
    ? `<div class="server-status-row server-status-debug">외부 API 5분 집계: ${counts}</div>`
    : '';
  const flagsLine=admin
    ? `<div class="server-status-row server-status-debug">기능 플래그: ${Object.keys(flags).map((key)=>`${key} ${flags[key] ? 'on' : 'off'}`).join(' · ')}</div>`
    : '';
  const serverCacheLine=admin && status.cacheHitRate != null
    ? `<div class="server-status-row server-status-debug">서버 측 cache 적중률: ${Math.round(status.cacheHitRate * 100)}%</div>`
    : '';
  const adminLine=admin ? `<div class="server-status-admin">
      <strong>관리자 상태</strong>
      <div class="server-status-admin-counts">${counts || '<span>외부 API 카운트 대기</span>'}</div>
      <div class="server-status-flags">
        ${Object.keys(flags).map((key)=>`<span>${key}: ${flags[key] ? 'on' : 'off'}</span>`).join('')}
      </div>
      <div class="server-status-admin-actions">
        ${['fastQuote','chart','community','news'].map((key)=>`<button type="button" data-flag-toggle="${key}">${key} ${flags[key] ? '끄기' : '켜기'}</button>`).join('')}
      </div>
    </div>` : '';
  return `
    <div class="server-status-row">접속자: 현재 ${statusPeople(status.online)} / 오늘 피크 ${statusPeople(peak)}</div>
    <div class="server-status-row">${statusSnapshotLineHtml()}</div>
    <div class="server-status-row">외부 데이터 공급원: ${apiText}</div>
    ${fastQuoteLine}
    ${newsLine}
    ${communityLine}
    ${busyLine}
    ${reducedLine}
    ${cacheHitLine}
    ${countsLine}
    ${flagsLine}
    ${serverCacheLine}
    ${adminLine}
  `;
}
function updateServerStatusClock(){
  const summary=document.getElementById('serverStatusSummary');
  const status=serverStatusState || (lastSnapshot ? normalizeServerStatus(lastSnapshot) : null);
  const expanded=document.getElementById('serverStatusCard')?.dataset.expanded === 'true';
  if(!status){
    if(summary) {
      summary.textContent = expanded
        ? '현재 서버 상태: 확인 중 (접기)'
        : '현재 서버 상태: 확인 중 (클릭해서 자세히 보기)';
    }
    return;
  }
  const info=serverStatusHealthInfo(status.health);
  if(summary) {
    summary.textContent = expanded
      ? `현재 서버 상태: ${info.label} · 접속 ${statusPeople(status.online)} · ${marketRefreshPausedForHoliday() ? '렌더링 늦춤(휴장일)' : `렌더링 ${statusBuiltAgeText()}`} (접기)`
      : `현재 서버 상태: ${info.label} (클릭해서 자세히 보기)`;
  }
  const age=document.getElementById('serverStatusAge');
  if(age) age.textContent=statusBuiltAgeText();
  const reason=document.getElementById('serverStatusDelayReason');
  if(reason) reason.textContent=statusDelayReasonText();
  const next=document.getElementById('serverStatusNext');
  if(next) next.textContent=statusNextSnapshotText();
}
function renderServerStatus(){
  const card=document.getElementById('serverStatusCard');
  if(!card) return;
  const status=serverStatusState || (lastSnapshot ? normalizeServerStatus(lastSnapshot) : null);
  const info=serverStatusHealthInfo(status?.health);
  card.dataset.health=info.cls;
  const detail=document.getElementById('serverStatusDetail');
  if(detail) detail.innerHTML=serverStatusDetailHtml();
  card.dataset.expanded=serverStatusExpanded ? 'true' : 'false';
  if(detail) detail.hidden=!serverStatusExpanded;
  const toggle=card.querySelector('[data-server-status-toggle]');
  if(toggle) toggle.setAttribute('aria-expanded', serverStatusExpanded ? 'true' : 'false');
  updateServerStatusClock();
}
function setServerStatusExpanded(expanded){
  const card=document.getElementById('serverStatusCard');
  const detail=document.getElementById('serverStatusDetail');
  const toggle=card?.querySelector('[data-server-status-toggle]');
  if(!card || !detail) return;
  serverStatusExpanded=Boolean(expanded);
  card.dataset.expanded=serverStatusExpanded ? 'true' : 'false';
  detail.hidden=!serverStatusExpanded;
  if(toggle) toggle.setAttribute('aria-expanded', serverStatusExpanded ? 'true' : 'false');
  updateServerStatusClock();
}
function bindServerStatusControls(){
  const card=document.getElementById('serverStatusCard');
  if(!card || card.dataset.bound === 'true') return;
  card.dataset.bound='true';
  card.addEventListener('click', async (ev)=>{
    const flagBtn=ev.target?.closest?.('[data-flag-toggle]');
    if(flagBtn){
      ev.preventDefault();
      ev.stopPropagation();
      await toggleAdminFeatureFlag(flagBtn.dataset.flagToggle, flagBtn);
      return;
    }
    if(ev.target?.closest?.('[data-server-status-toggle]')){
      ev.preventDefault();
      setServerStatusExpanded(!serverStatusExpanded);
    }
  });
}
function bindDonationNoticeControls(){
  const card=document.getElementById('updatesDonationCard');
  if(!card || card.dataset.bound === 'true') return;
  card.dataset.bound='true';
  const toggle=card.querySelector('[data-updates-donation-toggle]');
  const detail=document.getElementById('updatesDonationDetail');
  const title=card.querySelector('.notice-card-title');
  toggle?.addEventListener('click', (ev)=>{
    ev.preventDefault();
    const expanded=card.dataset.expanded !== 'true';
    card.dataset.expanded=expanded ? 'true' : 'false';
    if(detail) detail.hidden=!expanded;
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if(title) title.innerHTML=expanded
      ? '만든사람 커피값 보내주기 <em>(접기)</em>'
      : '만든사람 커피값 보내주기 <em>(클릭해서 자세히 보기)</em>';
  });
}
async function toggleAdminFeatureFlag(key, btn){
  if(!Object.prototype.hasOwnProperty.call(DEFAULT_FEATURE_FLAGS_CLIENT, key)) return;
  const flags=currentStatusFlags();
  const nextValue=!(flags[key] !== false);
  try{
    setBusyButton(btn, true, nextValue ? '켜는중' : '끄는중');
    const data=await fetchInlineAdminJson('/api/admin/flags', { flags:{ [key]:nextValue } }, 7000);
    if(data?.flags){
      applyFeatureFlags(data.flags);
      serverStatusState={...(serverStatusState || normalizeServerStatus(lastSnapshot)), flags:{...DEFAULT_FEATURE_FLAGS_CLIENT, ...data.flags}};
      renderServerStatus();
    }
    showToast(`${key} ${nextValue ? '활성화' : '일시 정지'} 완료`, 'info');
  }catch(e){
    if(e?.status===401) setInlineAdminToken('', { silent:true });
    showToast(`기능 토글 실패: ${e.message || e}`, 'err');
  }finally{
    setBusyButton(btn, false);
  }
}
function applyServerStatus(snapshot){
  serverStatusState=normalizeServerStatus(snapshot);
  updateServerStatusPeak(serverStatusState.online);
  renderServerStatus();
}
function pollProfileKind(snapshot){
  const session = snapshot?.session || lastSnapshot?.session || '';
  if(session === 'WEEKEND') return 'weekend';
  if(sessionHasClient(session, 'KR_REG') || sessionHasClient(session, 'US_REG')) return 'regular';
  return 'extended';
}
function pollProfile(snapshot){
  const kind = pollProfileKind(snapshot);
  if(kind === 'weekend'){
    return {
      snapshot: hintedMs('snapshot', scaleMs(60 * 60 * 1000)),
      news: hintedMs('timeline', scaleMs(15 * 60 * 1000)),
      cache: scaleMs(55 * 60 * 1000),
      stale: scaleMs(70 * 60 * 1000),
    };
  }
  if(kind === 'regular'){
    return {
      snapshot: hintedMs('snapshot', scaleMs(60 * 1000)),
      news: hintedMs('timeline', scaleMs(8 * 60 * 1000)),
      cache: scaleMs(45 * 1000),
      stale: scaleMs(90 * 1000),
    };
  }
  return {
    snapshot: hintedMs('snapshot', scaleMs(2 * 60 * 1000)),
    news: hintedMs('timeline', scaleMs(8 * 60 * 1000)),
    cache: scaleMs(110 * 1000),
    stale: scaleMs(3.5 * 60 * 1000),
  };
}

function fastQuoteIntervalMs(snapshot){
  const kind = pollProfileKind(snapshot);
  if(kind === 'regular') return hintedMs('fastQuote', scaleMs(FAST_QUOTE_REGULAR_MS));
  if(kind === 'weekend') return hintedMs('fastQuote', scaleMs(FAST_QUOTE_WEEKEND_MS));
  return hintedMs('fastQuote', scaleMs(FAST_QUOTE_EXTENDED_MS));
}

function communityRefreshIntervalMs(){
  return hintedMs('community', scaleMs(COMMUNITY_REFRESH_MS));
}

function chatMessagesIntervalMs(){
  const online=Number(presenceState.online);
  const base = Number.isFinite(online) && online >= CHAT_BUSY_POLL_ONLINE_THRESHOLD
    ? CHAT_BUSY_OPEN_POLL_MS
    : CHAT_OPEN_POLL_MS;
  return hintedMs('chatMessages', scaleMs(base));
}
function chatRefreshStatusText(){
  return `${statusMsLabel(chatMessagesIntervalMs())}마다 새로고침`;
}

function fastQuoteJitterMs(){
  return FAST_QUOTE_JITTER_MIN_MS + Math.floor(Math.random() * (FAST_QUOTE_JITTER_MAX_MS - FAST_QUOTE_JITTER_MIN_MS + 1));
}

function clearFastQuoteTimer(){
  if(fastQuoteTimer){
    clearTimeout(fastQuoteTimer);
    fastQuoteTimer=null;
  }
}

function stopFastQuoteRefresh(){
  clearFastQuoteTimer();
}

function quoteRowsCurrentlyRendered(){
  const rows=new Map();
  const sheet=document.querySelector('.sheet.summary');
  const sheetRect=sheet?.getBoundingClientRect?.();
  const canFilterVisible=sheetRect && sheetRect.height > 0 && sheetRect.width > 0;
  const buffer=(typeof FAST_QUOTE_VISIBLE_BUFFER_PX === 'number' && Number.isFinite(FAST_QUOTE_VISIBLE_BUFFER_PX)) ? FAST_QUOTE_VISIBLE_BUFFER_PX : 720;
  document.querySelectorAll('#cardsTable tr[data-quote-id]').forEach((row)=>{
    const id=row.dataset.quoteId || '';
    if(canFilterVisible){
      const rect=row.getBoundingClientRect();
      if(rect.bottom < sheetRect.top - buffer || rect.top > sheetRect.bottom + buffer) return;
    }
    if(id) rows.set(id, row);
  });
  return rows;
}

function fastQuoteTargets(){
  const renderedRows=quoteRowsCurrentlyRendered();
  const byRuntimeKey=new Map();
  lastRenderedCards.forEach((card, index)=>{
    const token=quoteTokenForCard(card);
    if(!token || !renderedRows.has(token)) return;
    const coinSource=coinSourceForFastQuoteCard(card);
    const runtimeKey=quoteRuntimeKey(token, coinSource);
    if(!runtimeKey) return;
    if(!byRuntimeKey.has(runtimeKey)) byRuntimeKey.set(runtimeKey, { token, coinSource, indexes:[] });
    byRuntimeKey.get(runtimeKey).indexes.push(index);
  });
  return Array.from(byRuntimeKey.values());
}

function updateHoldingRowAfterFastQuote(row, card){
  const id=holdingId(card);
  const lots=holdingLotsFor(card);
  let holdingRow=row?.nextElementSibling;
  while(holdingRow?.classList?.contains('holding-row') && !holdingRow.classList.contains('holding-summary-row')){
    const nextRow=holdingRow.nextElementSibling;
    const lotId=holdingRow.dataset?.lotId || '';
    const lot=lots.find((item)=>item.lotId===lotId);
    if(lot && holdingRow.dataset?.holdingId===id && !holdingRow.classList.contains('holding-edit-row')){
      const index=lots.findIndex((item)=>item.lotId===lotId);
      const rowNo=holdingRow.querySelector?.('.rownum')?.textContent || '';
      const nextHtml=renderHoldingLotRow(card, rowNo, lot, Math.max(0, index), lots.length);
      if(nextHtml) holdingRow.outerHTML=nextHtml;
    }
    holdingRow=nextRow;
  }
}
function updateHoldingSummaryRow(){
  const row=document.querySelector('#cardsTable .holding-summary-row');
  if(!row) return;
  const rowNo=row.querySelector('.rownum')?.textContent || '';
  const next=renderHoldingSummaryRow(lastRenderedCards, rowNo);
  if(next) row.outerHTML=next;
  else row.remove();
}

function applyFastQuoteToRow(token, card){
  const row=quoteRowsCurrentlyRendered().get(token);
  if(!row) return;
  const {priceCell, changeCell, changeClass} = cardRenderedCells(card);
  const priceEl=row.querySelector('.quote-price-cell');
  if(priceEl) priceEl.innerHTML=priceCell;
  const changeEl=row.querySelector('.quote-change-cell');
  if(changeEl){
    changeEl.className=`right ${changeClass} quote-change-cell`;
    changeEl.innerHTML=changeCell;
  }
  const sourceEl=row.querySelector('.source-pill');
  if(sourceEl) sourceEl.outerHTML=sourcePillHtml(card);
  row.title=`${card.market||''} · ${card.source||'-'} · ${fmtDt(card.asOf)}`;
  updateHoldingRowAfterFastQuote(row, card);
}

function sheetSplitSupported(){
  try{
    if(document.body?.classList.contains('theme-outlook')) return false;
    return !!window.matchMedia?.('(min-width:1100px)').matches;
  }catch{
    return false;
  }
}

function sheetSplitThreePaneActive(){
  try{
    return chatDockActive() && !!window.matchMedia?.('(min-width:1600px)').matches;
  }catch{
    return false;
  }
}

function sheetSplitSummaryMin(){
  try{
    return window.matchMedia?.('(min-width:1500px)').matches ? SHEET_SPLIT_SUMMARY_WIDE_MIN_PX : SHEET_SPLIT_SUMMARY_MIN_PX;
  }catch{
    return SHEET_SPLIT_SUMMARY_MIN_PX;
  }
}

function readSheetSplitSizes(){
  try{
    const parsed=JSON.parse(localStorage.getItem(SHEET_SPLIT_KEY) || '{}');
    return {
      summary:Number(parsed.summary) || 0,
      chat:Number(parsed.chat) || 0,
    };
  }catch{
    return { summary:0, chat:0 };
  }
}

function writeSheetSplitSizes(sizes){
  try{
    const value=JSON.stringify({
      summary:Math.round(Number(sizes.summary) || 0),
      chat:Math.round(Number(sizes.chat) || 0),
    });
    localStorage.setItem(SHEET_SPLIT_KEY, value);
    persistSet(SHEET_SPLIT_KEY, value);
  }catch{}
}

function sheetSplitBounds(){
  const grid=document.querySelector('.sheets-grid');
  const rect=grid?.getBoundingClientRect?.();
  const width=Math.max(0, rect?.width || 0);
  const splitters=sheetSplitThreePaneActive() ? 16 : 8;
  const summaryMin=sheetSplitSummaryMin();
  const timelineMin=SHEET_SPLIT_TIMELINE_MIN_PX;
  const chatMin=sheetSplitThreePaneActive() ? SHEET_SPLIT_CHAT_MIN_PX : 0;
  const maxSummary=Math.max(summaryMin, width - timelineMin - chatMin - splitters);
  const maxChat=Math.max(chatMin, width - summaryMin - timelineMin - splitters);
  return { width, summaryMin, timelineMin, chatMin, maxSummary, maxChat };
}

function clampSheetSplitSizes(sizes={}){
  const bounds=sheetSplitBounds();
  const summaryValue=Number(sizes.summary) || 0;
  const chatValue=Number(sizes.chat) || 0;
  const summary=summaryValue
    ? Math.min(Math.max(summaryValue, bounds.summaryMin), bounds.maxSummary)
    : 0;
  const chat=chatValue
    ? Math.min(Math.max(chatValue, bounds.chatMin), bounds.maxChat)
    : 0;
  return { summary, chat };
}

function applySheetSplitLayout(options={}){
  const root=document.documentElement;
  if(!root) return;
  if(!sheetSplitSupported()){
    root.style.removeProperty('--summary-pane-width');
    root.style.removeProperty('--chat-pane-width');
    return;
  }
  const sizes=clampSheetSplitSizes(readSheetSplitSizes());
  if(sizes.summary) root.style.setProperty('--summary-pane-width', `${sizes.summary}px`);
  else root.style.removeProperty('--summary-pane-width');
  if(sheetSplitThreePaneActive() && sizes.chat) root.style.setProperty('--chat-pane-width', `${sizes.chat}px`);
  else root.style.removeProperty('--chat-pane-width');
  if(options.save) writeSheetSplitSizes(sizes);
  requestAnimationFrame(()=>updateChatDockWidth());
}

function startSheetSplitDrag(kind, ev){
  if(ev.button != null && ev.button !== 0) return;
  if(!sheetSplitSupported()) return;
  if(kind === 'chat' && !sheetSplitThreePaneActive()) return;
  const grid=document.querySelector('.sheets-grid');
  if(!grid) return;
  ev.preventDefault();
  const bounds=sheetSplitBounds();
  const current=clampSheetSplitSizes(readSheetSplitSizes());
  const summaryRect=document.querySelector('.col-summary')?.getBoundingClientRect?.();
  const chatRect=document.getElementById('chatDockColumn')?.getBoundingClientRect?.();
  const startSummary=current.summary || Math.round(summaryRect?.width || bounds.summaryMin);
  const startChat=current.chat || Math.round(chatRect?.width || bounds.chatMin);
  const gridRect=grid.getBoundingClientRect();
  const handle=ev.currentTarget;
  document.body?.classList.add('sheet-split-resizing');
  handle?.classList.add('is-active');
  try{ handle?.setPointerCapture?.(ev.pointerId); }catch{}
  // Direction depends on each panel's visual position relative to timeline.
  // Default order [summary, timeline, chat]: summary measured from left, chat from right.
  const panelOrder=readPanelOrder();
  const timelineIdx=panelOrder.indexOf('timeline');
  const summaryFromLeft=panelOrder.indexOf('summary')<timelineIdx;
  const chatFromLeft=panelOrder.indexOf('chat')<timelineIdx;
  const apply=(moveEv)=>{
    const next={ summary:startSummary, chat:startChat };
    if(kind === 'main'){
      const raw=summaryFromLeft
        ? moveEv.clientX - gridRect.left
        : gridRect.right - moveEv.clientX;
      next.summary = Math.min(Math.max(raw, bounds.summaryMin), bounds.maxSummary);
      const maxSummaryWithChat = sheetSplitThreePaneActive()
        ? Math.max(bounds.summaryMin, gridRect.width - (current.chat || startChat || bounds.chatMin) - bounds.timelineMin - 16)
        : bounds.maxSummary;
      next.summary = Math.min(next.summary, maxSummaryWithChat);
    }else{
      const raw=chatFromLeft
        ? moveEv.clientX - gridRect.left
        : gridRect.right - moveEv.clientX;
      next.chat = Math.min(Math.max(raw, bounds.chatMin), bounds.maxChat);
    }
    const clamped=clampSheetSplitSizes(next);
    if(clamped.summary) document.documentElement.style.setProperty('--summary-pane-width', `${clamped.summary}px`);
    if(sheetSplitThreePaneActive() && clamped.chat) document.documentElement.style.setProperty('--chat-pane-width', `${clamped.chat}px`);
    requestAnimationFrame(()=>updateChatDockWidth());
  };
  const finish=(doneEv)=>{
    document.body?.classList.remove('sheet-split-resizing');
    handle?.classList.remove('is-active');
    try{ handle?.releasePointerCapture?.(doneEv.pointerId); }catch{}
    const previous=readSheetSplitSizes();
    const summaryWidth=Math.round(document.querySelector('.col-summary')?.getBoundingClientRect?.().width || startSummary);
    const chatWidth=sheetSplitThreePaneActive()
      ? Math.round(document.getElementById('chatDockColumn')?.getBoundingClientRect?.().width || startChat)
      : previous.chat;
    writeSheetSplitSizes(clampSheetSplitSizes({ summary:summaryWidth, chat:chatWidth }));
    applySheetSplitLayout();
    window.removeEventListener('pointermove', apply);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
  };
  window.addEventListener('pointermove', apply);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}

function setupSheetSplitResize(){
  document.getElementById('mainPaneSplitter')?.addEventListener('pointerdown', (ev)=>startSheetSplitDrag('main', ev));
  document.getElementById('chatPaneSplitter')?.addEventListener('pointerdown', (ev)=>startSheetSplitDrag('chat', ev));
  applyPanelOrder(readPanelOrder());
  applySheetSplitLayout();
  setupPanelDragToReorder();
}

// === Panel column ordering ===

function readPanelOrder(){
  try{
    const saved=JSON.parse(localStorage.getItem(PANEL_ORDER_KEY)||'null');
    if(Array.isArray(saved) && saved.length===PANEL_IDS.length
       && PANEL_IDS.every(id=>saved.includes(id))){
      return saved;
    }
  }catch{}
  return [...PANEL_IDS];
}

function writePanelOrder(order){
  try{
    const v=JSON.stringify(order);
    localStorage.setItem(PANEL_ORDER_KEY, v);
    persistSet(PANEL_ORDER_KEY, v);
  }catch{}
}

function panelElementFor(id){
  if(id==='summary') return document.querySelector('.col-summary');
  if(id==='timeline') return document.querySelector('.col-timeline');
  if(id==='chat') return document.getElementById('chatDockColumn');
  return null;
}

// Maps a panel order [a,b,c] to CSS order values for both panels and splitters.
// Panel orders: 10, 30, 50 (positions 1/2/3). Splitters always sit on
// the timeline-facing side of summary (mainSplitter) and chat (chatSplitter).
function applyPanelOrder(order){
  const panelIdx={};
  order.forEach((id,idx)=>{ panelIdx[id]=idx; });
  ['summary','timeline','chat'].forEach(id=>{
    const el=panelElementFor(id);
    if(el) el.style.order=String((panelIdx[id]+1)*20);
  });
  const timelineIdx=panelIdx.timeline;
  const summaryIdx=panelIdx.summary;
  const chatIdx=panelIdx.chat;
  // mainSplitter sits on summary's timeline-facing side
  const mainSplitter=document.getElementById('mainPaneSplitter');
  if(mainSplitter){
    const summaryBase=(summaryIdx+1)*20;
    mainSplitter.style.order=String(summaryIdx<timelineIdx ? summaryBase+1 : summaryBase-1);
  }
  // chatSplitter sits on chat's timeline-facing side
  const chatSplitter=document.getElementById('chatPaneSplitter');
  if(chatSplitter){
    const chatBase=(chatIdx+1)*20;
    chatSplitter.style.order=String(chatIdx<timelineIdx ? chatBase+1 : chatBase-1);
  }
}

// Drag-to-reorder using pointer events (more reliable than HTML5 DnD).
const PANEL_DRAG_INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="button"]',
  '.change-toggle',
  '.timeline-tabs',
  '.chat-head-actions',
].join(',');

function panelDragTitleFor(id){
  if(id==='summary') return document.querySelector('.col-summary .sheet-title');
  if(id==='timeline') return document.querySelector('.col-timeline .sheet-title');
  if(id==='chat') return document.querySelector('#chatPanel .chat-head');
  return null;
}

function setupPanelDragToReorder(){
  if(!window.matchMedia?.('(min-width:1100px)').matches) return;
  PANEL_IDS.forEach(id=>{
    const title=panelDragTitleFor(id);
    if(!title || title.dataset.panelDragBound==='1') return;
    title.dataset.panelDragBound='1';
    title.dataset.panelDrag=id;
    title.classList.add('panel-drag-title');
    title.addEventListener('pointerdown', (ev)=>{
      if(ev.button!=null && ev.button!==0) return;
      if(ev.target?.closest?.(PANEL_DRAG_INTERACTIVE_SELECTOR)) return;
      const sourceCol=panelElementFor(id);
      if(!sourceCol || sourceCol.hidden) return;
      ev.preventDefault();
      ev.stopPropagation();
      startPanelDrag(id, title, ev);
    });
  });
}

function startPanelDrag(sourceId, dragTarget, ev){
  const sourceCol=panelElementFor(sourceId);
  if(!sourceCol) return;
  dragTarget.classList.add('is-grabbing');
  sourceCol.classList.add('is-panel-dragging');
  document.body?.classList.add('panel-drag-active');
  try{ dragTarget.setPointerCapture?.(ev.pointerId); }catch{}
  let currentTarget=null;
  let dropBefore=true;

  const clearDropMarkers=()=>{
    document.querySelectorAll('.col').forEach(c=>{
      c.classList.remove('is-panel-drop-before','is-panel-drop-after');
    });
  };

  const move=(mv)=>{
    // Use elementsFromPoint to bypass floating overlays (chat panel, toasts, etc).
    const stack=document.elementsFromPoint?.(mv.clientX, mv.clientY) || [document.elementFromPoint(mv.clientX, mv.clientY)];
    let targetCol=null;
    for(const el of stack){
      const col=el?.closest?.('.col');
      if(col && col!==sourceCol && !col.hidden && col.dataset.panelId){
        targetCol=col; break;
      }
    }
    if(!targetCol){
      clearDropMarkers();
      currentTarget=null;
      return;
    }
    const id=targetCol.dataset.panelId;
    if(!id || !PANEL_IDS.includes(id)){
      clearDropMarkers();
      currentTarget=null;
      return;
    }
    const rect=targetCol.getBoundingClientRect();
    const before=mv.clientX < rect.left + rect.width/2;
    if(currentTarget!==targetCol || dropBefore!==before){
      clearDropMarkers();
      targetCol.classList.add(before ? 'is-panel-drop-before' : 'is-panel-drop-after');
      currentTarget=targetCol;
      dropBefore=before;
    }
  };

  const finish=()=>{
    try{ dragTarget.releasePointerCapture?.(ev.pointerId); }catch{}
    dragTarget.classList.remove('is-grabbing');
    sourceCol.classList.remove('is-panel-dragging');
    document.body?.classList.remove('panel-drag-active');
    clearDropMarkers();
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    if(!currentTarget) return;
    const targetId=currentTarget.dataset.panelId;
    if(!targetId || targetId===sourceId) return;
    const cur=readPanelOrder();
    const without=cur.filter(id=>id!==sourceId);
    const targetIdx=without.indexOf(targetId);
    if(targetIdx<0) return;
    const next=[...without];
    next.splice(dropBefore ? targetIdx : targetIdx+1, 0, sourceId);
    writePanelOrder(next);
    applyPanelOrder(next);
    applySheetSplitLayout();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
}

function scheduleFastQuoteRefresh(delay){
  if(!featureEnabled('fastQuote')) return;
  if(STATIC_EXPORT || shouldPauseDataRefreshForHidden() || fastQuoteTimer || !lastRenderedCards.length) return;
  const d = delay ?? (fastQuoteIntervalMs(lastSnapshot) + fastQuoteJitterMs());
  if(summaryUsesFastQuoteRefresh() && lastQuoteLoadAt){
    const expectedAt=lastQuoteLoadAt + fastQuoteIntervalMs(lastSnapshot);
    const untilExpected=expectedAt - Date.now();
    if(untilExpected > 0) {
      fastQuoteTimer=setTimeout(runFastQuoteRefresh, Math.max(500, untilExpected));
      return;
    }
  }
  fastQuoteTimer=setTimeout(runFastQuoteRefresh, d);
}

function applyFastQuoteResults(targets, results){
  let applied=0;
  results.forEach((quote, resultIndex)=>{
    const target=targets[resultIndex];
    if(!target || !quote?.ok) return;
    target.indexes.forEach((cardIndex)=>{
      const next=mergeFastQuoteCard(lastRenderedCards[cardIndex], quote);
      lastRenderedCards[cardIndex]=next;
      applyFastQuoteToRow(target.token, next);
      applied += 1;
    });
  });
  if(applied) updateHoldingSummaryRow();
  return applied;
}

function sharedFastQuoteResults(targets){
  const maxAge = Math.max(8000, Math.floor(fastQuoteIntervalMs(lastSnapshot) * 0.75));
  const results=[];
  for(const target of targets){
    const cached = runtimeShared.quotesByToken.get(quoteRuntimeKey(target.token, target.coinSource));
    if(!cached || Date.now() - Number(cached.at || 0) > maxAge) return null;
    results.push(cached.quote);
  }
  return results;
}

function waitForSharedFastQuoteResults(targets, timeoutMs=900){
  return waitForSharedValue(()=>sharedFastQuoteResults(targets), timeoutMs);
}

function fastQuoteTokenMarket(token){
  return String(token || '').split(':').pop()?.toUpperCase() || '';
}

function marketActiveForFastQuote(market, session=lastSnapshot?.session || ''){
  if(market === 'COIN') return true;
  if(market === 'KR') return sessionHasClient(session, 'KR_PRE') || sessionHasClient(session, 'KR_REG') || sessionHasClient(session, 'KR_AFTER');
  if(market === 'US') return sessionHasClient(session, 'US_PRE') || sessionHasClient(session, 'US_REG') || sessionHasClient(session, 'US_AFTER');
  return false;
}

function shouldUseSnapshotFastQuote(target){
  if(!target) return true;
  const hasUserAdded = target.indexes.some((index)=>lastRenderedCards[index]?.userAdded);
  if(hasUserAdded) return false;
  return !marketActiveForFastQuote(fastQuoteTokenMarket(target.token));
}

async function runFastQuoteRefresh(){
  fastQuoteTimer=null;
  if(!featureEnabled('fastQuote')) return;
  if(STATIC_EXPORT || shouldPauseDataRefreshForHidden()){
    scheduleFastQuoteRefresh();
    return;
  }
  if(fastQuoteInFlight) return;
  const targets=fastQuoteTargets();
  if(!targets.length){
    scheduleFastQuoteRefresh();
    return;
  }
  fastQuoteInFlight=true;
  try{
    const snapshotQuotes=snapshotQuoteByToken(lastSnapshot);
    const snapshotTargets=[];
    const apiTargets=[];
    targets.forEach((target)=>{
      const key=quoteRuntimeKey(target.token, target.coinSource);
      if(snapshotQuotes.has(key) && shouldUseSnapshotFastQuote(target)) snapshotTargets.push(target);
      else apiTargets.push(target);
    });
    if(snapshotTargets.length){
      applyFastQuoteResults(snapshotTargets, snapshotTargets.map((target)=>snapshotQuotes.get(quoteRuntimeKey(target.token, target.coinSource))));
    }
    if(!apiTargets.length) return;
    const shared = sharedFastQuoteResults(apiTargets);
    if(shared){
      const applied=applyFastQuoteResults(apiTargets, shared);
      if(applied){
        lastQuoteLoadAt=Date.now();
        tickFreshness();
      }
      return;
    }
    const results=new Array(apiTargets.length).fill(null);
    const bySource=new Map();
    apiTargets.forEach((target, index)=>{
      const source=normalizeCoinQuoteSourceClient(target.coinSource);
      if(!bySource.has(source)) bySource.set(source, []);
      bySource.get(source).push({ target, index });
    });
    const batchSize = Math.max(1, Number(typeof FAST_QUOTE_BATCH_SIZE === 'number' ? FAST_QUOTE_BATCH_SIZE : 30) || 30);
    for(const [coinSource, group] of bySource){
      for(let i=0; i<group.length; i+=batchSize){
        const chunk=group.slice(i, i+batchSize);
        const codes=chunk.map(({target})=>target.token).join(',');
        const lockKey=`quote:${coinSource}:${codes}`;
        let lockAcquired=tryAcquireSharedPollLock(lockKey, 12000);
        let chunkResults=null;
        if(!lockAcquired){
          const shared=await waitForSharedFastQuoteResults(chunk.map(({target})=>target), 900);
          if(shared) chunkResults=shared;
          else lockAcquired=tryAcquireSharedPollLock(lockKey, 5000);
        }
        if(!chunkResults && !lockAcquired){
          chunkResults=await waitForSharedPollValue(
            lockKey,
            ()=>sharedFastQuoteResults(chunk.map(({target})=>target)),
            2800
          );
          if(!chunkResults) continue;
        }
        if(!chunkResults){
          try{
            const data=await fetchJsonClient(quoteApiUrlForCodes(codes, coinSource), 7000);
            chunkResults=Array.isArray(data?.results) ? data.results : [];
          }finally{
            if(lockAcquired) releaseSharedPollLock(lockKey);
          }
        }
        chunk.forEach(({index}, offset)=>{
          results[index]=chunkResults[offset] || null;
        });
      }
    }
    const applied=applyFastQuoteResults(apiTargets, results);
    if(applied){
      lastQuoteLoadAt=Date.now();
      tickFreshness();
    }
    postRuntimeMessage('quotes', {
      items: apiTargets
        .map((target, index)=>({ token:target.token, coinSource:target.coinSource, quote:results[index] }))
        .filter((item)=>item.quote?.ok),
    });
  }catch{}
  finally{
    fastQuoteInFlight=false;
    scheduleFastQuoteRefresh();
  }
}
function snapshotCacheTtl(snapshot){
  return pollProfile(snapshot).cache || DEFAULT_SNAPSHOT_CACHE_TTL_MS;
}
function readSnapshotCache(options={}){
  try{
    const raw=localStorage.getItem(SNAPSHOT_CACHE_KEY);
    if(!raw) return null;
    const obj=JSON.parse(raw);
    if(!obj || !obj.at || !obj.value) return null;
    if(!isValidSnapshot(obj.value)){
      localStorage.removeItem(SNAPSHOT_CACHE_KEY);
      return null;
    }
    if(!snapshotMatchesClientSettings(obj.value)) return null;
    if(!options.allowSessionMismatch && snapshotConflictsWithLocalSession(obj.value)) return null;
    const age = Date.now()-obj.at;
    if(age > snapshotCacheTtl(obj.value) && !options.allowStale) return null;
    return { value: obj.value, age };
  }catch{ return null; }
}
function snapshotEtag(){
  try{ return localStorage.getItem(SNAPSHOT_ETAG_KEY) || ''; }catch{ return ''; }
}
function writeSnapshotCache(value, etag='', options={}){
  if(!isValidSnapshot(value)) return;
  if(!snapshotMatchesClientSettings(value)) return;
  try{
    localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify({at:Date.now(), value}));
    if(etag) localStorage.setItem(SNAPSHOT_ETAG_KEY, etag);
    else if(!options.preserveEtag) localStorage.removeItem(SNAPSHOT_ETAG_KEY);
  }catch{}
}

function sharedSnapshotCache(){
  const item = runtimeShared.snapshot;
  if(!item || !isValidSnapshot(item.value)) return null;
  if(!snapshotMatchesClientSettings(item.value)) return null;
  if(snapshotConflictsWithLocalSession(item.value)) return null;
  const age = Date.now() - Number(item.at || 0);
  if(age > snapshotCacheTtl(item.value)) return null;
  return { value:item.value, age };
}
function sharedOrCachedSnapshotCache(options={}){
  return sharedSnapshotCache() || readSnapshotCache(options);
}

function snapshotFreshnessMs(snapshot){
  const builtAt = Number(snapshot?._status?.builtAt);
  if(Number.isFinite(builtAt) && builtAt > 0) return builtAt;
  const parsed = Date.parse(snapshot?.now || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function renderSheetRescueTable(kind='summary', message='데이터를 다시 불러오는 중입니다'){
  const newsLayout = kind === 'summary' ? null : newsTableLayout();
  const cols = kind === 'summary' ? 4 : newsLayout.dataCols + 1;
  const header = kind === 'summary'
    ? `<tr><th class="rownum"></th><th class="colhead">A</th><th class="colhead">B</th><th class="colhead">C</th></tr>
       <tr><th class="rownum">1</th><th class="subhead">지표</th><th class="subhead">현재가</th><th class="subhead">${changeHeaderLabel()}</th></tr>`
    : newsLayout.header;
  const rows = Array.from({length:3}, (_,i)=>`<tr class="loading-row"><td class="rownum">${i+2}</td><td colspan="${cols-1}">${esc(message)}</td></tr>`).join('');
  return header + rows;
}

function renderSnapshotView(s, market, baseCards, userCards=[]){
  const rowLimit=quoteTableRowLimit();
  const safeBaseCards = (Array.isArray(baseCards) ? baseCards : []).slice(0, rowLimit);
  const userSlots=userWatchlistSlotsForMarket(market, safeBaseCards.length);
  const safeUserCards = (Array.isArray(userCards) ? userCards : []).slice(0, userSlots);
  const quoteCards=safeBaseCards.concat(safeUserCards);
  const cards=orderRenderedQuoteCards(withQuoteNoteRows(quoteCards, market));
  lastRenderedCards=cards.slice();
  closeMobileTradingViewChart();
  const table=document.getElementById('cardsTable');
  try{
    if(table) table.innerHTML=renderCardsTable(cards, s.session);
  }catch(e){
    debugWarn('cards render failed', e);
    if(table) table.innerHTML=renderSheetRescueTable('summary', '시세 표시를 복구하는 중입니다');
  }
  setSheetSwitchLoading(false);
  const inbox=document.getElementById('outlookInboxCount');
  if(inbox) inbox.textContent=String(quoteCards.length || '-');
  const mailbox=document.getElementById('outlookActiveMailbox');
  if(mailbox) mailbox.textContent=`${marketDisplayName(market)} 업데이트`;
  if(document.body.classList.contains('theme-outlook')){
    try{ renderOutlookFromSnapshot(s, quoteCards); }catch(e){ debugWarn('outlook render failed', e); }
  }

  lastLoadAt=snapshotFreshnessMs(s);
  lastQuoteLoadAt=lastSnapshotInfo.market !== market
    ? lastLoadAt
    : Math.max(Number(lastQuoteLoadAt) || 0, lastLoadAt);
  lastSnapshotInfo={market, baseCount:safeBaseCards.length, userCount:safeUserCards.length};
  tickFreshness();
  reschedulePollingForCurrentSession();
  scheduleSessionBoundaryRefresh();
  scheduleFastQuoteRefresh(summaryUsesFastQuoteRefresh() ? 1200 : undefined);
  bindCardsTableControls();
  updateHiddenRestoreUi();
  updateChangeWindowUi();
  updateQuoteSortUi();
  if(newsAccumulated.length === 0) renderSnapshotNewsFallback();
}

async function renderSnapshot(s){
  const seq = ++renderSnapshotSeq;
  lastSnapshot=s;
  applyFeatureFlags(s.flags);
  applyPollHint(s.pollHint);
  absorbPresence(s);
  applyServerStatus(s);
  const market=(selected==='AUTO')?mapAuto(s):selected;
  currentRenderedMarket=market;

  document.getElementById('session').textContent=s.sessionLabel;
  document.getElementById('statusLeft').textContent=`${marketDisplayName(market)} 시트`;

  const baseCards=visibleCards(s.cards, market).slice(0, quoteTableRowLimit());
  const userSlotLimit=userWatchlistSlotsForMarket(market, baseCards.length);
  const watchlistTask = Promise.race([
    fetchUserWatchlistCards(market, userSlotLimit),
    sleep(USER_WATCHLIST_BACKGROUND_TIMEOUT_MS).then(()=>[]),
  ]).catch((e)=>{
    debugWarn('user watchlist quote load failed', e);
    return [];
  });
  const earlyUserCards = await Promise.race([
    watchlistTask,
    sleep(USER_WATCHLIST_RENDER_TIMEOUT_MS).then(()=>null),
  ]);
  if(earlyUserCards === null){
    renderSnapshotView(s, market, baseCards, []);
    watchlistTask.then((userCards)=>{
      if(seq !== renderSnapshotSeq) return;
      if(lastSnapshot !== s || currentRenderedMarket !== market) return;
      renderSnapshotView(s, market, baseCards, userCards);
    });
    return;
  }
  renderSnapshotView(s, market, baseCards, earlyUserCards);
}

/* Quote table control bindings live in app-quote-controls.js. */

function rerenderCardsTableFromCurrentState(){
  const table=document.getElementById('cardsTable');
  if(!table || !lastRenderedCards.length) return;
  closeMobileTradingViewChart();
  lastRenderedCards=orderRenderedQuoteCards(withQuoteNoteRows(lastRenderedCards.slice(), currentRenderedMarket));
  table.innerHTML=renderCardsTable(lastRenderedCards, lastSnapshot?.session);
  if(document.body.classList.contains('theme-outlook') && lastSnapshot){
    try{ renderOutlookFromSnapshot(lastSnapshot, lastRenderedCards.filter((card)=>card && !card._noteRow)); }catch(e){ debugWarn('outlook render failed', e); }
  }
  bindCardsTableControls();
}

/* Quote row drag ordering lives in app-quote-drag.js. */

async function moveDefaultItem(orderId, dir){
  if(moveVisibleQuoteRowByDelta(orderId, dir === 'up' ? -1 : 1)) return;
  const visible = lastRenderedDefaultOrderIds.slice();
  const idx = visible.indexOf(orderId);
  const delta = dir === 'up' ? -1 : 1;
  const nextIdx = idx + delta;
  if(idx < 0 || nextIdx < 0 || nextIdx >= visible.length) return;
  const [item] = visible.splice(idx, 1);
  visible.splice(nextIdx, 0, item);
  const existing = defaultOrderLoad().filter(id=>!visible.includes(id));
  defaultOrderSave(visible.concat(existing));
  if(lastSnapshot) rerenderCardsTableFromCurrentState();
  else await loadSnapshot({force:true});
}

async function loadSnapshot(options={}){
  if(shouldPauseDataRefreshForHidden() && !options.allowHidden){
    loadQueuedOptions = null;
    return;
  }
  if(loadInFlight){
    loadQueuedOptions={
      ...(loadQueuedOptions || {}),
      ...options,
      force: !!(loadQueuedOptions?.force || options.force),
      sheetSwitch: !!(loadQueuedOptions?.sheetSwitch || options.sheetSwitch),
    };
    return;
  }
  loadInFlight=true;
  const force = !!options.force;
  const boundaryStale = snapshotConflictsWithLocalSession(readSnapshotCache({ allowStale:true, allowSessionMismatch:true })?.value);
  const forceNetwork = force || boundaryStale;
  // 세션별 TTL 내 캐시는 브라우저가 직접 화면을 복원한다. CF Functions 호출을 아낀다.
  const cached=forceNetwork ? null : readSnapshotCache();
  if(cached) lastSnapshot=cached.value;
  if(cached && !forceNetwork){
    try{
      await renderSnapshot(cached.value);
      snapshotConsecutiveFailures=0;
      loadInFlight=false;
      return;
    }catch(_){}
  }
  const shared = !forceNetwork ? sharedSnapshotCache() : null;
  if(shared){
    try{
      lastSnapshot=shared.value;
      await renderSnapshot(shared.value);
      snapshotConsecutiveFailures=0;
      loadInFlight=false;
      return;
    }catch(_){}
  }
  // stale-while-revalidate: TTL 이 지난 캐시라도 일단 보여주고 백그라운드에서
  // 새 응답을 받아 자연스럽게 덮어쓴다. 사용자는 4초 가까운 빈 시세창 대신
  // 직전 가격을 즉시 보고, 새 응답이 도착하면 부드럽게 갱신된다.
  const stale = (!forceNetwork || options.silentResume)
    ? readSnapshotCache({ allowStale:true, allowSessionMismatch:!!options.silentResume })
    : null;
  let staleRendered = false;
  if(stale?.value){
    try{
      lastSnapshot = stale.value;
      await renderSnapshot(stale.value);
      staleRendered = true;
    }catch(_){}
  }
  if(!staleRendered) setLoading(true, '시세를 새로 고치는 중...');
  const pollLockKey=`snapshot:${coinQuoteSource()}`;
  let pollLockAcquired=false;
  try{
    if(!forceNetwork){
      pollLockAcquired=tryAcquireSharedPollLock(pollLockKey, 20000);
      if(!pollLockAcquired){
        const firstVisibleQuoteLoad = !staleRendered && cardsTableLooksUnready();
        const readSharedOrCached = () => sharedOrCachedSnapshotCache();
        const waited=await waitForSharedValue(readSharedOrCached, firstVisibleQuoteLoad ? 650 : 1200);
        if(waited?.value){
          lastSnapshot=waited.value;
          await renderSnapshot(waited.value);
          setLoading(false);
          snapshotConsecutiveFailures=0;
          return;
        }
        pollLockAcquired=tryAcquireSharedPollLock(pollLockKey, 8000);
        if(!pollLockAcquired){
          if(!firstVisibleQuoteLoad){
            const delayed=await waitForSharedPollValue(pollLockKey, readSharedOrCached, 4500);
            if(delayed?.value){
              lastSnapshot=delayed.value;
              await renderSnapshot(delayed.value);
              setLoading(false);
              snapshotConsecutiveFailures=0;
              return;
            }
          }
          if(staleRendered){
            setLoading(false);
            snapshotConsecutiveFailures=0;
            return;
          }
          debugWarn('bypass shared snapshot lock for first visible paint', { pollLockKey });
        }
      }
    }
    const headers = {};
    const etag = snapshotEtag();
    if(etag && !forceNetwork) headers['if-none-match'] = etag;
    const meta = await fetchJsonClient(snapshotApiUrl(), 14000, {
      cache: forceNetwork ? 'reload' : 'default',
      headers,
      returnMeta:true,
    });
    if(meta.notModified){
      const stale = readSnapshotCache({ allowStale:true });
      if(stale?.value){
        writeSnapshotCache(stale.value, etag);
        await renderSnapshot(stale.value);
        setLoading(false);
        snapshotConsecutiveFailures=0;
        return;
      }
    }
    const s = meta.data;
    if(!isValidSnapshot(s)) throw new Error('snapshot payload incomplete');
    writeSnapshotCache(s, meta.headers?.get?.('etag') || '');
    runtimeShared.snapshot = { at:Date.now(), value:s };
    postRuntimeMessage('snapshot', s);
    await renderSnapshot(s);
    setLoading(false);
    snapshotConsecutiveFailures=0;
  }catch(e){
    snapshotConsecutiveFailures++;
    // 일시적인 abort/timeout 은 첫 회는 조용히 무시 (다음 snapshot 사이클에서 재시도).
    // 2회 연속 실패할 때만 토스트로 알림.
    const transient = e && (e.aborted || /timeout|abort/i.test(String(e.message||e)));
    // stale-while-revalidate 로 이미 직전 가격을 보여준 상태라면 사용자 입장에서
    // 화면은 멀쩡하다. 토스트 대신 statusbar 만 살짝 바꾼다.
    if(staleRendered){
      document.getElementById('statusLeft').textContent='재시도 대기';
    } else if(snapshotConsecutiveFailures>=2 || !transient){
      document.getElementById('statusLeft').textContent='조회 실패';
      debugWarn('snapshot load failed', e);
      showToast(friendlySnapshotErrorMessage(e), 'err');
    }else{
      document.getElementById('statusLeft').textContent='재시도 대기';
    }
    setLoading(false);
  }finally{
    if(pollLockAcquired) releaseSharedPollLock(pollLockKey);
    loadInFlight=false;
    if(options.sheetSwitch && !loadQueuedOptions) setSheetSwitchLoading(false);
    if(loadQueuedOptions){
      const nextOptions=loadQueuedOptions;
      loadQueuedOptions=null;
      setTimeout(()=>loadSnapshot(nextOptions), 0);
    }
  }
}

function currentNewsMarket(){
  if(selected==='AUTO') return 'ALL';
  if(selected==='HOLDINGS') return 'ALL';
  return selected;
}

function newsCountdownText(){
  if(!nextNewsAt) return '뉴스 갱신 대기';
  const sec = Math.max(0, Math.ceil((nextNewsAt - Date.now()) / 1000));
  // 주말/장외처럼 다음 자동 갱신까지 30분 이상 남았을 때는 카운트다운 대신
  // '주말 갱신 대기' 라는 차분한 안내로 대체한다 (서버 캐시는 더 짧은 주기로
  // 갱신될 수 있으므로 사용자에게 '1시간 기다려야 한다' 는 인상을 주지 않도록).
  if(sec >= 30 * 60) return '주말·장외 자동 갱신 대기';
  return `다음 갱신 ${fmtFutureSec(sec)}`;
}

function updateNewsHint(){
  const tlHintEl=document.getElementById('timelineHint');
  if(!tlHintEl) return;
  if(timelineIsEtf()){
    updateEtfHint();
    return;
  }
  if(timelineIsCommunity()){
    if(!featureEnabled('community')){
      tlHintEl.textContent='종목토론방 · 트래픽 폭증으로 일시 정지';
      return;
    }
    const channelLabel = communityChannelLabel();
    const totalPages = communityTotalPages();
    const pageText = totalPages > 1 ? ` · ${clampCommunityPage()}/${totalPages}쪽` : '';
    const unread = typeof communityUnreadInfo === 'function' ? communityUnreadInfo(communityPosts).unreadCount : 0;
    const unreadText = unread > 0 ? ` · 새 글 ${unread}` : '';
    const refreshText = featureFlags.degraded ? '혼잡 모드 · 천천히 갱신' : '2분마다 갱신';
    tlHintEl.textContent = communityPosts.length
      ? `${channelLabel} · 글 ${communityPosts.length}개${unreadText}${pageText} · ${refreshText}`
      : `${channelLabel} · 새 글 기다리는 중 · ${refreshText}`;
    return;
  }
  if(!featureEnabled('news')){
    tlHintEl.textContent='뉴스 · 트래픽 폭증으로 새로고침 일시 정지';
    return;
  }
  const { live, fresh, fallback } = lastNewsHintState;
  const countText = live>0
    ? `뉴스 ${live}건${fresh>0 ? ` · 신규 +${fresh}` : ''}`
    : fallback;
  tlHintEl.textContent = `${newsCountdownText()} · ${countText}`;
}

function renderAccumulatedNews(){
  if(timelineIsEtf()){
    renderEtfBrowser();
    if(!etfHasRows()) loadEtfData();
    return;
  }
  if(timelineIsCommunity()){
    renderCommunityPlaceholder();
    return;
  }
  const viewed = currentViewedNewsItems();
  document.getElementById('timelineTable').innerHTML=renderNewsFeedTable(viewed);
  lastNewsHintState = {
    live: viewed.filter(n=>n.source!=='Live Data').length,
    fresh: viewed.filter(n=>n._isNew).length,
    fallback: '데이터 헤드라인',
  };
  updateNewsHint();
  if(document.body.classList.contains('theme-outlook')){
    if(outlookFolderFilter === 'news') renderOutlookNewsFeed();
    else if(outlookSelectedKey){
      const card = findOutlookCardByKey(outlookSelectedKey);
      if(card) renderOutlookReadingPane(card, lastSnapshot);
    }
  }
  enableCellSelection();
}

function renderSnapshotNewsFallback(reason='뉴스를 불러오는 동안 실시간 시장 요약을 먼저 표시합니다'){
  if(timelineIsEtf()){
    renderEtfBrowser();
    if(!etfHasRows()) loadEtfData();
    return true;
  }
  if(timelineIsCommunity()){
    renderCommunityPlaceholder();
    return true;
  }
  renderNewsLoadingProgress(0, { message: reason, hint: '시세 요약 대신 뉴스 표를 비워두고 기다립니다.' });
  updateNewsHint();
  return true;
}

let newsLoadInFlight = false;
let newsRetryTimer = null;
let newsLoadQueued = false;
let newsFetchDeferredByCommunity = false;
function clearNewsRetryTimer(){
  if(newsRetryTimer){
    clearTimeout(newsRetryTimer);
    newsRetryTimer = null;
  }
}
function newsPadTarget(){
  // 빈 행은 항상 80행까지 채움 — innerWidth 가 0 으로 보고되는 임베드 환경에서도
  // 일관된 시트 길이를 유지하고 모바일은 CSS 가 별도로 줄임.
  return 80;
}
function currentViewedNewsItems(){
  const market=currentNewsMarket();
  const realNews = newsAccumulated.filter(n => !isLiveDataNews(n));
  return market==='ALL'
    ? realNews.filter(n => n.market !== 'COIN')
    : realNews.filter(n => n.market===market);
}
function hasVisibleRealNews(){
  return currentViewedNewsItems().length > 0;
}
function renderNewsLoadingProgress(elapsed, options={}){
  if(timelineIsCommunity() || timelineIsEtf()) return;
  document.getElementById('timelineTable')?.classList.remove('community-table','etf-table');
  const { dataCols, header } = newsTableLayout();
  const baseHint = options.hint || (elapsed >= 8 ? '외부 RSS 응답이 느린 시간대일 수 있어요' : '');
  const hint = baseHint ? `<div class="news-loading-hint">${esc(baseHint)}</div>` : '';
  const message = options.message || '뉴스 불러오는 중';
  const empties = makeNewsLoadingEmptyRows(3, 8, dataCols);
  document.getElementById('timelineTable').innerHTML =
    header +
    `<tr><td class="rownum">2</td><td colspan="${dataCols}" class="news-loading-cell">
       <span class="news-loading-spin"></span>
       ${esc(message)} <strong>${elapsed}초</strong>
       ${hint}
     </td></tr>` + empties;
  lastNewsHintState = { live: 0, fresh: 0, fallback: '뉴스 로딩 중' };
  updateNewsHint();
  enableCellSelection();
}
function sharedTimelinePayload(queryMarket, maxAgeMs=45 * 1000){
  const shared = runtimeShared.newsByMarket.get(queryMarket);
  return shared && Date.now() - Number(shared.at || 0) < maxAgeMs
    ? shared.data
    : null;
}
function cachedTimelinePayload(queryMarket){
  const cached = readTimelinePayloadCache(queryMarket);
  return cached?.data || null;
}
async function loadNews(options={}){
  if(shouldPauseDataRefreshForHidden() && !options.allowHidden){
    newsLoadQueued = false;
    return;
  }
  if(!featureEnabled('news')){
    if(newsAccumulated.length===0) renderSnapshotNewsFallback('트래픽 폭증으로 뉴스 새로고침을 잠시 쉬고 있습니다');
    updateNewsHint();
    return;
  }
  if(timelineIsEtf()){
    updateEtfHint();
    return;
  }
  if(timelineIsCommunity()){
    newsFetchDeferredByCommunity = true;
    loadCommunityPosts({ silent:true });
    scheduleCommunityRefresh();
    return;
  }
  if(newsLoadInFlight){
    newsLoadQueued = true;
    return;
  }
  newsFetchDeferredByCommunity = false;
  newsLoadInFlight = true;
  const market=currentNewsMarket();
  const queryMarket = market==='ALL' ? 'ALL' : market;
  // 빈 상태면 로딩 카운터 표시 (1초마다 갱신)
  let progressTimer = null;
  const start = Date.now();
  if(newsAccumulated.length === 0){
    renderNewsLoadingProgress(0);
    progressTimer = setInterval(()=>{
      renderNewsLoadingProgress(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  }
  const pollLockKey=`timeline:${queryMarket}`;
  let pollLockAcquired=false;
  try{
    const emptyNewsView = !hasVisibleRealNews();
    let timelinePayload = !options.force ? (sharedTimelinePayload(queryMarket) || cachedTimelinePayload(queryMarket)) : null;
    if(!timelinePayload){
      if(!options.force){
        pollLockAcquired=tryAcquireSharedPollLock(pollLockKey, 20000);
        if(!pollLockAcquired){
          const firstWaitMs = emptyNewsView ? 350 : 1200;
          const lockWaitMs = emptyNewsView ? 900 : 6000;
          const readSharedOrCached = () => sharedTimelinePayload(queryMarket) || cachedTimelinePayload(queryMarket);
          timelinePayload=await waitForSharedValue(readSharedOrCached, firstWaitMs);
          if(!timelinePayload) pollLockAcquired=tryAcquireSharedPollLock(pollLockKey, 8000);
          if(!timelinePayload && !pollLockAcquired){
            timelinePayload=await waitForSharedPollValue(
              pollLockKey,
              readSharedOrCached,
              lockWaitMs
            );
            if(!timelinePayload && newsAccumulated.length) return;
          }
        }
      }
      const headers = {};
      const etag = readNewsEtag(queryMarket);
      if(etag && !options.force) headers['if-none-match'] = etag;
      if(!timelinePayload){
        const meta = await fetchJsonClient('/api/timeline?limit=25&market='+queryMarket, 16000, {
          cache: options.force ? 'reload' : 'default',
          headers,
          returnMeta:true,
        });
        if(meta.notModified){
          const cachedPayload = readTimelinePayloadCache(queryMarket, { allowStale:true });
          if(cachedPayload?.data){
            timelinePayload = cachedPayload.data;
          }else{
            const fresh = await fetchJsonClient('/api/timeline?limit=25&market='+queryMarket, 16000, {
              cache:'reload',
              returnMeta:true,
            });
            timelinePayload = fresh.data;
            writeNewsEtag(queryMarket, fresh.headers?.get?.('etag') || '');
          }
        }else{
          timelinePayload = meta.data;
          writeNewsEtag(queryMarket, meta.headers?.get?.('etag') || '');
        }
      }
      runtimeShared.newsByMarket.set(queryMarket, { at:Date.now(), data:timelinePayload });
      writeTimelinePayloadCache(queryMarket, timelinePayload);
      postRuntimeMessage('timeline', { market:queryMarket, data:timelinePayload });
    }
    if(progressTimer){ clearInterval(progressTimer); progressTimer = null; }
    clearNewsRetryTimer();
    const items=newsRowsFromTimeline(timelinePayload);
    // 새 항목만 추출 (URL 또는 title 기반 dedup). market 을 키에 넣지 않아
    // 같은 기사가 국장/미장 양쪽에서 들어와도 화면에는 한 번만 쌓는다.
    // 첫 로드라도 과도하게 오래된 기사는 거부한다. 캐시/외부 RSS가 낡은 묶음을
    // 되살리면 최신 피드처럼 보이는 문제가 생기기 때문.
    const newOnes=[];
    let changedExisting = false;
    const STALE_PREPEND_MS = pollProfileKind(lastSnapshot)==='weekend'
      ? 36 * 3600 * 1000
      : 12 * 3600 * 1000;
    for(const item of items){
      const k=newsKey(item);
      if(newsSeenKeys.has(k) || hasDuplicateNews(item)){
        if(isLiveDataNews(item)){
          const idx = newsAccumulated.findIndex(n => newsKey(n) === k);
          if(idx >= 0){
            newsAccumulated[idx] = { ...newsAccumulated[idx], ...item, _isNew:false };
            changedExisting = true;
          }
        }
        continue;
      }
      if(!isReadableFreshNews(item, STALE_PREPEND_MS)) continue;
      newsSeenKeys.add(k);
      item._isNew=true;
      item._addedAt=Date.now();
      newOnes.push(item);
    }
    if(newOnes.length){
      newsAccumulated.unshift(...newOnes);
      sortNewsNewestFirst();
      // 150건 초과분 drop + key set 정리
      if(newsAccumulated.length>150){
        const dropped=newsAccumulated.splice(150);
        dropped.forEach(d => newsSeenKeys.delete(newsKey(d)));
      }
      renderAccumulatedNews();
      writeNewsCache(newsAccumulated);
      // 4초 후 _isNew 해제 + 재렌더로 클래스 제거
      setTimeout(()=>{
        newOnes.forEach(n=>{ n._isNew=false; });
        renderAccumulatedNews();
      }, 4200);
    }else if(changedExisting){
      sortNewsNewestFirst();
      renderAccumulatedNews();
      writeNewsCache(newsAccumulated);
    }else if(newsAccumulated.length===0){
      renderAccumulatedNews();
    }
  }catch(e){
    if(progressTimer){ clearInterval(progressTimer); progressTimer = null; }
    if(newsAccumulated.length===0){
      // 비어있으면 안내 + 자동 재시도 (5초 후 1회)
      const elapsed = Math.floor((Date.now() - start) / 1000);
      renderNewsLoadingProgress(elapsed, {
        message: '뉴스 응답 지연, 자동 재시도 대기',
        hint: '5초 후 다시 불러옵니다.',
      });
      if(!newsRetryTimer){
        newsRetryTimer = setTimeout(()=>{ newsRetryTimer = null; loadNews(); }, 5000);
      }
    }
  }finally{
    if(pollLockAcquired) releaseSharedPollLock(pollLockKey);
    if(progressTimer){ clearInterval(progressTimer); }
    newsLoadInFlight = false;
    if(newsLoadQueued){
      newsLoadQueued = false;
      loadNews();
    }
  }
}

// 시세창/뉴스의 남은 시간 라벨을 1초마다 업데이트. 두 작업이 같은 주기라 한 타이머로 합침.
setInterval(()=>{
  try{ tickFreshness(); }catch{}
  try{ updateNewsHint(); }catch{}
}, 1000);

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const nextMarket=btn.dataset.market;
    if(selected===nextMarket) return;
    selected=nextMarket;
    try{ localStorage.setItem(VIEW_KEY, selected); persistSet(VIEW_KEY, selected); }catch{}
    syncActiveTab();
    const label=marketDisplayName(selected==='AUTO' && lastSnapshot ? mapAuto(lastSnapshot) : selected);
    setSheetSwitchLoading(true, `${label} 시트 불러오는 중...`);
    loadSnapshot({sheetSwitch:true});
    // 누적 list 는 유지하되, 새 시장 컨텍스트로 즉시 필터 + fetch
    renderAccumulatedNews();
    loadNews();
  });
});
function syncActiveTab(){
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.market === selected);
  });
  syncWatchlistMarketUi();
}
syncActiveTab();
function setTimelineTab(tab){
  const previousKey = timelineActiveTabKey();
  const next = timelineTabParts(tab);
  const nextKey = next.tab === 'community' ? `community-${next.channel}` : next.tab;
  trackTimelineGaEvent('timeline_tab_click', timelineAnalyticsPayload(nextKey, {
    previous_timeline_tab_key:previousKey,
    value:1,
  }), { interaction:true });
  if(nextKey !== previousKey) flushTimelineTabEngagement('switch');
  const channelChanged = next.tab === 'community' && next.channel !== communityActiveChannel();
  timelineTab = next.tab;
  if(next.tab === 'community') communityChannel = next.channel;
  if(channelChanged){
    communityPage=1;
    communityReplyPostId='';
    communityReplyParentCommentId='';
    communityMobileActionPostId='';
    communityMobileActionCommentId='';
    communityDraftReplyBody='';
    communityPosts=[];
  }
  try{
    localStorage.setItem(TIMELINE_TAB_KEY, timelineTab);
    persistSet(TIMELINE_TAB_KEY, timelineTab);
    if(next.tab === 'community'){
      localStorage.setItem(COMMUNITY_CHANNEL_KEY, communityChannel);
      persistSet(COMMUNITY_CHANNEL_KEY, communityChannel);
    }
  }catch{}
  updateTimelineTabs();
  if(nextKey !== previousKey || timelineAnalyticsActiveKey !== nextKey){
    startTimelineTabEngagement(nextKey, 'tab_click');
  }
  if(timelineIsCommunity()){
    if(channelChanged) renderCommunityTable('loading');
    loadCommunityPosts({ force:channelChanged });
    scheduleCommunityRefresh();
  }
  else if(timelineIsEtf()){
    clearCommunityRefresh();
    renderEtfBrowser();
    loadEtfData();
  }
  else{
    clearCommunityRefresh();
    renderAccumulatedNews();
    if(newsFetchDeferredByCommunity || !hasVisibleRealNews()) loadNews();
  }
}
document.querySelectorAll('[data-timeline-tab]').forEach((btn)=>{
  btn.addEventListener('click',()=>setTimelineTab(btn.dataset.timelineTab));
});
updateTimelineTabs();
startTimelineTabEngagement(timelineActiveTabKey(), 'initial');
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden) flushTimelineTabEngagement('hidden');
  else startTimelineTabEngagement(timelineActiveTabKey(), 'visible');
});
window.addEventListener('pagehide', ()=>flushTimelineTabEngagement('pagehide'));
document.getElementById('timelineTable')?.addEventListener('click', (ev)=>{
  if(timelineIsEtf()){
    if(handleEtfTableClick(ev)) return;
  }
  if(timelineIsCommunity()) return;
  const link = ev.target?.closest?.('a.news-title-link,a.link-pill');
  if(!link) return;
  let domain = '';
  try{ domain = new URL(link.href, location.href).hostname; }catch{}
  trackTimelineGaEvent('timeline_news_click', timelineAnalyticsPayload('news', {
    link_url:String(link.href || '').slice(0, 400),
    link_domain:domain,
    link_text:String(link.textContent || '').trim().slice(0, 120),
    value:1,
  }), { interaction:true });
});
document.getElementById('timelineTable')?.addEventListener('input', (ev)=>{
  if(timelineIsEtf()) handleEtfControlInput(ev);
});
document.getElementById('timelineTable')?.addEventListener('change', (ev)=>{
  if(timelineIsEtf()) handleEtfControlChange(ev);
});
function manualRefresh(){
  loadSnapshot({force:true});
  if(timelineIsEtf()) loadEtfData({force:true});
  else loadNews({force:true});
}
document.getElementById('refreshRibbon').addEventListener('click', manualRefresh);
const jt=document.getElementById('jumpTimeline');
if(jt){ jt.addEventListener('click', ()=>{
  const el=document.querySelector('.col-timeline');
  if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
}); }

document.getElementById('cardsTable').innerHTML=renderLoadingTable('summary');
(function primeInitialQuoteFromCache(){
  try{
    const cached=readSnapshotCache({ allowStale:true });
    if(!cached?.value) return;
    lastSnapshot=cached.value;
    renderSnapshot(cached.value).catch(()=>{});
  }catch{}
})();
if(timelineIsCommunity()){
  loadCommunityPosts();
  scheduleCommunityRefresh();
}
else if(timelineIsEtf()){
  renderEtfBrowser();
  loadEtfData();
}
else document.getElementById('timelineTable').innerHTML=renderLoadingTable('news');

const initialSheetBootAt=Date.now();
let initialSheetRecoveryCount=0;
function cardsTableLooksUnready(){
  const table=document.getElementById('cardsTable');
  if(!table) return false;
  if(table.querySelector('tr[data-quote-id],tr.flow-row,tr.holding-summary-row')) return false;
  const text=String(table.textContent || '').trim();
  return !text || table.querySelector('.loading-row') || /데이터 조회 중|시세 표시를 복구/.test(text);
}
function timelineTableLooksUnready(){
  const table=document.getElementById('timelineTable');
  if(!table) return false;
  if(timelineIsCommunity()){
    if(table.querySelector('.loading-row')) return true;
    if(communityLoadInFlight && !communityPosts.length) return true;
    if(table.querySelector('.community-post-row:not(.community-poll-row),.community-empty-row')) return false;
    if(table.querySelector('.community-compose-row') && !communityLoadInFlight) return false;
  }else if(timelineIsEtf()){
    if(table.querySelector('.etf-data-row,.etf-filter-row')) return false;
  }else if(table.querySelector('.news-row')){
    return false;
  }
  const text=String(table.textContent || '').trim();
  return !text || table.querySelector('.loading-row') || /데이터 조회 중|뉴스 불러오는 중|게시글 불러오는 중/.test(text);
}
function resetStuckInitialLoads(reason, {cardsUnready=false, timelineUnready=false}={}){
  const bootAge=Date.now() - initialSheetBootAt;
  if(bootAge < 6500) return;
  if(cardsUnready && loadInFlight){
    debugWarn('reset stuck initial snapshot load', {reason, bootAge});
    loadInFlight=false;
    loadQueuedOptions=null;
  }
  if(timelineUnready && newsLoadInFlight){
    debugWarn('reset stuck initial news load', {reason, bootAge});
    newsLoadInFlight=false;
    newsLoadQueued=false;
  }
  if(timelineUnready && communityLoadInFlight){
    debugWarn('reset stuck initial community load', {reason, bootAge});
    communityLoadInFlight=false;
  }
}
function recoverInitialSheets(reason='initial-watchdog'){
  const cardsUnready=cardsTableLooksUnready();
  const timelineUnready=timelineTableLooksUnready();
  if(!cardsUnready && !timelineUnready) return;
  debugWarn('sheet initial load recovery', {reason, cardsUnready, timelineUnready});
  resetStuckInitialLoads(reason, {cardsUnready, timelineUnready});
  if(cardsUnready){
    const cached=(lastSnapshot && isValidSnapshot(lastSnapshot))
      ? { value:lastSnapshot }
      : sharedOrCachedSnapshotCache({ allowStale:true, allowSessionMismatch:true });
    if(cached?.value){
      renderSnapshot(cached.value).catch(()=>{});
    }else{
      const table=document.getElementById('cardsTable');
      if(table) table.innerHTML=renderSheetRescueTable('summary', '시세를 다시 불러오는 중입니다');
    }
  }
  if(timelineUnready){
    if(timelineIsCommunity()){
      try{ renderCommunityTable('loading'); }catch(_){}
    }else if(timelineIsEtf()){
      try{ renderEtfBrowser(); }catch(_){}
    }else{
      renderSnapshotNewsFallback('뉴스를 다시 불러오는 중입니다');
    }
  }
  if(initialSheetRecoveryCount >= 4) return;
  initialSheetRecoveryCount += 1;
  if(cardsUnready) loadSnapshot({ force:true, reason });
  if(timelineUnready){
    if(timelineIsCommunity()) loadCommunityPosts({ force:true });
    else if(timelineIsEtf()) loadEtfData({ force:true });
    else loadNews({ force:true });
  }
}
setTimeout(()=>recoverInitialSheets('initial-4s'), 4000);
setTimeout(()=>recoverInitialSheets('initial-8s'), 8000);
setTimeout(()=>recoverInitialSheets('initial-16s'), 16000);
setTimeout(()=>recoverInitialSheets('initial-28s'), 28000);
window.addEventListener('pageshow', ()=>setTimeout(()=>recoverInitialSheets('pageshow-watchdog'), 2200));
window.addEventListener('error', ()=>setTimeout(()=>recoverInitialSheets('window-error'), 0));
window.addEventListener('unhandledrejection', ()=>setTimeout(()=>recoverInitialSheets('unhandled-rejection'), 0));
/* ============================================================
   부하 절감 폴링 (탭 visible 일 때만 active):
   - 본장: snapshot 60s / news 8m
   - 프리·애프터·평일 장외: snapshot 2m / news 15m
   - 화면에 보이는 종목 현재가: 본장/장외 약 20s + 1~3s jitter
   - 주말·휴장: snapshot 1h / news 1h
   - 탭 hidden 3분 이후 polling 정지, 복귀 시 기존 화면을 유지한 채 조용히 동기화
   ============================================================ */
const INACTIVE_FORCE_REFRESH_MS = DATA_HIDDEN_GRACE_MS;
let snapTimer=null, newsTimer=null, sessionBoundaryTimer=null, hiddenDataPauseTimer=null;
let pageHiddenAt = document.hidden ? Date.now() : 0;
let lastPollProfileKey='';
function hiddenElapsedMs(){
  return document.hidden && pageHiddenAt ? Date.now() - pageHiddenAt : 0;
}
function shouldPauseDataRefreshForHidden(){
  return document.hidden && hiddenElapsedMs() >= DATA_HIDDEN_GRACE_MS;
}
function clearHiddenDataPauseTimer(){
  if(hiddenDataPauseTimer){
    clearTimeout(hiddenDataPauseTimer);
    hiddenDataPauseTimer=null;
  }
}
function scheduleHiddenDataPause(){
  clearHiddenDataPauseTimer();
  if(!document.hidden || !pageHiddenAt) return;
  const remaining=Math.max(0, DATA_HIDDEN_GRACE_MS - hiddenElapsedMs());
  hiddenDataPauseTimer=setTimeout(()=>{
    hiddenDataPauseTimer=null;
    if(shouldPauseDataRefreshForHidden()) stopPolling();
  }, remaining);
}
function pollProfileKey(){
  const hintKey=JSON.stringify(pollHint || {});
  return `${pollProfileKind(lastSnapshot)}:${pollScale()}:${hintKey}`;
}
function scheduleSnapshot(delay){
  if(shouldPauseDataRefreshForHidden() || snapTimer) return;
  const d = delay ?? pollProfile(lastSnapshot).snapshot;
  snapTimer = setTimeout(async ()=>{
    snapTimer = null;
    await loadSnapshot();
    scheduleSnapshot();
  }, d);
}
function scheduleNews(delay){
  if(!featureEnabled('news')) return;
  if(shouldPauseDataRefreshForHidden() || newsTimer) return;
  const d = delay ?? pollProfile(lastSnapshot).news;
  nextNewsAt = Date.now() + d;
  updateNewsHint();
  newsTimer = setTimeout(async ()=>{
    newsTimer = null;
    nextNewsAt = null;
    updateNewsHint();
    await loadNews();
    scheduleNews();
  }, d);
}
function startPolling(){
  lastPollProfileKey = pollProfileKey();
  scheduleSnapshot();
  scheduleNews();
  scheduleSessionBoundaryRefresh();
  scheduleFastQuoteRefresh();
  scheduleCommunityRefresh();
}
function reschedulePollingForCurrentSession(){
  if(shouldPauseDataRefreshForHidden()) return;
  const key = pollProfileKey();
  if(key === lastPollProfileKey) return;
  lastPollProfileKey = key;
  if(snapTimer){ clearTimeout(snapTimer); snapTimer=null; scheduleSnapshot(); }
  if(newsTimer){ clearTimeout(newsTimer); newsTimer=null; scheduleNews(); }
  if(communityRefreshTimer){ clearTimeout(communityRefreshTimer); communityRefreshTimer=null; scheduleCommunityRefresh(); }
  clearFastQuoteTimer();
  scheduleFastQuoteRefresh();
}
function scheduleSessionBoundaryRefresh(){
  if(shouldPauseDataRefreshForHidden() || sessionBoundaryTimer) return;
  const ms=msUntilClientSessionChange();
  if(ms == null) return;
  sessionBoundaryTimer=setTimeout(async ()=>{
    sessionBoundaryTimer=null;
    await loadSnapshot({force:true, reason:'session-boundary'});
    loadNews({force:true});
    scheduleSessionBoundaryRefresh();
  }, Math.min(ms + 1500, 24 * 60 * 60 * 1000));
}
function stopPolling(){
  if(snapTimer){ clearTimeout(snapTimer); snapTimer=null; }
  if(newsTimer){ clearTimeout(newsTimer); newsTimer=null; }
  if(sessionBoundaryTimer){ clearTimeout(sessionBoundaryTimer); sessionBoundaryTimer=null; }
  clearNewsRetryTimer();
  nextNewsAt = null;
  newsLoadQueued = false;
  clearCommunityRefresh();
  stopFastQuoteRefresh();
  updateNewsHint();
}

/* ============================================================
 *  Chat — D1-backed API with polling reads
 *  - Browser reads messages through Cloudflare polling proxy to reduce
 *    concurrent connections, message traffic, and backend cost.
 *  - /api/chat-config only exposes public config from Cloudflare env.
 * ============================================================ */
let chatConfig=null;
let chatInitPromise=null;
let chatMessages=[];
let chatLastSendAt=0;
let chatMobileSendPointerHandledUntil=0;
let chatReportedSet=null;
let chatIsOpen=false;
let chatConnectionStatus='연결 준비 중';
let chatIdleTimer=null;
let chatClosedPollTimer=null;
let chatClosedPollInFlight=false;
let chatOpenPollTimer=null;
let chatOpenPollInFlight=false;
let chatOpenPollTicks=0;
let chatLastSeenAt=null;
let chatPreviewMode=false;
let chatPreviewPollTimer=null;
let chatSendInFlight=false;
let chatLastActivityAt=Date.now();
let chatPanelLarge=readStringSetting(CHAT_SIZE_KEY, 'normal', new Set(['normal','large'])) === 'large';
let chatExcelMode=readBoolSetting(CHAT_EXCEL_MODE_KEY, false);
// 넓은 데스크탑(>=1600px)에 처음 접속한 사용자에겐 dock 을 기본 ON 으로 한다.
// 사용자가 한 번이라도 toggle 을 누르면 localStorage 가 '0'/'1' 로 저장되어
// 기본값이 더 이상 적용되지 않으므로, 명시적 선택을 덮어쓰지 않는다.
function defaultChatDockOn(){
  try{
    return !!(window.matchMedia && window.matchMedia(`(min-width: ${CHAT_DOCK_BREAKPOINT_PX}px) and (hover: hover) and (pointer: fine)`).matches);
  }catch{ return false; }
}
let chatDockRequested=readBoolSetting(CHAT_DOCK_KEY, defaultChatDockOn());
let chatPanelDragState=null;
const CHAT_DRAG_THRESHOLD_PX=4;
const CHAT_PANEL_MARGIN_PX=8;
const CHAT_MESSAGES_CACHE_KEY='kg_chat_messages_v1';
const CHAT_BOTTOM_THRESHOLD_PX=56;
let chatHasNewBelow=false;

let resumeRefreshPromise = null;
function cardsTableNeedsResumePrimer(){
  const table=document.getElementById('cardsTable');
  if(!table) return false;
  if(!lastRenderedCards.length) return true;
  if(table.querySelector('tr[data-quote-id]')) return false;
  // 초기 로딩 템플릿(loading-row + "데이터 조회 중...") 도 stale 상태로 본다.
  // 정규식만으로 잡으면 "데이터 조회 중" 문구가 누락돼 깨어남 후 복구가 안 된다.
  if(table.querySelector('.loading-row')) return true;
  const text=String(table.textContent || '');
  return !text.trim() || /시세를 새로 고치는 중|조회 실패|재시도 대기|데이터 조회 중/.test(text);
}
async function primeSnapshotForResume(){
  if(!cardsTableNeedsResumePrimer()) return;
  const cached = lastSnapshot && isValidSnapshot(lastSnapshot)
    ? { value:lastSnapshot }
    : sharedOrCachedSnapshotCache({ allowStale:true });
  if(!cached?.value) return;
  try{
    await renderSnapshot(cached.value);
    setLoading(false);
  }catch(_){}
}
function communityTableNeedsResumePrimer(){
  if(!timelineIsCommunity()) return false;
  const table=document.getElementById('timelineTable');
  if(!table) return false;
  const text=String(table.textContent || '').trim();
  return !text || !table.querySelector('tr');
}
function primeCommunityForResume(){
  if(!communityTableNeedsResumePrimer()) return false;
  try{
    renderCommunityTable(communityPosts.length ? 'ready' : 'loading');
    return true;
  }catch(_){
    return false;
  }
}
function withResumeTimeout(promise, timeoutMs, label){
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject)=>{
      setTimeout(()=>reject(new Error(`${label || 'resume'}_timeout`)), timeoutMs);
    }),
  ]);
}
function resetSuspendedInFlightLoads(inactiveMs){
  if(inactiveMs < INACTIVE_FORCE_REFRESH_MS) return;
  if(loadInFlight){
    loadInFlight=false;
    loadQueuedOptions=null;
  }
  if(newsLoadInFlight){
    newsLoadInFlight=false;
    newsLoadQueued=false;
  }
  if(communityLoadInFlight) communityLoadInFlight=false;
}
function resumeVisibleDataRefresh(inactiveMs=0){
  if(resumeRefreshPromise) return resumeRefreshPromise;
  resumeRefreshPromise = (async()=>{
    const force = inactiveMs >= INACTIVE_FORCE_REFRESH_MS;
    resetSuspendedInFlightLoads(inactiveMs);
    await primeSnapshotForResume();
    const communityPrimed = primeCommunityForResume();
    const snapshotTask=withResumeTimeout(
      loadSnapshot(force ? { force:true, reason:'resume-visible', silentResume:true } : {}),
      17000,
      'snapshot'
    );
    const timelineTask=timelineIsCommunity()
      ? withResumeTimeout(loadCommunityPosts({ silent:!communityPrimed, force }), 10000, 'community')
      : timelineIsEtf()
        ? withResumeTimeout(loadEtfData(force ? { force:true } : {}), 12000, 'etf')
        : withResumeTimeout(loadNews(force ? { force:true } : {}), 18000, 'news');
    const results=await Promise.allSettled([snapshotTask, timelineTask]);
    const failures=results.filter((item)=>item.status==='rejected');
    if(failures.length) debugWarn('resume refresh partial failure', failures.map((item)=>item.reason?.message || item.reason));
    startPolling();
  })().catch((e)=>{
    debugWarn('resume refresh failed', e);
    startPolling();
  }).finally(()=>{
    resumeRefreshPromise = null;
  });
  return resumeRefreshPromise;
}
function applyRestoredPersistentSettings(restoredAny){
  if(restoredAny){
    syncActiveTab();
    updateTimelineTabs();
    if(lastSnapshot){
      renderSnapshot(lastSnapshot);
      if(timelineIsEtf()) loadEtfData();
      else loadNews();
    }
  }
  return restoredAny;
}
let settingsRestoreApplied=false;
const rawSettingsRestorePromise = restorePersistentSettings().catch(()=>false);
const settingsRestorePromise = Promise.race([
  rawSettingsRestorePromise,
  sleep(1800).then(()=>false),
]).then((restoredAny)=>{
  if(restoredAny) settingsRestoreApplied=true;
  return applyRestoredPersistentSettings(restoredAny);
});
rawSettingsRestorePromise.then((restoredAny)=>{
  if(!restoredAny || settingsRestoreApplied) return;
  settingsRestoreApplied=true;
  applyRestoredPersistentSettings(restoredAny);
});
const sharedWatchlistImportPromise = settingsRestorePromise.then(()=>maybeImportSharedWatchlistFromUrl());
const initialSnapshotPromise = sharedWatchlistImportPromise.then(()=>loadSnapshot());
// 첫 진입 시 localStorage 캐시된 뉴스 즉시 표시 — cold start 빈 화면 방지
(function primeNewsFromCache(){
  try{
    const cached = readNewsCache();
    const payloadCached = readTimelinePayloadCache(currentNewsMarket());
    const initialItems = cached && cached.length
      ? cached
      : newsRowsFromTimeline(payloadCached?.data || []);
    if(initialItems && initialItems.length){
      initialItems.filter(isReadableFreshNews).forEach(n => {
        const k = newsKey(n);
        if(!newsSeenKeys.has(k) && !hasDuplicateNews(n)){
          newsSeenKeys.add(k);
          newsAccumulated.push({ ...n, _isNew:false, _addedAt:0 });
        }
      });
      sortNewsNewestFirst();
      renderAccumulatedNews();
    }
  }catch{}
})();
// 첫 진입은 시세표가 먼저 눈에 들어와야 한다. 뉴스/ETF fetch 는 스냅샷 첫 렌더
// 직후로 한 박자 늦춰 초기 main-thread 작업이 서로 끼어들지 않게 한다.
const initialTimelinePromise = sharedWatchlistImportPromise.then(async()=>{
  await Promise.race([
    initialSnapshotPromise.catch(()=>null),
    sleep(700),
  ]);
  await new Promise((resolve)=>requestAnimationFrame(resolve));
  return timelineIsEtf() ? loadEtfData() : loadNews();
});
Promise.allSettled([initialSnapshotPromise, initialTimelinePromise]).finally(()=>{
  startPolling();
  // 설정에서 화면 슬립 방지를 켜둔 상태라면 첫 user activation(클릭/탭) 직후
  // wake lock 요청. 대부분 모바일은 페이지 진입 자체를 user activation 으로
  // 인정하지만, iOS 는 보통 명시적 인터랙션 필요.
  requestWakeLockIfNeeded();
  const armWakeLock = ()=>{
    requestWakeLockIfNeeded();
    document.removeEventListener('pointerdown', armWakeLock);
    document.removeEventListener('touchstart', armWakeLock);
    document.removeEventListener('keydown', armWakeLock);
  };
  document.addEventListener('pointerdown', armWakeLock, { passive:true, once:true });
  document.addEventListener('touchstart', armWakeLock, { passive:true, once:true });
  document.addEventListener('keydown', armWakeLock, { once:true });
});
// 30분 이상 백그라운드에 있던 페이지는 부분 복구 대신 새 로드. 캐시·snapshot·
// 빌드 버전 모두 stale 가능성이 커서 그게 더 안전·빠르다.
const RESUME_HARD_RELOAD_MS = 30 * 60 * 1000;
function hardReloadForStaleResume(reason='long-idle-resume'){
  try{ sessionStorage.setItem('kg_last_reload_reason_v1', reason); }catch{}
  try{
    const url=new URL(window.location.href);
    url.searchParams.set('kg_resume', String(Date.now()));
    window.location.replace(url.toString());
  }catch{
    window.location.reload();
  }
}
function clearResumeUrlMarker(){
  try{
    const url=new URL(window.location.href);
    if(!url.searchParams.has('kg_resume')) return;
    url.searchParams.delete('kg_resume');
    const clean = `${url.pathname}${url.search}${url.hash}` || '/';
    history.replaceState(null, document.title, clean);
  }catch{}
}
clearResumeUrlMarker();
function handleVisibleResume(inactiveMs=0){
  if(inactiveMs >= RESUME_HARD_RELOAD_MS){
    hardReloadForStaleResume();
    return;
  }
  resumeVisibleDataRefresh(inactiveMs);
}
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    pageHiddenAt = Date.now();
    scheduleHiddenDataPause();
    return;
  }
  const inactiveMs = pageHiddenAt ? Date.now() - pageHiddenAt : 0;
  pageHiddenAt = 0;
  clearHiddenDataPauseTimer();
  handleVisibleResume(inactiveMs);
});
// BFCache 복원(브라우저 뒤로/앞으로, 일부 모바일 백그라운드 복귀) — visibilitychange
// 가 안 떠서 resumeVisibleDataRefresh 가 누락되는 경우가 있다. pageshow.persisted
// 가 true 면 명시적으로 resume 호출.
window.addEventListener('pageshow', (ev)=>{
  if(!ev.persisted) return;
  const inactiveMs = pageHiddenAt ? Date.now() - pageHiddenAt : 60 * 1000;
  pageHiddenAt = 0;
  clearHiddenDataPauseTimer();
  handleVisibleResume(inactiveMs);
});
window.addEventListener('scroll', hideMiniChart, {passive:true});
window.addEventListener('resize', hideMiniChart, {passive:true});
document.getElementById('tvChartClose')?.addEventListener('click', closeTradingViewChart);
setupTradingViewResize();
setupSheetSplitResize();
document.addEventListener('click', (ev)=>{
  if(miniChartMode!=='touch' || !miniChartEl) return;
  if(miniChartEl.contains(ev.target)) return;
  if(ev.target?.closest?.('#cardsTable .quote-price-cell,#cardsTable .quote-change-cell')) return;
  hideMiniChart();
});
let lastNewsCompactState = null;
window.addEventListener('resize', ()=>{
  applySheetSplitLayout({save:true});
  if(timelineIsCommunity()){
    const nextCompact = communityCompactLayout();
    if(nextCompact !== communityCompactMode) renderCommunityTable();
  } else if(timelineIsEtf()){
    try{ renderEtfBrowser(); }catch(_){}
  } else {
    // news 도 viewport 가 1100 임계를 넘나들면 다시 렌더 (5-col ↔ 3-col).
    const nextNewsCompact = newsCompactLayout();
    if(lastNewsCompactState !== null && nextNewsCompact !== lastNewsCompactState){
      try{ renderAccumulatedNews(); }catch(_){}
    }
    lastNewsCompactState = nextNewsCompact;
  }
}, {passive:true});

// ============================================================
//  Timeline 패널이 좁아지면 body.timeline-narrow 토글.
//  데스크탑이라도 우측 사이드바를 좁게 줄였을 때 news 5-컬럼 레이아웃의
//  '요약' / '링크' 칼럼이 우그러져 보이던 문제 해결.
//  토글이 바뀌면 news/community 모두 다시 렌더해 compact 레이아웃으로 전환.
// ============================================================
const TIMELINE_NARROW_PX = 560;
function syncTimelineNarrowClass(width){
  const w = Math.round(Number(width) || 0);
  // viewport 가 모바일이면 이미 max-width:700 으로 compact 라 굳이 토글할 필요 없음.
  const isMobileVp = !!window.matchMedia?.('(max-width:700px)')?.matches;
  const shouldBe = !isMobileVp && w > 0 && w < TIMELINE_NARROW_PX;
  const cur = document.body?.classList.contains('timeline-narrow');
  if(shouldBe === cur) return false;
  document.body?.classList.toggle('timeline-narrow', shouldBe);
  // 너비 깡총 뛰면 news + community 모두 다시 렌더해야 compact 폼이 적용됨.
  if(timelineIsCommunity()){
    try{ renderCommunityTable(); }catch(_){}
  }else if(timelineIsEtf()){
    try{ renderEtfBrowser(); }catch(_){}
  }else{
    try{ renderAccumulatedNews(); }catch(_){}
  }
  return true;
}
(function watchTimelinePaneWidth(){
  const el = document.querySelector('.col-timeline');
  if(!el) return;
  if(typeof ResizeObserver === 'function'){
    new ResizeObserver((entries)=>{
      const rect = entries[0]?.contentRect;
      syncTimelineNarrowClass(rect?.width);
    }).observe(el);
  }else{
    window.addEventListener('resize', ()=>syncTimelineNarrowClass(el.getBoundingClientRect().width), {passive:true});
  }
  // 첫 회 한 번 동기화
  syncTimelineNarrowClass(el.getBoundingClientRect().width);
})();
document.addEventListener('keydown', (ev)=>{
  if(ev.key==='Escape'){
    hideMiniChart();
    closeTradingViewChart();
    closeMobileTradingViewChart();
  }
});
// Presence:
//  - POST ping: 5분. Durable Object 집계가 기본이며 KV fallback 은 비용 보호상 사용하지 않는다.
pingPresence({force:true});
setInterval(pingPresence, 5*60*1000);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){ pingPresence({force:true}); }
});

function chatUserId(){
  return `web_${visitorId()}`;
}

function isInlineAdmin(){
  return !!inlineAdminToken;
}

function nicknameKey(value){
  return String(value || '').replace(/\s+/g, '').trim();
}

function reservedAdminNickname(value){
  const key=nicknameKey(value);
  if(key === ADMIN_NICKNAME) return ADMIN_NICKNAME;
  if(key === AI_BOT_NICKNAME) return AI_BOT_NICKNAME;
  return '';
}

function isReservedAdminNickname(value){
  return !!reservedAdminNickname(value);
}

function hasAdminKeywordNickname(value){
  const key=nicknameKey(value);
  return key.includes('관리') || key.includes('운영');
}

function persistChatNickname(nick){
  try{
    localStorage.setItem(CHAT_NICK_KEY, nick);
    persistSet(CHAT_NICK_KEY, nick);
  }catch{}
}

function enforceChatNicknameInput(){
  if(isInlineAdmin()) return false;
  const el=chatEls().nick;
  if(!el || !hasAdminKeywordNickname(el.value)) return false;
  el.value = CHAT_IMPERSONATION_NICKNAME;
  persistChatNickname(CHAT_IMPERSONATION_NICKNAME);
  return true;
}

function syncInlineAdminUi(){
  document.body?.classList.toggle('inline-admin-mode', isInlineAdmin());
  const icon=document.querySelector('.app-icon');
  if(icon) icon.title = isInlineAdmin() ? '관리자 모드 · 클릭하면 로그아웃' : getBrowserDocumentTitle();
  syncAdminNicknameInputs();
  renderServerStatus();
}

function syncAdminNicknameInputs(){
  const chatNick=chatEls().nick;
  if(chatNick){
    if(isInlineAdmin()){
      chatNick.value = ADMIN_NICKNAME;
      chatNick.disabled = true;
      chatNick.title = '관리자 모드에서는 닉네임이 관리자입니다';
    }else{
      const busy=!!chatNick.closest?.('.is-sending');
      chatNick.disabled = busy;
      chatNick.title = '';
      if(hasAdminKeywordNickname(chatNick.value)) chatNick.value = CHAT_IMPERSONATION_NICKNAME;
    }
  }
  ['communityNick','communityReplyNick'].forEach((id)=>{
    const el=document.getElementById(id);
    if(!el) return;
    if(isInlineAdmin()){
      el.value = ADMIN_NICKNAME;
      el.disabled = true;
      el.title = '관리자 모드에서는 닉네임이 관리자입니다';
    }else{
      const busy=!!el.closest?.('.is-sending');
      el.disabled = busy;
      el.title = '';
      if(isReservedAdminNickname(el.value)) el.value = communityDefaultNickname();
    }
  });
}

function adminAuthHeaders(extra={}){
  return {
    ...extra,
    authorization: `Bearer ${inlineAdminToken}`,
  };
}

async function fetchInlineAdminJson(url, body, timeoutMs=7000){
  if(!isInlineAdmin()) throw new Error('관리자 로그인이 필요합니다');
  const init = body
    ? { method:'POST', headers:adminAuthHeaders({'content-type':'application/json'}), body:JSON.stringify(body) }
    : { headers:adminAuthHeaders() };
  return fetchJsonClient(url, timeoutMs, init);
}

async function ensureInlineAdminUnbanned(options={}){
  if(!isInlineAdmin()) return;
  try{
    await fetchInlineAdminJson('/api/chat-admin', { action:'unban_user', user_id:chatUserId() }, 7000);
  }catch(e){
    if(!options.silent) showToast(`관리자 채팅 제한 해제 실패: ${e.message || e}`, 'warn');
  }
}

function setInlineAdminToken(token, options={}){
  inlineAdminToken = String(token || '').trim();
  try{
    if(inlineAdminToken) sessionStorage.setItem(ADMIN_SESSION_KEY, inlineAdminToken);
    else sessionStorage.removeItem(ADMIN_SESSION_KEY);
  }catch{}
  syncInlineAdminUi();
  if(inlineAdminToken) void ensureInlineAdminUnbanned({ silent:true });
  if(timelineIsCommunity()) loadCommunityPosts({ force:true });
  renderChatMessages();
  if(!options.silent) showToast(inlineAdminToken ? '관리자 모드로 전환했습니다' : '관리자 모드를 종료했습니다', 'info');
}

async function promptInlineAdminLogin(){
  if(isInlineAdmin()){
    if(window.confirm('관리자 모드를 종료할까요?')) setInlineAdminToken('');
    return;
  }
  const token=window.prompt('관리자 암호를 입력하세요');
  if(!token) return;
  const previous=inlineAdminToken;
  inlineAdminToken = String(token || '').trim();
  try{
    await fetchInlineAdminJson('/api/community-admin?limit=1', null, 6000);
    setInlineAdminToken(inlineAdminToken);
  }catch(e){
    inlineAdminToken = previous;
    syncInlineAdminUi();
    showToast(e?.status===401 ? '관리자 암호가 맞지 않습니다' : `관리자 로그인 실패: ${e.message || e}`, 'err');
  }
}

function setupInlineAdmin(){
  if(inlineAdminToken){
    syncInlineAdminUi();
    void ensureInlineAdminUnbanned({ silent:true });
  }
  const icon=document.querySelector('.app-icon');
  if(!icon) return;
  let taps=0;
  let resetTimer=null;
  icon.addEventListener('click', (ev)=>{
    if(isInlineAdmin()){
      ev.preventDefault();
      taps=0;
      if(resetTimer){
        clearTimeout(resetTimer);
        resetTimer=null;
      }
      setInlineAdminToken('');
      return;
    }
    taps += 1;
    if(resetTimer) clearTimeout(resetTimer);
    resetTimer=setTimeout(()=>{ taps=0; resetTimer=null; }, 1600);
    if(taps < 5) return;
    ev.preventDefault();
    taps=0;
    if(resetTimer){
      clearTimeout(resetTimer);
      resetTimer=null;
    }
    promptInlineAdminLogin();
  });
}

function pwaInstallDismissedRecently(){
  try{
    const dismissedAt=Number(localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) || 0);
    return dismissedAt > 0 && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000;
  }catch{ return true; }
}

function setPwaInstallDismissed(){
  try{
    const value=String(Date.now());
    localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, value);
    persistSet(PWA_INSTALL_DISMISSED_KEY, value);
  }catch{}
}

function setupPwaInstallPrompt(){
  const btn=document.getElementById('pwaInstall');
  if(!btn || IS_STANDALONE) return;
  const showInstallButton=()=>{
    if(!deferredPwaInstallPrompt || pwaInstallDismissedRecently()) return;
    btn.hidden=false;
  };
  window.addEventListener('beforeinstallprompt', (ev)=>{
    ev.preventDefault();
    deferredPwaInstallPrompt=ev;
    showInstallButton();
  });
  btn.addEventListener('click', async ()=>{
    if(!deferredPwaInstallPrompt){
      showToast('브라우저 메뉴에서 홈 화면에 추가하면 앱처럼 열 수 있어요', 'info');
      btn.hidden=true;
      setPwaInstallDismissed();
      return;
    }
    const promptEvent=deferredPwaInstallPrompt;
    deferredPwaInstallPrompt=null;
    btn.hidden=true;
    try{
      await promptEvent.prompt();
      const choice=await promptEvent.userChoice;
      if(choice?.outcome === 'accepted') showToast('앱 설치가 시작됐습니다', 'info');
      else setPwaInstallDismissed();
    }catch{
      showToast('브라우저 메뉴에서 홈 화면에 추가하면 앱처럼 열 수 있어요', 'info');
      setPwaInstallDismissed();
    }
  });
  window.addEventListener('appinstalled', ()=>{
    deferredPwaInstallPrompt=null;
    btn.hidden=true;
  });
}

function setupBookmarkPrompt(){
  const btn=document.getElementById('bookmarkTip');
  if(!btn || IS_STANDALONE) return;
  const isMac=/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
  const shortcut=isMac ? '⌘D' : 'Ctrl+D';
  btn.addEventListener('click', ()=>{
    showToast(`브라우저 보안상 자동 추가창은 못 띄워요. 지금 ${shortcut}를 누르면 즐겨찾기에 추가할 수 있습니다.`, 'info');
  });
}

function chatNickname(){
  const el=chatEls().nick;
  if(isInlineAdmin()){
    if(el){
      el.value = ADMIN_NICKNAME;
      el.disabled = true;
    }
    return ADMIN_NICKNAME;
  }
  const raw=(el?.value || '').trim();
  const fallback=`월급루팡_${chatUserId().slice(-3)}`;
  const nick=(hasAdminKeywordNickname(raw) ? CHAT_IMPERSONATION_NICKNAME : (raw || fallback)).slice(0,24);
  persistChatNickname(nick);
  if(el && el.value !== nick) el.value=nick;
  return nick;
}

function communityDefaultNickname(){
  const id=chatUserId().replace(/[^a-f0-9]/gi, '');
  return `익명_${(id || chatUserId()).slice(-3)}`;
}

function savedCommunityNickname(){
  try{ return (localStorage.getItem(COMMUNITY_NICK_KEY) || '').trim().slice(0,24); }
  catch{ return ''; }
}

function communityNicknameForInput(){
  if(isInlineAdmin()) return ADMIN_NICKNAME;
  const existing=document.getElementById('communityNick');
  const value=existing ? existing.value : (savedCommunityNickname() || communityDefaultNickname());
  return isReservedAdminNickname(value) ? communityDefaultNickname() : value;
}

function communityNicknameForSend(raw){
  if(isInlineAdmin()) return ADMIN_NICKNAME;
  const value=(String(raw || '').trim() || savedCommunityNickname() || communityDefaultNickname()).slice(0,24);
  const reserved=reservedAdminNickname(value);
  if(reserved){
    showToast(`${reserved} 닉네임은 관리자만 사용할 수 있습니다`, 'warn');
    return '';
  }
  return value;
}

function saveCommunityNickname(nick){
  const value=String(nick || '').trim().slice(0,24);
  if(isInlineAdmin() || isReservedAdminNickname(value)) return;
  try{
    if(value){
      localStorage.setItem(COMMUNITY_NICK_KEY, value);
      persistSet(COMMUNITY_NICK_KEY, value);
    }else{
      localStorage.removeItem(COMMUNITY_NICK_KEY);
      persistSet(COMMUNITY_NICK_KEY, '');
    }
  }catch{}
}

function chatReported(){
  if(chatReportedSet) return chatReportedSet;
  try{ chatReportedSet = new Set(JSON.parse(localStorage.getItem(CHAT_REPORTED_KEY)||'[]')); }
  catch{ chatReportedSet = new Set(); }
  return chatReportedSet;
}

function saveChatReported(){
  try{ localStorage.setItem(CHAT_REPORTED_KEY, JSON.stringify(Array.from(chatReported()).slice(-200))); }catch{}
}

function readChatMessagesCache(){
  try{
    const parsed=JSON.parse(localStorage.getItem(CHAT_MESSAGES_CACHE_KEY) || 'null');
    const rows=Array.isArray(parsed?.messages) ? parsed.messages : [];
    if(Date.now() - Number(parsed?.at || 0) > 10 * 60 * 1000) return [];
    return rows.filter((msg)=>msg && !msg.deleted_at).slice(-CHAT_INITIAL_LIMIT);
  }catch{ return []; }
}

function writeChatMessagesCache(rows){
  try{
    localStorage.setItem(CHAT_MESSAGES_CACHE_KEY, JSON.stringify({
      at:Date.now(),
      messages:(Array.isArray(rows) ? rows : []).slice(-CHAT_INITIAL_LIMIT),
    }));
  }catch{}
}

function primeChatMessagesFromCache(){
  if(chatMessages.length) return false;
  const cached=readChatMessagesCache();
  if(!cached.length) return false;
  chatMessages=cached;
  renderChatMessages();
  return true;
}

function initChatLastSeenAt(){
  if(chatLastSeenAt) return chatLastSeenAt;
  try{
    const saved=localStorage.getItem(CHAT_LAST_SEEN_KEY);
    if(saved && !Number.isNaN(Date.parse(saved))) chatLastSeenAt=saved;
  }catch{}
  if(!chatLastSeenAt) chatLastSeenAt=new Date().toISOString();
  try{ localStorage.setItem(CHAT_LAST_SEEN_KEY, chatLastSeenAt); }catch{}
  return chatLastSeenAt;
}

function newestChatCreatedAt(){
  return chatMessages.reduce((latest, msg)=>{
    const ts=Date.parse(msg?.created_at);
    if(!Number.isFinite(ts)) return latest;
    return !latest || ts>Date.parse(latest) ? msg.created_at : latest;
  }, null);
}

function sharedChatMessagesPayload(limit, maxAgeMs=Math.max(6500, chatMessagesIntervalMs())){
  const item=runtimeShared.chatMessages;
  if(!item || !Array.isArray(item.data?.messages)) return null;
  if(Number(item.limit || 0) < Number(limit || 0)) return null;
  return Date.now() - Number(item.at || 0) <= maxAgeMs ? item.data : null;
}

function waitForSharedChatMessages(limit, timeoutMs=900){
  return waitForSharedValue(()=>sharedChatMessagesPayload(limit), timeoutMs);
}

function markChatSeen(){
  const latest=newestChatCreatedAt();
  chatLastSeenAt=latest || new Date().toISOString();
  try{ localStorage.setItem(CHAT_LAST_SEEN_KEY, chatLastSeenAt); }catch{}
  setChatUnread(false);
}

function renderChatStatus(){
  const el=chatEls().status;
  if(!el) return;
  const viewers = Number.isFinite(presenceState.chatOnline)
    ? presenceState.chatOnline
    : chatPresenceCount;
  const chatCount = Number.isFinite(Number(viewers)) ? Math.max(0, Number(viewers)) : 0;
  const siteOnline = Number.isFinite(Number(presenceState.online)) ? Math.max(0, Number(presenceState.online)) : null;
  const baseText = `채팅 ${chatCount}명 · 사이트 동접 ${siteOnline == null ? '-' : siteOnline}명`;
  const showStatus = /지연|오류|실패|절전|닫힘|설정|불러오는|미리보기/.test(chatConnectionStatus || '');
  const statusText = showStatus ? `${baseText} · ${chatConnectionStatus}` : baseText;
  el.innerHTML=`<span class="chat-live-dot" aria-hidden="true"></span><span>${esc(statusText)}</span>`;
}
function chatSetStatus(text){
  const wasSleeping=chatShouldShowSleepNotice();
  chatConnectionStatus=text;
  renderChatStatus();
  if(wasSleeping !== chatShouldShowSleepNotice()) renderChatMessages();
}
function setChatUnread(on){
  const btn=chatEls().toggle;
  if(!btn) return;
  btn.classList.toggle('has-unread', !!on);
}

function chatDistanceFromBottom(body=chatEls().body){
  if(!body) return 0;
  return Math.max(0, body.scrollHeight - body.scrollTop - body.clientHeight);
}

function chatIsNearBottom(body=chatEls().body){
  return chatDistanceFromBottom(body) <= CHAT_BOTTOM_THRESHOLD_PX;
}

function updateChatNewBelowButton(body=chatEls().body){
  if(!body) return;
  const existing=body.querySelector('[data-chat-new-below]');
  if(!chatHasNewBelow){
    existing?.remove();
    return;
  }
  if(existing) return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='chat-new-inline';
  btn.dataset.chatNewBelow='1';
  btn.textContent='새 채팅 있음';
  btn.addEventListener('click',()=>{
    chatHasNewBelow=false;
    renderChatMessages({forceBottom:true});
    markChatSeen();
  });
  body.appendChild(btn);
}

function handleChatBodyScroll(){
  const body=chatEls().body;
  if(!body || !chatIsNearBottom(body)) return;
  if(chatHasNewBelow){
    chatHasNewBelow=false;
    updateChatNewBelowButton(body);
  }
  if(chatIsOpen && !document.hidden) markChatSeen();
}

function clearChatIdleTimer(){
  if(chatIdleTimer){
    clearTimeout(chatIdleTimer);
    chatIdleTimer=null;
  }
}

function clearChatPreviewPoll(){
  if(chatPreviewPollTimer){
    clearInterval(chatPreviewPollTimer);
    chatPreviewPollTimer=null;
  }
}

function clearOpenChatPoll(){
  if(chatOpenPollTimer){
    clearInterval(chatOpenPollTimer);
    chatOpenPollTimer=null;
  }
}

function chatOpenPollInterval(){
  return document.hidden
    ? Math.max(scaleMs(CHAT_HIDDEN_OPEN_POLL_MS), chatMessagesIntervalMs())
    : chatMessagesIntervalMs();
}
function chatPreviewPollInterval(){
  return document.hidden
    ? Math.max(scaleMs(CHAT_HIDDEN_PREVIEW_POLL_MS), chatMessagesIntervalMs())
    : Math.max(scaleMs(CHAT_CLOSED_POLL_MS), chatMessagesIntervalMs());
}
function chatClosedPollInterval(){
  return document.hidden
    ? Math.max(scaleMs(CHAT_HIDDEN_CLOSED_POLL_MS), chatMessagesIntervalMs())
    : Math.max(scaleMs(CHAT_CLOSED_POLL_MS), chatMessagesIntervalMs());
}
function restartOpenChatPoll(options={}){
  clearOpenChatPoll();
  startOpenChatPoll(options);
}

function startOpenChatPoll({immediate=false}={}){
  if(!chatIsOpen || chatPollingSleeping) return;
  if(!chatOpenPollTimer){
    chatOpenPollTimer=setInterval(()=>{
      pollOpenChat().catch(()=>{});
    }, chatOpenPollInterval());
  }
  if(immediate) pollOpenChat().catch(()=>{});
}

async function pollOpenChat(){
  if(!chatIsOpen || chatPollingSleeping || chatOpenPollInFlight) return;
  chatOpenPollInFlight=true;
  try{
    chatOpenPollTicks++;
    const latest=newestChatCreatedAt();
    if(!latest || chatOpenPollTicks % 12 === 0) await loadChatMessages({ markSeen:false });
    else await loadChatMessages({ since: latest, append:true, markSeen:false });
    if(chatIsOpen && !document.hidden && chatIsNearBottom()) markChatSeen();
    else if(chatHasNewBelow) setChatUnread(true);
    chatSetStatus(document.hidden ? '백그라운드 저속 확인 중' : chatRefreshStatusText());
  }catch{
    chatSetStatus('갱신 지연');
  }finally{
    chatOpenPollInFlight=false;
  }
}

function chatIdleSleepMs(){
  const online=Number(presenceState.online);
  if(!Number.isFinite(online)) return CHAT_IDLE_SLEEP_LOW_MS;
  if(online < 100) return CHAT_IDLE_SLEEP_CALM_MS;
  if(online < 500) return CHAT_IDLE_SLEEP_LOW_MS;
  if(online < 1500) return CHAT_IDLE_SLEEP_MID_MS;
  if(online < 3000) return CHAT_IDLE_SLEEP_HIGH_MS;
  return CHAT_IDLE_SLEEP_PEAK_MS;
}

function chatIdleSleepLabel(){
  return statusMsLabel(chatIdleSleepMs());
}

function rescheduleChatIdleForPresence(){
  if(chatIsOpen && !chatPollingSleeping) startChatIdleSleepTimer();
}

function startChatIdleSleepTimer(ms){
  clearChatIdleTimer();
  if(!chatIsOpen) return;
  const windowMs=Number.isFinite(ms) && ms>0 ? ms : chatIdleSleepMs();
  const elapsed=Math.max(0, Date.now() - Number(chatLastActivityAt || Date.now()));
  const remaining=Math.max(0, windowMs - elapsed);
  chatIdleTimer=setTimeout(()=>{
    if(chatIsOpen) sleepOpenChatPolling();
  }, remaining);
}

function sleepOpenChatPolling(){
  chatPollingSleeping=true;
  clearOpenChatPoll();
  setChatPresenceOpen(false);
  chatSetStatus('절전 중 · 새 글 확인 중단');
  renderChatMessages();
}

function wakeOpenChatPolling({immediate=false}={}){
  if(!chatIsOpen) return;
  const wasSleeping=chatPollingSleeping;
  chatPollingSleeping=false;
  if(wasSleeping) chatLastActivityAt=Date.now();
  setChatPresenceOpen(!document.hidden);
  startOpenChatPoll({immediate: immediate || wasSleeping});
  startChatIdleSleepTimer();
  if(wasSleeping) chatSetStatus(document.hidden ? '백그라운드 저속 확인 중' : chatRefreshStatusText());
}

function resetChatPollingState(status='연결 해제됨'){
  clearChatIdleTimer();
  clearChatPreviewPoll();
  clearOpenChatPoll();
  chatInitPromise=null;
  chatPresenceCount=0;
  chatSetStatus(status);
  if(chatIsOpen) renderChatMessages();
}

function chatShouldShowSleepNotice(){
  return chatIsOpen && String(chatConnectionStatus || '').includes('절전');
}

function chatSleepNoticeHtml(){
  if(!chatShouldShowSleepNotice()) return '';
  const label = esc(chatIdleSleepLabel());
  const text = chatDockActive()
    ? `${label} 미사용으로 절전 중입니다. 클릭하면 다시 확인합니다.`
    : `${label} 미사용으로 절전 중입니다. 채팅창을 누르면 다시 확인합니다.`;
  return `<div class="chat-sleep-notice">${text}</div>`;
}

function chatFriendlyErrorText(error, label='채팅 연결'){
  const msg=String(error?.message || error || '');
  if(/timeout|abort|aborted|failed to fetch|network/i.test(msg)){
    return `${label}이 지연되고 있습니다. 잠시 후 자동으로 다시 시도합니다.`;
  }
  return `${label}이 잠시 불안정합니다. 잠시 후 다시 시도합니다.`;
}

function renderChatConnectionError(error, label='채팅 연결'){
  chatSetStatus('로딩 지연');
  renderChatSystem(chatFriendlyErrorText(error, label));
}

function noteChatActivity(ev){
  if(!chatIsOpen) return;
  if(ev?.target?.closest?.('#chatClose')) return;
  chatLastActivityAt=Date.now();
  if(chatPreviewMode){
    chatPreviewMode=false;
    clearChatPreviewPoll();
  }
  wakeOpenChatPolling({immediate:chatPollingSleeping});
  initChat().catch((e)=>renderChatConnectionError(e, '채팅 연결'));
}

function setChatOpen(open, options={}){
  const connect=options.connect !== false;
  const persist=options.persist !== false;
  const {panel,toggle}=chatEls();
  chatIsOpen=!!open;
  document.body.classList.toggle('chat-open', chatIsOpen);
  panel?.classList.toggle('open', chatIsOpen);
  toggle?.setAttribute('aria-expanded', chatIsOpen ? 'true' : 'false');
  applyChatDockMode();
  if(persist){
    try{ localStorage.setItem(CHAT_OPEN_KEY, chatIsOpen ? '1' : '0'); }catch{}
  }
  if(chatIsOpen){
    chatPollingSleeping=false;
    chatHasNewBelow=false;
    chatLastActivityAt=Date.now();
    setChatPresenceOpen(true);
    clearClosedChatPoll();
    setChatUnread(false);
    if(!primeChatMessagesFromCache()) renderChatLoading();
    if(connect){
      chatPreviewMode=false;
      clearChatPreviewPoll();
      initChat().catch((e)=>renderChatConnectionError(e, '채팅 연결'));
    }else{
      chatPreviewMode=true;
      initChatPreview().catch((e)=>renderChatConnectionError(e, '채팅 미리보기'));
    }
    try{ window.loadChatDonors?.(); }catch{}
    requestAnimationFrame(()=>{
      applyChatPanelPosition({saveClamp:true});
      scrollChatToBottom();
    });
    startChatIdleSleepTimer();
  }else{
    chatPollingSleeping=false;
    setChatPresenceOpen(false);
    chatPreviewMode=false;
    clearChatPreviewPoll();
    markChatSeen();
    resetChatPollingState('닫힘 · 연결 안 함');
    startClosedChatPoll({immediate:false});
  }
}

function renderChatSystem(text){
  const body=chatEls().body;
  if(body) body.innerHTML=`<div class="chat-system">${esc(text)}</div>`;
}

function renderChatLoading(text='채팅 불러오는 중...'){
  const body=chatEls().body;
  if(!body) return;
  if(chatMessages.length){
    renderChatMessages();
    const loading=document.createElement('div');
    loading.className='chat-loading-inline';
    loading.innerHTML=`<span class="chat-loading-spin" aria-hidden="true"></span><span>${esc(text)}</span>`;
    body.appendChild(loading);
    scrollChatToBottom();
    return;
  }
  body.innerHTML=`<div class="chat-loading" role="status" aria-live="polite">
    <span class="chat-loading-spin" aria-hidden="true"></span>
    <b>${esc(text)}</b>
    <small>최근 메시지를 확인하고 있습니다</small>
  </div>`;
}

async function ensureChatConfig(){
  if(!chatConfig){
    chatConfig=await fetchJsonClient('/api/chat-config', 5000);
    window.__excelkospiChatConfig=chatConfig;
    try{ window.applyChatDonorsPayload?.(chatConfig?.donors); }catch{}
  }
  return chatConfig;
}

async function initChatPreview(){
  chatSetStatus('미리보기');
  const cfg=await ensureChatConfig();
  if(!cfg?.enabled){
    chatSetStatus('설정 필요');
    renderChatSystem('채팅 저장소 연결이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
    return null;
  }
  if(!chatIsOpen || !chatPreviewMode) return cfg;
  await loadChatMessages({ markSeen:false });
  chatSetStatus('미리보기');
  if(!chatPreviewPollTimer){
    chatPreviewPollTimer=setInterval(()=>{
      if(chatIsOpen && chatPreviewMode) {
        loadChatMessages().catch(()=>{});
      }
    }, chatPreviewPollInterval());
  }
  return cfg;
}

async function initChat(){
  if(chatInitPromise) return chatInitPromise;
  chatInitPromise=(async()=>{
    chatSetStatus('불러오는 중...');
    renderChatLoading();
    const cfg=await ensureChatConfig();
    if(!cfg?.enabled){
      chatSetStatus('설정 필요');
      renderChatSystem('채팅 저장소 연결이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
      return null;
    }
    if(!chatIsOpen){
      chatSetStatus('닫힘 · 연결 안 함');
      return cfg;
    }
    try{
      await loadChatMessages();
    }catch(e){
      // 첫 진입 fetch 가 Chrome/네트워크에서 순간 실패해도 입력창은 살리고 다음 폴링에서 복구한다.
      renderChatConnectionError(e, '채팅 연결');
      startOpenChatPoll({immediate:false});
      startChatIdleSleepTimer();
      return cfg;
    }
    if(!chatIsOpen){
      chatSetStatus('닫힘 · 연결 안 함');
      return cfg;
    }
    chatSetStatus(document.hidden ? '백그라운드 저속 확인 중' : chatRefreshStatusText());
    startOpenChatPoll();
    startChatIdleSleepTimer();
    return cfg;
  })().catch((e)=>{
    chatInitPromise=null;
    throw e;
  });
  return chatInitPromise;
}

async function loadChatMessages(options={}){
  const cfg=await ensureChatConfig();
  if(!cfg?.enabled) return;
  const since=options.since || '';
  const limit=since || options.append ? CHAT_DELTA_LIMIT : CHAT_INITIAL_LIMIT;
  const query = `/api/chat-messages?limit=${encodeURIComponent(limit)}${options.force ? '&fresh=1' : ''}`;
  const lockKey=`chat-messages:${limit}`;
  let lockAcquired=false;
  let data=!options.force ? sharedChatMessagesPayload(limit) : null;
  if(!data){
    if(!options.force){
      lockAcquired=tryAcquireSharedPollLock(lockKey, 9000);
      if(!lockAcquired){
        data=await waitForSharedChatMessages(limit, 900);
        if(!data) lockAcquired=tryAcquireSharedPollLock(lockKey, 4000);
      }
    }
    if(!data){
      try{
        data=await fetchJsonClient(query, 6000, {
          cache:options.force ? 'reload' : 'default',
        });
        if(data?.ok && Array.isArray(data.messages)){
          runtimeShared.chatMessages={at:Date.now(), limit, data};
          postRuntimeMessage('chat-messages', {limit, messages:data.messages, ok:true, enabled:data.enabled});
        }
      }finally{
        if(lockAcquired) releaseSharedPollLock(lockKey);
      }
    }
  }
  const rows=Array.isArray(data?.messages) ? data.messages : [];
  let changed=false;
  const incremental=!!(since || options.append);
  const wasNearBottom=chatIsNearBottom();
  if(since || options.append){
    for(const msg of rows.filter((item)=>!since || String(item.created_at || '') > String(since))){
      if(addChatMessage(msg, {render:false})) changed=true;
    }
    if(chatMessages.length>80) chatMessages=chatMessages.slice(-80);
  }else{
    chatMessages=rows.slice(-CHAT_INITIAL_LIMIT);
    changed=true;
  }
  if(changed || options.force || !incremental){
    writeChatMessagesCache(chatMessages);
    renderChatMessages({
      preserveScroll: incremental,
      showNewBelow: incremental && changed && !wasNearBottom,
    });
  }
  if(chatIsOpen && !document.hidden && options.markSeen !== false && chatIsNearBottom()) markChatSeen();
}

function clearClosedChatPoll(){
  if(chatClosedPollTimer){
    clearInterval(chatClosedPollTimer);
    chatClosedPollTimer=null;
  }
}

async function pollClosedChatUnread(){
  if(chatIsOpen || chatClosedPollInFlight) return;
  chatClosedPollInFlight=true;
  try{
    const cfg=await ensureChatConfig();
    if(!cfg?.enabled) return;
    const seen=initChatLastSeenAt();
    const data=await fetchJsonClient('/api/chat-messages?limit=20', 5000, {
      cache:'default',
    });
    const rows=(Array.isArray(data?.messages) ? data.messages : [])
      .filter((row)=>String(row?.created_at || '') > String(seen));
    if(!Array.isArray(rows) || !rows.length) return;
    const hasUnread=rows.some((row)=>row?.user_id && row.user_id !== chatUserId());
    if(hasUnread) setChatUnread(true);
    const ownOnly=!hasUnread && rows[0]?.created_at;
    if(ownOnly){
      chatLastSeenAt=rows[0].created_at;
      try{ localStorage.setItem(CHAT_LAST_SEEN_KEY, chatLastSeenAt); }catch{}
    }
  }catch{
    // Closed-state polling is opportunistic; keep the main page quiet on failure.
  }finally{
    chatClosedPollInFlight=false;
  }
}

function startClosedChatPoll({immediate=false}={}){
  initChatLastSeenAt();
  if(chatIsOpen) return;
  if(!chatClosedPollTimer) chatClosedPollTimer=setInterval(pollClosedChatUnread, chatClosedPollInterval());
  if(immediate) pollClosedChatUnread();
}

function addChatMessage(msg, options={}){
  if(!msg || msg.deleted_at) return false;
  if(chatMessages.some(m=>m.id===msg.id)) return false;
  chatMessages.push(msg);
  if(chatMessages.length>80) chatMessages=chatMessages.slice(-80);
  writeChatMessagesCache(chatMessages);
  if(options.render !== false) renderChatMessages(options.forceBottom === false ? {preserveScroll:true} : {forceBottom:true});
  return true;
}

function updateChatMessage(msg){
  if(!msg) return;
  if(msg.deleted_at){
    chatMessages=chatMessages.filter(m=>m.id!==msg.id);
  }else{
    const idx=chatMessages.findIndex(m=>m.id===msg.id);
    if(idx>=0) chatMessages[idx]={...chatMessages[idx],...msg};
  }
  writeChatMessagesCache(chatMessages);
  renderChatMessages();
}

function scrollChatToBottom(){
  const body=chatEls().body;
  if(body) body.scrollTop=body.scrollHeight;
}

function settleChatMediaScroll(body=chatEls().body, options={}){
  if(!body) return;
  const stickToBottom=options.stickToBottom !== false;
  const settle=()=>{
    if(stickToBottom) scrollChatToBottom();
  };
  requestAnimationFrame(settle);
  [120, 360, 900].forEach((delay)=>setTimeout(settle, delay));
  bindMessageImageFallback(body);
  body.querySelectorAll('.message-image-preview img').forEach((img)=>{
    if(img.complete) return;
    img.addEventListener('load', settle, {once:true});
    img.addEventListener('error', settle, {once:true});
  });
}

function chatModerationText(data={}){
  if(data.reason==='reported_message_deletes_4_in_1h' || data.bannedUntil) return '신고 삭제 누적으로 삭제+차단됨';
  if(data.reason==='reported_3_times' || data.reason==='reported_4_times' || data.messageDeleted) return '신고 4회 누적으로 삭제됨';
  return '삭제된 메시지입니다';
}

function markChatMessageModerated(message, text){
  return {
    ...message,
    moderated: true,
    moderationText: text,
    body: '',
    report_count: Math.max(4, Number(message?.report_count || 0)),
  };
}

function renderChatMessagesExcel(body){
  // 엑셀 모드: 한 메시지를 메타 행 + 본문 행으로 나눠 본문 폭을 최대한 확보한다.
  const own=chatUserId();
  const reported=chatReported();
  const admin=isInlineAdmin();
  const rows=chatMessages.map((m, idx)=>{
    const rowNum=idx + 1;
    if(m.moderated){
      return `<tr class="chat-excel-row moderated" data-chat-id="${esc(m.id)}">
        <td class="rownum">${rowNum}</td>
        <td class="left chat-excel-body" colspan="3">${esc(m.moderationText || '삭제된 메시지')}</td>
      </tr>`;
    }
    const isOwn=m.user_id===own;
    const isAdminNick=isReservedAdminNickname(m.nickname);
    const reportDisabled=isOwn || reported.has(String(m.id)) || isAdminNick;
    const adminActions=admin ? `<span class="chat-excel-actions">
      <button class="chat-admin-action admin-action-danger" type="button" data-chat-admin-action="delete" data-message-id="${esc(m.id)}">삭제</button>
      <button class="chat-admin-action" type="button" data-chat-admin-action="ban" data-user-id="${esc(m.user_id)}">1시간</button>
    </span>` : '';
    const warn=m.report_count>=4 ? ' <span class="chat-excel-warn" title="신고 누적">⚠</span>' : '';
    const rowClass=`chat-excel-row${isOwn?' own':''}${isAdminNick?' admin':''}`;
    return `<tr class="${rowClass} chat-excel-meta-row" data-chat-id="${esc(m.id)}">
      <td class="rownum" rowspan="2">${rowNum}</td>
      <td class="left chat-excel-nick${isAdminNick?' admin-nick':''}" colspan="2" title="${esc(m.nickname || '월급루팡')}">${esc(m.nickname || '월급루팡')}${warn}</td>
      <td class="center chat-excel-time">${fmtTime(m.created_at)}</td>
    </tr>
    <tr class="${rowClass} chat-excel-body-row" data-chat-id="${esc(m.id)}">
      <td class="left chat-excel-body" colspan="3">${renderTextWithImagePreviews(m.body)}<span class="chat-excel-row-actions"><button class="chat-report chat-excel-report" type="button" data-report-id="${esc(m.id)}" ${reportDisabled?'disabled':''}>신고</button>${adminActions}</span></td>
    </tr>`;
  }).join('');
  body.innerHTML=`<table class="chat-excel-table">
    <colgroup>
      <col class="chat-excel-col-rownum"/>
      <col class="chat-excel-col-nick"/>
      <col class="chat-excel-col-body"/>
      <col class="chat-excel-col-time"/>
    </colgroup>
    <tbody>${rows}</tbody>
  </table>${chatSleepNoticeHtml()}`;
}

function renderChatMessages(options={}){
  const body=chatEls().body;
  if(!body) return;
  const scrollTopBefore=body.scrollTop;
  const shouldStickToBottom=!!options.forceBottom || chatIsNearBottom(body);
  if(options.showNewBelow && !shouldStickToBottom) chatHasNewBelow=true;
  if(shouldStickToBottom) chatHasNewBelow=false;
  if(!chatMessages.length){
    body.innerHTML=`<div class="chat-empty">아직 채팅이 없습니다.<br/>첫 개미가 되어보세요.</div>${chatSleepNoticeHtml()}`;
    updateChatNewBelowButton(body);
    return;
  }
  if(chatExcelMode){
    renderChatMessagesExcel(body);
  }else{
    const own=chatUserId();
    const reported=chatReported();
    body.innerHTML=chatMessages.map((m)=>{
      const isOwn=m.user_id===own;
      if(m.moderated){
        return `<div class="chat-msg moderated" data-chat-id="${esc(m.id)}">
          <div class="chat-moderated-text">${esc(m.moderationText || '삭제된 메시지입니다')}</div>
        </div>`;
      }
      const reportDisabled=isOwn || reported.has(String(m.id)) || isReservedAdminNickname(m.nickname);
      const isAdminNick=isReservedAdminNickname(m.nickname);
      const adminActions=isInlineAdmin() ? `<span class="chat-admin-actions">
        <button class="chat-admin-action admin-action-danger" type="button" data-chat-admin-action="delete" data-message-id="${esc(m.id)}">삭제</button>
        <button class="chat-admin-action" type="button" data-chat-admin-action="ban" data-user-id="${esc(m.user_id)}">1시간</button>
      </span>` : '';
      return `<div class="chat-msg${isOwn?' own':''}${isAdminNick?' admin':''}" data-chat-id="${esc(m.id)}">
        <div class="chat-meta">
          <span class="chat-nick${isAdminNick?' admin-nick':''}">${esc(m.nickname || '월급루팡')}</span>
          ${m.report_count>=4 ? '<span title="신고 누적">⚠</span>' : ''}
          <span class="chat-time">${fmtTime(m.created_at)}</span>
          <button class="chat-report" type="button" data-report-id="${esc(m.id)}" ${reportDisabled?'disabled':''}>신고</button>
          ${adminActions}
        </div>
        <div class="chat-text">${renderTextWithImagePreviews(m.body)}</div>
      </div>`;
    }).join('') + chatSleepNoticeHtml();
  }
  body.querySelectorAll('[data-report-id]').forEach(btn=>{
    btn.addEventListener('click',()=>reportChatMessage(Number(btn.dataset.reportId)));
  });
  body.querySelectorAll('[data-chat-admin-action]').forEach(btn=>{
    btn.addEventListener('click',(ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      runChatAdminAction(btn);
    });
  });
  updateChatNewBelowButton(body);
  if(shouldStickToBottom){
    scrollChatToBottom();
    settleChatMediaScroll(body, {stickToBottom:true});
  }else{
    body.scrollTop=scrollTopBefore;
    settleChatMediaScroll(body, {stickToBottom:false});
  }
}

function applyChatModeration(data){
  const messageId=Number(data?.messageId || data?.message_id || 0);
  const reportedUserId=String(data?.reportedUserId || '');
  const text=chatModerationText(data);
  if(messageId){
    let changed=false;
    chatMessages=chatMessages.map((m)=>{
      if(Number(m.id)!==messageId) return m;
      changed=true;
      return markChatMessageModerated(m, text);
    });
    if(changed) renderChatMessages();
    return;
  }
  if(!reportedUserId) return;
  let changed=false;
  chatMessages=chatMessages.map((m)=>{
    if(m.user_id !== reportedUserId) return m;
    changed=true;
    return markChatMessageModerated(m, text);
  });
  if(changed) renderChatMessages();
}

async function checkChatBan(){
  if(isInlineAdmin()) return null;
  try{
    const data=await fetchJsonClient(`/api/chat-report?user_id=${encodeURIComponent(chatUserId())}`, 4000);
    const until=data?.bannedUntil;
    return data?.banned && until ? {until:new Date(until), reason:data?.reason || 'chat_ban'} : null;
  }catch{
    return null;
  }
}

async function guardChatMessage(text, label='채팅'){
  if(isInlineAdmin()) return true;
  try{
    const data=await fetchJsonClient('/api/chat-guard', 5000, {
      method:'POST',
      headers:isInlineAdmin() ? adminAuthHeaders({'content-type':'application/json'}) : {'content-type':'application/json'},
      body:JSON.stringify({
        user_id:chatUserId(),
        body:text,
      }),
    });
    if(!data?.blocked) return true;
    if(data?.banned && data?.bannedUntil){
      showToast(`금지 표현 반복 시도로 ${fmtTime(data.bannedUntil)}까지 채팅 제한`, 'err');
      return false;
    }
    const attempt=Math.max(1, Math.min(4, Number(data?.attemptCount || 1)));
    const remaining=Math.max(0, Number(data?.remaining ?? (4-attempt)));
    showToast(`차단 표현이 포함되어 전송하지 않았습니다. 경고 ${attempt}/4회, ${remaining}회 후 30분 제한`, 'warn');
    return false;
  }catch(e){
    showToast(`${label} 검사를 완료하지 못했습니다: ${e.message || e}`, 'err');
    return false;
  }
}

async function sendChatMessage(body){
  if(chatSendInFlight) return;
  const text=String(body || '').trim().replace(/\s+/g,' ');
  if(!text) return;
  if(text.length>280){ showToast('채팅은 280자까지 가능합니다', 'warn'); return; }
  enforceChatNicknameInput();
  chatSendInFlight=true;
  setChatSending(true);
  try{
    await initChat();
    await ensureChatConfig();
    if(!chatConfig?.enabled){
      showToast('채팅 저장소 연결이 필요합니다', 'warn');
      return;
    }
    const chatBan=await checkChatBan();
    if(chatBan?.until && chatBan.until>Date.now()){
      const reason=chatBan.reason==='blocked_term_attempts' ? '금지 표현 반복 시도로' : '신고 누적으로';
      showToast(`${reason} ${fmtTime(chatBan.until.toISOString())}까지 채팅 제한`, 'err');
      return;
    }
    if(!(await guardChatMessage(text))) return;
    const now=Date.now();
    if(now-chatLastSendAt<CHAT_SEND_GAP_MS){ showToast('채팅은 4초에 한 번만 보낼 수 있어요', 'warn'); return; }
    chatLastSendAt=now;
    const {input}=chatEls();
    const data=await fetchJsonClient('/api/chat-messages', 6000, {
      method:'POST',
      headers:isInlineAdmin() ? adminAuthHeaders({'content-type':'application/json'}) : {'content-type':'application/json'},
      body:JSON.stringify({
        user_id:chatUserId(),
        nickname:chatNickname(),
        body:text,
      }),
    });
    if(!data?.message) throw new Error(data?.error || 'chat_send_failed');
    addChatMessage(data.message);
    startOpenChatPoll({immediate:false});
    if(input && String(input.value || '').trim().replace(/\s+/g,' ') === text) input.value='';
  }catch(e){
    const msg=String(e.message || e);
    showToast(msg.includes('rate_limited') || msg.includes('row-level') || msg.includes('policy') ? '채팅 제한 중이거나 너무 빠르게 보냈습니다' : `채팅 전송 실패: ${msg}`, 'err');
  }finally{
    chatSendInFlight=false;
    setChatSending(false);
    refocusChatInput();
  }
}

async function reportChatMessage(id){
  await initChat();
  if(!id) return;
  try{
    const headers=isInlineAdmin()
      ? adminAuthHeaders({'content-type':'application/json'})
      : {'content-type':'application/json'};
    const data=await fetchJsonClient('/api/chat-report', 6000, {
      method:'POST',
      headers,
      body:JSON.stringify({
        message_id:id,
        reporter_id:chatUserId(),
      }),
    });
    if(data?.ignored){
      renderChatMessages();
      showToast('관리자 메시지는 신고 대상에서 제외됩니다', 'info');
    }else if(data?.messageDeleted || data?.banned){
      chatReported().add(String(id));
      saveChatReported();
      const idx=chatMessages.findIndex(m=>Number(m.id)===Number(id));
      if(idx>=0){
        chatMessages[idx]={...chatMessages[idx], report_count:Math.max(Number(chatMessages[idx].report_count||0), Number(data?.reportCount||1))};
      }
      renderChatMessages();
      applyChatModeration({...data, reason:data?.banned ? 'reported_message_deletes_4_in_1h' : 'reported_4_times'});
      showToast(
        data?.banned
          ? '신고로 삭제된 메시지가 1시간 내 4개 누적되어 해당 사용자를 1시간 제한했습니다'
          : '신고 4회 누적으로 해당 메시지를 삭제했습니다',
        'warn'
      );
    }else{
      chatReported().add(String(id));
      saveChatReported();
      const idx=chatMessages.findIndex(m=>Number(m.id)===Number(id));
      if(idx>=0){
        chatMessages[idx]={...chatMessages[idx], report_count:Math.max(Number(chatMessages[idx].report_count||0), Number(data?.reportCount||1))};
      }
      renderChatMessages();
      showToast('신고가 접수되었습니다', 'info');
    }
  }catch(e){
    if(e?.payload?.error === 'report_rate_limited') showToast(`채팅 신고는 1시간에 ${e.payload.limit || 5}개까지 가능합니다`, 'warn');
    else showToast(`신고 실패: ${e.message || e}`, 'err');
  }
}

async function runChatAdminAction(btn){
  if(!isInlineAdmin()){
    showToast('관리자 로그인이 필요합니다', 'warn');
    return;
  }
  const action=btn?.dataset?.chatAdminAction || '';
  const messageId=Number(btn?.dataset?.messageId || 0);
  const userId=btn?.dataset?.userId || '';
  try{
    if(action === 'delete'){
      if(!messageId) return;
      setBusyButton(btn, true, '삭제중');
      await fetchInlineAdminJson('/api/chat-admin', { action:'delete_message', message_id:messageId }, 7000);
      chatMessages=chatMessages.filter((m)=>Number(m.id)!==messageId);
      renderChatMessages();
      loadChatMessages({ force:true, markSeen:false }).catch(()=>{});
      showToast('채팅 메시지를 삭제했습니다', 'info');
      return;
    }
    if(action === 'ban'){
      if(!userId) return;
      if(userId === chatUserId() && !window.confirm('현재 브라우저 사용자 ID를 1시간 차단할까요?')) return;
      setBusyButton(btn, true, '차단중');
      await fetchInlineAdminJson('/api/chat-admin', { action:'ban_user', user_id:userId, hours:1 }, 7000);
      showToast('해당 사용자를 1시간 차단했습니다', 'warn');
    }
  }catch(e){
    if(e?.status===401){
      setInlineAdminToken('', { silent:true });
      showToast('관리자 세션이 만료되었거나 암호가 맞지 않습니다', 'err');
    }else{
      showToast(`관리자 작업 실패: ${e.message || e}`, 'err');
    }
  }finally{
    setBusyButton(btn, false);
  }
}

function setupChatUi(){
  const {panel,toggle,close,form,nick,input,size,excel,dock,body,send}=chatEls();
  try{
    if(nick) nick.value=isInlineAdmin() ? ADMIN_NICKNAME : (localStorage.getItem(CHAT_NICK_KEY)||'');
  }catch{}
  if(nick && !nick.value) chatNickname();
  syncAdminNicknameInputs();
  applyChatPanelSize();
  applyChatExcelMode();
  applyChatPanelPosition({saveClamp:true});
  applyChatDockMode();
  updateChatCloseButton();
  renderChatStatus();
  toggle?.addEventListener('click',()=>setChatOpen(!chatIsOpen));
  close?.addEventListener('click',closeChatPanel);
  size?.addEventListener('click',()=>setChatPanelLarge(!chatPanelLarge));
  excel?.addEventListener('click',()=>setChatExcelMode(!chatExcelMode));
  dock?.addEventListener('click',()=>setChatDockMode(!chatDockActive()));
  setupChatPanelDrag();
  window.addEventListener('resize',()=>requestAnimationFrame(()=>{
    applyChatDockMode({notifyAutoPopup:true});
    applyChatPanelPosition({saveClamp:true});
  }), {passive:true});
  body?.addEventListener('scroll', handleChatBodyScroll, {passive:true});
  panel?.addEventListener('pointerdown', noteChatActivity, {passive:true});
  panel?.addEventListener('keydown', noteChatActivity);
  nick?.addEventListener('input', (ev)=>{
    noteChatActivity(ev);
    enforceChatNicknameInput();
  });
  input?.addEventListener('input', noteChatActivity);
  form?.addEventListener('submit',(e)=>{
    e.preventDefault();
    if(shouldKeepChatInputEnabledWhileSending() && Date.now() < chatMobileSendPointerHandledUntil) return;
    sendChatMessage(input?.value || '');
  });
  send?.addEventListener('pointerdown', (ev)=>{
    if(!shouldKeepChatInputEnabledWhileSending()) return;
    ev.preventDefault();
    chatMobileSendPointerHandledUntil = Date.now() + 900;
    input?.focus?.({preventScroll:true});
    sendChatMessage(input?.value || '');
  });
  const attachBtn=document.getElementById('chatAttach');
  attachBtn?.addEventListener('click',(e)=>{
    e.preventDefault();
    openImageAttachHelper('chatInput');
  });
  initChatLastSeenAt();
  const isMobile=matchMedia('(max-width: 760px)').matches;
  const chatButtonHidden=!!floatingHiddenFor('chat');
  if(!isMobile && !chatButtonHidden){
    setTimeout(()=>{
      setChatOpen(true, {connect:true, persist:false});
    }, 900);
  }else{
    startClosedChatPoll({immediate:false});
  }
}
setupInlineAdmin();
setupChatUi();
window.addEventListener('pagehide', ()=>{
  pingPresence({force:true, leaving:true});
  resetChatPollingState('연결 해제됨');
});
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    if(chatOpenForPresence) setChatPresenceOpen(false);
    if(chatIsOpen && chatPreviewMode){
      clearChatPreviewPoll();
      initChatPreview().catch(()=>{});
    }else if(chatIsOpen && !chatPollingSleeping){
      restartOpenChatPoll({immediate:false});
      startChatIdleSleepTimer();
      chatSetStatus('백그라운드 저속 확인 중');
    }else if(!chatIsOpen){
      clearClosedChatPoll();
      startClosedChatPoll({immediate:false});
    }
  }else if(chatIsOpen && chatPreviewMode){
    if(!chatPollingSleeping) setChatPresenceOpen(true);
    clearChatPreviewPoll();
    initChatPreview().catch(()=>{});
  }else if(chatIsOpen){
    if(!chatPollingSleeping) {
      setChatPresenceOpen(true);
      restartOpenChatPoll({immediate:true});
      startChatIdleSleepTimer();
    }
  }else if(!chatIsOpen){
    clearClosedChatPoll();
    startClosedChatPoll({immediate:true});
  }
});

function normalizeFloatingHiddenState(raw){
  const now=Date.now();
  const out={};
  const isHiddenEntry=(entry)=>{
    if(entry === true) return true;
    if(entry && typeof entry === 'object' && (entry.hidden === true || entry.permanent === true)) return true;
    if(entry && typeof entry === 'object') return Number(entry.until || entry.expiresAt || 0);
    return Number(entry || 0);
  };
  if(raw?.actions){
    const hidden=isHiddenEntry(raw.actions);
    if(hidden === true || !hidden || hidden > now){
      out.telegram={hidden:true};
      out.chat={hidden:true};
    }
  }
  ['telegram','chat'].forEach((key)=>{
    const hidden=isHiddenEntry(raw?.[key]);
    if(hidden === true || (hidden && hidden > now)) out[key]={hidden:true};
  });
  return out;
}
function floatingHiddenLoad(){
  let raw={};
  try{ raw = JSON.parse(localStorage.getItem(FLOATING_HIDDEN_KEY)||'{}') || {}; }catch{}
  const normalized=normalizeFloatingHiddenState(raw);
  if(JSON.stringify(raw) !== JSON.stringify(normalized)) floatingHiddenSave(normalized);
  return normalized;
}
function floatingHiddenSave(value){
  try{
    localStorage.setItem(FLOATING_HIDDEN_KEY, JSON.stringify(value || {}));
    persistSet(FLOATING_HIDDEN_KEY, JSON.stringify(value || {}));
  }catch{}
}
function floatingHiddenFor(kind){
  const state=floatingHiddenLoad();
  return !!state?.[kind];
}
function setFloatingButtonHidden(kind, hidden){
  const key = kind === 'telegram' ? 'telegram' : 'chat';
  const state=floatingHiddenLoad();
  if(hidden) state[key]={hidden:true};
  else delete state[key];
  floatingHiddenSave(state);
  if(key === 'chat' && hidden) setChatOpen(false);
  renderFloatingButtons();
  syncSettingsUI();
}
function renderFloatingButtons(){
  const state=floatingHiddenLoad();
  const inOutlook = document.body?.classList?.contains('theme-outlook');
  const telegramHidden = !!state.telegram || !!inOutlook;
  const chatHidden = !inOutlook && !!state.chat;
  const hidden = !!(telegramHidden && chatHidden);
  const actions=document.querySelector('.floating-actions');
  actions?.classList.toggle('is-hidden', hidden);
  actions?.querySelector('[data-floating-wrap="telegram"]')?.classList.toggle('is-hidden', telegramHidden);
  actions?.querySelector('[data-floating-wrap="chat"]')?.classList.toggle('is-hidden', chatHidden);
  const restore=document.getElementById('floatingRestore');
  if(!restore) return;
  if((!state.telegram && !state.chat) || inOutlook){
    restore.hidden=true;
    restore.innerHTML='';
    return;
  }
  restore.hidden=false;
  restore.innerHTML='<button type="button" data-restore-floating="actions">숨긴 버튼 보이기</button>';
}
document.addEventListener('click',(ev)=>{
  const hideBtn=ev.target?.closest?.('[data-hide-floating]');
  if(hideBtn){
    ev.preventDefault();
    ev.stopPropagation();
    const kind=hideBtn.dataset.hideFloating || 'chat';
    setFloatingButtonHidden(kind, true);
    return;
  }
  const restoreBtn=ev.target?.closest?.('[data-restore-floating]');
  if(restoreBtn){
    ev.preventDefault();
    ev.stopPropagation();
    const kind=restoreBtn.dataset.restoreFloating || 'chat';
    if(kind === 'actions'){
      setFloatingButtonHidden('telegram', false);
      setFloatingButtonHidden('chat', false);
    } else {
      setFloatingButtonHidden(kind, false);
    }
  }
});
renderFloatingButtons();

/* ============================================================
 *  Watchlist (내가 원하는 종목 살펴보기)
 *  - localStorage 영구화
 *  - /api/quote 로 시세 fetch
 *  - 세션/혼잡도별 fastQuote 간격으로 자동 갱신
 * ============================================================ */
function wlLoad(){ try{ return JSON.parse(localStorage.getItem(WATCHLIST_KEY)||'[]'); }catch{ return []; } }
function wlSave(list){ const value=JSON.stringify(list); localStorage.setItem(WATCHLIST_KEY, value); persistSet(WATCHLIST_KEY, value); }
function wlSame(a, b){ return String(a||'').toUpperCase()===String(b||'').toUpperCase(); }

function newQuoteNoteId(){
  return `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeQuoteNoteText(value){
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function normalizeQuoteNoteMarket(value){
  const market = String(value || '').toUpperCase();
  return QUOTE_NOTE_MARKETS.has(market) ? market : 'KR';
}

function normalizeQuoteNotes(input){
  if(!Array.isArray(input)) return [];
  const seen = new Set();
  const limit = (typeof QUOTE_NOTE_LIMIT === 'number' && Number.isFinite(QUOTE_NOTE_LIMIT)) ? QUOTE_NOTE_LIMIT : 240;
  return input.slice(0, limit).map((raw)=>{
    if(Array.isArray(raw)){
      raw = {
        id: raw[0],
        market: raw[1],
        text: raw[2],
        createdAt: raw[3],
        updatedAt: raw[4],
      };
    }
    if(!raw || typeof raw !== 'object') return null;
    let id = String(raw.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    if(!id) id = newQuoteNoteId();
    if(seen.has(id)) id = newQuoteNoteId();
    seen.add(id);
    const createdAt = Number(raw.createdAt || raw.a || Date.now());
    const updatedAt = Number(raw.updatedAt || raw.u || createdAt || Date.now());
    return {
      id,
      market: normalizeQuoteNoteMarket(raw.market || raw.m),
      text: normalizeQuoteNoteText(raw.text || raw.t),
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    };
  }).filter(Boolean);
}

function quoteNotesLoad(){ try{ return normalizeQuoteNotes(JSON.parse(localStorage.getItem(QUOTE_NOTES_KEY)||'[]')); }catch{ return []; } }
function quoteNotesSave(notes){ const value=JSON.stringify(normalizeQuoteNotes(notes)); localStorage.setItem(QUOTE_NOTES_KEY, value); persistSet(QUOTE_NOTES_KEY, value); }
function quoteNoteOrderId(note){ return `N:${String(note?.noteId || note?.id || '').trim()}`; }
function quoteNoteCard(note){
  return {
    _noteRow: true,
    noteId: note.id,
    market: note.market,
    key: note.text || '빈 행',
    text: note.text || '',
    userAdded: false,
  };
}

function quoteNotesForMarket(market){
  const m = normalizeQuoteNoteMarket(market);
  return quoteNotesLoad().filter((note)=>note.market === m).map(quoteNoteCard);
}

function withQuoteNoteRows(cards, market=currentRenderedMarket){
  const base = (Array.isArray(cards) ? cards : []).filter((card)=>!card?._noteRow);
  if(String(market || '').toUpperCase() === 'HOLDINGS') return base;
  return base.concat(quoteNotesForMarket(market));
}

function currentQuoteNoteMarket(){
  const market = String(currentRenderedMarket || (selected === 'AUTO' ? '' : selected) || 'KR').toUpperCase();
  if(QUOTE_NOTE_MARKETS.has(market)) return market;
  if(selected === 'COIN') return 'COIN';
  if(selected === 'US') return 'US';
  if(selected === 'ALL') return 'ALL';
  return 'KR';
}

function updateQuoteNoteText(noteId, text){
  const id = String(noteId || '');
  if(!id) return false;
  const notes = quoteNotesLoad();
  const note = notes.find((item)=>item.id === id);
  if(!note) return false;
  const nextText = normalizeQuoteNoteText(text);
  if(note.text === nextText) return false;
  note.text = nextText;
  note.updatedAt = Date.now();
  quoteNotesSave(notes);
  return true;
}

function removeQuoteNoteRow(noteId){
  const id = String(noteId || '');
  if(!id) return;
  const next = quoteNotesLoad().filter((note)=>note.id !== id);
  quoteNotesSave(next);
  const orderId = quoteNoteOrderId({ id });
  defaultOrderSave(defaultOrderLoad().filter((item)=>item !== orderId));
  rerenderCardsTableFromCurrentState();
  showToast('빈 행을 삭제했습니다', 'info');
}

function compactQuoteNotesForShare(notes){
  const limit = (typeof QUOTE_NOTE_LIMIT === 'number' && Number.isFinite(QUOTE_NOTE_LIMIT)) ? QUOTE_NOTE_LIMIT : 240;
  return normalizeQuoteNotes(notes).slice(0, limit).map((note)=>[
    note.id,
    note.market,
    note.text,
  ]);
}

/* Watchlist share/import helpers live in app-watchlist-share.js. */

/* 종목 숨김 — snapshot 기본 카드의 key 를 localStorage 에 기록.
 * visibleCards 에서 필터, '기본 항목 복원하기' 버튼으로 토글 복원 가능. */
function persistDb(){
  return new Promise((resolve, reject)=>{
    if(!window.indexedDB){ reject(new Error('indexeddb_unavailable')); return; }
    let settled=false;
    const timer=setTimeout(()=>{
      if(settled) return;
      settled=true;
      reject(new Error('indexeddb_open_timeout'));
    }, 1500);
    const settle=(fn, value)=>{
      if(settled) return;
      settled=true;
      clearTimeout(timer);
      fn(value);
    };
    const req=indexedDB.open('excelkospi_settings_v1', 1);
    req.onupgradeneeded=()=>req.result.createObjectStore('kv');
    req.onsuccess=()=>settle(resolve, req.result);
    req.onerror=()=>settle(reject, req.error || new Error('indexeddb_open_error'));
    req.onblocked=()=>settle(reject, new Error('indexeddb_open_blocked'));
  });
}
async function persistSet(key, value){
  try{
    const db=await persistDb();
    const tx=db.transaction('kv','readwrite');
    tx.objectStore('kv').put(value, key);
  }catch{}
}
async function persistRemove(key){
  try{
    const db=await persistDb();
    const tx=db.transaction('kv','readwrite');
    tx.objectStore('kv').delete(key);
  }catch{}
}
function txDone(tx){
  return new Promise(resolve=>{
    const timer=setTimeout(()=>resolve(), 1500);
    const done=()=>{
      clearTimeout(timer);
      resolve();
    };
    tx.oncomplete=done;
    tx.onerror=done;
    tx.onabort=done;
  });
}
async function persistAllSettings(){
  let db=null;
  try{
    db=await persistDb();
    const tx=db.transaction('kv','readwrite');
    const store=tx.objectStore('kv');
    PERSIST_KEYS.forEach(key=>{
      const value=localStorage.getItem(key);
      if(value != null) store.put(value, key);
    });
    await txDone(tx);
  }catch{}
  finally{
    try{ db?.close?.(); }catch{}
  }
}
async function restorePersistentSettings(){
  let restoredAny=false;
  let db=null;
  try{
    db=await persistDb();
    await Promise.all(PERSIST_KEYS.map(key=>new Promise(resolve=>{
      if(localStorage.getItem(key) != null){ resolve(); return; }
      const timer=setTimeout(resolve, 1200);
      const tx=db.transaction('kv','readonly');
      const req=tx.objectStore('kv').get(key);
      const done=()=>{
        clearTimeout(timer);
        resolve();
      };
      req.onsuccess=()=>{ if(req.result != null){ localStorage.setItem(key, req.result); restoredAny=true; } done(); };
      req.onerror=done;
    })));
    const restoredView=localStorage.getItem(VIEW_KEY);
    // '마지막 시장 기억' 설정이 꺼져 있으면 항상 AUTO 로 시작한다.
    if(rememberMarketEnabled() && ['AUTO','KR','US','COIN','ALL','HOLDINGS'].includes(restoredView)) selected=restoredView;
    else if(!rememberMarketEnabled()) selected='AUTO';
    const restoredTimeline=localStorage.getItem(TIMELINE_TAB_KEY);
    if(restoredTimeline==='community' || restoredTimeline==='news' || restoredTimeline==='etf') timelineTab=restoredTimeline;
    const restoredChange=localStorage.getItem(CHANGE_WINDOW_KEY);
    if(['day','15','30'].includes(restoredChange)) changeWindow=restoredChange;
    const restoredSort=localStorage.getItem(QUOTE_SORT_KEY);
    if(['manual','change-desc','value-desc','pnl-desc','name-asc'].includes(restoredSort)) quoteSortMode=restoredSort;
    ribbonCollapsed = initialRibbonCollapsed();
    holdingPnlMode = localStorage.getItem(HOLDING_PNL_MODE_KEY) === 'daily' ? 'daily' : 'total';
    chatPanelLarge = readStringSetting(CHAT_SIZE_KEY, 'normal', new Set(['normal','large'])) === 'large';
    chatPanelOpacity = readChatOpacitySetting();
    chatDockRequested = readBoolSetting(CHAT_DOCK_KEY, defaultChatDockOn());
    readabilityMode = localStorage.getItem(READABILITY_KEY)==='1';
    excelTheme = readStringSetting(EXCEL_THEME_KEY, 'classic', EXCEL_THEMES);
    excelDarkMode = readBoolSetting(EXCEL_DARK_MODE_KEY, false);
    applyExcelAppearance();
    applyRibbonCollapsed();
    applyChatPanelOpacity();
    applyChatPanelSize();
    applyReadabilityMode();
    syncUpdatesBadge();
    await persistAllSettings();
  }catch{}
  finally{
    try{ db?.close?.(); }catch{}
  }
  return restoredAny;
}
window.addEventListener('pagehide', persistAllSettings);
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden) persistAllSettings();
});
setInterval(persistAllSettings, 60*1000);
function hiddenLoad(){ try{ return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEYS_STORE)||'[]')); }catch{ return new Set(); } }
function hiddenSave(set){ const value=JSON.stringify(Array.from(set)); localStorage.setItem(HIDDEN_KEYS_STORE, value); persistSet(HIDDEN_KEYS_STORE, value); }
function hideDefault(key){ const s=hiddenLoad(); s.add(key); hiddenSave(s); }
function showAllDefaults(){ localStorage.removeItem(HIDDEN_KEYS_STORE); persistRemove(HIDDEN_KEYS_STORE); }
function updateHiddenRestoreUi(){
  const btn = document.getElementById('hiddenRestore');
  if(!btn) return;
  const count = hiddenLoad().size;
  if(count > 0){ btn.textContent = '기본 항목 복원하기'; btn.style.display = ''; }
  else{ btn.style.display = 'none'; }
}

function updateChangeWindowUi(){
  document.querySelectorAll('[data-change-window]').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.changeWindow === changeWindow);
  });
}

const QUOTE_SORT_MANUAL_CLOSED_LABEL = '정렬';
const QUOTE_SORT_MANUAL_OPEN_LABEL = '내가 설정한 대로';
function setQuoteSortManualLabel(expanded=false){
  const option=document.querySelector('#quoteSortMode option[value="manual"]');
  if(option) option.textContent = expanded ? QUOTE_SORT_MANUAL_OPEN_LABEL : QUOTE_SORT_MANUAL_CLOSED_LABEL;
}

let lastAppliedQuoteSortMode = null;
function updateQuoteSortUi(){
  if(lastAppliedQuoteSortMode === quoteSortMode) return;
  lastAppliedQuoteSortMode = quoteSortMode;
  const select=document.getElementById('quoteSortMode');
  if(select && select.value !== quoteSortMode) select.value = quoteSortMode;
  setQuoteSortManualLabel(false);
  document.body?.classList?.toggle('quote-sort-auto', quoteSortMode !== 'manual');
}

function setQuoteSortMode(value){
  if(!['manual','change-desc','value-desc','pnl-desc','name-asc'].includes(value)) return;
  quoteSortMode = value;
  try{ localStorage.setItem(QUOTE_SORT_KEY, value); persistSet(QUOTE_SORT_KEY, value); }catch{}
  updateQuoteSortUi();
  if(lastRenderedCards.length) rerenderCardsTableFromCurrentState();
}

function setChangeWindow(value){
  if(!['day','15','30'].includes(value)) return;
  changeWindow = value;
  try{ localStorage.setItem(CHANGE_WINDOW_KEY, value); persistSet(CHANGE_WINDOW_KEY, value); }catch{}
  updateChangeWindowUi();
  if(lastSnapshot) renderSnapshot(lastSnapshot);
  if(value !== 'day') loadSnapshot({force:true});
}

function toggleHoldingPnlMode(){
  holdingPnlMode = holdingPnlDisplayMode() === 'daily' ? 'total' : 'daily';
  try{
    localStorage.setItem(HOLDING_PNL_MODE_KEY, holdingPnlMode);
    persistSet(HOLDING_PNL_MODE_KEY, holdingPnlMode);
  }catch{}
  if(lastRenderedCards.length) rerenderCardsTableFromCurrentState();
  showToast(holdingPnlMode === 'daily' ? '보유 손익: 일일 손익 표시' : '보유 손익: 누적 손익 표시', 'info');
}

function closeHoldingInline(options={}){
  holdingInputState = null;
  if(options.render !== false && lastSnapshot) renderSnapshot(lastSnapshot);
}

function openHoldingInline(info){
  if(!info || !info.id) return;
  holdingInputState=info;
  if(lastSnapshot) renderSnapshot(lastSnapshot);
  setTimeout(()=>{
    const row=Array.from(document.querySelectorAll('.holding-inline')).find(el=>el.dataset.holdingId===info.id);
    row?.querySelector('[data-holding-avg]')?.focus();
  }, 0);
}

function saveHoldingValue(id, key, avg, qty, lotId='', afterLotId=''){
  if(!id) return;
  if(!Number.isFinite(avg) || avg<=0 || !Number.isFinite(qty) || qty<=0){
    showToast('구매가격과 수량을 입력하세요', 'warn');
    return;
  }
  const map=holdingsLoad();
  const lots=holdingLotsFromRecord(map[id]);
  const now=Date.now();
  const nextLot={ lotId:String(lotId || newHoldingLotId()).slice(0, 40), avg, qty, updatedAt:now };
  const existingIdx=lots.findIndex((lot)=>lot.lotId===nextLot.lotId);
  if(existingIdx >= 0){
    lots[existingIdx]=nextLot;
  }else{
    const afterIdx=lots.findIndex((lot)=>lot.lotId===afterLotId);
    lots.splice(afterIdx >= 0 ? afterIdx + 1 : lots.length, 0, nextLot);
  }
  map[id]=holdingRecordFromLots(lots);
  holdingsSave(map);
  holdingInputState = null;
  if(lastSnapshot) renderSnapshot(lastSnapshot);
  showToast(`${key || '보유 정보'} 저장됨`, 'info');
}

function saveHoldingInline(id, key, box, lotId=''){
  if(!box) return;
  const avg=parseHoldingInput(box.querySelector('[data-holding-avg]')?.value);
  const qty=parseHoldingInput(box.querySelector('[data-holding-qty]')?.value);
  saveHoldingValue(id, key, avg, qty, lotId || box.dataset.lotId, box.dataset.afterLotId || '');
}

function clearHoldingById(id, key='', lotId=''){
  if(!id) return;
  const map=holdingsLoad();
  if(lotId){
    const lots=holdingLotsFromRecord(map[id]).filter((lot)=>lot.lotId!==lotId);
    const record=holdingRecordFromLots(lots);
    if(record) map[id]=record;
    else delete map[id];
  }else{
    delete map[id];
  }
  holdingsSave(map);
  if(holdingInputState?.id === id && (!lotId || holdingInputState?.lotId === lotId)) holdingInputState = null;
  if(lastSnapshot) renderSnapshot(lastSnapshot);
  showToast(`${key || '보유 정보'} 삭제됨`, 'info');
}

function showToast(msg, kind){
  const stack=document.getElementById('toastStack');
  if(!stack) return;
  const t=document.createElement('div');
  t.className='toast'+(kind?' '+kind:'');
  t.textContent=msg;
  stack.appendChild(t);
  setTimeout(()=>{ t.remove(); }, 3300);
}

function todayKstKey(){
  try{
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone:'Asia/Seoul',
      year:'numeric', month:'2-digit', day:'2-digit',
    }).formatToParts(new Date()).reduce((acc, part)=>{
      acc[part.type]=part.value;
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }catch{
    return new Date().toISOString().slice(0, 10);
  }
}

function maybeShowMobileDesktopNotice(){
  if(!matchMedia('(max-width: 760px)').matches) return;
  const today = todayKstKey();
  try{
    if(localStorage.getItem(MOBILE_DESKTOP_NOTICE_KEY) === today) return;
    localStorage.setItem(MOBILE_DESKTOP_NOTICE_KEY, today);
  }catch{}
  setTimeout(()=>{
    showToast('데스크탑에서 보셔야 진짜 엑셀 같아요.\n오늘 하루 업무도 화이팅입니다.', 'info desktop-notice');
  }, 900);
}

async function fetchQuote(code, market){
  const u=new URL(apiUrl('/api/quote'), location.href);
  u.searchParams.set('code', code);
  if(market && market!=='auto') u.searchParams.set('market', market);
  const source=coinSourceForMarket(market);
  if(source !== 'binance') u.searchParams.set('coinSource', source);
  try{
    const r=await fetch(u.toString());
    return await r.json();
  }catch(e){ return {ok:false, error:String(e)}; }
}

function quoteApiUrlForCodes(codes, coinSource='binance'){
  const u=new URL(apiUrl('/api/quote'), location.href);
  u.searchParams.set('codes', codes);
  const source=normalizeCoinQuoteSourceClient(coinSource);
  if(source !== 'binance') u.searchParams.set('coinSource', source);
  return apiUrl(`${u.pathname}${u.search}`);
}

function snapshotApiUrl(){
  const u=new URL(apiUrl('/api/snapshot'), location.href);
  const source=coinQuoteSource();
  if(source !== 'binance') u.searchParams.set('coinSource', source);
  return apiUrl(`${u.pathname}${u.search}`);
}

async function addWatchlistItem(rawCode, market){
  if(STATIC_EXPORT){
    showToast('Pages 배포판에서는 관심종목 실시간 추가를 잠시 막아뒀어요', 'warn');
    return false;
  }
  const code=(rawCode||'').trim();
  if(!code){ showToast('종목명이나 코드를 입력하세요', 'warn'); return false; }
  const list=wlLoad();
  const q=await fetchQuote(code, market);
  if(!q.ok){
    showToast(q.error||'종목을 찾지 못했어요', 'err'); return false;
  }
  if(q.market==='COIN' && selected!=='COIN'){
    showToast('코인 추가는 코인 시트에서만 가능합니다', 'warn'); return false;
  }
  if(list.find(x=>wlSame(x.code, q.code) && String(x.market||'').toUpperCase()===String(q.market||'').toUpperCase())){
    showToast('이미 추가된 종목입니다', 'warn'); return false;
  }
  const item={ code:q.code, market:q.market, name:q.name||q.code, addedAt:Date.now() };
  const limitHit=watchlistLimitHitForItem(list, item);
  if(limitHit){
    const marketName=marketDisplayName(limitHit.market);
    showToast(`${marketName} 시트는 최대 ${limitHit.limit}행까지만 추가할 수 있어요`, 'warn');
    return false;
  }
  list.push(item);
  wlSave(list);
  await loadSnapshot({force:true});
  const where = marketDisplayName(q.market);
  showToast(`${where} 시트에 추가되었습니다!`, q.market.toLowerCase());
  return true;
}

async function addQuoteNoteRow(){
  const note = {
    id: newQuoteNoteId(),
    market: currentQuoteNoteMarket(),
    text: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const notes = quoteNotesLoad();
  notes.push(note);
  quoteNotesSave(notes);
  saveQuoteRowOrder(quoteRowOrderVisibleIds().concat(quoteNoteOrderId(note)));
  pendingQuoteNoteFocusId = note.id;
  if(lastSnapshot) rerenderCardsTableFromCurrentState();
  else await loadSnapshot();
  showToast('빈 행을 추가했습니다. 메모나 구분선을 입력해 보세요', 'info');
}

function syncWatchlistAddMode(){
  const input=document.getElementById('watchlistInput');
  if(!input) return;
  if(selected === 'HOLDINGS'){
    input.title = '국장/미장/코인 시트에서 평단가와 수량을 입력하면 여기에 표시됩니다';
    return;
  }
  const hasQuery = !!String(input.value || '').trim();
  input.title = hasQuery ? 'Enter를 누르면 입력한 종목을 추가합니다' : '종목명이나 코드를 입력하고 Enter를 누르세요';
}

function syncWatchlistMarketUi(){
  const select=document.getElementById('watchlistMarket');
  const input=document.getElementById('watchlistInput');
  if(!select) return;
  const coinOption=select.querySelector('option[value="COIN"]');
  const isCoinTab=selected==='COIN';
  const isHoldingsTab=selected==='HOLDINGS';
  if(coinOption){
    coinOption.hidden=!isCoinTab;
    coinOption.disabled=!isCoinTab;
  }
  select.disabled=isCoinTab || isHoldingsTab;
  if(input) input.disabled=isHoldingsTab;
  const noteAction=document.querySelector('[data-watchlist-action="note"]');
  if(noteAction) noteAction.disabled=isHoldingsTab;
  if(isHoldingsTab){
    select.value='auto';
    if(input) input.placeholder='평단가·수량을 입력한 보유 종목만 표시됩니다';
    syncWatchlistAddMode();
    return;
  }
  if(isCoinTab){
    select.value='COIN';
    if(input) input.placeholder='코인 입력 후 Enter (BTC, ETH, USDT…)';
  }else{
    select.value='auto';
    if(input) input.placeholder='종목명·코드·지수 입력 후 Enter';
  }
  syncWatchlistAddMode();
}

async function removeWatchlistItem(code){
  const list=wlLoad();
  const it=list.find(x=>wlSame(x.code, code));
  const next=list.filter(x=>!wlSame(x.code, code));
  wlSave(next);
  if(it){
    const removedId=watchlistItemOrderId(it);
    defaultOrderSave(defaultOrderLoad().filter(id=>id!==removedId));
  }
  await loadSnapshot({force:true});
  if(it){ showToast(`${it.name||it.code} 삭제됨`, 'info'); }
}

async function moveWatchlistItem(code, dir){
  const rendered=lastRenderedCards.find(card=>card.userAdded && wlSame(card.code, code));
  if(rendered && moveVisibleQuoteRowByDelta(quoteRowOrderId(rendered), dir==='up' ? -1 : 1)) return;
  const list=wlLoad();
  const idx=list.findIndex(x=>wlSame(x.code, code));
  const delta=dir==='up' ? -1 : 1;
  const nextIdx=idx+delta;
  if(idx<0 || nextIdx<0 || nextIdx>=list.length) return;
  const [item]=list.splice(idx,1);
  list.splice(nextIdx,0,item);
  wlSave(list);
  if(lastSnapshot) rerenderCardsTableFromCurrentState();
  else await loadSnapshot({force:true});
}

const RIBBON_FONT_KEY='excelkospi:ribbonFont';
const RIBBON_FONT_OPTIONS={
  default:{label:'기본값', family:''},
  malgun:{label:'맑은 고딕', family:"'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif"},
  gulim:{label:'굴림체', family:"Gulim,'굴림','Apple SD Gothic Neo','Noto Sans KR',sans-serif"},
  dotum:{label:'돋움체', family:"Dotum,'돋움','Apple SD Gothic Neo','Noto Sans KR',sans-serif"},
  batang:{label:'바탕체', family:"Batang,'바탕','Apple SD Gothic Neo','Noto Sans KR',serif"},
  gungsuh:{label:'궁서체', family:"Gungsuh,'궁서','Apple SD Gothic Neo','Noto Sans KR',serif"},
  aptos:{label:'Aptos', family:"'Aptos','Segoe UI Variable','Segoe UI','Apple SD Gothic Neo','Noto Sans KR',Calibri,Arial,sans-serif"},
  segoe:{label:'Segoe UI', family:"'Segoe UI Variable','Segoe UI','Apple SD Gothic Neo','Noto Sans KR',Arial,sans-serif"},
  system:{label:'시스템 기본', family:"system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Noto Sans KR',Arial,sans-serif"},
  mono:{label:'코딩체', family:"ui-monospace,'SFMono-Regular','Cascadia Mono','Consolas','D2Coding','Apple SD Gothic Neo','Noto Sans KR',monospace"},
};

function applyRibbonFont(value){
  const key=RIBBON_FONT_OPTIONS[value] ? value : 'default';
  const option=RIBBON_FONT_OPTIONS[key];
  if(option.family){
    document.documentElement.style.setProperty('--app-font-family', option.family);
    document.body.dataset.ribbonFont=key;
  }else{
    document.documentElement.style.removeProperty('--app-font-family');
    delete document.body.dataset.ribbonFont;
  }
}

function setupRibbonFontPicker(){
  const select=document.getElementById('ribbonFontSelect');
  if(!select) return;
  let stored='default';
  try{ stored=localStorage.getItem(RIBBON_FONT_KEY) || 'default'; }catch{}
  if(!RIBBON_FONT_OPTIONS[stored]) stored='default';
  select.value=stored;
  applyRibbonFont(stored);
  select.addEventListener('change', ()=>{
    const value=RIBBON_FONT_OPTIONS[select.value] ? select.value : 'default';
    applyRibbonFont(value);
    try{
      localStorage.setItem(RIBBON_FONT_KEY, value);
      persistSet(RIBBON_FONT_KEY, value);
    }catch{}
    const label=RIBBON_FONT_OPTIONS[value]?.label || '기본값';
    showToast(value==='default' ? '글꼴을 기본값으로 되돌렸습니다' : `문서 글꼴: ${label}`, 'info');
  });
}

document.getElementById('hiddenRestore')?.addEventListener('click', ()=>{
  showAllDefaults();
  updateHiddenRestoreUi();
  closeWatchlistMoreMenu();
  loadSnapshot();
  showToast('숨겼던 기본 항목을 모두 복원했습니다', 'info');
});
document.querySelectorAll('[data-change-window]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    setChangeWindow(btn.dataset.changeWindow);
  });
});
const quoteSortSelect=document.getElementById('quoteSortMode');
if(quoteSortSelect){
  const expandManualSortLabel=()=>setQuoteSortManualLabel(true);
  const collapseManualSortLabel=()=>setQuoteSortManualLabel(false);
  quoteSortSelect.addEventListener('pointerdown', expandManualSortLabel);
  quoteSortSelect.addEventListener('touchstart', expandManualSortLabel, { passive:true });
  quoteSortSelect.addEventListener('keydown', (ev)=>{
    if(ev.key === ' ' || ev.key === 'Enter' || ev.key === 'ArrowDown' || ev.key === 'ArrowUp') expandManualSortLabel();
  });
  quoteSortSelect.addEventListener('change', (ev)=>{
    setQuoteSortMode(ev.target?.value || 'manual');
    requestAnimationFrame(collapseManualSortLabel);
  });
  quoteSortSelect.addEventListener('blur', collapseManualSortLabel);
}
document.querySelectorAll('[data-ribbon-toggle]').forEach((btn)=>btn.addEventListener('click', toggleRibbonCollapsed));
document.querySelectorAll('.tabs span').forEach((tab)=>tab.addEventListener('click', handleRibbonTabClick));
let watchlistSubmitBusy = false;
async function submitWatchlistInput(){
  const inp=document.getElementById('watchlistInput');
  const marketSelect=document.getElementById('watchlistMarket');
  let mkt=marketSelect?.value || 'auto';
  if(!String(inp.value || '').trim()){
    showToast('종목명이나 코드를 입력하세요', 'warn');
    inp.focus();
    syncWatchlistAddMode();
    return;
  }
  if(selected==='COIN') mkt='COIN';
  if(selected!=='COIN' && mkt==='COIN'){
    showToast('코인 추가는 코인 시트에서만 가능합니다', 'warn');
    return;
  }
  if(watchlistSubmitBusy) return;
  watchlistSubmitBusy = true;
  inp.setAttribute('aria-busy', 'true');
  let ok = false;
  try{
    ok = await addWatchlistItem(inp.value, mkt);
  }finally{
    inp.removeAttribute('aria-busy');
    watchlistSubmitBusy = false;
  }
  if(ok) inp.value='';
  inp.focus();
  syncWatchlistAddMode();
  if(ok) showWatchlistPhoneTip(800);
}
document.getElementById('watchlistExport')?.addEventListener('click', ()=>{
  closeWatchlistMoreMenu();
  exportWatchlistShareUrl();
});
document.getElementById('watchlistPhoneShare')?.addEventListener('click', ()=>{
  openWatchlistPhoneShareModal();
});
function closeWatchlistMoreMenu(){
  const menu=document.getElementById('watchlistMoreMenu');
  const btn=document.getElementById('watchlistMore');
  if(menu) menu.hidden=true;
  if(btn) btn.setAttribute('aria-expanded','false');
}
function toggleWatchlistMoreMenu(){
  const menu=document.getElementById('watchlistMoreMenu');
  const btn=document.getElementById('watchlistMore');
  if(!menu || !btn) return;
  const open=menu.hidden;
  menu.hidden=!open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
document.getElementById('watchlistMore')?.addEventListener('click', (ev)=>{
  ev.preventDefault();
  ev.stopPropagation();
  toggleWatchlistMoreMenu();
});
document.getElementById('watchlistMoreMenu')?.addEventListener('click', (ev)=>{
  ev.stopPropagation();
  const action=ev.target?.closest?.('[data-watchlist-action]')?.dataset?.watchlistAction;
  if(action === 'note'){
    closeWatchlistMoreMenu();
    addQuoteNoteRow();
  }else if(action === 'phone'){
    openWatchlistPhoneShareModal();
  }
});
document.addEventListener('pointerdown', (ev)=>{
  if(ev.target?.closest?.('#watchlistPanel')) return;
  closeWatchlistMoreMenu();
}, true);
document.addEventListener('click', (ev)=>{
  if(ev.target?.closest?.('#watchlistPanel')) return;
  closeWatchlistMoreMenu();
});
document.addEventListener('keydown', (ev)=>{
  if(ev.key === 'Escape') closeWatchlistMoreMenu();
});
document.getElementById('watchlistInput').addEventListener('keydown', (e)=>{
  if(e.key==='Enter'){ e.preventDefault(); submitWatchlistInput(); }
});
document.getElementById('watchlistInput').addEventListener('input', syncWatchlistAddMode);
syncWatchlistAddMode();
updateQuoteSortUi();
applyRibbonCollapsed();
setupRibbonFontPicker();
maybeShowMobileDesktopNotice();
setupPwaInstallPrompt();
setupBookmarkPrompt();
startTextAds();
startChatDonorMarquee();

/* === First-visit highlight === */
function markOneTimeTipSeen(key){
  const value=String(Date.now());
  try{
    localStorage.setItem(key, value);
    persistSet(key, value);
  }catch{}
}

function oneTimeTipSeen(key){
  try{ return !!localStorage.getItem(key); }catch{ return true; }
}

function hasSavedHoldingInfo(){
  try{ return Object.keys(holdingsLoad()).length > 0; }catch{ return false; }
}

function showAnchoredTooltip({target, pulseTarget=target, html, storageKey, timeoutMs=14000, forceClass='', tooltipClass='', placement='below', onDismiss}){
  if(!target) return null;
  const tip=document.createElement('div');
  tip.className=`fv-tooltip${tooltipClass ? ` ${tooltipClass}` : ''}`;
  tip.innerHTML=`<span class="fv-text">${html}</span><button class="fv-close" aria-label="닫기">×</button>`;
  document.body.appendChild(tip);
  pulseTarget?.classList?.add('first-visit-pulse');
  if(forceClass) pulseTarget?.classList?.add(forceClass);

  const placeTip=()=>{
    const r=target.getBoundingClientRect();
    const margin=12;
    // 타겟 중심을 기준으로 툴팁을 정렬한 뒤 화면 경계로 클램프. 좁은 ₩ 버튼처럼
    // 작은 타겟에서도 화살표가 정확히 타겟 위로 떨어지게 한다.
    const targetCenter = r.left + r.width / 2;
    const tipWidth = tip.offsetWidth || 240;
    const idealLeft = targetCenter - tipWidth / 2;
    const left = Math.min(Math.max(idealLeft, margin), window.innerWidth - tipWidth - margin);
    tip.style.left = `${left}px`;
    const tipHeight = tip.offsetHeight || 54;
    const shouldPlaceAbove = placement === 'above' || (r.bottom + 10 + tipHeight > window.innerHeight - margin);
    tip.classList.toggle('is-above', shouldPlaceAbove);
    const top = shouldPlaceAbove
      ? Math.max(margin, r.top - tipHeight - 10)
      : Math.min(r.bottom + 10, window.innerHeight - tipHeight - margin);
    tip.style.top = `${top}px`;
    // 화살표는 타겟 중심에 정확히 일치 — 단 양 끝으로 너무 치우치지 않게 18px 안에서 클램프.
    const arrowLeft = Math.min(Math.max(targetCenter - left - 5, 18), tipWidth - 18);
    tip.style.setProperty('--fv-arrow-left', `${arrowLeft}px`);
  };
  requestAnimationFrame(placeTip);
  window.addEventListener('resize', placeTip);
  window.addEventListener('scroll', placeTip, {passive:true});

  let dismissed=false;
  const dismiss=()=>{
    if(dismissed) return;
    dismissed=true;
    pulseTarget?.classList?.remove('first-visit-pulse');
    if(forceClass) pulseTarget?.classList?.remove(forceClass);
    tip.remove();
    window.removeEventListener('resize', placeTip);
    window.removeEventListener('scroll', placeTip);
    markOneTimeTipSeen(storageKey);
    onDismiss?.();
  };
  tip.querySelector('.fv-close')?.addEventListener('click', dismiss);
  setTimeout(dismiss, timeoutMs);
  return dismiss;
}

function waitForElement(selector, callback, timeoutMs=10000){
  const started=Date.now();
  const tick=()=>{
    const el=document.querySelector(selector);
    if(el){ callback(el); return; }
    if(Date.now() - started < timeoutMs) setTimeout(tick, 250);
  };
  tick();
}

function showMobileChatTip(delay=1600){
  if(!matchMedia('(max-width: 760px)').matches) return;
  if(oneTimeTipSeen(CHAT_TIP_KEY)) return;
  setTimeout(()=>{
    if(!matchMedia('(max-width: 760px)').matches) return;
    if(oneTimeTipSeen(CHAT_TIP_KEY) || document.body.classList.contains('chat-open')) return;
    const hidden = floatingHiddenLoad();
    if(hidden?.chat) return;
    waitForElement('#chatToggle', (btn)=>{
      if(oneTimeTipSeen(CHAT_TIP_KEY) || document.body.classList.contains('chat-open')) return;
      const dismiss=showAnchoredTooltip({
        target:btn,
        pulseTarget:btn,
        placement:'above',
        tooltipClass:'chat-tip',
        storageKey:CHAT_TIP_KEY,
        timeoutMs:11000,
        html:'채팅창도 열 수 있어요.<br><strong>장 보면서 한 줄씩 떠들기</strong>',
      });
      btn.addEventListener('click', ()=>dismiss?.(), {once:true});
    }, 6000);
  }, delay);
}

function showRibbonFeatureTip(delay=1800){
  if(defaultRibbonCollapsed() || oneTimeTipSeen(RIBBON_TIP_KEY)) return;
  setTimeout(()=>{
    const started=Date.now();
    const tryShow=()=>{
      if(defaultRibbonCollapsed() || document.body.classList.contains('theme-outlook') || oneTimeTipSeen(RIBBON_TIP_KEY)) return;
      if(document.querySelector('.fv-tooltip')){
        if(Date.now() - started < 22000) setTimeout(tryShow, 700);
        return;
      }
      waitForElement('#ribbonInlineToggle', (btn)=>{
        if(defaultRibbonCollapsed() || document.body.classList.contains('theme-outlook') || oneTimeTipSeen(RIBBON_TIP_KEY)) return;
        const dismiss=showAnchoredTooltip({
          target:btn,
          pulseTarget:btn,
          tooltipClass:'ribbon-tip',
          storageKey:RIBBON_TIP_KEY,
          timeoutMs:12000,
          html:'상단 리본이 거슬리면 여기서 접을 수 있어요.<br><strong>파일·홈·삽입 메뉴를 눌러도</strong> 접기/펼치기가 됩니다.',
        });
        btn.addEventListener('click', ()=>dismiss?.(), {once:true});
        document.querySelectorAll('.tabs span').forEach((tab)=>tab.addEventListener('click', ()=>dismiss?.(), {once:true}));
      }, 6000);
    };
    tryShow();
  }, delay);
}

function showHoldingFeatureTip(delay=800){
  if(oneTimeTipSeen(HOLDING_TIP_KEY)){
    showChangeWindowTip(700);
    return;
  }
  if(hasSavedHoldingInfo()){
    markOneTimeTipSeen(HOLDING_TIP_KEY);
    showChangeWindowTip(500);
    return;
  }
  setTimeout(()=>{
    if(document.body.classList.contains('theme-outlook')) return;
    waitForElement('button[data-action="edit-holding"]', (btn)=>{
      if(document.body.classList.contains('theme-outlook')) return;
      if(oneTimeTipSeen(HOLDING_TIP_KEY)){
        showChangeWindowTip(400);
        return;
      }
      const actionWrap = btn.closest('.row-actions') || btn;
      const dismiss=showAnchoredTooltip({
        target:btn,
        pulseTarget:actionWrap,
        forceClass:'fv-force-visible',
        tooltipClass:'holding-tip',
        storageKey:HOLDING_TIP_KEY,
        html:'₩ 버튼으로 구매가·수량을 입력하면<br>수익률과 손익을 바로 계산해줘요.',
        onDismiss:()=>showChangeWindowTip(900),
      });
      btn.addEventListener('click', ()=>dismiss?.(), {once:true});
    });
  }, delay);
}

function showChangeWindowTip(delay=900){
  if(oneTimeTipSeen(CHANGE_WINDOW_TIP_KEY)){
    showChartFeatureTip(900);
    return;
  }
  setTimeout(()=>{
    if(document.body.classList.contains('theme-outlook')) return;
    waitForElement('#changeWindowToggle [data-change-window="15"]', (btn)=>{
      if(document.body.classList.contains('theme-outlook')) return;
      if(oneTimeTipSeen(CHANGE_WINDOW_TIP_KEY)){
        showChartFeatureTip(500);
        return;
      }
      const dismiss=showAnchoredTooltip({
        target:btn,
        pulseTarget:document.getElementById('changeWindowToggle') || btn,
        tooltipClass:'change-window-tip',
        storageKey:CHANGE_WINDOW_TIP_KEY,
        html:'<strong>15분 · 30분 변동</strong>으로 보면<br>일간 등락에 묻혀 있던 단기 흐름이 보여요.',
        onDismiss:()=>showChartFeatureTip(900),
      });
      document.querySelectorAll('#changeWindowToggle [data-change-window]').forEach((b)=>{
        b.addEventListener('click', ()=>dismiss?.(), {once:true});
      });
    });
  }, delay);
}

function showChartFeatureTip(delay=1200){
  if(oneTimeTipSeen(CHART_TIP_KEY)) return;
  setTimeout(()=>{
    if(document.body.classList.contains('theme-outlook')) return;
    const mobile = matchMedia('(max-width:1099px)').matches;
    const selector = '#cardsTable tr[data-tv-symbol]:not([data-tv-symbol=""])';
    waitForElement(selector, ()=>{
      if(document.body.classList.contains('theme-outlook') || oneTimeTipSeen(CHART_TIP_KEY)) return;
      const preferredRow = document.querySelector('#cardsTable tr[data-tv-tip-preferred="1"][data-tv-symbol]:not([data-tv-symbol=""])');
      const row = preferredRow || document.querySelector('#cardsTable tr[data-tv-symbol]:not([data-tv-symbol=""])');
      const target = mobile
        ? row?.querySelector?.('.metric-label')
        : row?.querySelector?.('button[data-action="open-tv-chart"]');
      if(!target) return;
      const dismiss=showAnchoredTooltip({
        target,
        pulseTarget: mobile ? (row || target) : target,
        forceClass: mobile ? '' : 'fv-force-visible',
        tooltipClass:'chart-tip',
        storageKey:CHART_TIP_KEY,
        placement: mobile ? 'below' : 'above',
        timeoutMs:12000,
        html: mobile
          ? '<strong>종목명을 한 번 누르면</strong><br>아래에 차트를 바로 펼쳐볼 수 있어요.'
          : '<strong>종목명 옆 차트 버튼</strong>으로<br>뉴스/토론방 위에 큰 차트를 띄울 수 있어요.',
      });
      target.addEventListener('click', ()=>dismiss?.(), {once:true});
    }, 12000);
  }, delay);
}

function showWatchlistPhoneTip(delay=1800){
  if(oneTimeTipSeen(WATCHLIST_PHONE_TIP_KEY)) return;
  if(wlLoad().length < 2) return;
  setTimeout(()=>{
    const started = Date.now();
    const tryShow = ()=>{
      if(oneTimeTipSeen(WATCHLIST_PHONE_TIP_KEY) || wlLoad().length < 2 || document.body.classList.contains('theme-outlook')) return;
      if(document.querySelector('.fv-tooltip')){
        if(Date.now() - started < 26000) setTimeout(tryShow, 800);
        return;
      }
      waitForElement('#watchlistPhoneShare', (btn)=>{
        if(oneTimeTipSeen(WATCHLIST_PHONE_TIP_KEY) || wlLoad().length < 2 || document.body.classList.contains('theme-outlook')) return;
        const dismiss=showAnchoredTooltip({
          target:btn,
          pulseTarget:btn,
          tooltipClass:'watchlist-phone-tip',
          storageKey:WATCHLIST_PHONE_TIP_KEY,
          timeoutMs:12000,
          html:'여길 눌러 휴대폰에서도<br><strong>내 종목들을 볼 수 있어요!</strong>',
        });
        btn.addEventListener('click', ()=>dismiss?.(), {once:true});
      }, 6000);
    };
    tryShow();
  }, delay);
}

function showWatchlistFirstVisitTip(){
  if(oneTimeTipSeen(FIRST_VISIT_KEY)){
    showHoldingFeatureTip(1200);
    return;
  }
  setTimeout(()=>{
    if(document.body.classList.contains('theme-outlook')) return;
    const panel=document.getElementById('watchlistPanel');
    if(!panel){
      showHoldingFeatureTip(600);
      return;
    }
    const dismiss=showAnchoredTooltip({
      target:panel,
      pulseTarget:panel,
      storageKey:FIRST_VISIT_KEY,
      html:'여기서 원하는 종목명·코드·지수를 추가해 보세요!',
      onDismiss:()=>showHoldingFeatureTip(700),
    });
    document.getElementById('watchlistInput')?.addEventListener('focus', ()=>dismiss?.(), {once:true});
    document.getElementById('watchlistInput')?.addEventListener('keydown', ()=>dismiss?.(), {once:true});
  }, 600);
}

showRibbonFeatureTip();
showWatchlistFirstVisitTip();
showWatchlistPhoneTip(5200);
