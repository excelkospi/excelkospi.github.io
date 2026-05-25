/* 관심 소식 row helpers.
 * Loaded before app.js. Functions intentionally stay global so existing sheet
 * renderers can call them without a module migration.
 */
function personalFeedKey(value){
  if(typeof stockMentionKey === 'function') return stockMentionKey(value);
  return String(value || '')
    .replace(/^@+/, '')
    .trim()
    .replace(/[.,;:!?，。]+$/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function cardLookupPool(){
  const pool = [];
  if(Array.isArray(lastRenderedCards)) pool.push(...lastRenderedCards);
  if(Array.isArray(lastSnapshot?.cards)) pool.push(...lastSnapshot.cards);
  return pool.filter((card)=>card && !card._noteRow);
}

function findCardByLabels(labels){
  const wanted = new Set((Array.isArray(labels) ? labels : [labels]).map((label)=>personalFeedKey(label)).filter(Boolean));
  if(!wanted.size) return null;
  return cardLookupPool().find((card)=>{
    const keys = [card.key, card.name, card.code].map(personalFeedKey).filter(Boolean);
    return keys.some((key)=>wanted.has(key));
  }) || null;
}

function marketTrendPhrase(label, card, kind='market'){
  const value = Number(card?.changePct);
  if(!Number.isFinite(value)) return '';
  if(Math.abs(value) < 0.05) return `${label} 보합`;
  if(kind === 'currency') return `${label} ${value > 0 ? '강세' : '약세'}`;
  if(kind === 'oil') return `${label} ${value > 0 ? '상승' : '하락'}`;
  if(kind === 'coin') return `${label} ${value > 0 ? '강세' : '약세'}`;
  return `${label} ${value > 0 ? '상승' : '하락'}`;
}

function marketRuleSummaryText(){
  const market = String(currentRenderedMarket || selected || 'AUTO').toUpperCase();
  const presets = market === 'KR'
    ? [
      ['코스피', ['코스피']],
      ['코스닥', ['코스닥']],
      ['달러', ['원/달러'], 'currency'],
    ]
    : market === 'US'
      ? [
        ['나스닥', ['나스닥']],
        ['S&P500', ['S&P500','S&P 500']],
        ['달러', ['원/달러'], 'currency'],
        ['유가', ['WTI 원유','WTI'], 'oil'],
      ]
      : market === 'COIN'
        ? [
          ['BTC', ['BTC(USD)','BTC(KRW)','BTC'], 'coin'],
          ['김프', ['김프(%)']],
          ['달러', ['원/달러'], 'currency'],
        ]
        : [
          ['나스닥', ['나스닥']],
          ['코스피', ['코스피']],
          ['BTC', ['BTC(USD)','BTC(KRW)','BTC'], 'coin'],
          ['달러', ['원/달러'], 'currency'],
        ];
  return presets
    .map(([label, keys, kind])=>marketTrendPhrase(label, findCardByLabels(keys), kind))
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ');
}

function personalInterestEntries(){
  const map = new Map();
  const add = (key, label)=>{
    const normalized = personalFeedKey(key);
    const text = String(label || key || '').trim();
    if(!normalized || normalized.length < 2 || !text) return;
    if(!map.has(normalized)) map.set(normalized, text.slice(0, 18));
  };
  try{
    wlLoad().forEach((item)=>{
      add(item.code, item.name || item.code);
      add(item.name, item.name || item.code);
    });
  }catch{}
  try{
    (lastRenderedCards || []).forEach((card)=>{
      if(!card || card._noteRow || !holdingLotsFor(card).length) return;
      add(card.code || card.key, card.key);
      add(card.key, card.key);
    });
  }catch{}
  return Array.from(map.entries()).map(([key, label])=>({ key, label }));
}

function textMatchesInterest(text, entries){
  const haystack = personalFeedKey(text);
  if(!haystack) return false;
  return entries.some((entry)=>entry.key.length >= 2 && haystack.includes(entry.key));
}

function personalNewsCount(entries){
  return personalNewsMatches(entries).length;
}

function personalNewsMatches(entries, sourceItems){
  if(!entries.length) return [];
  const maxAge = 36 * 60 * 60 * 1000;
  const now = Date.now();
  const source = Array.isArray(sourceItems) ? sourceItems : currentViewedNewsItems();
  return source.slice(0, 100).filter((item)=>{
    if(!item || isLiveDataNews(item)) return false;
    const published = Date.parse(item?.publishedAt || item?.asOf || '');
    if(Number.isFinite(published) && now - published > maxAge) return false;
    return textMatchesInterest(`${item?.title || ''} ${item?.description || ''}`, entries);
  });
}

function personalNewsKeySet(items){
  const entries = personalInterestEntries();
  return new Set(personalNewsMatches(entries, items).map(newsKey).filter(Boolean));
}

function personalMoverText(entries){
  if(!entries.length) return '';
  const cards = (lastRenderedCards || [])
    .filter((card)=>card && !card._noteRow && entries.some((entry)=>[
      card.key, card.name, card.code,
    ].some((value)=>personalFeedKey(value) === entry.key)))
    .map((card)=>({ card, value:Number(changeValueFor(card)) }))
    .filter((item)=>Number.isFinite(item.value) && Math.abs(item.value) >= 3)
    .sort((a,b)=>Math.abs(b.value) - Math.abs(a.value));
  const top = cards[0];
  return top ? `${top.card.key} ${pct(top.value)}` : '';
}

function personalMentionCounts(entries){
  const counts = new Map();
  if(!entries.length || !Array.isArray(communityPosts)) return [];
  const bump = (label)=>{
    if(!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  };
  const inspectMentions = (mentions)=>{
    if(!mentions || typeof mentions !== 'object') return;
    Object.values(mentions).forEach((item)=>{
      if(!item) return;
      const keys = [item.code, item.name].map(personalFeedKey).filter(Boolean);
      const match = entries.find((entry)=>keys.includes(entry.key));
      if(match) bump(match.label);
    });
  };
  const inspectBody = (body)=>{
    const text = String(body || '');
    entries.forEach((entry)=>{
      if(textMatchesInterest(text, [entry])) bump(entry.label);
    });
  };
  communityPosts.forEach((post)=>{
    inspectMentions(post.mentions);
    inspectBody(post.body);
    communityCommentsForPost(post).forEach((comment)=>{
      inspectMentions(comment.mentions);
      inspectBody(comment.body);
    });
  });
  return Array.from(counts.entries())
    .sort((a,b)=>b[1] - a[1])
    .slice(0, 2)
    .map(([label, count])=>`${label} 언급 ${count}건`);
}

function personalBrief(){
  const entries = personalInterestEntries();
  const parts = [];
  const newsCount = personalNewsCount(entries);
  if(newsCount) parts.push(`관련 뉴스 ${newsCount}개`);
  const mover = personalMoverText(entries);
  if(mover) parts.push(mover);
  parts.push(...personalMentionCounts(entries));
  if(parts.length){
    return { title:'관심 소식', text:parts.slice(0, 4).join(' · '), sub:'', newsCount };
  }
  return null;
}

function personalFeedRow(rowNo, dataCols, context='news'){
  const brief = personalBrief();
  if(!brief) return '';
  const sub = brief.sub ? `<span class="personal-feed-muted">${esc(brief.sub)}</span>` : '';
  const newsActionAttrs = brief.newsCount
    ? ' is-actionable" data-personal-feed-action="news" role="button" tabindex="0"'
    : '"';
  if(context === 'community'){
    const actionCell = dataCols > 3 ? '<td class="personal-feed-action"></td>' : '';
    return `<tr class="personal-feed-row">
    <td class="rownum">${rowNo}</td>
    <td class="personal-feed-author"><span class="personal-feed-title">${esc(brief.title)}</span></td>
    <td class="personal-feed-cell" title="${esc([brief.title, brief.text, brief.sub].filter(Boolean).join(' · '))}">
      <span class="personal-feed-main">${esc(brief.text)}</span>
      ${sub}
    </td>
    <td class="personal-feed-time"></td>
    ${actionCell}
  </tr>`;
  }
  return `<tr class="personal-feed-row${newsActionAttrs}>
    <td class="rownum">${rowNo}</td>
    <td colspan="${dataCols}" class="personal-feed-cell" title="${esc([brief.title, brief.text, brief.sub].filter(Boolean).join(' · '))}">
      <span class="personal-feed-title">${esc(brief.title)}</span>
      <span class="personal-feed-main">${esc(brief.text)}</span>
      ${sub}
    </td>
  </tr>`;
}

function focusPersonalNewsMatches(){
  const rows = Array.from(document.querySelectorAll('#timelineTable tr.news-row.is-personal-match'));
  if(!rows.length){
    showToast('현재 뉴스 목록에서 관련 뉴스를 찾지 못했습니다.', 'info');
    return;
  }
  rows.forEach((row)=>{
    row.classList.remove('personal-news-pulse');
    void row.offsetWidth;
    row.classList.add('personal-news-pulse');
  });
  rows[0].scrollIntoView({ block:'center', behavior:'smooth' });
  showToast(`관련 뉴스 ${rows.length}개를 강조했습니다.`, 'info');
}

document.addEventListener('click', (ev)=>{
  const row = ev.target?.closest?.('.personal-feed-row[data-personal-feed-action="news"]');
  if(!row) return;
  ev.preventDefault();
  focusPersonalNewsMatches();
});

document.addEventListener('keydown', (ev)=>{
  if(ev.key !== 'Enter' && ev.key !== ' ') return;
  const row = ev.target?.closest?.('.personal-feed-row[data-personal-feed-action="news"]');
  if(!row) return;
  ev.preventDefault();
  focusPersonalNewsMatches();
});
