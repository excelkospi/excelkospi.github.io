/* excelkospi community/news-ad UI helpers.
 * Extracted from app.js to keep the main runtime easier to review.
 * Loaded after app-config.js and before app.js.
 */
// 뷰포트가 좁거나 (모바일/태블릿), 데스크탑이라도 timeline 패널이 좁게 줄어들면
// compact (2~3 컬럼) 레이아웃으로 전환한다. 좁은 데스크탑에서 5 컬럼이 우겨 들어가서
// '요약' 이 줄바꿈 폭탄이 되고 '링크' 버튼이 어색해 보이는 문제를 막는다.
// 임계값은 sheets-grid 가 single-column 으로 떨어지는 1100px 와 맞춤.
// body.timeline-narrow 는 ResizeObserver 가 별도로 토글한다 (좁은 timeline 패널).
function newsCompactLayout(){
  if(window.matchMedia?.('(max-width:1099px)')?.matches) return true;
  return !!document.body?.classList.contains('timeline-narrow');
}

function communityCompactLayout(){
  if(window.matchMedia?.('(max-width:1099px)')?.matches) return true;
  return !!document.body?.classList.contains('timeline-narrow');
}

function communityAuthorHtml(nickname){
  const name = nickname || '익명';
  const normalized = String(name).replace(/\s+/g, '').trim();
  const isAdminLike = normalized === ADMIN_NICKNAME || normalized === AI_BOT_NICKNAME;
  const cls = isAdminLike ? ' community-author-admin' : '';
  return `<span class="community-author-name${cls}">${esc(name)}</span>`;
}

function communityTableHeader(compact=false, topRows=''){
  const actionCols = compact
    ? ''
    : '<col class="community-report-col">';
  const colHeads = compact
    ? '<th class="colhead">A</th><th class="colhead">B</th><th class="colhead">C</th>'
    : '<th class="colhead">A</th><th class="colhead">B</th><th class="colhead">C</th><th class="colhead">D</th>';
  const subHeads = compact
    ? '<th class="subhead">작성자</th><th class="subhead">내용</th><th class="subhead">시각</th>'
    : '<th class="subhead">작성자</th><th class="subhead">내용</th><th class="subhead">시각</th><th class="subhead">추천/신고</th>';
  return `
    <colgroup>
      <col class="community-rownum-col">
      <col class="community-author-col">
      <col class="community-body-col">
      <col class="community-time-col">
      ${actionCols}
    </colgroup>
    ${topRows}
    <tr class="community-colhead-row">
      <th class="rownum"></th>
      ${colHeads}
    </tr>
    <tr class="community-subhead-row">
      <th class="rownum">1</th>
      ${subHeads}
    </tr>`;
}

function communityTotalPages(){
  return Math.max(1, Math.ceil(communityPosts.length / COMMUNITY_PAGE_SIZE));
}

function communityPostPinnedUntilMs(post){
  const hidden = !!post?.hidden || Number(post?.report_count || 0) >= COMMUNITY_HIDE_REPORTS;
  if(hidden) return 0;
  const ms = Date.parse(post?.pinned_until || '');
  return post?.pinned && Number.isFinite(ms) && ms > Date.now() ? ms : 0;
}

function compareCommunityPostsForDisplay(a,b){
  const ap = communityPostPinnedUntilMs(a);
  const bp = communityPostPinnedUntilMs(b);
  if(ap || bp){
    if(ap !== bp) return bp - ap;
    const ar = Number(a?.recommend_count || 0);
    const br = Number(b?.recommend_count || 0);
    if(ar !== br) return br - ar;
  }
  return String(b?.created_at || '').localeCompare(String(a?.created_at || ''));
}

function communitySortedPosts(){
  return communityPosts.slice().sort(compareCommunityPostsForDisplay);
}

function clampCommunityPage(){
  const totalPages = communityTotalPages();
  communityPage = Math.min(Math.max(1, Number(communityPage) || 1), totalPages);
  return communityPage;
}

function communityPagePosts(){
  const page = clampCommunityPage();
  const start = (page - 1) * COMMUNITY_PAGE_SIZE;
  return communitySortedPosts().slice(start, start + COMMUNITY_PAGE_SIZE);
}

function communityPaginationRow(rowNum, dataCols){
  const totalPages = communityTotalPages();
  const page = clampCommunityPage();
  const totalPosts = communityPosts.length;
  const from = totalPosts ? (page - 1) * COMMUNITY_PAGE_SIZE + 1 : 0;
  const to = Math.min(communityPosts.length, page * COMMUNITY_PAGE_SIZE);
  const rangeText = totalPosts ? `${from}-${to}번째 글` : '게시글 없음';
  return `<tr class="community-pagination-row">
    <td class="rownum">${rowNum}</td>
    <td colspan="${dataCols}" class="community-pagination-cell">
      <div class="community-pagination">
        <button type="button" data-community-page="prev" ${page<=1?'disabled':''}>이전</button>
        <span>${page} / ${totalPages}쪽 · ${rangeText}</span>
        <button type="button" data-community-page="next" ${page>=totalPages?'disabled':''}>다음</button>
      </div>
    </td>
  </tr>`;
}

function communityReadMarkerRow(rowNum, dataCols, info={}){
  const details = [];
  if(Number(info.unreadCount || 0) > 0) details.push(`위쪽 새 글 ${Number(info.unreadCount || 0)}개`);
  if(Number(info.unreadCommentCount || 0) > 0) details.push(`새 댓글 ${Number(info.unreadCommentCount || 0)}개`);
  if(Number(info.replyToMeCount || 0) > 0) details.push(`내 글 답글 ${Number(info.replyToMeCount || 0)}개`);
  return `<tr class="community-read-marker-row">
    <td class="rownum">${rowNum}</td>
    <td colspan="${dataCols}" class="community-read-marker-cell">
      <span>여기까지 읽으셨습니다</span>${details.length ? `<em>${esc(details.join(' · '))}</em>` : ''}
    </td>
  </tr>`;
}

const DEFAULT_TEXT_AD = {
  id:'sponsor-open',
  active:true,
  label:'알림',
  text:'이곳에 한줄 광고를 넣어주실 광고주를 모십니다.',
  texts:['이곳에 한줄 광고를 넣어주실 광고주를 모십니다.'],
  href:'mailto:excelkospi@outlook.com',
  weight:1,
  placements:['chat','community','summary'],
};
let textAds = [DEFAULT_TEXT_AD];
let adsLoaded = false;
let adsLoadPromise = null;
let adRotationTimer = null;
let adCreativeTimer = null;
const textAdSelections = {};
const textAdSlotSelections = {};
const AD_CREATIVE_ROTATION_MS = 5000;

