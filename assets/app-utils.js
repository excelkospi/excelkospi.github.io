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
  const safe=options.stockMentions ? renderTextWithStockMentions(displayText, options.stockMentionSnapshots) : esc(displayText);
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

function openImageAttachHelper(targetInputId){
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
  const closeList=()=>{ if(inList){ html+='</ul>'; inList=false; } };
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
    if(raw.startsWith('## ')){ closeList(); html+=`<h2>${mdInline(raw.slice(3))}</h2>`; continue; }
    if(raw.startsWith('# ')){ closeList(); html+=`<h1>${mdInline(raw.slice(2))}</h1>`; continue; }
    if(raw.startsWith('- ')){
      if(!inList){ html+='<ul>'; inList=true; }
      html+=`<li>${mdInline(raw.slice(2))}</li>`;
      continue;
    }
    closeList();
    html+=`<p>${mdInline(raw)}</p>`;
  }
  closeList();
  return html || '<p>표시할 공지사항이 없습니다.</p>';
}
