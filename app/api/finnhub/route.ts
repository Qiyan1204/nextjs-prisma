import { NextResponse } from "next/server";

export type TimeInterval = "1" | "5" | "15" | "30" | "60" | "D" | "W" | "M";

// ============= SERVER-SIDE CACHE =============
// Cache to prevent hitting Finnhub's rate limit (60 calls/min for free tier)
type CacheEntry = {
  data: unknown;
  timestamp: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 1000; // 30 seconds cache
const QUOTE_CACHE_TTL = 15 * 1000; // 15 seconds for quotes (more real-time)

// Request queue to prevent concurrent duplicate requests
const pendingRequests = new Map<string, Promise<unknown>>();

function getCacheKey(symbol: string, interval: string, limit: string | null): string {
  return `${symbol}-${interval}-${limit || 'full'}`;
}

function getFromCache(key: string, ttl: number): unknown | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < ttl) {
    return entry.data;
  }
  if (entry) {
    cache.delete(key); // Clean expired entry
  }
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
  
  // Clean old entries if cache gets too large (prevent memory leak)
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.timestamp > CACHE_TTL * 2) {
        cache.delete(k);
      }
    }
  }
}

// Rate limiting: track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // 100ms between requests (10 req/sec max)

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  return fetch(url);
}

// ============= END CACHE =============

// Map user-friendly intervals to Finnhub resolution codes
function mapIntervalToResolution(interval: string): {
  resolution: TimeInterval;
  days: number;
} {
  const mapping: Record<string, { resolution: TimeInterval; days: number }> = {
    "10m": { resolution: "1", days: 1 }, // 1 min data for 10 minutes (last 1 day)
    "30m": { resolution: "5", days: 1 }, // 5 min data for 30 minutes
    "1h": { resolution: "15", days: 1 }, // 15 min data for 1 hour
    "12h": { resolution: "30", days: 1 }, // 30 min data for 12 hours
    "1d": { resolution: "60", days: 7 }, // 60 min data for 1 day (show 1 week)
    "1w": { resolution: "D", days: 7 }, // Daily data for 1 week
    "1m": { resolution: "D", days: 30 }, // Daily data for 1 month
    "6m": { resolution: "D", days: 180 }, // Daily data for 6 months
    "1y": { resolution: "W", days: 365 }, // Weekly data for 1 year
  };

  return mapping[interval] || { resolution: "D", days: 7 };
}

