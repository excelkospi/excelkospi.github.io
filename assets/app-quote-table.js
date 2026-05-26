// Excel-like quote table renderer. Loaded before app.js; functions intentionally
// share the browser global scope with the existing classic scripts.

function renderHoldingEditRow(card, rowNo, current={}){
  const id = holdingId(card);
  const lotId = holdingInputState?.lotId || newHoldingLotId();
  return `
    <tr class="holding-row holding-edit-row ${card.userAdded?'user-holding-row':''}" data-holding-id="${esc(id)}" data-lot-id="${esc(lotId)}" title="${esc(card.key)} 보유 정보 입력">
      <td class="rownum">${rowNo}</td>
      <td class="left holding-cell" colspan="3">
        <div class="holding-inline" data-holding-id="${esc(id)}" data-lot-id="${esc(lotId)}" data-after-lot-id="${esc(holdingInputState?.afterLotId || '')}" data-key="${esc(card.key)}">
          <input data-holding-avg type="text" inputmode="decimal" autocomplete="off" placeholder="평단가" value="${esc(holdingInputValue(current.avg))}" aria-label="평단가" />
          <input data-holding-qty type="text" inputmode="decimal" autocomplete="off" placeholder="수량" value="${esc(holdingInputValue(current.qty))}" aria-label="수량" />
          <button type="button" data-action="save-holding-inline" data-holding-id="${esc(id)}" data-lot-id="${esc(lotId)}" data-key="${esc(card.key)}">저장</button>
          <button type="button" class="inline-cancel" data-action="cancel-holding-inline" title="취소" aria-label="취소">×</button>
        </div>
      </td>
    </tr>`;
}

function renderHoldingLotRow(card, rowNo, lot, index, total){
  const id = holdingId(card);
  const calc = holdingCalc(card, lot);
  if(!calc) return '';
  const metric = holdingModeMetric(calc);
  const returnClass = cls(metric.pct);
  const valueClass = cls(metric.pnl);
  const pnlText = metric.unavailable ? '-' : signedHoldingAmountText(metric.pnl, calc.currency);
  const pctText = metric.unavailable ? '-' : signedPctOne(metric.pct);
  const titlePrefix = total > 1 ? `보유 ${index + 1} · ` : '';
  const dailyTitle = Number.isFinite(Number(calc.dayPnl)) ? ` · 일일 손익 ${signedHoldingAmountText(calc.dayPnl, calc.currency)}` : '';
  const positionClass = `${index === 0 ? ' holding-lot-first' : ''}${index === total - 1 ? ' holding-lot-last' : ''}`;
  return `
    <tr class="holding-row holding-lot-row${positionClass} ${card.userAdded?'user-holding-row':''}" data-holding-id="${esc(id)}" data-lot-id="${esc(lot.lotId)}" title="${esc(titlePrefix)}평가액 ${holdingSummaryMoneyText(calc.value, calc.currency)} · 원금 ${holdingSummaryMoneyText(calc.invested, calc.currency)} · 누적 손익 ${signedHoldingSummaryMoneyText(calc.pnl, calc.currency)}${dailyTitle} · 구매가격 ${holdingSummaryMoneyText(calc.avg, calc.currency)} · 수량 ${num(calc.qty)}">
      <td class="rownum">${rowNo}</td>
      <td class="left holding-cell holding-meta-cell">
        ${holdingLotMetaHtml(calc, index, total)}
        <button class="holding-row-add" data-action="add-holding-lot" data-holding-id="${esc(id)}" data-lot-id="${esc(lot.lotId)}" data-key="${esc(card.key)}" title="${esc(card.key)} 보유 행 추가" aria-label="보유 행 추가">추가</button>
        <button class="row-x holding-row-x" data-action="clear-holding" data-holding-id="${esc(id)}" data-lot-id="${esc(lot.lotId)}" data-key="${esc(card.key)}" title="${esc(card.key)} 보유 정보 삭제" aria-label="보유 정보 삭제">×</button>
      </td>
      <td class="right quote-price-cell holding-value-cell ${valueClass}">${esc(pnlText)}</td>
      <td class="right holding-return-cell ${returnClass}">${esc(pctText)}</td>
    </tr>`;
}

