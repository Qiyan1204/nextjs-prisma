import { NextResponse } from "next/server";

// Cache configuration
type CacheEntry = {
  data: unknown;
  timestamp: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache for research data

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  if (entry) {
    cache.delete(key);
  }
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
  
  // Clean old entries
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.timestamp > CACHE_TTL * 2) {
        cache.delete(k);
      }
    }
  }
}

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 120; // 120ms between requests

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  return fetch(url);
}

// Fetch helper with error handling
async function fetchFinnhub(endpoint: string, apiKey: string): Promise<any> {
  const url = `https://finnhub.io/api/v1${endpoint}&token=${apiKey}`;
  const res = await rateLimitedFetch(url);
  
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('Rate limit exceeded');
    }
    throw new Error(`Finnhub API error: ${res.status}`);
  }
  
  return res.json();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase() || "AAPL";
  const type = searchParams.get("type") || "all";

  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "FINNHUB_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const cacheKey = `research-${symbol}-${type}`;
  const cachedData = getFromCache(cacheKey);
  if (cachedData) {
    return NextResponse.json(cachedData);
  }

  try {
    let result: any = {};

    // Fetch based on type
    if (type === "all" || type === "profile") {
      try {
        const profile = await fetchFinnhub(`/stock/profile2?symbol=${symbol}`, apiKey);
        result.profile = profile;
      } catch (e) {
        result.profile = null;
      }
    }

    if (type === "all" || type === "quote") {
      try {
        const quote = await fetchFinnhub(`/quote?symbol=${symbol}`, apiKey);
        result.quote = quote;
      } catch (e) {
        result.quote = null;
      }
    }

    if (type === "all" || type === "metrics") {
      try {
        // Basic financials (includes P/E, P/B, EPS, etc.)
        const metrics = await fetchFinnhub(`/stock/metric?symbol=${symbol}&metric=all`, apiKey);
        result.metrics = metrics;
      } catch (e) {
        result.metrics = null;
      }
    }

    if (type === "all" || type === "financials") {
      try {
        // Get annual financials
        const financials = await fetchFinnhub(`/stock/financials-reported?symbol=${symbol}&freq=annual`, apiKey);
        result.financials = financials;
      } catch (e) {
        result.financials = null;
      }
    }

    if (type === "all" || type === "recommendation") {
      try {
        const recommendation = await fetchFinnhub(`/stock/recommendation?symbol=${symbol}`, apiKey);
        result.recommendation = recommendation;
      } catch (e) {
        result.recommendation = null;
      }
    }

    if (type === "all" || type === "priceTarget") {
      try {
        const priceTarget = await fetchFinnhub(`/stock/price-target?symbol=${symbol}`, apiKey);
        result.priceTarget = priceTarget;
      } catch (e) {
        result.priceTarget = null;
      }
    }

    if (type === "all" || type === "earnings") {
      try {
        const earnings = await fetchFinnhub(`/stock/earnings?symbol=${symbol}`, apiKey);
        result.earnings = earnings;
      } catch (e) {
        result.earnings = null;
      }
    }

    if (type === "all" || type === "ownership") {
      try {
        const ownership = await fetchFinnhub(`/stock/ownership?symbol=${symbol}&limit=20`, apiKey);
        result.ownership = ownership;
      } catch (e) {
        result.ownership = null;
      }
    }

    if (type === "all" || type === "insider") {
      try {
        const insider = await fetchFinnhub(`/stock/insider-transactions?symbol=${symbol}`, apiKey);
        result.insider = insider;
      } catch (e) {
        result.insider = null;
      }
    }

    if (type === "all" || type === "peers") {
      try {
        const peers = await fetchFinnhub(`/stock/peers?symbol=${symbol}`, apiKey);
        result.peers = peers;
      } catch (e) {
        result.peers = null;
      }
    }

    if (type === "all" || type === "news") {
      try {
        const today = new Date();
        const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const fromDate = oneMonthAgo.toISOString().split('T')[0];
        const toDate = today.toISOString().split('T')[0];
        const news = await fetchFinnhub(`/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}`, apiKey);
        result.news = Array.isArray(news) ? news.slice(0, 10) : [];
      } catch (e) {
        result.news = [];
      }
    }

    setCache(cacheKey, result);
    return NextResponse.json(result);

  } catch (error) {
    console.error("Research API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch research data",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
