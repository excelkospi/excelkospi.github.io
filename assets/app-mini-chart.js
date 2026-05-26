// Lightweight hover/tap mini charts for quote rows and stock mentions.

const miniChartCache=new Map();
let miniChartEl=null;
let miniChartTimer=null;
let miniChartToken='';
let miniChartMode='hover';
let miniChartTouchPoint=null;

function miniChartSupported(){
  return !!window.matchMedia?.('(hover:hover) and (pointer:fine)')?.matches;
}

function miniChartTouchSupported(){
  return !!window.matchMedia?.('(hover:none), (pointer:coarse)')?.matches;
}

function cardForQuoteToken(token){
  const normalized = normalizeQuoteToken(token);
  if(!normalized) return null;
  return lastRenderedCards.find((card)=>quoteTokenForCard(card)===normalized)
    || (lastSnapshot?.cards || []).find((card)=>quoteTokenForCard(card)===normalized)
    || null;
}

function hideMiniChart(){
  if(miniChartTimer){
    clearTimeout(miniChartTimer);
    miniChartTimer=null;
  }
  miniChartToken='';
  miniChartMode='hover';
  miniChartTouchPoint=null;
  miniChartEl?.remove();
  miniChartEl=null;
}

function positionMiniChart(row){
  if(!miniChartEl || !row) return;
  if(miniChartMode==='touch'){
    const width=Math.min(360, Math.max(260, window.innerWidth - 24));
    const rect=row.getBoundingClientRect();
    const point=miniChartTouchPoint || {
      x: rect.left + rect.width / 2,
      y: rect.top + Math.min(rect.height / 2, 44),
    };
    const height=Math.max(158, Math.min(220, miniChartEl.offsetHeight || 174));
    const margin=8;
    let left=point.x - width / 2;
    left=Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    let top=point.y - height - 10;
    if(top < margin) top=point.y + 12;
    top=Math.max(margin, Math.min(top, window.innerHeight - height - margin));
    miniChartEl.style.width=`${Math.round(width)}px`;
    miniChartEl.style.left=`${Math.round(left)}px`;
    miniChartEl.style.top=`${Math.round(top)}px`;
    miniChartEl.style.bottom='auto';
    return;
  }
  const rect=row.getBoundingClientRect();
  const width=260;
  const height=158;
  let left=rect.right + 10;
  if(left + width > window.innerWidth - 10) left=rect.left - width - 10;
  if(left < 10) left=Math.min(Math.max(10, window.innerWidth - width - 10), rect.left + 10);
  let top=rect.top - 10;
  if(top + height > window.innerHeight - 10) top=window.innerHeight - height - 10;
  if(top < 10) top=10;
  miniChartEl.style.left=`${Math.round(left)}px`;
  miniChartEl.style.top=`${Math.round(top)}px`;
}

function miniChartCloseButton(){
  return miniChartMode==='touch' ? '<button class="mini-chart-close" type="button" data-mini-chart-close aria-label="차트 닫기">×</button>' : '';
}

function bindMiniChartChrome(){
  miniChartEl?.querySelector?.('[data-mini-chart-close]')?.addEventListener('click', hideMiniChart);
}

function ensureMiniChart(row, token, label, mode='hover'){
  miniChartMode=mode;
  if(!miniChartEl){
    miniChartEl=document.createElement('div');
    miniChartEl.setAttribute('role','presentation');
    document.body.appendChild(miniChartEl);
  }
  miniChartEl.className=`mini-chart-popover${mode==='touch'?' is-touch':''}`;
  miniChartEl.dataset.token=token;
  miniChartEl.innerHTML=`<div class="mini-chart-head"><span class="mini-chart-title"><strong>${esc(label || '차트')}</strong></span><span>불러오는 중</span>${miniChartCloseButton()}</div><div class="mini-chart-loading"></div>`;
  bindMiniChartChrome();
  positionMiniChart(row);
}

function miniChartY(value, min, max, py, innerH){
  const range=(max-min) || 1;
  return py + (1 - ((value-min)/range)) * innerH;
}

