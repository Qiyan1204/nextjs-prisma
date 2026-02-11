import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Helper to generate realistic stock price data
function generateHistoricalData(
  symbol: string,
  startDate: Date,
  endDate: Date,
  currentPrice: number
): Array<{
  symbol: string;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> {
  const data: Array<{
    symbol: string;
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];

  // Work backwards from current price
  let price = currentPrice;
  const days = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Calculate average daily change to reach a reasonable starting price
  // Assume stocks grow ~10% per year on average
  const annualGrowth = 0.1;
  const dailyGrowth = Math.pow(1 + annualGrowth, 1 / 252) - 1;
  const volatility = 0.02; // 2% daily volatility

  // Generate prices for each trading day
  const current = new Date(endDate);
  const prices: number[] = [currentPrice];

  // Go backwards to generate historical prices
  while (current >= startDate) {
    // Skip weekends
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      const randomChange =
        (Math.random() - 0.5) * 2 * volatility - dailyGrowth;
      price = price * (1 - randomChange);
      prices.unshift(price);
    }
    current.setDate(current.getDate() - 1);
  }

  // Now build the data array going forward
  const date = new Date(startDate);
  let priceIndex = 0;

  while (date <= endDate && priceIndex < prices.length) {
    // Skip weekends
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      const close = prices[priceIndex];
      const dayRange = close * 0.02; // 2% intraday range
      const open = close + (Math.random() - 0.5) * dayRange;
      const high = Math.max(open, close) + Math.random() * dayRange * 0.5;
      const low = Math.min(open, close) - Math.random() * dayRange * 0.5;
      const volume = Math.floor(Math.random() * 50000000) + 10000000;

      data.push({
        symbol: symbol.toUpperCase(),
        date: new Date(date),
        open: Math.max(0.01, open),
        high: Math.max(0.01, high),
        low: Math.max(0.01, low),
        close: Math.max(0.01, close),
        volume,
      });

      priceIndex++;
    }
    date.setDate(date.getDate() + 1);
  }

  return data;
}

// Fetch real data from Finnhub if available
async function fetchRealData(
  symbol: string,
  startDate: Date,
  endDate: Date,
  apiKey: string
): Promise<Array<{
  symbol: string;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> | null> {
  try {
    const from = Math.floor(startDate.getTime() / 1000);
    const to = Math.floor(endDate.getTime() / 1000);

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.s !== "ok" || !data.c || data.c.length === 0) {
      return null;
    }

    return data.t.map((timestamp: number, index: number) => ({
      symbol: symbol.toUpperCase(),
      date: new Date(timestamp * 1000),
      open: data.o[index],
      high: data.h[index],
      low: data.l[index],
      close: data.c[index],
      volume: data.v[index],
    }));
  } catch (error) {
    console.error("Error fetching from Finnhub:", error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbol, years = 7 } = body;

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.FINNHUB_API_KEY;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    // Get current price from Finnhub
    let currentPrice = 150; // Default fallback
    if (apiKey) {
      try {
        const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
        const quoteRes = await fetch(quoteUrl);
        if (quoteRes.ok) {
          const quoteData = await quoteRes.json();
          if (quoteData.c) {
            currentPrice = quoteData.c;
          }
        }
      } catch (err) {
        console.warn("Could not fetch current price:", err);
      }
    }

    // Try to fetch real data first
    let historicalData = null;
    if (apiKey) {
      historicalData = await fetchRealData(symbol, startDate, endDate, apiKey);
    }

    // If no real data, generate simulated data
    if (!historicalData || historicalData.length === 0) {
      console.log(`Generating simulated data for ${symbol}`);
      historicalData = generateHistoricalData(
        symbol,
        startDate,
        endDate,
        currentPrice
      );
    }

    // Delete existing data for this symbol
    await prisma.stockPrice.deleteMany({
      where: { symbol: symbol.toUpperCase() },
    });

    // Insert new data in batches
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < historicalData.length; i += batchSize) {
      const batch = historicalData.slice(i, i + batchSize);
      await prisma.stockPrice.createMany({
        data: batch.map((d) => ({
          symbol: d.symbol,
          date: d.date,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: BigInt(d.volume),
        })),
        skipDuplicates: true,
      });
      inserted += batch.length;
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${inserted} records for ${symbol}`,
      stats: {
        symbol: symbol.toUpperCase(),
        recordsInserted: inserted,
        dateRange: {
          from: startDate.toISOString(),
          to: endDate.toISOString(),
        },
        years,
        dataSource: historicalData.length > 0 ? "generated" : "finnhub",
      },
    });
  } catch (error) {
    console.error("Error syncing stock data:", error);
    return NextResponse.json(
      { error: "Failed to sync stock data" },
      { status: 500 }
    );
  }
}

// GET endpoint to check sync status
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  try {
    if (symbol) {
      // Get stats for a specific symbol
      const count = await prisma.stockPrice.count({
        where: { symbol: symbol.toUpperCase() },
      });

      const dateRange = await prisma.stockPrice.aggregate({
        where: { symbol: symbol.toUpperCase() },
        _min: { date: true },
        _max: { date: true },
      });

      return NextResponse.json({
        symbol: symbol.toUpperCase(),
        recordCount: count,
        dateRange: {
          from: dateRange._min.date?.toISOString(),
          to: dateRange._max.date?.toISOString(),
        },
        hasData: count > 0,
      });
    }

    // Get all synced symbols
    const symbols = await prisma.stockPrice.groupBy({
      by: ["symbol"],
      _count: { symbol: true },
      _min: { date: true },
      _max: { date: true },
    });

    return NextResponse.json({
      syncedSymbols: symbols.map((s) => ({
        symbol: s.symbol,
        recordCount: s._count.symbol,
        dateRange: {
          from: s._min.date?.toISOString(),
          to: s._max.date?.toISOString(),
        },
      })),
    });
  } catch (error) {
    console.error("Error checking sync status:", error);
    return NextResponse.json(
      { error: "Failed to check sync status" },
      { status: 500 }
    );
  }
}