function normalizeTextAdWeight(value){
  const n = Number(value);
  if(!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

function normalizeTextAdTexts(item){
  const source = Array.isArray(item?.texts)
    ? item.texts
    : (typeof item?.texts === 'string' ? item.texts.split(/\r?\n/) : [item?.text || item?.copy || item?.message || '']);
  return source
    .map((v)=>String(v || '').trim())
    .filter(Boolean)
    .slice(0,8);
}

function normalizeTextAd(item){
  if(!item || item.active === false) return null;
  const texts = normalizeTextAdTexts(item);
  if(!texts.length) return null;
  const href = String(item.href || item.url || '').trim();
  const placements = Array.isArray(item.placements)
    ? item.placements.map((v)=>String(v||'').trim()).filter(Boolean)
    : ['chat','community','summary'];
  return {
    id:String(item.id || texts[0]).slice(0,80),
    active:true,
    label:String(item.label || '알림').trim() || '알림',
    text:texts[0],
    texts,
    href,
    weight:normalizeTextAdWeight(item.weight ?? item.exposureWeight ?? item.priority),
    placements:placements.length ? placements : ['chat','community','summary'],
  };
}

function safeTextAdHref(href){
  const value = String(href || '').trim();
  if(!value) return '';
  if(/^mailto:/i.test(value)) return value;
  if(/^https?:\/\//i.test(value)) return value;
  return '';
}

function textAdCandidates(placement){
  const place = String(placement || '').trim();
  if(adsLoaded && (!Array.isArray(textAds) || !textAds.length)) return [];
  let ads = textAds.filter((ad)=>ad && ad.active !== false && (!ad.placements?.length || ad.placements.includes(place)));
  if(!ads.length && place === 'summary'){
    ads = textAds.filter((ad)=>ad && ad.active !== false && (!ad.placements?.length || ad.placements.includes('chat') || ad.placements.includes('community')));
  }
  if(ads.length) return ads;
  return adsLoaded ? [] : [DEFAULT_TEXT_AD];
}

function textAdById(id){
  const key = String(id || '');
  if(!key) return null;
  return textAds.find((ad)=>ad && ad.active !== false && String(ad.id || '') === key) || null;
}

function textAdWeight(ad){
  const n = Number(ad?.weight);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function weightedRandomTextAd(ads){
  const list = Array.isArray(ads) && ads.length ? ads : [DEFAULT_TEXT_AD];
  const total = list.reduce((sum, ad)=>sum + textAdWeight(ad), 0);
  if(total <= 0) return list[Math.floor(Math.random() * list.length)] || DEFAULT_TEXT_AD;
  let cursor = Math.random() * total;
  for(const ad of list){
    cursor -= textAdWeight(ad);
    if(cursor <= 0) return ad;
  }
  return list[list.length - 1] || DEFAULT_TEXT_AD;
}

function textAdSelectionSignature(ads){
  return ads.map((ad)=>[
    ad.id || '',
    ad.weight ?? 1,
    ad.href || '',
    ad.active === false ? 0 : 1,
    textAdTexts(ad).join('\u001f'),
  ].join(':')).join('|');
}

function textAdForPlacement(placement, options={}){
  const rawAds = textAdCandidates(placement);
  if(!rawAds.length) return null;
  const excludeIds = new Set((Array.isArray(options.excludeIds) ? options.excludeIds : []).map((id)=>String(id || '')).filter(Boolean));
  const ads = excludeIds.size ? (rawAds.filter((ad)=>!excludeIds.has(String(ad?.id || ''))) || rawAds) : rawAds;
  const pickList = ads.length ? ads : rawAds;
  if(options.cache === false) return weightedRandomTextAd(pickList);
  const key = String(placement || 'default');
  const bucket = Math.floor(Date.now() / Math.max(60000, Number(AD_ROTATION_MS) || 300000));
  const signature = textAdSelectionSignature(pickList);
  const cached = textAdSelections[key];
  if(cached && cached.bucket === bucket && cached.signature === signature) return cached.ad || DEFAULT_TEXT_AD;
  const ad = weightedRandomTextAd(pickList);
  textAdSelections[key] = { bucket, signature, ad };
  return ad || DEFAULT_TEXT_AD;
}

function textAdForPlacementSlot(placement, slotKey, options={}){
  const key = `${String(placement || 'default')}:${String(slotKey || 'default')}`;
  const excludeIds = new Set((Array.isArray(options.excludeIds) ? options.excludeIds : []).map((id)=>String(id || '')).filter(Boolean));
  const rawAds = textAdCandidates(placement);
  if(!rawAds.length) return null;
  const current = textAdById(textAdSlotSelections[key]?.id);
  if(current && (!excludeIds.has(String(current.id || '')) || rawAds.length <= excludeIds.size + 1)) return current;
  const pickList = excludeIds.size ? rawAds.filter((ad)=>!excludeIds.has(String(ad?.id || ''))) : rawAds;
  const ad = weightedRandomTextAd(pickList.length ? pickList : rawAds);
  textAdSlotSelections[key] = { id:String(ad?.id || '') };
  return ad || DEFAULT_TEXT_AD;
}

function textAdTexts(ad){
  const values = Array.isArray(ad?.texts) && ad.texts.length ? ad.texts : [ad?.text || DEFAULT_TEXT_AD.text];
  return values.map((v)=>String(v || '').trim()).filter(Boolean);
}

function textAdCreative(ad, placement='', slot=0){
  const texts = textAdTexts(ad);
  const list = texts.length ? texts : [DEFAULT_TEXT_AD.text];
  if(list.length <= 1) return { text:list[0], index:0, total:list.length };
  const offset = (placement === 'community' ? 1 : (placement === 'summary' ? 2 : 0)) + (Number(slot) || 0);
  const bucket = Math.floor(Date.now() / AD_CREATIVE_ROTATION_MS);
  const index = (bucket + offset) % list.length;
  return { text:list[index], index, total:list.length };
}

function textAdDataAttrs(ad, creative){
  return {
    adId: ad?.id || '',
    adLabel: ad?.label || '알림',
    creativeIndex: String(creative?.index ?? 0),
    creativeText: String(creative?.text || '').slice(0, 120),
  };
}

function textAdLinkHtml(ad, creative){
  const href = safeTextAdHref(ad?.href);
  if(!href) return '';
  const external = /^https?:\/\//i.test(href);
  const attrs = external ? ' target="_blank" rel="noopener"' : '';
  return `<a class="notice-copy" href="${esc(href)}"${attrs} data-xk-click="1">${esc(creative?.text || ad?.text || DEFAULT_TEXT_AD.text)}</a>`;
}

function textAdTitle(ad, creative){
  const href = safeTextAdHref(ad?.href);
  const suffix = creative?.total > 1 ? `${Number(creative.index || 0) + 1}/${creative.total}` : '';
  return [creative?.text || ad?.text || '', suffix, href].filter(Boolean).join(' · ');
}

function textAdContentHtml(ad, creative){
  const link = textAdLinkHtml(ad, creative);
  if(link) return link;
  return `<span class="notice-copy">${esc(creative?.text || ad?.text || DEFAULT_TEXT_AD.text)}</span>`;
}

function renderCommunityTextAd(ad, placement='community', creative=textAdCreative(ad, placement)){
  return `<div class="community-text-note" title="${esc(textAdTitle(ad, creative))}">
        ${textAdContentHtml(ad, creative)}
      </div>`;
}

// 시세창 하단 광고는 두 곳에 동시에 렌더된다:
//   - 데스크탑: #summarySheetNotice (col-summary 의 floating overlay div)
//   - 모바일:   cardsTable 안의 .summary-sheet-note-row <tr>
// 둘 다 같은 광고 데이터를 받아 data-xk-* 속성·콘텐츠를 동기화한다. CSS media
// query 가 한 쪽만 보이게 처리. observeAdImpression 으로 노출 카운트도 양쪽 다 잡힘.
function applySummaryAdToEl(el, ad, creative, attrs){
  if(!el) return;
  flushAdHover(el);
  el.dataset.xkId = attrs.adId;
  el.dataset.xkLabel = attrs.adLabel;
  el.dataset.xkVariantIndex = attrs.creativeIndex;
  el.dataset.xkVariantText = attrs.creativeText;
  el.title = textAdTitle(ad, creative);
  observeAdImpression(el);
}
function refreshSummaryAdRow(){
  const ad = textAdForPlacement('summary');
  // 1) 모바일 인라인 <tr>
  const row = document.querySelector('#cardsTable .summary-sheet-note-row');
  const blankRow = row?.previousElementSibling?.classList?.contains('summary-sheet-note-blank-row') ? row.previousElementSibling : null;
  const overlay = document.getElementById('summarySheetNotice');
  if(!ad){
    [row, blankRow, overlay].forEach((el)=>{
      if(!el) return;
      flushAdHover(el);
      el.hidden = true;
    });
    return;
  }
  const creative = textAdCreative(ad, 'summary');
  const attrs = textAdDataAttrs(ad, creative);
  if(blankRow) blankRow.hidden = false;
  if(row){
    row.hidden = false;
    const cell = row.querySelector('.summary-sheet-note-cell');
    if(cell){
      cell.innerHTML = `<span class="notice-badge" data-xk-label>${esc(ad.label || '광고')}</span>${renderCommunityTextAd(ad, 'summary', creative)}`;
    }
    applySummaryAdToEl(row, ad, creative, attrs);
  }
  // 2) 데스크탑 overlay #summarySheetNotice
  if(overlay){
    overlay.hidden = false;
    overlay.innerHTML = `<span class="notice-badge" data-xk-label>${esc(ad.label || '알림')}</span>${renderCommunityTextAd(ad, 'summary', creative)}`;
    applySummaryAdToEl(overlay, ad, creative, attrs);
  }
}
window.refreshSummaryAdRow = refreshSummaryAdRow;

function updateChatTextAd(){
  const root = document.querySelector('[data-xk-area="chat"]');
  if(!root) return;
  flushAdHover(root);
  const ad = textAdForPlacement('chat');
  if(!ad){
    root.hidden = true;
    return;
  }
  root.hidden = false;
  const creative = textAdCreative(ad, 'chat');
  const attrs = textAdDataAttrs(ad, creative);
  root.dataset.xkId = attrs.adId;
  root.dataset.xkLabel = attrs.adLabel;
  root.dataset.xkVariantIndex = attrs.creativeIndex;
  root.dataset.xkVariantText = attrs.creativeText;
  root.innerHTML = `<span class="notice-badge" data-xk-label>${esc(ad.label || '알림')}</span>${textAdContentHtml(ad, creative)}`;
  root.title = textAdTitle(ad, creative);
  observeAdImpression(root);
}

function updateSummaryTextAd(){
  refreshSummaryAdRow();
}

function updateCommunityTextAdElements(){
  const rows = document.querySelectorAll('[data-xk-area="community"]');
  if(!rows.length) return 0;
  let updated = 0;
  rows.forEach((root, index)=>{
    flushAdHover(root);
    const ad = textAdById(root.dataset.xkId || root.getAttribute('data-xk-id')) || textAdForPlacementSlot('community', root.dataset.xkPosition || `community-row-${index + 1}`);
    if(!ad){
      root.remove();
      return;
    }
    const creative = textAdCreative(ad, 'community', index + 1);
    const attrs = textAdDataAttrs(ad, creative);
    root.dataset.xkId = attrs.adId;
    root.dataset.xkLabel = attrs.adLabel;
    root.dataset.xkVariantIndex = attrs.creativeIndex;
    root.dataset.xkVariantText = attrs.creativeText;
    root.title = textAdTitle(ad, creative);
    const badge = root.querySelector('.notice-badge');
    if(badge) badge.textContent = ad.label || '알림';
    const holder = root.querySelector('.community-text-note');
    if(holder) holder.outerHTML = renderCommunityTextAd(ad, 'community', creative);
    observeAdImpression(root);
    updated++;
  });
  return updated;
}

const adImpressionState = new WeakMap();
const adImpressionReportedKeys = new Set();
const adCreativeImpressionReportedKeys = new Set();
const adHoverState = new WeakMap();
let adImpressionObserver = null;
let adClickTrackerReady = false;
let adHoverTrackerReady = false;
const AD_VIEW_CAP_MS = 30 * 60 * 1000;
const AD_VIEW_CAP_STORAGE_KEY = 'excelkospi.adViewCaps.v1';
let adViewCapCache = null;
function adLinkDomain(href){
  try{
    const url = new URL(String(href || ''), location.href);
    return url.protocol === 'mailto:' ? 'mailto' : url.hostname;
  }catch{
    return '';
  }
}
function adTimeBucketKst(date=new Date()){
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Seoul', hour:'numeric', hourCycle:'h23' }).format(date));
  const safeHour = Number.isFinite(hour) ? hour : date.getHours();
  return `${String(Math.floor(safeHour / 3) * 3).padStart(2, '0')}-${String(Math.min(23, Math.floor(safeHour / 3) * 3 + 2)).padStart(2, '0')}`;
}
function adHourKst(date=new Date()){
  try{
    return new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Seoul', hour:'2-digit', hourCycle:'h23' }).format(date);
  }catch{
    return String(date.getHours()).padStart(2, '0');
  }
}
function adPositionFromElement(el, placement=''){
  const explicit = el?.getAttribute?.('data-xk-position') || el?.dataset?.xkPosition || '';
  if(explicit) return explicit;
  if(placement === 'chat') return 'chat-title';
  const row = el?.querySelector?.('.rownum')?.textContent?.trim?.() || '';
  return row ? `community-row-${row}` : 'community-feed';
}
function adImpressionKeyFor(adId, placement, position=''){
  return `${String(placement || '')}::${String(position || '')}::${String(adId || '')}`;
}
function adCreativeKeyPart(creativeIndex='', creativeText=''){
  const index = String(creativeIndex || '0').slice(0, 20);
  const text = String(creativeText || '').slice(0, 80);
  return `${index}::${text}`;
}
function adExposureKeyFor(adId, placement, position='', creativeIndex='', creativeText=''){
  return `${adImpressionKeyFor(adId, placement, position)}::${adCreativeKeyPart(creativeIndex, creativeText)}`;
}
function adTrackingReady(){
  return !!adsLoaded;
}
function readAdViewCapCache(){
  if(adViewCapCache) return adViewCapCache;
  try{
    const parsed = JSON.parse(localStorage.getItem(AD_VIEW_CAP_STORAGE_KEY) || '{}');
    adViewCapCache = parsed && typeof parsed === 'object' ? parsed : {};
  }catch{
    adViewCapCache = {};
  }
  return adViewCapCache;
}
function writeAdViewCapCache(cache){
  adViewCapCache = cache && typeof cache === 'object' ? cache : {};
  try{ localStorage.setItem(AD_VIEW_CAP_STORAGE_KEY, JSON.stringify(adViewCapCache)); }catch{}
}
function pruneAdViewCapCache(cache, now=Date.now()){
  let changed = false;
  Object.keys(cache || {}).forEach((key)=>{
    const ts = Number(cache[key] || 0);
    if(!Number.isFinite(ts) || now - ts > AD_VIEW_CAP_MS * 4){
      delete cache[key];
      changed = true;
    }
  });
  return changed;
}
function adViewCapKey(adId, placement, position=''){
  return adImpressionKeyFor(adId, placement, position);
}
function canReportAdView(adId, placement, position=''){
  const key = adViewCapKey(adId, placement, position);
  const now = Date.now();
  const cache = readAdViewCapCache();
  pruneAdViewCapCache(cache, now);
  const last = Number(cache[key] || 0);
  return !Number.isFinite(last) || !last || now - last >= AD_VIEW_CAP_MS;
}
function markAdViewReported(adId, placement, position=''){
  const key = adViewCapKey(adId, placement, position);
  const cache = readAdViewCapCache();
  cache[key] = Date.now();
  pruneAdViewCapCache(cache);
  writeAdViewCapCache(cache);
}
function adAnalyticsPayload(adId, placement, href='', creativeIndex='', creativeText='', adLabel='', adPosition=''){
  const id = String(adId || '').slice(0, 100);
  const place = String(placement || '').slice(0, 60);
  const position = String(adPosition || '').slice(0, 80);
  const label = String(adLabel || id || '').slice(0, 100);
  const creative = String(creativeText || '').slice(0, 100);
  const slot = `${place}:${position || 'default'}:${creativeIndex || 0}`;
  const eventLabel = `${place}:${position || 'default'}:${id}`;
  const linkUrl = String(href || '').slice(0, 400);
  const now = new Date();
  return {
    event_category:'ads',
    ad_id:id,
    ad_name:id,
    ad_label:label,
    ad_identifier:id,
    ad_click_id:eventLabel,
    ad_slot:slot,
    ad_position:position,
    ad_area:place,
    ad_time_bucket_kst:adTimeBucketKst(now),
    ad_hour_kst:adHourKst(now),
    event_label:eventLabel,
    placement:place,
    ad_placement:place,
    link_url:linkUrl,
    link_domain:adLinkDomain(linkUrl),
    link_text:creative,
    creative_index:String(creativeIndex || '0'),
    creative_text:creative,
    creative_slot:slot,
    promotion_id:id,
    promotion_name:label,
    creative_name:creative,
    location_id:position || place,
    items:[{
      item_id:id,
      item_name:label,
      promotion_id:id,
      promotion_name:label,
      creative_name:creative,
      creative_slot:slot,
      location_id:position || place,
    }],
  };
}
function reportAdCreativeImpression(adId, placement, durationMs, creativeIndex='', creativeText='', adLabel='', adPosition=''){
  if(!adTrackingReady()) return false;
  if(!adId || !placement) return false;
  if(!Number.isFinite(durationMs) || durationMs < 1000) return false;
  if(typeof window.gtag !== 'function') return false;
  try{
    const roundedMs = Math.round(durationMs);
    const roundedSec = Math.round(durationMs / 1000);
    window.gtag('event', 'ad_creative_view', {
      ...adAnalyticsPayload(adId, placement, '', creativeIndex, creativeText, adLabel, adPosition),
      duration_ms: roundedMs,
      duration_sec: roundedSec,
      value: roundedSec,
      non_interaction:true,
      transport_type:'beacon',
    });
    return true;
  }catch{}
  return false;
}
function reportAdImpression(adId, placement, durationMs, creativeIndex='', creativeText='', adLabel='', adPosition=''){
  if(!adTrackingReady()) return false;
  if(!adId || !placement) return false;
  if(!Number.isFinite(durationMs) || durationMs < 1000) return false;
  if(typeof window.gtag !== 'function') return false;
  if(!canReportAdView(adId, placement, adPosition)) return true;
  try{
    const roundedMs = Math.round(durationMs);
    const roundedSec = Math.round(durationMs / 1000);
    const payload = {
      ...adAnalyticsPayload(adId, placement, '', creativeIndex, creativeText, adLabel, adPosition),
      duration_ms: roundedMs,
      duration_sec: roundedSec,
      value: roundedSec,
      non_interaction:true,
      transport_type:'beacon',
    };
    window.gtag('event', 'ad_view', payload);
    window.gtag('event', 'view_promotion', {
      ...payload,
      event_category:'ads',
    });
    markAdViewReported(adId, placement, adPosition);
    return true;
  }catch{}
  return false;
}
function reportAdHover(adId, placement, hoverMs, creativeIndex='', creativeText='', adLabel='', adPosition=''){
  if(!adId || !placement) return false;
  if(!Number.isFinite(hoverMs) || hoverMs < 500) return false;
  if(typeof window.gtag !== 'function') return false;
  try{
    const roundedMs = Math.round(hoverMs);
    const roundedSec = Math.round(hoverMs / 1000);
    window.gtag('event', 'ad_hover', {
      ...adAnalyticsPayload(adId, placement, '', creativeIndex, creativeText, adLabel, adPosition),
      hover_ms: roundedMs,
      hover_sec: roundedSec,
      value: roundedSec,
      non_interaction:true,
      transport_type:'beacon',
    });
    return true;
  }catch{}
  return false;
}
function reportAdClick(adId, placement, href, creativeIndex='', creativeText='', adLabel='', adPosition=''){
  if(!adId || !placement) return;
  if(typeof window.gtag !== 'function') return;
  try{
    const payload = adAnalyticsPayload(adId, placement, href, creativeIndex, creativeText, adLabel, adPosition);
    window.gtag('event', 'ad_click', {
      ...payload,
      value:1,
      transport_type:'beacon',
    });
    window.gtag('event', 'select_promotion', {
      ...payload,
      event_category:'ads',
      value:1,
      transport_type:'beacon',
    });
  }catch{}
}
function clearAdImpressionTimer(state){
  if(state?.timer){
    clearTimeout(state.timer);
    state.timer = 0;
  }
}
function maybeReportAdImpression(el){
  const state = adImpressionState.get(el);
  if(!state || state.trackingReady === false) return;
  const adKey = state.adKey || adViewCapKey(state.adId, state.placement, state.position);
  const creativeKey = state.creativeKey || adExposureKeyFor(state.adId, state.placement, state.position, state.creativeIndex, state.creativeText);
  if(adImpressionReportedKeys.has(adKey)) state.adReported = true;
  if(adCreativeImpressionReportedKeys.has(creativeKey)) state.creativeReported = true;
  if(state.adReported && state.creativeReported) return;
  const visibleMs = state.visibleAt ? (Date.now() - state.visibleAt) : 0;
  const total = (state.pendingMs || 0) + visibleMs;
  if(total < 1000) return;
  if(!state.creativeReported && reportAdCreativeImpression(state.adId, state.placement, total, state.creativeIndex, state.creativeText, state.adLabel, state.position)){
    adCreativeImpressionReportedKeys.add(creativeKey);
    state.creativeReported = true;
  }
  if(!state.adReported && reportAdImpression(state.adId, state.placement, total, state.creativeIndex, state.creativeText, state.adLabel, state.position)){
    adImpressionReportedKeys.add(adKey);
    state.adReported = true;
  }
  if(state.adReported && state.creativeReported){
    state.pendingMs = 0;
  }
}
function adVisibilityStart(el){
  const state = adImpressionState.get(el);
  if(!state || state.visibleAt) return;
  state.visibleAt = Date.now();
  clearAdImpressionTimer(state);
  state.timer = setTimeout(()=>maybeReportAdImpression(el), 1200);
}
function adVisibilityEnd(el){
  const state = adImpressionState.get(el);
  if(!state || !state.visibleAt) return;
  clearAdImpressionTimer(state);
  const elapsed = Date.now() - state.visibleAt;
  state.visibleAt = 0;
  state.pendingMs = (state.pendingMs || 0) + elapsed;
  maybeReportAdImpression(el);
}
function flushAdImpression(el){
  const state = adImpressionState.get(el);
  if(!state) return;
  clearAdImpressionTimer(state);
  if(state.visibleAt) adVisibilityEnd(el);
  if(state.trackingReady === false){
    state.pendingMs = 0;
    state.adReported = true;
    state.creativeReported = true;
    return;
  }
  const total = state.pendingMs || 0;
  state.pendingMs = 0;
  const adKey = state.adKey || adViewCapKey(state.adId, state.placement, state.position);
  const creativeKey = state.creativeKey || adExposureKeyFor(state.adId, state.placement, state.position, state.creativeIndex, state.creativeText);
  if(total > 0 && state.adId && !state.creativeReported && !adCreativeImpressionReportedKeys.has(creativeKey)){
    if(reportAdCreativeImpression(state.adId, state.placement, total, state.creativeIndex, state.creativeText, state.adLabel, state.position)){
      adCreativeImpressionReportedKeys.add(creativeKey);
    }
  }
  if(total > 0 && state.adId && !state.adReported && !adImpressionReportedKeys.has(adKey)){
    if(reportAdImpression(state.adId, state.placement, total, state.creativeIndex, state.creativeText, state.adLabel, state.position)){
      adImpressionReportedKeys.add(adKey);
    }
  }
  state.adReported = true;
  state.creativeReported = true;
}
function adElementInView(el){
  try{
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
  }catch{}
  return false;
}
function observeAdImpression(el){
  if(!el) return;
  const placement = el.getAttribute('data-xk-area');
  const adId = el.getAttribute('data-xk-id') || el.dataset.xkId || '';
  const adLabel = el.getAttribute('data-xk-label') || el.dataset.xkLabel || '';
  const creativeIndex = el.getAttribute('data-xk-variant-index') || el.dataset.xkVariantIndex || '0';
  const creativeText = el.getAttribute('data-xk-variant-text') || el.dataset.xkVariantText || '';
  const position = adPositionFromElement(el, placement);
  if(!placement) return;
  const adKey = adViewCapKey(adId, placement, position);
  const creativeKey = adExposureKeyFor(adId, placement, position, creativeIndex, creativeText);
  let state = adImpressionState.get(el);
  if(state && (state.adId !== adId || state.placement !== placement || state.position !== position || state.creativeKey !== creativeKey)){
    flushAdImpression(el);
    state = null;
  }
  if(!state){
    state = {
      adKey,
      creativeKey,
      adId,
      adLabel,
      placement,
      position,
      creativeIndex,
      creativeText,
      visibleAt: 0,
      pendingMs: 0,
      adReported: adImpressionReportedKeys.has(adKey) || !canReportAdView(adId, placement, position),
      creativeReported: adCreativeImpressionReportedKeys.has(creativeKey),
      trackingReady: adTrackingReady(),
      timer: 0,
    };
    adImpressionState.set(el, state);
  }else{
    state.adKey = adKey;
    state.creativeKey = creativeKey;
    state.adLabel = adLabel;
    state.position = position;
    state.creativeIndex = creativeIndex;
    state.creativeText = creativeText;
    if(!state.trackingReady && adTrackingReady()){
      state.pendingMs = 0;
      if(state.visibleAt) state.visibleAt = Date.now();
      state.trackingReady = true;
    }
    state.adReported = state.adReported || adImpressionReportedKeys.has(adKey) || !canReportAdView(adId, placement, position);
    state.creativeReported = state.creativeReported || adCreativeImpressionReportedKeys.has(creativeKey);
  }
  if(adImpressionObserver) adImpressionObserver.observe(el);
  if(adElementInView(el)) adVisibilityStart(el);
}

function adRootFromTarget(target){
  return target?.closest?.('[data-xk-area][data-xk-id]') || null;
}
function adHoverSnapshot(el){
  if(!el) return null;
  const placement = el.getAttribute('data-xk-area') || '';
  const adId = el.getAttribute('data-xk-id') || el.dataset.xkId || '';
  if(!placement || !adId) return null;
  return {
    adId,
    placement,
    adLabel:el.getAttribute('data-xk-label') || el.dataset.xkLabel || '',
    creativeIndex:el.getAttribute('data-xk-variant-index') || el.dataset.xkVariantIndex || '0',
    creativeText:el.getAttribute('data-xk-variant-text') || el.dataset.xkVariantText || '',
    position:adPositionFromElement(el, placement),
  };
}
function startAdHover(el){
  const snapshot = adHoverSnapshot(el);
  if(!snapshot) return;
  const current = adHoverState.get(el);
  if(current?.startedAt) return;
  adHoverState.set(el, { ...snapshot, startedAt:Date.now() });
}
function flushAdHover(el){
  const state = adHoverState.get(el);
  if(!state?.startedAt) return;
  const hoverMs = Date.now() - state.startedAt;
  adHoverState.delete(el);
  reportAdHover(state.adId, state.placement, hoverMs, state.creativeIndex, state.creativeText, state.adLabel, state.position);
}
function setupAdHoverTracker(){
  if(adHoverTrackerReady) return;
  adHoverTrackerReady = true;
  document.addEventListener('mouseover', (ev)=>{
    const root = adRootFromTarget(ev.target);
    if(!root) return;
    if(ev.relatedTarget && root.contains(ev.relatedTarget)) return;
    startAdHover(root);
  }, true);
  document.addEventListener('mouseout', (ev)=>{
    const root = adRootFromTarget(ev.target);
    if(!root) return;
    if(ev.relatedTarget && root.contains(ev.relatedTarget)) return;
    flushAdHover(root);
  }, true);
  const flushAll = ()=>{
    document.querySelectorAll('[data-xk-area][data-xk-id]').forEach(flushAdHover);
  };
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden) flushAll();
  });
  window.addEventListener('pagehide', flushAll);
}
function setupAdClickTracker(){
  if(adClickTrackerReady) return;
  adClickTrackerReady = true;
  document.addEventListener('click', (ev)=>{
    const link = ev.target?.closest?.('[data-xk-click]');
    if(!link) return;
    const root = link.closest('[data-xk-area]');
    if(!root) return;
    reportAdClick(
      root.dataset.xkId || root.getAttribute('data-xk-id') || '',
      root.getAttribute('data-xk-area') || '',
      link.href || link.getAttribute('href') || '',
      root.dataset.xkVariantIndex || root.getAttribute('data-xk-variant-index') || '',
      root.dataset.xkVariantText || root.getAttribute('data-xk-variant-text') || '',
      root.dataset.xkLabel || root.getAttribute('data-xk-label') || '',
      adPositionFromElement(root, root.getAttribute('data-xk-area') || ''),
    );
  }, true);
}
function setupAdImpressionTracker(){
  if(adImpressionObserver) return;
  if(typeof IntersectionObserver !== 'function') return;
  adImpressionObserver = new IntersectionObserver((entries)=>{
    entries.forEach((entry)=>{
      if(entry.isIntersecting) adVisibilityStart(entry.target);
      else adVisibilityEnd(entry.target);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-xk-area][data-xk-id]').forEach(observeAdImpression);
  const flushAll = ()=>{
    document.querySelectorAll('[data-xk-area]').forEach(flushAdImpression);
  };
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden) flushAll();
  });
  window.addEventListener('pagehide', flushAll);
  setInterval(()=>{
    document.querySelectorAll('[data-xk-area]').forEach((el)=>{
      const state = adImpressionState.get(el);
      if(!state) return;
      if(state.visibleAt){
        const elapsed = Date.now() - state.visibleAt;
        state.visibleAt = Date.now();
        state.pendingMs = (state.pendingMs || 0) + elapsed;
      }
      maybeReportAdImpression(el);
    });
  }, 30000);
}

function refreshTextAdPlacements(){
  updateChatTextAd();
  updateSummaryTextAd();
  if(timelineIsCommunity() && !updateCommunityTextAdElements()) renderCommunityTable();
}

function refreshTextAdCreatives(){
  updateChatTextAd();
  updateSummaryTextAd();
  if(timelineIsCommunity()) updateCommunityTextAdElements();
}

async function loadTextAds(){
  if(adsLoadPromise) return adsLoadPromise;
  // 화면 쪽에서는 차단 필터 오탐을 줄이기 위해 중립적인 /api/notices 를 먼저 쓴다.
  // /api/ads 는 운영/하위 호환용 fallback 으로 유지한다.
  adsLoadPromise = (async()=>{
    try{
      let res = await fetch(apiUrl('/api/notices'));
      if(!res.ok) res = await fetch(apiUrl('/api/ads'));
      if(!res.ok) throw new Error(`notices ${res.status}`);
      const data = await res.json();
      const parsed = (Array.isArray(data?.ads) ? data.ads : [])
        .map(normalizeTextAd)
        .filter(Boolean);
      textAds = parsed;
      adsLoaded = true;
    }catch(e){
      textAds = [DEFAULT_TEXT_AD];
      adsLoaded = true;
    }finally{
      refreshTextAdPlacements();
    }
  })();
  return adsLoadPromise;
}

function startTextAds(){
  updateChatTextAd();
  loadTextAds();
  if(!adRotationTimer){
    // 일정 주기로 (a) 광고 회전 (b) 광고 목록 자체 재로드 → admin 변경 자동 반영
    adRotationTimer = setInterval(()=>{
      adsLoadPromise = null;
      loadTextAds();
      refreshTextAdPlacements();
    }, Math.max(60000, Number(AD_ROTATION_MS) || 300000));
  }
  if(!adCreativeTimer){
    adCreativeTimer = setInterval(refreshTextAdCreatives, AD_CREATIVE_ROTATION_MS);
  }
  setupAdImpressionTracker();
  setupAdClickTracker();
  setupAdHoverTracker();
}

// 후원자 마쿼 — 채팅창 헤더 아래 좌우 스크롤 띠.
// 채팅이 열려 있을 때만 후원자 정보를 새로 받아 Worker 호출을 줄인다.
let chatDonors = [];
let chatDonorPrefix = '커피값 보내주신 분들';
let chatDonorTimer = null;
const CHAT_DONOR_REFRESH_MS = 5 * 60 * 1000;
const CHAT_DONOR_CACHE_TTL_MS = 10 * 60 * 1000;
function formatDonorAmount(value){
  const n = Math.floor(Number(value) || 0);
  if(!n) return '';
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}
function displayDonorPrefix(value){
  const raw = String(value || '').trim().replace(/^💛\s*/, '').trim();
  if(!raw) return '';
  if(/^후원해주신 분들\s*:?\s*$/.test(raw)) return '커피값 보내주신 분들';
  if(/^커피값\s*보내주신\s*분들\s*:?\s*$/.test(raw)) return '커피값 보내주신 분들';
  return raw.replace(/\s*:\s*$/, '');
}
function renderChatDonorMarquee(){
  const root = document.getElementById('chatDonorMarquee');
  const foot = document.getElementById('chatFootnote');
  const label = document.getElementById('chatDonorLabel');
  const track = document.getElementById('chatDonorTrack');
  if(!root || !track) return;
  const now = Date.now();
  const active = (chatDonors || []).filter((d)=>{
    const ts = Date.parse(d?.expiresAt || '');
    return Number.isFinite(ts) && ts > now;
  });
  // 활성 후원자가 없으면 마쿼 영역 자체를 숨김.
  if(!active.length){
    root.hidden = true;
    if(foot) foot.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    track.innerHTML = '';
    return;
  }
  root.hidden = false;
  if(foot) foot.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  // 좌측 prefix 라벨 — 운영자가 admin 에서 설정. 빈 문자열이면 라벨 자체를 숨김.
  if(label){
    const prefixText = displayDonorPrefix(chatDonorPrefix);
    if(prefixText){
      label.textContent = prefixText;
      label.hidden = false;
      if(!label.dataset.clickBound){
        label.dataset.clickBound = '1';
        label.classList.add('chat-donor-label-click');
        label.setAttribute('role', 'button');
        label.setAttribute('tabindex', '0');
        label.setAttribute('aria-label', '커피값 보내기 안내 열기');
        label.removeAttribute('aria-hidden');
        const open = (ev)=>{
          ev.preventDefault();
          ev.stopPropagation();
          openUpdatesModal({ expandDonation:true });
        };
        label.addEventListener('click', open);
        label.addEventListener('keydown', (ev)=>{
          if(ev.key === 'Enter' || ev.key === ' ') open(ev);
        });
      }
    }else{
      label.textContent = '';
      label.hidden = true;
    }
  }
  // 무한 좌→우 스크롤: (item+sep)* 시퀀스를 짝수 번 복제하면 translateX(-50%)
  // 시점이 시퀀스 경계와 일치해 끊김 없이 루프된다.
  // 후원자 수가 적을 때(<=3) 시퀀스를 4번 복제해 짧은 컨텐츠가 마쿼 폭을 못 채워
  // 빈 공간이 보이는 현상을 막는다.
  const itemHtml = (d)=>{
    const note = d.note ? `<span class="chat-donor-note"> · ${esc(d.note)}</span>` : '';
    return `<span class="chat-donor-item"><span class="chat-donor-amount">${esc(formatDonorAmount(d.amount))}</span><span class="chat-donor-nick">${esc(d.nickname || '익명')}</span>${note}</span><span class="chat-donor-sep" aria-hidden="true">·</span>`;
  };
  const sequence = active.map(itemHtml).join('');
  const copies = active.length <= 3 ? 4 : 2;
  track.innerHTML = `<div class="chat-donor-strip">${sequence.repeat(copies)}</div>`;
  // 항목 수에 비례해 애니메이션 길이 조절. 너무 짧으면 어지러워 24s 가 하한.
  const duration = Math.max(24, Math.min(60, active.length * 10));
  track.style.setProperty('--chat-donor-duration', `${duration}s`);
}

function chatDonorPanelVisible(){
  return !!document.body?.classList?.contains('chat-open')
    || !!document.getElementById('chatPanel')?.classList?.contains('open');
}

function applyChatDonorsPayload(data, options={}){
  if(!data || typeof data !== 'object') return false;
  chatDonors = Array.isArray(data?.donors) ? data.donors : [];
  if(typeof data?.prefix === 'string') chatDonorPrefix = data.prefix;
  if(options.writeCache !== false){
    try{ localStorage.setItem(CHAT_DONORS_CACHE_KEY, JSON.stringify({at:Date.now(), value:{prefix:chatDonorPrefix, donors:chatDonors}})); }catch{}
  }
  renderChatDonorMarquee();
  return true;
}

function readChatDonorsCache(){
  try{
    const obj=JSON.parse(localStorage.getItem(CHAT_DONORS_CACHE_KEY) || 'null');
    if(!obj?.value || Date.now() - Number(obj.at || 0) > CHAT_DONOR_CACHE_TTL_MS) return null;
    return obj.value;
  }catch{
    return null;
  }
}

async function loadChatDonors(options={}){
  try{
    const configDonors=window.__excelkospiChatConfig?.donors;
    if(!options.force && configDonors && applyChatDonorsPayload(configDonors)) return;
    const cached=!options.force ? readChatDonorsCache() : null;
    if(cached && applyChatDonorsPayload(cached, {writeCache:false}) && !chatDonorPanelVisible()) return;
    if(!options.force && !chatDonorPanelVisible()) return;
    const res = await fetch(apiUrl('/api/donors'), {cache:'default'});
    const data = await res.json().catch(()=>null);
    applyChatDonorsPayload(data);
  }catch{
    chatDonors = [];
    renderChatDonorMarquee();
  }
}
function startChatDonorMarquee(){
  const cached=readChatDonorsCache();
  if(cached) applyChatDonorsPayload(cached, {writeCache:false});
  if(chatDonorPanelVisible()) loadChatDonors();
  if(!chatDonorTimer){
    chatDonorTimer = setInterval(()=>{
      if(chatDonorPanelVisible()) loadChatDonors();
    }, CHAT_DONOR_REFRESH_MS);
  }
}
window.applyChatDonorsPayload = applyChatDonorsPayload;
window.loadChatDonors = loadChatDonors;

function communityTextAdRow(rowNum, compact=false, selection={}){
  const ad = selection.ad || textAdForPlacement('community', { cache:false });
  if(!ad) return '';
  const slot = Number(selection.slot || 0);
  const position = selection.position || `community-row-${rowNum}`;
  const creative = textAdCreative(ad, 'community', slot);
  const attrs = textAdDataAttrs(ad, creative);
  const adId = esc(ad.id || '');
  if(compact){
    // 모바일은 작성자/내용 두 칸만 병합하고, 시각 칸은 분리해 표 구조를 유지한다.
    return `<tr class="community-note-row community-note-row-merged" data-xk-area="community" data-xk-position="${esc(position)}" data-xk-id="${adId}" data-xk-label="${esc(attrs.adLabel)}" data-xk-variant-index="${esc(attrs.creativeIndex)}" data-xk-variant-text="${esc(attrs.creativeText)}" title="${esc(textAdTitle(ad, creative))}">
      <td class="rownum">${rowNum}</td>
      <td colspan="2" class="community-note-merged-cell">
        <div class="community-note-merged-inner">
          <span class="notice-badge">${esc(ad.label || '알림')}</span>
          ${renderCommunityTextAd(ad, 'community', creative)}
        </div>
      </td>
      <td class="center time community-note-time-cell">광고</td>
    </tr>`;
  }
  return `<tr class="community-note-row" data-xk-area="community" data-xk-position="${esc(position)}" data-xk-id="${adId}" data-xk-label="${esc(attrs.adLabel)}" data-xk-variant-index="${esc(attrs.creativeIndex)}" data-xk-variant-text="${esc(attrs.creativeText)}" title="${esc(textAdTitle(ad, creative))}">
    <td class="rownum">${rowNum}</td>
    <td class="community-note-badge-cell"><span class="notice-badge">${esc(ad.label || '알림')}</span></td>
    <td class="community-note-copy-cell">
      ${renderCommunityTextAd(ad, 'community', creative)}
    </td>
    <td class="center time community-note-time-cell">광고</td>
    <td class="community-note-empty-cell"></td>
  </tr>`;
}

function communityAdminActionsHtml(post){
  if(!isInlineAdmin() || !post?.user_id) return '';
  const hidden = !!post.hidden || Number(post.report_count || 0) >= COMMUNITY_HIDE_REPORTS;
  return `<span class="community-admin-actions">
    ${hidden ? `<button class="admin-action" type="button" data-community-admin-action="restore" data-post-id="${esc(post.id)}" title="관리자: 신고 가림 복원">복원</button>` : ''}
    <button class="admin-action admin-action-danger" type="button" data-community-admin-action="delete" data-post-id="${esc(post.id)}" title="관리자: 글 삭제">삭제</button>
    <button class="admin-action" type="button" data-community-admin-action="ban" data-user-id="${esc(post.user_id)}" data-nickname="${esc(post.nickname || '')}" title="관리자: 1시간 차단">1시간</button>
  </span>`;
}

function communityCommentAdminActionsHtml(post, comment){
  if(!isInlineAdmin() || !post?.id || !comment?.id) return '';
  const hidden = !!comment.hidden || Number(comment.report_count || 0) >= COMMUNITY_HIDE_REPORTS;
  return `<span class="community-admin-actions community-comment-admin-actions">
    ${hidden ? `<button class="admin-action" type="button" data-community-admin-action="restore-comment" data-post-id="${esc(post.id)}" data-comment-id="${esc(comment.id)}" title="관리자: 댓글 신고 가림 복원">복원</button>` : ''}
    <button class="admin-action admin-action-danger" type="button" data-community-admin-action="delete-comment" data-post-id="${esc(post.id)}" data-comment-id="${esc(comment.id)}" title="관리자: 댓글 삭제">삭제</button>
    ${comment.user_id ? `<button class="admin-action" type="button" data-community-admin-action="ban" data-user-id="${esc(comment.user_id)}" data-nickname="${esc(comment.nickname || '')}" title="관리자: 1시간 차단">1시간</button>` : ''}
  </span>`;
}

function communityCommentReportKey(postId, commentId){
  return `comment:${postId}:${commentId}`;
}

function communityCommentRecommendKey(postId, commentId){
  return `comment-recommend:${postId}:${commentId}`;
}

function communityReplyLimitKey(postId, parentId){
  return `${String(postId || '')}:${String(parentId || '')}`;
}
function communityVisibleReplyLimit(postId, parentId, total){
  if(total <= COMMUNITY_REPLY_PAGE_SIZE) return total;
  const key = communityReplyLimitKey(postId, parentId);
  const stored = Number(communityReplyVisibleCounts[key]);
  const limit = Number.isFinite(stored) && stored > 0 ? stored : COMMUNITY_REPLY_PAGE_SIZE;
  return Math.min(total, Math.max(COMMUNITY_REPLY_PAGE_SIZE, limit));
}
function communityCommentVisualDepth(depth){
  return Math.min(COMMUNITY_MAX_VISUAL_REPLY_DEPTH, Math.max(0, Number(depth) || 0));
}
function communityLoadErrorMessage(error){
  const raw=String(error?.message || error || '');
  if(error?.aborted || /timeout|abort/i.test(raw)){
    return '커뮤니티 응답이 잠시 늦어지고 있습니다. 곧 자동으로 다시 시도합니다.';
  }
  if(/failed to fetch|networkerror|load failed|fetch/i.test(raw)){
    return '네트워크가 불안정해 커뮤니티를 불러오지 못했습니다. 잠시 후 다시 시도합니다.';
  }
  return '커뮤니티를 잠시 불러오지 못했습니다. 잠시 후 다시 시도합니다.';
}
function orderCommunityComments(comments, postId=''){
  const list = Array.isArray(comments) ? comments : [];
  const forcedVisibleIds = new Set(communityJustCommentedId ? [String(communityJustCommentedId)] : []);
  const byParent = new Map();
  const ids = new Set(list.map((comment)=>String(comment.id || '')));
  list.forEach((comment, index)=>{
    const parentId = String(comment.parent_id || '');
    const key = parentId && ids.has(parentId) ? parentId : '';
    const bucket = byParent.get(key) || [];
    bucket.push({ comment, index });
    byParent.set(key, bucket);
  });
  const ordered = [];
  const visit = (parentId, depth)=>{
    const bucket = byParent.get(parentId) || [];
    const sorted = bucket.sort((a,b)=>a.index-b.index);
    const visibleLimit = communityVisibleReplyLimit(postId, parentId, sorted.length);
    const visibleItems = sorted.slice(0, visibleLimit);
    const visibleIds = new Set(visibleItems.map(({comment})=>String(comment.id || '')));
    const forcedItems = sorted.slice(visibleLimit).filter(({comment})=>forcedVisibleIds.has(String(comment.id || '')));
    visibleItems.forEach(({comment})=>{
      ordered.push({ comment, depth:communityCommentVisualDepth(depth) });
      visit(String(comment.id || ''), depth + 1);
    });
    const hiddenRemaining = Math.max(0, sorted.length - visibleLimit - forcedItems.length);
    if(hiddenRemaining > 0){
      ordered.push({
        more:true,
        parentId,
        depth:communityCommentVisualDepth(depth),
        visibleCount:visibleLimit,
        remaining:hiddenRemaining,
        total:sorted.length,
      });
    }
    forcedItems.forEach(({comment})=>{
      const id = String(comment.id || '');
      if(visibleIds.has(id)) return;
      ordered.push({ comment, depth:communityCommentVisualDepth(depth), forced:true });
      visit(id, depth + 1);
    });
  };
  visit('', 0);
  return ordered;
}

function filterCommunityCommentTree(comments, rootCommentId){
  const list = Array.isArray(comments) ? comments : [];
  const removeIds = new Set([String(rootCommentId || '')]);
  let changed = true;
  while(changed){
    changed = false;
    list.forEach((comment)=>{
      if(removeIds.has(String(comment.parent_id || '')) && !removeIds.has(String(comment.id || ''))){
        removeIds.add(String(comment.id || ''));
        changed = true;
      }
    });
  }
  return list.filter((comment)=>!removeIds.has(String(comment.id || '')));
}

function communityReplyComposeRow(rowNum, postId, dataCols, currentNick, nickAttrs, currentReplyBody, parentCommentId=''){
  const replyPlaceholder = typeof communityReplyPlaceholder === 'function'
    ? communityReplyPlaceholder()
    : '댓글을 입력하세요.\n@종목명을 입력하시면 해당 종목명이 태그됩니다.';
  const replyPlaceholderAttr = esc(replyPlaceholder).replace(/\n/g, '&#10;');
  return `<tr class="community-reply-row" data-community-parent="${esc(postId)}" ${parentCommentId ? `data-community-reply-parent="${esc(parentCommentId)}"` : ''}>
      <td class="rownum">${rowNum}</td>
      <td colspan="${dataCols}" class="community-compose-cell community-reply-compose-cell">
        <div class="community-compose-box community-reply-box">
          <input class="community-nick-input community-reply-nick-input" id="communityReplyNick" type="text" maxlength="24" autocomplete="nickname" placeholder="닉네임" value="${esc(currentNick)}" ${nickAttrs} />
          <textarea class="community-post-input community-reply-input" id="communityReplyBody" maxlength="${COMMUNITY_COMMENT_LIMIT}" autocomplete="off" rows="2" placeholder="${replyPlaceholderAttr}">${esc(currentReplyBody)}</textarea>
          <button class="community-attach" type="button" data-community-attach="communityReplyBody" title="이미지 첨부(외부 링크)" aria-label="이미지 첨부"><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5L19 18H5l3.5-4.5zM8 9.5A1.5 1.5 0 1 1 6.5 8 1.5 1.5 0 0 1 8 9.5z"/></svg></button>
          <button class="community-reply-cancel" type="button" data-community-reply-cancel>취소</button>
          <button class="community-cell-button community-compose-submit" type="button" data-community-comment-submit="${esc(postId)}" ${parentCommentId ? `data-community-parent-comment="${esc(parentCommentId)}"` : ''}>등록</button>
        </div>
      </td>
    </tr>`;
}

function renderCommunityTable(state='ready'){
  const table=document.getElementById('timelineTable');
  if(!table) return;
  table.classList.remove('etf-table');
  table.classList.add('community-table');
  const compact = communityCompactLayout();
  communityCompactMode = compact;
  const dataCols = compact ? 3 : 4;
  const TARGET = newsPadTarget();
  const posts = communityPagePosts();
  const adminMode = isInlineAdmin();
  const currentNick = communityNicknameForInput();
  const nickAttrs = adminMode ? 'disabled aria-readonly="true" title="관리자 모드에서는 닉네임이 관리자입니다"' : '';
  const bodyEl = document.getElementById('communityBody');
  const replyEl = document.getElementById('communityReplyBody');
  const currentBody = bodyEl ? bodyEl.value : communityDraftBody;
  const currentReplyBody = replyEl ? replyEl.value : communityDraftReplyBody;
  const channelLabel = typeof communityChannelLabel === 'function' ? communityChannelLabel() : '국내주식토론';
  const composePlaceholder = typeof communityComposePlaceholder === 'function'
    ? communityComposePlaceholder()
    : '여러 종목에 걸쳐 이야기를 나누는 공간입니다.\n특정 종목 태그하기 : @종목명';
  const composePlaceholderAttr = esc(composePlaceholder).replace(/\n/g, '&#10;');
  communityDraftBody = currentBody;
  communityDraftReplyBody = currentReplyBody;
  let rowNum = 2;
  const readInfo = state === 'loading'
    ? (typeof communityUnreadInfo === 'function' ? communityUnreadInfo(posts) : null)
    : (typeof rememberCommunityUnreadSnapshot === 'function' ? rememberCommunityUnreadSnapshot(posts) : null);
  const unreadBoundaryIndex = state === 'loading' || typeof communityUnreadBoundaryIndex !== 'function'
    ? -1
    : communityUnreadBoundaryIndex(posts);
  const compose = `
    <tr class="community-compose-row community-compose-top-row">
      <td class="rownum"></td>
      <td colspan="${dataCols}" class="community-compose-cell">
        <div class="community-compose-box community-main-compose">
          <input class="community-nick-input" id="communityNick" type="text" maxlength="24" autocomplete="nickname" placeholder="닉네임" value="${esc(currentNick)}" ${nickAttrs} />
          <textarea class="community-post-input" id="communityBody" maxlength="${COMMUNITY_BODY_LIMIT}" autocomplete="off" rows="2" placeholder="${composePlaceholderAttr}">${esc(currentBody)}</textarea>
          <button class="community-attach" type="button" data-community-attach="communityBody" title="이미지 첨부(외부 링크)" aria-label="이미지 첨부"><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5L19 18H5l3.5-4.5zM8 9.5A1.5 1.5 0 1 1 6.5 8 1.5 1.5 0 0 1 8 9.5z"/></svg></button>
          <button class="community-cell-button community-compose-submit" id="communitySubmit" type="button">등록</button>
        </div>
      </td>
    </tr>`;
  const rows = [];
  const pollRow = typeof communityPollRow === 'function' ? communityPollRow(rowNum, dataCols, compact) : '';
  if(pollRow){
    rows.push(pollRow);
    rowNum++;
  }
  const briefRow = typeof personalFeedRow === 'function' ? personalFeedRow(rowNum, dataCols, 'community') : '';
  if(briefRow){
    rows.push(briefRow);
    rowNum++;
  }
  if(state==='loading'){
    rows.push(`<tr><td class="rownum">${rowNum++}</td><td colspan="${dataCols}" class="community-ready-cell">게시글 불러오는 중...</td></tr>`);
  }else if(!posts.length){
    rows.push(`<tr><td class="rownum">${rowNum++}</td><td colspan="${dataCols}" class="community-ready-cell">${esc(channelLabel)}에 아직 게시글이 없습니다</td></tr>`);
  }else{
    const adBreakPostCounts = new Set([9, 22].filter((count)=>posts.length > count));
    const firstAd = textAdForPlacementSlot('community', 'community-after-9');
    const secondAd = textAdForPlacementSlot('community', 'community-after-22', { excludeIds:firstAd?.id ? [firstAd.id] : [] });
    const adBreakSelections = {
      9: { ad:firstAd, slot:1, position:'community-after-9' },
      22: { ad:secondAd, slot:2, position:'community-after-22' },
    };
    const maybeInsertReadMarkerAfterPost = (postIndex)=>{
      if(postIndex === unreadBoundaryIndex){
        rows.push(communityReadMarkerRow(rowNum++, dataCols, readInfo || {}));
      }
    };
    const maybeInsertAdAfterPost = (postIndex)=>{
      if(adBreakPostCounts.has(postIndex + 1)){
        const adRow = communityTextAdRow(rowNum, compact, adBreakSelections[postIndex + 1]);
        if(adRow){
          rows.push(adRow);
          rowNum++;
        }
      }
    };
    posts.forEach((post, postIndex)=>{
      const comments = Array.isArray(post.comments) ? post.comments : [];
      const createdTitle = fmtDt(post.created_at);
      const postHidden = !!post.hidden || Number(post.report_count || 0) >= COMMUNITY_HIDE_REPORTS;
      if(postHidden && !adminMode){
        const hiddenAdminActions = adminMode && post.user_id ? communityAdminActionsHtml(post) : '';
        const hiddenReportCell = compact ? '' : `<td class="center community-action-cell flat">신고 ${Number(post.report_count || 0)}${hiddenAdminActions}</td>`;
        rows.push(`<tr class="community-post-row community-hidden-row" data-community-id="${esc(post.id)}">
        <td class="rownum">${rowNum++}</td>
        <td class="center community-author flat">가림</td>
        <td class="left community-hidden-text">신고로 삭제된 글</td>
        <td class="center time flat">-</td>
        ${hiddenReportCell}
      </tr>`);
        maybeInsertReadMarkerAfterPost(postIndex);
        maybeInsertAdAfterPost(postIndex);
        return;
      }
      const reported = communityReported().has(String(post.id));
      const recommended = communityRecommended().has(String(post.id));
      const adminActionAllowed = isInlineAdmin();
      const reportDisabled = !adminActionAllowed && (post.user_id===chatUserId() || reported || isReservedAdminNickname(post.nickname));
      const recommendDisabled = !adminActionAllowed && (post.user_id===chatUserId() || recommended);
      const commentLabel = '댓글';
      const commentTitle = comments.length ? `댓글 ${comments.length}개` : '댓글 달기';
      const recommendCount = Number(post.recommend_count || 0);
      const recommendLabel = recommendCount ? `추천 ${recommendCount}` : ((!adminActionAllowed && recommended) ? '추천됨' : '추천');
      const effectivePinned = !postHidden && !!post.pinned;
      const recommendTitle = (!adminActionAllowed && recommended)
        ? (recommendCount ? `이미 추천한 글입니다 · 현재 추천 ${recommendCount}개` : '이미 추천한 글입니다')
        : (effectivePinned ? `추천 ${COMMUNITY_RECOMMEND_THRESHOLD}개 이상으로 상단 고정 중` : '이 글 추천');
      const reportCount = Number(post.report_count || 0);
      const reportLabel = reportCount ? `신고 ${reportCount}` : '신고';
      const activeMobileActions = communityMobileActionPostId === String(post.id);
      const adminActions = adminMode ? communityAdminActionsHtml(post) : '';
      const mobileReportHtml = compact ? `<div class="community-mobile-actions ${activeMobileActions ? 'active' : ''}">
        <button class="community-reply-btn community-mobile-reply" type="button" data-community-reply="${esc(post.id)}" title="${esc(commentTitle)}" aria-label="${esc(commentTitle)}">${commentLabel}</button>
        <button class="community-recommend community-mobile-recommend" type="button" data-community-recommend="${esc(post.id)}" ${recommendDisabled?'disabled':''} title="${esc(recommendTitle)}">${recommendLabel}</button>
        <button class="community-report community-mobile-report" type="button" data-community-report="${esc(post.id)}" ${reportDisabled?'disabled':''} title="문제 글 신고">${(!adminActionAllowed && reported) ? '신고됨' : reportLabel}</button>
        ${adminActions}
      </div>` : '';
      const desktopReplyHtml = compact ? '' : `<span class="community-hover-actions"><button class="community-reply-btn" type="button" data-community-reply="${esc(post.id)}" title="${esc(commentTitle)}" aria-label="${esc(commentTitle)}">${commentLabel}</button></span>`;
      const reportCell = compact ? '' : `<td class="center community-action-cell"><span class="community-action-group"><button class="community-recommend" type="button" data-community-recommend="${esc(post.id)}" ${recommendDisabled?'disabled':''} title="${esc(recommendTitle)}">${recommendLabel}</button><button class="community-report" type="button" data-community-report="${esc(post.id)}" ${reportDisabled?'disabled':''} title="문제 글 신고">${reportLabel}</button>${adminActions}</span></td>`;
      const newPostClass = communityJustPostedId === String(post.id) ? ' is-just-posted' : '';
      const unreadPostClass = (typeof communityPostHasUnreadActivity === 'function' && communityPostHasUnreadActivity(post)) ? ' is-unread-community' : '';
      const mobileActionClass = activeMobileActions ? ' community-actions-open' : '';
      const pinnedClass = effectivePinned ? ' is-pinned' : '';
      const hiddenClass = postHidden ? ' community-hidden-row community-admin-visible-hidden' : '';
      const pinBadge = effectivePinned ? `<span class="community-pin-badge" title="추천 ${COMMUNITY_RECOMMEND_THRESHOLD}개 이상으로 12시간 상단 표시">추천</span>` : '';
      const hiddenBadge = postHidden ? `<span class="community-hidden-badge" title="신고 ${reportCount}개 누적으로 가려진 글입니다">신고가림</span>` : '';
      rows.push(`<tr class="community-post-row${pinnedClass}${hiddenClass}${newPostClass}${unreadPostClass}${mobileActionClass}" data-community-id="${esc(post.id)}">
      <td class="rownum">${rowNum++}</td>
      <td class="center community-author" title="${esc(post.nickname || '익명')}">${communityAuthorHtml(post.nickname)}</td>
      <td class="left community-post-body community-body-with-actions" data-community-more="${esc(post.id)}" tabindex="0">${hiddenBadge}${pinBadge}${renderTextWithImagePreviews(post.body || '', {collapsed:true, hidePreviewUrls:true, stockMentions:true, stockMentionSnapshots:post.mentions})}${desktopReplyHtml}${mobileReportHtml}</td>
      <td class="center time" title="${esc(createdTitle)}">${fmtCommunityDateTime(post.created_at, compact)}</td>
      ${reportCell}
    </tr>`);
      orderCommunityComments(comments, post.id).forEach((item)=>{
        if(item.more){
          const moreKey = communityReplyLimitKey(post.id, item.parentId);
          const moreLabel = item.parentId ? '대댓글' : '댓글';
          const visibleText = `${Math.min(item.visibleCount, item.total)}/${item.total}`;
          const moreTailCell = compact ? '' : '<td class="center community-action-cell flat"></td>';
          rows.push(`<tr class="community-comment-row community-reply-more-row community-comment-depth-${item.depth}" data-community-parent="${esc(post.id)}" data-community-reply-more-parent="${esc(item.parentId)}"><td class="rownum">${rowNum++}</td><td class="center community-author flat"></td><td class="left community-comment-body community-reply-more-cell"><span class="community-reply-more-btn" role="button" tabindex="0" data-community-replies-more="${esc(moreKey)}" data-post-id="${esc(post.id)}" data-parent-comment="${esc(item.parentId)}" data-visible-count="${esc(item.visibleCount)}">${moreLabel} 더보기 (${visibleText})</span></td><td class="center time flat">-</td>${moreTailCell}</tr>`);
          return;
        }
        const { comment, depth } = item;
      const commentAdminActions = adminMode ? communityCommentAdminActionsHtml(post, comment) : '';
      const commentActionId = `${post.id}:${comment.id}`;
      const activeCommentActions = communityMobileActionCommentId === String(commentActionId);
      const hiddenComment = !!comment.hidden || Number(comment.report_count || 0) >= COMMUNITY_HIDE_REPORTS;
      const commentReportKey = communityCommentReportKey(post.id, comment.id);
      const commentReported = communityReported().has(commentReportKey);
      const commentRecommendKey = communityCommentRecommendKey(post.id, comment.id);
      const commentRecommended = communityRecommended().has(commentRecommendKey);
      const commentRecommendCount = Number(comment.recommend_count || 0);
      const commentRecommendLabel = commentRecommendCount ? `추천 ${commentRecommendCount}` : ((!adminActionAllowed && commentRecommended) ? '추천됨' : '추천');
      const commentRecommendTitle = (!adminActionAllowed && commentRecommended)
        ? (commentRecommendCount ? `이미 추천한 댓글입니다 · 현재 추천 ${commentRecommendCount}개` : '이미 추천한 댓글입니다')
        : '이 댓글 추천';
      const commentRecommendDisabled = hiddenComment || (!adminActionAllowed && (comment.user_id===chatUserId() || commentRecommended));
      const commentReportCount = Number(comment.report_count || 0);
      const commentReportLabel = (!adminActionAllowed && commentReported) ? '신고됨' : (commentReportCount ? `신고 ${commentReportCount}` : '신고');
      const commentReportDisabled = hiddenComment || (!adminActionAllowed && (comment.user_id===chatUserId() || commentReported || isReservedAdminNickname(comment.nickname)));
      const commentReplyAttrs = `data-community-reply="${esc(post.id)}" data-community-parent-comment="${esc(comment.id)}"`;
      const commentReplyButton = hiddenComment ? '' : `<button class="community-reply-btn community-comment-reply-btn" type="button" ${commentReplyAttrs} title="댓글 달기" aria-label="댓글 달기">댓글</button>`;
      const commentDesktopReplyHtml = compact || hiddenComment ? '' : `<span class="community-hover-actions">${commentReplyButton}</span>`;
      const commentRecommendButton = `<button class="community-recommend community-comment-recommend" type="button" data-community-comment-recommend="${esc(comment.id)}" data-post-id="${esc(post.id)}" ${commentRecommendDisabled?'disabled':''} title="${esc(commentRecommendTitle)}">${commentRecommendLabel}</button>`;
      const commentReportButton = `<button class="community-report community-comment-report" type="button" data-community-comment-report="${esc(comment.id)}" data-post-id="${esc(post.id)}" ${commentReportDisabled?'disabled':''} title="댓글 신고">${commentReportLabel}</button>`;
      const commentMobileActions = compact ? `<div class="community-mobile-actions ${activeCommentActions ? 'active' : ''}">
        ${commentReplyButton}
        ${commentRecommendButton}
        ${commentReportButton}
        ${commentAdminActions}
      </div>` : '';
      const commentTailCell = compact ? '' : `<td class="center community-action-cell"><span class="community-action-group">${commentRecommendButton}${commentReportButton}${commentAdminActions}</span></td>`;
      const commentBodyHtml = hiddenComment
        ? (adminMode
          ? `<span class="community-hidden-badge" title="신고 ${commentReportCount}개 누적으로 가려진 댓글입니다">신고가림</span>${renderTextWithImagePreviews(comment.body || '', {collapsed:true, hidePreviewUrls:true, stockMentions:true, stockMentionSnapshots:comment.mentions})}`
          : '<span class="community-hidden-text">신고로 가려진 댓글입니다</span>')
        : renderTextWithImagePreviews(comment.body || '', {collapsed:true, hidePreviewUrls:true, stockMentions:true, stockMentionSnapshots:comment.mentions});
      const justCommentClass = communityJustCommentedId === String(comment.id) ? ' is-just-commented' : '';
      const unreadCommentClass = (typeof communityCommentIsUnread === 'function' && communityCommentIsUnread(comment)) ? ' is-unread-community-comment' : '';
      rows.push(`<tr class="community-comment-row community-comment-depth-${depth}${hiddenComment ? ' community-hidden-row' : ''}${unreadCommentClass}${activeCommentActions ? ' community-actions-open' : ''}${justCommentClass}" data-community-parent="${esc(post.id)}" data-community-comment-id="${esc(comment.id)}">
      <td class="rownum">${rowNum++}</td>
      <td class="center community-author" title="${esc(comment.nickname || '익명')}">${communityAuthorHtml(comment.nickname)}</td>
      <td class="left community-comment-body community-body-with-actions" data-community-comment-more="${esc(commentActionId)}" tabindex="0"><span class="community-comment-text">${commentBodyHtml}</span>${commentDesktopReplyHtml}${commentMobileActions}</td>
      <td class="center time" title="${esc(fmtDt(comment.created_at))}">${fmtCommunityDateTime(comment.created_at, compact)}</td>
      ${commentTailCell}
    </tr>`);
      if(communityReplyPostId === String(post.id) && communityReplyParentCommentId === String(comment.id)){
        rows.push(communityReplyComposeRow(rowNum++, post.id, dataCols, currentNick, nickAttrs, currentReplyBody, comment.id));
      }
      });
      if(communityReplyPostId === String(post.id) && !communityReplyParentCommentId){
        rows.push(communityReplyComposeRow(rowNum++, post.id, dataCols, currentNick, nickAttrs, currentReplyBody));
      }
      maybeInsertReadMarkerAfterPost(postIndex);
      maybeInsertAdAfterPost(postIndex);
    });
  }
  const pagination = communityPaginationRow(rowNum, dataCols);
  if(pagination) rowNum++;
  const usedRows = rowNum - 1;
  const emptyCount = Math.max(0, TARGET - usedRows);
  const empties = makeEmptyRows(rowNum, emptyCount, dataCols);
  table.innerHTML = communityTableHeader(compact, compose) +
    rows.join('') +
    pagination +
    empties;
  lastNewsHintState = { live: posts.length, fresh: 0, fallback: '게시판' };
  updateNewsHint();
  if(typeof updateTimelineTabs === 'function') updateTimelineTabs();
  bindCommunityTable();
  flushStockMentionQueue();
  if(typeof setupStockMentionMiniChartHover === 'function') setupStockMentionMiniChartHover();
  table.querySelectorAll('[data-xk-area][data-xk-id]').forEach(observeAdImpression);
  if(state !== 'loading' && typeof scheduleCommunityMarkRead === 'function') scheduleCommunityMarkRead(communityPosts);
  if(communityPostInFlight) setCommunityPostSending(true);
  if(communityCommentInFlight) setCommunityCommentSending(true);
  enableCellSelection();
}

function renderCommunityDisabled(){
  const table=document.getElementById('timelineTable');
  if(!table) return;
  table.classList.remove('etf-table');
  table.classList.add('community-table');
  const compact = communityCompactLayout();
  const dataCols = compact ? 3 : 4;
  table.innerHTML = communityTableHeader(compact) +
    `<tr><td class="rownum">2</td><td colspan="${dataCols}" class="community-ready-cell">트래픽 폭증으로 종목토론방을 잠시 쉬고 있습니다. 잠시 후 다시 열립니다.</td></tr>` +
    makeEmptyRows(3, Math.max(0, newsPadTarget() - 1), dataCols);
  updateNewsHint();
  enableCellSelection();
}

function renderCommunityPlaceholder(){
  if(!featureEnabled('community')) renderCommunityDisabled();
  else renderCommunityTable('ready');
}

function setBusyButton(button, busy, busyText){
  if(!button) return;
  if(busy){
    if(!button.dataset.idleText) button.dataset.idleText = button.textContent || '';
    button.textContent = busyText;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  }else{
    button.textContent = button.dataset.idleText || button.textContent || '';
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

function setCommunityPostSending(sending){
  const nick=document.getElementById('communityNick');
  const body=document.getElementById('communityBody');
  const submit=document.getElementById('communitySubmit');
  const attach=document.querySelector('[data-community-attach="communityBody"]');
  const box=body?.closest?.('.community-compose-box');
  box?.classList.toggle('is-sending', !!sending);
  if(nick) nick.disabled=!!sending || isInlineAdmin();
  if(body){
    body.disabled=!!sending;
    body.setAttribute('aria-busy', sending ? 'true' : 'false');
  }
  if(attach) attach.disabled=!!sending;
  setBusyButton(submit, !!sending, '등록중');
}

function setCommunityCommentSending(sending){
  const input=document.getElementById('communityReplyBody');
  const nick=document.getElementById('communityReplyNick');
  const submit=document.querySelector('[data-community-comment-submit]');
  const cancel=document.querySelector('[data-community-reply-cancel]');
  const attach=document.querySelector('[data-community-attach="communityReplyBody"]');
  const box=input?.closest?.('.community-compose-box');
  box?.classList.toggle('is-sending', !!sending);
  if(input){
    input.disabled=!!sending;
    input.setAttribute('aria-busy', sending ? 'true' : 'false');
  }
  if(nick) nick.disabled=!!sending || isInlineAdmin();
  if(cancel) cancel.disabled=!!sending;
  if(attach) attach.disabled=!!sending;
  setBusyButton(submit, !!sending, '등록중');
}

function communityReported(){
  try{ return new Set(JSON.parse(localStorage.getItem('kg_community_reported_v1')||'[]')); }
  catch{ return new Set(); }
}

function saveCommunityReported(set){
  try{ localStorage.setItem('kg_community_reported_v1', JSON.stringify(Array.from(set).slice(-300))); }catch{}
}

function communityRecommended(){
  try{ return new Set(JSON.parse(localStorage.getItem('kg_community_recommended_v1')||'[]')); }
  catch{ return new Set(); }
}

function saveCommunityRecommended(set){
  try{ localStorage.setItem('kg_community_recommended_v1', JSON.stringify(Array.from(set).slice(-500))); }catch{}
}

function trackCommunityGaEvent(name, params={}){
  if(typeof window.gtag !== 'function') return;
  try{
    window.gtag('event', name, {
      event_category:'community',
      transport_type:'beacon',
      ...params,
    });
  }catch{}
}

function communityGaPayload(extra={}){
  const channel = typeof communityActiveChannel === 'function' ? communityActiveChannel() : 'kr';
  const label = typeof communityChannelLabel === 'function' ? communityChannelLabel(channel) : '국내주식토론';
  return {
    timeline_tab:'community',
    timeline_tab_key:`community-${channel}`,
    community_channel:channel,
    community_channel_label:label,
    ...extra,
  };
}

function textHasImageAttachment(text){
  return /https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:[?#]\S*)?/i.test(String(text || ''));
}

function compactTextLength(text){
  return Array.from(String(text || '').replace(/\s+/g, '')).length;
}

function confirmShortCommunityPost(text){
  if(compactTextLength(text) >= 8) return true;
  try{
    return window.confirm('짧은 글은 가능하면 채팅방을 이용해주세요.\n그래도 종토방에 올릴까요?');
  }catch{
    return true;
  }
}

function markCommunityPostInserted(id){
  communityJustPostedId = String(id || '');
  if(communityJustPostedTimer){
    clearTimeout(communityJustPostedTimer);
    communityJustPostedTimer = null;
  }
  if(!communityJustPostedId) return;
  communityJustPostedTimer = setTimeout(()=>{
    const id = communityJustPostedId;
    communityJustPostedId = '';
    communityJustPostedTimer = null;
    document.querySelectorAll('.community-post-row.is-just-posted').forEach((row)=>{
      if(row.dataset.communityId === id) row.classList.remove('is-just-posted');
    });
  }, 5200);
}

function markCommunityCommentInserted(id){
  communityJustCommentedId = String(id || '');
  if(communityJustCommentedTimer){
    clearTimeout(communityJustCommentedTimer);
    communityJustCommentedTimer = null;
  }
  if(!communityJustCommentedId) return;
  communityJustCommentedTimer = setTimeout(()=>{
    const id = communityJustCommentedId;
    communityJustCommentedId = '';
    communityJustCommentedTimer = null;
    document.querySelectorAll('.community-comment-row.is-just-commented').forEach((row)=>{
      if(row.dataset.communityCommentId === id) row.classList.remove('is-just-commented');
    });
  }, 5200);
}

function bindVanishingPlaceholder(input){
  if(!input || input.dataset.vanishingPlaceholderBound) return;
  const original = input.getAttribute('placeholder') || '';
  if(!original) return;
  input.dataset.vanishingPlaceholderBound='1';
  input.dataset.originalPlaceholder=original;
  input.addEventListener('focus', ()=>{
    if(!input.value) input.setAttribute('placeholder', '');
  });
  input.addEventListener('blur', ()=>{
    if(!input.value) input.setAttribute('placeholder', input.dataset.originalPlaceholder || original);
  });
}

function bindCommunityTable(){
  const nick=document.getElementById('communityNick');
  const body=document.getElementById('communityBody');
  const submit=document.getElementById('communitySubmit');
  if(nick){
    nick.addEventListener('change', ()=>{
      saveCommunityNickname(nick.value);
    });
  }
  bindVanishingPlaceholder(body);
  body?.addEventListener('input', ()=>{
    communityDraftBody = body.value || '';
  });
  submit?.addEventListener('click', ()=>createCommunityPost());
  document.querySelectorAll('[data-community-attach]').forEach((btn)=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      openImageAttachHelper(btn.getAttribute('data-community-attach') || 'communityBody');
    });
  });
  document.querySelectorAll('[data-community-page]').forEach((btn)=>{
    btn.addEventListener('click', ()=>{
      const action = btn.dataset.communityPage || '';
      const totalPages = communityTotalPages();
      const current = clampCommunityPage();
      if(action === 'prev') communityPage = Math.max(1, current - 1);
      else if(action === 'next') communityPage = Math.min(totalPages, current + 1);
      else communityPage = Math.min(Math.max(1, Number(action) || current), totalPages);
      communityReplyPostId = '';
      communityReplyParentCommentId = '';
      communityMobileActionPostId = '';
      communityMobileActionCommentId = '';
      communityDraftReplyBody = '';
      renderCommunityTable();
    });
  });
  document.querySelectorAll('[data-community-poll-choice]').forEach((btn)=>{
    btn.addEventListener('click', ()=>voteCommunityPoll(Number(btn.dataset.communityPollChoice)));
  });
  body?.addEventListener('keydown', (ev)=>{
    if(ev.key==='Enter' && !ev.shiftKey){
      ev.preventDefault();
      createCommunityPost();
    }
  });
  document.querySelectorAll('[data-community-report]').forEach((btn)=>{
    btn.addEventListener('click', ()=>reportCommunityPost(btn.dataset.communityReport));
  });
  document.querySelectorAll('[data-community-recommend]').forEach((btn)=>{
    btn.addEventListener('click', ()=>recommendCommunityPost(btn.dataset.communityRecommend));
  });
  document.querySelectorAll('[data-community-comment-report]').forEach((btn)=>{
    btn.addEventListener('click', ()=>reportCommunityComment(btn.dataset.postId, btn.dataset.communityCommentReport));
  });
  document.querySelectorAll('[data-community-comment-recommend]').forEach((btn)=>{
    btn.addEventListener('click', ()=>recommendCommunityComment(btn.dataset.postId, btn.dataset.communityCommentRecommend));
  });
  document.querySelectorAll('[data-community-replies-more]').forEach((btn)=>{
    const handler = (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      const key = btn.dataset.communityRepliesMore || communityReplyLimitKey(btn.dataset.postId, btn.dataset.parentComment);
      const current = Number(btn.dataset.visibleCount || communityReplyVisibleCounts[key] || COMMUNITY_REPLY_PAGE_SIZE);
      communityReplyVisibleCounts[key] = current + COMMUNITY_REPLY_PAGE_SIZE;
      renderCommunityTable();
    };
    btn.addEventListener('click', handler);
    btn.addEventListener('keydown', (ev)=>{
      if(ev.key === 'Enter' || ev.key === ' ') handler(ev);
    });
  });
  document.querySelectorAll('[data-community-image-src]').forEach((btn)=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      const slot=btn.parentElement?.querySelector?.('.community-image-preview-slot');
      if(!slot) return;
      const isOpen=btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      const label=btn.querySelector('.community-image-toggle-text');
      if(isOpen){
        slot.hidden = true;
        if(label) label.textContent = '이미지 첨부됨 - 클릭해서 보기';
        return;
      }
      if(!slot.dataset.loaded){
        const src=btn.dataset.communityImageSrc || '';
        const href=btn.dataset.communityImageHref || src;
        slot.innerHTML=`<a class="message-image-preview" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="이미지 열기"><img src="${esc(src)}" alt="공유 이미지 썸네일" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></a>`;
        bindMessageImageFallback(slot);
        slot.dataset.loaded='1';
      }
      slot.hidden = false;
      if(label) label.textContent = '이미지 닫기';
    });
  });
  document.querySelectorAll('[data-community-admin-action]').forEach((btn)=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      runCommunityAdminAction(btn);
    });
  });
  document.querySelectorAll('[data-community-more]').forEach((cell)=>{
    const toggle=()=>{
      const id=cell.dataset.communityMore || '';
      communityMobileActionPostId = communityMobileActionPostId === id ? '' : id;
      communityMobileActionCommentId = '';
      renderCommunityTable();
    };
    cell.addEventListener('click', (ev)=>{
      if(ev.target?.closest?.('button,a,input,textarea,label')) return;
      toggle();
    });
    cell.addEventListener('keydown', (ev)=>{
      if(ev.key==='Enter' || ev.key===' '){
        ev.preventDefault();
        toggle();
      }
    });
  });
  document.querySelectorAll('[data-community-comment-more]').forEach((cell)=>{
    const toggle=()=>{
      const id=cell.dataset.communityCommentMore || '';
      communityMobileActionCommentId = communityMobileActionCommentId === id ? '' : id;
      communityMobileActionPostId = '';
      renderCommunityTable();
    };
    cell.addEventListener('click', (ev)=>{
      if(ev.target?.closest?.('button,a,input,textarea,label')) return;
      toggle();
    });
    cell.addEventListener('keydown', (ev)=>{
      if(ev.key==='Enter' || ev.key===' '){
        ev.preventDefault();
        toggle();
      }
    });
  });
  document.querySelectorAll('[data-community-reply]').forEach((btn)=>{
    btn.addEventListener('click', ()=>{
      communityReplyPostId = btn.dataset.communityReply || '';
      communityReplyParentCommentId = btn.dataset.communityParentComment || '';
      communityMobileActionPostId = '';
      communityMobileActionCommentId = '';
      renderCommunityTable();
      requestAnimationFrame(()=>document.getElementById('communityReplyBody')?.focus());
    });
  });
  document.querySelectorAll('[data-community-comment-submit]').forEach((btn)=>{
    btn.addEventListener('click', ()=>createCommunityComment(btn.dataset.communityCommentSubmit));
  });
  document.querySelectorAll('[data-community-reply-cancel]').forEach((btn)=>{
    btn.addEventListener('click', ()=>{
      communityReplyPostId = '';
      communityReplyParentCommentId = '';
      renderCommunityTable();
    });
  });
  const replyBody=document.getElementById('communityReplyBody');
  const replyNick=document.getElementById('communityReplyNick');
  if(replyNick){
    replyNick.addEventListener('change', ()=>{
      saveCommunityNickname(replyNick.value);
    });
  }
  bindVanishingPlaceholder(replyBody);
  replyBody?.addEventListener('input', ()=>{
    communityDraftReplyBody = replyBody.value || '';
  });
  replyBody?.addEventListener('keydown', (ev)=>{
    if(ev.key==='Enter' && !ev.shiftKey){
      ev.preventDefault();
      createCommunityComment(communityReplyPostId);
    }else if(ev.key==='Escape'){
      ev.preventDefault();
      communityReplyPostId = '';
      communityReplyParentCommentId = '';
      renderCommunityTable();
    }
  });
}

