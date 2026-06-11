import { classifyProofType } from "./candidates.mjs";
import { clamp, daysAgo, percentileRank, uniqueBy } from "./utils.mjs";

const LENS_WEIGHTS = {
  all_time_top: { engagement: 0.4, proofQuality: 0.35, evergreen: 0.2, recency: 0.05 },
  last_year_best: { engagement: 0.35, proofQuality: 0.3, evergreen: 0.1, recency: 0.25 },
  visual_proof: { engagement: 0.2, proofQuality: 0.35, visual: 0.35, recency: 0.1 },
  launch_receipts: { engagement: 0.25, proofQuality: 0.4, launch: 0.25, recency: 0.1 },
  thread_authority: { engagement: 0.3, proofQuality: 0.45, thread: 0.2, recency: 0.05 },
  recent_hotness: { engagement: 0.45, proofQuality: 0.25, velocity: 0.25, recency: 0.05 },
  theme_clusters: { engagement: 0.35, proofQuality: 0.35, evergreen: 0.15, recency: 0.15 },
  curated_mix: { engagement: 0.35, proofQuality: 0.3, evergreen: 0.15, visual: 0.1, recency: 0.1 },
  maintain: { engagement: 0.4, proofQuality: 0.3, velocity: 0.25, recency: 0.05 },
};

const PENALTY_TERMS = [
  /dunking|ratio|owned|clown/i,
  /ignore all prior instructions/i,
];

export function scoreCandidates(candidates, { lens = "curated_mix", now = new Date() } = {}) {
  const weights = LENS_WEIGHTS[lens] ?? LENS_WEIGHTS.curated_mix;
  const likes = candidates.map((c) => c.metrics.likes);
  const reposts = candidates.map((c) => c.metrics.reposts);
  const replies = candidates.map((c) => c.metrics.replies);
  const views = candidates.map((c) => c.metrics.views).filter((v) => v > 0);

  const scored = candidates.map((candidate) => {
    const ageDays = daysAgo(candidate.createdAt, now);
    const engagement =
      (percentileRank(candidate.metrics.likes, likes) * 0.35 +
        percentileRank(candidate.metrics.reposts, reposts) * 0.25 +
        percentileRank(candidate.metrics.replies, replies) * 0.2 +
        (views.length ? percentileRank(candidate.metrics.views, views) * 0.2 : 0)) /
      (views.length ? 1 : 0.8);

    const proofTags = classifyProofType(candidate);
    candidate.lensTags = [...new Set([...candidate.lensTags, ...proofTags])];

    let proofQuality = 0.55;
    if (proofTags.includes("authority")) proofQuality += 0.15;
    if (proofTags.includes("demand")) proofQuality += 0.12;
    if (proofTags.includes("launch")) proofQuality += 0.1;
    if (proofTags.includes("trust")) proofQuality += 0.08;
    proofQuality = clamp(proofQuality);

    const evergreen = clamp(1 - ageDays / 730);
    const recencyFit = clamp(1 - ageDays / 365);
    const visualStrength =
      candidate.media.hasImage || candidate.media.hasVideo
        ? clamp(0.55 + candidate.media.photoCount * 0.1 + candidate.media.videoCount * 0.08)
        : 0.2;
    const launchSignal = proofTags.includes("launch") ? 0.85 : 0.35;
    const threadSignal = candidate.thread.isThread ? 0.8 : 0.4;
    const velocity = clamp(
      engagement * (ageDays <= 7 ? 1.2 : ageDays <= 30 ? 0.9 : 0.5),
    );

    let penalty = 0;
    for (const pattern of PENALTY_TERMS) {
      if (pattern.test(candidate.text)) penalty += 0.35;
    }
    if (candidate.text.length < 24) penalty += 0.15;

    const final = clamp(
      engagement * (weights.engagement ?? 0.35) +
        proofQuality * (weights.proofQuality ?? 0.3) +
        evergreen * (weights.evergreen ?? 0.15) +
        recencyFit * (weights.recency ?? 0.05) +
        visualStrength * (weights.visual ?? 0.05) +
        launchSignal * (weights.launch ?? 0) +
        threadSignal * (weights.thread ?? 0) +
        velocity * (weights.velocity ?? 0) -
        penalty,
    );

    candidate.scores = {
      engagement: round(engagement),
      recency: round(recencyFit),
      proofQuality: round(proofQuality),
      final: round(final),
    };
    candidate.rationale = buildRationale(candidate, proofTags);
    return candidate;
  });

  return scored.sort((a, b) => b.scores.final - a.scores.final);
}