function renderHoldingRows(card, rowNo){
  if(!canHoldCard(card)) return { html:'', count:0 };
  const id = holdingId(card);
  const lots = holdingLotsForId(id);
  const editing = holdingInputState && holdingInputState.id === id;
  const rows = [];
  let nextRow = rowNo;
  let insertedEdit = false;
  const pushEdit = (current={})=>{
    rows.push(renderHoldingEditRow(card, nextRow++, current));
    insertedEdit = true;
  };
  if(editing && !lots.length){
    pushEdit({});
  }else{
    lots.forEach((lot, index)=>{
      if(editing && holdingInputState.lotId === lot.lotId && !holdingInputState.isNew){
        pushEdit(lot);
      }else{
        rows.push(renderHoldingLotRow(card, nextRow++, lot, index, lots.length));
      }
      if(editing && holdingInputState.isNew && holdingInputState.afterLotId === lot.lotId){
        pushEdit({});
      }
    });
    if(editing && holdingInputState.isNew && !insertedEdit) pushEdit({});
  }
  return { html:rows.join(''), count:nextRow - rowNo };
}

function renderHoldingsEmptyRow(rowNo){
  return `
    <tr class="holding-empty-row">
      <td class="rownum">${rowNo}</td>
      <td class="left holding-empty-cell" colspan="3">
        <span class="holding-empty-title">등록된 보유종목이 없습니다.</span>
        <span class="holding-empty-copy">종목 이름에 마우스를 올려 <b>₩</b> 버튼을 누르면 보유수량과 평단가를 입력할 수 있어요!</span>
      </td>
    </tr>`;
}

function cardRenderedCells(c){
  let priceCell, changeCell, changeClass, previewChangeValue = null;
  if(c._momentum !== undefined && c._momentum !== null){
    priceCell = '<span class="flat">-</span>';
    changeCell = pct(c._momentum);
    changeClass = cls(c._momentum);
    previewChangeValue = c._momentum;
  } else if(c.sign && c.priceUnit){
    priceCell = c.price == null ? '<span class="flat">-</span>' : `${num(c.price)}${esc(c.priceUnit)}`;
    changeCell = '<span class="flat">-</span>';
    changeClass = 'flat';
  } else {
    priceCell = isRateOnlyCard(c.key)
      ? '&nbsp;'
      : cardPriceDisplayHtml(c);
    const selectedChange = changeValueFor(c);
    const changeHtml = shouldRenderChangeSessionTag(c)
      ? `<span class="flat" title="본장 외 세션 표시">${esc(c.sessionTag)}</span>`
      : pct(selectedChange);
    changeCell = `<span class="change-wrap"><span>${changeHtml}</span></span>`;
    changeClass = cls(selectedChange);
    previewChangeValue = selectedChange;
  }
  return { priceCell, changeCell, changeClass, previewChangeValue, changeTitle:changeCellTitle(c, previewChangeValue) };
}

function shouldRenderChangeSessionTag(c){
  if(!c?.sessionTag || changeWindow !== 'day') return false;
  if(String(c.market || '').toUpperCase() === 'KR'){
    return String(c.source || '').toUpperCase().includes('NXT');
  }
  return true;
}