function miniChartPath(points, min, max){
  const w=242, h=82, px=8, py=8;
  const innerW=w - px * 2;
  const innerH=h - py * 2;
  return points.map((p,i)=>{
    const x=px + (i/(points.length-1 || 1)) * innerW;
    const y=miniChartY(p[1], min, max, py, innerH);
    return `${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function miniChartDisplayChange(card, data){
  const visibleRaw = card ? changeValueFor(card) : null;
  const visible = Number(visibleRaw);
  if(visibleRaw !== null && visibleRaw !== undefined && Number.isFinite(visible)) return visible;
  const chart = Number(data?.changePct);
  return Number.isFinite(chart) ? chart : null;
}

function miniChartBaseline(card, data, displayChange){
  const price = Number(card?.price ?? data?.last);
  const change = Number(displayChange);
  if(!Number.isFinite(price) || !Number.isFinite(change) || change <= -99.9) return null;
  return price / (1 + change / 100);
}

function miniChartFootPriceText(card, data){
  const last=Number(data?.last);
  if(!Number.isFinite(last)) return '-';
  const market=String(card?.market || '').toUpperCase();
  const comparableUsStock = market === 'US'
    && !card?.priceUnit
    && !US_KRW_DISPLAY_EXCLUDED_KEYS.has(card?.key)
    && !isIndexLikeCard(card);
  if(comparableUsStock){
    const fx=Number(usdKrwRate());
    if(usKrwDisplayEnabled()){
      return `$${num(last)}`;
    }
    if(Number.isFinite(fx) && fx > 0){
      return `₩${numKrw(last * fx)}`;
    }
  }
  const currency = card ? priceCellCurrencyMark(card) : '';
  return `${currency || ''}${num(last)}`;
}

function renderMiniChartSvg(data, baseline=null, displayChange=null){
  const points=Array.isArray(data?.points) ? data.points : [];
  if(points.length < 2) return '<div class="mini-chart-empty">차트 데이터 없음</div>';
  const rawMin=Number(data.min);
  const rawMax=Number(data.max);
  const hasBaseline=Number.isFinite(Number(baseline));
  const min=hasBaseline ? Math.min(rawMin, Number(baseline)) : rawMin;
  const max=hasBaseline ? Math.max(rawMax, Number(baseline)) : rawMax;
  const path=miniChartPath(points, min, max);
  const changeForTone=Number(displayChange ?? data.changePct);
  const color=changeForTone > 0 ? '#8f4f4f' : (changeForTone < 0 ? '#4d6f8d' : '#605e5c');
  const area=`${path} L234 72 L8 72 Z`;
  const baseLine=hasBaseline ? `<path class="mini-chart-baseline" d="M8 ${miniChartY(Number(baseline), min, max, 8, 66).toFixed(1)}H234"/>` : '';
  return `<svg class="mini-chart-svg" viewBox="0 0 242 82" aria-hidden="true">
    <path class="mini-chart-grid" d="M8 18H234M8 44H234M8 72H234"/>
    ${baseLine}
    <path class="mini-chart-area" d="${area}" fill="${color}" opacity=".10"/>
    <path class="mini-chart-line" d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderMiniChart(row, token, data){
  if(!miniChartEl || miniChartToken!==token) return;
  const card=cardForQuoteToken(token);
  const label=row?.dataset?.chartLabel || card?.key || data.code || '차트';
  const change=miniChartDisplayChange(card, data);
  const klass=cls(change);
  const baseline=miniChartBaseline(card, data, change);
  const source=[data.source, data.range, fmtDt(data.asOf)].filter(Boolean).join(' · ');
  miniChartEl.innerHTML=`
    <div class="mini-chart-head">
      <span class="mini-chart-title"><strong>${esc(label)}</strong></span>
      <span class="${klass}">${pct(change)}</span>
      ${miniChartCloseButton()}
    </div>
    ${renderMiniChartSvg(data, baseline, change)}
    <div class="mini-chart-foot">
      <span>${esc(source)}</span>
      <b>${esc(miniChartFootPriceText(card, data))}</b>
    </div>`;
  bindMiniChartChrome();
  positionMiniChart(row);
}

async function loadMiniChart(row, token){
  if(!featureEnabled('chart')){
    if(Date.now() - Number(window.__chartDisabledToastAt || 0) > 5000){
      window.__chartDisabledToastAt = Date.now();
      showToast('트래픽 폭증으로 차트를 잠시 쉬고 있습니다', 'warn');
    }
    if(miniChartEl && miniChartToken===token){
      miniChartEl.innerHTML='<div class="mini-chart-empty">차트 기능 일시 정지</div>';
      positionMiniChart(row);
    }
    return;
  }
  const cached=miniChartCache.get(token);
  if(cached && Date.now()-cached.at < MINI_CHART_CACHE_TTL_MS){
    renderMiniChart(row, token, cached.data);
    return;
  }
  try{
    const data=await fetchJsonClient('/api/chart?token=' + encodeURIComponent(token), 5000);
    if(!data?.ok) throw new Error(data?.error || 'chart_failed');
    miniChartCache.set(token, {at:Date.now(), data});
    renderMiniChart(row, token, data);
  }catch(_){
    if(miniChartEl && miniChartToken===token){
      if(cached?.data){
        renderMiniChart(row, token, cached.data);
      }else{
        miniChartEl.innerHTML='<div class="mini-chart-empty">차트를 불러오지 못했어요</div>';
        positionMiniChart(row);
      }
    }
  }
}

function setupMiniChartHover(){
  const canHover=miniChartSupported();
  const canTouch=miniChartTouchSupported();
  if(!canHover && !canTouch) return;
  document.querySelectorAll('#cardsTable tr[data-quote-id]').forEach((row)=>{
    if(row.dataset.miniChartBound === '1') return;
    const token=row.dataset.quoteId || '';
    if(!token) return;
    row.dataset.miniChartBound = '1';
    if(canHover){
      row.addEventListener('mouseenter', ()=>{
        miniChartToken=token;
        miniChartTimer=setTimeout(()=>{
          ensureMiniChart(row, token, row.dataset.chartLabel, 'hover');
          loadMiniChart(row, token);
        }, MINI_CHART_HOVER_DELAY_MS);
      });
      row.addEventListener('mousemove', ()=>positionMiniChart(row));
      row.addEventListener('mouseleave', hideMiniChart);
    }
    if(canTouch){
      row.querySelectorAll('.quote-price-cell,.quote-change-cell').forEach((cell)=>{
        cell.addEventListener('click', (ev)=>{
          ev.preventDefault();
          ev.stopImmediatePropagation();
          if(miniChartEl && miniChartToken===token && miniChartMode==='touch'){
            hideMiniChart();
            return;
          }
          miniChartToken=token;
          miniChartTouchPoint={x:ev.clientX,y:ev.clientY};
          ensureMiniChart(row, token, row.dataset.chartLabel, 'touch');
          loadMiniChart(row, token);
        });
      });
    }
  });
}

function setupStockMentionMiniChartHover(root=document){
  if(!miniChartSupported()) return;
  const scope = root?.querySelectorAll ? root : document;
  scope.querySelectorAll('.stock-mention-badge[data-stock-mention-token]').forEach((el)=>{
    if(el.dataset.miniChartBound === '1') return;
    el.dataset.miniChartBound = '1';
    const token = el.dataset.stockMentionToken || '';
    if(!token) return;
    el.addEventListener('mouseenter', ()=>{
      miniChartToken = token;
      miniChartTimer = setTimeout(()=>{
        ensureMiniChart(el, token, el.dataset.chartLabel || el.textContent || '차트', 'hover');
        loadMiniChart(el, token);
      }, MINI_CHART_HOVER_DELAY_MS);
    });
    el.addEventListener('mousemove', ()=>positionMiniChart(el));
    el.addEventListener('mouseleave', hideMiniChart);
  });
}
