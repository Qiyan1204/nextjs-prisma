import type { CategoryKey } from "./categoryConfig";

type EventTag = { label?: string; slug?: string };

type MinimalEvent = {
  id?: string;
  title?: string;
  description?: string;
  slug?: string;
  tags?: EventTag[];
  startDate?: string;
  endDate?: string;
};

export type MarketGroupPreset = {
  key: string;
  label: string;
  description: string;
  category: CategoryKey;
  includeAll?: string[];
  includeAny?: string[];
  excludeAny?: string[];
  titleRegexAny?: string[];
  maxEventAgeDays?: number;
};

export const MARKET_GROUP_PRESETS: MarketGroupPreset[] = [
  {
    key: "elon-tweets-live",
    label: "Elon Tweets Live",
    description: "Live Elon/X tweet-related contracts with tradable market dynamics.",
    category: "elonTweets",
    includeAny: ["tweet", "tweets", "twitter", "x.com", "x profile", "profile picture", "post on x"],
    excludeAny: ["spacex", "starship", "grok", "ipo", "tesla delivery", "register any party"],
  },
  {
    key: "elon-tweet-windows",
    label: "Elon Tweet Windows",
    description: "Tweet-count window contracts (e.g. Elon Musk # tweets April X - April Y).",
    category: "elonTweets",
    includeAll: ["elon", "tweet"],
    includeAny: ["# tweets", "tweets", "tweet count"],
    excludeAny: ["grok", "spacex", "starship", "register any party", "party before", "tesla delivery"],
    titleRegexAny: [
      "elon\\s+musk\\s*#?\\s*tweets?",
      "tweets?\\s+[a-z]+\\s+\\d{1,2}\\s*-\\s*[a-z]+\\s+\\d{1,2}",
    ],
  },
  {
    key: "elon-broad",
    label: "Elon Broad",
    description: "All Elon-related markets under the default category mapping.",
    category: "elonTweets",
  },
  {
    key: "movies-box-office-core",
    label: "Movies Box Office Core",
    description: "Movie opening/weekend/gross focused contracts.",
    category: "movieBoxOffice",
    includeAny: ["box office", "opening weekend", "domestic gross", "worldwide gross"],
    excludeAny: ["elon", "fed", "nba", "bitcoin"],
  },
  {
    key: "fed-rates-core",
    label: "Fed Rates Core",
    description: "FOMC, rate-cut, and federal reserve rates contracts.",
    category: "fedRates",
    includeAny: ["federal reserve", "fomc", "rate cut", "rate hike", "interest rate"],
    excludeAny: ["fedex", "federal court", "federal agency"],
  },
  {
    key: "nba-games-core",
    label: "NBA Games Core",
    description: "NBA regular season, playoffs, finals, and game-result contracts.",
    category: "nbaGames",
    includeAny: ["nba", "basketball", "playoffs", "finals"],
    excludeAny: ["nfl", "mlb", "nhl", "soccer"],
  },
];

const DEFAULT_PRESET_KEY_BY_CATEGORY: Record<CategoryKey, string> = {
  elonTweets: "elon-tweets-live",
  movieBoxOffice: "movies-box-office-core",
  fedRates: "fed-rates-core",
  nbaGames: "nba-games-core",
};

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function toEventText(event: MinimalEvent): string {
  const title = event.title || "";
  const desc = event.description || "";
  const slug = event.slug || "";
  const tags = (event.tags || [])
    .map((tag) => `${tag.label || ""} ${tag.slug || ""}`.trim())
    .join(" ");
  return normalize(`${title} ${desc} ${slug} ${tags}`);
}

function eventAgeDays(event: MinimalEvent): number | null {
  const raw = event.endDate || event.startDate;
  if (!raw) return null;
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
}

export function getPresetsForCategory(category: CategoryKey): MarketGroupPreset[] {
  const fromCategory = MARKET_GROUP_PRESETS.filter((preset) => preset.category === category);
  if (fromCategory.length > 0) return fromCategory;

  return [
    {
      key: `${category}-default`,
      label: "Default",
      description: "Default category grouping.",
      category,
    },
  ];
}

export function getDefaultPresetForCategory(category: CategoryKey): MarketGroupPreset {
  const presets = getPresetsForCategory(category);
  const preferredKey = DEFAULT_PRESET_KEY_BY_CATEGORY[category];
  return presets.find((preset) => preset.key === preferredKey) || presets[0];
}

export function getPresetByKey(category: CategoryKey, presetKey?: string | null): MarketGroupPreset {
  const presets = getPresetsForCategory(category);
  const matched = presets.find((preset) => preset.key === presetKey);
  return matched || getDefaultPresetForCategory(category);
}

export function eventMatchesGroupPreset(event: MinimalEvent, preset: MarketGroupPreset): boolean {
  const text = toEventText(event);
  const title = normalize(event.title || "");

  if (preset.maxEventAgeDays != null) {
    const age = eventAgeDays(event);
    if (age != null && age > preset.maxEventAgeDays) return false;
  }

  if (Array.isArray(preset.includeAll) && preset.includeAll.length > 0) {
    const hasAll = preset.includeAll.every((kw) => text.includes(normalize(kw)));
    if (!hasAll) return false;
  }

  if (Array.isArray(preset.includeAny) && preset.includeAny.length > 0) {
    const hasAny = preset.includeAny.some((kw) => text.includes(normalize(kw)));
    if (!hasAny) return false;
  }

  if (Array.isArray(preset.excludeAny) && preset.excludeAny.length > 0) {
    const hasExcluded = preset.excludeAny.some((kw) => text.includes(normalize(kw)));
    if (hasExcluded) return false;
  }

  if (Array.isArray(preset.titleRegexAny) && preset.titleRegexAny.length > 0) {
    const regexMatched = preset.titleRegexAny.some((pattern) => {
      try {
        return new RegExp(pattern, "i").test(title);
      } catch {
        return false;
      }
    });
    if (!regexMatched) return false;
  }

  return true;
}