// Calculate date range based on interval
function getDateRange(days: number) {
  const now = Math.floor(Date.now() / 1000); // UNIX timestamp in seconds
  const from = now - days * 24 * 60 * 60;
  return { from, to: now };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "AAPL";
  const interval = searchParams.get("interval") || "1d";
  const limit = searchParams.get("limit");

  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "FINNHUB_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const cacheKey = getCacheKey(symbol, interval, limit);
  const cacheTTL = limit === "1" ? QUOTE_CACHE_TTL : CACHE_TTL;

  // Check cache first
  const cachedData = getFromCache(cacheKey, cacheTTL);
  if (cachedData) {
    return NextResponse.json(cachedData);
  }

  // Prevent duplicate concurrent requests for the same data
  if (pendingRequests.has(cacheKey)) {
    try {
      const result = await pendingRequests.get(cacheKey);
      return NextResponse.json(result);
    } catch {
      // If pending request failed, continue with new request
    }
  }

  // Create the request promise
  const requestPromise = (async () => {
    try {
      // For simple quote requests (limit=1)
      if (limit === "1") {
        const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
        const quoteRes = await rateLimitedFetch(quoteUrl);

        if (!quoteRes.ok) {
          if (quoteRes.status === 429) {
            throw new Error(`Rate limit exceeded. Please wait a moment and try again.`);
          }
          throw new Error(`Finnhub API error: ${quoteRes.status}`);
        }

        const quoteData = await quoteRes.json();

        // Transform to match our expected format
        const transformedData = {
          data: [
            {
              symbol: symbol,
              date: new Date().toISOString(),
              open: quoteData.o || quoteData.c,
              high: quoteData.h || quoteData.c,
              low: quoteData.l || quoteData.c,
              close: quoteData.c,
              volume: 0,
            },
          ],
        };

        setCache(cacheKey, transformedData);
        return transformedData;
      }

      // For all requests (free tier doesn't support candles)
      // Use quote API and generate simulated historical data based on current price
      const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
      const quoteRes = await rateLimitedFetch(quoteUrl);

      if (!quoteRes.ok) {
        if (quoteRes.status === 429) {
          throw new Error(`Rate limit exceeded. Please wait a moment and try again.`);
        }
        throw new Error(`Finnhub API error: ${quoteRes.status}`);
      }

      const quoteData = await quoteRes.json();
      const currentPrice = quoteData.c;

      if (!currentPrice) {
        return {
          data: [],
          error: "No data available for this symbol",
        };
      }

      // Generate simulated historical data based on current price
      const { days } = mapIntervalToResolution(interval);
    
    // Determine if this is an intraday interval
    const isIntraday = ["10m", "30m", "1h", "12h"].includes(interval);
    
    // Calculate data points and time step based on interval
    let dataPoints: number;
    let timeStepMinutes: number;
    
    if (isIntraday) {
      switch (interval) {
        case "10m":
          dataPoints = 10;
          timeStepMinutes = 1;
          break;
        case "30m":
          dataPoints = 30;
          timeStepMinutes = 1;
          break;
        case "1h":
          dataPoints = 12;
          timeStepMinutes = 5;
          break;
        case "12h":
          dataPoints = 24;
          timeStepMinutes = 30;
          break;
        default:
          dataPoints = 10;
          timeStepMinutes = 1;
      }
    } else {
      // For daily intervals
      switch (interval) {
        case "1d":
          dataPoints = 24; // 24 hours
          timeStepMinutes = 60; // 1 hour
          break;
        case "1w":
          dataPoints = 7; // 7 days
          timeStepMinutes = 24 * 60; // 1 day
          break;
        case "1m":
          dataPoints = 30; // 30 days
          timeStepMinutes = 24 * 60; // 1 day
          break;
        case "6m":
          dataPoints = 26; // ~26 weeks
          timeStepMinutes = 7 * 24 * 60; // 1 week
          break;
        case "1y":
          dataPoints = 52; // 52 weeks
          timeStepMinutes = 7 * 24 * 60; // 1 week
          break;
        default:
          dataPoints = 7;
          timeStepMinutes = 24 * 60;
      }
    }
    
    const simulatedData = [];
    
    // Start from a lower price and trend toward current price
    const startPrice = currentPrice * (0.95 + Math.random() * 0.03); // Start 2-5% lower
    const priceStep = (currentPrice - startPrice) / (dataPoints - 1);
    
    for (let i = dataPoints - 1; i >= 0; i--) {
      const date = new Date();
      
      // Go back by the appropriate time step (use milliseconds for accuracy)
      const msToSubtract = i * timeStepMinutes * 60 * 1000;
      date.setTime(date.getTime() - msToSubtract);
      
      // Calculate base price for this point (trending toward current price)
      const basePrice = startPrice + priceStep * (dataPoints - 1 - i);
      
      // Add random variation (smaller for intraday)
      const variationPercent = isIntraday ? 0.02 : 0.04;
      const variation = (Math.random() - 0.5) * variationPercent * basePrice;
      const pointPrice = basePrice + variation;
      
      // Create realistic OHLC data
      const range = pointPrice * (isIntraday ? 0.005 : 0.02);
      const open = pointPrice + (Math.random() - 0.5) * range;
      const close = i === 0 ? currentPrice : pointPrice;
      const high = Math.max(open, close) + Math.random() * range;
      const low = Math.min(open, close) - Math.random() * range;
      
      simulatedData.push({
        symbol: symbol,
        date: date.toISOString(),
        open: Math.max(0.01, open),
        high: Math.max(0.01, high),
        low: Math.max(0.01, low),
        close: Math.max(0.01, close),
        volume: Math.floor(Math.random() * 10000000) + 1000000,
      });
    }

      const result = { data: simulatedData };
      setCache(cacheKey, result);
      return result;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  // Store the pending request
  pendingRequests.set(cacheKey, requestPromise);

  try {
    const result = await requestPromise;
    return NextResponse.json(result);
  } catch (error) {
    console.error("Finnhub API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch market data",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}