function clearCommunityRefresh(){
  if(communityRefreshTimer){
    clearTimeout(communityRefreshTimer);
    communityRefreshTimer = null;
  }
}

function clearCommunitySummaryRefresh(){
  if(communitySummaryTimer){
    clearTimeout(communitySummaryTimer);
    communitySummaryTimer = null;
  }
}

function communityIdleForMs(){
  return Date.now() - lastVersionActivityAt;
}

function shouldSleepCommunityRefresh(){
  return communityIdleForMs() >= COMMUNITY_IDLE_SLEEP_MS;
}

function sleepCommunityRefresh(){
  clearCommunityRefresh();
  communityRefreshSleeping = true;
}

function maybeResumeCommunityRefresh(){
  if(!communityRefreshSleeping || shouldPauseDataRefreshForHidden() || !timelineIsCommunity()) return;
  communityRefreshSleeping = false;
  loadCommunityPosts({ silent:true });
  scheduleCommunityRefresh();
}

async function loadCommunitySummaries(options={}){
  if(communitySummaryLoadInFlight) return;
  if(shouldPauseDataRefreshForHidden() && !options.allowHidden) return;
  if(!featureEnabled('community')) return;
  communitySummaryLoadInFlight = true;
  try{
    const data = await fetchJsonClient('/api/community?summary=1', 8000, {
      cache: options.force ? 'reload' : 'default',
    });
    if(typeof syncCommunitySummariesFromPayload === 'function' && syncCommunitySummariesFromPayload(data?.summaries)){
      updateTimelineTabs();
      updateNewsHint();
    }
  }catch(e){
    debugWarn('community summary load failed', e);
  }finally{
    communitySummaryLoadInFlight = false;
  }
}

