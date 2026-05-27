// TradingView chart embed behavior for quote rows.

let tradingViewWarningAccepted=false;
let tradingViewActiveToken='';
let mobileTradingViewRow=null;
let mobileTradingViewToken='';

function tradingViewSymbolForCard(card){
  const token=quoteTokenForCard(card);
  if(!token) return '';
  const [rawCode, market] = token.split(':');
  const code=String(rawCode || '').toUpperCase().trim();
  if(!code) return '';
  // TradingView free widgets show "only available on TradingView" for many KRX,
  // index, and futures symbols. Keep buttons only where the embed is reliable.
  if(market === 'KR') return '';
  if(market === 'COIN'){
    const symbol = code.endsWith('USDT') ? code : `${code.replace(/USD$/,'')}USDT`;
    return /^[A-Z0-9]+USDT$/.test(symbol) ? `BINANCE:${symbol}` : '';
  }
  if(market === 'US'){
    if(code.startsWith('^') || /=F$/.test(code) || code.includes('=')) return '';
    const session = lastSnapshot?.session || clientSessionCode();
    const exchangePrefix = sessionHas(session, 'US_DAY') ? 'BOATS' : '';
    const nasdaq = new Set(['AAPL','AMZN','AMD','GOOG','GOOGL','INTC','META','MSFT','NFLX','NVDA','QQQ','TQQQ','TSLA']);
    const amex = new Set(['ARKK','DIA','EWY','GLD','IWM','IVV','KORU','SLV','SOXL','SOXS','SPY','SQQQ','TNA','UPRO','VOO','XLE','XLK']);
    if(exchangePrefix && /^[A-Z.]{1,8}$/.test(code)) return `${exchangePrefix}:${code}`;
    if(nasdaq.has(code)) return `NASDAQ:${code}`;
    if(amex.has(code)) return `AMEX:${code}`;
    if(/^[A-Z.]{1,8}$/.test(code)) return `NASDAQ:${code}`;
  }
  return '';
}

function tradingViewTipPreferred(card, symbol){
  if(!symbol) return false;
  const token=quoteTokenForCard(card);
  const key=String(card?.key || '').toUpperCase();
  const code=String(card?.code || '').toUpperCase();
  if(card?.userAdded && /^(NASDAQ|NYSE|AMEX|BINANCE):/.test(symbol)) return true;
  if(token === 'AAPL:US' || code === 'AAPL' || key === 'APPLE') return true;
  if(token === 'BTC:COIN' || key === 'BTC' || key === 'BTC(USD)') return true;
  return false;
}

function tradingViewTheme(){
  return document.body.classList.contains('excel-dark-mode') && !document.body.classList.contains('theme-outlook') ? 'dark' : 'light';
}

function confirmTradingViewChartOnce(){
  if(mobileTradingViewSupported()) return true;
  if(tradingViewWarningAccepted) return true;
  let ok=false;
  try{ ok = window.confirm('차트를 펼칩니다. 사무실에서 이용 시 후방에 주의해주세요'); }
  catch{ ok = true; }
  if(ok) tradingViewWarningAccepted = true;
  return ok;
}

function applyTradingViewActiveRow(){
  document.querySelectorAll('#cardsTable tr[data-quote-id]').forEach((row)=>{
    row.classList.toggle('tv-chart-active', !!tradingViewActiveToken && row.dataset.quoteId === tradingViewActiveToken);
  });
}

function clampTradingViewHeight(value){
  return Math.max(180, Math.min(560, Math.round(Number(value) || 250)));
}

function applyTradingViewHeight(height){
  const panel=document.getElementById('tvChartPanel');
  if(!panel) return;
  const px=clampTradingViewHeight(height);
  panel.style.setProperty('--tv-chart-height', `${px}px`);
  panel.style.height = `${px}px`;
  panel.style.flexBasis = `${px}px`;
}

function readTradingViewHeight(){
  try{ return clampTradingViewHeight(localStorage.getItem(TV_CHART_HEIGHT_KEY)); }
  catch{ return 250; }
}

function saveTradingViewHeight(height){
  const px=clampTradingViewHeight(height);
  try{
    localStorage.setItem(TV_CHART_HEIGHT_KEY, String(px));
    persistSet(TV_CHART_HEIGHT_KEY, String(px));
  }catch{}
}

function closeTradingViewChart(){
  const panel=document.getElementById('tvChartPanel');
  const widget=document.getElementById('tvChartWidget');
  tradingViewActiveToken='';
  if(panel) panel.hidden = true;
  if(widget){
    delete widget.dataset.tvLoadToken;
    widget.innerHTML = '';
  }
  applyTradingViewActiveRow();
}

