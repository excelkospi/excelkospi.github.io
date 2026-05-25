// Excel-style cell selection and copy behavior for sheet tables.

const EXCEL_CELL_SELECTION_CLASSES = ['selected-cell','excel-selected-cell','excel-range-cell','excel-active-cell','excel-row-selected','excel-col-selected','excel-range-top','excel-range-bottom','excel-range-left','excel-range-right','excel-range-bottomright'];
let excelCellSelection = null;
let excelCellCopyBound = false;
let excelCellSelectionViewportBound = false;
let excelCellSelectionFrame = 0;

function excelColumnName(index){
  let n = Math.max(1, Math.floor(Number(index) || 1));
  let label = '';
  while(n > 0){
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

function cellSelectionInteractiveTarget(target){
  return !!target?.closest?.('button,input,select,textarea,label,[contenteditable="true"],.tv-chart-button,.community-image-toggle,.message-image-preview,.message-image-thumb');
}

function isSelectableSheetCell(cell){
  if(!cell || !cell.closest?.('.sheet')) return false;
  if(cell.classList.contains('rownum')) return false;
  if(cell.matches('th')) return false;
  if(cell.closest('.chat-panel,.outlook-app')) return false;
  if(cell.closest('#timelineTable.community-table .community-colhead-row,#timelineTable.community-table .community-subhead-row')) return false;
  return cell.matches('td');
}

function buildCellSelectionGrid(table){
  const map = new Map();
  const occupied = new Set();
  Array.from(table?.rows || []).forEach((row, rowIndex)=>{
    let col = 0;
    Array.from(row.cells || []).forEach((cell)=>{
      while(occupied.has(`${rowIndex}:${col}`)) col += 1;
      const colSpan = Math.max(1, Number(cell.colSpan) || 1);
      const rowSpan = Math.max(1, Number(cell.rowSpan) || 1);
      const info = { cell, row:rowIndex, colStart:col, colEnd:col + colSpan - 1, rowEnd:rowIndex + rowSpan - 1 };
      map.set(cell, info);
      for(let r=rowIndex; r<rowIndex + rowSpan; r += 1){
        for(let c=col; c<col + colSpan; c += 1) occupied.add(`${r}:${c}`);
      }
      col += colSpan;
    });
  });
  return map;
}

function cellSelectionInfo(cell){
  const table = cell?.closest?.('table');
  if(!table) return null;
  const grid = buildCellSelectionGrid(table);
  return grid.get(cell) || null;
}

function rowNumberForSelection(table, rowIndex){
  const row = table?.rows?.[rowIndex];
  const raw = row?.querySelector?.('.rownum')?.textContent?.trim?.() || '';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : rowIndex + 1;
}

function selectionAddressFor(table, rowIndex, colIndex){
  return `${excelColumnName(Math.max(1, colIndex))}${rowNumberForSelection(table, rowIndex)}`;
}

function selectionCellLabel(table, info){
  if(!table || !info) return 'A1';
  const start = selectionAddressFor(table, info.row, Math.max(1, info.colStart));
  if(info.colEnd > info.colStart || info.rowEnd > info.row){
    const end = selectionAddressFor(table, info.rowEnd, Math.max(1, info.colEnd));
    return `${start}:${end}`;
  }
  return start;
}

function selectionRangeLabel(table, anchor, focus){
  if(!table || !anchor || !focus) return 'A1';
  const rowMin = Math.min(anchor.row, focus.row);
  const rowMax = Math.max(anchor.rowEnd, focus.rowEnd);
  const colMin = Math.max(1, Math.min(anchor.colStart, focus.colStart));
  const colMax = Math.max(1, Math.max(anchor.colEnd, focus.colEnd));
  const start = selectionAddressFor(table, rowMin, colMin);
  const end = selectionAddressFor(table, rowMax, colMax);
  return start === end ? start : `${start}:${end}`;
}

function cleanCellTextForFormula(cell){
  if(!cell) return '';
  const clone = cell.cloneNode(true);
  clone.querySelectorAll('button,svg,.row-actions,.metric-trail,.outlook-preview,.outlook-mailtime,.community-hover-actions,.community-mobile-actions,.message-image-list,.community-image-preview-slot').forEach((el)=>el.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function clearCellSelection(root=document){
  root.querySelectorAll('.selected-cell,.excel-selected-cell,.excel-range-cell,.excel-active-cell,.excel-row-selected,.excel-col-selected,.excel-range-top,.excel-range-bottom,.excel-range-left,.excel-range-right,.excel-range-bottomright').forEach((el)=>{
    EXCEL_CELL_SELECTION_CLASSES.forEach((cls)=>el.classList.remove(cls));
  });
  root.querySelectorAll?.('.excel-selection-outline')?.forEach((el)=>el.remove());
}

function sheetForSelectionTable(table){
  return table?.closest?.('.sheet') || table?.parentElement || document.body;
}

function selectionHeaderCellForColumn(table, grid, colIndex){
  for(const [cell, info] of grid.entries()){
    if(!cell.classList?.contains('colhead')) continue;
    if(info.colStart <= colIndex && info.colEnd >= colIndex) return cell;
  }
  return null;
}

function selectionBoundaryFromCells(grid, rowMin, rowMax, colMin, colMax){
  const rects = [];
  grid.forEach((info, cell)=>{
    if(!isSelectableSheetCell(cell)) return;
    const intersectsRow = info.rowEnd >= rowMin && info.row <= rowMax;
    const intersectsCol = info.colEnd >= colMin && info.colStart <= colMax;
    if(intersectsRow && intersectsCol) rects.push(cell.getBoundingClientRect());
  });
  if(!rects.length) return null;
  return {
    left: Math.min(...rects.map((rect)=>rect.left)),
    right: Math.max(...rects.map((rect)=>rect.right)),
    top: Math.min(...rects.map((rect)=>rect.top)),
    bottom: Math.max(...rects.map((rect)=>rect.bottom)),
  };
}

function updateCellSelectionOutline(table, grid, rowMin, rowMax, colMin, colMax){
  const sheet = sheetForSelectionTable(table);
  if(!sheet || !table?.isConnected) return;
  sheet.querySelectorAll?.(':scope > .excel-selection-outline')?.forEach((el)=>el.remove());

  const rowStart = table.rows?.[rowMin];
  const rowEnd = table.rows?.[rowMax];
  if(!rowStart || !rowEnd) return;

  const fallback = selectionBoundaryFromCells(grid, rowMin, rowMax, colMin, colMax);
  if(!fallback) return;
  const leftHeader = selectionHeaderCellForColumn(table, grid, colMin);
  const rightHeader = selectionHeaderCellForColumn(table, grid, colMax);
  const leftRect = leftHeader?.getBoundingClientRect?.();
  const rightRect = rightHeader?.getBoundingClientRect?.();
  const topRect = rowStart.getBoundingClientRect();
  const bottomRect = rowEnd.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const sheetRect = sheet.getBoundingClientRect();

  const viewportLeft = Math.max(tableRect.left, leftRect?.left ?? fallback.left);
  const viewportRight = Math.min(tableRect.right, rightRect?.right ?? fallback.right);
  const viewportTop = Math.max(tableRect.top, topRect.top);
  const viewportBottom = Math.min(tableRect.bottom, bottomRect.bottom);
  const width = Math.max(0, viewportRight - viewportLeft);
  const height = Math.max(0, viewportBottom - viewportTop);
  if(width < 1 || height < 1) return;

  const outline = document.createElement('div');
  outline.className = 'excel-selection-outline';
  outline.setAttribute('aria-hidden', 'true');
  outline.style.left = `${viewportLeft - sheetRect.left + (sheet.scrollLeft || 0)}px`;
  outline.style.top = `${viewportTop - sheetRect.top + (sheet.scrollTop || 0)}px`;
  outline.style.width = `${width}px`;
  outline.style.height = `${height}px`;
  sheet.appendChild(outline);
}

function applyCellSelection(){
  const state = excelCellSelection;
  if(!state?.table || !state?.anchor || !state?.focus || !document.contains(state.table)){
    clearCellSelection();
    excelCellSelection = null;
    return;
  }
  const { table, anchor, focus } = state;
  if(!table.contains(anchor.cell) || !table.contains(focus.cell)){
    clearCellSelection();
    excelCellSelection = null;
    return;
  }
  const grid = buildCellSelectionGrid(table);
  const rowMin = Math.min(anchor.row, focus.row);
  const rowMax = Math.max(anchor.rowEnd, focus.rowEnd);
  const colMin = Math.max(1, Math.min(anchor.colStart, focus.colStart));
  const colMax = Math.max(1, Math.max(anchor.colEnd, focus.colEnd));
  const isRange = rowMin !== rowMax || colMin !== colMax;

  clearCellSelection();
  grid.forEach((info, cell)=>{
    if(!isSelectableSheetCell(cell)) return;
    const intersectsRow = info.rowEnd >= rowMin && info.row <= rowMax;
    const intersectsCol = info.colEnd >= colMin && info.colStart <= colMax;
    if(!intersectsRow || !intersectsCol) return;
    cell.classList.add('selected-cell','excel-selected-cell');
    if(isRange){
      cell.classList.add('excel-range-cell');
      // 범위 테두리는 셀별 border가 아니라 단일 overlay로 그린다.
      // 병합 셀, 댓글, 광고 행이 섞여도 초록 선이 끊기지 않게 하기 위해서다.
      if(info.rowEnd === rowMax && info.colEnd === colMax) cell.classList.add('excel-range-bottomright');
    }
    if(cell === focus.cell) cell.classList.add('excel-active-cell');
  });
  updateCellSelectionOutline(table, grid, rowMin, rowMax, colMin, colMax);
  Array.from(table.rows || []).forEach((row, rowIndex)=>{
    const rowNum = row.querySelector?.('.rownum');
    if(rowNum && rowIndex >= rowMin && rowIndex <= rowMax) rowNum.classList.add('excel-row-selected');
  });
  Array.from(table.rows?.[0]?.cells || []).forEach((cell)=>{
    const info = grid.get(cell);
    if(!info || !cell.classList.contains('colhead')) return;
    if(info.colEnd >= colMin && info.colStart <= colMax) cell.classList.add('excel-col-selected');
  });

  const nameBox = document.getElementById('nameBox');
  if(nameBox) nameBox.textContent = isRange ? selectionRangeLabel(table, anchor, focus) : selectionCellLabel(table, focus);
  const formulaBox = document.getElementById('formulaBox');
  if(formulaBox){
    const text = cleanCellTextForFormula(focus.cell);
    formulaBox.textContent = text || '=MARKETBRIEF(AUTO)';
  }
}

function scheduleCellSelectionOutlineUpdate(){
  if(!excelCellSelection) return;
  if(excelCellSelectionFrame) return;
  excelCellSelectionFrame = requestAnimationFrame(()=>{
    excelCellSelectionFrame = 0;
    if(excelCellSelection) applyCellSelection();
  });
}

function selectedCellRangeText(){
  const state = excelCellSelection;
  if(!state?.table || !state?.anchor || !state?.focus || !document.contains(state.table)) return '';
  const { table, anchor, focus } = state;
  const grid = buildCellSelectionGrid(table);
  const rowMin = Math.min(anchor.row, focus.row);
  const rowMax = Math.max(anchor.rowEnd, focus.rowEnd);
  const colMin = Math.max(1, Math.min(anchor.colStart, focus.colStart));
  const colMax = Math.max(1, Math.max(anchor.colEnd, focus.colEnd));
  const rows = [];
  for(let r=rowMin; r<=rowMax; r += 1){
    const values = [];
    for(let c=colMin; c<=colMax; c += 1){
      let value = '';
      for(const info of grid.values()){
        if(info.row <= r && info.rowEnd >= r && info.colStart <= c && info.colEnd >= c && isSelectableSheetCell(info.cell)){
          value = (info.row === r && info.colStart === c) ? cleanCellTextForFormula(info.cell) : '';
          break;
        }
      }
      values.push(value);
    }
    rows.push(values.join('\t'));
  }
  return rows.join('\n');
}

function handleCellSelectionCopy(ev){
  if(!excelCellSelection) return;
  if(ev.target?.closest?.('input,textarea,[contenteditable="true"]')) return;
  const text = selectedCellRangeText();
  if(!text) return;
  ev.clipboardData?.setData('text/plain', text);
  ev.preventDefault();
}

function cellFromSelectionPoint(table, x, y){
  const el = document.elementFromPoint(x, y);
  const cell = el?.closest?.('td,th');
  return cell && table.contains(cell) && isSelectableSheetCell(cell) ? cell : null;
}

function beginCellSelection(ev){
  if(ev.button !== 0) return;
  if(ev.pointerType === 'touch') return;
  if(cellSelectionInteractiveTarget(ev.target)) return;
  const cell = ev.target?.closest?.('td,th');
  if(!isSelectableSheetCell(cell)) return;
  const table = cell.closest('table');
  const anchor = cellSelectionInfo(cell);
  if(!table || !anchor) return;
  const etfRow = cell.closest?.('tr.etf-data-row[data-etf-detail-key]');
  if(table.id === 'timelineTable' && timelineIsEtf() && etfRow){
    ev.preventDefault();
    const key=String(etfRow.dataset.etfDetailKey || '');
    toggleEtfDetailKey(key);
    return;
  }
  const linkTarget = ev.target?.closest?.('a[href]');
  const startedOnLink = !!(linkTarget && cell.contains(linkTarget));
  const startX = ev.clientX;
  const startY = ev.clientY;
  let movedEnough = false;
  ev.preventDefault();
  excelCellSelection = { table, anchor, focus:anchor, pointerId:ev.pointerId, dragging:false };
  document.body.classList.add('sheet-cell-selecting');
  applyCellSelection();

  const move = (moveEv)=>{
    if(excelCellSelection?.pointerId !== ev.pointerId) return;
    const dx = Math.abs(moveEv.clientX - startX);
    const dy = Math.abs(moveEv.clientY - startY);
    if(!movedEnough && Math.max(dx, dy) < 4) return;
    movedEnough = true;
    excelCellSelection.dragging = true;
    const nextCell = cellFromSelectionPoint(table, moveEv.clientX, moveEv.clientY);
    if(!nextCell){
      moveEv.preventDefault();
      return;
    }
    const nextInfo = cellSelectionInfo(nextCell);
    if(!nextInfo) return;
    moveEv.preventDefault();
    if(excelCellSelection.focus?.cell === nextCell) return;
    excelCellSelection.focus = nextInfo;
    applyCellSelection();
  };
  const finish = ()=>{
    if(excelCellSelection?.pointerId === ev.pointerId) excelCellSelection.dragging = false;
    document.body.classList.remove('sheet-cell-selecting');
    try{ table.releasePointerCapture?.(ev.pointerId); }catch{}
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    if(startedOnLink && !movedEnough){
      const href = linkTarget?.href || '';
      if(href){
        if(linkTarget.target === '_blank') window.open(href, '_blank', 'noopener');
        else location.href = href;
      }
    }else if(startedOnLink && movedEnough){
      const suppressClick = (clickEv)=>{
        if(clickEv.target?.closest?.('a[href]') === linkTarget){
          clickEv.preventDefault();
          clickEv.stopPropagation();
        }
        document.removeEventListener('click', suppressClick, true);
      };
      document.addEventListener('click', suppressClick, true);
      setTimeout(()=>document.removeEventListener('click', suppressClick, true), 0);
    }
  };
  try{ table.setPointerCapture?.(ev.pointerId); }catch{}
  window.addEventListener('pointermove', move, {passive:false});
  window.addEventListener('pointerup', finish, {passive:false});
  window.addEventListener('pointercancel', finish, {passive:false});
}

function enableCellSelection(){
  document.querySelectorAll('.sheet table').forEach((table)=>{
    if(table.dataset.cellSelectionBound === '1') return;
    table.dataset.cellSelectionBound = '1';
    table.addEventListener('pointerdown', beginCellSelection);
  });
  if(!excelCellCopyBound){
    excelCellCopyBound = true;
    document.addEventListener('copy', handleCellSelectionCopy);
  }
  if(!excelCellSelectionViewportBound){
    excelCellSelectionViewportBound = true;
    window.addEventListener('resize', scheduleCellSelectionOutlineUpdate, { passive:true });
    window.addEventListener('scroll', scheduleCellSelectionOutlineUpdate, { passive:true, capture:true });
  }
  if(excelCellSelection?.table && !document.contains(excelCellSelection.table)) excelCellSelection = null;
  if(excelCellSelection) applyCellSelection();
}
