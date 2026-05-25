/* ============================================================
 * Chat panel UI helpers
 * ============================================================ */
function chatEls(){
  const fallback = activeChatComposerFallbackParts();
  return {
    panel: document.getElementById('chatPanel'),
    toggle: document.getElementById('chatToggle'),
    close: document.getElementById('chatClose'),
    status: document.getElementById('chatStatus'),
    body: document.getElementById('chatMessages'),
    form: fallback?.form || document.getElementById('chatForm'),
    nick: fallback?.nick || document.getElementById('chatNickname'),
    input: fallback?.input || document.getElementById('chatInput'),
    attach: fallback?.attach || document.getElementById('chatAttach'),
    send: fallback?.send || document.getElementById('chatSend'),
    size: document.getElementById('chatSizeToggle'),
    excel: document.getElementById('chatExcelToggle'),
    dock: document.getElementById('chatDockToggle'),
    dockColumn: document.getElementById('chatDockColumn'),
    dockSlot: document.getElementById('chatDockSlot'),
    floatMount: document.getElementById('chatFloatMount'),
    foot: document.getElementById('chatFootnote'),
  };
}

function primaryChatComposerParts(){
  return {
    form: document.getElementById('chatForm'),
    nick: document.getElementById('chatNickname'),
    input: document.getElementById('chatInput'),
    attach: document.getElementById('chatAttach'),
    send: document.getElementById('chatSend'),
  };
}

function fallbackChatComposerParts(){
  const form = document.querySelector('[data-xk-reply-bar]');
  if(!form) return null;
  return {
    form,
    nick: form.querySelector('[data-xk-reply-name]'),
    input: form.querySelector('[data-xk-reply-text]'),
    attach: form.querySelector('[data-xk-reply-file]'),
    send: form.querySelector('[data-xk-reply-submit]'),
  };
}

function elementOwnStyleHidden(el){
  if(!el) return true;
  try{
    const style = getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
  }catch{
    return false;
  }
}

function elementHasBox(el){
  if(!el) return false;
  try{
    const rect = el.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8;
  }catch{
    return true;
  }
}

function primaryChatComposerUsable(){
  const panel = document.getElementById('chatPanel');
  const open = !!(document.body?.classList?.contains('chat-open') || panel?.classList?.contains('open'));
  const {form,input,send} = primaryChatComposerParts();
  if(!form || !input || !send) return false;
  if(elementOwnStyleHidden(form) || elementOwnStyleHidden(input) || elementOwnStyleHidden(send)) return false;
  if(open && (!elementHasBox(form) || !elementHasBox(input) || !elementHasBox(send))) return false;
  return true;
}

function activeChatComposerFallbackParts(){
  const fallback = fallbackChatComposerParts();
  if(!fallback?.form || fallback.form.hidden) return null;
  return primaryChatComposerUsable() ? null : fallback;
}

function ensureChatComposerFallback(){
  const existing = fallbackChatComposerParts();
  if(existing?.form) return existing;
  const primary = document.getElementById('chatForm');
  const panel = document.getElementById('chatPanel');
  if(!primary && !panel) return null;
  const form = document.createElement('form');
  form.hidden = true;
  form.setAttribute('data-xk-reply-bar', '1');
  form.setAttribute('aria-label', '메시지 입력');
  form.innerHTML = `
    <input data-xk-reply-name="1" id="xkReplyName" type="text" maxlength="24" autocomplete="nickname" placeholder="월급루팡_123" />
    <input data-xk-reply-text="1" id="xkReplyText" type="text" maxlength="280" autocomplete="off" placeholder="채팅 입력 / 신고 4회 : 30분 차단" />
    <button data-xk-reply-file="1" id="xkReplyFile" type="button" title="이미지 첨부(외부 링크)" aria-label="이미지 첨부"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5L19 18H5l3.5-4.5zM8 9.5A1.5 1.5 0 1 1 6.5 8 1.5 1.5 0 0 1 8 9.5z"/></svg></button>
    <button data-xk-reply-submit="1" type="submit">전송</button>
  `;
  if(primary) primary.insertAdjacentElement('afterend', form);
  else panel?.appendChild(form);
  return fallbackChatComposerParts();
}

function syncChatComposerFallbackValues(toFallback=true){
  const primary = primaryChatComposerParts();
  const fallback = fallbackChatComposerParts();
  if(!fallback?.form) return;
  const from = toFallback ? primary : fallback;
  const to = toFallback ? fallback : primary;
  if(from.nick && to.nick && !to.nick.value) to.nick.value = from.nick.value || '';
  if(from.input && to.input && !to.input.value) to.input.value = from.input.value || '';
}

