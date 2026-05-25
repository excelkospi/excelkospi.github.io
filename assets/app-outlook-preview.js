// Ootlook-style badges and one-line previews used by the Excel quote table.
// Kept separate from the full Ootlook renderer so quote rendering stays slimmer.

function outlookPriceText(card){
  return cardPriceDisplayText(card);
}

function outlookChangePhrase(value){
  if(value === null || value === undefined || Number.isNaN(Number(value))) return '변동률 확인 중';
  const n = Number(value);
  if(n > 0) return `${pct(n)} 상승 중`;
  if(n < 0) return `${pct(n)} 하락 중`;
  return '보합권';
}

function outlookPreviewHtml(card, changeValue){
  let preview = '';
  const priceText = outlookPriceText(card);
  if(card._momentum !== undefined && card._momentum !== null){
    preview = `${changeHeaderLabel()} 기준 ${outlookChangePhrase(card._momentum)}입니다.`;
  } else if(card.sign && card.priceUnit){
    preview = `${card.key} 수급은 ${priceText || '확인 중'}으로 집계됐습니다.`;
  } else if(card.sessionTag && changeWindow === 'day'){
    preview = `${card.sessionTag} 표시 중이며${priceText ? `, 현재가는 ${priceText}입니다` : ' 시세 확인 중입니다'}.`;
  } else if(isRateOnlyCard(card.key)){
    const rateText = priceText || (Number.isFinite(Number(changeValue)) ? pct(changeValue) : '');
    preview = rateText ? `현재 ${rateText} 수준입니다.` : '데이터 확인 중입니다.';
  } else {
    preview = `${outlookChangePhrase(changeValue)}${priceText ? `, 현재가는 ${priceText}입니다` : '입니다'}.`;
  }
  return `<span class="outlook-preview">${esc(preview)}</span><span class="outlook-mailtime">${esc(compactSourceLabel(card))}</span>`;
}

function outlookFlowPreviewHtml(card){
  const parts = (card._flows || []).map((f)=>{
    const n = Number(f.amount);
    const hasAmount = f.amount !== null && f.amount !== undefined && Number.isFinite(n);
    return `${f.label} ${hasAmount ? `${n>0?'+':''}${num(n)}억` : '확인 중'}`;
  }).join(' / ');
  const preview = parts ? `수급 메일: ${parts}` : '수급 메일: 외국인·기관 흐름 확인 중입니다.';
  return `<span class="outlook-preview">${esc(preview)}</span><span class="outlook-mailtime">${esc(compactSourceLabel(card))}</span>`;
}

function outlookBadgeText(card){
  if(card._flows) return 'Σ';
  const key = String(card.key || '').toUpperCase();
  const market = String(card.market || '').toUpperCase();
  if(key.includes('BTC') || key.includes('김프') || market === 'COIN') return '₿';
  if(card.key === '코스피야선') return '야';
  if(market === 'KR') return 'KR';
  if(market === 'US') return 'US';
  return 'MB';
}

function outlookBadgeTone(card){
  if(card._flows) return 'flow';
  const key = String(card.key || '').toUpperCase();
  const market = String(card.market || '').toUpperCase();
  if(key.includes('BTC') || key.includes('김프') || market === 'COIN') return 'coin';
  if(card.key === '코스피야선') return 'night';
  if(market === 'KR') return 'kr';
  if(market === 'US') return 'us';
  return 'default';
}
