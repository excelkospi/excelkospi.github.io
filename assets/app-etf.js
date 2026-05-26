/* excelkospi ETF browser module
 * Lazy-loaded only when the ETF tab is opened. Keep this file free of
 * server/API dependencies; it uses the public Google Sheets CSV directly
 * with browser localStorage caching.
 */
(function(){
'use strict';

const ETF_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQIxvkjDB3Kwe86uQDR0mUBaAmXrTY9fOVUckyvkYPvxriqGdjfQLwBZ1QghDGH036rtad5bsxXYI8U/pub?gid=0&single=true&output=csv';
const ETF_CACHE_KEY = 'kg_etf_csv_cache_v1';
const ETF_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ETF_PAGE_SIZE = 80;
const ETF_SORT_OPTIONS = new Set(['aum-desc','ret-1m-desc','ret-3m-desc','ret-1y-desc','ret-3y-desc','score-desc','ter-asc','div-desc','volume-value-desc','name-asc']);
const ETF_FILTER_FLAGS = new Set(['monthly','hedge','leverage','inverse','pension','active','covered','new']);
const ETF_TYPE_OPTIONS = ['전체','국내주식','해외주식','채권','레버리지','원자재','부동산','자산배분','금리','통화','기타'];
const ETF_HOLDING_PREVIEW_DESKTOP = 3;
const ETF_HOLDING_PREVIEW_MOBILE = 3;
let etfRows = [];
let etfLoading = false;
let etfError = '';
let etfLoadedAt = 0;
let etfPage = 1;
let etfRenderTimer = null;
let etfLastFilteredCount = 0;
let etfExpandedDetailKey = '';
let etfFilterState = {
  query:'',
  type:'',
  risk:'',
  sort:'aum-desc',
  flags:new Set(),
};

function etfHeaderKey(value){
  return String(value || '')
    .replace(/\uFEFF/g, '')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
    .toLowerCase();
}

function parseEtfCsv(text){
  const rows=[];
  let row=[];
  let cell='';
  let quoted=false;
  const src=String(text || '');
  for(let i=0; i<src.length; i++){
    const ch=src[i];
    if(ch === '"'){
      if(quoted && src[i+1] === '"'){
        cell += '"';
        i += 1;
      }else{
        quoted = !quoted;
      }
      continue;
    }
    if(ch === ',' && !quoted){
      row.push(cell);
      cell='';
      continue;
    }
    if((ch === '\n' || ch === '\r') && !quoted){
      if(ch === '\r' && src[i+1] === '\n') i += 1;
      row.push(cell);
      if(row.some((v)=>String(v || '').trim() !== '')) rows.push(row);
      row=[];
      cell='';
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if(row.some((v)=>String(v || '').trim() !== '')) rows.push(row);
  return rows;
}

function etfRawPick(raw, ...keys){
  for(const key of keys){
    const v = raw[etfHeaderKey(key)];
    if(v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function etfNumber(value){
  const raw=String(value || '').trim();
  if(!raw || raw === '-') return null;
  const match=raw.replace(/−/g, '-').match(/[+-]?\d[\d,]*(?:\.\d+)?/);
  if(!match) return null;
  const n=Number(match[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function etfDateValue(value){
  const raw=String(value || '').trim();
  if(!raw || raw === '-') return '';
  return raw;
}

function etfRiskLevelValue(value){
  const m=String(value || '').match(/(\d)/);
  const n=m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

function etfFlag(value){
  const v=String(value || '').trim().toUpperCase();
  return v === 'O' || v === 'Y' || v === 'TRUE' || v === '1';
}

function etfIsNewListing(openingDate){
  const raw=String(openingDate || '').trim();
  if(!raw || raw === '-') return false;
  const date=new Date(raw.replace(/\./g, '-'));
  if(!Number.isFinite(date.getTime())) return false;
  const diffDays=(Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 90;
}

function normalizeEtfRow(values, headers){
  const raw={};
  headers.forEach((header, idx)=>{ raw[etfHeaderKey(header)] = String(values[idx] || '').trim(); });
  const name=etfRawPick(raw, '종목명');
  const code=etfRawPick(raw, '종목코드');
  const openingDate=etfDateValue(etfRawPick(raw, '상장일'));
  const topHoldings=[1,2,3,4,5].map((idx)=>({
    name:etfRawPick(raw, `TOP${idx}_종목명`),
    weight:etfNumber(etfRawPick(raw, `TOP${idx}_비중`)),
  })).filter((item)=>item.name);
  return {
    risk:etfRawPick(raw, '위험등급'),
    name,
    code,
    type:etfRawPick(raw, '종류') || '기타',
    price:etfNumber(etfRawPick(raw, '현재가(원)')),
    change:etfNumber(etfRawPick(raw, '전일대비(%)')),
    ret1d:etfNumber(etfRawPick(raw, '1일(%)')),
    ret1w:etfNumber(etfRawPick(raw, '1주(%)')),
    ret1m:etfNumber(etfRawPick(raw, '1개월(%)')),
    ret3m:etfNumber(etfRawPick(raw, '3개월(%)')),
    ret6m:etfNumber(etfRawPick(raw, '6개월(%)')),
    retYtd:etfNumber(etfRawPick(raw, '연초후(%)')),
    ret1y:etfNumber(etfRawPick(raw, '1년(%)', '1년 수익률(%)')),
    ret3y:etfNumber(etfRawPick(raw, '3년(%)')),
    fee:etfNumber(etfRawPick(raw, '총보수(%)')),
    ter:etfNumber(etfRawPick(raw, '합성총보수\n(TER)(%)', '합성총보수(TER)(%)')),
    inav:etfNumber(etfRawPick(raw, 'iNAV(원)\n가격등락(%)', 'iNAV(원)')),
    trackingDiff:etfNumber(etfRawPick(raw, '3개월 괴리율(%)', '괴리율(%)')),
    aum:etfNumber(etfRawPick(raw, '운용규모(억원)')),
    volume:etfNumber(etfRawPick(raw, '거래량(주)')),
    volumeValue:etfNumber(etfRawPick(raw, '거래대금(억원)')),
    distRate:etfNumber(etfRawPick(raw, '분배율(%)')),
    divYield:etfNumber(etfRawPick(raw, '연분배율(%)\n(최근NAV)', '연분배율(%)(최근NAV)')),
    dividend:etfNumber(etfRawPick(raw, '주당 분배금(원)')),
    dividendDate:etfDateValue(etfRawPick(raw, '지급 기준일')),
    dividendAccum:etfNumber(etfRawPick(raw, '누적 분배금(원)\n(최근 1년간)', '누적 분배금(원)(최근 1년간)', '누적분배금')),
    dividendCount:etfNumber(etfRawPick(raw, '지급 횟수(회)\n(최근 1년간)', '지급 횟수(회)(최근 1년간)', '지급횟수')),
    dataDate:etfDateValue(etfRawPick(raw, '데이터기준일')),
    openingDate,
    score:etfNumber(etfRawPick(raw, 'ETF점수')),
    status:etfRawPick(raw, '상태'),
    buyPrice:etfNumber(etfRawPick(raw, '추천매수')),
    sellPrice:etfNumber(etfRawPick(raw, '추천매도')),
    rsi14:etfNumber(etfRawPick(raw, 'RSI14')),
    topHoldings,
    flags:{
      hedge:etfFlag(etfRawPick(raw, '환헷지')),
      exposure:etfFlag(etfRawPick(raw, '환노출')),
      leverage:etfFlag(etfRawPick(raw, '레버리지')),
      inverse:etfFlag(etfRawPick(raw, '인버스')),
      monthly:etfFlag(etfRawPick(raw, '월배당')),
      pension:etfFlag(etfRawPick(raw, '개인연금')) || etfFlag(etfRawPick(raw, '퇴직연금')),
      active:/액티브/i.test(name),
      covered:/커버드콜/i.test(name),
      new:etfIsNewListing(openingDate),
    },
  };
}

function parseEtfRows(csvText){
  const table=parseEtfCsv(csvText);
  if(table.length < 2) return [];
  const headers=table[0];
  return table.slice(1)
    .map((row)=>normalizeEtfRow(row, headers))
    .filter((row)=>row.name && row.code);
}

function readEtfCsvCache(options={}){
  try{
    const raw=localStorage.getItem(ETF_CACHE_KEY);
    if(!raw) return null;
    const obj=JSON.parse(raw);
    if(!obj?.text) return null;
    if(Date.now() - Number(obj.at || 0) > ETF_CACHE_TTL_MS && !options.allowStale) return null;
    return obj;
  }catch{return null;}
}

function writeEtfCsvCache(text){
  try{ localStorage.setItem(ETF_CACHE_KEY, JSON.stringify({ at:Date.now(), text:String(text || '') })); }catch{}
}

function applyEtfCsvText(text, at=Date.now()){
  etfRows=parseEtfRows(text);
  etfLoadedAt=Number(at) || Date.now();
  etfError='';
  etfPage=Math.max(1, Math.min(etfPage, Math.ceil(Math.max(1, etfRows.length) / ETF_PAGE_SIZE)));
}

function etfCompactLayout(){
  return !!window.matchMedia?.('(max-width:700px)')?.matches || document.body?.classList?.contains('timeline-narrow');
}

function etfFilterMatches(row){
  const q=String(etfFilterState.query || '').trim().toLowerCase();
  if(etfFilterState.type && row.type !== etfFilterState.type) return false;
  if(etfFilterState.risk){
    const level=etfRiskLevelValue(row.risk);
    const selected=Number(etfFilterState.risk);
    if(!Number.isFinite(level) || !Number.isFinite(selected) || level < selected) return false;
  }
  if(q){
    const haystack=[
      row.name,
      row.code,
      row.type,
      row.risk,
      row.status,
      ...(row.topHoldings || []).map((item)=>item.name),
    ].join(' ').toLowerCase();
    const tokens=q.split(/[,\s]+/).map((token)=>token.trim()).filter(Boolean);
    if(tokens.length && tokens.some((token)=>!haystack.includes(token))) return false;
  }
  for(const flag of etfFilterState.flags){
    if(!row.flags?.[flag]) return false;
  }
  return true;
}

function etfSortMetric(row, sort){
  if(sort === 'ret-1m-desc') return row.ret1m;
  if(sort === 'ret-3m-desc') return row.ret3m;
  if(sort === 'ret-1y-desc') return row.ret1y;
  if(sort === 'ret-3y-desc') return row.ret3y;
  if(sort === 'score-desc') return row.score;
  if(sort === 'ter-asc') return row.ter ?? row.fee;
  if(sort === 'div-desc') return row.divYield ?? row.distRate;
  if(sort === 'volume-value-desc') return row.volumeValue;
  if(sort === 'name-asc') return row.name;
  return row.aum;
}

function filteredEtfRows(){
  const sort=ETF_SORT_OPTIONS.has(etfFilterState.sort) ? etfFilterState.sort : 'aum-desc';
  const rows=etfRows.filter(etfFilterMatches);
  rows.sort((a,b)=>{
    if(sort === 'name-asc') return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
    const av=etfSortMetric(a, sort);
    const bv=etfSortMetric(b, sort);
    const aOk=Number.isFinite(Number(av));
    const bOk=Number.isFinite(Number(bv));
    if(!aOk && !bOk) return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
    if(!aOk) return 1;
    if(!bOk) return -1;
    if(sort === 'ter-asc') return Number(av) - Number(bv);
    return Number(bv) - Number(av);
  });
  return rows;
}

function etfPctText(value, digits=1){
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  if(Math.abs(n) >= 1000) return `${n>0?'+':''}${n.toFixed(0)}%`;
  return `${n>0?'+':''}${n.toFixed(digits)}%`;
}

function etfNumberText(value, digits=0){
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR', { maximumFractionDigits:digits });
}

function etfPriceText(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  return `${n.toLocaleString('ko-KR', { maximumFractionDigits:0 })}원`;
}

function etfAmountText(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return '-';
  if(Math.abs(n) >= 10000){
    const text=(n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '');
    return `${text}조`;
  }
  return `${n.toLocaleString('ko-KR', { maximumFractionDigits:0 })}억`;
}

function etfCompactDate(value){
  const raw=String(value || '').trim();
  if(!raw || raw === '-') return '';
  const m=raw.match(/^20(\d{2})[-.](\d{2})[-.](\d{2})$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : raw;
}

function etfPctCell(value){
  return `<span class="${cls(value)}">${esc(etfPctText(value))}</span>`;
}

function etfFeeText(row){
  const v=Number.isFinite(Number(row.ter)) ? row.ter : row.fee;
  return Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}%` : '-';
}

function etfDividendText(row){
  const y=Number.isFinite(Number(row.divYield)) ? row.divYield : row.distRate;
  if(Number.isFinite(Number(y))) return `${Number(y).toFixed(1)}%`;
  if(Number.isFinite(Number(row.dividend))) return `${etfNumberText(row.dividend)}원`;
  return '-';
}

function etfDividendShortText(row){
  const y=Number.isFinite(Number(row.divYield)) ? row.divYield : row.distRate;
  if(Number.isFinite(Number(y))) return `${Number(y).toFixed(1)}%`;
  if(Number.isFinite(Number(row.dividend))) return `${etfNumberText(row.dividend)}원`;
  return '-';
}

function etfHoldingKey(row){
  return String(row?.code || row?.name || '').trim();
}

function etfShortHoldingName(name){
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/\(([A-Z0-9._ -]+)\s+[A-Z]{2}\)$/i, '')
    .replace(/\((\d{6})\)$/g, '')
    .trim();
}

function etfHoldingText(row, limit=ETF_HOLDING_PREVIEW_DESKTOP){
  const allItems=(row.topHoldings || []).filter((item)=>item?.name);
  if(!allItems.length) return '<span class="flat">-</span>';
  const items=allItems.slice(0, limit);
  const chipHtml=items.map((item)=>{
    const weight=Number(item.weight);
    const weightHtml=Number.isFinite(weight) ? `<span class="etf-holding-weight">${weight.toFixed(1)}%</span>` : '';
    return `<span class="etf-holding-chip" title="${esc(item.name)}"><span class="etf-holding-name">${esc(etfShortHoldingName(item.name))}</span>${weightHtml}</span>`;
  }).join('');
  return `<span class="etf-holdings-inner"><span class="etf-holding-list">${chipHtml}</span></span>`;
}

function etfFlagSummary(row){
  const pairs=[
    ['monthly','월배당'],
    ['hedge','환헷지'],
    ['exposure','환노출'],
    ['leverage','레버리지'],
    ['inverse','인버스'],
    ['pension','연금가능'],
    ['active','액티브'],
    ['covered','커버드콜'],
    ['new','신규상장'],
  ];
  return pairs.filter(([key])=>row.flags?.[key]).map(([,label])=>label);
}

function etfRiskPill(row){
  const level=etfRiskLevelValue(row?.risk);
  if(!level) return '';
  return `<span class="etf-risk-pill risk-${level}">${level}등급</span>`;
}

function etfDetailItem(label, html, tone=''){
  return `<div class="etf-detail-item${tone ? ` ${tone}` : ''}">
    <span>${esc(label)}</span>
    <strong>${html || '-'}</strong>
  </div>`;
}

function etfDetailSection(title, html, extraClass=''){
  return `<section class="etf-detail-section${extraClass ? ` ${extraClass}` : ''}">
    <div class="etf-detail-title">${esc(title)}</div>
    ${html}
  </section>`;
}

function etfDetailReturnGrid(row){
  const items=[
    ['1일', row.ret1d],
    ['1주', row.ret1w],
    ['1개월', row.ret1m],
    ['3개월', row.ret3m],
    ['6개월', row.ret6m],
    ['YTD', row.retYtd],
    ['1년', row.ret1y],
    ['3년', row.ret3y],
  ];
  return `<div class="etf-detail-return-grid">${items.map(([label,value])=>`
    <div class="etf-detail-return">
      <span>${esc(label)}</span>
      <strong class="${cls(value)}">${esc(etfPctText(value))}</strong>
    </div>`).join('')}</div>`;
}

function etfDetailHoldings(row){
  const items=(row.topHoldings || []).filter((item)=>item?.name).slice(0, 5);
  if(!items.length) return `<div class="etf-detail-empty">구성종목 정보 없음</div>`;
  const maxWeight=Math.max(...items.map((item)=>Number(item.weight) || 0), 0);
  return `<div class="etf-detail-holdings-list">${items.map((item, idx)=>{
    const weight=Number(item.weight);
    const pct=Number.isFinite(weight) ? weight : 0;
    const bar=maxWeight > 0 ? Math.max(2, Math.min(100, (pct / maxWeight) * 100)) : 0;
    return `<div class="etf-detail-holding" style="--etf-holding-bar:${bar.toFixed(1)}%">
      <div class="etf-detail-holding-top">
        <span class="etf-detail-holding-rank">${idx + 1}</span>
        <span class="etf-detail-holding-name" title="${esc(item.name)}">${esc(etfShortHoldingName(item.name))}</span>
        <strong>${Number.isFinite(weight) ? `${weight.toFixed(1)}%` : '-'}</strong>
      </div>
      <div class="etf-detail-holding-bar"><i></i></div>
    </div>`;
  }).join('')}</div>`;
}

function renderEtfDetailRow(row, rowNo, dataCols, compact){
  const tracking=Number(row.trackingDiff);
  const inav=Number(row.inav);
  const score=Number(row.score);
  const trade=etfAmountText(row.volumeValue);
  const flagLabels=etfFlagSummary(row);
  const summaryMeta=[
    row.code,
    row.type,
    row.risk,
    row.status,
    row.dataDate ? `기준 ${etfCompactDate(row.dataDate)}` : '',
  ].filter(Boolean).map((item)=>`<span>${esc(item)}</span>`).join('');
  const hero=`<div class="etf-detail-hero">
    <div class="etf-detail-name">
      <b>${esc(row.name)}</b>
      <span>${summaryMeta || 'ETF 상세정보'}</span>
    </div>
    <div class="etf-detail-price">
      <strong>${esc(etfPriceText(row.price))}</strong>
      <span>1일 ${etfPctCell(row.ret1d)}</span>
    </div>
  </div>`;
  const info=`
    <div class="etf-detail-grid">
      ${etfDetailItem('상장일', esc(etfCompactDate(row.openingDate) || '-'))}
      ${etfDetailItem('위험등급', esc(row.risk || '-'))}
      ${etfDetailItem('상태', esc(row.status || '-'))}
      ${etfDetailItem('ETF 점수', Number.isFinite(score) ? esc(score.toFixed(0)) : '-')}
      ${etfDetailItem('iNAV', Number.isFinite(inav) ? esc(`${etfNumberText(inav)}원`) : '-')}
      ${etfDetailItem('괴리율', Number.isFinite(tracking) ? etfPctCell(tracking) : '-')}
      ${etfDetailItem('추천매수', Number.isFinite(row.buyPrice) ? esc(etfPriceText(row.buyPrice)) : '-')}
      ${etfDetailItem('추천매도', Number.isFinite(row.sellPrice) ? esc(etfPriceText(row.sellPrice)) : '-')}
    </div>`;
  const trading=`
    <div class="etf-detail-grid">
      ${etfDetailItem('TER', esc(etfFeeText(row)))}
      ${etfDetailItem('총보수', Number.isFinite(row.fee) ? esc(`${Number(row.fee).toFixed(2)}%`) : '-')}
      ${etfDetailItem('운용규모', esc(etfAmountText(row.aum)))}
      ${etfDetailItem('거래량', Number.isFinite(row.volume) ? esc(`${etfNumberText(row.volume)}주`) : '-')}
      ${etfDetailItem('거래대금', esc(trade))}
      ${etfDetailItem('RSI14', Number.isFinite(row.rsi14) ? esc(Number(row.rsi14).toFixed(1)) : '-')}
    </div>`;
  const dividend=`
    <div class="etf-detail-grid">
      ${etfDetailItem('최근 분배율', Number.isFinite(row.distRate) ? esc(`${Number(row.distRate).toFixed(2)}%`) : '-')}
      ${etfDetailItem('연 분배율', Number.isFinite(row.divYield) ? esc(`${Number(row.divYield).toFixed(2)}%`) : '-')}
      ${etfDetailItem('주당 분배금', Number.isFinite(row.dividend) ? esc(`${etfNumberText(row.dividend)}원`) : '-')}
      ${etfDetailItem('지급 기준일', esc(etfCompactDate(row.dividendDate) || '-'))}
      ${etfDetailItem('1년 지급횟수', Number.isFinite(row.dividendCount) ? esc(`${Number(row.dividendCount).toFixed(0)}회`) : '-')}
      ${etfDetailItem('1년 누적분배', Number.isFinite(row.dividendAccum) ? esc(`${etfNumberText(row.dividendAccum)}원`) : '-')}
    </div>`;
  const flags=flagLabels.length ? `<div class="etf-detail-tags">${flagLabels.map((label)=>`<span>${esc(label)}</span>`).join('')}</div>` : '';
  const content=`<div class="etf-detail-card">
    ${hero}
    ${flags}
    <div class="etf-detail-layout">
      ${etfDetailSection('상품정보', info)}
      ${etfDetailSection('수익률', etfDetailReturnGrid(row), 'etf-detail-section-returns')}
      ${etfDetailSection('비용·거래', trading)}
      ${etfDetailSection('분배', dividend)}
      ${etfDetailSection(compact ? '구성 TOP5' : '주요 구성종목 TOP5', etfDetailHoldings(row), 'etf-detail-section-holdings')}
    </div>
  </div>`;
  return `<tr class="etf-detail-row">
    <td class="rownum">${rowNo}</td>
    <td colspan="${dataCols}" class="etf-detail-cell">${content}</td>
  </tr>`;
}

function etfFlagPills(row){
  const pairs=[
    ['new','신규'],
    ['monthly','월배당'],
    ['hedge','환헷지'],
    ['leverage','레버리지'],
    ['inverse','인버스'],
    ['pension','연금'],
    ['active','액티브'],
    ['covered','커버드콜'],
  ];
  const pills=pairs.filter(([key])=>row.flags?.[key]).map(([,label])=>`<span class="etf-pill">${label}</span>`);
  return pills.join('');
}

function etfMetaHtml(row, compact=false){
  const items=[
    row.code,
    row.type,
    compact && row.risk ? row.risk.replace(/\s*\(.+\)\s*$/, '') : '',
    row.dataDate ? `기준 ${etfCompactDate(row.dataDate)}` : '',
  ].filter(Boolean);
  const score=Number(row.score);
  if(!compact && Number.isFinite(score)) items.push(`점수 ${score.toFixed(0)}`);
  if(!compact && row.status) items.push(row.status);
  return items.map((item)=>`<span class="etf-meta-item">${esc(item)}</span>`).join('');
}

function etfPriceCell(row){
  const tracking=Number(row.trackingDiff);
  const inav=Number(row.inav);
  const parts=[
    `<span class="etf-metric-primary">${esc(etfPriceText(row.price))}</span>`,
    `<span class="etf-metric-line">1일 ${etfPctCell(row.ret1d)}</span>`,
  ];
  if(Number.isFinite(tracking)) parts.push(`<span class="etf-metric-line">괴리 ${etfPctCell(tracking)}</span>`);
  else if(Number.isFinite(inav)) parts.push(`<span class="etf-metric-line">iNAV ${esc(etfNumberText(inav))}</span>`);
  return `<div class="etf-metric-stack">${parts.join('')}</div>`;
}

function etfReturnCell(row){
  const items=[
    ['1W', row.ret1w],
    ['1M', row.ret1m],
    ['올해', row.retYtd],
    ['1Y', row.ret1y],
  ];
  const title=[
    `1주 ${etfPctText(row.ret1w)}`,
    `1개월 ${etfPctText(row.ret1m)}`,
    `3개월 ${etfPctText(row.ret3m)}`,
    `6개월 ${etfPctText(row.ret6m)}`,
    `올해 ${etfPctText(row.retYtd)}`,
    `1년 ${etfPctText(row.ret1y)}`,
    `3년 ${etfPctText(row.ret3y)}`,
  ].join(' · ');
  return `<div class="etf-return-grid" title="${esc(title)}">${items.map(([label,value])=>`<span class="etf-return-item"><em>${label}</em>${etfPctCell(value)}</span>`).join('')}</div>`;
}

function etfFactsCell(row){
  const ter=etfFeeText(row);
  const aum=etfAmountText(row.aum);
  const trade=etfAmountText(row.volumeValue);
  const score=Number(row.score);
  const status=row.status ? esc(row.status) : '';
  const second=[Number.isFinite(score) ? `점수 ${score.toFixed(0)}` : '', status].filter(Boolean).join(' · ');
  const title=[
    `TER ${ter}`,
    `총보수 ${Number.isFinite(Number(row.fee)) ? `${Number(row.fee).toFixed(2)}%` : '-'}`,
    `운용규모 ${aum}`,
    `거래대금 ${trade}`,
    row.openingDate ? `상장 ${etfCompactDate(row.openingDate)}` : '',
    row.buyPrice ? `추천매수 ${etfPriceText(row.buyPrice)}` : '',
    row.sellPrice ? `추천매도 ${etfPriceText(row.sellPrice)}` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="etf-metric-stack etf-facts-stack" title="${esc(title)}">
    <span class="etf-metric-line"><b>TER ${esc(ter)}</b> · 규모 ${esc(aum)}</span>
    <span class="etf-metric-line">${esc(second || `거래 ${trade}`)}</span>
  </div>`;
}

function etfDividendCell(row){
  const recent=Number(row.distRate);
  const annual=Number(row.divYield);
  const dividend=Number(row.dividend);
  const accum=Number(row.dividendAccum);
  const count=Number(row.dividendCount);
  const first=Number.isFinite(annual)
    ? `연 ${annual.toFixed(1)}%`
    : Number.isFinite(recent)
      ? `최근 ${recent.toFixed(2)}%`
      : '-';
  const second=[
    Number.isFinite(dividend) ? `${etfNumberText(dividend)}원` : '',
    Number.isFinite(count) ? `${count.toFixed(0)}회` : '',
    Number.isFinite(accum) ? `누적 ${etfNumberText(accum)}원` : '',
    row.dividendDate ? etfCompactDate(row.dividendDate) : '',
  ].filter(Boolean).slice(0, 3).join(' · ');
  return `<div class="etf-metric-stack etf-dividend-stack">
    <span class="etf-metric-primary">${esc(first)}</span>
    <span class="etf-metric-line">${esc(second || '분배 없음')}</span>
  </div>`;
}

// ETF 표 컬럼 메타데이터. 헤더 알파벳, 서브헤더 라벨, 데이터 셀 클래스/렌더러를 한 곳에 모은다.
// rownum 셀은 모든 행에서 동일하게 별도 처리.
function etfNameCellHtml(row, compact, expanded){
  return `<div class="etf-name-cell">
    <div class="etf-name-main"><span class="etf-name-label">${esc(row.name)}</span><span class="etf-detail-cue">${expanded ? '접기' : '상세'}</span></div>
    <div class="etf-meta">${etfMetaHtml(row, compact)}</div>
    <div class="etf-pills">${etfRiskPill(row)}${etfFlagPills(row)}</div>
    ${compact ? `<div class="etf-mobile-price">${esc(etfPriceText(row.price))} · 1일 ${etfPctCell(row.ret1d)}</div><div class="etf-mobile-holdings">${etfHoldingText(row, ETF_HOLDING_PREVIEW_MOBILE)}</div>` : ''}
  </div>`;
}
const ETF_COLS_FULL = [
  { col:'etf-name-col',     alphabet:'A', sub:'ETF',       cls:'left',                render:(row,exp)=>etfNameCellHtml(row, false, exp) },
  { col:'etf-price-col',    alphabet:'B', sub:'현재',      cls:'right',               render:(row)=>etfPriceCell(row) },
  { col:'etf-return-col',   alphabet:'C', sub:'수익률',    cls:'right',               render:(row)=>etfReturnCell(row) },
  { col:'etf-facts-col',    alphabet:'D', sub:'비용·규모', cls:'left',                render:(row)=>etfFactsCell(row) },
  { col:'etf-fee-col',      alphabet:'E', sub:'분배',      cls:'left',                render:(row)=>etfDividendCell(row) },
  { col:'etf-holdings-col', alphabet:'F', sub:'TOP3',     cls:'left etf-holdings',   render:(row)=>etfHoldingText(row, ETF_HOLDING_PREVIEW_DESKTOP) },
];
const ETF_COLS_COMPACT = [
  { col:'etf-name-col',   alphabet:'A', sub:'ETF',    cls:'left',  render:(row,exp)=>etfNameCellHtml(row, true, exp) },
  { col:'etf-return-col', alphabet:'B', sub:'1개월',  cls:'right', render:(row)=>etfPctCell(row.ret1m) },
  { col:'etf-return-col', alphabet:'C', sub:'1년',    cls:'right', render:(row)=>etfPctCell(row.ret1y) },
  { col:'etf-div-col',    alphabet:'D', sub:'분배',   cls:'right', render:(row)=>esc(etfDividendShortText(row)) },
];
function etfColumns(compact){ return compact ? ETF_COLS_COMPACT : ETF_COLS_FULL; }

function etfTableHeader(compact){
  const cols = etfColumns(compact);
  const colgroup = `<col class="etf-rownum-col">${cols.map(c=>`<col class="${c.col}">`).join('')}`;
  const colhead = `<th class="rownum"></th>${cols.map(c=>`<th class="colhead">${c.alphabet}</th>`).join('')}`;
  return `<colgroup>${colgroup}</colgroup>
    <tr class="etf-colhead-row">${colhead}</tr>`;
}

function etfSubheadRow(compact){
  const cols = etfColumns(compact);
  const subs = cols.map(c=>`<th class="subhead">${c.sub}</th>`).join('');
  return `<tr class="etf-subhead-row"><th class="rownum">2</th>${subs}</tr>`;
}

function etfControlsHtml(disabled=false){
  const flagLabels=[
    ['monthly','월배당'],
    ['hedge','환헷지'],
    ['leverage','레버리지'],
    ['inverse','인버스'],
    ['pension','연금'],
    ['active','액티브'],
    ['covered','커버드콜'],
    ['new','신규'],
  ];
  const sortOptions=[
    ['aum-desc','규모순'],
    ['ret-1m-desc','1개월순'],
    ['ret-3m-desc','3개월순'],
    ['ret-1y-desc','1년순'],
    ['ret-3y-desc','3년순'],
    ['score-desc','점수순'],
    ['ter-asc','보수 낮은순'],
    ['div-desc','분배율순'],
    ['volume-value-desc','거래대금순'],
    ['name-asc','이름순'],
  ];
  const riskOptions=[
    ['', '위험 전체'],
    ['1', '1등급 이하'],
    ['2', '2등급 이하'],
    ['3', '3등급 이하'],
    ['4', '4등급 이하'],
    ['5', '5등급 이하'],
    ['6', '6등급'],
  ];
  const disabledAttr=disabled ? ' disabled' : '';
  return `<div class="etf-controls">
    <input class="etf-search" data-etf-control="query" type="search" autocomplete="off" value="${esc(etfFilterState.query)}" placeholder="ETF명·코드·구성종목 검색"${disabledAttr}>
    <select class="etf-select etf-type" data-etf-control="type"${disabledAttr}>
      ${ETF_TYPE_OPTIONS.map((type)=>`<option value="${type === '전체' ? '' : esc(type)}"${etfFilterState.type === (type === '전체' ? '' : type) ? ' selected' : ''}>${esc(type)}</option>`).join('')}
    </select>
    <select class="etf-select etf-risk" data-etf-control="risk"${disabledAttr}>
      ${riskOptions.map(([value,label])=>`<option value="${esc(value)}"${etfFilterState.risk === value ? ' selected' : ''}>${esc(label)}</option>`).join('')}
    </select>
    <select class="etf-select etf-sort" data-etf-control="sort"${disabledAttr}>
      ${sortOptions.map(([value,label])=>`<option value="${value}"${etfFilterState.sort === value ? ' selected' : ''}>${label}</option>`).join('')}
    </select>
    <button type="button" class="etf-refresh" data-etf-refresh${disabledAttr} title="ETF 데이터 새로고침" aria-label="새로고침">새로고침</button>
    <div class="etf-chip-row" role="group" aria-label="ETF 빠른 필터">
      ${flagLabels.map(([key,label])=>`<button type="button" class="etf-chip${etfFilterState.flags.has(key) ? ' active' : ''}" data-etf-flag="${key}" aria-pressed="${etfFilterState.flags.has(key) ? 'true' : 'false'}"${disabledAttr}>${label}</button>`).join('')}
    </div>
  </div>`;
}

function renderEtfDataRow(row, rowNo, compact){
  const key=etfHoldingKey(row);
  const expanded=key && etfExpandedDetailKey === key;
  const cols=etfColumns(compact);
  const cells=cols.map((c)=>`<td class="${c.cls}">${c.render(row, expanded)}</td>`).join('');
  return `<tr class="etf-data-row${expanded ? ' is-expanded' : ''}" data-etf-detail-key="${esc(key)}" aria-expanded="${expanded ? 'true' : 'false'}">
    <td class="rownum">${rowNo}</td>
    ${cells}
  </tr>`;
}

function etfStatusText(filteredCount=0){
  if(etfLoading && !etfRows.length) return 'ETF 데이터 불러오는 중';
  if(etfError && !etfRows.length) return 'ETF 데이터 조회 실패';
  const age = etfLoadedAt ? relativeTimeKR(new Date(etfLoadedAt).toISOString()) : '';
  const base = etfRows.length ? `ETF ${filteredCount.toLocaleString('ko-KR')}/${etfRows.length.toLocaleString('ko-KR')}개` : 'ETF 탐색기';
  return `${base}${age ? ` · ${age} 불러옴` : ''}`;
}

function updateEtfHint(filteredCount){
  const tlHintEl=document.getElementById('timelineHint');
  if(!tlHintEl || !timelineIsEtf()) return;
  const count = Number.isFinite(Number(filteredCount)) ? Number(filteredCount) : etfLastFilteredCount;
  tlHintEl.textContent = `${etfStatusText(count)} · 서버 호출 없음`;
}

function restoreEtfControlFocus(focus){
  if(!focus?.control) return;
  requestAnimationFrame(()=>{
    const el=document.querySelector(`#timelineTable [data-etf-control="${focus.control}"]`);
    if(!el) return;
    try{
      el.focus({ preventScroll:true });
      if(typeof focus.start === 'number' && el.setSelectionRange) el.setSelectionRange(focus.start, focus.end ?? focus.start);
    }catch{}
  });
}

function renderEtfBrowser(options={}){
  const table=document.getElementById('timelineTable');
  if(!table) return;
  table.classList.remove('community-table');
  table.classList.add('etf-table');
  const compact=etfCompactLayout();
  const dataCols=compact ? 4 : 6;
  let html=etfTableHeader(compact);
  html += `<tr class="etf-filter-row"><td class="rownum">1</td><td colspan="${dataCols}" class="etf-filter-cell">${etfControlsHtml(etfLoading && !etfRows.length)}<div class="etf-beta-note">ETF 탐색기 기능은 베타로 현재 기능을 점검 및 추가 중입니다. <a href="https://etf-search.vercel.app/etf_list.html" target="_blank" rel="noopener noreferrer">데이터 소스</a></div></td></tr>`;
  html += etfSubheadRow(compact);
  if(etfLoading && !etfRows.length){
    html += `<tr class="loading-row"><td class="rownum">3</td><td colspan="${dataCols}" class="etf-loading-cell"><span class="news-loading-spin"></span> ETF 데이터를 불러오는 중...</td></tr>`;
    html += makeEmptyRows(4, Math.max(0, 18), dataCols);
    table.innerHTML=html;
    updateEtfHint(0);
    restoreEtfControlFocus(options.focus);
    return;
  }
  if(etfError && !etfRows.length){
    html += `<tr><td class="rownum">3</td><td colspan="${dataCols}" class="center flat">${esc(etfError)}</td></tr>`;
    html += makeEmptyRows(4, Math.max(0, 18), dataCols);
    table.innerHTML=html;
    updateEtfHint(0);
    restoreEtfControlFocus(options.focus);
    return;
  }
  const filtered=filteredEtfRows();
  etfLastFilteredCount=filtered.length;
  const totalPages=Math.max(1, Math.ceil(filtered.length / ETF_PAGE_SIZE));
  etfPage=Math.max(1, Math.min(etfPage, totalPages));
  const start=(etfPage - 1) * ETF_PAGE_SIZE;
  const viewed=filtered.slice(start, start + ETF_PAGE_SIZE);
  if(!viewed.length){
    html += `<tr><td class="rownum">3</td><td colspan="${dataCols}" class="center flat">조건에 맞는 ETF가 없습니다</td></tr>`;
    html += makeEmptyRows(4, Math.max(0, 18), dataCols);
  }else{
    let nextRow=3;
    const rendered=[];
    viewed.forEach((row)=>{
      rendered.push(renderEtfDataRow(row, nextRow, compact));
      nextRow += 1;
      if(etfExpandedDetailKey && etfHoldingKey(row) === etfExpandedDetailKey){
        rendered.push(renderEtfDetailRow(row, nextRow, dataCols, compact));
        nextRow += 1;
      }
    });
    html += rendered.join('');
    if(totalPages > 1){
      html += `<tr class="etf-page-row"><td class="rownum">${nextRow}</td><td colspan="${dataCols}" class="etf-page-cell">
        <button type="button" data-etf-page="prev"${etfPage <= 1 ? ' disabled' : ''}>이전</button>
        <span>${etfPage}/${totalPages}쪽 · ${filtered.length.toLocaleString('ko-KR')}개 중 ${start + 1}-${start + viewed.length}</span>
        <button type="button" data-etf-page="next"${etfPage >= totalPages ? ' disabled' : ''}>다음</button>
      </td></tr>`;
      html += makeEmptyRows(nextRow + 1, Math.max(0, (etfCompactLayout() ? 28 : 80) - viewed.length - 1), dataCols);
    }else{
      html += makeEmptyRows(nextRow, Math.max(0, (etfCompactLayout() ? 28 : 80) - viewed.length), dataCols);
    }
  }
  table.innerHTML=html;
  updateEtfHint(etfLastFilteredCount);
  restoreEtfControlFocus(options.focus);
  enableCellSelection();
}

async function loadEtfData(options={}){
  if(etfLoading) return;
  const cached=!options.force ? readEtfCsvCache() : null;
  if(cached && (!etfRows.length || etfLoadedAt !== Number(cached.at || 0))){
    applyEtfCsvText(cached.text, cached.at);
    renderEtfBrowser();
    return;
  }
  if(etfRows.length && !options.force && Date.now() - etfLoadedAt < ETF_CACHE_TTL_MS){
    renderEtfBrowser();
    return;
  }
  etfLoading=true;
  etfError='';
  renderEtfBrowser();
  try{
    const res=await fetch(ETF_CSV_URL, { cache:options.force ? 'reload' : 'default' });
    if(!res.ok) throw new Error(`ETF CSV ${res.status}`);
    const text=await res.text();
    applyEtfCsvText(text, Date.now());
    writeEtfCsvCache(text);
  }catch(e){
    const stale=readEtfCsvCache({ allowStale:true });
    if(stale?.text){
      applyEtfCsvText(stale.text, stale.at);
      etfError='';
    }else{
      etfError='ETF 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
    }
  }finally{
    etfLoading=false;
    if(timelineIsEtf()) renderEtfBrowser();
  }
}

function handleEtfControlInput(ev){
  const control=ev.target?.dataset?.etfControl;
  if(!control) return false;
  if(control === 'query'){
    etfFilterState.query=String(ev.target.value || '');
    etfPage=1;
    const focus={ control, start:ev.target.selectionStart, end:ev.target.selectionEnd };
    if(etfRenderTimer) clearTimeout(etfRenderTimer);
    etfRenderTimer=setTimeout(()=>{ etfRenderTimer=null; renderEtfBrowser({ focus }); }, 240);
    return true;
  }
  return false;
}

function handleEtfControlChange(ev){
  const control=ev.target?.dataset?.etfControl;
  if(!control) return false;
  if(control === 'type' || control === 'risk'){
    etfFilterState[control]=String(ev.target.value || '');
    etfPage=1;
    renderEtfBrowser();
    return true;
  }
  if(control === 'sort'){
    const value=String(ev.target.value || '');
    etfFilterState.sort=ETF_SORT_OPTIONS.has(value) ? value : 'aum-desc';
    etfPage=1;
    renderEtfBrowser();
    return true;
  }
  return false;
}

function handleEtfTableClick(ev){
  const refresh=ev.target?.closest?.('[data-etf-refresh]');
  if(refresh){
    loadEtfData({ force:true });
    return true;
  }
  const chip=ev.target?.closest?.('[data-etf-flag]');
  if(chip){
    const key=String(chip.dataset.etfFlag || '');
    if(ETF_FILTER_FLAGS.has(key)){
      if(etfFilterState.flags.has(key)) etfFilterState.flags.delete(key);
      else etfFilterState.flags.add(key);
      etfPage=1;
      renderEtfBrowser();
    }
    return true;
  }
  const pager=ev.target?.closest?.('[data-etf-page]');
  if(pager){
    if(pager.dataset.etfPage === 'prev') etfPage=Math.max(1, etfPage - 1);
    if(pager.dataset.etfPage === 'next') etfPage += 1;
    renderEtfBrowser();
    return true;
  }
  const detailRow=ev.target?.closest?.('tr.etf-data-row[data-etf-detail-key]');
  if(detailRow && !ev.target?.closest?.('button,input,select,a')){
    const key=String(detailRow.dataset.etfDetailKey || '');
    etfExpandedDetailKey = etfExpandedDetailKey === key ? '' : key;
    renderEtfBrowser();
    return true;
  }
  return false;
}

function getEtfState(){
  return {
    hasRows: !!etfRows.length,
    filteredCount: etfLastFilteredCount,
    loadedAt: etfLoadedAt,
    loading: etfLoading,
    error: etfError,
  };
}

function toggleDetailKey(key){
  const next=String(key || '');
  if(!next) return false;
  etfExpandedDetailKey = etfExpandedDetailKey === next ? '' : next;
  renderEtfBrowser();
  return true;
}

window.ExcelKospiEtf = Object.freeze({
  renderEtfBrowser,
  loadEtfData,
  handleEtfControlInput,
  handleEtfControlChange,
  handleEtfTableClick,
  updateEtfHint,
  getState:getEtfState,
  toggleDetailKey,
});
})();