function syncChatComposerFallbackVisibility(){
  const fallback = ensureChatComposerFallback();
  if(!fallback?.form) return false;
  const primary = primaryChatComposerParts();
  if(primary.form?.dataset?.xkSuppressed === '1'){
    primary.form.hidden = false;
    delete primary.form.dataset.xkSuppressed;
  }
  const useFallback = !primaryChatComposerUsable();
  if(useFallback){
    syncChatComposerFallbackValues(true);
    if(primary.form){
      primary.form.hidden = true;
      primary.form.dataset.xkSuppressed = '1';
    }
    fallback.form.hidden = false;
  }else{
    syncChatComposerFallbackValues(false);
    if(primary.form){
      primary.form.hidden = false;
      delete primary.form.dataset.xkSuppressed;
    }
    fallback.form.hidden = true;
  }
  document.body?.classList?.toggle('xk-reply-fallback-active', useFallback);
  return useFallback;
}

function setupChatComposerFallback(){
  const fallback = ensureChatComposerFallback();
  if(!fallback?.form || fallback.form.dataset.bound === '1') return;
  fallback.form.dataset.bound = '1';
  fallback.nick?.addEventListener('input', (ev)=>{
    noteChatActivity(ev);
    enforceChatNicknameInput();
  });
  fallback.input?.addEventListener('input', noteChatActivity);
  fallback.form.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    syncChatComposerFallbackValues(false);
    sendChatMessage(fallback.input?.value || '');
  });
  fallback.send?.addEventListener('pointerdown', (ev)=>{
    if(!shouldKeepChatInputEnabledWhileSending()) return;
    ev.preventDefault();
    chatMobileSendPointerHandledUntil = Date.now() + 900;
    fallback.input?.focus?.({preventScroll:true});
    syncChatComposerFallbackValues(false);
    sendChatMessage(fallback.input?.value || '');
  });
  fallback.attach?.addEventListener('click', (ev)=>{
    ev.preventDefault();
    openImageAttachHelper('xkReplyText');
  });
  syncChatComposerFallbackVisibility();
  setInterval(syncChatComposerFallbackVisibility, 1600);
  window.addEventListener('resize', ()=>requestAnimationFrame(syncChatComposerFallbackVisibility), {passive:true});
  document.addEventListener('visibilitychange', ()=>requestAnimationFrame(syncChatComposerFallbackVisibility));
}

function clearChatPanelRescueStyle(panel=document.getElementById('chatPanel')){
  if(!panel || panel.dataset.xkPanelRescued !== '1') return;
  panel.style.removeProperty('display');
  panel.style.removeProperty('visibility');
  panel.style.removeProperty('opacity');
  delete panel.dataset.xkPanelRescued;
}

function syncChatPanelRescue(){
  const panel = document.getElementById('chatPanel');
  if(!panel) return false;
  const open = !!(document.body?.classList?.contains('chat-open') || panel.classList.contains('open'));
  if(!open){
    clearChatPanelRescueStyle(panel);
    return false;
  }
  const hidden = elementOwnStyleHidden(panel) || !elementHasBox(panel);
  if(!hidden) return false;
  panel.hidden = false;
  panel.classList.add('open');
  document.body?.classList?.add('chat-open');
  panel.dataset.xkPanelRescued = '1';
  panel.style.setProperty('display', 'grid', 'important');
  panel.style.setProperty('visibility', 'visible', 'important');
  panel.style.setProperty('opacity', 'var(--chat-panel-opacity, 1)', 'important');
  if(typeof applyChatPanelPosition === 'function') requestAnimationFrame(()=>applyChatPanelPosition({saveClamp:true}));
  syncChatComposerFallbackVisibility();
  return true;
}

function setupChatPanelRescue(){
  syncChatPanelRescue();
  setInterval(syncChatPanelRescue, 1200);
  window.addEventListener('resize', ()=>requestAnimationFrame(syncChatPanelRescue), {passive:true});
  document.addEventListener('visibilitychange', ()=>requestAnimationFrame(syncChatPanelRescue));
}