function scheduleCommunitySummaryRefresh(delay=null){
  if(!featureEnabled('community')){
    clearCommunitySummaryRefresh();
    return;
  }
  if(timelineIsCommunity()){
    clearCommunitySummaryRefresh();
    return;
  }
  if(shouldPauseDataRefreshForHidden() || communitySummaryTimer) return;
  if(shouldSleepCommunityRefresh()) return;
  communitySummaryTimer = setTimeout(async ()=>{
    communitySummaryTimer = null;
    if(shouldPauseDataRefreshForHidden() || timelineIsCommunity()) return;
    if(shouldSleepCommunityRefresh()) return;
    await loadCommunitySummaries({ silent:true });
    scheduleCommunitySummaryRefresh();
  }, delay == null ? communityRefreshIntervalMs() : Math.round(Number(delay) * pollScale()));
}

function scheduleCommunityRefresh(delay=null){
  if(!featureEnabled('community')){
    clearCommunityRefresh();
    if(timelineIsCommunity()) renderCommunityDisabled();
    return;
  }
  if(shouldPauseDataRefreshForHidden() || !timelineIsCommunity() || communityRefreshTimer) return;
  if(shouldSleepCommunityRefresh()){
    sleepCommunityRefresh();
    return;
  }
  communityRefreshSleeping = false;
  communityRefreshTimer = setTimeout(async ()=>{
    communityRefreshTimer = null;
    if(shouldPauseDataRefreshForHidden() || !timelineIsCommunity()) return;
    if(shouldSleepCommunityRefresh()){
      sleepCommunityRefresh();
      return;
    }
    await loadCommunityPosts({ silent:true });
    scheduleCommunityRefresh();
  }, delay == null ? communityRefreshIntervalMs() : Math.round(Number(delay) * pollScale()));
}

