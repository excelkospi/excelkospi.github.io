/* excelkospi runtime constants
 * Kept separate from the main UI script so app.js stays focused on behavior.
 */

// Google Analytics 4. Leave empty to skip loading gtag entirely.
const GA_MEASUREMENT_ID = 'G-JX282WW6WM';

// 마지막 보던 market view 복원: 다음 방문 시 같은 view 로 진입.
const VIEW_KEY = 'kg_view_v1';
const STATIC_EXPORT = false;
const WORKERS_API_BASE = 'https://excelkospi-api.alaala3.workers.dev';

function currentApiBase(){
  const host = location.hostname;
  const local = host === 'localhost' || host === '127.0.0.1' || host === '' || host.endsWith('.local');
  if (local || location.protocol === 'file:') return '';
  if (host === 'excelkospi.pages.dev' || host.endsWith('.pages.dev')) return '';
  return WORKERS_API_BASE;
}

const API_BASE = currentApiBase();

// Public site-level Imgur app Client-ID. End users never enter this. It is
// intentionally public when enabled because browser-direct upload avoids Worker
// CPU. Leave empty to keep the old manual Imgur upload-page fallback.
const IMGUR_CLIENT_ID = '';
const IMGUR_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
const IMGUR_UPLOAD_TARGET_BYTES = 1200 * 1024;
const IMGUR_UPLOAD_COOLDOWN_MS = 15 * 1000;
const IMGUR_UPLOAD_COOLDOWN_KEY = 'kg_imgur_upload_last_v1';

function apiUrl(path){
  const value = String(path || '');
  if (!value) return API_BASE || '';
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith('/api/')) return value;
  if (!API_BASE) return value;
  return `${API_BASE}${value}`;
}

try{
  window.EXCELKOSPI_API_BASE = API_BASE;
  window.apiUrl = apiUrl;
}catch{}

