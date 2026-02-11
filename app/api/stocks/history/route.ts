import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Calculate moving average from price data
function calculateMovingAverage(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || "AAPL";
  const years = parseInt(searchParams.get("years") || "1");
  const ma30 = searchParams.get("ma30") === "true";
  const ma60 = searchParams.get("ma60") === "true";

  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    // Fetch historical data from database
    const stockPrices = await prisma.stockPrice.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: "asc",
      },
    });

    if (stockPrices.length === 0) {
      return NextResponse.json({
        data: [],
        message: "No historical data found. Please sync data first.",
        needsSync: true,
      });
    }

    // Extract closing prices for moving average calculation
    const closePrices = stockPrices.map((p) => p.close);

    // Calculate moving averages
    const ma30Values = ma30 ? calculateMovingAverage(closePrices, 30) : [];
    const ma60Values = ma60 ? calculateMovingAverage(closePrices, 60) : [];

    // Build response data with moving averages
    const data = stockPrices.map((price, index) => ({
      symbol: price.symbol,
      date: price.date.toISOString(),
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume ? Number(price.volume) : undefined,
      ma30: ma30Values[index] ?? undefined,
      ma60: ma60Values[index] ?? undefined,
    }));

    return NextResponse.json({
      data,
      stats: {
        totalRecords: data.length,
        startDate: stockPrices[0]?.date.toISOString(),
        endDate: stockPrices[stockPrices.length - 1]?.date.toISOString(),
        years,
      },
    });
  } catch (error) {
    console.error("Error fetching stock history:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock history" },
      { status: 500 }
    );
  }
}