const CHAT_HEADER_ICONS = {
  expand:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/><path d="M4 4l5 5M20 4l-5 5M20 20l-5-5M4 20l5-5"/></svg>',
  collapse:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5"/><path d="M9 9 4 4M15 9l5-5M15 15l5 5M9 15l-5 5"/></svg>',
  dock:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14M16.8 9.2l2.2 2.8-2.2 2.8"/></svg>',
  undock:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14M19 9l-4 3 4 3"/></svg>',
  popout:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="8" width="11" height="11" rx="2"/><path d="M13 5h6v6M12 12l7-7"/></svg>',
  close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
let chatDockLastActive = false;

function applyChatPanelSize(){
  const {panel,size}=chatEls();
  panel?.classList.toggle('is-large', !!chatPanelLarge);
  if(size){
    size.innerHTML = chatPanelLarge ? CHAT_HEADER_ICONS.collapse : CHAT_HEADER_ICONS.expand;
    size.title = chatPanelLarge ? '작게 보기' : '크게 보기';
    size.setAttribute('aria-label', size.title);
    size.setAttribute('aria-pressed', chatPanelLarge ? 'true' : 'false');
  }
  requestAnimationFrame(()=>applyChatPanelPosition({saveClamp:true}));
}

function desktopChatDragSupported(){
  try{
    return !chatDockActive() && !!(window.matchMedia && window.matchMedia('(min-width: 761px) and (hover: hover) and (pointer: fine)').matches);
  }catch{
    return false;
  }
}

function chatDockSupported(){
  try{
    if(document.body?.classList.contains('theme-outlook')) return false;
    return !!(window.matchMedia && window.matchMedia(`(min-width: ${CHAT_DOCK_BREAKPOINT_PX}px) and (hover: hover) and (pointer: fine)`).matches);
  }catch{
    return false;
  }
}

function chatDockActive(){
  return !!document.body?.classList.contains('chat-docked');
}

function moveChatPanelToFloat(panel=chatEls().panel){
  const {floatMount}=chatEls();
  if(!panel || !floatMount?.parentNode) return;
  if(panel.previousElementSibling === floatMount) return;
  floatMount.parentNode.insertBefore(panel, floatMount.nextSibling);
}

function moveChatPanelToDock(panel=chatEls().panel){
  const {dockSlot}=chatEls();
  if(!panel || !dockSlot) return;
  if(panel.parentNode !== dockSlot) dockSlot.appendChild(panel);
}

function updateChatDockButton(){
  const {dock}=chatEls();
  if(!dock) return;
  const active=chatDockActive();
  const supported=chatDockSupported();
  dock.hidden = false;
  dock.classList.toggle('is-active', active);
  dock.setAttribute('aria-pressed', active ? 'true' : 'false');
  dock.innerHTML = active ? CHAT_HEADER_ICONS.undock : CHAT_HEADER_ICONS.dock;
  const title=active ? '오른쪽 고정 해제' : (supported ? '오른쪽에 붙이기' : '오른쪽에 붙이기 (넓은 화면 필요)');
  dock.title=title;
  dock.setAttribute('aria-label', title);
}

function updateChatDockWidth(dockColumn=chatEls().dockColumn){
  try{
    if(!dockColumn || dockColumn.hidden || !chatDockActive()){
      document.documentElement?.style.removeProperty('--chat-dock-width');
      return;
    }
    const width = Math.round(dockColumn.getBoundingClientRect().width || 0);
    if(width > 0) document.documentElement?.style.setProperty('--chat-dock-width', `${width}px`);
  }catch{}
}

function applyChatDockMode(options={}){
  const {panel,dockColumn,size}=chatEls();
  if(!panel) return;
  const supported=chatDockSupported();
  const active=!!(chatDockRequested && chatIsOpen && supported);
  const wasActive=chatDockLastActive;
  document.body?.classList.toggle('chat-docked', active);
  panel.classList.toggle('is-docked', active);
  if(dockColumn) dockColumn.hidden=!active;
  if(size) size.hidden=active;
  if(active){
    moveChatPanelToDock(panel);
    resetChatPanelInline(panel);
    applySheetSplitLayout();
    requestAnimationFrame(()=>updateChatDockWidth(dockColumn));
  }else{
    moveChatPanelToFloat(panel);
    panel.classList.remove('is-docked');
    if(size) size.hidden=false;
    applySheetSplitLayout();
    updateChatDockWidth(dockColumn);
  }
  updateChatDockButton();
  updateChatCloseButton();
  if(options.notifyAutoPopup && wasActive && !active && chatDockRequested && chatIsOpen && !supported){
    showToast('화면이 좁아져 팝업 모드로 바뀌었습니다', 'info');
  }
  chatDockLastActive = active;
}

function setChatDockMode(on, options={}){
  const next=!!on;
  if(next && !chatDockSupported()){
    chatDockRequested=false;
    writeBoolSetting(CHAT_DOCK_KEY, false);
    applyChatDockMode();
    if(options.toast !== false) showToast('화면 가로폭이 충분하지 않아 오른쪽 고정 모드를 사용할 수 없습니다', 'warn');
    return false;
  }
  chatDockRequested=next;
  writeBoolSetting(CHAT_DOCK_KEY, chatDockRequested);
  if(chatDockRequested && !chatIsOpen) setChatOpen(true);
  else applyChatDockMode();
  if(options.toast !== false) showToast(chatDockRequested ? '채팅창을 시트 오른쪽에 붙였습니다' : '팝업 모드로 바뀌었습니다', 'info');
  return true;
}

function closeChatPanel(){
  // 도킹 상태 -> 창모드 전환만 (숨기지 않음). 창모드 -> 숨기기 (기존 동작).
  if(chatDockActive()){
    setChatDockMode(false, {toast:true});
    return;
  }
  setChatOpen(false);
}

function updateChatCloseButton(){
  const {close}=chatEls();
  if(!close) return;
  const docked=chatDockActive();
  close.classList.toggle('is-undock', docked);
  if(docked){
    close.innerHTML=CHAT_HEADER_ICONS.popout;
    close.setAttribute('aria-label','작은 창으로 띄우기');
    close.title='작은 창으로 띄우기';
  }else{
    close.innerHTML=CHAT_HEADER_ICONS.close;
    close.setAttribute('aria-label','채팅 닫기');
    close.title='채팅 닫기';
  }
}

function readChatPanelPosition(){
  try{
    const raw=localStorage.getItem(CHAT_POSITION_KEY);
    if(!raw) return null;
    const parsed=JSON.parse(raw);
    const left=Number(parsed?.left);
    const top=Number(parsed?.top);
    if(Number.isFinite(left) && Number.isFinite(top)) return {left, top};
  }catch{}
  return null;
}

function writeChatPanelPosition(pos){
  try{
    const value=JSON.stringify({left:Math.round(pos.left), top:Math.round(pos.top)});
    localStorage.setItem(CHAT_POSITION_KEY, value);
    persistSet(CHAT_POSITION_KEY, value);
  }catch{}
}

function clearChatPanelPosition(){
  try{
    localStorage.removeItem(CHAT_POSITION_KEY);
    persistRemove(CHAT_POSITION_KEY);
  }catch{}
}

function resetChatPanelInline(panel=chatEls().panel){
  if(!panel) return;
  panel.style.left='';
  panel.style.top='';
  panel.style.right='';
  panel.style.bottom='';
  panel.classList.remove('is-positioned','is-dragging');
}

function clampChatPanelPosition(pos, panel=chatEls().panel){
  const rect=panel?.getBoundingClientRect?.();
  const width=Math.max(1, rect?.width || (chatPanelLarge ? 500 : 380));
  const height=Math.max(1, rect?.height || 484);
  const viewportWidth=window.innerWidth || document.documentElement.clientWidth || width;
  const viewportHeight=window.innerHeight || document.documentElement.clientHeight || height;
  const minLeft=CHAT_PANEL_MARGIN_PX;
  const minTop=CHAT_PANEL_MARGIN_PX;
  const maxLeft=Math.max(minLeft, viewportWidth - width - CHAT_PANEL_MARGIN_PX);
  const maxTop=Math.max(minTop, viewportHeight - height - CHAT_PANEL_MARGIN_PX);
  const left=Number.isFinite(Number(pos?.left)) ? Number(pos.left) : minLeft;
  const top=Number.isFinite(Number(pos?.top)) ? Number(pos.top) : minTop;
  return {
    left:Math.min(Math.max(left, minLeft), maxLeft),
    top:Math.min(Math.max(top, minTop), maxTop),
  };
}

function setChatPanelPosition(pos, options={}){
  const {panel}=chatEls();
  if(!panel) return null;
  if(!desktopChatDragSupported()){
    resetChatPanelInline(panel);
    return null;
  }
  const clamped=clampChatPanelPosition(pos, panel);
  panel.classList.add('is-positioned');
  panel.style.left=`${Math.round(clamped.left)}px`;
  panel.style.top=`${Math.round(clamped.top)}px`;
  panel.style.right='auto';
  panel.style.bottom='auto';
  if(options.save !== false) writeChatPanelPosition(clamped);
  return clamped;
}

function applyChatPanelPosition(options={}){
  const {panel}=chatEls();
  if(!panel) return;
  if(!desktopChatDragSupported()){
    resetChatPanelInline(panel);
    return;
  }
  if(!panel.classList.contains('open')) return;
  const pos=readChatPanelPosition();
  if(!pos){
    resetChatPanelInline(panel);
    return;
  }
  setChatPanelPosition(pos, {save:!!options.saveClamp});
}

function resetChatPanelPosition(){
  clearChatPanelPosition();
  resetChatPanelInline();
  showToast('채팅창 위치를 초기화했습니다', 'info');
}

function setupChatPanelDrag(){
  const {panel}=chatEls();
  const head=panel?.querySelector?.('.chat-head');
  if(!panel || !head) return;
  const interactiveSelector='.chat-head-actions,button,a,input,textarea,select,[contenteditable="true"]';
  head.addEventListener('pointerdown',(ev)=>{
    if(ev.button != null && ev.button !== 0) return;
    if(!desktopChatDragSupported()) return;
    if(ev.target?.closest?.(interactiveSelector)) return;
    const rect=panel.getBoundingClientRect();
    chatPanelDragState={
      pointerId:ev.pointerId,
      startX:ev.clientX,
      startY:ev.clientY,
      left:rect.left,
      top:rect.top,
      moved:false,
    };
    try{ head.setPointerCapture(ev.pointerId); }catch{}
  });
  head.addEventListener('pointermove',(ev)=>{
    const state=chatPanelDragState;
    if(!state || state.pointerId !== ev.pointerId) return;
    const dx=ev.clientX - state.startX;
    const dy=ev.clientY - state.startY;
    if(!state.moved && Math.hypot(dx, dy) < CHAT_DRAG_THRESHOLD_PX) return;
    state.moved=true;
    panel.classList.add('is-dragging');
    ev.preventDefault();
    setChatPanelPosition({left:state.left + dx, top:state.top + dy}, {save:false});
  });
  const finishDrag=(ev)=>{
    const state=chatPanelDragState;
    if(!state || state.pointerId !== ev.pointerId) return;
    if(state.moved){
      const rect=panel.getBoundingClientRect();
      setChatPanelPosition({left:rect.left, top:rect.top}, {save:true});
    }
    panel.classList.remove('is-dragging');
    try{ head.releasePointerCapture(ev.pointerId); }catch{}
    chatPanelDragState=null;
  };
  head.addEventListener('pointerup', finishDrag);
  head.addEventListener('pointercancel', finishDrag);
  head.addEventListener('dblclick',(ev)=>{
    if(!desktopChatDragSupported()) return;
    if(ev.target?.closest?.(interactiveSelector)) return;
    resetChatPanelPosition();
  });
}

function applyChatExcelMode(){
  const {panel,excel}=chatEls();
  panel?.classList.toggle('chat-excel-mode', !!chatExcelMode);
  if(excel){
    excel.title = chatExcelMode ? '일반 채팅으로 보기' : '엑셀식 표 보기';
    excel.setAttribute('aria-label', excel.title);
    excel.setAttribute('aria-pressed', chatExcelMode ? 'true' : 'false');
    excel.classList.toggle('is-active', !!chatExcelMode);
  }
  // 채팅 메시지 렌더링이 모드에 따라 달라지므로 다시 그린다.
  if(typeof renderChatMessages === 'function') renderChatMessages();
}

function setChatPanelLarge(on){
  chatPanelLarge=!!on;
  const value=chatPanelLarge ? 'large' : 'normal';
  try{
    localStorage.setItem(CHAT_SIZE_KEY, value);
    persistSet(CHAT_SIZE_KEY, value);
  }catch{}
  applyChatPanelSize();
}

function setChatExcelMode(on){
  chatExcelMode=!!on;
  writeBoolSetting(CHAT_EXCEL_MODE_KEY, chatExcelMode);
  applyChatExcelMode();
}

function shouldKeepChatInputEnabledWhileSending(){
  try{
    return !!window.matchMedia?.('(max-width: 760px)')?.matches;
  }catch{
    return false;
  }
}

function setChatSending(sending){
  const {form,nick,input,attach,send}=chatEls();
  const keepInputFocused = !!sending && shouldKeepChatInputEnabledWhileSending();
  form?.classList.toggle('is-sending', !!sending);
  if(nick) nick.disabled=!!sending || isInlineAdmin();
  if(input){
    input.disabled=!!sending && !keepInputFocused;
    input.setAttribute('aria-busy', sending ? 'true' : 'false');
  }
  if(attach) attach.disabled=!!sending;
  setBusyButton(send, !!sending, '전송중');
}

function refocusChatInput(){
  const {input}=chatEls();
  if(!chatIsOpen || document.hidden || !input || input.disabled) return;
  requestAnimationFrame(()=>{
    try{
      input.focus({preventScroll:true});
      const end=input.value.length;
      input.setSelectionRange(end, end);
    }catch{}
  });
}