const WATCHLIST_KEY = 'kg_watchlist_v1';
const QUOTE_NOTES_KEY = 'kg_quote_notes_v1';
const FIRST_VISIT_KEY = 'kg_watchlist_firstvisit_v1';
const HOLDING_TIP_KEY = 'kg_holding_tip_v1';
const CHANGE_WINDOW_TIP_KEY = 'kg_change_window_tip_v2';
const RIBBON_TIP_KEY = 'kg_ribbon_tip_v1';
const VISITOR_ID_KEY = 'kg_visitor_id_v1';
const VISITOR_PAGE_ID = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const QUOTE_SORT_KEY = 'kg_quote_sort_v1';
const RIBBON_COLLAPSED_KEY = 'kg_ribbon_collapsed_v1';
const READABILITY_KEY = 'kg_readability_v1';
const EXCEL_THEME_KEY = 'kg_excel_theme_v1';
const EXCEL_DARK_MODE_KEY = 'kg_excel_dark_mode_v1';
const US_SHEET_KRW_KEY = 'kg_us_sheet_krw_v1';
const COIN_QUOTE_SOURCE_KEY = 'kg_coin_quote_source_v1';
const UPDATES_SEEN_KEY = 'kg_updates_seen_v1';
const CHAT_OPEN_KEY = 'kg_chat_open_v1';
const CHAT_TIP_KEY = 'kg_chat_tip_v1';
const CHART_TIP_KEY = 'kg_chart_tip_v1';
const WATCHLIST_PHONE_TIP_KEY = 'kg_watchlist_phone_tip_v1';
const CHAT_NICK_KEY = 'kg_chat_nick_v1';
const COMMUNITY_NICK_KEY = 'kg_community_nick_v1';
const STOCK_MENTION_CACHE_KEY = 'kg_stock_mention_cache_v1';
const CHAT_SIZE_KEY = 'kg_chat_size_v1';
const CHAT_POSITION_KEY = 'kg_chat_position_v1';
const CHAT_OPACITY_KEY = 'kg_chat_opacity_v1';
const CHAT_IMAGE_PREVIEW_KEY = 'kg_chat_image_preview_v1';
const CHAT_DOCK_KEY = 'kg_chat_dock_v1';
const CHAT_EXCEL_MODE_KEY = 'kg_chat_excel_mode_v1';
const CHAT_REPORTED_KEY = 'kg_chat_reported_v1';
const CHAT_RECOMMENDED_KEY = 'kg_chat_recommended_v1';
const CHAT_RECOMMEND_BADGE_KEY = 'kg_chat_recommend_badge_v1';
const CHAT_LAST_SEEN_KEY = 'kg_chat_last_seen_v1';
// Chat idle sleep — 동접자 수에 따라 부드럽게 단계별 변경. 트래픽이 적을 때는
// 오래 켜두고, 폭증 시점에 짧게 줄여 비용을 보호한다.
const CHAT_IDLE_SLEEP_CALM_MS = 40 * 60 * 1000;  // ~100명 미만
const CHAT_IDLE_SLEEP_LOW_MS  = 30 * 60 * 1000;  // ~500명 미만
const CHAT_IDLE_SLEEP_MID_MS  = 22 * 60 * 1000;  // ~1500명 미만
const CHAT_IDLE_SLEEP_HIGH_MS = 15 * 60 * 1000;  // ~3000명 미만
const CHAT_IDLE_SLEEP_PEAK_MS = 10 * 60 * 1000;  // 3000명+ 폭증 구간
const CHAT_CLOSED_POLL_MS = 60 * 1000;
const CHAT_OPEN_POLL_MS = 5 * 1000;
const CHAT_SEND_GAP_MS = 4 * 1000;
const CHAT_RECOMMENDED_SEND_GAP_MS = 2 * 1000;
const CHAT_BUSY_POLL_ONLINE_THRESHOLD = 350;
const CHAT_BUSY_OPEN_POLL_MS = 5 * 1000;
const CHAT_PRESENCE_POLL_MS = 45 * 1000;
const CHAT_PRESENCE_BUSY_POLL_MS = 60 * 1000;
const CHAT_PRESENCE_PEAK_POLL_MS = 60 * 1000;
const DATA_HIDDEN_GRACE_MS = 3 * 60 * 1000;
const CHAT_HIDDEN_OPEN_POLL_MS = 30 * 1000;
const CHAT_HIDDEN_CLOSED_POLL_MS = 2 * 60 * 1000;
const CHAT_HIDDEN_PREVIEW_POLL_MS = 60 * 1000;
const CHAT_INITIAL_LIMIT = 50;
const CHAT_DELTA_LIMIT = 30;
const ADMIN_NICKNAME = '관리자';
const AI_BOT_NICKNAME = '운영AI봇';
const CHAT_IMPERSONATION_NICKNAME = '저는사칭을하려했어요';
const ADMIN_SESSION_KEY = 'kg_inline_admin_token_v1';
const PWA_INSTALL_DISMISSED_KEY = 'kg_pwa_install_dismissed_v1';
const VERSION_CHECK_MS = 10 * 60 * 1000;
const VERSION_IDLE_RELOAD_MS = 3 * 60 * 1000;
const VERSION_MAX_STALE_MS = 60 * 60 * 1000;
const FLOATING_HIDDEN_KEY = 'kg_floating_hidden_v1';
const MOBILE_DESKTOP_NOTICE_KEY = 'kg_mobile_desktop_notice_v1';
const CHANGE_WINDOW_KEY = 'kg_change_window_v1';
const HOLDINGS_KEY = 'kg_holdings_v1';
const TIMELINE_TAB_KEY = 'kg_timeline_tab_v1';
const COMMUNITY_CHANNEL_KEY = 'kg_community_channel_v1';
const COMMUNITY_READ_STATE_KEY = 'kg_community_read_state_v1';
const COMMUNITY_POLL_VOTES_KEY = 'kg_community_poll_votes_v1';
const COMMUNITY_READ_MARK_DELAY_MS = 1800;
const COMMUNITY_CHANNELS = [
  { id:'kr', label:'국내주식토론', placeholder:'국내 주식 이야기를 나누는 공간입니다.' },
  { id:'us', label:'해외주식토론', placeholder:'해외 주식 이야기를 나누는 공간입니다.' },
  { id:'coin', label:'코인토론', placeholder:'코인 이야기를 나누는 공간입니다.' },
  { id:'ops', label:'운영게시판', placeholder:'서비스 이용 의견이나 운영 관련 이야기를 남겨주세요.' },
];
const COMMUNITY_POLL_CHANNELS = new Set(['kr', 'us', 'coin']);
const QUOTE_REFRESH_MS = 30000;
const FAST_QUOTE_REGULAR_MS = 20 * 1000;
const FAST_QUOTE_EXTENDED_MS = 20 * 1000;
const FAST_QUOTE_WEEKEND_MS = 5 * 60 * 1000;
const FAST_QUOTE_JITTER_MIN_MS = 1000;
const FAST_QUOTE_JITTER_MAX_MS = 3000;
const FAST_QUOTE_BATCH_SIZE = 30;
const FAST_QUOTE_VISIBLE_BUFFER_PX = 720;
const MINI_CHART_HOVER_DELAY_MS = 220;
const MINI_CHART_CACHE_TTL_MS = 60 * 1000;
const TV_CHART_HEIGHT_KEY = 'kg_tv_chart_height_v1';
const WATCHLIST_TOTAL_ROW_LIMIT = 100;
const WATCHLIST_SHARE_LIMIT = 100;
const QUOTE_NOTE_LIMIT = 100;
const WATCHLIST_SHARE_STATE_LIMIT = 320;
const COMMUNITY_POST_LIMIT = 80;
const COMMUNITY_PAGE_SIZE = 30;
const COMMUNITY_REPLY_PAGE_SIZE = 5;
// 0=댓글, 1=대댓글, 2=대대댓글. 그 아래 댓글도 화면상 3단계 들여쓰기까지만 표시.
const COMMUNITY_MAX_VISUAL_REPLY_DEPTH = 2;
const COMMUNITY_BODY_LIMIT = 400;
const COMMUNITY_HIDE_REPORTS = 8;
const COMMUNITY_RECOMMEND_THRESHOLD = 7;
const COMMUNITY_REPORT_LIMIT_PER_HOUR = 4;
const COMMUNITY_REFRESH_MS = 2 * 60 * 1000;
const COMMUNITY_SUMMARY_REFRESH_MS = 5 * 60 * 1000;
const COMMUNITY_IDLE_SLEEP_MS = 10 * 60 * 1000;
const COMMUNITY_COMMENT_LIMIT = 400;
const SHEET_SPLIT_KEY = 'kg_sheet_split_v1';
const PANEL_ORDER_KEY = 'kg_panel_order_v1';
const PANEL_IDS = ['summary', 'timeline', 'chat'];
const SHEET_SPLIT_SUMMARY_MIN_PX = 390;
const SHEET_SPLIT_SUMMARY_WIDE_MIN_PX = 440;
const SHEET_SPLIT_TIMELINE_MIN_PX = 460;
const SHEET_SPLIT_CHAT_MIN_PX = 320;
// 화면 광고 목록은 /api/notices 를 먼저 쓰고, 운영 호환용으로 /api/ads 를 fallback 으로 둔다.
const AD_ROTATION_MS = 5 * 60 * 1000;
const SERVER_STATUS_PEAK_KEY = 'kg_server_status_peak_v1';
const SHARED_POLL_LOCK_PREFIX = 'kg_shared_poll_lock_v1:';
const CHAT_DONORS_CACHE_KEY = 'kg_chat_donors_v1';
const PATCH_NOTES_URL = '/patch-notes.md?v=20260527-601';
const MARKET_LABELS = { AUTO: '자동', KR: '국장', US: '미장', COIN: '코인', ALL: '주식 전체', HOLDINGS: '보유' };
const STOCK_MARKETS = new Set(['KR', 'US']);
