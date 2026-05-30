/* 시트 열 너비 드래그 조절 (데스크톱 우선)
 *
 * 시세창(#cardsTable)과 커뮤니티 게시판(#timelineTable)의 고정폭 열을, 열 머리(A/B/C/D)
 * 오른쪽 경계의 핸들을 드래그해 Excel 처럼 너비 조절한다. 채움 열(지표·내용)은 auto 로 둬서
 * 나머지 공간을 흡수한다.
 *
 * 설계 메모:
 * - 너비는 CSS 변수(--xkw-*)로 둔다. 두 <table> 요소는 정적이고 innerHTML(행)만 30초/2분마다
 *   교체되므로, 변수를 :root 에 두면 재렌더에도 유지된다(상속).
 * - 핸들은 매 렌더 후 사라지므로 MutationObserver 로 재주입한다(idempotent — 이미 있으면 패스).
 * - 모바일은 app.css 의 미디어쿼리가 고정 px 로 덮어쓰므로 변수가 무시되고, 핸들도 CSS 로 숨긴다.
 *   터치 포인터는 시작 단계에서 무시한다(데스크톱 우선).
 * - 저장: localStorage(kg_col_widths_v1). 더블클릭으로 해당 열 기본값 복원.
 */
(function () {
  if (window.__xkColResizeInit) return;
  window.__xkColResizeInit = true;

  var STORAGE_KEY = 'kg_col_widths_v1';

  // tableId, 그 표의 .colhead 들 중 리사이즈할 인덱스(0-based)와 변수/기본/최소/최대.
  var TABLES = [
    {
      tableId: 'cardsTable',
      cols: [
        { idx: 1, varName: '--xkw-q-price', def: 110, min: 60, max: 240 },  // 현재가
        { idx: 2, varName: '--xkw-q-change', def: 66, min: 44, max: 180 },  // 등락
      ],
    },
    {
      tableId: 'timelineTable',
      // #timelineTable 은 뉴스 피드와 커뮤니티 게시판이 공유한다. 게시판일 때(community-table)만 핸들을 붙인다.
      guard: function (table) { return table.classList.contains('community-table'); },
      cols: [
        { idx: 0, varName: '--xkw-c-author', def: 88, min: 50, max: 200 },  // 작성자
        { idx: 2, varName: '--xkw-c-time', def: 78, min: 50, max: 170 },    // 시각
        { idx: 3, varName: '--xkw-c-report', def: 116, min: 70, max: 280 }, // 추천/신고
      ],
    },
  ];

  var ALL_VARS = [];
  TABLES.forEach(function (t) { t.cols.forEach(function (c) { ALL_VARS.push(c.varName); }); });

  function setVar(name, px) {
    document.documentElement.style.setProperty(name, px + 'px');
  }

  function persist() {
    var root = document.documentElement;
    var out = {};
    ALL_VARS.forEach(function (v) {
      var val = root.style.getPropertyValue(v).trim();
      if (/^\d+px$/.test(val)) out[v] = val;
    });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(out)); } catch (e) {}
  }

  function applySaved() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    Object.keys(saved).forEach(function (v) {
      if (ALL_VARS.indexOf(v) >= 0 && /^\d+px$/.test(String(saved[v]))) {
        document.documentElement.style.setProperty(v, String(saved[v]));
      }
    });
  }

  // 한 표의 colhead 셀들에 리사이즈 핸들을 주입한다(이미 있으면 패스).
  function injectHandles(table) {
    if (!table) return;
    var conf = null;
    for (var i = 0; i < TABLES.length; i++) { if (TABLES[i].tableId === table.id) { conf = TABLES[i]; break; } }
    if (!conf) return;
    if (conf.guard && !conf.guard(table)) return;
    var heads = table.querySelectorAll('.colhead');
    if (!heads.length) return;
    conf.cols.forEach(function (col) {
      var th = heads[col.idx];
      if (!th || th.querySelector('.xk-col-resizer')) return;
      th.style.position = 'relative';
      var h = document.createElement('div');
      h.className = 'xk-col-resizer';
      h.setAttribute('aria-hidden', 'true');
      h.dataset.table = table.id;
      h.dataset.idx = String(col.idx);
      h.dataset.varName = col.varName;
      h.dataset.def = String(col.def);
      h.dataset.min = String(col.min);
      h.dataset.max = String(col.max);
      h.title = '드래그: 열 너비 조절 · 더블클릭: 기본값';
      th.appendChild(h);
    });
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function onPointerDown(e) {
    var h = e.target && e.target.closest ? e.target.closest('.xk-col-resizer') : null;
    if (!h) return;
    if (e.pointerType === 'touch') return; // 데스크톱 우선
    e.preventDefault();
    var table = document.getElementById(h.dataset.table);
    if (!table) return;
    var heads = table.querySelectorAll('.colhead');
    var th = heads[Number(h.dataset.idx)];
    if (!th) return;
    var varName = h.dataset.varName;
    var min = Number(h.dataset.min);
    var max = Number(h.dataset.max);
    var startX = e.clientX;
    var startW = th.getBoundingClientRect().width;

    document.body.classList.add('xk-col-resizing');

    function move(ev) {
      var w = Math.round(clamp(startW + (ev.clientX - startX), min, max));
      setVar(varName, w);
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('xk-col-resizing');
      persist();
    }
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function onDblClick(e) {
    var h = e.target && e.target.closest ? e.target.closest('.xk-col-resizer') : null;
    if (!h) return;
    e.preventDefault();
    document.documentElement.style.removeProperty(h.dataset.varName);
    persist();
  }

  function observe(table) {
    if (!table || typeof MutationObserver === 'undefined') return;
    var obs = new MutationObserver(function () { injectHandles(table); });
    obs.observe(table, { childList: true, subtree: true });
  }

  function init() {
    applySaved();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('dblclick', onDblClick);
    TABLES.forEach(function (t) {
      var table = document.getElementById(t.tableId);
      injectHandles(table);
      observe(table);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
