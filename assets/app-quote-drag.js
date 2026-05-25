// Drag ordering for rows in the Excel-like quote table.

function quoteRowOrderVisibleIds(){
  const fromDom=Array.from(document.querySelectorAll('#cardsTable tr[data-row-order-id]'))
    .map(row=>row.dataset.rowOrderId)
    .filter(Boolean);
  return fromDom.length ? fromDom : lastRenderedQuoteOrderIds.slice();
}

function watchlistItemOrderId(item){
  return `U:${String(item?.market||'').toUpperCase()}:${String(item?.code||'').toUpperCase()}`;
}

function syncWatchlistOrderFromQuoteOrder(orderIds){
  const list=wlLoad();
  if(!list.length) return;
  const pos=new Map(orderIds.map((id,idx)=>[id,idx]));
  const next=list.map((item,index)=>({item,index,pos:pos.get(watchlistItemOrderId(item))}))
    .sort((a,b)=>{
      if(a.pos !== undefined || b.pos !== undefined) return (a.pos ?? 100000 + a.index) - (b.pos ?? 100000 + b.index);
      return a.index - b.index;
    })
    .map(x=>x.item);
  const changed=next.some((item,index)=>item !== list[index]);
  if(changed) wlSave(next);
}

function saveQuoteRowOrder(orderIds){
  const seen=new Set();
  const visible=[];
  orderIds.forEach((id)=>{
    const value=String(id||'').trim();
    if(!value || seen.has(value)) return;
    seen.add(value);
    visible.push(value);
  });
  const existing=defaultOrderLoad().filter(id=>!seen.has(id));
  defaultOrderSave(visible.concat(existing).slice(0, 200));
  syncWatchlistOrderFromQuoteOrder(visible);
}

function moveQuoteRowOrder(sourceId, targetId, placeAfter=false){
  const source=String(sourceId||'');
  const target=String(targetId||'');
  if(!source || !target || source===target) return false;
  const order=quoteRowOrderVisibleIds();
  const from=order.indexOf(source);
  const to=order.indexOf(target);
  if(from<0 || to<0) return false;
  const [item]=order.splice(from,1);
  let insertAt=order.indexOf(target);
  if(insertAt<0) return false;
  if(placeAfter) insertAt += 1;
  order.splice(insertAt,0,item);
  saveQuoteRowOrder(order);
  rerenderCardsTableFromCurrentState();
  return true;
}

function moveVisibleQuoteRowByDelta(rowOrderId, delta){
  const order=quoteRowOrderVisibleIds();
  const idx=order.indexOf(String(rowOrderId||''));
  const next=idx + Number(delta||0);
  if(idx<0 || next<0 || next>=order.length) return false;
  const target=order[next];
  return moveQuoteRowOrder(rowOrderId, target, delta > 0);
}

let quoteRowDragState=null;
function clearQuoteRowDropMarkers(){
  document.querySelectorAll('#cardsTable .quote-row-drop-before,#cardsTable .quote-row-drop-after').forEach(row=>{
    row.classList.remove('quote-row-drop-before','quote-row-drop-after');
  });
}

function quoteRowAtPoint(x, y){
  const el=document.elementFromPoint(x, y);
  const row=el?.closest?.('#cardsTable tr[data-row-order-id]');
  return row?.dataset?.rowOrderId ? row : null;
}

function updateQuoteRowDragTarget(ev){
  if(!quoteRowDragState) return;
  const row=quoteRowAtPoint(ev.clientX, ev.clientY);
  clearQuoteRowDropMarkers();
  quoteRowDragState.targetId='';
  quoteRowDragState.placeAfter=false;
  if(!row || row.dataset.rowOrderId === quoteRowDragState.sourceId) return;
  const rect=row.getBoundingClientRect();
  const placeAfter=ev.clientY > rect.top + rect.height / 2;
  row.classList.add(placeAfter ? 'quote-row-drop-after' : 'quote-row-drop-before');
  quoteRowDragState.targetId=row.dataset.rowOrderId;
  quoteRowDragState.placeAfter=placeAfter;
}

function beginQuoteRowDrag(ev){
  if(ev.button !== undefined && ev.button !== 0) return;
  if(ev.pointerType === 'touch') return;
  const handle=ev.currentTarget;
  const row=handle.closest('tr[data-row-order-id]');
  const sourceId=row?.dataset?.rowOrderId || handle.dataset.rowOrderId || '';
  if(!row || !sourceId) return;
  ev.preventDefault();
  ev.stopPropagation();
  quoteRowDragState={ pointerId:ev.pointerId, sourceId, targetId:'', placeAfter:false };
  row.classList.add('quote-row-dragging');
  document.body.classList.add('quote-row-drag-active');
  try{ handle.setPointerCapture?.(ev.pointerId); }catch{}
  const move=(moveEv)=>{
    if(!quoteRowDragState || moveEv.pointerId !== quoteRowDragState.pointerId) return;
    moveEv.preventDefault();
    updateQuoteRowDragTarget(moveEv);
  };
  const finish=(upEv)=>{
    if(!quoteRowDragState || upEv.pointerId !== quoteRowDragState.pointerId) return;
    upEv.preventDefault();
    const state=quoteRowDragState;
    quoteRowDragState=null;
    document.body.classList.remove('quote-row-drag-active');
    row.classList.remove('quote-row-dragging');
    clearQuoteRowDropMarkers();
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    if(state.targetId && moveQuoteRowOrder(state.sourceId, state.targetId, state.placeAfter)){
      showToast('시세창 행 순서를 저장했습니다', 'info');
    }
  };
  window.addEventListener('pointermove', move, {passive:false});
  window.addEventListener('pointerup', finish, {passive:false});
  window.addEventListener('pointercancel', finish, {passive:false});
}

function setupQuoteRowDrag(){
  document.querySelectorAll('#cardsTable .quote-row-handle[data-row-order-id]').forEach(handle=>{
    if(handle.dataset.quoteDragBound === '1') return;
    handle.dataset.quoteDragBound = '1';
    handle.addEventListener('pointerdown', beginQuoteRowDrag);
  });
}