async function loadCommunityPosts(options={}){
  if(!timelineIsCommunity()) return;
  if(shouldPauseDataRefreshForHidden() && !options.allowHidden) return;
  if(!featureEnabled('community')){
    renderCommunityDisabled();
    return;
  }
  if(communityLoadInFlight) return;
  const silent = !!options.silent;
  communityLoadInFlight = true;
  if(!silent) renderCommunityTable(communityPosts.length ? 'ready' : 'loading');
  try{
    const adminMode = isInlineAdmin();
    const channel = typeof communityActiveChannel === 'function' ? communityActiveChannel() : 'kr';
    const params = new URLSearchParams({ channel });
    params.set('include_summary', '1');
    if(options.force) params.set('fresh', '1');
    const endpoint = adminMode
      ? `/api/community-admin?limit=${COMMUNITY_POST_LIMIT}&channel=${encodeURIComponent(channel)}`
      : `/api/community?${params.toString()}`;
    const data=await fetchJsonClient(endpoint, 12000, {
      cache: options.force ? 'reload' : 'default',
      ...(adminMode ? { headers:adminAuthHeaders() } : {}),
    });
    communityPosts=Array.isArray(data?.posts) ? data.posts : [];
    if(typeof syncCommunityPollFromPayload === 'function'){
      syncCommunityPollFromPayload(data?.poll, channel);
    }
    if(typeof syncCommunitySummariesFromPayload === 'function'){
      syncCommunitySummariesFromPayload(data?.summaries);
    }
    clampCommunityPage();
    if(communityReplyPostId && !communityPosts.some((post)=>String(post.id)===communityReplyPostId && !post.hidden)){
      communityReplyPostId = '';
      communityReplyParentCommentId = '';
    }
    if(communityReplyPostId && communityReplyParentCommentId){
      const replyPost = communityPosts.find((post)=>String(post.id)===communityReplyPostId);
      const parentStillExists = (Array.isArray(replyPost?.comments) ? replyPost.comments : [])
        .some((comment)=>String(comment.id)===String(communityReplyParentCommentId) && !comment.hidden);
      if(!parentStillExists){
        communityReplyPostId = '';
        communityReplyParentCommentId = '';
      }
    }
  }catch(e){
    if(!silent) showToast(communityLoadErrorMessage(e), 'err');
  }finally{
    communityLoadInFlight = false;
    if(timelineIsCommunity()) renderCommunityTable();
  }
}

