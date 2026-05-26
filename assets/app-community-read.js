/* ============================================================
 * Community read-position helpers
 * ============================================================ */
let communityReadMarkTimer = null;

function communityReadStateLoad(){
  try{
    const parsed = JSON.parse(localStorage.getItem(COMMUNITY_READ_STATE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  }catch{
    return {};
  }
}

function communityReadStateSave(state){
  try{
    localStorage.setItem(COMMUNITY_READ_STATE_KEY, JSON.stringify(state || {}));
    if(typeof persistSet === 'function') persistSet(COMMUNITY_READ_STATE_KEY, JSON.stringify(state || {}));
  }catch{}
}

function normalizeCommunitySummary(item, channel){
  const key = validCommunityChannel(channel || item?.channel);
  const latestMs = Number(item?.latestActivityMs || 0) || Date.parse(item?.latestAt || '');
  return {
    channel:key,
    postCount:Math.max(0, Number(item?.postCount || 0) || 0),
    latestActivityMs:Number.isFinite(latestMs) ? Math.max(0, latestMs) : 0,
  };
}

function syncCommunitySummariesFromPayload(summaries){
  if(!summaries || typeof summaries !== 'object') return false;
  let changed = false;
  Object.entries(summaries).forEach(([channel, summary])=>{
    const key = validCommunityChannel(channel);
    communityChannelSummaries[key] = normalizeCommunitySummary(summary, key);
    changed = true;
  });
  return changed;
}

function communitySummaryEntry(channel=communityActiveChannel()){
  const key = validCommunityChannel(channel);
  return communityChannelSummaries[key] || { channel:key, postCount:0, latestActivityMs:0 };
}

function communityCreatedMs(item){
  const ms = Date.parse(item?.created_at || '');
  return Number.isFinite(ms) ? ms : 0;
}

function communityCommentsForPost(post){
  return Array.isArray(post?.comments) ? post.comments : [];
}

function communityActivityMs(post){
  let latest = communityCreatedMs(post);
  communityCommentsForPost(post).forEach((comment)=>{
    latest = Math.max(latest, communityCreatedMs(comment));
  });
  return latest;
}

function communityLatestActivityMs(posts=communityPosts){
  return (Array.isArray(posts) ? posts : []).reduce((max, post)=>Math.max(max, communityActivityMs(post)), 0);
}

function communityReadEntry(channel=communityActiveChannel()){
  const state = communityReadStateLoad();
  const key = validCommunityChannel(channel);
  const entry = state[key] || {};
  return {
    readAt:Number(entry.readAt || 0),
    latestAt:Number(entry.latestAt || 0),
    unreadCount:Number(entry.unreadCount || 0),
    unreadCommentCount:Number(entry.unreadCommentCount || 0),
    replyToMeCount:Number(entry.replyToMeCount || 0),
  };
}

function communityUnreadInfo(posts=communityPosts, channel=communityActiveChannel()){
  const read = communityReadEntry(channel);
  const readAt = read.readAt;
  const initialized = readAt > 0;
  const myUserId = typeof chatUserId === 'function' ? String(chatUserId() || '') : '';
  let latestAt = 0;
  let unreadCount = 0;
  let unreadCommentCount = 0;
  let replyToMeCount = 0;
  (Array.isArray(posts) ? posts : []).forEach((post)=>{
    const postLatest = communityActivityMs(post);
    latestAt = Math.max(latestAt, postLatest);
    if(initialized && postLatest > readAt) unreadCount += 1;
    communityCommentsForPost(post).forEach((comment)=>{
      const commentAt = communityCreatedMs(comment);
      if(!commentAt) return;
      latestAt = Math.max(latestAt, commentAt);
      if(initialized && commentAt > readAt){
        unreadCommentCount += 1;
        if(myUserId && String(post?.user_id || '') === myUserId && String(comment?.user_id || '') !== myUserId){
          replyToMeCount += 1;
        }
      }
    });
  });
  return { initialized, readAt, latestAt, unreadCount, unreadCommentCount, replyToMeCount };
}

function communityPostHasUnreadActivity(post, channel=communityActiveChannel()){
  const read = communityReadEntry(channel);
  return read.readAt > 0 && communityActivityMs(post) > read.readAt;
}

function communityCommentIsUnread(comment, channel=communityActiveChannel()){
  const read = communityReadEntry(channel);
  return read.readAt > 0 && communityCreatedMs(comment) > read.readAt;
}

function communityUnreadBoundaryIndex(posts, channel=communityActiveChannel()){
  const read = communityReadEntry(channel);
  if(read.readAt <= 0) return -1;
  let lastUnread = -1;
  (Array.isArray(posts) ? posts : []).forEach((post, index)=>{
    if(communityActivityMs(post) > read.readAt) lastUnread = index;
  });
  return lastUnread;
}

function rememberCommunityUnreadSnapshot(posts=communityPosts, channel=communityActiveChannel()){
  const key = validCommunityChannel(channel);
  const info = communityUnreadInfo(posts, key);
  const state = communityReadStateLoad();
  state[key] = {
    ...(state[key] || {}),
    latestAt:info.latestAt,
    unreadCount:info.unreadCount,
    unreadCommentCount:info.unreadCommentCount,
    replyToMeCount:info.replyToMeCount,
  };
  communityReadStateSave(state);
  return info;
}

function markCommunityRead(channel=communityActiveChannel(), posts=communityPosts){
  const key = validCommunityChannel(channel);
  const latestAt = communityLatestActivityMs(posts);
  if(!latestAt) return;
  const state = communityReadStateLoad();
  state[key] = {
    ...(state[key] || {}),
    readAt:Math.max(Number(state[key]?.readAt || 0), latestAt),
    latestAt,
    unreadCount:0,
    unreadCommentCount:0,
    replyToMeCount:0,
    markedAt:Date.now(),
  };
  communityReadStateSave(state);
}

function scheduleCommunityMarkRead(posts=communityPosts){
  if(!timelineIsCommunity() || document.hidden) return;
  const channel = communityActiveChannel();
  const latestAt = communityLatestActivityMs(posts);
  if(!latestAt) return;
  if(communityReadMarkTimer) clearTimeout(communityReadMarkTimer);
  communityReadMarkTimer = setTimeout(()=>{
    communityReadMarkTimer = null;
    if(!timelineIsCommunity() || document.hidden || communityActiveChannel() !== channel) return;
    markCommunityRead(channel, posts);
    updateTimelineTabs();
    updateNewsHint();
  }, COMMUNITY_READ_MARK_DELAY_MS);
}

function communityUnreadBadgeForChannel(channel){
  return communityUnreadBadgeMetaForChannel(channel).count;
}

function communityUnreadBadgeMetaForChannel(channel){
  const key = validCommunityChannel(channel);
  if(timelineIsCommunity() && key === communityActiveChannel() && communityPosts.length){
    return { count:communityUnreadInfo(communityPosts, key).unreadCount, approximate:false };
  }
  const read = communityReadEntry(key);
  if(read.unreadCount > 0) return { count:read.unreadCount, approximate:false };
  const summary = communitySummaryEntry(key);
  if(read.readAt > 0 && summary.latestActivityMs > read.readAt){
    return { count:1, approximate:true };
  }
  return { count:0, approximate:false };
}
