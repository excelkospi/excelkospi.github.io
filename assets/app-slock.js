// Slock disguise mode. This is a dedicated collaboration-tool shell that reuses
// existing snapshot/news/community state without adding polling or new APIs.

let slockModeActive = false;
let slockListenersBound = false;
let slockActiveChannel = 'home';
let slockSelectedMessageKey = '';
let slockCommunityPosts = [];
let slockChatMessages = [];
let slockChatLoadPromise = null;
const slockCommunityCache = {};

const SLOCK_CHANNELS = {
  home: { title:'#korean-daily', hint:'홈 · 오늘 들어온 업무 업데이트를 한 화면에 모았습니다' },
  activity: { title:'내 활동', hint:'멘션 · 변동폭이 큰 항목과 새 알림을 우선 확인합니다' },
  dms: { title:'DM', hint:'개별 대화 · 보유/관심 항목만 조용히 봅니다' },
  later: { title:'나중에', hint:'저장됨 · 나중에 볼 항목과 보유 메모를 모았습니다' },
  files: { title:'파일', hint:'자료함 · 외부 뉴스와 링크형 업데이트를 모았습니다' },
  more: { title:'더 보기', hint:'도구 · 공지, 설정, 시트 보기로 이동합니다' },
  chat: { title:'#라운지', hint:'실시간 채팅 · 기존 채팅방을 Slock 채널로 표시합니다', chat:true },
  kr: { title:'#korean-monitoring', hint:'국내 업무 · KR 항목 동기화 현황' },
  us: { title:'#global-briefing', hint:'해외 현황 · Global 항목 브리핑' },
  coin: { title:'#digital-assets', hint:'디지털 자산 · reference 항목만 표시합니다' },
  holdings: { title:'#ledger-review', hint:'보유 항목 · 내 ledger 기준 평가 요약' },
  risk: { title:'#risk-review', hint:'변동 감시 · 기준폭을 벗어난 항목 우선' },
  news: { title:'#vendor-feed', hint:'외부 소식 · vendor feed 업데이트' },
  'community-kr': { title:'#korean-desk', hint:'국내 메모 · 공개 게시판을 업무 메모처럼 표시합니다', community:'kr' },
  'community-us': { title:'#global-desk', hint:'해외 메모 · 글로벌 데스크 코멘트', community:'us' },
  'community-coin': { title:'#digital-desk', hint:'자산 메모 · digital asset 데스크', community:'coin' },
  'community-ops': { title:'#ops-help', hint:'운영 문의 · 서비스 의견과 공지', community:'ops' },
};

function isSlockMobile(){
  return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
}

function setSlockMobileNavOpen(open){
  const next = !!open && isSlockMobile() && document.body.classList.contains('theme-slock');
  document.body.classList.toggle('slock-nav-open', next);
}

function slockPriceText(card){
  try{
    if(typeof outlookFormatPrice === 'function') return outlookFormatPrice(card);
  }catch{}
  const n = Number(card?.price);
  if(!Number.isFinite(n)) return '확인 중';
  return n.toLocaleString('ko-KR', { maximumFractionDigits:n >= 1000 ? 0 : 2 });
}

