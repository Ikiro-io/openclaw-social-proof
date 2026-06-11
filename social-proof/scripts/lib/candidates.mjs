import { normalizeXStatusUrl } from "./utils.mjs";

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?prior\s+instructions/i,
  /ignore\s+previous\s+instructions/i,
  /publish\s+my\s+page/i,
  /site\.publish/i,
];

export function normalizeRawPost(raw = {}) {
  const parsedUrl = normalizeXStatusUrl(raw.sourceUrl ?? raw.url ?? raw.postUrl ?? "");
  const handle = String(raw.authorHandle ?? raw.handle ?? parsedUrl?.handle ?? "").replace(/^@/, "");
  const statusId = String(raw.sourceId ?? raw.id ?? raw.statusId ?? parsedUrl?.statusId ?? "");
  const sourceUrl =
    parsedUrl?.sourceUrl ??
    (handle && statusId ? `https://x.com/${handle}/status/${statusId}` : "");

  if (!sourceUrl || !normalizeXStatusUrl(sourceUrl)) {
    return null;
  }

  const metrics = {
    likes: numberOrZero(raw.metrics?.likes ?? raw.likes ?? raw.like_count),
    reposts: numberOrZero(raw.metrics?.reposts ?? raw.reposts ?? raw.retweet_count),
    replies: numberOrZero(raw.metrics?.replies ?? raw.replies ?? raw.reply_count),
    views: numberOrZero(raw.metrics?.views ?? raw.views ?? raw.view_count),
  };

  const mediaInput = raw.media ?? {};
  const hasImage = Boolean(mediaInput.hasImage ?? raw.hasImage ?? raw.has_image);
  const hasVideo = Boolean(mediaInput.hasVideo ?? raw.hasVideo ?? raw.has_video);
  const photoCount = numberOrZero(mediaInput.photoCount ?? raw.photoCount ?? (hasImage ? 1 : 0));
  const videoCount = numberOrZero(mediaInput.videoCount ?? raw.videoCount ?? (hasVideo ? 1 : 0));

  const threadUrls = Array.isArray(raw.thread?.urls)
    ? raw.thread.urls
    : Array.isArray(raw.threadUrls)
      ? raw.threadUrls
      : [];

  const normalizedThreadUrls = threadUrls
    .map((url) => normalizeXStatusUrl(url)?.sourceUrl)
    .filter(Boolean);

  const text = String(raw.text ?? raw.full_text ?? "").trim();

  return {
    platform: "x",
    sourceId: statusId || parsedUrl.statusId,
    sourceUrl,
    authorHandle: handle,
    createdAt: String(raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
    text,
    metrics,
    media: {
      hasImage: hasImage || photoCount > 0,
      hasVideo: hasVideo || videoCount > 0,
      photoCount,
      videoCount,
      thumbnailUrl: String(mediaInput.thumbnailUrl ?? raw.thumbnailUrl ?? sourceUrl),
    },
    thread: {
      isThread: Boolean(raw.thread?.isThread ?? normalizedThreadUrls.length > 1),
      urls: normalizedThreadUrls.length ? normalizedThreadUrls : [sourceUrl],
    },
    links: Array.isArray(raw.links) ? raw.links.map(String) : [],
    lensTags: Array.isArray(raw.lensTags) ? raw.lensTags.map(String) : [],
    scores: {
      engagement: 0,
      recency: 0,
      proofQuality: 0,
      final: 0,
    },
    rationale: "",
  };
}

export function normalizePostsInput(input) {
  const posts = Array.isArray(input)
    ? input
    : Array.isArray(input?.posts)
      ? input.posts
      : Array.isArray(input?.candidates)
        ? input.candidates
        : [];

  return posts.map(normalizeRawPost).filter(Boolean);
}

export function containsInjectionInstruction(text) {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(String(text ?? "")));
}

export function classifyProofType(candidate) {
  const text = String(candidate.text ?? "").toLowerCase();
  const tags = [];

  if (/(thread|🧵|step \d|here's how|here is how)/.test(text)) tags.push("authority");
  if (/(launch|shipped|released|waitlist|beta|v\d|demo|screenshot)/.test(text)) tags.push("launch");
  if (/(how do i|where can i|link\?|dm me|sign up|download)/.test(text)) tags.push("demand");
  if (/(customer|testimonial|review|thank you|loved)/.test(text)) tags.push("trust");
  if (candidate.media.hasImage || candidate.media.hasVideo) tags.push("visual");
  if (/(before\/after|portfolio|design|aesthetic)/.test(text)) tags.push("taste");
  if (tags.length === 0) tags.push("authority");

  return tags;
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