function renderCardsTable(cards, session){
  const manualOrdering = quoteSortMode === 'manual';
  const header = `
    <tr>
      <th class="rownum"></th>
      <th class="colhead">A</th><th class="colhead">B</th><th class="colhead">C</th>
    </tr>
    <tr>
      <th class="rownum">1</th>
      <th class="subhead">지표</th><th class="subhead">현재가</th><th class="subhead">${changeHeaderLabel()}</th>
    </tr>`;
  // mood 영역(수급/15분/30분 변동) 은 삭제 불가 — 복원 방법이 직관적이지 않아서.
  const defaultRowIndexes = cards.map((x,idx)=>(!x._noteRow && !x.userAdded && !MOOD_PROTECTED_KEYS.has(x.key)) ? idx : -1).filter(idx=>idx>=0);
  const movableRowIndexes = cards.map((x,idx)=>(!x._noteRow && !MOOD_PROTECTED_KEYS.has(x.key)) ? idx : -1).filter(idx=>idx>=0);
  const firstMovableRow = movableRowIndexes[0];
  const lastMovableRow = movableRowIndexes[movableRowIndexes.length - 1];
  lastRenderedDefaultOrderIds = defaultRowIndexes.map(idx=>cardOrderId(cards[idx]));
  lastRenderedQuoteOrderIds = cards.map(quoteRowOrderId);
  let rowNo = 2;
  let rows = '';
  if(selected === 'HOLDINGS' && !cards.length){
    rows = renderHoldingsEmptyRow(rowNo++);
  }else{
    rows = cards.map((c,i)=>{
      const currentRowNo = rowNo++;
      if(c._noteRow){
        const noteId = String(c.noteId || '');
        const rowOrderId = quoteRowOrderId(c);
        const text = String(c.text || '');
        const noteRowDragAttrs = manualOrdering ? ` data-row-order-id="${esc(rowOrderId)}"` : '';
        const noteRowNumAttrs = manualOrdering
          ? ` class="rownum quote-row-handle" data-row-order-id="${esc(rowOrderId)}" title="행번호를 끌어서 순서 변경" aria-label="메모 행 순서 변경"`
          : ' class="rownum"';
        return `
    <tr class="quote-note-row"${noteRowDragAttrs} data-note-id="${esc(noteId)}">
      <td${noteRowNumAttrs}>${currentRowNo}</td>
      <td class="left quote-note-cell" colspan="3">
        <div class="quote-note-inner">
          <div class="quote-note-content" contenteditable="true" role="textbox" spellcheck="false" data-note-id="${esc(noteId)}" data-placeholder="예: 장투 / 단타 / 관심만">${esc(text)}</div>
          <button class="row-x quote-note-remove" data-action="remove-note-row" data-note-id="${esc(noteId)}" title="빈 행 삭제" aria-label="빈 행 삭제">×</button>
        </div>
      </td>
    </tr>`;
      }
      const isUser = !!c.userAdded;
      const errCls = (isUser && c.error) ? ' error' : '';
      const labelLink = isUser ? userCardLink(c) : cardMeta(c.key);
      const labelHtml = labelLink ? `<a href="${labelLink}" target="_blank" rel="noopener">${esc(c.key)}</a>` : esc(c.key);
      if(c._flows){
        const flowHtml = (c._flows || []).map(f=>{
          const n = Number(f.amount);
          const hasAmount = f.amount !== null && f.amount !== undefined && Number.isFinite(n);
          return `<span class="flow-pill ${hasAmount ? cls(n) : 'flat'}"><span class="flow-label">${esc(f.label)}</span><span>${esc(hasAmount ? `${n>0?'+':''}${num(n)}억` : '-')}</span></span>`;
        }).join('<span class="flat">/</span>');
        return `
    <tr class="mood-row flow-row" data-outlook-badge="${esc(outlookBadgeText(c))}" data-outlook-tone="${esc(outlookBadgeTone(c))}" title="${esc(c.market||'')} · ${esc(c.source||'-')} · ${fmtDt(c.asOf)}">
      <td class="rownum">${currentRowNo}</td>
      <td class="left flow-cell" colspan="3"><div class="metric-cell"><span class="metric-label">${labelHtml} · <span class="flow-line">${flowHtml}</span></span>${outlookFlowPreviewHtml(c)}<span class="metric-trail">${sourcePillHtml(c)}</span></div></td>
    </tr>`;
      }
      // mood 영역은 버튼 없음. user 추가 종목은 remove-row. 그 외 기본 종목은 hide-default. 모두 동일 .row-x 디자인.
      let removeBtn = '';
      if(MOOD_PROTECTED_KEYS.has(c.key)){
        removeBtn = '';
      } else if(isUser){
        const holdingBtn = canHoldCard(c) ? `<button class="row-holding ${holdingFor(c)?'is-set':''}" data-action="edit-holding" data-holding-id="${esc(holdingId(c))}" data-key="${esc(c.key)}" data-price="${esc(c.price??'')}" title="${esc(c.key)} 구매가격/수량" aria-label="구매가격/수량">₩</button>` : '';
        const moveBtns = manualOrdering ? `<button class="row-move" data-action="move-row" data-dir="up" data-code="${esc(c.code)}" title="${esc(c.key)} 위로 이동" aria-label="위로 이동" ${i===firstMovableRow?'disabled':''}>▲</button><button class="row-move" data-action="move-row" data-dir="down" data-code="${esc(c.code)}" title="${esc(c.key)} 아래로 이동" aria-label="아래로 이동" ${i===lastMovableRow?'disabled':''}>▼</button>` : '';
        removeBtn = `<span class="row-actions">${holdingBtn}${moveBtns}<button class="row-x" data-action="remove-row" data-code="${esc(c.code)}" title="${esc(c.key)} 삭제" aria-label="삭제">×</button></span>`;
      } else {
        const orderId = cardOrderId(c);
        const holdingBtn = canHoldCard(c) ? `<button class="row-holding ${holdingFor(c)?'is-set':''}" data-action="edit-holding" data-holding-id="${esc(holdingId(c))}" data-key="${esc(c.key)}" data-price="${esc(c.price??'')}" title="${esc(c.key)} 구매가격/수량" aria-label="구매가격/수량">₩</button>` : '';
        const moveBtns = manualOrdering ? `<button class="row-move" data-action="move-default" data-dir="up" data-order-id="${esc(orderId)}" title="${esc(c.key)} 위로 이동" aria-label="위로 이동" ${i===firstMovableRow?'disabled':''}>▲</button><button class="row-move" data-action="move-default" data-dir="down" data-order-id="${esc(orderId)}" title="${esc(c.key)} 아래로 이동" aria-label="아래로 이동" ${i===lastMovableRow?'disabled':''}>▼</button>` : '';
        removeBtn = `<span class="row-actions">${holdingBtn}${moveBtns}<button class="row-x" data-action="hide-default" data-key="${esc(c.key)}" title="${esc(c.key)} 숨기기" aria-label="숨기기">×</button></span>`;
      }
      const live = liveBadgeHtml(c, session);
      // mood 영역 row 는 옅은 음영으로 구분 (굵은 선 대신)
      const trExtraCls = MOOD_PROTECTED_KEYS.has(c.key) ? ' mood-row' : '';
      const rowOrderId = quoteRowOrderId(c);
      const rowDraggable = manualOrdering;
      const rowDragAttrs = rowDraggable ? ` data-row-order-id="${esc(rowOrderId)}"` : '';
      const rowNumAttrs = rowDraggable ? ` class="rownum quote-row-handle" data-row-order-id="${esc(rowOrderId)}" title="행번호를 끌어서 순서 변경" aria-label="${esc(c.key)} 순서 변경"` : ' class="rownum"';

      const {priceCell, changeCell, changeClass, previewChangeValue, changeTitle} = cardRenderedCells(c);
      const quoteId = quoteTokenForCard(c);
      const tvSymbol = tradingViewSymbolForCard(c);
      const tvTipPreferred = tradingViewTipPreferred(c, tvSymbol) ? '1' : '';
      const tvButton = tvSymbol
        ? `<button class="tv-chart-button" data-action="open-tv-chart" data-token="${esc(quoteId)}" data-tv-symbol="${esc(tvSymbol)}" data-label="${esc(c.key)}" title="${esc(c.key)} TradingView 차트" aria-label="${esc(c.key)} TradingView 차트">차트</button>`
        : '';
      const holdingRows = renderHoldingRows(c, rowNo);
      const holdingGroupCls = holdingRows.html ? ' quote-with-holding' : '';

      let rowHtml = `
    <tr class="${isUser?'user-row'+errCls:''}${trExtraCls}${holdingGroupCls}" data-quote-id="${esc(quoteId)}"${rowDragAttrs} data-chart-label="${esc(c.key)}" data-tv-symbol="${esc(tvSymbol)}" data-tv-tip-preferred="${tvTipPreferred}" data-outlook-badge="${esc(outlookBadgeText(c))}" data-outlook-tone="${esc(outlookBadgeTone(c))}" title="${esc(c.market||'')} · ${esc(c.source||'-')} · ${fmtDt(c.asOf)}">
      <td${rowNumAttrs}>${currentRowNo}</td>
      <td class="left"><div class="metric-cell"><span class="metric-label">${labelHtml}${live}</span>${tvButton}${outlookPreviewHtml(c, previewChangeValue)}<span class="metric-trail ${removeBtn ? 'quote-action-trail' : ''}">${removeBtn}${sourcePillHtml(c)}</span></div></td>
      <td class="right quote-price-cell">${priceCell}</td>
      <td class="right ${changeClass} quote-change-cell"${changeTitle ? ` title="${esc(changeTitle)}"` : ''}>${changeCell}</td>
    </tr>`;
      if(holdingRows.html){
        rowHtml += holdingRows.html;
        rowNo += holdingRows.count;
      }
      return rowHtml;
    }).join('');
  }
  const summaryRow = renderHoldingSummaryRow(cards, rowNo);
  if(summaryRow) rowNo++;
  // 모바일 시세창 하단 광고 — Excel 테이블 안에 두 행을 그대로 더 끼워넣는다.
  // 첫 행은 행번호만 있는 빈 줄 (셀 격자선 유지), 둘째 행은 colspan 으로 광고.
  // updateSummaryTextAd() 가 나중에 .summary-sheet-note-row 의 inner 셀을 채운다.
  // CSS @media(max-width:700px) 에서만 보이고 데스크탑에선 display:none.
  const adBlankRowNo = rowNo++;
  const adContentRowNo = rowNo++;
  const summaryAdRows = `
    <tr class="summary-sheet-note-blank-row" aria-hidden="true">
      <td class="rownum">${adBlankRowNo}</td>
      <td class="left"></td>
      <td class="right"></td>
      <td class="right"></td>
    </tr>
    <tr class="summary-sheet-note-row" data-xk-area="summary" data-xk-position="summary-bottom" data-xk-id="sponsor-open" data-xk-label="알림" data-xk-variant-index="0" data-xk-variant-text="이곳에 한줄 광고를 넣어주실 광고주를 모십니다.">
      <td class="rownum">${adContentRowNo}</td>
      <td class="left summary-sheet-note-cell" colspan="3">
        <span class="notice-badge" data-xk-label>알림</span>
        <span class="community-text-note"><a class="notice-copy" href="mailto:excelkospi@outlook.com" data-xk-click="1">이곳에 한줄 광고를 넣어주실 광고주를 모십니다.</a></span>
      </td>
    </tr>`;
  // 데스크탑은 짧은 목록에서도 엑셀 시트처럼 충분한 빈 행을 남긴다.
  // 실제 종목 수는 제한하지 않고, 80행보다 짧을 때만 패딩한다.
  const MIN_VISIBLE_ROWS = 80;
  const renderedCount = rowNo - 2;
  const usedRowIdx = rowNo;
  const padCount = Math.max(0, MIN_VISIBLE_ROWS - renderedCount);
  const empties = makeEmptyRows(usedRowIdx, padCount, 3);
  return header + rows + summaryRow + summaryAdRows + empties;
}
