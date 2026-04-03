export type CategoryKey = "elonTweets" | "movieBoxOffice" | "fedRates" | "nbaGames";

export type CategoryConfigItem = {
  key: CategoryKey;
  label: string;
  keywords: string[];
};

export const CATEGORY_CONFIG: CategoryConfigItem[] = [
  { key: "elonTweets", label: "Elon Tweets", keywords: ["elon", "musk", "tweet", "twitter", "x.com"] },
  { key: "movieBoxOffice", label: "Movie Box Office", keywords: ["box office", "movie", "opening weekend", "domestic gross", "worldwide gross", "theatrical"] },
  { key: "fedRates", label: "US Federal Reserve Interest Rates", keywords: ["federal reserve", "fed", "fomc", "rate hike", "rate cut", "interest rate"] },
  { key: "nbaGames", label: "NBA Basketball games", keywords: ["nba", "basketball", "playoffs", "lakers", "celtics", "warriors"] },
];

type EventTag = { label?: string; slug?: string };

export function toEventText(event: { title?: string; description?: string; tags?: EventTag[] }): string {
  const title = event.title || "";
  const desc = event.description || "";
  const tags = (event.tags || []).map((t) => t.label || "").join(" ");
  return `${title} ${desc} ${tags}`.toLowerCase();
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

export function eventMatchesCategory(event: { title?: string; description?: string; tags?: EventTag[] }, categoryKey: CategoryKey): boolean {
  const config = getCategoryConfig(categoryKey);
  if (!config) return false;
  const text = toEventText(event);
  return config.keywords.some((keyword) => keywordMatchesText(text, keyword));
}