function tradingViewWidgetConfig(symbol){
  return {
    autosize:true,
    symbol,
    interval:'D',
    timezone:'Asia/Seoul',
    theme:tradingViewTheme(),
    style:'1',
    locale:'kr',
    allow_symbol_change:true,
    calendar:false,
    support_host:'https://www.tradingview.com',
  };
}

function safariTradingViewIsolationRequired(){
  const ua = navigator.userAgent || '';
  return /Safari/i.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android)/i.test(ua);
}

// 첫 차트를 띄울 때 Safari WebKit 이 iframe 합성기와 sandbox 초기화 비용을
// 한 번에 처리하면서 잠깐 멈춘 적이 있었다. 첫 마운트 직전에 hidden 한
// noop iframe 으로 합성기를 warm-up 해 두면 본 차트 iframe 의 첫 패스가
// 부드러워진다. requestIdleCallback 이 있으면 그쪽으로 미룬다.
let tradingViewIsolationWarmed = false;
function warmIsolatedTradingView(){
  if(tradingViewIsolationWarmed) return;
  tradingViewIsolationWarmed = true;
  try{
    const warm = document.createElement('iframe');
    warm.setAttribute('aria-hidden', 'true');
    warm.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    warm.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:2px;height:2px;border:0;opacity:0;pointer-events:none';
    warm.srcdoc = '<!doctype html><meta charset="utf-8"><body></body>';
    document.body?.appendChild(warm);
    setTimeout(()=>{ try{ warm.remove(); }catch{} }, 4000);
  }catch{}
}