async function createCommunityPost(){
  if(communityPostInFlight) return;
  const nick=document.getElementById('communityNick');
  const body=document.getElementById('communityBody');
  const text=String(body?.value || '').trim();
  const nickname=communityNicknameForSend(nick?.value);
  if(!nickname) return;
  if(text.length<2){ showToast('게시글을 두 글자 이상 입력하세요', 'warn'); return; }
  if(isCommunitySearchOnlyText(text)){ warnCommunitySearchOnly(body); return; }
  if(!confirmShortCommunityPost(text)) return;
  if(text.length>COMMUNITY_BODY_LIMIT){ showToast(`게시글은 ${COMMUNITY_BODY_LIMIT}자까지 가능합니다`, 'warn'); return; }
  communityPostInFlight = true;
  setCommunityPostSending(true);
  try{
    if(!(await guardChatMessage(text, '커뮤니티 내용'))) return;
    const data=await fetchJsonClient('/api/community', 7000, {
      method:'POST',
      headers:isInlineAdmin() ? adminAuthHeaders({'content-type':'application/json'}) : {'content-type':'application/json'},
      body:JSON.stringify({
        action:'create',
        user_id:chatUserId(),
        nickname,
        channel: typeof communityActiveChannel === 'function' ? communityActiveChannel() : 'kr',
        coin_source: typeof coinQuoteSource === 'function' ? coinQuoteSource() : 'binance',
        body:text,
      }),
    });
    if(data?.post){
      communityReplyPostId = '';
      communityReplyParentCommentId = '';
      communityMobileActionPostId = '';
      communityMobileActionCommentId = '';
      communityDraftBody = '';
      communityPage = 1;
      communityPosts=[data.post, ...communityPosts].slice(0, COMMUNITY_POST_LIMIT);
      if(body) body.value='';
      markCommunityPostInserted(data.post.id);
      saveCommunityNickname(nickname);
      renderCommunityTable();
      trackCommunityGaEvent('community_post_submit', communityGaPayload({
        post_id:String(data.post.id || '').slice(0, 80),
        body_length:text.length,
        has_image:textHasImageAttachment(text),
        value:1,
      }));
      showToast(`${typeof communityChannelLabel === 'function' ? communityChannelLabel() : '종목토론방'}에 글이 올라갔습니다`, 'info');
    }
  }catch(e){
    const msg=String(e.message || e);
    if(msg.includes('blocked_term')) showToast('차단 표현이 포함되어 등록하지 않았습니다', 'warn');
    else if(msg.includes('reserved_nickname')) showToast('관리자/운영AI봇 닉네임은 관리자만 사용할 수 있습니다', 'warn');
    else if(msg.includes('low_quality_jamo')) showToast('초성만 있거나 의미 없는 반복 글은 등록할 수 없습니다', 'warn');
    else if(msg.includes('duplicate_content')) showToast('같은 내용을 반복해서 올릴 수 없습니다', 'warn');
    else if(msg.includes('rate_limited') || msg.includes('spam_detected')) showToast('도배 방지를 위해 잠시 후 다시 입력해주세요', 'warn');
    else if(msg.includes('403')) showToast('채팅 제한 중에는 커뮤니티 글쓰기도 제한됩니다', 'err');
    else showToast(`등록 실패: ${msg}`, 'err');
  }finally{
    communityPostInFlight = false;
    setCommunityPostSending(false);
  }
}

