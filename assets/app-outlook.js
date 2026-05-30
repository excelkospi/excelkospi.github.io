// Ootlook disguise mode and dedicated mail-style renderers.
// Loaded before app.js; functions intentionally live in the shared global scope.

function moveNodeToSlot(node, slotId){
  const el = typeof node === 'string'
    ? (node.startsWith('.') ? document.querySelector(node) : document.getElementById(node))
    : node;
  const slot = document.getElementById(slotId);
  if(el && slot && el.parentElement !== slot) slot.appendChild(el);
}
function placeOutlookResponsiveSlots(){
  const mobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
  moveNodeToSlot('.floating-tabs', mobile ? 'outlookMobileTabsSlot' : 'outlookTabsSlot');
  if(!mobile) setOutlookMobileNavOpen(false);
}
function prepareOutlookTimeline(){
  if(timelineIsCommunity() || timelineIsEtf()){
    timelineTab = 'news';
    updateTimelineTabs();
    clearCommunityRefresh();
  }
  document.getElementById('timelineTable')?.classList.remove('community-table','etf-table');
  renderAccumulatedNews();
  if(newsAccumulated.length===0) loadNews();
}
function activateOutlookTheme(){
  if(outlookBetaActive) return;
  const outlook=document.getElementById('outlookApp');
  if(!outlook) return;
  outlookBetaActive = true;
  outlook.hidden = false;
  outlook.setAttribute('aria-hidden','false');
  document.body.classList.add('theme-outlook');
  document.querySelectorAll('.fv-tooltip').forEach((el)=>el.remove());
  document.querySelectorAll('.first-visit-pulse,.fv-force-visible').forEach((el)=>el.classList.remove('first-visit-pulse','fv-force-visible'));
  document.title = getBrowserDocumentTitle();
  const theme=document.querySelector('meta[name="theme-color"]');
  if(theme) theme.setAttribute('content', '#f3f2f1');
  // Chat 위젯을 Teems 로 위장 — 제목 + floating 버튼 라벨 교체
  const chatTitle = document.getElementById('chatHeaderTitle');
  if(chatTitle) chatTitle.textContent = 'Micrusoft Teems';
  const chatLbl = document.querySelector('.chat-cta .lbl');
  if(chatLbl) chatLbl.textContent = 'Teems 채팅';
  const chatPanel = document.getElementById('chatPanel');
  if(chatPanel) chatPanel.setAttribute('aria-label','Micrusoft Teems');
  // 도크 모드(엑셀 ≥1600px 기본값)는 시트 칼럼에 채팅을 붙이는데, 아웃룩에선
  // 그 칼럼이 통째로 숨겨진다. chatDockSupported()는 theme-outlook에서 false라
  // applyChatDockMode()를 다시 돌리면 패널이 플로팅으로 빠지고 버튼이 살아난다.
  if(typeof applyChatDockMode === 'function') applyChatDockMode();

  prepareOutlookTimeline();
  placeOutlookResponsiveSlots();
  window.addEventListener('resize', placeOutlookResponsiveSlots, {passive:true});
  // Outlook v3 uses dedicated rendering — keep only the market-tab slot and
  // status text slots. Excel cards/timeline/watchlist render as native email
  // rows in the dedicated Outlook DOM instead of being slot-moved.
  moveNodeToSlot('statusLeft', 'outlookStatusTextSlot');
  moveNodeToSlot('presenceCount', 'outlookPresenceSlot');
  moveNodeToSlot('session', 'outlookSessionSlot');
  moveNodeToSlot('floatingRestore', 'outlookRestoreSlot');

  syncActiveTab();
  renderFloatingButtons();
  bindOutlookListeners();
  if(lastSnapshot) renderOutlookFromSnapshot(lastSnapshot, (lastRenderedCards || []).filter((card)=>card && !card._noteRow));
}

// Currently-selected stock email key in Outlook mode.
let outlookSelectedKey = null;
let outlookListenersBound = false;
function isOutlookMobile(){
  return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
}
function setOutlookMobileNavOpen(open){
  const next=!!open && isOutlookMobile() && document.body.classList.contains('theme-outlook');
  document.body.classList.toggle('outlook-nav-open', next);
  const btn=document.querySelector('.outlook-hamburger');
  if(btn) btn.setAttribute('aria-expanded', next ? 'true' : 'false');
}
function bindOutlookListeners(){
  if(outlookListenersBound) return;
  outlookListenersBound = true;
  const hamburger=document.querySelector('.outlook-hamburger');
  if(hamburger){
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.addEventListener('click', (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      setOutlookMobileNavOpen(!document.body.classList.contains('outlook-nav-open'));
    });
  }
  document.addEventListener('click', (ev)=>{
    if(!document.body.classList.contains('outlook-nav-open')) return;
    if(ev.target?.closest?.('.outlook-folders,.outlook-hamburger')) return;
    setOutlookMobileNavOpen(false);
  });
  document.addEventListener('keydown', (ev)=>{
    if(ev.key === 'Escape') setOutlookMobileNavOpen(false);
  });
  const list = document.getElementById('outlookMailList');
  if(list){
    list.addEventListener('click', (ev)=>{
      const row = ev.target.closest('.outlook-mail-row');
      if(!row) return;
      const key = row.dataset.outlookKey || '';
      if(!key) return;
      const card = findOutlookCardByKey(key);
      if(card) selectOutlookEmail(card);
    });
  }
  document.querySelectorAll('.outlook-folder[data-outlook-folder]').forEach((el)=>{
    el.addEventListener('click', ()=>{
      document.querySelectorAll('.outlook-folder[data-outlook-folder]').forEach((f)=>f.classList.toggle('selected', f===el));
      const folder = el.dataset.outlookFolder;
      applyOutlookFolderFilter(folder, { channel:el.dataset.outlookChannel || '' });
      setOutlookMobileNavOpen(false);
    });
  });
  document.querySelectorAll('[data-outlook-compose]').forEach((el)=>{
    el.addEventListener('click', (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      openOutlookCommunityCompose();
      setOutlookMobileNavOpen(false);
    });
  });
  // 좌측 도구 버튼 (공지 / 소개 / 설정 / 엑셀로 돌아가기)
  document.querySelectorAll('[data-outlook-tool]').forEach((el)=>{
    const tool = el.dataset.outlookTool;
    if(tool === 'guide') return; // <a> link, no JS needed
    el.addEventListener('click', (ev)=>{
      ev.preventDefault();
      if(tool === 'notices') openUpdatesModal();
      else if(tool === 'settings') openSettingsModal();
      else if(tool === 'bookmark') document.getElementById('bookmarkTip')?.click();
      else if(tool === 'readability') {
        document.getElementById('readabilityToggle')?.click();
        const pressed = document.getElementById('readabilityToggle')?.getAttribute('aria-pressed') === 'true';
        el.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      }
      else if(tool === 'excel') deactivateOutlookTheme();
      setOutlookMobileNavOpen(false);
    });
  });
  // 상단 검색 — 현재 편지함의 메일 행을 실시간 필터링.
  const searchInput = document.querySelector('.outlook-search input');
  if(searchInput){
    searchInput.addEventListener('input', ()=>{
      outlookSearchQuery = searchInput.value || '';
      applyOutlookSearchFilter();
    });
    searchInput.addEventListener('keydown', (ev)=>{
      if(ev.key === 'Escape'){
        searchInput.value = '';
        outlookSearchQuery = '';
        applyOutlookSearchFilter();
        searchInput.blur();
      }
    });
  }
  // 중요(Focused) / 기타 탭.
  document.querySelectorAll('.outlook-focused span[data-outlook-focused]').forEach((el)=>{
    el.addEventListener('click', ()=>{
      if(!outlookFocusedTabsVisible()) return;
      outlookFocusedTab = el.dataset.outlookFocused === 'other' ? 'other' : 'primary';
      syncOutlookFocusedTabs();
      if(lastSnapshot) renderOutlookFromSnapshot(lastSnapshot, (lastRenderedCards || []).filter((card)=>card && !card._noteRow));
    });
  });
}
// Outlook 모드를 끄고 다시 Excel 모드로 돌아가는 helper.
// 슬롯 이동을 깔끔하게 되돌리기 어려워서 새로고침으로 단순화한다 (가장 안전).
function deactivateOutlookTheme(){
  if(!outlookBetaActive) return;
  showToast('Excel 모드로 돌아갑니다…', 'info');
  setTimeout(()=>{ window.location.reload(); }, 250);
}
// === Outlook 검색 / 중요 메일(Focused) / 읽음 상태 — 모두 세션 한정 ============
let outlookSearchQuery = '';
let outlookFocusedTab = 'primary';
const outlookReadKeys = new Set();
function outlookUnreadCls(readKey){
  return (readKey && !outlookReadKeys.has(readKey)) ? ' is-unread' : '';
}
function outlookMarkRead(readKey, row){
  if(!readKey) return;
  outlookReadKeys.add(readKey);
  if(row) row.classList.remove('is-unread');
}
// Focused(중요)=사람이 읽는 실제 시세 메일, Other(기타)=수급·모멘텀 자동 다이제스트.
// Outlook 의 "중요 받은 편지함 vs 기타" 와 같은 갈래라 비어 보이지 않고 분류가 일관적이다.
function outlookCardIsFocused(card){
  if(!card) return true;
  const isFlow = !!(card._flows && card._flows.length);
  const isMomentum = card._momentum !== undefined && card._momentum !== null;
  return !(isFlow || isMomentum);
}
// 받은 편지함(주식 전체)에서만 중요/기타 분리가 의미있다.
function outlookFocusedTabsVisible(){
  return outlookFolderFilter === 'inbox';
}
function syncOutlookFocusedTabs(){
  const wrap = document.querySelector('.outlook-list-head .outlook-focused');
  if(!wrap) return;
  wrap.style.display = outlookFocusedTabsVisible() ? '' : 'none';
  wrap.querySelectorAll('span[data-outlook-focused]').forEach((el)=>{
    el.classList.toggle('active', el.dataset.outlookFocused === outlookFocusedTab);
  });
}
function applyOutlookSearchFilter(){
  const list = document.getElementById('outlookMailList');
  if(!list) return;
  const q = outlookSearchQuery.trim().toLowerCase();
  let shown = 0;
  list.querySelectorAll('.outlook-mail-row').forEach((row)=>{
    const hit = !q || row.textContent.toLowerCase().includes(q);
    row.style.display = hit ? '' : 'none';
    if(hit) shown++;
  });
  let empty = list.querySelector('.outlook-search-empty');
  if(q && shown === 0){
    if(!empty){
      empty = document.createElement('div');
      empty.className = 'outlook-mail-empty outlook-search-empty';
      list.appendChild(empty);
    }
    empty.textContent = `'${outlookSearchQuery.trim()}' 검색 결과가 없습니다.`;
    empty.style.display = '';
  } else if(empty){
    empty.style.display = 'none';
  }
}
let outlookFolderFilter = 'inbox';
let outlookCommunityChannel = 'kr';
function outlookCommunityLabel(channel=outlookCommunityChannel){
  try{ return communityChannelLabel(channel); }catch{}
  const map={kr:'국내주식토론', us:'해외주식토론', coin:'코인토론', ops:'운영게시판'};
  return map[String(channel || 'kr')] || '국내주식토론';
}
function outlookCommunityCountId(channel=outlookCommunityChannel){
  const map={kr:'outlookCountCommunityKr', us:'outlookCountCommunityUs', coin:'outlookCountCommunityCoin', ops:'outlookCountCommunityOps'};
  return map[String(channel || 'kr')] || 'outlookCountCommunityKr';
}
function applyOutlookFolderFilter(folder, options={}){
  outlookFolderFilter = String(folder || 'inbox');
  if(outlookFolderFilter === 'community'){
    outlookCommunityChannel = String(options.channel || outlookCommunityChannel || 'kr');
  }
  const titleEl = document.getElementById('outlookListTitle');
  if(titleEl){
    const labels = {
      inbox: '받은 편지함',
      drafts: '임시 보관함',
      sent: '보낸 편지함',
      archive: '보관',
      flagged: '플래그 지정됨',
      notes: '보유종목 메일함',
      search: '검색 폴더',
      community: outlookCommunityLabel(outlookCommunityChannel),
      news: '뉴스',
    };
    titleEl.textContent = labels[outlookFolderFilter] || '받은 편지함';
  }
  if(outlookFolderFilter === 'community'){
    renderOutlookCommunity();
    return;
  }
  if(outlookFolderFilter === 'news'){
    renderOutlookNewsFeed();
    return;
  }
  if(lastSnapshot) renderOutlookFromSnapshot(lastSnapshot, (lastRenderedCards || []).filter((card)=>card && !card._noteRow));
}