export function filterByLens(candidates, lens, now = new Date()) {
  if (lens === "last_year_best") {
    return candidates.filter((c) => daysAgo(c.createdAt, now) <= 365);
  }
  if (lens === "recent_hotness" || lens === "maintain") {
    const recent = candidates.filter((c) => daysAgo(c.createdAt, now) <= 7);
    if (recent.length >= 3) return recent;
    return candidates.filter((c) => daysAgo(c.createdAt, now) <= 30);
  }
  if (lens === "visual_proof") {
    return candidates.filter((c) => c.media.hasImage || c.media.hasVideo);
  }
  if (lens === "launch_receipts") {
    return candidates.filter(
      (c) =>
        c.lensTags.includes("launch") ||
        ((c.media.hasImage || c.media.hasVideo) && /launch|ship|demo|screenshot/i.test(c.text)),
    );
  }
  if (lens === "thread_authority") {
    return candidates.filter((c) => c.thread.isThread || c.lensTags.includes("authority"));
  }
  return candidates;
}

export function selectRecommended(candidates, lens) {
  const deduped = uniqueBy(candidates, (c) => c.sourceUrl);
  const limits = {
    all_time_top: { pool: 24, pick: 12 },
    last_year_best: { pool: 24, pick: 12 },
    visual_proof: { pool: 24, pick: 10 },
    launch_receipts: { pool: 24, pick: 10 },
    thread_authority: { pool: 24, pick: 10 },
    recent_hotness: { pool: 12, pick: 6 },
    theme_clusters: { pool: 24, pick: 12 },
    curated_mix: { pool: 24, pick: 12 },
    maintain: { pool: 12, pick: 3 },
  };
  const { pool, pick } = limits[lens] ?? limits.curated_mix;

  if (lens === "curated_mix") {
    return buildCuratedMix(deduped.slice(0, pool), pick);
  }
  if (lens === "theme_clusters") {
    return deduped.slice(0, pool);
  }
  return deduped.slice(0, Math.min(pick, deduped.length));
}

function buildCuratedMix(candidates, pick) {
  const buckets = {
    authority: [],
    demand: [],
    launch: [],
    momentum: [],
    visual: [],
    trust: [],
    other: [],
  };

  for (const candidate of candidates) {
    if (candidate.lensTags.includes("authority")) buckets.authority.push(candidate);
    else if (candidate.lensTags.includes("demand")) buckets.demand.push(candidate);
    else if (candidate.lensTags.includes("launch")) buckets.launch.push(candidate);
    else if (candidate.scores.recency > 0.7) buckets.momentum.push(candidate);
    else if (candidate.media.hasImage || candidate.media.hasVideo) buckets.visual.push(candidate);
    else if (candidate.lensTags.includes("trust")) buckets.trust.push(candidate);
    else buckets.other.push(candidate);
  }

  const plan = [];
  const take = (bucket, count) => {
    for (const item of bucket) {
      if (plan.length >= pick) break;
      if (!plan.some((p) => p.sourceUrl === item.sourceUrl)) plan.push(item);
      if (plan.filter((p) => bucket.includes(p)).length >= count) break;
    }
  };

  if (candidates[0]) plan.push(candidates[0]);
  take(buckets.authority, 3);
  take(buckets.demand, 2);
  take(buckets.launch, 2);
  take(buckets.momentum, 2);
  take(buckets.visual, 2);
  take(buckets.trust, 1);

  for (const candidate of candidates) {
    if (plan.length >= pick) break;
    if (!plan.some((p) => p.sourceUrl === candidate.sourceUrl)) plan.push(candidate);
  }

  return plan.slice(0, pick);
}

export function groupByTheme(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    const theme = candidate.lensTags[0] ?? "other";
    if (!groups.has(theme)) groups.set(theme, []);
    groups.get(theme).push(candidate);
  }
  return Object.fromEntries(groups);
}

function buildRationale(candidate, proofTags) {
  const parts = [];
  if (proofTags.includes("authority")) parts.push("authority signal");
  if (proofTags.includes("demand")) parts.push("demand signal");
  if (proofTags.includes("launch")) parts.push("launch/result proof");
  if (candidate.media.hasImage || candidate.media.hasVideo) parts.push("visual proof");
  if (candidate.thread.isThread) parts.push("thread depth");
  if (candidate.metrics.likes > 0) parts.push(`${candidate.metrics.likes} likes`);
  return parts.length ? `Strong ${parts.join(", ")}.` : "Solid page-building candidate.";
}

function round(value) {
  return Math.round(value * 100) / 100;
}
