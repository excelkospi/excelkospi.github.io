/* Stock mention and community search-only helpers.
 * Loaded before app.js; runtime references are resolved when handlers run.
 */
const STOCK_MENTION_RE = /(^|[\s([{<])@([가-힣A-Za-z0-9._+\-=^&%()]{1,32})/g;
let stockMentionCache = null;
const stockMentionPending = new Set();
let stockMentionInFlight = false;

function stockMentionKey(value){
  return String(value || '')
    .replace(/^@+/, '')
    .trim()
    .replace(/[.,;:!?，。]+$/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

const COMMUNITY_SEARCH_ONLY_WARNING = '여기는 종목 검색란이 아닙니다. 내용을 입력해주세요';
const COMMUNITY_LOCAL_STOCK_ALIASES = [
  '코스피','KOSPI','코스닥','KOSDAQ',
  '삼성전자','삼전','005930',
  'SK하이닉스','하이닉스','하닉','000660',
  '현대자동차','현대차','005380',
  'LG전자','엘지전자','066570',
  'TIGER 200IT레버리지','TIGER200IT레버리지','243880',
  '나스닥 선물','나스닥선물','NQ','NQ=F',
  '나스닥','NASDAQ','다우','DOW','DOWJONES',
  'S&P500','SP500','에스앤피',
  'TQQQ','SPY','SOXL','엔비디아','NVIDIA','NVDA',
  '테슬라','TESLA','TSLA','애플','APPLE','AAPL',
  'BTC','BTCUSD','BTCUSDT','비트코인',
  'ETH','ETHUSD','ETHUSDT','이더리움',
  'XRP','XRPUSDT','리플',
  'SOL','SOLUSDT','솔라나',
  'BNB','BNBUSDT','바이낸스코인',
  'DOGE','DOGEUSDT','도지코인',
  'USDT','USDTKRW','USDT/KRW',
];

function communitySearchOnlyKey(value){
  return stockMentionKey(String(value || '')
    .trim()
    .replace(/^[@#＃]+/, '')
    .replace(/[~`'"“”‘’()\[\]{}<>]/g, ''));
}

function communityLocalStockNameKeys(){
  const keys = new Set(COMMUNITY_LOCAL_STOCK_ALIASES.map(communitySearchOnlyKey).filter(Boolean));
  try{
    (lastRenderedCards || []).forEach((card)=>{
      if(card?._noteRow) return;
      [card?.key, card?.name, card?.code].forEach((value)=>{
        const key = communitySearchOnlyKey(value);
        if(key) keys.add(key);
      });
    });
  }catch{}
  return keys;
}

function isCommunitySearchOnlyText(text){
  const raw = String(text || '').trim();
  if(!raw || /\s/.test(raw)) return false;
  const key = communitySearchOnlyKey(raw);
  if(!key || key.length < 2) return false;
  return communityLocalStockNameKeys().has(key);
}

function warnCommunitySearchOnly(input){
  showToast(COMMUNITY_SEARCH_ONLY_WARNING, 'warn');
  try{ input?.focus?.(); input?.select?.(); }catch{}
}

function readStockMentionCache(){
  if(stockMentionCache) return stockMentionCache;
  stockMentionCache = new Map();
  try{
    const parsed = JSON.parse(localStorage.getItem(STOCK_MENTION_CACHE_KEY) || '{}');
    const now = Date.now();
    Object.entries(parsed || {}).forEach(([key, item])=>{
      if(!key || !item) return;
      if(now - Number(item.at || 0) > 14 * 24 * 60 * 60 * 1000) return;
      stockMentionCache.set(key, item.value || item);
    });
  }catch{}
  return stockMentionCache;
}

function writeStockMentionCache(){
  try{
    const out = {};
    Array.from(readStockMentionCache().entries()).slice(-200).forEach(([key, value])=>{
      out[key] = { at:Date.now(), value };
    });
    localStorage.setItem(STOCK_MENTION_CACHE_KEY, JSON.stringify(out));
  }catch{}
}

function queueStockMentionResolve(term){
  const key = stockMentionKey(term);
  if(!key || readStockMentionCache().has(key) || stockMentionPending.has(key)) return;
  stockMentionPending.add(key);
}

function stockMentionHref(item){
  if(item?.href) return item.href;
  if(!item?.code || !item?.market) return '';
  const code = String(item.code || '');
  if(item.market === 'KR'){
    if(code === 'KOSPI' || code === 'KOSDAQ') return `https://finance.naver.com/sise/sise_index.naver?code=${encodeURIComponent(code)}`;
    return `https://finance.naver.com/item/main.naver?code=${encodeURIComponent(code)}`;
  }
  if(item.market === 'COIN'){
    const base = code.toUpperCase().replace(/USDT$/, '').replace(/USD$/, '');
    return `https://www.binance.com/en/trade/${encodeURIComponent(base)}_USDT`;
  }
  return `https://finance.yahoo.com/quote/${encodeURIComponent(code)}`;
}

function stockMentionChartToken(item){
  if(!item?.ok || !item?.code || !item?.market) return '';
  return normalizeQuoteToken(`${item.code}:${item.market}`);
}

function stockMentionSnapshotForKey(snapshots, key){
  if(!snapshots || typeof snapshots !== 'object') return null;
  const item = snapshots[key] || snapshots[String(key || '').toUpperCase()];
  return item?.ok ? item : null;
}

function stockMentionDailyChangeHtml(item){
  const raw = item?.changePct;
  const value = Number(raw);
  if(!Number.isFinite(value)) return '';
  return `<span class="stock-mention-change ${cls(value)}">${pct(value)}</span>`;
}

function renderStockMentionBadge(rawTerm, snapshots=null){
  const term = String(rawTerm || '').replace(/[.,;:!?，。]+$/g, '');
  const key = stockMentionKey(term);
  const frozen = key ? stockMentionSnapshotForKey(snapshots, key) : null;
  const cached = frozen || (key ? readStockMentionCache().get(key) : null);
  if(cached?.ok){
    const label = cached.name || term;
    const href = stockMentionHref(cached);
    const market = cached.market || '';
    const token = stockMentionChartToken(cached);
    const chartAttrs = token ? ` data-stock-mention-token="${esc(token)}" data-chart-label="${esc(label)}"` : '';
    const changeHtml = stockMentionDailyChangeHtml(cached);
    if(href){
      return `<a class="stock-mention-badge" href="${esc(href)}" target="_blank" rel="noopener" data-stock-mention="${esc(key)}"${chartAttrs} title="${esc(label)} 상세정보 열기">${esc(label)}${market ? `<span class="stock-mention-market">${esc(market)}</span>` : ''}${changeHtml}</a>`;
    }
    return `<span class="stock-mention-badge" data-stock-mention="${esc(key)}"${chartAttrs}>${esc(label)}${changeHtml}</span>`;
  }
  if(cached && cached.ok === false) return esc(`@${term}`);
  if(!cached) queueStockMentionResolve(term);
  return `<span class="stock-mention-badge pending" data-stock-mention-pending="${esc(key)}">@${esc(term)}</span>`;
}

function renderTextWithStockMentions(text, snapshots=null){
  const raw = String(text || '');
  let html = '';
  let last = 0;
  raw.replace(STOCK_MENTION_RE, (match, prefix, term, offset)=>{
    html += esc(raw.slice(last, offset));
    html += esc(prefix || '');
    html += renderStockMentionBadge(term, snapshots);
    last = offset + match.length;
    return match;
  });
  html += esc(raw.slice(last));
  return html;
}

async function flushStockMentionQueue(){
  if(stockMentionInFlight || !stockMentionPending.size || !timelineIsCommunity()) return;
  const terms = Array.from(stockMentionPending).slice(0, 12);
  terms.forEach((term)=>stockMentionPending.delete(term));
  if(!terms.length) return;
  stockMentionInFlight = true;
  try{
    const url = `/api/resolve-mentions?terms=${encodeURIComponent(terms.join(','))}&market=AUTO`;
    const data = await fetchJsonClient(url, 6000);
    const cache = readStockMentionCache();
    const returned = new Set();
    (Array.isArray(data?.items) ? data.items : []).forEach((item)=>{
      const key = stockMentionKey(item?.term);
      if(!key) return;
      returned.add(key);
      cache.set(key, item?.ok ? {
        ok:true,
        market:item.market,
        code:item.code,
        name:item.name,
        href:item.href,
      } : { ok:false });
    });
    terms.forEach((term)=>{
      if(!returned.has(stockMentionKey(term))) cache.set(stockMentionKey(term), { ok:false });
    });
    writeStockMentionCache();
    if(timelineIsCommunity()) renderCommunityTable();
  }catch{
    terms.forEach((term)=>stockMentionPending.add(term));
  }finally{
    stockMentionInFlight = false;
  }
}