function tradingViewFrameSrcdoc(config){
  const payload = JSON.stringify(config).replace(/</g, '\\u003c');
  const bg = tradingViewTheme() === 'dark' ? '#11161b' : '#ffffff';
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${bg}}.tradingview-widget-container,.tradingview-widget-container__widget{width:100%;height:100%}</style></head><body><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div><script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>${payload}</script></div></body></html>`;
}

function renderIsolatedTradingViewWidget(widget, config){
  const token = `${config.symbol}:${Date.now()}`;
  widget.dataset.tvLoadToken = token;
  warmIsolatedTradingView();
  // Safari 합성기에 한 박자 더 여유를 준다.
  window.setTimeout(()=>{
    if(widget.dataset.tvLoadToken !== token) return;
    const frame = document.createElement('iframe');
    frame.className = 'tv-chart-frame';
    frame.title = `${config.symbol} TradingView chart`;
    frame.loading = 'eager';
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
    frame.srcdoc = tradingViewFrameSrcdoc(config);
    widget.replaceChildren(frame);
  }, 280);
}

function renderTradingViewWidgetIn(widget, symbol){
  if(!widget) return;
  widget.innerHTML = '<div class="tv-chart-loading">TradingView 차트를 불러오는 중...</div>';
  const config = tradingViewWidgetConfig(symbol);
  if(safariTradingViewIsolationRequired()){
    renderIsolatedTradingViewWidget(widget, config);
    return;
  }
  const container=document.createElement('div');
  container.className='tradingview-widget-container';
  container.style.cssText='height:100%;width:100%;';
  const inner=document.createElement('div');
  inner.className='tradingview-widget-container__widget';
  inner.style.cssText='height:100%;width:100%;';
  const script=document.createElement('script');
  script.type='text/javascript';
  script.async=true;
  script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.textContent=JSON.stringify(config);
  container.append(inner, script);
  widget.replaceChildren(container);
}

function renderTradingViewWidget(symbol){
  renderTradingViewWidgetIn(document.getElementById('tvChartWidget'), symbol);
}

function openTradingViewChart({token, symbol, label}={}){
  if(!symbol){
    showToast('이 종목은 TradingView 차트 심볼을 아직 찾지 못했어요', 'warn');
    return;
  }
  if(!confirmTradingViewChartOnce()) return;
  hideMiniChart();
  const panel=document.getElementById('tvChartPanel');
  const title=document.getElementById('tvChartTitle');
  if(!panel) return;
  applyTradingViewHeight(readTradingViewHeight());
  tradingViewActiveToken=token || '';
  if(title) title.textContent = `${label || symbol} · ${symbol}`;
  panel.hidden = false;
  panel.dataset.symbol = symbol;
  panel.dataset.token = tradingViewActiveToken;
  renderTradingViewWidget(symbol);
  applyTradingViewActiveRow();
}

function mobileTradingViewSupported(){
  const splitMin = typeof SHEET_SPLIT_DESKTOP_MIN_PX === 'number' ? SHEET_SPLIT_DESKTOP_MIN_PX : 960;
  return !!window.matchMedia?.(`(max-width:${splitMin - 1}px)`)?.matches;
}

function closeMobileTradingViewChart(){
  const widget = mobileTradingViewRow?.querySelector?.('.tv-chart-widget');
  if(widget) delete widget.dataset.tvLoadToken;
  mobileTradingViewRow?.remove();
  mobileTradingViewRow=null;
  mobileTradingViewToken='';
  document.querySelectorAll('#cardsTable tr.tv-chart-active').forEach((row)=>row.classList.remove('tv-chart-active'));
}

function openMobileTradingViewChart(row, {token, symbol, label}={}){
  if(!mobileTradingViewSupported() || !row) return;
  if(!symbol){
    showToast('이 종목은 TradingView 차트 심볼을 아직 찾지 못했어요', 'warn');
    return;
  }
  if(mobileTradingViewToken && mobileTradingViewToken === token){
    closeMobileTradingViewChart();
    return;
  }
  if(!confirmTradingViewChartOnce()) return;
  hideMiniChart();
  closeTradingViewChart();
  closeMobileTradingViewChart();
  const chartRow=document.createElement('tr');
  chartRow.className='mobile-tv-chart-row';
  chartRow.dataset.token=token || '';
  chartRow.innerHTML=`<td class="mobile-tv-chart-cell" colspan="4">
    <div class="mobile-tv-chart-panel">
      <div class="tv-chart-head">
        <div class="tv-chart-title">
          <span class="tv-chart-kicker">TradingView</span>
          <strong>${esc(label || symbol)} · ${esc(symbol)}</strong>
        </div>
        <button class="tv-chart-close" type="button" aria-label="차트 닫기">×</button>
      </div>
      <div class="tv-chart-widget"></div>
    </div>
  </td>`;
  row.insertAdjacentElement('afterend', chartRow);
  mobileTradingViewRow=chartRow;
  mobileTradingViewToken=token || '';
  row.classList.add('tv-chart-active');
  chartRow.querySelector('.tv-chart-close')?.addEventListener('click', closeMobileTradingViewChart);
  renderTradingViewWidgetIn(chartRow.querySelector('.tv-chart-widget'), symbol);
  chartRow.scrollIntoView({block:'nearest'});
}

function setupTradingViewChartButtons(){
  document.querySelectorAll('button[data-action=open-tv-chart]').forEach((btn)=>{
    btn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      openTradingViewChart({
        token: btn.dataset.token || btn.closest('tr')?.dataset?.quoteId || '',
        symbol: btn.dataset.tvSymbol || btn.closest('tr')?.dataset?.tvSymbol || '',
        label: btn.dataset.label || btn.closest('tr')?.dataset?.chartLabel || '',
      });
    });
  });
  applyTradingViewActiveRow();
}

function setupMobileTradingViewRows(){
  document.querySelectorAll('#cardsTable tr[data-quote-id][data-tv-symbol]').forEach((row)=>{
    const label=row.querySelector('.metric-label');
    if(!label || !row.dataset.tvSymbol) return;
    label.addEventListener('click', (ev)=>{
      if(!mobileTradingViewSupported()) return;
      const token = row.dataset.quoteId || '';
      if(mobileTradingViewToken && mobileTradingViewToken === token){
        const anchor = ev.target?.closest?.('a') || label.querySelector('a');
        if(anchor?.href && !ev.target?.closest?.('a')){
          ev.preventDefault();
          ev.stopPropagation();
          window.open(anchor.href, '_blank', 'noopener');
        }
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      openMobileTradingViewChart(row, {
        token,
        symbol: row.dataset.tvSymbol || '',
        label: row.dataset.chartLabel || '',
      });
    });
  });
}

function setupTradingViewResize(){
  const panel=document.getElementById('tvChartPanel');
  const handle=document.getElementById('tvChartResizer');
  if(!panel || !handle) return;
  applyTradingViewHeight(readTradingViewHeight());
  handle.addEventListener('pointerdown', (ev)=>{
    if(mobileTradingViewSupported()) return;
    ev.preventDefault();
    const startY=ev.clientY;
    const startHeight=panel.getBoundingClientRect().height || readTradingViewHeight();
    panel.classList.add('is-resizing');
    handle.setPointerCapture?.(ev.pointerId);
    const move=(moveEv)=>{
      applyTradingViewHeight(startHeight + (moveEv.clientY - startY));
    };
    const done=(doneEv)=>{
      panel.classList.remove('is-resizing');
      handle.releasePointerCapture?.(doneEv.pointerId);
      saveTradingViewHeight(panel.getBoundingClientRect().height || readTradingViewHeight());
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', done);
      window.removeEventListener('pointercancel', done);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', done);
    window.addEventListener('pointercancel', done);
  });
}