async function createCommunityComment(id){
  if(communityCommentInFlight) return;
  if(!id) return;
  const input=document.getElementById('communityReplyBody');
  const nick=document.getElementById('communityReplyNick') || document.getElementById('communityNick');
  const text=String(input?.value || '').trim();
  const nickname=communityNicknameForSend(nick?.value);
  if(!nickname) return;
  if(text.length<1){ showToast('댓글을 입력하세요', 'warn'); return; }
  if(isCommunitySearchOnlyText(text)){ warnCommunitySearchOnly(input); return; }
  if(text.length>COMMUNITY_COMMENT_LIMIT){ showToast(`댓글은 ${COMMUNITY_COMMENT_LIMIT}자까지 가능합니다`, 'warn'); return; }
  const parentCommentId = communityReplyParentCommentId || '';
  communityCommentInFlight = true;
  setCommunityCommentSending(true);
  try{
    if(!(await guardChatMessage(text, '커뮤니티 댓글'))) return;
    const data=await fetchJsonClient('/api/community', 7000, {
      method:'POST',
      headers:isInlineAdmin() ? adminAuthHeaders({'content-type':'application/json'}) : {'content-type':'application/json'},
      body:JSON.stringify({
        action:'comment',
        post_id:id,
        parent_id:parentCommentId,
        user_id:chatUserId(),
        nickname,
        channel: typeof communityActiveChannel === 'function' ? communityActiveChannel() : 'kr',
        coin_source: typeof coinQuoteSource === 'function' ? coinQuoteSource() : 'binance',
        body:text,
      }),
    });
    if(data?.post){
      communityPosts=communityPosts.map((post)=>post.id===data.post.id ? data.post : post);
      markCommunityCommentInserted(data.comment?.id || '');
      communityReplyPostId = '';
      communityReplyParentCommentId = '';
      communityMobileActionCommentId = '';
      communityDraftReplyBody = '';
      if(input) input.value='';
      saveCommunityNickname(nickname);
      renderCommunityTable();
      trackCommunityGaEvent('community_comment_submit', communityGaPayload({
        post_id:String(data.post.id || id || '').slice(0, 80),
        parent_comment:parentCommentId ? 'reply' : 'comment',
        comment_depth:parentCommentId ? 1 : 0,
        body_length:text.length,
        has_image:textHasImageAttachment(text),
        value:1,
      }));
      showToast('댓글을 등록했습니다', 'info');
    }
  }catch(e){
    const msg=String(e.message || e);
    if(msg.includes('blocked_term')) showToast('차단 표현이 포함되어 등록하지 않았습니다', 'warn');
    else if(msg.includes('reserved_nickname')) showToast('관리자/운영AI봇 닉네임은 관리자만 사용할 수 있습니다', 'warn');
    else if(msg.includes('low_quality_jamo')) showToast('초성만 있거나 의미 없는 반복 댓글은 등록할 수 없습니다', 'warn');
    else if(msg.includes('duplicate_content')) showToast('같은 댓글을 반복해서 올릴 수 없습니다', 'warn');
    else if(msg.includes('rate_limited') || msg.includes('spam_detected')) showToast('도배 방지를 위해 잠시 후 다시 입력해주세요', 'warn');
    else if(msg.includes('403')) showToast('채팅 제한 중에는 커뮤니티 댓글도 제한됩니다', 'err');
    else showToast(`댓글 등록 실패: ${msg}`, 'err');
  }finally{
    communityCommentInFlight = false;
    setCommunityCommentSending(false);
  }
}

