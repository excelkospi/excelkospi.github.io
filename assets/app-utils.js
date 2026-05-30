/* excelkospi shared client utilities
 * Keep dependency-light helpers here so app.js/community-ui.js can stay focused
 * on behavior and rendering.
 */
function esc(v){ return String(v??'').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

// 진단용 경고 로그. 평소엔 조용하고, 운영자가 localStorage.setItem('excelkospi.debug','1')
// 하면 콘솔에 표시된다. 콘솔창 1열에서 켜고 끌 수 있다.
function debugWarn(){
  try{
    if(localStorage.getItem('excelkospi.debug') !== '1') return;
    console.warn.apply(console, arguments);
  }catch{}
}

const APPROVED_IMAGE_HOSTS = new Set([
  'i.imgur.com',
  'i.ibb.co',
  'i.postimg.cc',
  'pbs.twimg.com',
  'media.discordapp.net',
  'cdn.discordapp.com',
]);
const URL_TOKEN_RE = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;
const IMAGE_PATH_RE = /\.(?:png|jpe?g|gif|webp|avif)(?:$|[?#])/i;
const DEFAULT_CHAT_LINK_DOMAINS = [
  'naver.com',
  'news.naver.com',
  'n.news.naver.com',
  'finance.naver.com',
  'm.stock.naver.com',
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'yna.co.kr',
  'newsis.com',
  'mk.co.kr',
  'hankyung.com',
  'sedaily.com',
  'edaily.co.kr',
  'chosun.com',
  'joongang.co.kr',
  'donga.com',
  'khan.co.kr',
  'hani.co.kr',
  'sbs.co.kr',
  'kbs.co.kr',
  'mbc.co.kr',
  'jtbc.co.kr',
  'ytn.co.kr',
  'reuters.com',
  'bloomberg.com',
  'cnbc.com',
  'marketwatch.com',
  'investing.com',
  'tradingview.com',
  'finance.yahoo.com',
  'nasdaq.com',
  'sec.gov',
];

function normalizeTextUrl(raw){
  const cleaned=String(raw || '').trim().replace(/[),.;!?]+$/g, '');
  if(!cleaned) return null;
  try{
    const url=new URL(/^www\./i.test(cleaned) ? `https://${cleaned}` : cleaned);
    if(url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  }catch{
    return null;
  }
}

function splitUrlToken(raw){
  const token=String(raw || '');
  const match=token.match(/^(.+?)([),.;!?]*)$/);
  return {urlText:match?.[1] || token, suffix:match?.[2] || ''};
}

function normalizeChatLinkDomain(value){
  let raw=String(value || '').trim().toLowerCase();
  if(!raw) return '';
  raw=raw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^\*\./, '');
  raw=raw.split(/[/?#:]/)[0].replace(/\.+$/g, '');
  if(!raw || raw.length>120 || !raw.includes('.')) return '';
  if(!/^[a-z0-9.-]+$/.test(raw)) return '';
  const parts=raw.split('.');
  if(parts.some((part)=>!part || part.length>63 || part.startsWith('-') || part.endsWith('-'))) return '';
  return raw;
}

function normalizedChatLinkPolicy(policy){
  const raw=policy && typeof policy==='object' ? policy : {};
  const hasDomains=Array.isArray(raw.allowedDomains) || Array.isArray(raw.domains);
  const values=hasDomains ? (raw.allowedDomains || raw.domains || []) : DEFAULT_CHAT_LINK_DOMAINS;
  const seen=new Set();
  const allowedDomains=[];
  values.forEach((value)=>{
    const domain=normalizeChatLinkDomain(value);
    if(domain && !seen.has(domain)){
      seen.add(domain);
      allowedDomains.push(domain);
    }
  });
  return {
    enabled: raw.enabled !== false,
    allowedDomains,
  };
}

function chatLinkAllowed(url, policy){
  const normalized=normalizedChatLinkPolicy(policy);
  if(!normalized.enabled || !normalized.allowedDomains.length) return false;
  const host=normalizeChatLinkDomain(url?.hostname || '');
  if(!host) return false;
  return normalized.allowedDomains.some((domain)=>host===domain || host.endsWith(`.${domain}`));
}

function renderTextWithSafeLinks(text, policy){
  const source=String(text || '');
  const chunks=[];
  let lastIndex=0;
  source.replace(URL_TOKEN_RE, (token, offset)=>{
    chunks.push(esc(source.slice(lastIndex, offset)));
    const {urlText, suffix}=splitUrlToken(token);
    const url=normalizeTextUrl(urlText);
    if(!url || !chatLinkAllowed(url, policy)){
      chunks.push(esc(token));
    }else{
      const href=url.toString();
      chunks.push(`<a class="chat-safe-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow ugc">${esc(urlText)}</a>${esc(suffix)}`);
    }
    lastIndex=offset + token.length;
    return token;
  });
  chunks.push(esc(source.slice(lastIndex)));
  return chunks.join('');
}

function renderTextWithSafeLinksAndStockMentions(text, options={}){
  const source=String(text || '');
  const chunks=[];
  let lastIndex=0;
  source.replace(URL_TOKEN_RE, (token, offset)=>{
    chunks.push(renderTextWithStockMentions(source.slice(lastIndex, offset), options.stockMentionSnapshots));
    const {urlText, suffix}=splitUrlToken(token);
    const url=normalizeTextUrl(urlText);
    if(!url || !chatLinkAllowed(url, options.linkPolicy)){
      chunks.push(esc(token));
    }else{
      const href=url.toString();
      chunks.push(`<a class="chat-safe-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow ugc">${esc(urlText)}</a>${esc(suffix)}`);
    }
    lastIndex=offset + token.length;
    return token;
  });
  chunks.push(renderTextWithStockMentions(source.slice(lastIndex), options.stockMentionSnapshots));
  return chunks.join('');
}

function approvedImageUrl(raw){
  const preview=approvedImagePreview(raw);
  return preview ? preview.src : '';
}

function approvedImagePreview(raw){
  const url=normalizeTextUrl(raw);
  if(!url) return null;
  const host=url.hostname.toLowerCase().replace(/^www\./, '');
  const pathAndQuery=`${url.pathname}${url.search}`;
  if(host === 'imgur.com'){
    const isAllowedPage=/^\/(?:a|gallery)\/[a-zA-Z0-9]+(?:[/?#]|$)/.test(url.pathname)
      || /^\/[a-zA-Z0-9]+(?:[/?#]|$)/.test(url.pathname);
    if(!isAllowedPage) return null;
    return {
      href:url.toString(),
      src:apiUrl(`/api/image-preview?url=${encodeURIComponent(url.toString())}`),
    };
  }
  if(!APPROVED_IMAGE_HOSTS.has(host)) return null;
  if(host === 'pbs.twimg.com' && /(?:format=(?:jpg|jpeg|png|webp|gif)|\/media\/)/i.test(pathAndQuery)){
    return {href:url.toString(), src:url.toString()};
  }
  if(IMAGE_PATH_RE.test(pathAndQuery)) return {href:url.toString(), src:url.toString()};
  return null;
}

function extractApprovedImagePreviews(text, limit=1){
  const found=[];
  const seen=new Set();
  String(text || '').replace(URL_TOKEN_RE, (token)=>{
    const preview=approvedImagePreview(token);
    const key=preview?.src || '';
    if(preview && key && !seen.has(key) && found.length < limit){
      seen.add(key);
      found.push(preview);
    }
    return token;
  });
  return found;
}

function stripApprovedImageTokens(text){
  return String(text || '')
    .replace(URL_TOKEN_RE, (token)=>approvedImagePreview(token) ? '' : token)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderTextWithImagePreviews(text, options={}){
  const displayText = options.hidePreviewUrls ? stripApprovedImageTokens(text) : text;
  const safe=options.stockMentions
    ? (options.linkUrls
      ? renderTextWithSafeLinksAndStockMentions(displayText, options)
      : renderTextWithStockMentions(displayText, options.stockMentionSnapshots))
    : (options.linkUrls ? renderTextWithSafeLinks(displayText, options.linkPolicy) : esc(displayText));
  const previewsData=extractApprovedImagePreviews(text, options.limit || 1);
  if(!previewsData.length) return safe;
  if(options.collapsed){
    const previews=previewsData.map((preview)=>`<div class="community-image-collapsed">
      <button class="community-image-toggle" type="button" data-community-image-src="${esc(preview.src)}" data-community-image-href="${esc(preview.href)}" aria-expanded="false" title="이미지 보기">
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5L19 18H5l3.5-4.5zM8 9.5A1.5 1.5 0 1 1 6.5 8 1.5 1.5 0 0 1 8 9.5z"/></svg>
        <span class="community-image-toggle-text">이미지 첨부됨 - 클릭해서 보기</span>
      </button>
      <div class="community-image-preview-slot" hidden></div>
    </div>`).join('');
    return `${safe}${previews}`;
  }
  const previews=previewsData.map((preview)=>`<a class="message-image-preview" href="${esc(preview.href)}" target="_blank" rel="noopener noreferrer" title="이미지 열기"><img src="${esc(preview.src)}" alt="공유 이미지 썸네일" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></a>`).join('');
  return `${safe}<div class="message-image-list">${previews}</div>`;
}

function bindCollapsedImageToggles(root=document){
  root?.querySelectorAll?.('[data-community-image-src]')?.forEach((btn)=>{
    if(btn.dataset.imageToggleBound === '1') return;
    btn.dataset.imageToggleBound = '1';
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
}

function markMessageImagePreviewBroken(img){
  const link=img?.closest?.('.message-image-preview');
  if(!link || link.classList.contains('is-broken')) return;
  link.classList.add('is-broken');
  link.innerHTML='<span class="message-image-fallback">이미지 미리보기 실패 · 클릭해서 열기</span>';
}

function bindMessageImageFallback(root=document){
  root?.querySelectorAll?.('.message-image-preview img')?.forEach((img)=>{
    if(img.dataset.imageFallbackBound === '1') return;
    img.dataset.imageFallbackBound = '1';
    img.addEventListener('error', ()=>markMessageImagePreviewBroken(img), {once:true});
    if(img.complete && img.naturalWidth === 0) markMessageImagePreviewBroken(img);
  });
}

function imgurClientId(){
  const value = typeof IMGUR_CLIENT_ID !== 'undefined' ? String(IMGUR_CLIENT_ID || '').trim() : '';
  return /^[a-zA-Z0-9]+$/.test(value) ? value : '';
}

function imageUploadLimit(name, fallback){
  const value = typeof window !== 'undefined' && typeof window[name] !== 'undefined' ? Number(window[name]) : NaN;
  if(Number.isFinite(value) && value > 0) return value;
  try{
    if(name === 'IMGUR_UPLOAD_MAX_BYTES' && typeof IMGUR_UPLOAD_MAX_BYTES !== 'undefined') return Number(IMGUR_UPLOAD_MAX_BYTES) || fallback;
    if(name === 'IMGUR_UPLOAD_TARGET_BYTES' && typeof IMGUR_UPLOAD_TARGET_BYTES !== 'undefined') return Number(IMGUR_UPLOAD_TARGET_BYTES) || fallback;
    if(name === 'IMGUR_UPLOAD_COOLDOWN_MS' && typeof IMGUR_UPLOAD_COOLDOWN_MS !== 'undefined') return Number(IMGUR_UPLOAD_COOLDOWN_MS) || fallback;
  }catch{}
  return fallback;
}

function imageAttachToast(message, type='info'){
  if(typeof showToast === 'function') showToast(message, type);
  else alert(message);
}

function imageAttachInput(targetInputId){
  return document.getElementById(targetInputId);
}

function setImageAttachBusy(targetInputId, busy){
  const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(targetInputId)
    : String(targetInputId || '').replace(/["\\]/g, '\\$&');
  const buttons = targetInputId === 'chatInput'
    ? [document.getElementById('chatAttach')].filter(Boolean)
    : Array.from(document.querySelectorAll(`[data-community-attach="${escapedId}"]`));
  buttons.forEach((button)=>{
    button.disabled = !!busy;
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    if(busy) button.dataset.prevTitle = button.title || '';
    button.title = busy ? '이미지 업로드 중...' : (button.dataset.prevTitle || button.title || '이미지 첨부');
  });
}

function rememberImgurUploadNow(){
  try{ localStorage.setItem(typeof IMGUR_UPLOAD_COOLDOWN_KEY !== 'undefined' ? IMGUR_UPLOAD_COOLDOWN_KEY : 'kg_imgur_upload_last_v1', String(Date.now())); }catch{}
}

function imgurUploadCooldownLeft(){
  const cooldown = imageUploadLimit('IMGUR_UPLOAD_COOLDOWN_MS', 15000);
  try{
    const key = typeof IMGUR_UPLOAD_COOLDOWN_KEY !== 'undefined' ? IMGUR_UPLOAD_COOLDOWN_KEY : 'kg_imgur_upload_last_v1';
    const last = Number(localStorage.getItem(key) || 0) || 0;
    return Math.max(0, cooldown - (Date.now() - last));
  }catch{
    return 0;
  }
}

function pickImageFile(){
  return new Promise((resolve)=>{
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.addEventListener('change', ()=>{
      const file = input.files?.[0] || null;
      input.remove();
      resolve(file);
    }, {once:true});
    document.body.appendChild(input);
    input.click();
    setTimeout(()=>input.remove(), 60 * 1000);
  });
}

function blobFromCanvas(canvas, type, quality){
  return new Promise((resolve)=>canvas.toBlob(resolve, type, quality));
}

async function imageBitmapFromFile(file){
  if(typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = ()=>{
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error)=>{
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

async function prepareImageForUpload(file){
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if(!file || !allowed.has(file.type)) throw new Error('jpg, png, webp 이미지만 올릴 수 있습니다');
  const hardMax = imageUploadLimit('IMGUR_UPLOAD_MAX_BYTES', 3 * 1024 * 1024);
  const target = imageUploadLimit('IMGUR_UPLOAD_TARGET_BYTES', 1200 * 1024);
  if(file.size <= target) return file;

  const bitmap = await imageBitmapFromFile(file);
  const maxEdge = 1800;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width || 1, bitmap.height || 1));
  const width = Math.max(1, Math.round((bitmap.width || 1) * scale));
  const height = Math.max(1, Math.round((bitmap.height || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  if(typeof bitmap.close === 'function') bitmap.close();

  for(const quality of [0.84, 0.76, 0.68, 0.6]){
    const blob = await blobFromCanvas(canvas, 'image/jpeg', quality);
    if(blob && (blob.size <= hardMax || quality === 0.6)){
      if(blob.size > hardMax) throw new Error('이미지를 3MB 이하로 줄인 뒤 다시 올려주세요');
      return new File([blob], `${(file.name || 'excelkospi').replace(/\.[^.]+$/, '')}.jpg`, {type:'image/jpeg'});
    }
  }
  throw new Error('이미지 압축에 실패했습니다');
}

async function uploadImageToImgur(file, clientId){
  const body = new FormData();
  body.append('image', file);
  body.append('type', 'file');
  body.append('title', 'excelkospi image');
  const response = await fetch('https://api.imgur.com/3/image', {
    method:'POST',
    headers:{ Authorization:`Client-ID ${clientId}` },
    body,
  });
  const data = await response.json().catch(()=>null);
  if(!response.ok || !data?.success || !data?.data?.link){
    const message = data?.data?.error || data?.error || `Imgur 업로드 실패(${response.status})`;
    throw new Error(String(message));
  }
  return String(data.data.link);
}

function insertTextAtCursor(el, text){
  if(!el) return;
  const value = String(el.value || '');
  const start = Number.isInteger(el.selectionStart) ? el.selectionStart : value.length;
  const end = Number.isInteger(el.selectionEnd) ? el.selectionEnd : start;
  const prefix = value.slice(0, start);
  const suffix = value.slice(end);
  const spacerBefore = prefix && !/[\s\n]$/.test(prefix) ? ' ' : '';
  const spacerAfter = suffix && !/^[\s\n]/.test(suffix) ? ' ' : '';
  const next = `${prefix}${spacerBefore}${text}${spacerAfter}${suffix}`;
  el.value = next;
  const cursor = (prefix + spacerBefore + text).length;
  try{ el.setSelectionRange(cursor, cursor); }catch{}
  el.dispatchEvent(new Event('input', {bubbles:true}));
  el.focus?.({preventScroll:true});
}

async function uploadAndInsertImgurImage(targetInputId, clientId){
  const left = imgurUploadCooldownLeft();
  if(left > 0){
    imageAttachToast(`이미지 업로드는 ${Math.ceil(left / 1000)}초 뒤 다시 시도해 주세요`, 'info');
    return false;
  }
  const file = await pickImageFile();
  if(!file) return false;
  const target = imageAttachInput(targetInputId);
  if(!target) return false;
  setImageAttachBusy(targetInputId, true);
  try{
    imageAttachToast('이미지를 Imgur에 올리는 중입니다...', 'info');
    const prepared = await prepareImageForUpload(file);
    const link = await uploadImageToImgur(prepared, clientId);
    insertTextAtCursor(target, link);
    rememberImgurUploadNow();
    imageAttachToast('이미지 링크를 본문에 넣었습니다', 'info');
    return true;
  }finally{
    setImageAttachBusy(targetInputId, false);
  }
}

async function openImageAttachHelper(targetInputId){
  const clientId = imgurClientId();
  if(clientId){
    try{
      await uploadAndInsertImgurImage(targetInputId, clientId);
      return;
    }catch(error){
      imageAttachToast('이미지 서비스에 업로드가 불가합니다. 사내에서 imgur 차단 여부를 확인해주세요', 'err');
    }
  }
  const msg='확인을 누르면 이미지 업로드 사이트(Imgur)로 이동합니다.\n이미지를 올리고 링크를 복사해서 붙여 넣어주세요.';
  let opened=false;
  try{
    if(confirm(msg)){
      window.open('https://imgur.com/upload', '_blank', 'noopener,noreferrer');
      opened=true;
    }
  }catch{}
  if(opened){
    try{
      const el=document.getElementById(targetInputId);
      if(el && typeof el.focus==='function') setTimeout(()=>el.focus(), 200);
    }catch{}
  }
}
window.openImageAttachHelper=openImageAttachHelper;

function mdInline(text){
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function stripMarkdownComments(md){
  return String(md || '').replace(/<!--[\s\S]*?-->/g, '');
}

function isMarkdownTableSeparator(line){
  const raw=String(line || '').trim();
  if(!raw.includes('|')) return false;
  const cells=splitMarkdownTableRow(raw);
  return cells.length > 0 && cells.every((cell)=>/^:?-{3,}:?$/.test(cell.trim()));
}

function splitMarkdownTableRow(line){
  let raw=String(line || '').trim();
  if(raw.startsWith('|')) raw=raw.slice(1);
  if(raw.endsWith('|')) raw=raw.slice(0, -1);
  const cells=[];
  let cell='';
  let escaped=false;
  for(const ch of raw){
    if(escaped){
      cell+=ch;
      escaped=false;
      continue;
    }
    if(ch==='\\'){
      escaped=true;
      continue;
    }
    if(ch==='|'){
      cells.push(cell.trim());
      cell='';
      continue;
    }
    cell+=ch;
  }
  cells.push(cell.trim());
  return cells;
}

function markdownAlignClass(separator){
  const raw=String(separator || '').trim();
  if(raw.startsWith(':') && raw.endsWith(':')) return ' class="align-center"';
  if(raw.endsWith(':')) return ' class="align-right"';
  return '';
}

function renderMarkdownTable(lines, startIndex){
  const header=splitMarkdownTableRow(lines[startIndex]);
  const separators=splitMarkdownTableRow(lines[startIndex + 1]);
  const aligns=header.map((_, index)=>markdownAlignClass(separators[index] || ''));
  let index=startIndex + 2;
  const bodyRows=[];
  while(index < lines.length){
    const raw=String(lines[index] || '').trim();
    if(!raw || !raw.includes('|')) break;
    if(isMarkdownTableSeparator(raw)) break;
    bodyRows.push(splitMarkdownTableRow(raw));
    index+=1;
  }
  const wideClass=header.length > 4 ? ' updates-table-wide' : '';
  const headHtml=header.map((cell, cellIndex)=>`<th${aligns[cellIndex] || ''}>${mdInline(cell)}</th>`).join('');
  const bodyHtml=bodyRows.map((row)=>`<tr>${header.map((_, cellIndex)=>`<td${aligns[cellIndex] || ''}>${mdInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('');
  return {
    html:`<div class="updates-table-wrap"><table class="updates-table${wideClass}"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
    nextIndex:index,
  };
}

function renderPatchMarkdown(md){
  const lines=stripMarkdownComments(md).split(/\r?\n/);
  let html='';
  let inList=false;
  let inCard=false;
  const toc=[];
  let secIdx=0;
  const closeList=()=>{ if(inList){ html+='</ul>'; inList=false; } };
  const closeCard=()=>{ closeList(); if(inCard){ html+='</section>'; inCard=false; } };
  for(let i=0; i<lines.length; i+=1){
    const line=lines[i];
    const raw=line.trim();
    if(!raw){ closeList(); continue; }
    if(raw.includes('|') && i + 1 < lines.length && isMarkdownTableSeparator(lines[i + 1])){
      closeList();
      const rendered=renderMarkdownTable(lines, i);
      html+=rendered.html;
      i=rendered.nextIndex - 1;
      continue;
    }
    if(raw.startsWith('### ')){ closeList(); html+=`<h3>${mdInline(raw.slice(4))}</h3>`; continue; }
    if(raw.startsWith('## ')){
      closeCard();
      secIdx+=1;
      const id=`patch-sec-${secIdx}`;
      const display=mdInline(raw.slice(3));
      toc.push({ id, text: display.replace(/<[^>]*>/g, '') });
      const newest=secIdx===1;
      html+=`<section class="patch-card${newest ? ' is-newest' : ''}" id="${id}">`;
      inCard=true;
      html+=`<h2 class="patch-card-title">${newest ? '<span class="patch-new">NEW</span>' : ''}${display}</h2>`;
      continue;
    }
    if(raw.startsWith('# ')){ closeCard(); html+=`<h1>${mdInline(raw.slice(2))}</h1>`; continue; }
    if(raw.startsWith('- ')){
      if(!inList){ html+='<ul>'; inList=true; }
      html+=`<li>${mdInline(raw.slice(2))}</li>`;
      continue;
    }
    if(raw.startsWith('> ')){
      closeList();
      const quote=[mdInline(raw.slice(2))];
      while(i + 1 < lines.length && lines[i + 1].trim().startsWith('> ')){
        i+=1;
        quote.push(mdInline(lines[i].trim().slice(2)));
      }
      html+=`<blockquote class="patch-quote">${quote.join('<br>')}</blockquote>`;
      continue;
    }
    closeList();
    html+=`<p>${mdInline(raw)}</p>`;
  }
  closeCard();
  const body=html || '<p>표시할 공지사항이 없습니다.</p>';
  if(toc.length < 3) return body;
  // 목차는 "공지사항" 제목·소개 문단 바로 아래, 첫 패치 카드 앞에 끼워 넣는다.
  const tocHtml=`<details class="patch-toc"><summary class="patch-toc-title"><span class="patch-toc-icon" aria-hidden="true">☰</span>목차<span class="patch-toc-count">${toc.length}</span></summary><ul>${
    toc.map(t=>`<li><a href="#${t.id}" data-patch-toc>${t.text}</a></li>`).join('')
  }</ul></details>`;
  const anchor='<section class="patch-card';
  return body.includes(anchor) ? body.replace(anchor, tocHtml + anchor) : tocHtml + body;
}