function slockPctText(value){
  try{
    if(typeof outlookFormatPct === 'function') return outlookFormatPct(value);
  }catch{}
  const n = Number(value);
  if(!Number.isFinite(n)) return '±0.00%';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function slockChangeDir(value){
  const n = Number(value);
  if(!Number.isFinite(n) || Math.abs(n) < 0.005) return 'flat';
  return n > 0 ? 'up' : 'down';
}

function slockTimeLabel(value){
  try{
    if(typeof outlookTimeLabel === 'function') return outlookTimeLabel(value);
  }catch{}
  if(!value) return '방금';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return '방금';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function slockInitials(text, fallback='MO'){
  const value = String(text || '').trim();
  if(!value) return fallback;
  const latin = value.match(/[A-Za-z0-9]+/g);
  if(latin && latin.length){
    return latin.slice(0, 2).map((part)=>part[0]).join('').toUpperCase();
  }
  return value.replace(/\s+/g, '').slice(0, 2) || fallback;
}

function slockWorkItemName(card){
  const key = String(card?.key || card?.code || '').trim();
  const map = {
    '삼성전자':'Samsung Electronics',
    'SK하이닉스':'SK Hynix',
    '현대자동차':'Hyundai Motor',
    'LG전자':'LG Electronics',
    '코스피':'KR composite index',
    '코스닥':'KR growth index',
    '코스피야선':'KR overnight reference',
    '나스닥':'Nasdaq reference',
    '다우':'Dow reference',
    'S&P500':'S&P reference',
    '원/달러':'FX reference rate',
    '김프(%)':'regional premium spread',
    'KRW 금현물':'metal reference',
    'WTI 원유':'energy reference',
    'BTC':'BTC reference',
    'BTC(USD)':'BTC reference',
  };
  return map[key] || key || '업무 항목';
}

function slockSenderForCard(card){
  const market = String(card?.market || '').toUpperCase();
  const pct = Number(card?.changePct);
  if(slockActiveChannel === 'risk' || Math.abs(pct) >= 2.5) return { name:'리스크 모니터', initials:'RM', tone:'risk' };
  if(slockActiveChannel === 'holdings' || slockActiveChannel === 'later') return { name:'Ledger Sync', initials:'LS', tone:'ledger' };
  if(market === 'KR') return { name:'코리안 데스크', initials:'KD', tone:'kr' };
  if(market === 'US') return { name:'글로벌 브리핑', initials:'GB', tone:'us' };
  if(market === 'COIN') return { name:'디지털 에셋', initials:'DA', tone:'coin' };
  return { name:'마켓 오퍼레이션', initials:'MO', tone:'flow' };
}

function slockCardsForChannel(channel){
  const cards = (Array.isArray(lastRenderedCards) ? lastRenderedCards : []).filter((card)=>card && !card._noteRow);
  if(channel === 'kr') return cards.filter((card)=>String(card.market || '').toUpperCase() === 'KR');
  if(channel === 'us') return cards.filter((card)=>String(card.market || '').toUpperCase() === 'US');
  if(channel === 'coin') return cards.filter((card)=>String(card.market || '').toUpperCase() === 'COIN');
  if(channel === 'risk') return cards.filter((card)=>Math.abs(Number(card.changePct) || 0) >= 1.5).sort((a,b)=>Math.abs(Number(b.changePct)||0)-Math.abs(Number(a.changePct)||0));
  if(channel === 'holdings' || channel === 'later' || channel === 'dms'){
    try{
      return cards.filter((card)=>Array.isArray(holdingLotsFor(card)) && holdingLotsFor(card).length);
    }catch{ return cards.filter((card)=>card.isUser); }
  }
  if(channel === 'activity') return cards.filter((card)=>Math.abs(Number(card.changePct) || 0) >= 1).slice(0, 18);
  return cards.slice(0, 28);
}

function slockNewsItems(){
  const source = Array.isArray(newsAccumulated) && newsAccumulated.length
    ? newsAccumulated
    : ['KR','US','COIN'].flatMap((market)=>(
      Array.isArray(lastSnapshot?.news?.[market])
        ? lastSnapshot.news[market].map((item)=>({ ...item, market }))
        : []
    ));
  return source.filter((item)=>item && (item.title || item.headline)).slice(0, 40);
}

function slockMessageForCard(card, index){
  const sender = slockSenderForCard(card);
  const name = slockWorkItemName(card);
  const pct = Number(card.changePct);
  const pctText = Number.isFinite(pct) ? slockPctText(pct) : '변동 확인 중';
  const price = slockPriceText(card);
  const dir = slockChangeDir(pct);
  const time = slockTimeLabel(card.asOf);
  const key = `card:${card.key || card.code || index}`;
  const selected = slockSelectedMessageKey === key;
  let body = `${name} 항목 기준값이 ${price}로 업데이트됐습니다. 전일 대비 ${pctText}입니다.`;
  if(sender.tone === 'risk') body = `${name} 항목이 기준 변동폭을 벗어났습니다. 현재 ${pctText}라 스레드에 확인 맥락을 남겼습니다.`;
  if(sender.tone === 'ledger') body = `${name} 보유 항목 ledger가 갱신되었습니다. 현재 기준 ${price}, 변동률 ${pctText}입니다.`;
  const session = card.marketState ? `세션 ${card.marketState}` : (lastSnapshot?.sessionLabel || 'sync');
  return `<article class="slock-message${selected ? ' selected' : ''}" data-slock-message-key="${esc(key)}" data-slock-card-key="${esc(String(card.key || card.code || ''))}" data-slock-kind="card">
    <span class="slock-avatar" data-tone="${esc(sender.tone)}">${esc(sender.initials || slockInitials(sender.name))}</span>
    <div class="slock-message-main">
      <header><strong>${esc(sender.name)}</strong><time>${esc(time)}</time><span class="slock-bot">앱</span></header>
      <p>${esc(body)}</p>
      <div class="slock-message-meta">
        <span data-change="${dir}">${esc(pctText)}</span>
        <span>${esc(session)}</span>
        <span>${esc(card.source || 'sheet sync')}</span>
      </div>
      <div class="slock-reactions" aria-hidden="true"><span>답글 2</span><span>고정됨</span><span>스레드 보기</span></div>
    </div>
  </article>`;
}

function slockMessageForNews(item, index){
  const title = String(item.title || item.headline || '뉴스').trim();
  const source = item.source || item.publisher || 'Vendor Feed';
  const time = slockTimeLabel(item.publishedAt || item.asOf);
  const market = String(item.market || '').toUpperCase() || 'ALL';
  const key = `news:${typeof newsKey === 'function' ? newsKey(item) : index}`;
  const selected = slockSelectedMessageKey === key;
  return `<article class="slock-message${selected ? ' selected' : ''}" data-slock-message-key="${esc(key)}" data-slock-news-index="${index}" data-slock-kind="news">
    <span class="slock-avatar" data-tone="news">VF</span>
    <div class="slock-message-main">
      <header><strong>벤더 피드</strong><time>${esc(time)}</time><span class="slock-bot">피드</span></header>
      <p>${esc(source)}에서 새 외부 업데이트가 들어왔습니다. ${esc(title)}</p>
      <div class="slock-message-meta"><span>${esc(market)}</span><span>자료함에 저장됨</span></div>
      <div class="slock-reactions" aria-hidden="true"><span>확인됨</span><span>저장됨</span><span>원문 확인</span></div>
    </div>
  </article>`;
}

function slockMessageForCommunity(post, index){
  const nick = String(post?.nickname || '익명').slice(0, 18);
  const body = String(post?.body || '').replace(/\s+/g, ' ').trim();
  const time = slockTimeLabel(post?.created_at);
  const comments = Array.isArray(post?.comments) ? post.comments.length : 0;
  const key = `post:${post?.id || index}`;
  const selected = slockSelectedMessageKey === key;
  return `<article class="slock-message${selected ? ' selected' : ''}" data-slock-message-key="${esc(key)}" data-slock-post-id="${esc(post?.id || '')}" data-slock-kind="post">
    <span class="slock-avatar" data-tone="post">${esc(slockInitials(nick, 'DM'))}</span>
    <div class="slock-message-main">
      <header><strong>${esc(nick)}</strong><time>${esc(time)}</time></header>
      <p>${esc(body || '빈 메모')}</p>
      <div class="slock-message-meta"><span>댓글 ${comments}</span><span>추천 ${Math.max(0, Number(post?.recommend_count || 0) || 0)}</span></div>
      <div class="slock-reactions" aria-hidden="true"><span>읽음</span><span>답글 ${comments}</span><span>업무 메모</span></div>
    </div>
  </article>`;
}

function slockChatBodyHtml(message){
  if(message?.moderated) return esc(message.moderationText || '삭제된 메시지입니다');
  const body = String(message?.body || '').trim();
  try{
    if(typeof renderTextWithImagePreviews === 'function'){
      const options = typeof chatImagePreviewOptions === 'function'
        ? chatImagePreviewOptions(message, { linkUrls:true, linkPolicy:typeof chatLinkPolicy === 'function' ? chatLinkPolicy() : null })
        : { linkUrls:true };
      return renderTextWithImagePreviews(body, options);
    }
  }catch{}
  return esc(body || '빈 메시지');
}

function slockMessageForChat(message, index){
  const nick = String(message?.nickname || '월급루팡').slice(0, 18);
  const time = slockTimeLabel(message?.created_at);
  const key = `chat:${message?.id || index}`;
  const selected = slockSelectedMessageKey === key;
  const recommend = Math.max(0, Number(message?.recommend_count || 0) || 0);
  const report = Math.max(0, Number(message?.report_count || 0) || 0);
  const isOwn = (()=>{ try{ return typeof chatUserId === 'function' && message?.user_id === chatUserId(); }catch{ return false; } })();
  return `<article class="slock-message slock-chat-message${selected ? ' selected' : ''}${isOwn ? ' own' : ''}${message?.moderated ? ' moderated' : ''}" data-slock-message-key="${esc(key)}" data-slock-chat-id="${esc(message?.id || '')}" data-slock-kind="chat">
    <span class="slock-avatar" data-tone="chat">${esc(slockInitials(nick, 'DM'))}</span>
    <div class="slock-message-main">
      <header><strong>${esc(nick)}</strong><time>${esc(time)}</time></header>
      <div class="slock-chat-text">${slockChatBodyHtml(message)}</div>
      <div class="slock-message-meta"><span>추천 ${recommend}</span>${report ? `<span>신고 ${report}</span>` : ''}</div>
      <div class="slock-reactions" aria-hidden="true"><span>답글</span><span>스레드 보기</span></div>
    </div>
  </article>`;
}

function slockFindCardByMessageKey(key){
  if(!key || !key.startsWith('card:')) return null;
  const needle = key.slice(5);
  return (Array.isArray(lastRenderedCards) ? lastRenderedCards : []).find((card)=>String(card?.key || card?.code || '') === needle) || null;
}

function slockRenderThreadForCard(card){
  const pane = document.getElementById('slockThreadPane');
  if(!pane || !card) return;
  const name = slockWorkItemName(card);
  const pct = Number(card.changePct);
  const dir = slockChangeDir(pct);
  const news = typeof outlookNewsForCard === 'function' ? outlookNewsForCard(card, lastSnapshot).slice(0, 4) : [];
  let holdingHtml = '';
  try{
    const lots = holdingLotsFor(card);
    if(Array.isArray(lots) && lots.length && typeof aggregateHoldingLots === 'function' && typeof holdingCalc === 'function'){
      const agg = aggregateHoldingLots(lots);
      const calc = holdingCalc(card, agg);
      if(calc){
        holdingHtml = `<div class="slock-thread-card"><span>Ledger</span><strong>${esc(`${Number(calc.pct) >= 0 ? '+' : ''}${Number(calc.pct).toFixed(2)}%`)}</strong><em>${esc(String(agg.qty || ''))} units tracked</em></div>`;
      }
    }
  }catch{}
  const newsHtml = news.length ? `<div class="slock-thread-news"><strong>관련 업데이트</strong>${news.map((item)=>`<a href="${esc(item.url || '#')}" target="_blank" rel="noopener">${esc(item.title || item.headline || '업데이트')}<span>${esc(item.source || '')}</span></a>`).join('')}</div>` : '';
  pane.innerHTML = `
    <header class="slock-thread-head"><strong>스레드</strong><button type="button" data-slock-thread-close aria-label="스레드 닫기">×</button></header>
    <section class="slock-thread-body">
      <span class="slock-thread-kicker">고정된 맥락 · ${esc(card.market || 'sync')}</span>
      <h2>${esc(name)}</h2>
      <div class="slock-thread-grid">
        <div class="slock-thread-card"><span>현재 기준</span><strong>${esc(slockPriceText(card))}</strong><em>${esc(card.source || 'sheet sync')}</em></div>
        <div class="slock-thread-card"><span>변동</span><strong data-change="${dir}">${esc(Number.isFinite(pct) ? slockPctText(pct) : '확인 중')}</strong><em>${esc(slockTimeLabel(card.asOf))}</em></div>
        ${holdingHtml}
      </div>
      <p class="slock-thread-note">Slock 전용 표시만 바뀌며, 실제 데이터는 기존 Excel 시트와 같은 snapshot을 사용합니다.</p>
      ${newsHtml}
    </section>`;
  pane.querySelector('[data-slock-thread-close]')?.addEventListener('click', ()=>{
    pane.classList.remove('is-open');
  });
}

function slockRenderThreadForNews(item){
  const pane = document.getElementById('slockThreadPane');
  if(!pane || !item) return;
  pane.innerHTML = `
    <header class="slock-thread-head"><strong>스레드</strong><button type="button" data-slock-thread-close aria-label="스레드 닫기">×</button></header>
    <section class="slock-thread-body">
      <span class="slock-thread-kicker">벤더 피드 · ${esc(item.market || 'ALL')}</span>
      <h2>${esc(item.title || item.headline || '외부 업데이트')}</h2>
      <p>${esc(item.summary || item.desc || item.description || '요약이 없습니다.')}</p>
      ${item.url ? `<a class="slock-thread-link" href="${esc(item.url)}" target="_blank" rel="noopener">원문 열기</a>` : ''}
    </section>`;
  pane.querySelector('[data-slock-thread-close]')?.addEventListener('click', ()=>pane.classList.remove('is-open'));
}

function slockRenderThreadForPost(post){
  const pane = document.getElementById('slockThreadPane');
  if(!pane || !post) return;
  const comments = Array.isArray(post.comments) ? post.comments : [];
  pane.innerHTML = `
    <header class="slock-thread-head"><strong>스레드</strong><button type="button" data-slock-thread-close aria-label="스레드 닫기">×</button></header>
    <section class="slock-thread-body">
      <span class="slock-thread-kicker">업무 메모 · ${esc(SLOCK_CHANNELS[slockActiveChannel]?.title || '')}</span>
      <h2>${esc(post.nickname || '익명')}</h2>
      <p>${esc(post.body || '')}</p>
      <div class="slock-thread-news"><strong>답글</strong>${comments.length ? comments.slice(0, 6).map((c)=>`<p><b>${esc(c.nickname || '익명')}</b> ${esc(c.body || '')}</p>`).join('') : '<p>아직 회신이 없습니다.</p>'}</div>
    </section>`;
  pane.querySelector('[data-slock-thread-close]')?.addEventListener('click', ()=>pane.classList.remove('is-open'));
}

function slockRenderThreadForChat(message){
  const pane = document.getElementById('slockThreadPane');
  if(!pane || !message) return;
  const nick = String(message.nickname || '월급루팡').slice(0, 18);
  const recommend = Math.max(0, Number(message.recommend_count || 0) || 0);
  const report = Math.max(0, Number(message.report_count || 0) || 0);
  pane.innerHTML = `
    <header class="slock-thread-head"><strong>스레드</strong><button type="button" data-slock-thread-close aria-label="스레드 닫기">×</button></header>
    <section class="slock-thread-body">
      <span class="slock-thread-kicker">#라운지 · ${esc(slockTimeLabel(message.created_at))}</span>
      <h2>${esc(nick)}</h2>
      <p>${slockChatBodyHtml(message)}</p>
      <div class="slock-thread-grid">
        <div class="slock-thread-card"><span>추천</span><strong>${recommend}</strong><em>채팅 반응</em></div>
        <div class="slock-thread-card"><span>신고</span><strong>${report}</strong><em>운영 확인</em></div>
      </div>
      <p class="slock-thread-note">기존 실시간 채팅방을 Slock 채널 안에 표시한 화면입니다.</p>
    </section>`;
  pane.querySelector('[data-slock-thread-close]')?.addEventListener('click', ()=>pane.classList.remove('is-open'));
}

async function slockLoadCommunity(channel){
  const community = SLOCK_CHANNELS[channel]?.community;
  if(!community) return [];
  if(slockCommunityCache[community]?.loaded) return slockCommunityCache[community].posts || [];
  const list = document.getElementById('slockMessageList');
  if(list) list.innerHTML = '<div class="slock-empty">업무 메모를 불러오는 중...</div>';
  try{
    const data = await fetchJsonClient(`/api/community?channel=${encodeURIComponent(community)}`, 8000);
    const posts = Array.isArray(data?.posts) ? data.posts.filter((p)=>p && !p.hidden) : [];
    slockCommunityCache[community] = { loaded:true, posts, at:Date.now() };
    return posts;
  }catch(e){
    debugWarn('slock community load failed', e);
    return [];
  }
}

function slockSyncComposer(){
  const form = document.getElementById('slockComposer');
  const input = document.getElementById('slockComposerInput');
  const send = document.getElementById('slockSendButton');
  const attach = document.getElementById('slockAttachButton');
  const meta = SLOCK_CHANNELS[slockActiveChannel] || SLOCK_CHANNELS.home;
  const isChat = !!meta.chat;
  if(form) form.classList.toggle('is-chat', isChat);
  if(input){
    input.readOnly = !isChat;
    input.value = '';
    input.placeholder = isChat ? '#라운지에 메시지 보내기' : `${meta.title}은 읽기 전용 채널입니다`;
    if(!isChat) input.value = '업무 업데이트는 기존 데이터에서 자동으로 정리됩니다';
  }
  if(send) send.disabled = !isChat;
  if(attach) attach.disabled = true;
}

function slockReadChatMessages(){
  try{
    if(Array.isArray(chatMessages)) return chatMessages.filter((message)=>message && !message.deleted_at).slice(-60);
  }catch{}
  return [];
}

async function slockLoadChatMessages(){
  if(slockChatLoadPromise) return slockChatLoadPromise;
  slockChatLoadPromise = (async()=>{
    try{
      if(typeof primeChatMessagesFromCache === 'function') primeChatMessagesFromCache();
      if(typeof loadChatMessages === 'function') await loadChatMessages({ markSeen:false });
    }catch(e){
      debugWarn('slock chat load failed', e);
    }finally{
      slockChatMessages = slockReadChatMessages();
      slockChatLoadPromise = null;
    }
    return slockChatMessages;
  })();
  return slockChatLoadPromise;
}

function slockRenderChatMessagesFromState(){
  if(slockActiveChannel !== 'chat') return false;
  const list = document.getElementById('slockMessageList');
  if(!list) return false;
  slockChatMessages = slockReadChatMessages();
  list.innerHTML = slockChatMessages.length
    ? slockChatMessages.map(slockMessageForChat).join('')
    : '<div class="slock-empty">아직 채팅이 없습니다. 아래 입력창에서 #라운지에 첫 메시지를 보낼 수 있습니다.</div>';
  const selected = list.querySelector(`[data-slock-message-key="${CSS.escape(slockSelectedMessageKey || '')}"]`) || list.querySelector('.slock-message');
  if(selected){
    selected.classList.add('selected');
    slockOpenMessage(selected, { openMobile:false });
  }
  return true;
}

function refreshSlockChatChannelFromChat(){
  if(!document.body.classList.contains('theme-slock')) return;
  if(slockActiveChannel !== 'chat') return;
  slockRenderChatMessagesFromState();
}

async function renderSlockChannel(){
  const list = document.getElementById('slockMessageList');
  const title = document.getElementById('slockChannelTitle');
  const hint = document.getElementById('slockChannelHint');
  const meta = SLOCK_CHANNELS[slockActiveChannel] || SLOCK_CHANNELS.home;
  if(title) title.textContent = meta.title;
  if(hint) hint.textContent = meta.hint;
  slockSyncComposer();
  document.querySelectorAll('[data-slock-channel]').forEach((btn)=>btn.classList.toggle('active', btn.dataset.slockChannel === slockActiveChannel));
  document.querySelectorAll('[data-slock-nav]').forEach((btn)=>btn.classList.toggle('active', btn.dataset.slockNav === slockActiveChannel));
  if(!list) return;
  if(meta.chat){
    list.innerHTML = '<div class="slock-empty">#라운지 메시지를 불러오는 중...</div>';
    await slockLoadChatMessages();
    slockRenderChatMessagesFromState();
    return;
  }
  if(meta.community){
    const posts = await slockLoadCommunity(slockActiveChannel);
    slockCommunityPosts = posts;
    list.innerHTML = posts.length
      ? posts.slice(0, 50).map(slockMessageForCommunity).join('')
      : '<div class="slock-empty">아직 업무 메모가 없습니다.</div>';
    slockSelectedMessageKey = posts[0]?.id ? `post:${posts[0].id}` : '';
    const first = posts[0];
    if(first) slockRenderThreadForPost(first);
    return;
  }
  const messages = slockActiveChannel === 'news' || slockActiveChannel === 'files'
    ? slockNewsItems().map(slockMessageForNews)
    : slockCardsForChannel(slockActiveChannel).map(slockMessageForCard);
  list.innerHTML = messages.length ? messages.join('') : '<div class="slock-empty">표시할 업무 업데이트가 없습니다.</div>';
  if(!slockSelectedMessageKey){
    const first = list.querySelector('.slock-message');
    slockSelectedMessageKey = first?.dataset.slockMessageKey || '';
  }
  const selected = list.querySelector(`[data-slock-message-key="${CSS.escape(slockSelectedMessageKey)}"]`) || list.querySelector('.slock-message');
  if(selected){
    selected.classList.add('selected');
    slockOpenMessage(selected, { openMobile:false });
  }
}

function slockOpenMessage(row, options={}){
  if(!row) return;
  slockSelectedMessageKey = row.dataset.slockMessageKey || '';
  document.querySelectorAll('.slock-message').forEach((el)=>el.classList.toggle('selected', el === row));
  const pane = document.getElementById('slockThreadPane');
  if(pane && isSlockMobile() && options.openMobile !== false) pane.classList.add('is-open');
  if(row.dataset.slockKind === 'news'){
    const item = slockNewsItems()[Number(row.dataset.slockNewsIndex || 0)];
    slockRenderThreadForNews(item);
    return;
  }
  if(row.dataset.slockKind === 'post'){
    const post = slockCommunityPosts.find((p)=>String(p.id || '') === String(row.dataset.slockPostId || ''));
    slockRenderThreadForPost(post);
    return;
  }
  if(row.dataset.slockKind === 'chat'){
    const message = slockChatMessages.find((m)=>String(m.id || '') === String(row.dataset.slockChatId || ''));
    slockRenderThreadForChat(message);
    return;
  }
  slockRenderThreadForCard(slockFindCardByMessageKey(slockSelectedMessageKey));
}

function renderSlockFromSnapshot(_snapshot, cards){
  if(!document.body.classList.contains('theme-slock')) return;
  if(Array.isArray(cards) && cards.length && !slockSelectedMessageKey){
    const first = cards.find((card)=>card && !card._noteRow);
    if(first) slockSelectedMessageKey = `card:${first.key || first.code || 0}`;
  }
  renderSlockChannel();
}

function bindSlockListeners(){
  if(slockListenersBound) return;
  slockListenersBound = true;
  document.querySelectorAll('[data-slock-channel],[data-slock-nav]').forEach((btn)=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      const next = btn.dataset.slockChannel || btn.dataset.slockNav || 'home';
      slockActiveChannel = next;
      slockSelectedMessageKey = '';
      setSlockMobileNavOpen(false);
      renderSlockChannel();
    });
  });
  document.getElementById('slockMessageList')?.addEventListener('click', (ev)=>{
    const row = ev.target.closest('.slock-message');
    if(row) slockOpenMessage(row);
  });
  document.getElementById('slockComposer')?.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    if(slockActiveChannel !== 'chat') return;
    const input = document.getElementById('slockComposerInput');
    const send = document.getElementById('slockSendButton');
    const text = String(input?.value || '').trim();
    if(!text) return;
    if(typeof sendChatMessage !== 'function'){
      showToast('채팅 기능을 아직 불러오지 못했습니다', 'warn');
      return;
    }
    if(send) send.disabled = true;
    try{
      await sendChatMessage(text);
      if(input) input.value = '';
      slockChatMessages = slockReadChatMessages();
      slockRenderChatMessagesFromState();
    }finally{
      if(send && slockActiveChannel === 'chat') send.disabled = false;
      input?.focus?.({ preventScroll:true });
    }
  });
  document.querySelectorAll('[data-slock-tool]').forEach((el)=>{
    const tool = el.dataset.slockTool;
    if(tool === 'guide') return;
    el.addEventListener('click', (ev)=>{
      ev.preventDefault();
      if(tool === 'notices') openUpdatesModal();
      else if(tool === 'settings') openSettingsModal();
      else if(tool === 'excel') deactivateSlockTheme();
      setSlockMobileNavOpen(false);
    });
  });
  document.querySelector('[data-slock-mobile-menu]')?.addEventListener('click', (ev)=>{
    ev.preventDefault();
    setSlockMobileNavOpen(true);
  });
  document.querySelector('[data-slock-mobile-close]')?.addEventListener('click', (ev)=>{
    ev.preventDefault();
    setSlockMobileNavOpen(false);
  });
  document.getElementById('chatToggle')?.addEventListener('click', ()=>{
    if(document.body.classList.contains('theme-slock')) document.body.classList.remove('slock-chat-suppressed');
  }, {capture:true});
  document.addEventListener('click', (ev)=>{
    if(!document.body.classList.contains('slock-nav-open')) return;
    if(ev.target?.closest?.('.slock-sidebar,[data-slock-mobile-menu]')) return;
    setSlockMobileNavOpen(false);
  });
  document.addEventListener('keydown', (ev)=>{
    if(ev.key === 'Escape') setSlockMobileNavOpen(false);
  });
}