// 종토방 글을 Outlook 메일 행 모양으로 펼침. 종목 카드와 데이터 모델이 달라
// 별도 렌더러를 둔다.
let outlookCommunityPosts = [];
let outlookCommunityLoaded = false;
let outlookSelectedCommunityId = null;
const outlookCommunityCache = {};
let outlookCommunityPostInFlight = false;
let outlookCommunityPollVoteInFlight = false;
let outlookCommentInFlight = false;
let outlookCommentReplyTarget = '';
async function loadOutlookCommunity(silent=false, channel=outlookCommunityChannel){
  const normalized = String(channel || 'kr');
  try{
    const data = await fetchJsonClient(`/api/community?channel=${encodeURIComponent(normalized)}`, 8000);
    const posts = Array.isArray(data?.posts) ? data.posts.filter((p)=>p && !p.hidden) : [];
    outlookCommunityCache[normalized] = { posts, poll:data?.poll || null, loaded:true, at:Date.now() };
    outlookCommunityPosts = posts;
    outlookCommunityLoaded = true;
    const el = document.getElementById(outlookCommunityCountId(normalized));
    if(el) el.textContent = String(outlookCommunityPosts.length || 0);
  }catch(e){
    if(!silent) debugWarn('outlook community load failed', e);
  }
}
function outlookCommunityAvatarColor(nick){
  const palette = ['#1d8a52','#2557c6','#6b3fa0','#d6a400','#0f7c5b','#c4314b','#a4262c','#185abd'];
  const h = outlookHashStr(String(nick||'익명'));
  return palette[h % palette.length];
}
function outlookCommunityPostRow(post, opts={}){
  const nick = (post.nickname || '익명').slice(0,18);
  const body = String(post.body||'').replace(/\s+/g,' ').trim();
  const time = post.created_at ? outlookTimeLabel(post.created_at) : '';
  const comments = Array.isArray(post.comments) ? post.comments.length : 0;
  const recommends = Math.max(0, Number(post.recommend_count || 0) || 0);
  // 12시간 추천 핀 (Excel 모드와 동일). 핀된 글은 메일 리스트에서 상단 우선·📌 배지.
  const pinUntilMs = Date.parse(post.pinned_until || '');
  const pinned = !!post.pinned || (Number.isFinite(pinUntilMs) && pinUntilMs > Date.now());
  const selectedCls = opts.selected ? ' is-selected' : '';
  const pinnedCls = pinned ? ' is-pinned' : '';
  const avatarColor = outlookCommunityAvatarColor(nick);
  const initial = (nick.charAt(0) || '?').toUpperCase();
  const subject = (pinned ? '📌 ' : '') + (body.slice(0, 60) || '(빈 글)');
  const previewBits = [];
  if(comments) previewBits.push(`댓글 ${comments}`);
  if(recommends) previewBits.push(`추천 ${recommends}`);
  const boardLabel = outlookCommunityLabel();
  const previewLines = previewBits.length ? previewBits.join(' · ') + ` · ${boardLabel}` : `${boardLabel} · 새 글`;
  const trail = `<span class="outlook-comment-pill">💬 ${comments}</span>${recommends ? `<span class="outlook-comment-pill" title="추천 ${recommends}회">👍 ${recommends}</span>` : ''}`;
  return `<div class="outlook-mail-row outlook-community-row${selectedCls}${pinnedCls}${outlookUnreadCls('post:'+(post.id||''))}" data-outlook-post-id="${esc(post.id||'')}" role="option" aria-selected="${opts.selected?'true':'false'}">
    <span class="outlook-mail-avatar" style="background:${avatarColor}">${esc(initial)}</span>
    <span class="outlook-mail-sender">${esc(nick)}</span>
    <span class="outlook-mail-time">${esc(time)}</span>
    <span class="outlook-mail-subject">${esc(subject)}</span>
    <span class="outlook-mail-preview">${esc(previewLines)}</span>
    <span class="outlook-mail-meta-trail">${trail}</span>
  </div>`;
}
function renderOutlookCommunityReadingPane(post){
  const pane = document.getElementById('outlookReadingPane');
  if(!pane || !post) return;
  const nick = (post.nickname || '익명').slice(0,18);
  const initial = (nick.charAt(0) || '?').toUpperCase();
  const avatarColor = outlookCommunityAvatarColor(nick);
  const body = String(post.body||'').trim();
  const time = post.created_at ? outlookTimeLabel(post.created_at) : '';
  const fullTs = post.created_at ? new Date(post.created_at).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const commentsHtml = outlookCommentSectionHtml(comments);
  const backBtn = `<button type="button" class="outlook-reading-back" data-outlook-action="reading-back" aria-label="목록으로 돌아가기"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>그룹 메일함</button>`;
  const recommends = Math.max(0, Number(post.recommend_count || 0) || 0);
  const pinUntilMs = Date.parse(post.pinned_until || '');
  const pinned = !!post.pinned || (Number.isFinite(pinUntilMs) && pinUntilMs > Date.now());
  const subject = `${pinned ? '📌 ' : ''}[그룹 메일] ${nick}님의 글${recommends ? ` · 추천 ${recommends}` : ''}`;
  const senderEmail = `${nick.toLowerCase().replace(/[^a-z가-힣0-9]/g,'')||'anon'}@team.local`;
  pane.innerHTML = `
    ${backBtn}
    <article class="outlook-reading-message">
      <h1 class="outlook-reading-subject">${esc(subject)}</h1>
      <span class="outlook-reading-tag">${esc(outlookCommunityLabel())} · ${esc(fullTs||time)}</span>
      <header class="outlook-reading-header">
        <span class="outlook-reading-avatar" style="background:${avatarColor}">${esc(initial)}</span>
        <div class="outlook-reading-from-block">
          <p class="outlook-reading-from">${esc(nick)} &lt;${esc(senderEmail)}&gt;</p>
          <dl class="outlook-reading-recipients">
            <dt>받는 사람</dt><dd>${esc(outlookCommunityLabel())} 구독자</dd>
            <dt>채널</dt><dd>월급루팡 회의실 — ${esc(outlookCommunityLabel())}</dd>
          </dl>
        </div>
        <div class="outlook-reading-meta-right"><span>${esc(fullTs||time)}</span></div>
      </header>
      <div class="outlook-reading-body">
        <p style="white-space:pre-wrap">${esc(body)}</p>
        ${commentsHtml}
        <p class="outlook-reading-signature">— ${esc(outlookCommunityLabel())}은 다른 동료들이 익명으로 의견을 나누는 공간입니다.</p>
        <div class="outlook-reading-actions-row">
          <button type="button" data-outlook-compose><svg viewBox="0 0 24 24"><path d="M5 19h14"/><path d="M7 15.5 17.8 4.7a2 2 0 0 1 2.8 2.8L9.8 18.3 6 19z"/></svg>새 글 쓰기</button>
        </div>
      </div>
    </article>
  `;
  pane.querySelector('[data-outlook-action="reading-back"]')?.addEventListener('click', outlookCloseReadingMobile);
  pane.querySelector('[data-outlook-compose]')?.addEventListener('click', (ev)=>{
    ev.preventDefault();
    openOutlookCommunityCompose();
  });
  wireOutlookCommentEvents(pane);
  if(outlookCommentReplyTarget){
    pane.querySelector('.outlook-comment-compose.is-reply .outlook-comment-input')?.focus();
  }
}
function outlookCommentComposeHtml(parentId, placeholder){
  const isReply = !!parentId;
  const limit = typeof COMMUNITY_COMMENT_LIMIT === 'number' ? COMMUNITY_COMMENT_LIMIT : 400;
  const nick = (typeof communityNicknameForInput === 'function' ? communityNicknameForInput() : '') || '익명';
  const nickField = isReply ? '' : `<input class="outlook-comment-nick" id="outlookCommentNick" maxlength="24" value="${esc(nick)}" autocomplete="off" aria-label="닉네임" placeholder="닉네임">`;
  return `<div class="outlook-comment-compose${isReply ? ' is-reply' : ''}" data-outlook-comment-parent="${esc(parentId || '')}">
    ${nickField}
    <textarea class="outlook-comment-input" maxlength="${limit}" rows="2" placeholder="${esc(placeholder)}"></textarea>
    <div class="outlook-comment-compose-actions">
      <button type="button" class="outlook-comment-submit" data-outlook-comment-submit>${isReply ? '답글 등록' : '댓글 등록'}</button>
      ${isReply ? '<button type="button" class="outlook-comment-cancel" data-outlook-comment-cancel>취소</button>' : ''}
    </div>
  </div>`;
}
function outlookCommentNodeHtml(comment, childrenMap, depth){
  const hidden = !!comment.hidden;
  const nick = (comment.nickname || '익명').slice(0, 18);
  const avatarColor = outlookCommunityAvatarColor(nick);
  const initial = (nick.charAt(0) || '?').toUpperCase();
  const time = comment.created_at ? outlookTimeLabel(comment.created_at) : '';
  const bodyHtml = hidden ? '<em class="outlook-comment-hidden">신고로 가려진 댓글입니다.</em>' : esc(comment.body || '');
  const canReply = !hidden && depth < 5;
  const replyBtn = canReply ? `<button type="button" class="outlook-comment-reply-btn" data-outlook-comment-reply="${esc(comment.id)}">답글</button>` : '';
  const replyForm = (outlookCommentReplyTarget && String(outlookCommentReplyTarget) === String(comment.id))
    ? outlookCommentComposeHtml(comment.id, '답글을 입력하세요')
    : '';
  const kids = (childrenMap.get(String(comment.id)) || []).map((c)=>outlookCommentNodeHtml(c, childrenMap, depth + 1)).join('');
  return `<li class="outlook-comment-node" data-depth="${Math.min(depth, 4)}">
    <div class="outlook-comment-row2">
      <span class="outlook-comment-avatar" style="background:${avatarColor}">${esc(initial)}</span>
      <div class="outlook-comment-main">
        <div class="outlook-comment-meta"><strong>${esc(nick)}</strong><span>${esc(time)}</span></div>
        <div class="outlook-comment-text">${bodyHtml}</div>
        <div class="outlook-comment-tools">${replyBtn}</div>
      </div>
    </div>
    ${replyForm}
    ${kids ? `<ul class="outlook-comment-children">${kids}</ul>` : ''}
  </li>`;
}
function outlookCommentSectionHtml(comments){
  const list = Array.isArray(comments) ? comments : [];
  const ids = new Set(list.map((c)=>String(c.id)));
  const childrenMap = new Map();
  const roots = [];
  list.forEach((c)=>{
    const pid = c.parent_id ? String(c.parent_id) : '';
    if(pid && ids.has(pid)){
      if(!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid).push(c);
    }else{
      roots.push(c);
    }
  });
  const threadHtml = roots.length
    ? `<ul class="outlook-comment-thread">${roots.map((c)=>outlookCommentNodeHtml(c, childrenMap, 0)).join('')}</ul>`
    : '<p class="outlook-comment-empty">아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.</p>';
  return `<section class="outlook-comment-section" aria-label="댓글">
    <div class="outlook-comment-section-head">댓글 ${list.length}</div>
    ${threadHtml}
    ${outlookCommentComposeHtml('', '이 글에 댓글을 남겨보세요')}
  </section>`;
}
function refreshOutlookReadingForSelectedPost(){
  const post = outlookCommunityPosts.find((p)=>String(p.id) === String(outlookSelectedCommunityId));
  if(post) renderOutlookCommunityReadingPane(post);
}
function wireOutlookCommentEvents(pane){
  const section = pane.querySelector('.outlook-comment-section');
  if(!section) return;
  section.addEventListener('click', (ev)=>{
    const replyBtn = ev.target.closest('[data-outlook-comment-reply]');
    if(replyBtn){
      const cid = replyBtn.getAttribute('data-outlook-comment-reply');
      outlookCommentReplyTarget = (String(outlookCommentReplyTarget) === String(cid)) ? '' : cid;
      refreshOutlookReadingForSelectedPost();
      return;
    }
    if(ev.target.closest('[data-outlook-comment-cancel]')){
      outlookCommentReplyTarget = '';
      refreshOutlookReadingForSelectedPost();
      return;
    }
    const submitBtn = ev.target.closest('[data-outlook-comment-submit]');
    if(submitBtn){
      const wrap = submitBtn.closest('.outlook-comment-compose');
      submitOutlookCommunityComment(wrap?.getAttribute('data-outlook-comment-parent') || '', wrap);
    }
  });
}
async function submitOutlookCommunityComment(parentId, wrap){
  if(outlookCommentInFlight) return;
  const postId = outlookSelectedCommunityId;
  if(!postId) return;
  const composeWrap = wrap || document.querySelector('.outlook-comment-compose[data-outlook-comment-parent=""]');
  const input = composeWrap?.querySelector('.outlook-comment-input');
  const nickEl = document.getElementById('outlookCommentNick');
  const text = String(input?.value || '').trim();
  const nickname = typeof communityNicknameForSend === 'function' ? communityNicknameForSend(nickEl?.value) : String(nickEl?.value || '익명').trim();
  if(!nickname) return;
  if(text.length < 1){ showToast('댓글을 입력하세요', 'warn'); input?.focus?.(); return; }
  if(typeof isCommunitySearchOnlyText === 'function' && isCommunitySearchOnlyText(text)){
    if(typeof warnCommunitySearchOnly === 'function') warnCommunitySearchOnly(input);
    return;
  }
  const limit = typeof COMMUNITY_COMMENT_LIMIT === 'number' ? COMMUNITY_COMMENT_LIMIT : 400;
  if(text.length > limit){ showToast(`댓글은 ${limit}자까지 가능합니다`, 'warn'); return; }
  outlookCommentInFlight = true;
  const submitBtn = composeWrap?.querySelector('[data-outlook-comment-submit]');
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = '등록 중...'; }
  try{
    if(typeof guardChatMessage === 'function' && !(await guardChatMessage(text, '커뮤니티 댓글'))) return;
    const data = await fetchJsonClient('/api/community', 7000, {
      method:'POST',
      headers: (typeof isInlineAdmin === 'function' && isInlineAdmin()) ? adminAuthHeaders({'content-type':'application/json'}) : {'content-type':'application/json'},
      body: JSON.stringify({
        action:'comment',
        post_id:postId,
        parent_id:parentId || '',
        user_id:chatUserId(),
        nickname,
        channel:outlookCommunityChannel,
        coin_source: typeof coinQuoteSource === 'function' ? coinQuoteSource() : 'binance',
        body:text,
      }),
    });
    if(data?.post){
      const cache = outlookCommunityCache[outlookCommunityChannel] || { posts:[], loaded:true };
      cache.posts = (cache.posts || []).map((p)=>String(p.id) === String(data.post.id) ? data.post : p);
      cache.loaded = true;
      outlookCommunityCache[outlookCommunityChannel] = cache;
      outlookSelectedCommunityId = data.post.id;
      outlookCommentReplyTarget = '';
      if(typeof saveCommunityNickname === 'function') saveCommunityNickname(nickname);
      showToast(parentId ? '답글을 등록했습니다' : '댓글을 등록했습니다', 'info');
      await renderOutlookCommunity();
    }
  }catch(e){
    const msg = String(e.message || e);
    if(msg.includes('blocked_term')) showToast('차단 표현이 포함되어 등록하지 않았습니다', 'warn');
    else if(msg.includes('reserved_nickname')) showToast('관리자/운영AI봇 닉네임은 관리자만 사용할 수 있습니다', 'warn');
    else if(msg.includes('low_quality_jamo')) showToast('초성만 있거나 의미 없는 반복 댓글은 등록할 수 없습니다', 'warn');
    else if(msg.includes('duplicate_content')) showToast('같은 댓글을 반복해서 올릴 수 없습니다', 'warn');
    else if(msg.includes('rate_limited') || msg.includes('spam_detected')) showToast('도배 방지를 위해 잠시 후 다시 입력해주세요', 'warn');
    else if(msg.includes('403')) showToast('채팅 제한 중에는 커뮤니티 댓글도 제한됩니다', 'err');
    else showToast(`댓글 등록 실패: ${msg}`, 'err');
  }finally{
    outlookCommentInFlight = false;
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = parentId ? '답글 등록' : '댓글 등록'; }
  }
}
function outlookCommunityPollHtml(poll, channel=outlookCommunityChannel){
  if(!poll || String(channel) === 'ops') return '';
  const selected = typeof selectedCommunityPollChoice === 'function' ? selectedCommunityPollChoice(poll) : null;
  const voted = Number.isInteger(selected);
  const total = Math.max(0, Number(poll.total || 0) || 0);
  const options = Array.isArray(poll.options) ? poll.options : [];
  const showResults = total > 0 || voted;
  const buttons = options.map((option, index)=>{
    const pct = Number(poll.percentages?.[index] || 0);
    const label = showResults ? `${option} ${pct ? `${pct.toFixed(pct % 1 ? 1 : 0)}%` : '0%'}` : option;
    return `<button class="outlook-poll-choice${selected === index ? ' selected' : ''}" type="button" data-outlook-poll-choice="${index}" ${voted || outlookCommunityPollVoteInFlight ? 'disabled' : ''}>${esc(label)}</button>`;
  }).join('');
  const meta = total ? `${total.toLocaleString('ko-KR')}명 참여` : (voted ? '첫 투표 완료' : '첫 투표를 기다리는 중');
  return `<div class="outlook-community-poll-card" data-outlook-poll-id="${esc(poll.id || '')}">
    <span class="outlook-poll-kicker">${esc(poll.kicker || '오늘의 투표')}</span>
    <strong>${esc(poll.question || '오늘 시장은?')}</strong>
    <div class="outlook-poll-options">${buttons}</div>
    <small>${esc(meta)}</small>
  </div>`;
}
async function voteOutlookCommunityPoll(choice){
  if(outlookCommunityPollVoteInFlight) return;
  const cache = outlookCommunityCache[outlookCommunityChannel] || {};
  const poll = cache.poll;
  if(!poll) return;
  const selected = Number(choice);
  if(!Number.isInteger(selected)) return;
  if(typeof selectedCommunityPollChoice === 'function' && Number.isInteger(selectedCommunityPollChoice(poll))){
    showToast('오늘 투표는 이미 참여했습니다', 'info');
    return;
  }
  outlookCommunityPollVoteInFlight = true;
  renderOutlookCommunity();
  try{
    const data = await fetchJsonClient('/api/community', 7000, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        action:'poll_vote',
        channel:outlookCommunityChannel,
        choice:selected,
        user_id:chatUserId(),
      }),
    });
    if(data?.poll){
      cache.poll = data.poll;
      outlookCommunityCache[outlookCommunityChannel] = cache;
      if(typeof syncCommunityPollFromPayload === 'function') syncCommunityPollFromPayload(data.poll, outlookCommunityChannel);
      if(typeof rememberCommunityPollVote === 'function') rememberCommunityPollVote(data.poll);
      showToast(data.poll.already ? '이미 참여한 투표입니다' : '투표했습니다', 'info');
    }
  }catch(e){
    showToast(`투표 실패: ${e.message || e}`, 'err');
  }finally{
    outlookCommunityPollVoteInFlight = false;
    renderOutlookCommunity();
  }
}
function renderOutlookCommunityComposePane(channel=outlookCommunityChannel){
  const pane = document.getElementById('outlookReadingPane');
  if(!pane) return;
  const label = outlookCommunityLabel(channel);
  const nick = (typeof communityNicknameForInput === 'function' ? communityNicknameForInput() : '') || '익명';
  const backBtn = `<button type="button" class="outlook-reading-back" data-outlook-action="reading-back" aria-label="목록으로 돌아가기"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>${esc(label)}</button>`;
  pane.innerHTML = `
    ${backBtn}
    <article class="outlook-reading-message outlook-compose-message">
      <h1 class="outlook-reading-subject">새 게시글 작성</h1>
      <span class="outlook-reading-tag">${esc(label)} · 메일 작성 화면</span>
      <div class="outlook-compose-grid">
        <label><span>보내는 사람</span><input id="outlookCommunityNick" maxlength="24" value="${esc(nick)}" autocomplete="off"></label>
        <label><span>받는 사람</span><input value="${esc(label)} 구독자" readonly></label>
        <label class="outlook-compose-body"><span>내용</span><textarea id="outlookCommunityBody" maxlength="${typeof COMMUNITY_BODY_LIMIT === 'number' ? COMMUNITY_BODY_LIMIT : 160}" rows="7" placeholder="여러 종목에 걸쳐 이야기를 나누는 공간입니다.&#10;특정 종목 태그하기 : @종목명(공백없이)"></textarea></label>
      </div>
      <div class="outlook-reading-actions-row">
        <button type="button" class="outlook-compose-submit" data-outlook-community-submit><svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/></svg>게시글 보내기</button>
        <button type="button" data-outlook-compose-cancel>취소</button>
      </div>
      <p class="outlook-reading-signature">작성한 글은 ${esc(label)}에 등록됩니다. 기존 게시판과 같은 도배 방지, 신고, 금칙어 규칙이 적용됩니다.</p>
    </article>
  `;
  pane.querySelector('[data-outlook-action="reading-back"]')?.addEventListener('click', outlookCloseReadingMobile);
  pane.querySelector('[data-outlook-compose-cancel]')?.addEventListener('click', ()=>renderOutlookCommunity());
  pane.querySelector('[data-outlook-community-submit]')?.addEventListener('click', submitOutlookCommunityPost);
  pane.querySelector('#outlookCommunityBody')?.focus?.();
}
async function openOutlookCommunityCompose(){
  if(outlookFolderFilter !== 'community'){
    outlookFolderFilter = 'community';
    outlookCommunityChannel = outlookCommunityChannel || 'kr';
    document.querySelectorAll('.outlook-folder[data-outlook-folder]').forEach((f)=>{
      const isTarget = f.dataset.outlookFolder === 'community' && String(f.dataset.outlookChannel || 'kr') === outlookCommunityChannel;
      f.classList.toggle('selected', isTarget);
    });
    const titleEl = document.getElementById('outlookListTitle');
    if(titleEl) titleEl.textContent = outlookCommunityLabel();
    await renderOutlookCommunity();
  }
  renderOutlookCommunityComposePane();
  const pane = document.getElementById('outlookReadingPane');
  if(pane && isOutlookMobile()) pane.classList.add('is-open');
}
async function submitOutlookCommunityPost(){
  if(outlookCommunityPostInFlight) return;
  const nickEl = document.getElementById('outlookCommunityNick');
  const bodyEl = document.getElementById('outlookCommunityBody');
  const text = String(bodyEl?.value || '').trim();
  const nickname = typeof communityNicknameForSend === 'function' ? communityNicknameForSend(nickEl?.value) : String(nickEl?.value || '익명').trim();
  if(!nickname) return;
  if(text.length < 2){ showToast('게시글을 두 글자 이상 입력하세요', 'warn'); return; }
  if(typeof isCommunitySearchOnlyText === 'function' && isCommunitySearchOnlyText(text)){
    if(typeof warnCommunitySearchOnly === 'function') warnCommunitySearchOnly(bodyEl);
    return;
  }
  if(text.length > (typeof COMMUNITY_BODY_LIMIT === 'number' ? COMMUNITY_BODY_LIMIT : 160)){
    showToast(`게시글은 ${typeof COMMUNITY_BODY_LIMIT === 'number' ? COMMUNITY_BODY_LIMIT : 160}자까지 가능합니다`, 'warn');
    return;
  }
  outlookCommunityPostInFlight = true;
  const submit = document.querySelector('[data-outlook-community-submit]');
  if(submit){ submit.disabled = true; submit.textContent = '보내는 중...'; }
  try{
    if(typeof guardChatMessage === 'function' && !(await guardChatMessage(text, '커뮤니티 내용'))) return;
    const data = await fetchJsonClient('/api/community', 7000, {
      method:'POST',
      headers:typeof isInlineAdmin === 'function' && isInlineAdmin() ? adminAuthHeaders({'content-type':'application/json'}) : {'content-type':'application/json'},
      body:JSON.stringify({
        action:'create',
        user_id:chatUserId(),
        nickname,
        channel:outlookCommunityChannel,
        coin_source: typeof coinQuoteSource === 'function' ? coinQuoteSource() : 'binance',
        body:text,
      }),
    });
    if(data?.post){
      const cache = outlookCommunityCache[outlookCommunityChannel] || { posts:[] };
      cache.posts = [data.post, ...(cache.posts || [])].slice(0, 80);
      cache.loaded = true;
      outlookCommunityCache[outlookCommunityChannel] = cache;
      outlookCommunityPosts = cache.posts;
      outlookSelectedCommunityId = data.post.id;
      const countEl = document.getElementById(outlookCommunityCountId(outlookCommunityChannel));
      if(countEl) countEl.textContent = String(outlookCommunityPosts.length || 0);
      if(typeof saveCommunityNickname === 'function') saveCommunityNickname(nickname);
      showToast(`${outlookCommunityLabel()}에 글이 올라갔습니다`, 'info');
      renderOutlookCommunity();
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
    outlookCommunityPostInFlight = false;
    if(submit){ submit.disabled = false; submit.innerHTML = '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/></svg>게시글 보내기'; }
  }
}
async function renderOutlookCommunity(){
  const list = document.getElementById('outlookMailList');
  if(!list) return;
  const channel = outlookCommunityChannel || 'kr';
  const cached = outlookCommunityCache[channel];
  if(!cached?.loaded){
    list.innerHTML = `<div class="outlook-mail-empty">${esc(outlookCommunityLabel(channel))}을 불러오는 중...</div>`;
    await loadOutlookCommunity(true, channel);
  }else{
    outlookCommunityPosts = cached.posts || [];
    outlookCommunityLoaded = true;
  }
  const today = new Date(); const todayStr = `${today.getMonth()+1}월 ${today.getDate()}일`;
  const poll = outlookCommunityCache[channel]?.poll || null;
  let html = `<div class="outlook-mail-date">${esc(outlookCommunityLabel(channel))} · ${todayStr}</div>${outlookCommunityPollHtml(poll, channel)}`;
  if(!outlookCommunityPosts.length){
    html += `<div class="outlook-mail-empty">아직 글이 없습니다. 상단의 신규 버튼으로 첫 글을 남겨보세요.</div>`;
    list.innerHTML = html;
    document.getElementById('outlookReadingPane').innerHTML = `<div class="outlook-reading-empty">
      <svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="14" width="52" height="36" rx="4"/><path d="m8 18 24 18 24-18"/></svg>
      <strong>${esc(outlookCommunityLabel(channel))}</strong>
      <span>월급루팡들이 익명으로 의견을 나누는 공간입니다.</span>
      <button type="button" class="outlook-empty-compose" data-outlook-compose>새 글 쓰기</button>
    </div>`;
    document.querySelector('.outlook-empty-compose')?.addEventListener('click', openOutlookCommunityCompose);
    syncOutlookFocusedTabs();
    return;
  }
  if(!outlookSelectedCommunityId || !outlookCommunityPosts.some((p)=>p.id===outlookSelectedCommunityId)){
    outlookSelectedCommunityId = outlookCommunityPosts[0]?.id || null;
  }
  html += outlookCommunityPosts.slice(0, 40).map((p)=>outlookCommunityPostRow(p, {selected: p.id === outlookSelectedCommunityId})).join('');
  list.innerHTML = html;
  list.onclick = (ev)=>{
    const pollChoice = ev.target.closest('[data-outlook-poll-choice]');
    if(pollChoice){
      voteOutlookCommunityPoll(pollChoice.dataset.outlookPollChoice);
      return;
    }
    const row = ev.target.closest('.outlook-community-row');
    if(!row) return;
    const id = row.dataset.outlookPostId;
    const post = outlookCommunityPosts.find((p)=>p.id===id);
    if(!post) return;
    outlookSelectedCommunityId = id;
    outlookMarkRead('post:'+id, row);
    document.querySelectorAll('.outlook-community-row').forEach((r)=>r.classList.toggle('is-selected', r===row));
    renderOutlookCommunityReadingPane(post);
    const pane = document.getElementById('outlookReadingPane');
    if(pane && window.matchMedia && window.matchMedia('(max-width: 760px)').matches) pane.classList.add('is-open');
  };
  const first = outlookCommunityPosts.find((p)=>p.id===outlookSelectedCommunityId) || outlookCommunityPosts[0];
  if(first) renderOutlookCommunityReadingPane(first);
  syncOutlookFocusedTabs();
  applyOutlookSearchFilter();
}
let outlookSelectedNewsId = '';
function outlookNewsItems(){
  const source = newsAccumulated.length
    ? newsAccumulated
    : ['KR','US','COIN'].flatMap((market)=>(
      Array.isArray(lastSnapshot?.news?.[market])
        ? lastSnapshot.news[market].map((item)=>({ ...item, market }))
        : []
    ));
  const market = currentNewsMarket();
  const filtered = market === 'ALL'
    ? source.filter((item)=>item.market !== 'COIN')
    : source.filter((item)=>item.market === market);
  return filtered
    .filter((item)=>item && (item.title || item.headline))
    .slice(0, 80)
    .map((item, index)=>({ ...item, _outlookId: newsKey(item) || `${item.market || 'N'}:${index}` }));
}
function outlookNewsRow(item, opts={}){
  const title = String(item.title || item.headline || '뉴스').trim();
  const source = item.source || item.publisher || item.market || '뉴스';
  const time = outlookTimeLabel(item.publishedAt || item.asOf);
  const market = String(item.market || '').toUpperCase();
  const tone = market === 'KR' ? 'kr' : (market === 'US' ? 'us' : (market === 'COIN' ? 'coin' : 'flow'));
  const avatar = market === 'KR' ? 'KR' : (market === 'US' ? 'US' : (market === 'COIN' ? '₿' : 'N'));
  const preview = String(item.summary || item.desc || item.description || source || '').replace(/\s+/g, ' ').slice(0, 110);
  const selectedCls = opts.selected ? ' is-selected' : '';
  return `<div class="outlook-mail-row outlook-news-row${selectedCls}${outlookUnreadCls('news:'+item._outlookId)}" data-outlook-news-id="${esc(item._outlookId)}" role="option" aria-selected="${opts.selected?'true':'false'}">
    <span class="outlook-mail-avatar" data-tone="${tone}">${esc(avatar)}</span>
    <span class="outlook-mail-sender">${esc(source)}</span>
    <span class="outlook-mail-time">${esc(time)}</span>
    <span class="outlook-mail-subject">${esc(title)}</span>
    <span class="outlook-mail-preview">${esc(preview || '뉴스')}</span>
    <span class="outlook-mail-meta-trail"><span class="outlook-comment-pill">${esc(market || 'NEWS')}</span></span>
  </div>`;
}
function renderOutlookNewsReadingPane(item){
  const pane = document.getElementById('outlookReadingPane');
  if(!pane || !item) return;
  const title = String(item.title || item.headline || '뉴스').trim();
  const source = item.source || item.publisher || '뉴스';
  const time = item.publishedAt || item.asOf;
  const fullTs = time ? new Date(time).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
  const market = String(item.market || '').toUpperCase();
  const tone = market === 'KR' ? 'kr' : (market === 'US' ? 'us' : (market === 'COIN' ? 'coin' : 'flow'));
  const avatar = market === 'KR' ? 'KR' : (market === 'US' ? 'US' : (market === 'COIN' ? '₿' : 'N'));
  const summary = String(item.summary || item.desc || item.description || '').trim();
  const backBtn = `<button type="button" class="outlook-reading-back" data-outlook-action="reading-back" aria-label="목록으로 돌아가기"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>뉴스</button>`;
  const link = item.url
    ? `<a href="${esc(item.url)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>원문 열기</a>`
    : '';
  pane.innerHTML = `
    ${backBtn}
    <article class="outlook-reading-message">
      <h1 class="outlook-reading-subject">${esc(title)}</h1>
      <span class="outlook-reading-tag">뉴스 · ${esc(fullTs || outlookTimeLabel(time))}</span>
      <header class="outlook-reading-header">
        <span class="outlook-reading-avatar" data-tone="${tone}">${esc(avatar)}</span>
        <div class="outlook-reading-from-block">
          <p class="outlook-reading-from">${esc(source)} &lt;news-feed@market.local&gt;</p>
          <dl class="outlook-reading-recipients">
            <dt>받는 사람</dt><dd>뉴스 구독자</dd>
            <dt>시장</dt><dd>${esc(market || 'ALL')}</dd>
          </dl>
        </div>
        <div class="outlook-reading-meta-right"><span>${esc(fullTs || outlookTimeLabel(time))}</span></div>
      </header>
      <div class="outlook-reading-body">
        <p>${esc(summary || title)}</p>
        <p class="outlook-reading-signature">엑셀 시트의 뉴스를 Outlook 편지함 목록처럼 옮겨 보여주는 화면입니다.</p>
        ${link ? `<div class="outlook-reading-actions-row">${link}</div>` : ''}
      </div>
    </article>
  `;
  pane.querySelector('[data-outlook-action="reading-back"]')?.addEventListener('click', outlookCloseReadingMobile);
}
function renderOutlookNewsFeed(){
  const list = document.getElementById('outlookMailList');
  if(!list) return;
  const items = outlookNewsItems();
  const count = document.getElementById('outlookCountNews');
  if(count) count.textContent = String(items.length || 0);
  const today = new Date(); const todayStr = `${today.getMonth()+1}월 ${today.getDate()}일`;
  let html = `<div class="outlook-mail-date">뉴스 · ${todayStr}</div>`;
  if(!items.length){
    html += `<div class="outlook-mail-empty">아직 표시할 뉴스가 없습니다. 잠시 후 다시 확인해 주세요.</div>`;
    list.innerHTML = html;
    return;
  }
  if(!outlookSelectedNewsId || !items.some((item)=>item._outlookId === outlookSelectedNewsId)){
    outlookSelectedNewsId = items[0]._outlookId;
  }
  html += items.map((item)=>outlookNewsRow(item, { selected:item._outlookId === outlookSelectedNewsId })).join('');
  list.innerHTML = html;
  list.onclick = (ev)=>{
    const row = ev.target.closest('.outlook-news-row');
    if(!row) return;
    const id = row.dataset.outlookNewsId || '';
    const item = outlookNewsItems().find((n)=>n._outlookId === id);
    if(!item) return;
    outlookSelectedNewsId = id;
    outlookMarkRead('news:'+id, row);
    document.querySelectorAll('.outlook-news-row').forEach((r)=>r.classList.toggle('is-selected', r===row));
    renderOutlookNewsReadingPane(item);
    const pane = document.getElementById('outlookReadingPane');
    if(pane && window.matchMedia && window.matchMedia('(max-width: 760px)').matches) pane.classList.add('is-open');
  };
  const first = items.find((item)=>item._outlookId === outlookSelectedNewsId) || items[0];
  renderOutlookNewsReadingPane(first);
  syncOutlookFocusedTabs();
  applyOutlookSearchFilter();
}
function findOutlookCardByKey(key){
  if(!Array.isArray(lastRenderedCards)) return null;
  return lastRenderedCards.find((c)=>String(c.key) === String(key)) || null;
}

/* === Outlook v3 renderers ====================================================== */
function outlookAvatarTone(card){
  if(!card) return 'flow';
  const k = String(card.key||'').toLowerCase();
  const m = String(card.market||'').toUpperCase();
  if(['kimchi','김프(%)'].includes(k) || k.includes('김프')) return 'flow';
  if(k.includes('원/달러') || k.includes('usdkrw') || k.includes('환율')) return 'fx';
  if(k.includes('wti') || k.includes('금현물') || k.includes('gold') || k.includes('coil')) return 'flow';
  if(k.includes('코스피') || k.includes('코스닥') || k.includes('나스닥') || k.includes('s&p') || k.includes('다우') || k.includes('야선')) return 'index';
  if(m==='KR') return 'kr';
  if(m==='US') return 'us';
  if(m==='COIN') return 'coin';
  return 'flow';
}
function outlookAvatarInitials(card){
  if(!card) return '??';
  const map = {
    '코스피':'코스','코스닥':'코닥','삼성전자':'삼','SK하이닉스':'SK','LG전자':'LG','현대자동차':'현대',
    '나스닥':'나스','다우':'다우','S&P500':'S&P','코스피야선':'야선',
    'TIGER 200IT레버리지':'IT','BTC':'BTC','ETH':'ETH','XRP':'XRP','SOL':'SOL','BNB':'BNB','DOGE':'DG','USDT/KRW':'₮',
    'BTC(USD)':'BTC','김프(%)':'김프','원/달러':'$₩','WTI 원유':'WTI','KRW 금현물':'금',
    'QQQ':'QQQ','TQQQ':'TQQ','SOXL':'SXL','SPY':'SPY','NVIDIA':'NV','Tesla':'TS','Apple':'AA',
  };
  if(map[card.key]) return map[card.key];
  const k = String(card.key||card.code||'').trim();
  if(!k) return '??';
  if(/^[A-Z0-9]+$/.test(k)) return k.slice(0,3);
  return k.slice(0,2);
}
function outlookChangeDir(pct){
  const n = Number(pct);
  if(!Number.isFinite(n) || Math.abs(n)<0.005) return 'flat';
  return n>0 ? 'up' : 'down';
}
function outlookFormatPct(pct){
  const n = Number(pct);
  if(!Number.isFinite(n)) return '—';
  const sign = n>0 ? '+' : (n<0 ? '' : '±');
  return `${sign}${n.toFixed(2)}%`;
}
function outlookFormatPrice(card){
  if(!card) return '—';
  if(shouldRenderUsPriceInKrw(card)) return cardPriceDisplayText(card) || '—';
  const v = Number(card.price);
  if(!Number.isFinite(v)) return '—';
  const suffix = displayPriceUnit(card);
  // Excel 모드와 동일한 통화 부호 ($/₩) prefix. priceUnit suffix 가 있는 카드는
  // 자체적으로 단위 표시 (예: "1,505원") 이라 prefix 생략.
  const currency = (typeof priceCellCurrencyMark === 'function') ? priceCellCurrencyMark(card) : '';
  const prefix = currency ? `${currency} ` : '';
  if(typeof quotePriceNumberText === 'function'){
    return prefix + quotePriceNumberText(v, currency, suffix, card?.priceUnit) + suffix;
  }
  if(card.market === 'COIN' || /BTC|ETH|USD/.test(String(card.key||''))){
    if(v >= 1000) return prefix + v.toLocaleString('en-US', {maximumFractionDigits:0}) + suffix;
    if(v >= 1) return prefix + v.toLocaleString('en-US', {maximumFractionDigits:2}) + suffix;
    return prefix + v.toLocaleString('en-US', {maximumFractionDigits:4}) + suffix;
  }
  if(card.market === 'KR'){
    return prefix + v.toLocaleString('ko-KR', {maximumFractionDigits: v>=1000 ? 0 : 2}) + suffix;
  }
  // US / index / fx
  if(v >= 1000) return prefix + v.toLocaleString('en-US', {maximumFractionDigits:2}) + suffix;
  if(v >= 10) return prefix + v.toLocaleString('en-US', {maximumFractionDigits:2}) + suffix;
  return prefix + v.toLocaleString('en-US', {maximumFractionDigits:4}) + suffix;
}
function outlookTimeLabel(asOf){
  if(!asOf) return '';
  const d = new Date(asOf);
  if(Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diffMs = now - d.getTime();
  if(diffMs < 60_000) return '방금';
  if(diffMs < 60*60_000){
    const m = Math.floor(diffMs/60_000);
    return `${m}분 전`;
  }
  // Same day → HH:MM
  const today = new Date();
  if(d.toDateString() === today.toDateString()){
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  // Yesterday
  const yest = new Date(today); yest.setDate(today.getDate()-1);
  if(d.toDateString() === yest.toDateString()) return '어제';
  return `${d.getMonth()+1}/${d.getDate()}`;
}
// 종목 키마다 발신자를 일관되게 매핑하기 위한 간단한 해시.
function outlookHashStr(s){
  const str = String(s||'');
  let h = 2166136261;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

const OUTLOOK_SENDERS_KR = [
  '강매수 차장 (자산운용본부)',
  '김존버 과장 (시황분석실)',
  '박손절 대리 (트레이딩데스크)',
  '최익절 부장 (리서치센터)',
  '정매도 책임 (전략기획팀)',
  '이불장 사원 (모니터링팀)',
  '한기준 팀장 (포트폴리오팀)',
  '오추매 매니저 (자산배분실)',
  '서평균 차장 (퀀트리서치)',
  '윤물타 과장 (운용지원실)',
  'KRX 시황 데스크',
  '국내증시 모니터링팀',
  '코스피 일일 브리프',
  '리서치센터 자동 발송',
];
const OUTLOOK_SENDERS_US = [
  'Mark Tobye, CFA (Equity Research)',
  'Jenny Holdwell (Portfolio Desk)',
  'Doug Catchafalling (Trading Desk)',
  'Sam Buybackman (Capital Markets)',
  'Karen Stoploss (Risk Office)',
  'Ralph Diamondhands (Strategy)',
  'Lisa Margincall (Macro Desk)',
  'Wallstreet 24/7 데스크',
  'US Markets Daily Digest',
  'Nasdaq Morning Briefing',
  'Equity Research Auto-Send',
  'Sector Watch Distribution',
];
const OUTLOOK_SENDERS_COIN = [
  'Satoshi Choi (코인 데스크)',
  '김김프 책임 (디지털자산팀)',
  '도지왕 매니저 (Web3 리서치)',
  '나잘버 사원 (온체인 분석)',
  'HODL 트레이딩데스크',
  '디지털자산 시황팀',
  '코인 24시 모니터링',
  'On-chain Daily Digest',
];
const OUTLOOK_SENDERS_INDEX = [
  '지수 모니터링 자동 발송',
  '거시경제 리서치팀',
  '시황 분석실 (지수 데스크)',
  '글로벌 인덱스 알림',
  '벤치마크 데일리 브리프',
];
const OUTLOOK_SENDERS_FX = [
  '외환 데스크 (FX Trading)',
  'FX 자동 알림 봇',
  '환율 모니터링팀',
  '글로벌 외환 데일리',
];
const OUTLOOK_SENDERS_COMMODITY = [
  '원자재 시세팀 (Commodities Desk)',
  '에너지·금속 리서치',
  '원유·금속 데일리 브리프',
];

// 종목별 고정 닉네임 — 종목 이름을 살짝 비튼 가짜 인물/팀 이름으로
// 메일함이 좀 더 사람 냄새 나게 보이도록.
const OUTLOOK_SENDERS_BY_KEY = {
  // KR
  '삼성전자': '이재용 (전자사업본부)',
  'SK하이닉스': '최치프 차장 (하이닉팀)',
  '현대자동차': '정자동 부장 (차량전략실)',
  'LG전자': '구가전 매니저 (생활가전)',
  'TIGER 200IT레버리지': '범IT 김씨 (200레버 운용)',
  '코스피': '김코피 (KOSPI 운영실)',
  '코스닥': '박코닥 (KOSDAQ 데스크)',
  '코스피야선': '야간 김씨 (선물 데스크)',
  // US — 종목 이름을 살짝 비튼 가짜 인물 이름
  'Apple': '용이네 과수원 (사과부)',
  'NVIDIA': '황진우 (GPU 사업부)',
  'Tesla': '일론 김머스크 (충전소장)',
  'Microsoft': '빌철수 (윈도우즈팀)',
  'GOOG': '래리 페김 (검색본부)',
  'GOOGL': '래리 페김 (검색본부)',
  'META': '마크 저커박 (소셜앱팀)',
  'AMZN': '제프 베조박 (배송센터)',
  'NFLX': '리드 헤이김 (콘텐츠 운영)',
  '나스닥': '김나스 (Nasdaq 모니터링)',
  '다우': '박존스 (DJIA 데스크)',
  'S&P500': '박오백 (S&P 인덱스팀)',
  'SOXL': '3배 반도김 (레버리지팀)',
  'TQQQ': '트리플 큐레버 (Q3X 운용)',
  'QQQ': '큐큐 박씨 (나스닥100 운용)',
  'SPY': '김에스피 (S&P SPDR)',
  // COIN / 환율 / 원자재
  'BTC': '사토시 박 (코인 데스크)',
  'BTC(USD)': '사토시 박 (코인 데스크)',
  'ETH': '비탈릭 부테박 (스마트컨트랙트팀)',
  'XRP': '김리플 (결제 네트워크실)',
  'SOL': '김솔라 (Solana Lab)',
  'BNB': '바낸 사장 (CZ 의전실)',
  'DOGE': '도지 머스크박 (밈 트레이딩)',
  'USDT/KRW': '테더 환전팀 (스테이블 데스크)',
  '김프(%)': '김김프 (환차익 데스크)',
  '원/달러': '환달러 김씨 (FX 데스크)',
  'WTI 원유': '텍사스 박씨 (원유 거래소)',
  'KRW 금현물': '황금 사또 (귀금속팀)',
};

function outlookSenderLabel(card){
  if(!card) return '시세 데스크';
  const m = String(card.market||'').toUpperCase();
  const key = String(card.key||'');
  const code = String(card.code||'');
  // 1) 종목별 고정 매핑이 있으면 그것을 최우선.
  if(OUTLOOK_SENDERS_BY_KEY[key]) return OUTLOOK_SENDERS_BY_KEY[key];

  // 2) 카드별 고정 인덱스 — 같은 종목은 항상 같은 발신자.
  const h = outlookHashStr(`${m}:${key||code}`);

  // 김프·환율 / 원자재 전용 풀
  if(/김프|kimchi/i.test(key)) return OUTLOOK_SENDERS_COIN[h % OUTLOOK_SENDERS_COIN.length];
  if(/원\/달러|usdkrw|환율/i.test(key)) return OUTLOOK_SENDERS_FX[h % OUTLOOK_SENDERS_FX.length];
  if(/WTI|원유|금현물|gold/i.test(key)) return OUTLOOK_SENDERS_COMMODITY[h % OUTLOOK_SENDERS_COMMODITY.length];

  // 지수
  if(/코스피|코스닥|나스닥|s&p|다우|야선/i.test(key)) return OUTLOOK_SENDERS_INDEX[h % OUTLOOK_SENDERS_INDEX.length];

  // 시장별 일반 풀 — 사용자 추가 종목 등
  if(m === 'COIN') return OUTLOOK_SENDERS_COIN[h % OUTLOOK_SENDERS_COIN.length];
  if(m === 'US') return OUTLOOK_SENDERS_US[h % OUTLOOK_SENDERS_US.length];
  if(m === 'KR') return OUTLOOK_SENDERS_KR[h % OUTLOOK_SENDERS_KR.length];
  return '시세 데스크';
}

// 발신자 이메일도 함께 — 회사 메일처럼 보이게 일관된 도메인.
function outlookSenderEmail(card, sender){
  const m = String(card?.market||'').toUpperCase();
  const slug = String(sender||'').replace(/[^A-Za-z가-힣0-9]/g,'').slice(0,16).toLowerCase() || 'desk';
  const domain = m==='KR' ? 'krx.local' : (m==='US' ? 'us-desk.local' : (m==='COIN' ? 'crypto-desk.local' : 'market.local'));
  // Pick a simple-looking handle from the sender
  const handle = /^[A-Za-z]/.test(sender||'') ? (sender.split(/[\s,(]/)[0]||'desk').toLowerCase() : 'desk';
  return `${handle}@${domain}`.replace(/[^a-z0-9@._-]/g,'').replace(/\.+/g,'.');
}
function outlookFlowText(flow){
  const n = Number(flow?.amount);
  const txt = Number.isFinite(n) ? `${n>=0?'+':''}${Math.round(n).toLocaleString('ko-KR')}억` : '—';
  return `${flow?.label || ''} ${txt}`.trim();
}
function outlookSubjectLine(card){
  if(!card) return '시세 업데이트';
  if(card._flows && card._flows.length){
    const top = card._flows.slice(0, 2).map(outlookFlowText).join(' · ');
    return `${card.key} — ${top}`;
  }
  if(card._momentum !== undefined && card._momentum !== null){
    const n = Number(card._momentum);
    const text = Number.isFinite(n) ? outlookFormatPct(n) : '확인 중';
    return `${card.key} · ${text}`;
  }
  const pct = Number(card.changePct);
  const pctText = Number.isFinite(pct) ? outlookFormatPct(pct) : '';
  const priceText = outlookFormatPrice(card);
  const name = card.key || card.code || '';
  if(/김프/.test(String(card.key||''))) return `${name} ${priceText}`;
  return `${name} · ${priceText}${pctText ? ' · '+pctText : ''}`;
}
function outlookPreviewLine(card){
  if(!card) return '';
  if(card._flows && card._flows.length){
    const rest = card._flows.slice(2).map(outlookFlowText).join(' / ');
    return rest ? `또한 ${rest}` : '오늘 외국인·기관·개인 매매 동향';
  }
  if(card._momentum !== undefined){
    return '최근 흐름 — 갭 변동률 요약';
  }
  const m = String(card.market||'').toUpperCase();
  const src = card.source ? `${card.source}` : '';
  const state = card.marketState ? ` · ${card.marketState}` : '';
  const sessionLabel = m === 'KR' ? '국장' : (m === 'US' ? '미장' : (m === 'COIN' ? '코인' : ''));
  const pct = Number(card.changePct);
  const trend = !Number.isFinite(pct) ? '시세 확인 중' :
    (pct > 1.5 ? '상승 흐름 강함' : pct > 0 ? '강보합' : pct > -1.5 ? '약보합' : '하락 압력');
  const left = sessionLabel ? sessionLabel : src;
  return `${left ? left+' · ' : ''}${trend}${state}`;
}
function outlookMailRow(card, opts={}){
  const key = String(card.key||'').replace(/"/g,'');
  const tone = outlookAvatarTone(card);
  const initials = outlookAvatarInitials(card);
  const sender = outlookSenderLabel(card);
  const subject = outlookSubjectLine(card);
  const preview = outlookPreviewLine(card);
  const time = outlookTimeLabel(card.asOf);
  const selectedCls = opts.selected ? ' is-selected' : '';
  // 수급/모멘텀 같이 price/changePct 가 무의미한 카드는 우측 가격 칼럼을 비우고
  // Σ 또는 변동률만 작게 표기.
  let priceText, pctText, dir;
  if(card._flows && card._flows.length){
    priceText = 'Σ';
    pctText = '수급';
    dir = 'flat';
  } else if(card._momentum !== undefined && card._momentum !== null){
    const n = Number(card._momentum);
    priceText = '';
    pctText = Number.isFinite(n) ? outlookFormatPct(n) : '—';
    dir = outlookChangeDir(n);
  } else {
    const pct = Number(card.changePct);
    dir = outlookChangeDir(pct);
    pctText = Number.isFinite(pct) ? outlookFormatPct(pct) : '—';
    priceText = outlookFormatPrice(card);
  }
  return `<div class="outlook-mail-row${selectedCls}${outlookUnreadCls('stock:'+key)}" data-outlook-key="${esc(key)}" role="option" aria-selected="${opts.selected?'true':'false'}">
    <span class="outlook-mail-avatar" data-tone="${tone}">${esc(initials)}</span>
    <span class="outlook-mail-sender">${esc(sender)}</span>
    <span class="outlook-mail-time">${esc(time)}</span>
    <span class="outlook-mail-subject">${esc(subject)}</span>
    <span class="outlook-mail-preview">${esc(preview)}</span>
    <span class="outlook-mail-price">${esc(priceText)}</span>
    <span class="outlook-mail-change" data-change="${dir}">${esc(pctText)}</span>
  </div>`;
}
function outlookFilterCards(cards, folder){
  if(!Array.isArray(cards)) return [];
  const watchSet = new Set((typeof wlLoad === 'function' ? wlLoad() : []).map((w)=>String(w.code||'').toUpperCase()));
  const holdings = (typeof holdingsLoad === 'function') ? holdingsLoad() : {};
  if(folder === 'flagged'){
    return cards.filter((c)=>{
      const code = String(c.code||c.key||'').toUpperCase();
      return c.isUser || watchSet.has(code);
    });
  }
  if(folder === 'notes'){
    return cards.filter((c)=>{
      const id = holdingId ? holdingId(c) : (c.code||c.key);
      return holdings && holdings[id];
    });
  }
  if(folder === 'archive'){
    return cards.filter((c)=>{
      const st = String(c.marketState||'').toUpperCase();
      return st.includes('AFTER') || st.includes('POST');
    });
  }
  if(folder === 'drafts'){
    return cards.filter((c)=>{
      const st = String(c.marketState||'').toUpperCase();
      return st.includes('PRE');
    });
  }
  if(folder === 'sent') return cards.slice(-6).reverse();
  // inbox default — everything
  return cards;
}
function renderOutlookFromSnapshot(snapshot, cards){
  if(!document.body.classList.contains('theme-outlook')) return;
  if(!Array.isArray(cards) || cards.length === 0) return;
  const list = document.getElementById('outlookMailList');
  if(!list) return;
  // 그룹 메일함이 선택돼 있으면 메일 리스트는 community 렌더가 소유한다.
  // 폴더 카운트만 새로 계산하고 리턴.
  const isCommunityView = outlookFolderFilter === 'community';
  const isNewsView = outlookFolderFilter === 'news';
  // Folder counts
  const setCount = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = String(v); };
  const watchSet = new Set((typeof wlLoad === 'function' ? wlLoad() : []).map((w)=>String(w.code||'').toUpperCase()));
  const holdings = (typeof holdingsLoad === 'function') ? holdingsLoad() : {};
  const drafts = cards.filter((c)=>String(c.marketState||'').toUpperCase().includes('PRE')).length;
  const archive = cards.filter((c)=>{
    const st = String(c.marketState||'').toUpperCase();
    return st.includes('AFTER') || st.includes('POST');
  }).length;
  const flagged = cards.filter((c)=>{
    const code = String(c.code||c.key||'').toUpperCase();
    return c.isUser || watchSet.has(code);
  }).length;
  const notesCount = cards.filter((c)=>{
    const id = holdingId ? holdingId(c) : (c.code||c.key);
    return holdings && holdings[id];
  }).length;
  setCount('outlookCountInbox', cards.length);
  setCount('outlookCountDrafts', drafts);
  setCount('outlookCountArchive', archive);
  setCount('outlookCountFlagged', flagged);
  setCount('outlookCountNotes', notesCount);
  setCount('outlookCountNews', outlookNewsItems().length);

  // community 보기 중이면 메일 리스트/읽기창은 community 렌더가 관리한다.
  if(isCommunityView || isNewsView) return;
  list.onclick = null;

  // Filter by current folder, then (받은 편지함만) 중요/기타 분리.
  const filtered = outlookFilterCards(cards, outlookFolderFilter);
  syncOutlookFocusedTabs();
  let visibleCards = filtered;
  if(outlookFocusedTabsVisible()){
    visibleCards = outlookFocusedTab === 'other'
      ? filtered.filter((c)=>!outlookCardIsFocused(c))
      : filtered.filter((c)=>outlookCardIsFocused(c));
  }
  if(!outlookSelectedKey || !visibleCards.some((c)=>String(c.key) === outlookSelectedKey)){
    outlookSelectedKey = visibleCards[0] ? String(visibleCards[0].key) : null;
  }
  // Group by today's date (just one section now — could extend later)
  const today = new Date(); const todayStr = `${today.getMonth()+1}월 ${today.getDate()}일`;
  let html = `<div class="outlook-mail-date">오늘 · ${todayStr}</div>`;
  if(visibleCards.length === 0){
    html += `<div class="outlook-mail-empty">${outlookFocusedTab === 'other' && outlookFocusedTabsVisible() ? '기타로 분류된 자동 요약 메일이 없습니다.' : '이 폴더에는 메일이 없습니다.'}</div>`;
  } else {
    html += visibleCards.map((c)=>outlookMailRow(c, {selected: String(c.key) === outlookSelectedKey})).join('');
  }
  list.innerHTML = html;
  applyOutlookSearchFilter();

  // Render reading pane for current selection
  const selected = visibleCards.find((c)=>String(c.key) === outlookSelectedKey) || visibleCards[0];
  if(selected){
    renderOutlookReadingPane(selected, snapshot);
  } else {
    renderOutlookReadingPane(null);
  }
}
function selectOutlookEmail(card){
  if(!card) return;
  outlookSelectedKey = String(card.key);
  document.querySelectorAll('.outlook-mail-row').forEach((r)=>{
    const match = r.dataset.outlookKey === outlookSelectedKey;
    r.classList.toggle('is-selected', match);
    r.setAttribute('aria-selected', match ? 'true' : 'false');
    if(match) outlookMarkRead('stock:'+outlookSelectedKey, r);
  });
  renderOutlookReadingPane(card, lastSnapshot);
  // Mobile: open reading overlay
  const pane = document.getElementById('outlookReadingPane');
  if(pane && window.matchMedia && window.matchMedia('(max-width: 760px)').matches){
    pane.classList.add('is-open');
  }
}
function outlookCloseReadingMobile(){
  document.getElementById('outlookReadingPane')?.classList.remove('is-open');
}
function outlookNewsForCard(card, snapshot){
  if(!card) return [];
  const m = String(card.market||'').toUpperCase();
  const bag = snapshot?.news || {};
  const krList = Array.isArray(bag.KR) ? bag.KR : [];
  const usList = Array.isArray(bag.US) ? bag.US : [];
  const coinList = Array.isArray(bag.COIN) ? bag.COIN : [];
  const accumulated = Array.isArray(newsAccumulated) ? newsAccumulated : [];
  const accumulatedForMarket = accumulated.filter((item)=>(
    m === 'KR' ? item.market === 'KR' :
    m === 'US' ? item.market === 'US' :
    m === 'COIN' ? item.market === 'COIN' :
    item.market !== 'COIN'
  ));
  const snapshotForMarket = m === 'KR'
    ? krList
    : (m === 'US' ? usList : (m === 'COIN' ? coinList : [...krList, ...usList]));
  const seen = new Set();
  return [...accumulatedForMarket, ...snapshotForMarket]
    .filter((item)=>{
      if(!item || !(item.title || item.headline)) return false;
      const key = newsKey({ ...item, market:item.market || m }) || `${item.market || m}|${item.title || item.headline}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a,b)=>newsTimeMs(b)-newsTimeMs(a))
    .slice(0,6);
}
// 읽기창 인라인 스파크라인. Excel 모드의 hover 미니차트와 동일한 /api/chart 캐시를
// 재사용하므로 추가 호출 비용이 없다(같은 토큰이면 캐시 히트).
let outlookReadingChartToken = '';
async function loadOutlookReadingChart(token, card){
  if(!token || typeof renderMiniChartSvg !== 'function') return;
  if(typeof featureEnabled === 'function' && !featureEnabled('chart')) return;
  outlookReadingChartToken = token;
  const paint = (data)=>{
    const host = document.getElementById('outlookReadingChart');
    if(!host || host.dataset.token !== token || outlookReadingChartToken !== token) return;
    const change = (typeof miniChartDisplayChange === 'function') ? miniChartDisplayChange(card, data) : Number(data?.changePct);
    const baseline = (typeof miniChartBaseline === 'function') ? miniChartBaseline(card, data, change) : null;
    const src = [data.range, (typeof fmtDt === 'function') ? fmtDt(data.asOf) : ''].filter(Boolean).join(' · ');
    host.innerHTML = `<div class="outlook-reading-chart-head"><span>최근 추이</span>${src ? `<span>${esc(src)}</span>` : ''}</div>${renderMiniChartSvg(data, baseline, change)}`;
    host.hidden = false;
  };
  const cached = (typeof miniChartCache !== 'undefined') ? miniChartCache.get(token) : null;
  if(cached && Date.now() - cached.at < MINI_CHART_CACHE_TTL_MS){ paint(cached.data); return; }
  try{
    let pending = miniChartInflight.get(token);
    if(!pending){
      pending = fetchJsonClient('/api/chart?token=' + encodeURIComponent(token), 5000)
        .finally(()=>{ miniChartInflight.delete(token); });
      miniChartInflight.set(token, pending);
    }
    const data = await pending;
    if(!data?.ok) return;
    miniChartCache.set(token, {at:Date.now(), data});
    if(typeof pruneMiniChartCache === 'function') pruneMiniChartCache();
    paint(data);
  }catch(_){}
}
function renderOutlookReadingPane(card, snapshot){
  const pane = document.getElementById('outlookReadingPane');
  if(!pane) return;
  if(!card){
    pane.innerHTML = '';
    return;
  }
  const tone = outlookAvatarTone(card);
  const initials = outlookAvatarInitials(card);
  const sender = outlookSenderLabel(card);
  const pct = Number(card.changePct);
  const dir = outlookChangeDir(pct);
  const pctText = Number.isFinite(pct) ? outlookFormatPct(pct) : '—';
  const priceText = outlookFormatPrice(card);
  const time = outlookTimeLabel(card.asOf);
  const fullTs = card.asOf ? new Date(card.asOf).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
  const isFlow = !!(card._flows && card._flows.length);
  const isMomentum = card._momentum !== undefined && card._momentum !== null;
  const subject = isFlow
    ? `[수급] ${card.key||''} · 오늘 매매 동향`
    : (isMomentum
      ? `[변동] ${card.key||''} · ${Number.isFinite(Number(card._momentum)) ? outlookFormatPct(Number(card._momentum)) : ''}`
      : `[시세] ${card.key||card.code||''} · ${priceText}${Number.isFinite(pct) ? ' ('+pctText+')' : ''}`);
  const senderEmail = outlookSenderEmail(card, sender);
  const news = outlookNewsForCard(card, snapshot);
  const m = String(card.market||'').toUpperCase();
  const ccLabel = m === 'KR' ? '국내 시장 구독자;' : (m === 'US' ? '미장 구독자;' : (m === 'COIN' ? '코인 구독자;' : '시장 구독자;'));
  const session = String(snapshot?.sessionLabel || '').trim();
  const stateLabel = card.marketState ? ({DAY:'데이마켓', PRE:'프리장', REGULAR:'정규장', POST:'애프터마켓', CLOSED:'장 마감'}[String(card.marketState).toUpperCase()] || card.marketState) : '';
  let cards;
  if(isFlow){
    cards = (card._flows || []).slice(0, 6).map((f)=>{
      const n = Number(f.amount);
      const formatted = Number.isFinite(n) ? `${n>=0?'+':''}${Math.round(n).toLocaleString('ko-KR')}억` : '—';
      const direction = !Number.isFinite(n) || Math.abs(n)<1 ? 'flat' : (n>0 ? 'up' : 'down');
      return { label:f.label || '주체', value:formatted, sub:'', dir:direction };
    });
  } else if(isMomentum){
    const n = Number(card._momentum);
    cards = [
      {label:'변동률', value: Number.isFinite(n) ? outlookFormatPct(n) : '—', sub:'', dir: outlookChangeDir(n)},
      {label:'시장', value:m||'—', sub: stateLabel || session || ''},
      {label:'데이터 갱신', value:time||'—', sub:card.source || '실시간'},
    ];
  } else {
    cards = [
      {label:'현재가', value:priceText, sub:Number.isFinite(pct)?pctText:'', dir},
      {label:'시장', value:m||'—', sub: stateLabel || session || ''},
      {label:'데이터 갱신', value:time||'—', sub:card.source || '실시간'},
    ];
    // 사용자가 보유한 종목이면 평단·수익률 카드를 추가. (Excel 모드의 "내 보유 합계"
    // 와 동일한 정보 — 회사에서 메일 보듯 즉시 확인 가능)
    try{
      const lots = (typeof holdingLotsFor === 'function') ? holdingLotsFor(card) : [];
      if(Array.isArray(lots) && lots.length){
        const agg = (typeof aggregateHoldingLots === 'function') ? aggregateHoldingLots(lots) : null;
        const calc = (agg && typeof holdingCalc === 'function') ? holdingCalc(card, agg) : null;
        if(calc && Number.isFinite(Number(calc.pct))){
          const pnlN = Number(calc.pnl);
          const pnlDir = pnlN > 0 ? 'up' : (pnlN < 0 ? 'down' : 'flat');
          const fmtMoney = (v) => {
            const n = Number(v);
            if(!Number.isFinite(n)) return '—';
            const isUsd = String(card.market||'').toUpperCase()==='US' || /\(USD\)|\bUSD\b/.test(String(card.key||''));
            return isUsd
              ? `$${n.toLocaleString('en-US',{maximumFractionDigits:2})}`
              : `₩${Math.round(n).toLocaleString('ko-KR')}`;
          };
          const pctValue = Number(calc.pct);
          const pctStr = `${pctValue>=0?'+':''}${pctValue.toFixed(2)}%`;
          const pnlStr = `${pnlN>=0?'+':''}${fmtMoney(pnlN).replace(/^[+-]?\$|^[+-]?₩/, m=>m)}`;
          cards.push({label:'내 평단', value:fmtMoney(calc.avg), sub:`${agg.qty}주`, dir:'flat'});
          cards.push({label:'손익', value:pnlStr, sub:pctStr, dir:pnlDir});
        }
      }
    }catch(_){}
  }
  const cardsHtml = cards.map((c)=>`<div class="outlook-reading-card"><span class="outlook-reading-card-label">${esc(c.label)}</span><span class="outlook-reading-card-value" data-change="${c.dir||'flat'}">${esc(c.value)}</span>${c.sub ? `<span class="outlook-reading-card-sub" data-change="${c.dir||'flat'}">${esc(c.sub)}</span>` : ''}</div>`).join('');
  // 뉴스를 메일 본문 안의 자연스러운 bullet 리스트로 (5개 까지)
  const newsBullets = news.length ? news.slice(0, 5).map((n)=>{
    const nt = n?.publishedAt ? outlookTimeLabel(n.publishedAt) : '';
    const title = String(n.title||'').trim();
    const safeUrl = n.url ? esc(n.url) : '';
    const inner = safeUrl
      ? `<a href="${safeUrl}" target="_blank" rel="noopener">${esc(title)}</a>`
      : esc(title);
    return `<li><span class="bullet-title">${inner}</span>${n.source?` <span class="bullet-meta">— ${esc(n.source)}${nt?` · ${esc(nt)}`:''}</span>`:''}</li>`;
  }).join('') : '';
  // 일반 시세 카드만 스파크라인 — 수급/모멘텀 카드는 토큰이 없다.
  let chartToken = '';
  if(!isFlow && !isMomentum && typeof quoteTokenForCard === 'function'){
    try{ chartToken = quoteTokenForCard(card) || ''; }catch(_){ chartToken = ''; }
  }
  const chartHost = chartToken
    ? `<div class="outlook-reading-chart" id="outlookReadingChart" data-token="${esc(chartToken)}" hidden></div>`
    : '';
  const attachmentName = `${(card.key||card.code||'시세').replace(/\s+/g,'_')}_${new Date().getFullYear()}.xlsx`;
  const backBtn = `<button type="button" class="outlook-reading-back" data-outlook-action="reading-back" aria-label="목록으로 돌아가기"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>받은 편지함</button>`;
  const stockName = card.key||card.code||'-';
  const sessionLine = session
    ? `현재 세션은 <strong>${esc(session)}</strong>이며, 가격은 <em>${esc(card.source||'실시간 피드')}</em> 기준으로 받았습니다.`
    : '';
  pane.innerHTML = `
    ${backBtn}
    <article class="outlook-reading-message">
      <h1 class="outlook-reading-subject">${esc(subject)}</h1>
      <span class="outlook-reading-tag">${esc(sender)} · ${esc(fullTs || '실시간')}</span>
      <header class="outlook-reading-header">
        <span class="outlook-reading-avatar" data-tone="${tone}">${esc(initials)}</span>
        <div class="outlook-reading-from-block">
          <p class="outlook-reading-from">${esc(sender)} &lt;${esc(senderEmail)}&gt;</p>
          <dl class="outlook-reading-recipients">
            <dt>받는 사람</dt><dd>월급루팡 본인; 자동 구독</dd>
            <dt>참조</dt><dd>${esc(ccLabel)} 사내 메일</dd>
          </dl>
        </div>
        <div class="outlook-reading-meta-right">
          <div class="actions" aria-hidden="true">
            <button type="button" aria-label="회신" data-outlook-action="chat"><svg viewBox="0 0 24 24"><path d="m10 8-5 5 5 5"/><path d="M5 13h9a6 6 0 0 1 6 6"/></svg></button>
            <button type="button" aria-label="전체 회신"><svg viewBox="0 0 24 24"><path d="m9 8-5 5 5 5"/><path d="M14 8l-5 5 5 5"/><path d="M9 13h5a6 6 0 0 1 6 6"/></svg></button>
            <button type="button" aria-label="전달"><svg viewBox="0 0 24 24"><path d="m14 8 5 5-5 5"/><path d="M19 13h-9a6 6 0 0 0-6 6"/></svg></button>
          </div>
          <span>${esc(fullTs || time)}</span>
        </div>
      </header>
      <div class="outlook-reading-body">
        <p>안녕하세요, ${esc(sender)} 입니다.</p>
        <p>${isFlow ? `오늘 <strong>${esc(stockName)}</strong> 매매 동향을 주체별로 정리해 공유드립니다.` : (isMomentum ? `<strong>${esc(stockName)}</strong> 흐름을 짧게 정리해 드립니다.` : `<strong>${esc(stockName)}</strong>의 최신 시세를 정리해 공유드립니다. 아래 카드는 오늘 기준 핵심 지표입니다.`)}</p>
        <div class="outlook-reading-cards">${cardsHtml}</div>
        ${chartHost}
        ${newsBullets ? `
          <p>관련해서 시장에서 주목받는 뉴스도 함께 정리했습니다.</p>
          <ul class="outlook-reading-news-bullets">${newsBullets}</ul>
        ` : `
          <p>관련해서 시장에서 주목할 만한 새 뉴스는 아직 들어오지 않았습니다. 새 뉴스가 도착하면 다음 메일로 다시 안내드리겠습니다.</p>
        `}
        ${sessionLine ? `<p>${sessionLine} 자세한 차트와 보유 손익은 첨부 스프레드시트에서 확인하실 수 있습니다.</p>` : ''}
        <div class="outlook-reading-attachment" role="group" aria-label="첨부파일">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5"/></svg>
          <span>${esc(attachmentName)}<small>스프레드시트 · 자동 갱신</small></span>
        </div>
        <p>추가 문의가 있으시면 이 메일에 회신해 주세요. 좋은 하루 보내세요.</p>
        <p class="outlook-reading-signature">감사합니다.<br>${esc(sender)} 드림</p>
        <div class="outlook-reading-actions-row">
          <button type="button" data-outlook-action="refresh"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5v6h-6M4 19v-6h6M5.5 10A7.5 7.5 0 0 1 18 7M18.5 14A7.5 7.5 0 0 1 6 17"/></svg>시세 새로 고침</button>
          <button type="button" data-outlook-action="chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5a7 7 0 0 1-7 4.5H9l-5 3 1.6-4.6A7.5 7.5 0 1 1 20 14.5z"/></svg>실시간 채팅</button>
          <a href="https://t.me/kospigazua" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 7-4M8 13l7 4"/></svg>텔레그램 시세알림</a>
        </div>
      </div>
    </article>
  `;
  // Wire mobile back button
  pane.querySelector('[data-outlook-action="reading-back"]')?.addEventListener('click', outlookCloseReadingMobile);
  if(chartToken) loadOutlookReadingChart(chartToken, card);
}
/* === end Outlook v3 renderers ================================================== */