async function recommendCommunityPost(id){
  if(!id) return;
  try{
    const data=await fetchJsonClient('/api/community', 7000, {
      method:'POST',
      headers:isInlineAdmin() ? adminAuthHeaders({'content-type':'application/json'}) : {'content-type':'application/json'},
      body:JSON.stringify({
        action:'recommend',
        post_id:id,
        recommender_id:chatUserId(),
      }),
    });
    if(!isInlineAdmin()){
      const recommended=communityRecommended();
      recommended.add(String(id));
      saveCommunityRecommended(recommended);
    }
    if(data?.post){
      communityMobileActionPostId = '';
      communityPosts=communityPosts.map((post)=>post.id===data.post.id ? data.post : post);
      renderCommunityTable();
    }
    if(data?.already) showToast('이미 추천한 글입니다', 'info');
    else if(data?.pinned) showToast(`추천 ${COMMUNITY_RECOMMEND_THRESHOLD}개 이상으로 12시간 상단에 고정됩니다`, 'info');
    else showToast('추천했습니다', 'info');
  }catch(e){
    const msg=String(e.message || e);
    if(msg.includes('cannot_recommend_self')) showToast('내 글은 추천할 수 없습니다', 'warn');
    else if(msg.includes('post_hidden')) showToast('가려진 글은 추천할 수 없습니다', 'warn');
    else showToast(`추천 실패: ${msg}`, 'err');
  }
}

async function recommendCommunityComment(postId, commentId){
  if(!postId || !commentId) return;
  const key = communityCommentRecommendKey(postId, commentId);
  try{
    const data=await fetchJsonClient('/api/community', 7000, {
      method:'POST',
      headers:isInlineAdmin() ? adminAuthHeaders({'content-type':'application/json'}) : {'content-type':'application/json'},
      body:JSON.stringify({
        action:'recommend_comment',
        post_id:postId,
        comment_id:commentId,
        recommender_id:chatUserId(),
      }),
    });
    if(!isInlineAdmin()){
      const recommended=communityRecommended();
      recommended.add(key);
      saveCommunityRecommended(recommended);
    }
    if(data?.post){
      communityMobileActionCommentId = '';
      communityPosts=communityPosts.map((post)=>post.id===data.post.id ? data.post : post);
      renderCommunityTable();
    }
    if(data?.already) showToast('이미 추천한 댓글입니다', 'info');
    else showToast('댓글을 추천했습니다', 'info');
  }catch(e){
    const msg=String(e.message || e);
    if(msg.includes('cannot_recommend_self')) showToast('내 댓글은 추천할 수 없습니다', 'warn');
    else if(msg.includes('comment_hidden') || msg.includes('post_hidden')) showToast('가려진 댓글은 추천할 수 없습니다', 'warn');
    else showToast(`댓글 추천 실패: ${msg}`, 'err');
  }
}

async function reportCommunityPost(id){
  if(!id) return;
  try{
    const data=await fetchJsonClient('/api/community', 7000, {
      method:'POST',
      headers:isInlineAdmin() ? adminAuthHeaders({'content-type':'application/json'}) : {'content-type':'application/json'},
      body:JSON.stringify({
        action:'report',
        post_id:id,
        reporter_id:chatUserId(),
        reporter_nickname:communityNicknameForInput(),
      }),
    });
    if(data?.ignored){
      showToast('관리자 글은 신고 대상에서 제외됩니다', 'info');
      if(data?.post){
        communityPosts=communityPosts.map((post)=>post.id===data.post.id ? data.post : post);
        renderCommunityTable();
      }
      return;
    }
    if(!isInlineAdmin()){
      const reported=communityReported();
      reported.add(String(id));
      saveCommunityReported(reported);
    }
    if(data?.post){
      if(data.post.hidden && communityReplyPostId === String(data.post.id)){
        communityReplyPostId = '';
        communityReplyParentCommentId = '';
      }
      communityMobileActionPostId = '';
      communityPosts=communityPosts.map((post)=>post.id===data.post.id ? data.post : post);
      renderCommunityTable();
    }
    showToast(
      data?.reporterBanned
        ? '신고가 접수되었습니다. 신고가 과도하게 누적되어 24시간 제한됩니다'
        : (data?.hidden ? (data?.banned ? `신고 ${COMMUNITY_HIDE_REPORTS}회 누적으로 글을 가리고 작성자를 24시간 제한했습니다` : `신고 ${COMMUNITY_HIDE_REPORTS}회 누적으로 해당 글을 가렸습니다`) : '신고가 접수되었습니다'),
      (data?.hidden || data?.reporterBanned) ? 'warn' : 'info'
    );
  }catch(e){
    if(e?.payload?.error === 'report_rate_limited') showToast(`신고는 1시간에 ${COMMUNITY_REPORT_LIMIT_PER_HOUR}개까지 가능합니다`, 'warn');
    else showToast(`신고 실패: ${e.message || e}`, 'err');
  }
}

async function reportCommunityComment(postId, commentId){
  if(!postId || !commentId) return;
  const key = communityCommentReportKey(postId, commentId);
  try{
    const data=await fetchJsonClient('/api/community', 7000, {
      method:'POST',
      headers:isInlineAdmin() ? adminAuthHeaders({'content-type':'application/json'}) : {'content-type':'application/json'},
      body:JSON.stringify({
        action:'report_comment',
        post_id:postId,
        comment_id:commentId,
        reporter_id:chatUserId(),
        reporter_nickname:communityNicknameForInput(),
      }),
    });
    if(data?.ignored){
      showToast('관리자 댓글은 신고 대상에서 제외됩니다', 'info');
      if(data?.post){
        communityPosts=communityPosts.map((post)=>post.id===data.post.id ? data.post : post);
        renderCommunityTable();
      }
      return;
    }
    if(!isInlineAdmin()){
      const reported=communityReported();
      reported.add(key);
      saveCommunityReported(reported);
    }
    if(data?.post){
      if(data?.comment?.hidden && communityReplyPostId === String(postId) && communityReplyParentCommentId === String(commentId)){
        communityReplyPostId = '';
        communityReplyParentCommentId = '';
      }
      communityMobileActionCommentId = '';
      communityPosts=communityPosts.map((post)=>post.id===data.post.id ? data.post : post);
      renderCommunityTable();
    }
    showToast(
      data?.reporterBanned
        ? '댓글 신고가 접수되었습니다. 신고가 과도하게 누적되어 24시간 제한됩니다'
        : (data?.hidden ? (data?.banned ? `신고 ${COMMUNITY_HIDE_REPORTS}회 누적으로 댓글을 숨기고 작성자를 24시간 제한했습니다` : `신고 ${COMMUNITY_HIDE_REPORTS}회 누적으로 해당 댓글을 숨겼습니다`) : '댓글 신고가 접수되었습니다'),
      (data?.hidden || data?.reporterBanned) ? 'warn' : 'info'
    );
  }catch(e){
    if(e?.payload?.error === 'report_rate_limited') showToast(`신고는 1시간에 ${COMMUNITY_REPORT_LIMIT_PER_HOUR}개까지 가능합니다`, 'warn');
    else showToast(`댓글 신고 실패: ${e.message || e}`, 'err');
  }
}

async function runCommunityAdminAction(btn){
  if(!isInlineAdmin()){
    showToast('관리자 로그인이 필요합니다', 'warn');
    return;
  }
  const action=btn?.dataset?.communityAdminAction || '';
  const postId=btn?.dataset?.postId || '';
  const commentId=btn?.dataset?.commentId || '';
  const userId=btn?.dataset?.userId || '';
  const nickname=btn?.dataset?.nickname || '';
  try{
    if(action === 'restore'){
      if(!postId) return;
      setBusyButton(btn, true, '복원중');
      const data = await fetchInlineAdminJson('/api/community-admin', { action:'unhide_post', post_id:postId });
      if(data?.post){
        communityPosts=communityPosts.map((post)=>String(post.id)===String(postId) ? data.post : post);
        if(communityPostPinnedUntilMs(data.post) > 0) communityPage = 1;
      }
      renderCommunityTable();
      showToast('신고로 가려진 글을 복원했습니다', 'info');
      return;
    }
    if(action === 'delete'){
      if(!postId) return;
      if(!window.confirm('이 종토방 글을 삭제할까요?')) return;
      setBusyButton(btn, true, '삭제중');
      await fetchInlineAdminJson('/api/community-admin', { action:'delete_post', post_id:postId });
      communityPosts=communityPosts.filter((post)=>String(post.id)!==String(postId));
      if(communityReplyPostId === String(postId)){
        communityReplyPostId = '';
        communityReplyParentCommentId = '';
      }
      if(communityMobileActionPostId === String(postId)) communityMobileActionPostId = '';
      if(String(communityMobileActionCommentId).startsWith(`${postId}:`)) communityMobileActionCommentId = '';
      clampCommunityPage();
      renderCommunityTable();
      showToast('종토방 글을 삭제했습니다', 'info');
      return;
    }
    if(action === 'delete-comment'){
      if(!postId || !commentId) return;
      if(!window.confirm('이 종토방 댓글을 삭제할까요?')) return;
      setBusyButton(btn, true, '삭제중');
      await fetchInlineAdminJson('/api/community-admin', { action:'delete_comment', post_id:postId, comment_id:commentId });
      communityPosts=communityPosts.map((post)=>(
        String(post.id) === String(postId)
          ? { ...post, comments:filterCommunityCommentTree(post.comments, commentId) }
          : post
      ));
      if(communityReplyPostId === String(postId) && communityReplyParentCommentId === String(commentId)){
        communityReplyPostId = '';
        communityReplyParentCommentId = '';
      }
      if(communityMobileActionCommentId === `${postId}:${commentId}`) communityMobileActionCommentId = '';
      renderCommunityTable();
      showToast('종토방 댓글을 삭제했습니다', 'info');
      return;
    }
    if(action === 'restore-comment'){
      if(!postId || !commentId) return;
      setBusyButton(btn, true, '복원중');
      const data = await fetchInlineAdminJson('/api/community-admin', { action:'unhide_comment', post_id:postId, comment_id:commentId });
      if(data?.post){
        communityPosts=communityPosts.map((post)=>String(post.id)===String(postId) ? data.post : post);
      }
      renderCommunityTable();
      showToast('신고로 가려진 댓글을 복원했습니다', 'info');
      return;
    }
    if(action === 'ban'){
      if(!userId) return;
      if(userId === chatUserId() && !window.confirm('현재 브라우저 사용자 ID를 1시간 차단할까요?')) return;
      setBusyButton(btn, true, '차단중');
      await fetchInlineAdminJson('/api/community-admin', { action:'ban_user', user_id:userId, nickname, hours:1 });
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
