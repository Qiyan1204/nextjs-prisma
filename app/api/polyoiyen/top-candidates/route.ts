import { NextResponse } from "next/server";
import { CATEGORY_CONFIG, TAG_SLUGS_BY_CATEGORY, type CategoryKey } from "@/app/polyoiyen/shared/categoryConfig";
import { hasCompleteYesNoTokens } from "@/app/polyoiyen/shared/marketAssessmentEngine";

type PolyEventLite = {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  volume?: number;
  liquidity?: number;
  commentCount?: number;
  markets?: Array<{ clobTokenIds?: string; active?: boolean; closed?: boolean }>;
  tags?: Array<{ label?: string; slug?: string }>;
};

type CandidateRow = {
  eventId: string;
  title: string;
  slug: string;
  score: number;
  scoreBand: "Strong" | "Balanced" | "Watch";
  volume: number;
  liquidity: number;
  commentCount: number;
  recencyDays: number;
};

function toDateMs(value?: string): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function toRecencyDays(event: PolyEventLite): number {
  const end = toDateMs(event.endDate);
  const start = toDateMs(event.startDate);
  const ref = end || start;
  if (!ref) return 999;
  return Math.max(0, Math.floor((Date.now() - ref) / 86_400_000));
}

function scoreEvent(event: PolyEventLite): number {
  const volume = Math.max(0, Number(event.volume || 0));
  const liquidity = Math.max(0, Number(event.liquidity || 0));
  const comments = Math.max(0, Number(event.commentCount || 0));
  const recencyDays = toRecencyDays(event);

  const activityPart = Math.log1p(volume) * 7.2;
  const liquidityPart = Math.log1p(liquidity) * 7.6;
  const attentionPart = Math.log1p(comments) * 6.4;
  const recencyPart = Math.max(0, 30 - Math.min(30, recencyDays * 0.7));

  return Number((activityPart + liquidityPart + attentionPart + recencyPart).toFixed(1));
}

async function fetchEventsByTagSlug(tagSlug: string, limit: number): Promise<PolyEventLite[]> {
  const upstream = new URL("https://gamma-api.polymarket.com/events");
  upstream.searchParams.set("limit", String(limit));
  upstream.searchParams.set("offset", "0");
  upstream.searchParams.set("active", "true");
  upstream.searchParams.set("closed", "false");
  upstream.searchParams.set("tag_slug", tagSlug);

  const res = await fetch(upstream.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return [];

  const payload = await res.json();
  const events = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [];
  return events as PolyEventLite[];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limitPerCategory = Math.max(3, Math.min(20, Number(searchParams.get("limit") || 8)));

  const out: Record<CategoryKey, CandidateRow[]> = {
    elonTweets: [],
    movieBoxOffice: [],
    fedRates: [],
    nbaGames: [],
  };

  for (const category of CATEGORY_CONFIG) {
    const tagSlugs = TAG_SLUGS_BY_CATEGORY[category.key] || [];
    const dedup = new Map<string, PolyEventLite>();

    for (const slug of tagSlugs) {
      const events = await fetchEventsByTagSlug(slug, 120);
      for (const event of events) {
        if (!event?.id || dedup.has(event.id)) continue;
        if (!hasCompleteYesNoTokens(event)) continue;
        dedup.set(event.id, event);
      }
    }

    const rows: CandidateRow[] = Array.from(dedup.values())
      .map((event) => {
        const score = scoreEvent(event);
        const scoreBand: CandidateRow["scoreBand"] = score >= 72 ? "Strong" : score >= 50 ? "Balanced" : "Watch";
        return {
          eventId: event.id,
          title: event.title,
          slug: event.slug || "",
          score,
          scoreBand,
          volume: Number(event.volume || 0),
          liquidity: Number(event.liquidity || 0),
          commentCount: Number(event.commentCount || 0),
          recencyDays: toRecencyDays(event),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limitPerCategory);

    out[category.key] = rows;
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    limitPerCategory,
    categories: out,
  });
}
