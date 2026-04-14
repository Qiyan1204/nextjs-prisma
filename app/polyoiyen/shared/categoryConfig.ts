export type CategoryKey = "elonTweets" | "movieBoxOffice" | "fedRates" | "nbaGames";

export type CategoryConfigItem = {
  key: CategoryKey;
  label: string;
  keywords: string[];
  pageSignals?: string[];
  tagSlugs?: string[];
};

export const CATEGORY_CONFIG: CategoryConfigItem[] = [
  {
    key: "elonTweets",
    label: "Elon Tweets",
    tagSlugs: ["tweets-markets"],
    keywords: ["elon", "musk", "tweet", "twitter", "x.com"],
    pageSignals: ["predictions/elon-tweets", "elon-tweets"],
  },
  {
    key: "movieBoxOffice",
    label: "Movie Box Office",
    tagSlugs: ["movies"],
    keywords: ["box office", "movie", "opening weekend", "domestic gross", "worldwide gross", "theatrical"],
    pageSignals: ["pop-culture/movies", "pop-culture/movie", "predictions/movie", "movie"],
  },
  {
    key: "fedRates",
    label: "US Federal Reserve Interest Rates",
    tagSlugs: ["economic-policy", "fed-rates"],
    keywords: ["federal reserve", "fed", "fomc", "rate hike", "rate cut", "interest rate", "economic policy"],
    pageSignals: ["predictions/economic-policy", "economic-policy", "federal-interest-rates"],
  },
  {
    key: "nbaGames",
    label: "NBA Basketball games",
    tagSlugs: ["nba"],
    keywords: ["nba", "basketball", "playoffs", "lakers", "celtics", "warriors"],
    pageSignals: ["predictions/nba", "nba"],
  },
];

type EventTag = { label?: string; slug?: string };

export function toEventText(event: { title?: string; description?: string; tags?: EventTag[]; slug?: string; category?: string }): string {
  const title = event.title || "";
  const desc = event.description || "";
  const tags = (event.tags || []).map((t) => `${t.label || ""} ${t.slug || ""}`.trim()).join(" ");
  const slug = event.slug || "";
  const category = event.category || "";
  return `${title} ${desc} ${tags} ${slug} ${category}`.toLowerCase();
}

export function getCategoryConfig(categoryKey: CategoryKey): CategoryConfigItem | undefined {
  return CATEGORY_CONFIG.find((c) => c.key === categoryKey);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatchesText(text: string, keyword: string): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return false;

  if (normalizedKeyword.includes(" ")) {
    return text.includes(normalizedKeyword);
  }

  const pattern = new RegExp(`\\b${escapeRegex(normalizedKeyword)}\\b`, "i");
  return pattern.test(text);
}

export function eventMatchesCategory(
  event: { title?: string; description?: string; tags?: EventTag[]; slug?: string; category?: string },
  categoryKey: CategoryKey
): boolean {
  const config = getCategoryConfig(categoryKey);
  if (!config) return false;
  const text = toEventText(event);

  const matchesPageSignal = (config.pageSignals || []).some((signal) => text.includes(signal.toLowerCase()));
  if (matchesPageSignal) return true;

  return config.keywords.some((keyword) => keywordMatchesText(text, keyword));
}

/**
 * Quick market filter format used by home page and market boards.
 * Combines tag slugs, page signals, and keywords for multi-strategy filtering.
 */
export type QuickMarketFilter = {
  label: string;
  tagSlugs: string[];
  signals: string[];
  keywords: string[];
};

/**
 * Shared quick market filters derived from CATEGORY_CONFIG.
 * Used by home page and OiyenScore for consistent category filtering.
 */
export const QUICK_MARKET_FILTERS: QuickMarketFilter[] = CATEGORY_CONFIG.map((cfg) => ({
  label: cfg.label,
  tagSlugs: cfg.tagSlugs || [],
  signals: cfg.pageSignals || [],
  keywords: cfg.keywords,
})).concat([
  {
    label: "NFL",
    tagSlugs: ["nfl"],
    signals: ["predictions/nfl", "nfl"],
    keywords: ["nfl", "football", "super bowl", "touchdown", "quarterback"],
  },
]);

/**
 * Tag slugs by category key for direct API filtering.
 * Used by OiyenScore and other category-based fetchers.
 */
export const TAG_SLUGS_BY_CATEGORY: Record<CategoryKey, string[]> = {
  elonTweets: CATEGORY_CONFIG.find((c) => c.key === "elonTweets")?.tagSlugs || [],
  movieBoxOffice: CATEGORY_CONFIG.find((c) => c.key === "movieBoxOffice")?.tagSlugs || [],
  fedRates: CATEGORY_CONFIG.find((c) => c.key === "fedRates")?.tagSlugs || [],
  nbaGames: CATEGORY_CONFIG.find((c) => c.key === "nbaGames")?.tagSlugs || [],
};