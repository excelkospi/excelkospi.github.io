// Event bindings for the Excel-like quote table. Rendering lives in
// app-quote-table.js; this file only wires controls after each render.

function bindCardsTableControls(){
  document.querySelectorAll('button[data-action=remove-row]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      removeWatchlistItem(btn.dataset.code);
    });
  });
  document.querySelectorAll('button[data-action=move-row]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      moveWatchlistItem(btn.dataset.code, btn.dataset.dir);
    });
  });
  document.querySelectorAll('button[data-action=move-default]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      moveDefaultItem(btn.dataset.orderId, btn.dataset.dir);
    });
  });
  document.querySelectorAll('button[data-action=hide-default]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      hideDefault(btn.dataset.key);
      loadSnapshot({force:true});  // 재렌더
      showToast(`${btn.dataset.key} 숨김. 복원하려면 더보기 메뉴에서 기본 항목 복원하기를 누르세요.`, 'info');
    });
  });
  document.querySelectorAll('button[data-action=remove-note-row]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      removeQuoteNoteRow(btn.dataset.noteId);
    });
  });
  document.querySelectorAll('button[data-action=edit-holding]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      const id = btn.dataset.holdingId;
      const lotId = primaryHoldingLotId(id) || newHoldingLotId();
      openHoldingInline({
        id,
        lotId,
        isNew: !primaryHoldingLotId(id),
        key: btn.dataset.key,
        price: Number(btn.dataset.price),
      });
    });
  });
  document.querySelectorAll('button[data-action=add-holding-lot]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      openHoldingInline({
        id: btn.dataset.holdingId,
        key: btn.dataset.key,
        lotId: newHoldingLotId(),
        afterLotId: btn.dataset.lotId || '',
        isNew: true,
      });
    });
  });
  document.querySelectorAll('button[data-action=toggle-holding-pnl-mode]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      toggleHoldingPnlMode();
    });
  });
  document.querySelectorAll('button[data-action=set-holding-pnl-mode]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      setHoldingPnlMode(btn.dataset.holdingPnlMode);
    });
  });
  document.querySelectorAll('button[data-action=clear-holding]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      clearHoldingById(btn.dataset.holdingId, btn.dataset.key, btn.dataset.lotId);
    });
  });
  document.querySelectorAll('button[data-action=save-holding-inline]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      const box=btn.closest('.holding-inline');
      saveHoldingInline(btn.dataset.holdingId, btn.dataset.key, box, btn.dataset.lotId);
    });
  });
  document.querySelectorAll('button[data-action=cancel-holding-inline]').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      closeHoldingInline();
    });
  });
  document.querySelectorAll('.holding-inline input').forEach(input=>{
    input.addEventListener('keydown', (ev)=>{
      if(ev.key==='Escape'){
        ev.preventDefault();
        closeHoldingInline();
      }
      if(ev.key==='Enter'){
        ev.preventDefault();
        const box=input.closest('.holding-inline');
        saveHoldingInline(box?.dataset.holdingId, box?.dataset.key, box, box?.dataset.lotId);
      }
    });
  });
  document.querySelectorAll('.quote-note-content[data-note-id]').forEach(el=>{
    if(el.dataset.noteBound === '1') return;
    el.dataset.noteBound = '1';
    el.addEventListener('focus', ()=>{
      el.dataset.originalText = el.textContent || '';
    });
    el.addEventListener('input', ()=>{
      updateQuoteNoteText(el.dataset.noteId, el.textContent || '');
    });
    el.addEventListener('blur', ()=>{
      const clean = normalizeQuoteNoteText(el.textContent || '');
      el.textContent = clean;
      updateQuoteNoteText(el.dataset.noteId, clean);
    });
    el.addEventListener('keydown', (ev)=>{
      if(ev.key === 'Enter'){
        ev.preventDefault();
        el.blur();
      }else if(ev.key === 'Escape'){
        ev.preventDefault();
        el.textContent = el.dataset.originalText || '';
        updateQuoteNoteText(el.dataset.noteId, el.textContent || '');
        el.blur();
      }
    });
    el.addEventListener('paste', (ev)=>{
      ev.preventDefault();
      const text = normalizeQuoteNoteText(ev.clipboardData?.getData('text/plain') || '');
      document.execCommand?.('insertText', false, text);
    });
  });
  setupQuoteRowDrag();
  setupMiniChartHover();
  setupTradingViewChartButtons();
  setupMobileTradingViewRows();
  enableCellSelection();
  focusPendingQuoteNote();
}

function focusPendingQuoteNote(){
  if(!pendingQuoteNoteFocusId) return;
  const id = pendingQuoteNoteFocusId;
  pendingQuoteNoteFocusId = '';
  const focus = ()=>{
    const safeId = String(id).replace(/"/g, '\\"');
    const el=document.querySelector(`.quote-note-content[data-note-id="${safeId}"]`);
    if(!el) return;
    el.focus();
    try{
      const range=document.createRange();
      range.selectNodeContents(el);
      const sel=window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }catch{}
  };
  focus();
  requestAnimationFrame(focus);
  setTimeout(focus, 30);
}