function placeSlockResponsiveSlots(){
  moveNodeToSlot('.floating-tabs', 'slockTabsSlot');
}

function activateSlockTheme(){
  if(slockModeActive) return;
  const slock = document.getElementById('slockApp');
  if(!slock) return;
  slockModeActive = true;
  try{ slockBetaActive = true; }catch{}
  slock.setAttribute('aria-hidden','false');
  document.body.classList.add('theme-slock');
  document.body.classList.add('slock-chat-suppressed');
  document.body.classList.add('slock-integrated-chat');
  document.querySelectorAll('.fv-tooltip').forEach((el)=>el.remove());
  document.querySelectorAll('.first-visit-pulse,.fv-force-visible').forEach((el)=>el.classList.remove('first-visit-pulse','fv-force-visible'));
  document.title = getBrowserDocumentTitle();
  const theme = document.querySelector('meta[name="theme-color"]');
  if(theme) theme.setAttribute('content', '#4a154b');
  const chatTitle = document.getElementById('chatHeaderTitle');
  if(chatTitle) chatTitle.textContent = '실시간 채팅';
  const chatLbl = document.querySelector('.chat-cta .lbl');
  if(chatLbl) chatLbl.textContent = '채팅';
  const chatPanel = document.getElementById('chatPanel');
  if(chatPanel) chatPanel.setAttribute('aria-label','실시간 채팅');
  const closeChatForSlock = ()=>{
    try{
      if(typeof setChatOpen === 'function') setChatOpen(false, { persist:false });
      else{
        document.body.classList.remove('chat-open');
        document.getElementById('chatPanel')?.classList.remove('open');
        document.getElementById('chatToggle')?.setAttribute('aria-expanded', 'false');
      }
    }catch{}
  };
  closeChatForSlock();
  setTimeout(closeChatForSlock, 1200);
  placeSlockResponsiveSlots();
  bindSlockListeners();
  syncActiveTab();
  renderFloatingButtons();
  if(lastSnapshot) renderSlockFromSnapshot(lastSnapshot, (lastRenderedCards || []).filter((card)=>card && !card._noteRow));
}

function deactivateSlockTheme(){
  if(!slockModeActive) return;
  try{ slockBetaActive = false; }catch{}
  showToast('Excel 모드로 돌아갑니다…', 'info');
  setTimeout(()=>{ window.location.reload(); }, 250);
}
