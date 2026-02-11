import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type Trade = {
  date: string;
  type: "buy" | "sell";
  price: number;
  shares: number;
  value: number;
  portfolioValue: number;
  signal: string;
};

type DailyData = {
  date: string;
  price: number;
  ma30: number | null;
  ma60: number | null;
  position: number;
  cash: number;
  portfolioValue: number;
  signal: string | null;
};

// Calculate moving average
function calculateMA(prices: number[], period: number): (number | null)[] {
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

// Simple MA Strategy: Buy when price < MA, Sell when price > MA
function runBacktest(
  prices: Array<{ date: Date; close: number }>,
  maPeriod: number,
  initialCapital: number
): {
  trades: Trade[];
  dailyData: DailyData[];
  finalValue: number;
  totalReturn: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdown: number;
  buyHoldReturn: number;
} {
  const closePrices = prices.map((p) => p.close);
  const maValues = calculateMA(closePrices, maPeriod);

  const trades: Trade[] = [];
  const dailyData: DailyData[] = [];

  let cash = initialCapital;
  let shares = 0;
  let position: "none" | "long" = "none";
  let entryPrice = 0;
  let peakValue = initialCapital;
  let maxDrawdown = 0;
  let winningTrades = 0;
  let losingTrades = 0;

  // Buy and hold comparison
  const firstPrice = closePrices[maPeriod - 1] || closePrices[0];
  const lastPrice = closePrices[closePrices.length - 1];

  for (let i = 0; i < prices.length; i++) {
    const price = closePrices[i];
    const ma = maValues[i];
    const date = prices[i].date.toISOString().split("T")[0];

    const portfolioValue = cash + shares * price;
    let signal: string | null = null;

    // Track peak and drawdown
    if (portfolioValue > peakValue) {
      peakValue = portfolioValue;
    }
    const drawdown = ((peakValue - portfolioValue) / peakValue) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    // Only trade if MA is available
    if (ma !== null) {
      // Buy signal: Price drops below MA (oversold)
      if (price < ma && position === "none") {
        // Buy
        shares = Math.floor(cash / price);
        if (shares > 0) {
          const cost = shares * price;
          cash -= cost;
          position = "long";
          entryPrice = price;
          signal = "BUY";

          trades.push({
            date,
            type: "buy",
            price,
            shares,
            value: cost,
            portfolioValue: cash + shares * price,
            signal: `Price ($${price.toFixed(2)}) < MA${maPeriod} ($${ma.toFixed(2)})`,
          });
        }
      }
      // Sell signal: Price rises above MA (overbought)
      else if (price > ma && position === "long" && shares > 0) {
        // Sell
        const saleValue = shares * price;
        const profit = saleValue - shares * entryPrice;

        if (profit > 0) {
          winningTrades++;
        } else {
          losingTrades++;
        }

        cash += saleValue;
        signal = "SELL";

        trades.push({
          date,
          type: "sell",
          price,
          shares,
          value: saleValue,
          portfolioValue: cash,
          signal: `Price ($${price.toFixed(2)}) > MA${maPeriod} ($${ma.toFixed(2)})`,
        });

        shares = 0;
        position = "none";
      }
    }

    dailyData.push({
      date,
      price,
      ma30: maPeriod === 30 ? ma : null,
      ma60: maPeriod === 60 ? ma : null,
      position: shares,
      cash,
      portfolioValue: cash + shares * price,
      signal,
    });
  }

  // Close any remaining position at the end
  const finalPrice = closePrices[closePrices.length - 1];
  if (shares > 0) {
    const saleValue = shares * finalPrice;
    const profit = saleValue - shares * entryPrice;

    if (profit > 0) {
      winningTrades++;
    } else {
      losingTrades++;
    }

    cash += saleValue;

    trades.push({
      date: prices[prices.length - 1].date.toISOString().split("T")[0],
      type: "sell",
      price: finalPrice,
      shares,
      value: saleValue,
      portfolioValue: cash,
      signal: "End of backtest - closing position",
    });

    shares = 0;
  }

  const finalValue = cash;
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;
  const buyHoldReturn = ((lastPrice - firstPrice) / firstPrice) * 100;

  return {
    trades,
    dailyData,
    finalValue,
    totalReturn,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    maxDrawdown,
    buyHoldReturn,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      symbol,
      years = 3,
      maPeriod = 30,
      initialCapital = 100000,
    } = body;

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    // Fetch historical data
    const stockPrices = await prisma.stockPrice.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        close: true,
      },
    });

    if (stockPrices.length < maPeriod) {
      return NextResponse.json(
        {
          error: `Not enough data. Need at least ${maPeriod} data points, found ${stockPrices.length}. Please sync data first.`,
          needsSync: true,
        },
        { status: 400 }
      );
    }

    // Run backtest
    const results = runBacktest(stockPrices, maPeriod, initialCapital);

    // Calculate additional metrics
    const winRate =
      results.totalTrades > 0
        ? (
            (results.winningTrades /
              Math.max(1, results.winningTrades + results.losingTrades)) *
            100
          ).toFixed(2)
        : "0";

    // Save backtest result
    await prisma.backtestResult.create({
      data: {
        symbol: symbol.toUpperCase(),
        strategyName: `MA${maPeriod} Crossover`,
        startDate,
        endDate,
        initialCapital,
        finalValue: results.finalValue,
        totalReturn: results.totalReturn,
        totalTrades: results.totalTrades,
        winningTrades: results.winningTrades,
        losingTrades: results.losingTrades,
        maxDrawdown: results.maxDrawdown,
        tradesJson: JSON.stringify(results.trades),
      },
    });

    return NextResponse.json({
      success: true,
      symbol: symbol.toUpperCase(),
      strategy: {
        name: `MA${maPeriod} Crossover Strategy`,
        description: `Buy when price goes below ${maPeriod}-day MA, sell when price goes above ${maPeriod}-day MA`,
        maPeriod,
      },
      period: {
        years,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        tradingDays: stockPrices.length,
      },
      results: {
        initialCapital,
        finalValue: results.finalValue,
        totalReturn: `${results.totalReturn.toFixed(2)}%`,
        totalTrades: results.totalTrades,
        winningTrades: results.winningTrades,
        losingTrades: results.losingTrades,
        winRate: `${winRate}%`,
        maxDrawdown: `${results.maxDrawdown.toFixed(2)}%`,
        buyHoldReturn: `${results.buyHoldReturn.toFixed(2)}%`,
        outperformance: `${(results.totalReturn - results.buyHoldReturn).toFixed(2)}%`,
      },
      trades: results.trades,
      chartData: results.dailyData,
    });
  } catch (error) {
    console.error("Backtest error:", error);
    return NextResponse.json(
      { error: "Failed to run backtest" },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch past backtest results
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  try {
    const where = symbol ? { symbol: symbol.toUpperCase() } : {};

    const results = await prisma.backtestResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      results: results.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        strategyName: r.strategyName,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate.toISOString(),
        initialCapital: r.initialCapital,
        finalValue: r.finalValue,
        totalReturn: `${r.totalReturn.toFixed(2)}%`,
        totalTrades: r.totalTrades,
        winningTrades: r.winningTrades,
        losingTrades: r.losingTrades,
        maxDrawdown: `${r.maxDrawdown.toFixed(2)}%`,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching backtest results:", error);
    return NextResponse.json(
      { error: "Failed to fetch backtest results" },
      { status: 500 }
    );
  }
}
