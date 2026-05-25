// Watchlist backup/share URL import, native sharing, and QR modal.
// This module is browser-only and does not call the server.

const WATCHLIST_SHARE_PATH_PREFIX = '/s/';

function base64UrlEncodeJson(value){
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach((byte)=>{ binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeJson(value){
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch)=>ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function normalizeSharedMarket(value){
  const market = String(value || '').toUpperCase();
  return ['KR','US','COIN'].includes(market) ? market : '';
}

function normalizeSharedWatchlistItem(item){
  if(Array.isArray(item)){
    item = {
      code: item[0],
      market: item[1],
      name: item[2],
      addedAt: item[3],
    };
  }
  if(!item || typeof item !== 'object') return null;
  const code = String(item.c || item.code || '').trim().slice(0, 80);
  const market = normalizeSharedMarket(item.m || item.market);
  if(!code || !market) return null;
  const name = String(item.n || item.name || code).trim().slice(0, 80) || code;
  const addedAt = Number(item.a || item.addedAt || Date.now());
  return {
    code,
    market,
    name,
    addedAt: Number.isFinite(addedAt) ? addedAt : Date.now(),
  };
}

function normalizeSharedHoldings(input){
  const out = {};
  if(!input || typeof input !== 'object') return out;
  const limit = (typeof WATCHLIST_SHARE_STATE_LIMIT === 'number' && Number.isFinite(WATCHLIST_SHARE_STATE_LIMIT)) ? WATCHLIST_SHARE_STATE_LIMIT : 320;
  Object.entries(input).slice(0, limit).forEach(([key, value])=>{
    if(!value || typeof value !== 'object') return;
    const id = String(key || '').trim().slice(0, 100);
    if(!id) return;
    const lots = holdingLotsFromRecord(value);
    const record = holdingRecordFromLots(lots);
    if(record) out[id] = record;
  });
  return out;
}

function compactSharedHoldingsForShare(input){
  const normalized = normalizeSharedHoldings(input);
  const out = {};
  Object.entries(normalized).forEach(([id, record])=>{
    const lots = holdingLotsFromRecord(record);
    if(!lots.length) return;
    const compactLots = lots.map((lot)=>[lot.avg, lot.qty]);
    out[id] = compactLots.length === 1 ? compactLots[0] : compactLots;
  });
  return out;
}

function normalizeSharedDefaultOrder(input){
  if(!Array.isArray(input)) return [];
  const limit = (typeof WATCHLIST_SHARE_STATE_LIMIT === 'number' && Number.isFinite(WATCHLIST_SHARE_STATE_LIMIT)) ? WATCHLIST_SHARE_STATE_LIMIT : 320;
  return input
    .map((id)=>String(id || '').trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeSharedHiddenDefaults(input){
  if(!Array.isArray(input)) return [];
  const limit = (typeof WATCHLIST_SHARE_STATE_LIMIT === 'number' && Number.isFinite(WATCHLIST_SHARE_STATE_LIMIT)) ? WATCHLIST_SHARE_STATE_LIMIT : 320;
  return Array.from(new Set(input
    .map((key)=>String(key || '').trim().slice(0, 100))
    .filter(Boolean)))
    .slice(0, limit);
}

function compactWatchlistForShare(list){
  const limit = (typeof WATCHLIST_SHARE_LIMIT === 'number' && Number.isFinite(WATCHLIST_SHARE_LIMIT)) ? WATCHLIST_SHARE_LIMIT : 240;
  return (Array.isArray(list) ? list : [])
    .map(normalizeSharedWatchlistItem)
    .filter(Boolean)
    .slice(0, limit)
    .map((item)=>{
      const compact = [item.code, item.market];
      if(item.name && item.name !== item.code) compact.push(item.name);
      return compact;
    });
}

function currentWatchlistSharePayload(){
  const payload = {};
  const watchlist = compactWatchlistForShare(wlLoad());
  const holdings = compactSharedHoldingsForShare(holdingsLoad());
  const order = normalizeSharedDefaultOrder(defaultOrderLoad());
  const notes = compactQuoteNotesForShare(quoteNotesLoad());
  const hidden = normalizeSharedHiddenDefaults(Array.from(hiddenLoad()));
  if(watchlist.length) payload.w = watchlist;
  if(Object.keys(holdings).length) payload.h = holdings;
  if(order.length) payload.o = order;
  if(notes.length) payload.n = notes;
  if(hidden.length) payload.x = hidden;
  return payload;
}

function watchlistShareSlug(payload){
  const count = Math.min(99, (payload.w || []).length);
  return `l${count}`;
}

function watchlistShareUrl(payload=currentWatchlistSharePayload()){
  const encoded = base64UrlEncodeJson(payload);
  return `${location.origin}${WATCHLIST_SHARE_PATH_PREFIX}${watchlistShareSlug(payload)}~${encoded}`;
}

function sharedWatchlistPayloadFromPath(){
  const path = location.pathname || '';
  if(!path.startsWith(WATCHLIST_SHARE_PATH_PREFIX)) return null;
  const token = path.slice(WATCHLIST_SHARE_PATH_PREFIX.length).split('/')[0] || '';
  const encoded = token.includes('~') ? token.slice(token.lastIndexOf('~') + 1) : token;
  if(!encoded) return { error:'empty' };
  try{
    const raw = base64UrlDecodeJson(encoded);
    const hasHiddenDefaults = Object.prototype.hasOwnProperty.call(raw, 'x')
      || Object.prototype.hasOwnProperty.call(raw, 'hiddenDefaults')
      || Object.prototype.hasOwnProperty.call(raw, 'hidden');
    const payload = {
      v: 1,
      w: compactWatchlistForShare(raw.w || raw.watchlist || []),
      h: normalizeSharedHoldings(raw.h || raw.holdings || {}),
      o: normalizeSharedDefaultOrder(raw.o || raw.defaultOrder || []),
      n: compactQuoteNotesForShare(raw.n || raw.notes || []),
    };
    if(hasHiddenDefaults) payload.x = normalizeSharedHiddenDefaults(raw.x || raw.hiddenDefaults || raw.hidden || []);
    if(!payload.w.length && !Object.keys(payload.h).length && !payload.o.length && !payload.n.length && !payload.x?.length && !hasHiddenDefaults) return { error:'empty' };
    return payload;
  }catch{
    return { error:'invalid' };
  }
}

function clearSharedWatchlistPath(){
  if(!location.pathname.startsWith(WATCHLIST_SHARE_PATH_PREFIX)) return;
  try{ history.replaceState(null, document.title, '/'); }catch{}
}

function hasExistingWatchlistState(){
  return wlLoad().length > 0
    || Object.keys(holdingsLoad()).length > 0
    || defaultOrderLoad().length > 0
    || quoteNotesLoad().length > 0
    || hiddenLoad().size > 0;
}

async function applySharedWatchlistPayload(payload){
  const watchlist = (payload.w || [])
    .map(normalizeSharedWatchlistItem)
    .filter(Boolean)
    .map((item)=>({
      code: item.code,
      market: item.market,
      name: item.name || item.code,
      addedAt: Number(item.addedAt) || Date.now(),
    }));
  wlSave(watchlist);
  holdingsSave(normalizeSharedHoldings(payload.h));
  defaultOrderSave(normalizeSharedDefaultOrder(payload.o));
  quoteNotesSave(payload.n || []);
  if(Object.prototype.hasOwnProperty.call(payload, 'x')){
    hiddenSave(new Set(normalizeSharedHiddenDefaults(payload.x)));
    updateHiddenRestoreUi();
  }
  await persistAllSettings();
  syncWatchlistMarketUi();
}

async function maybeImportSharedWatchlistFromUrl(){
  const payload = sharedWatchlistPayloadFromPath();
  if(!payload) return false;
  clearSharedWatchlistPath();
  if(payload.error){
    showToast('공유 목록 주소를 읽지 못했습니다', 'warn');
    return false;
  }
  const count = payload.w.length;
  const holdingCount = Object.keys(payload.h).length;
  const noteCount = (payload.n || []).length;
  const hiddenCount = Object.prototype.hasOwnProperty.call(payload, 'x') ? normalizeSharedHiddenDefaults(payload.x).length : null;
  if(hasExistingWatchlistState()){
    const hiddenText = hiddenCount == null ? '' : `, 숨김 ${hiddenCount}개`;
    const overwriteText = hiddenCount == null
      ? '이미 저장된 나만의 종목 리스트와 평단가 정보는 이 자료로 덮어씌워집니다.'
      : '이미 저장된 나만의 종목 리스트, 평단가 정보, 숨김 설정은 이 자료로 덮어씌워집니다.';
    const ok = window.confirm(
      `공유된 종목 목록을 불러올까요?\n\n` +
      `종목 ${count}개, 평단가/수량 정보 ${holdingCount}개, 빈 행 메모 ${noteCount}개${hiddenText}가 포함되어 있습니다.\n` +
      overwriteText
    );
    if(!ok){
      showToast('공유 목록 불러오기를 취소했습니다', 'info');
      return false;
    }
  }
  await applySharedWatchlistPayload(payload);
  showToast(`공유 목록 ${count}개를 불러왔습니다`, 'info');
  return true;
}

function shouldUseNativeShare(){
  return !!(navigator.share && (matchMedia('(max-width: 760px)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '')));
}

function watchlistShareConfirmText(count, holdingCount, nativeShare=false){
  const noteCount = quoteNotesLoad().length;
  return (
    `현재 저장된 종목 목록을 공유 주소로 내보냅니다.\n\n` +
    `이 주소로 방문하면 종목 ${count}개, 순서, 평단가/수량 정보 ${holdingCount}개, 빈 행 메모 ${noteCount}개가 이 브라우저에 복원됩니다.\n` +
    `평단가와 수량도 주소 안에 포함되니 공개 채팅방에 올릴 때는 주의해 주세요.` +
    (nativeShare ? `\n\n확인을 누르면 휴대폰 공유창이 열립니다.` : '')
  );
}

async function copyTextToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch{
    try{
      window.prompt('공유 주소를 복사하세요', text);
      return false;
    }catch{
      return false;
    }
  }
}

let watchlistQrScriptPromise = null;

function watchlistShareSummary(payload=currentWatchlistSharePayload()){
  return {
    count: (payload.w || []).length,
    holdingCount: Object.keys(payload.h || {}).length,
    noteCount: (payload.n || []).length,
    hiddenCount: (payload.x || []).length,
  };
}

function loadWatchlistQrLibrary(){
  if(typeof window.qrcode === 'function') return Promise.resolve(window.qrcode);
  if(watchlistQrScriptPromise) return watchlistQrScriptPromise;
  watchlistQrScriptPromise = new Promise((resolve, reject)=>{
    const existing = document.querySelector('script[data-watchlist-qr-lib="1"]');
    if(existing){
      existing.addEventListener('load', ()=>resolve(window.qrcode), { once:true });
      existing.addEventListener('error', reject, { once:true });
      return;
    }
    const script = document.createElement('script');
    script.src = '/assets/vendor/qrcode.js?v=20260524-474';
    script.async = true;
    script.dataset.watchlistQrLib = '1';
    script.onload = ()=>{
      if(typeof window.qrcode === 'function') resolve(window.qrcode);
      else reject(new Error('QR library unavailable'));
    };
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch((error)=>{
    watchlistQrScriptPromise = null;
    throw error;
  });
  return watchlistQrScriptPromise;
}

function closeWatchlistPhoneModal(){
  const modal = document.getElementById('watchlistPhoneModal');
  if(!modal) return;
  modal.remove();
  document.removeEventListener('keydown', handleWatchlistPhoneModalKeydown);
}

function handleWatchlistPhoneModalKeydown(ev){
  if(ev.key === 'Escape') closeWatchlistPhoneModal();
}

function renderWatchlistQrInto(box, url){
  loadWatchlistQrLibrary().then((qrFactory)=>{
    const qr = qrFactory(0, url.length > 1400 ? 'L' : 'M');
    qr.addData(url);
    qr.make();
    box.innerHTML = qr.createSvgTag(5, 2, 'watchlist share QR', 'excelkospi 공유 목록 QR');
  }).catch(()=>{
    box.innerHTML = '<div class="watchlist-phone-fallback">QR을 만들지 못했습니다.<br>아래 버튼으로 주소를 복사해 주세요.</div>';
  });
}

function openWatchlistPhoneShareModal(){
  const payload = currentWatchlistSharePayload();
  const summary = watchlistShareSummary(payload);
  if(!summary.count && !summary.holdingCount && !(payload.o || []).length && !summary.noteCount && !summary.hiddenCount){
    showToast('휴대폰으로 옮길 종목이나 평단가 정보가 없습니다', 'warn');
    return;
  }
  closeWatchlistMoreMenu();
  closeWatchlistPhoneModal();
  markOneTimeTipSeen(WATCHLIST_PHONE_TIP_KEY);
  const url = watchlistShareUrl(payload);
  const modal = document.createElement('div');
  modal.className = 'watchlist-phone-modal';
  modal.id = 'watchlistPhoneModal';
  modal.innerHTML = `
    <div class="watchlist-phone-backdrop" data-watchlist-phone-close></div>
    <section class="watchlist-phone-card" role="dialog" aria-modal="true" aria-labelledby="watchlistPhoneTitle">
      <header class="watchlist-phone-head">
        <span class="watchlist-phone-icon"><svg aria-hidden="true"><use href="#i-phone"></use></svg></span>
        <span class="watchlist-phone-title">
          <strong id="watchlistPhoneTitle">목록 휴대폰으로 보내기</strong>
          <span>종목 ${summary.count}개 · 평단가/수량 ${summary.holdingCount}개 · 빈 행 ${summary.noteCount}개</span>
        </span>
        <button class="watchlist-phone-close" type="button" data-watchlist-phone-close aria-label="닫기">×</button>
      </header>
      <div class="watchlist-phone-body">
        <div class="watchlist-phone-qr-wrap">
          <div class="watchlist-phone-qr" id="watchlistPhoneQr"><div class="watchlist-phone-loading">QR 코드 만드는 중...</div></div>
        </div>
        <div class="watchlist-phone-underqr">
          <span>QR 인식이 잘 안되면 <button type="button" data-watchlist-phone-copy>주소를 복사</button>하세요.</span>
          <span>메신저로 휴대폰에 보내 접속할 수 있습니다.</span>
        </div>
        <div class="watchlist-phone-copy">
          <strong>휴대폰에서 이 코드를 스캔하시면 저장한 목록 그대로 볼 수 있습니다.</strong>
          <span>주소 안에 종목 순서, 평단가/수량, 빈 행 메모가 함께 들어갑니다. 공개된 곳에 올릴 때는 주의해 주세요.</span>
          <span class="watchlist-phone-url">${esc(url)}</span>
        </div>
        <div class="watchlist-phone-actions">
          <button type="button" data-watchlist-phone-copy>주소 복사</button>
          ${navigator.share ? '<button class="primary" type="button" data-watchlist-phone-native>공유창 열기</button>' : ''}
        </div>
        ${url.length > 1800 ? '<div class="watchlist-phone-note">목록이 길어 QR이 촘촘할 수 있습니다. 인식이 잘 안 되면 주소 복사를 사용해 주세요.</div>' : ''}
      </div>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-watchlist-phone-close]').forEach((el)=>el.addEventListener('click', closeWatchlistPhoneModal));
  modal.querySelectorAll('[data-watchlist-phone-copy]').forEach((el)=>el.addEventListener('click', async ()=>{
    const copied = await copyTextToClipboard(url);
    showToast(copied ? '휴대폰 공유 주소가 복사되었습니다' : '공유 주소를 만들었습니다', 'info');
  }));
  modal.querySelector('[data-watchlist-phone-native]')?.addEventListener('click', async ()=>{
    try{
      await navigator.share({
        title:'excelkospi 종목 목록',
        text:`이 주소로 열면 종목 ${summary.count}개와 순서${summary.holdingCount ? `, 평단가/수량 정보 ${summary.holdingCount}개` : ''}${summary.noteCount ? `, 빈 행 메모 ${summary.noteCount}개` : ''}가 불러와집니다.`,
        url,
      });
    }catch(e){
      if(String(e?.name || '').toLowerCase() !== 'aborterror') showToast('공유창을 열지 못했습니다. 주소 복사를 사용해 주세요', 'warn');
    }
  });
  document.addEventListener('keydown', handleWatchlistPhoneModalKeydown);
  renderWatchlistQrInto(modal.querySelector('#watchlistPhoneQr'), url);
}

async function exportWatchlistShareUrl(){
  const payload = currentWatchlistSharePayload();
  const { count, holdingCount, noteCount, hiddenCount } = watchlistShareSummary(payload);
  if(!count && !holdingCount && !(payload.o || []).length && !noteCount && !hiddenCount){
    showToast('내보낼 종목이나 평단가 정보가 없습니다', 'warn');
    return;
  }
  const url = watchlistShareUrl(payload);
  if(shouldUseNativeShare()){
    if(!window.confirm(watchlistShareConfirmText(count, holdingCount, true))) return;
    try{
      await navigator.share({
        title: 'excelkospi 종목 목록',
        text: `이 주소로 열면 종목 ${count}개와 순서${holdingCount ? `, 평단가/수량 정보 ${holdingCount}개` : ''}${noteCount ? `, 빈 행 메모 ${noteCount}개` : ''}가 불러와집니다.`,
        url,
      });
      return;
    }catch(e){
      if(String(e?.name || '').toLowerCase() === 'aborterror') return;
    }
  }
  const ok = window.confirm(watchlistShareConfirmText(count, holdingCount));
  if(!ok) return;
  const copied = await copyTextToClipboard(url);
  showToast(copied ? '공유 주소가 복사되었습니다' : '공유 주소를 만들었습니다', 'info');
}
