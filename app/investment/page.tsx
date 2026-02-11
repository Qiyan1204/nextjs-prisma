"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  AreaChart,
  Brush,
  ReferenceLine,
  Legend,
  Bar,
  ComposedChart,
} from "recharts";

type ChartType = "area" | "line" | "composed";

type StockData = {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type StockMetrics = {
  symbol: string;
  pe?: number;
  roe?: number;
  volume?: number;
  marketCap?: number;
  dividendYield?: number;
  beta?: number;
  remark?: string;
};

type Position = {
  symbol: string;
  shares: number;
  avgPrice: number;
  totalCost: number;
};

type Transaction = {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  total: number;
  date: string;
};

type Wallet = {
  cash: number;
  positions: Record<string, Position>;
  transactions: Transaction[];
};

type TimeInterval = "10m" | "30m" | "1h" | "12h" | "1d" | "1w" | "1m" | "6m" | "1y";

type StockDataMap = Record<string, StockData>;
type StockMetricsMap = Record<string, StockMetrics>;

type AssetCategory = "all" | "stocks" | "crypto" | "forex";

const TIME_INTERVALS: { value: TimeInterval; label: string }[] = [
  { value: "10m", label: "10min" },
  { value: "30m", label: "30min" },
  { value: "1h", label: "1H" },
  { value: "12h", label: "12H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
];

const INITIAL_CASH = 100000; // Starting with $100,000

// Predefined watchlist with different asset types
const PREDEFINED_ASSETS = {
  stocks: [
    { symbol: "AAPL", name: "Apple Inc.", emoji: "🍎" },
    { symbol: "MSFT", name: "Microsoft", emoji: "💻" },
    { symbol: "GOOGL", name: "Google", emoji: "🔍" },
    { symbol: "AMZN", name: "Amazon", emoji: "📦" },
    { symbol: "TSLA", name: "Tesla", emoji: "⚡" },
    { symbol: "META", name: "Meta", emoji: "👥" },
    { symbol: "NVDA", name: "NVIDIA", emoji: "🎮" },
    { symbol: "AMD", name: "AMD", emoji: "🔴" },
  ],
  crypto: [
    { symbol: "BINANCE:BTCUSDT", name: "Bitcoin", emoji: "₿" },
    { symbol: "BINANCE:ETHUSDT", name: "Ethereum", emoji: "Ξ" },
    { symbol: "BINANCE:BNBUSDT", name: "Binance Coin", emoji: "🟡" },
    { symbol: "BINANCE:SOLUSDT", name: "Solana", emoji: "◎" },
    { symbol: "BINANCE:ADAUSDT", name: "Cardano", emoji: "🔷" },
    { symbol: "BINANCE:XRPUSDT", name: "Ripple", emoji: "💧" },
  ],
  forex: [
    { symbol: "OANDA:EUR_USD", name: "EUR/USD", emoji: "🇪🇺" },
    { symbol: "OANDA:GBP_USD", name: "GBP/USD", emoji: "🇬🇧" },
    { symbol: "OANDA:USD_JPY", name: "USD/JPY", emoji: "🇯🇵" },
    { symbol: "OANDA:AUD_USD", name: "AUD/USD", emoji: "🇦🇺" },
    { symbol: "OANDA:USD_CHF", name: "USD/CHF", emoji: "🇨🇭" },
    { symbol: "OANDA:USD_CAD", name: "USD/CAD", emoji: "🇨🇦" },
  ],
};

// Load watchlist from localStorage
const loadWatchlistFromStorage = (): Array<{ symbol: string; name: string; emoji: string }> => {
  if (typeof window === "undefined") return PREDEFINED_ASSETS.stocks.slice(0, 6);
  const saved = localStorage.getItem("investment-watchlist");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return PREDEFINED_ASSETS.stocks.slice(0, 6);
    }
  }
  return PREDEFINED_ASSETS.stocks.slice(0, 6);
};

// Load wallet from localStorage
const loadWalletFromStorage = (): Wallet => {
  if (typeof window === "undefined") {
    return { cash: INITIAL_CASH, positions: {}, transactions: [] };
  }
  const saved = localStorage.getItem("investment-wallet");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return { cash: INITIAL_CASH, positions: {}, transactions: [] };
    }
  }
  return { cash: INITIAL_CASH, positions: {}, transactions: [] };
};

// Format large numbers
const formatNumber = (num: number | undefined): string => {
  if (num === undefined || num === null) return "N/A";
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
};

// Format currency
const formatCurrency = (num: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function InvestmentPage() {
  const [watchlist, setWatchlist] = useState<
    Array<{ symbol: string; name: string; emoji: string }>
  >([]);
  const [isClient, setIsClient] = useState(false);
  const [isWatchlistExpanded, setIsWatchlistExpanded] = useState(true);
  
  const [stockData, setStockData] = useState<StockDataMap>({});
  const [stockMetrics, setStockMetrics] = useState<StockMetricsMap>({});
  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({});
  const [selectedSymbol, setSelectedSymbol] = useState<string>("AAPL");
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>("1d");
  const [historyData, setHistoryData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [chartType, setChartType] = useState<ChartType>("area");
  const [customSymbol, setCustomSymbol] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [showBrush, setShowBrush] = useState(true);
  const [compareSymbol, setCompareSymbol] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<StockData[]>([]);
  const [showMetrics, setShowMetrics] = useState(true);
  
  // Wallet states
  const [wallet, setWallet] = useState<Wallet>({ cash: INITIAL_CASH, positions: {}, transactions: [] });
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [tradeShares, setTradeShares] = useState<string>("");
  const [showWallet, setShowWallet] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize from localStorage on client
  useEffect(() => {
    setIsClient(true);
    setWatchlist(loadWatchlistFromStorage());
    setWallet(loadWalletFromStorage());
  }, []);

  // Save watchlist to localStorage
  useEffect(() => {
    if (isClient && watchlist.length > 0) {
      localStorage.setItem("investment-watchlist", JSON.stringify(watchlist));
    }
  }, [watchlist, isClient]);

  // Save wallet to localStorage
  useEffect(() => {
    if (isClient) {
      localStorage.setItem("investment-wallet", JSON.stringify(wallet));
    }
  }, [wallet, isClient]);

  // Calculate portfolio value
  const getPortfolioValue = (): number => {
    let stocksValue = 0;
    Object.keys(wallet.positions).forEach(symbol => {
      const position = wallet.positions[symbol];
      const currentPrice = stockData[symbol]?.close || position.avgPrice;
      stocksValue += position.shares * currentPrice;
    });
    return wallet.cash + stocksValue;
  };

  // Execute trade
  const executeTrade = () => {
    const shares = parseFloat(tradeShares);
    if (!shares || shares <= 0) {
      setError("Please enter a valid number of shares");
      return;
    }

    const currentPrice = stockData[selectedSymbol]?.close;
    if (!currentPrice) {
      setError("Unable to get current price");
      return;
    }

    const total = shares * currentPrice;

    if (tradeType === 'buy') {
      // Check if enough cash
      if (total > wallet.cash) {
        setError(`Insufficient funds. You need ${formatCurrency(total)} but only have ${formatCurrency(wallet.cash)}`);
        return;
      }

      // Execute buy
      const newWallet = { ...wallet };
      newWallet.cash -= total;

      // Update position
      const existingPosition = newWallet.positions[selectedSymbol];
      if (existingPosition) {
        const newShares = existingPosition.shares + shares;
        const newTotalCost = existingPosition.totalCost + total;
        newWallet.positions[selectedSymbol] = {
          symbol: selectedSymbol,
          shares: newShares,
          avgPrice: newTotalCost / newShares,
          totalCost: newTotalCost,
        };
      } else {
        newWallet.positions[selectedSymbol] = {
          symbol: selectedSymbol,
          shares,
          avgPrice: currentPrice,
          totalCost: total,
        };
      }

      // Add transaction
      newWallet.transactions.unshift({
        id: Date.now().toString(),
        symbol: selectedSymbol,
        type: 'buy',
        shares,
        price: currentPrice,
        total,
        date: new Date().toISOString(),
      });

      setWallet(newWallet);
      setShowTradeModal(false);
      setTradeShares("");
      setError(null);
    } else {
      // Sell
      const position = wallet.positions[selectedSymbol];
      if (!position || position.shares < shares) {
        setError(`Insufficient shares. You only have ${position?.shares || 0} shares`);
        return;
      }

      // Execute sell
      const newWallet = { ...wallet };
      newWallet.cash += total;

      // Update position
      if (position.shares === shares) {
        delete newWallet.positions[selectedSymbol];
      } else {
        const remainingShares = position.shares - shares;
        const soldCost = (shares / position.shares) * position.totalCost;
        newWallet.positions[selectedSymbol] = {
          symbol: selectedSymbol,
          shares: remainingShares,
          avgPrice: (position.totalCost - soldCost) / remainingShares,
          totalCost: position.totalCost - soldCost,
        };
      }

      // Add transaction
      newWallet.transactions.unshift({
        id: Date.now().toString(),
        symbol: selectedSymbol,
        type: 'sell',
        shares,
        price: currentPrice,
        total,
        date: new Date().toISOString(),
      });

      setWallet(newWallet);
      setShowTradeModal(false);
      setTradeShares("");
      setError(null);
    }
  };

  // Get all available assets for the selected category
  const getAvailableAssets = () => {
    if (selectedCategory === "all") {
      return [
        ...PREDEFINED_ASSETS.stocks,
        ...PREDEFINED_ASSETS.crypto,
        ...PREDEFINED_ASSETS.forex,
      ];
    }
    return PREDEFINED_ASSETS[selectedCategory];
  };

  // Filter assets based on search query
  const filteredAssets = getAvailableAssets().filter(
    (asset) =>
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Check if interval is intraday (requires real-time data)
  const isIntradayInterval = (interval: TimeInterval) => {
    return ["10m", "30m", "1h", "12h"].includes(interval);
  };

  // Check if asset is already in watchlist
  const isInWatchlist = (symbol: string) => {
    return watchlist.some((item) => item.symbol === symbol);
  };

  // Add asset to watchlist
  const addToWatchlist = (asset: { symbol: string; name: string; emoji: string }) => {
    if (!isInWatchlist(asset.symbol)) {
      setWatchlist([...watchlist, asset]);
      setShowAddAsset(false);
      setSearchQuery("");
    }
  };

  // Remove asset from watchlist
  const removeFromWatchlist = (symbol: string) => {
    const newWatchlist = watchlist.filter((item) => item.symbol !== symbol);
    setWatchlist(newWatchlist);
    if (selectedSymbol === symbol && newWatchlist.length > 0) {
      setSelectedSymbol(newWatchlist[0].symbol);
    }
  };

  // Add custom symbol
  const addCustomSymbol = async () => {
    if (!customSymbol.trim()) return;
    const symbol = customSymbol.toUpperCase().trim();
    
    if (isInWatchlist(symbol)) {
      setError(`${symbol} is already in your watchlist`);
      return;
    }

    setAddingCustom(true);
    setError(null);

    try {
      const res = await fetch(`/api/finnhub?symbol=${symbol}&interval=1d&limit=1`);
      if (!res.ok) {
        throw new Error(`Symbol ${symbol} not found`);
      }
      const json = await res.json();
      if (!json.data || json.data.length === 0) {
        throw new Error(`No data available for ${symbol}`);
      }

      const newAsset = {
        symbol,
        name: symbol,
        emoji: "📈",
      };
      setWatchlist([...watchlist, newAsset]);
      setCustomSymbol("");
      setShowAddAsset(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to add ${symbol}`);
    } finally {
      setAddingCustom(false);
    }
  };

  // Fetch stock metrics (PE, ROE, etc.) from backend API
  const fetchStockMetrics = async (symbol: string): Promise<StockMetrics> => {
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const mockData: Record<string, Partial<StockMetrics>> = {
        'AAPL': { pe: 29.5, roe: 1.47, beta: 1.24, dividendYield: 0.52, marketCap: 3200000 },
        'MSFT': { pe: 35.2, roe: 0.42, beta: 0.89, dividendYield: 0.79, marketCap: 2800000 },
        'GOOGL': { pe: 24.8, roe: 0.28, beta: 1.05, dividendYield: 0, marketCap: 1900000 },
        'AMZN': { pe: 52.3, roe: 0.21, beta: 1.15, dividendYield: 0, marketCap: 1700000 },
        'TSLA': { pe: 68.5, roe: 0.23, beta: 2.01, dividendYield: 0, marketCap: 850000 },
        'META': { pe: 26.4, roe: 0.35, beta: 1.18, dividendYield: 0, marketCap: 1100000 },
        'NVDA': { pe: 55.7, roe: 1.21, beta: 1.68, dividendYield: 0.03, marketCap: 2200000 },
        'AMD': { pe: 42.1, roe: 0.15, beta: 1.89, dividendYield: 0, marketCap: 240000 },
      };

      const baseSymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;
      const metrics: StockMetrics = { 
        symbol,
        ...(mockData[baseSymbol] || {})
      };

      return metrics;
    } catch (err) {
      console.error(`Error fetching metrics for ${symbol}:`, err);
      return { symbol };
    }
  };

  // Fetch comparison data
  const fetchCompareData = async (symbol: string) => {
    try {
      const res = await fetch(`/api/finnhub?symbol=${symbol}&interval=${selectedInterval}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        const sorted = [...json.data].sort(
          (a: StockData, b: StockData) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setCompareData(sorted);
      }
    } catch (err) {
      console.error("Error fetching comparison data:", err);
    }
  };

  // Handle compare symbol selection
  useEffect(() => {
    if (compareSymbol) {
      fetchCompareData(compareSymbol);
    } else {
      setCompareData([]);
    }
  }, [compareSymbol, selectedInterval]);

  // Fetch all stocks data including sparkline and metrics
  const fetchAllStocks = useCallback(async () => {
    if (watchlist.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const promises = watchlist.map(async (asset) => {
        const res = await fetch(`/api/finnhub?symbol=${asset.symbol}&interval=1d&limit=1`);
        if (!res.ok) {
          console.error(`Failed to fetch ${asset.symbol}`);
          return { symbol: asset.symbol, data: null, sparkline: [], metrics: { symbol: asset.symbol } };
        }
        const json = await res.json();

        const sparkRes = await fetch(`/api/finnhub?symbol=${asset.symbol}&interval=1w`);
        let sparkline: number[] = [];
        if (sparkRes.ok) {
          const sparkJson = await sparkRes.json();
          if (sparkJson.data && sparkJson.data.length > 0) {
            sparkline = sparkJson.data.map((d: StockData) => d.close);
          }
        }

        let metrics: StockMetrics = { symbol: asset.symbol };
        
        if (!asset.symbol.includes('BINANCE:') && !asset.symbol.includes('OANDA:')) {
          metrics = await fetchStockMetrics(asset.symbol);
        }

        const currentData = json.data?.[0];
        if (currentData?.volume) {
          metrics.volume = currentData.volume;
        }

        return { 
          symbol: asset.symbol, 
          data: currentData || null, 
          sparkline,
          metrics 
        };
      });

      const results = await Promise.all(promises);

      const newStockData: StockDataMap = {};
      const newSparklineData: Record<string, number[]> = {};
      const newMetrics: StockMetricsMap = {};
      
      results.forEach(({ symbol, data, sparkline, metrics }) => {
        if (data) {
          newStockData[symbol] = data;
        }
        if (sparkline && sparkline.length > 0) {
          newSparklineData[symbol] = sparkline;
        }
        if (metrics) {
          newMetrics[symbol] = metrics;
        }
      });

      setStockData(newStockData);
      setSparklineData(newSparklineData);
      setStockMetrics(newMetrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stock data");
      console.error("Error fetching stocks:", err);
    } finally {
      setLoading(false);
    }
  }, [watchlist]);

  // Fetch historical data for selected stock and interval
  const fetchHistory = useCallback(
    async (symbol: string, interval: TimeInterval) => {
      setLoadingHistory(true);
      setError(null);

      try {
        const res = await fetch(`/api/finnhub?symbol=${symbol}&interval=${interval}`);

        if (!res.ok) {
          const errorText = await res.text();
          console.error(`API response error:`, errorText);
          throw new Error(`Failed to fetch history: ${res.status}`);
        }

        const json = await res.json();

        if (json.error) {
          console.warn(`API warning for ${symbol}:`, json.error);
          setHistoryData([]);
          return;
        }

        if (json.data && json.data.length > 0) {
          const sorted = [...json.data].sort(
            (a: StockData, b: StockData) =>
              new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          setHistoryData(sorted);
        } else {
          setHistoryData([]);
        }
      } catch (err) {
        console.error("Error fetching history:", err);
        setHistoryData([]);
      } finally {
        setLoadingHistory(false);
      }
    },
    []
  );

  // Handle stock selection
  const handleSelectStock = useCallback(
    (symbol: string) => {
      setSelectedSymbol(symbol);
      fetchHistory(symbol, selectedInterval);
    },
    [selectedInterval, fetchHistory]
  );

  // Handle interval change
  const handleIntervalChange = useCallback(
    (interval: TimeInterval) => {
      setSelectedInterval(interval);
      fetchHistory(selectedSymbol, interval);
    },
    [selectedSymbol, fetchHistory]
  );

  // Auto-refresh for intraday intervals
  useEffect(() => {
    if (autoRefresh && isIntradayInterval(selectedInterval)) {
      refreshIntervalRef.current = setInterval(() => {
        fetchHistory(selectedSymbol, selectedInterval);
        fetchAllStocks();
      }, 30000);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [autoRefresh, selectedInterval, selectedSymbol, fetchHistory, fetchAllStocks]);

  // Initial data fetch
  useEffect(() => {
    fetchAllStocks();
    fetchHistory(selectedSymbol, selectedInterval);
  }, []);

  // Re-fetch when watchlist changes
  useEffect(() => {
    fetchAllStocks();
  }, [watchlist, fetchAllStocks]);

  // Format date based on interval
  const formatDateForInterval = (dateString: string, interval: TimeInterval) => {
    const date = new Date(dateString);

    if (["10m", "30m", "1h", "12h"].includes(interval)) {
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (interval === "1d") {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        hour12: true,
      });
    } else if (["1w", "1m"].includes(interval)) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  // Calculate percentage change
  const calculateChange = (open: number, close: number) => {
    const change = close - open;
    const percentage = ((change / open) * 100).toFixed(2);
    return { change, percentage };
  };

  // Calculate chart statistics
  const getChartStats = () => {
    if (historyData.length === 0) return null;

    const prices = historyData.map((d) => d.close);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const first = historyData[0].close;
    const last = historyData[historyData.length - 1].close;
    const change = last - first;
    const changePercent = ((change / first) * 100).toFixed(2);

    return { high, low, first, last, change, changePercent };
  };

  const chartStats = getChartStats();
  const selectedAsset = watchlist.find((a) => a.symbol === selectedSymbol);
  const currentPosition = wallet.positions[selectedSymbol];
  const portfolioValue = getPortfolioValue();
  const totalProfitLoss = portfolioValue - INITIAL_CASH;
  const totalProfitLossPercent = ((totalProfitLoss / INITIAL_CASH) * 100).toFixed(2);

  // Merge historyData with compareData for chart
  const mergedChartData = historyData.map((item, index) => {
    const compareItem = compareData[index];
    return {
      ...item,
      compareClose: compareItem?.close,
    };
  });

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Trade Modal */}
      {showTradeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-900">
                {tradeType === 'buy' ? '🛒 Buy' : '💰 Sell'} {selectedSymbol}
              </h3>
              <button
                onClick={() => {
                  setShowTradeModal(false);
                  setTradeShares("");
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            {stockData[selectedSymbol] && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-600">Current Price</p>
                <p className="text-3xl font-bold text-gray-900">
                  {formatCurrency(stockData[selectedSymbol].close)}
                </p>
              </div>
            )}

            {currentPosition && (
              <div className="bg-blue-50 rounded-lg p-3 mb-4">
                <p className="text-xs text-blue-600 font-semibold mb-1">Your Position</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Shares:</span>
                  <span className="font-semibold">{currentPosition.shares}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Avg Price:</span>
                  <span className="font-semibold">{formatCurrency(currentPosition.avgPrice)}</span>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Shares
              </label>
              <input
                type="number"
                value={tradeShares}
                onChange={(e) => setTradeShares(e.target.value)}
                placeholder="Enter shares"
                min="0"
                step="1"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {tradeShares && parseFloat(tradeShares) > 0 && stockData[selectedSymbol] && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Total Amount</span>
                  <span className="font-bold text-lg">
                    {formatCurrency(parseFloat(tradeShares) * stockData[selectedSymbol].close)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowTradeModal(false);
                  setTradeShares("");
                  setError(null);
                }}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={executeTrade}
                className={`flex-1 px-4 py-3 rounded-lg transition font-medium text-white ${
                  tradeType === 'buy'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {tradeType === 'buy' ? 'Buy' : 'Sell'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Modal */}
      {showWallet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-gray-900">💼 Portfolio</h3>
                <button
                  onClick={() => setShowWallet(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Portfolio Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90 mb-1">Total Value</p>
                  <p className="text-3xl font-bold">{formatCurrency(portfolioValue)}</p>
                  <p className={`text-sm mt-1 ${totalProfitLoss >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                    {totalProfitLoss >= 0 ? '↗' : '↘'} {formatCurrency(Math.abs(totalProfitLoss))} ({totalProfitLossPercent}%)
                  </p>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90 mb-1">Cash</p>
                  <p className="text-3xl font-bold">{formatCurrency(wallet.cash)}</p>
                  <p className="text-sm mt-1 opacity-75">
                    {((wallet.cash / portfolioValue) * 100).toFixed(1)}% of portfolio
                  </p>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                  <p className="text-sm opacity-90 mb-1">Positions</p>
                  <p className="text-3xl font-bold">{Object.keys(wallet.positions).length}</p>
                  <p className="text-sm mt-1 opacity-75">
                    {formatCurrency(portfolioValue - wallet.cash)} invested
                  </p>
                </div>
              </div>

              {/* Positions */}
              <h4 className="text-lg font-bold text-gray-900 mb-3">Holdings</h4>
              {Object.keys(wallet.positions).length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-lg">No positions yet</p>
                  <p className="text-sm">Start trading to build your portfolio</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.values(wallet.positions).map((position) => {
                    const currentPrice = stockData[position.symbol]?.close || position.avgPrice;
                    const currentValue = position.shares * currentPrice;
                    const profitLoss = currentValue - position.totalCost;
                    const profitLossPercent = ((profitLoss / position.totalCost) * 100).toFixed(2);
                    const asset = watchlist.find(a => a.symbol === position.symbol);

                    return (
                      <div key={position.symbol} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{asset?.emoji || '📈'}</span>
                            <div>
                              <p className="font-bold text-gray-900">{position.symbol}</p>
                              <p className="text-sm text-gray-500">{position.shares} shares</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">{formatCurrency(currentValue)}</p>
                            <p className={`text-sm font-semibold ${profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss)} ({profitLossPercent}%)
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-gray-200">
                          <div>
                            <span className="text-gray-500">Avg Price:</span>{' '}
                            <span className="font-semibold">{formatCurrency(position.avgPrice)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Current:</span>{' '}
                            <span className="font-semibold">{formatCurrency(currentPrice)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transactions Modal */}
      {showTransactions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-gray-900">📜 Transaction History</h3>
                <button
                  onClick={() => setShowTransactions(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {wallet.transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-lg">No transactions yet</p>
                  <p className="text-sm">Your trades will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {wallet.transactions.map((transaction) => {
                    const asset = watchlist.find(a => a.symbol === transaction.symbol);
                    return (
                      <div key={transaction.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              transaction.type === 'buy' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                            }`}>
                              {transaction.type === 'buy' ? '🛒' : '💰'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{asset?.emoji || '📈'}</span>
                                <p className="font-bold text-gray-900">{transaction.symbol}</p>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  transaction.type === 'buy' 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {transaction.type.toUpperCase()}
                                </span>
                              </div>
                              <p className="text-sm text-gray-500">
                                {new Date(transaction.date).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg">{formatCurrency(transaction.total)}</p>
                            <p className="text-sm text-gray-500">
                              {transaction.shares} × {formatCurrency(transaction.price)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Watchlist Sidebar */}
      <div
        className={`bg-white border-r border-gray-200 transition-all duration-300 flex-shrink-0 ${
          isWatchlistExpanded ? "w-80" : "w-16"
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4">
          {isWatchlistExpanded ? (
            <>
              <h2 className="text-lg font-bold text-gray-900">Watchlist</h2>
              <button
                onClick={() => setIsWatchlistExpanded(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsWatchlistExpanded(true)}
              className="text-gray-400 hover:text-gray-600 transition mx-auto"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Sidebar Content */}
        <div className="overflow-y-auto h-[calc(100vh-4rem)]">
          {isWatchlistExpanded ? (
            <div className="p-4 space-y-4">
              {/* Portfolio Quick View */}
              <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg p-4 text-white">
                <p className="text-xs opacity-90 mb-1">Portfolio Value</p>
                <p className="text-2xl font-bold">{formatCurrency(portfolioValue)}</p>
                <p className={`text-xs mt-1 ${totalProfitLoss >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                  {totalProfitLoss >= 0 ? '↗' : '↘'} {formatCurrency(Math.abs(totalProfitLoss))} ({totalProfitLossPercent}%)
                </p>
                <div className="mt-3 pt-3 border-t border-teal-400 flex justify-between text-xs">
                  <div>
                    <p className="opacity-75">Cash</p>
                    <p className="font-semibold">{formatCurrency(wallet.cash)}</p>
                  </div>
                  <div className="text-right">
                    <p className="opacity-75">Positions</p>
                    <p className="font-semibold">{Object.keys(wallet.positions).length}</p>
                  </div>
                </div>
              </div>

              {/* Wallet Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowWallet(true)}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium"
                >
                  💼 Portfolio
                </button>
                <button
                  onClick={() => setShowTransactions(true)}
                  className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition text-sm font-medium"
                >
                  📜 History
                </button>
              </div>

              {/* Add Asset Button */}
              <button
                onClick={() => setShowAddAsset(!showAddAsset)}
                className="w-full px-4 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition text-sm font-medium flex items-center justify-center gap-2"
              >
                <span className="text-lg">➕</span> Add Asset
              </button>

              {/* Toggle Metrics Button */}
              <button
                onClick={() => setShowMetrics(!showMetrics)}
                className={`w-full px-4 py-2 rounded-lg transition text-sm font-medium ${
                  showMetrics
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {showMetrics ? "📊 Hide Metrics" : "📊 Show Metrics"}
              </button>

              {/* Add Asset Section */}
              {showAddAsset && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
                  <div className="grid grid-cols-2 gap-2">
                    {(["all", "stocks", "crypto", "forex"] as AssetCategory[]).map(
                      (category) => (
                        <button
                          key={category}
                          onClick={() => setSelectedCategory(category)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                            selectedCategory === category
                              ? "bg-teal-500 text-white"
                              : "bg-white text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {category.charAt(0).toUpperCase() + category.slice(1)}
                        </button>
                      )
                    )}
                  </div>

                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600">Custom Symbol:</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g., NFLX"
                        value={customSymbol}
                        onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === "Enter" && addCustomSymbol()}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        onClick={addCustomSymbol}
                        disabled={addingCustom || !customSymbol.trim()}
                        className="px-3 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingCustom ? "..." : "+"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredAssets.map((asset) => (
                      <button
                        key={asset.symbol}
                        onClick={() => addToWatchlist(asset)}
                        disabled={isInWatchlist(asset.symbol)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg border transition text-left ${
                          isInWatchlist(asset.symbol)
                            ? "bg-gray-100 border-gray-300 cursor-not-allowed opacity-50"
                            : "bg-white border-gray-200 hover:border-teal-500 hover:bg-teal-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{asset.emoji}</span>
                          <div>
                            <p className="font-semibold text-sm text-gray-900">{asset.symbol}</p>
                            <p className="text-xs text-gray-500">{asset.name}</p>
                          </div>
                        </div>
                        {isInWatchlist(asset.symbol) ? (
                          <span className="text-green-600 text-xs">✓</span>
                        ) : (
                          <span className="text-teal-600 text-xs">+</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Watchlist Items */}
              <div className="space-y-2">
                {watchlist.map((asset) => {
                  const data = stockData[asset.symbol];
                  const metrics = stockMetrics[asset.symbol];
                  const isSelected = asset.symbol === selectedSymbol;
                  const position = wallet.positions[asset.symbol];

                  return (
                    <div
                      key={asset.symbol}
                      className={`cursor-pointer bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-all relative border ${
                        isSelected ? "border-teal-500 ring-2 ring-teal-200" : "border-gray-200"
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromWatchlist(asset.symbol);
                        }}
                        className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition text-xs"
                        title="Remove"
                      >
                        ✕
                      </button>

                      <div onClick={() => handleSelectStock(asset.symbol)}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{asset.emoji}</span>
                          <h3 className="font-bold text-sm truncate">{asset.symbol}</h3>
                          {position && (
                            <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              {position.shares}
                            </span>
                          )}
                        </div>
                        {loading && !data ? (
                          <div className="space-y-1">
                            <div className="h-5 bg-gray-200 rounded animate-pulse"></div>
                            <div className="h-3 bg-gray-200 rounded w-2/3 animate-pulse"></div>
                          </div>
                        ) : data ? (
                          <>
                            <p className="text-xl font-bold text-gray-900 mb-1">
                              ${data.close.toFixed(2)}
                            </p>
                            {(() => {
                              const { change, percentage } = calculateChange(
                                data.open,
                                data.close
                              );
                              const isPositive = change >= 0;
                              return (
                                <p
                                  className={`text-xs font-semibold ${
                                    isPositive ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  {isPositive ? "↗" : "↘"} {isPositive ? "+" : ""}
                                  {change.toFixed(2)} ({isPositive ? "+" : ""}
                                  {percentage}%)
                                </p>
                              );
                            })()}

                            {showMetrics && metrics && (
                              <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                                <div className="grid grid-cols-2 gap-1 text-xs">
                                  {metrics.pe !== undefined && (
                                    <div>
                                      <span className="text-gray-500">P/E:</span>{" "}
                                      <span className="font-semibold">{metrics.pe.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {metrics.roe !== undefined && (
                                    <div>
                                      <span className="text-gray-500">ROE:</span>{" "}
                                      <span className="font-semibold">{(metrics.roe * 100).toFixed(1)}%</span>
                                    </div>
                                  )}
                                  {metrics.volume !== undefined && (
                                    <div className="col-span-2">
                                      <span className="text-gray-500">Vol:</span>{" "}
                                      <span className="font-semibold">{formatNumber(metrics.volume)}</span>
                                    </div>
                                  )}
                                  {metrics.marketCap !== undefined && (
                                    <div className="col-span-2">
                                      <span className="text-gray-500">MCap:</span>{" "}
                                      <span className="font-semibold">{formatNumber(metrics.marketCap * 1e6)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {sparklineData[asset.symbol] && sparklineData[asset.symbol].length > 1 && (
                              <div className="mt-2 h-8">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={sparklineData[asset.symbol].map((v, i) => ({ v, i }))}>
                                    <Line
                                      type="monotone"
                                      dataKey="v"
                                      stroke={sparklineData[asset.symbol][sparklineData[asset.symbol].length - 1] >= sparklineData[asset.symbol][0] ? "#22c55e" : "#ef4444"}
                                      strokeWidth={1.5}
                                      dot={false}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-gray-400">No data</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-2">
              {watchlist.map((asset) => {
                const isSelected = asset.symbol === selectedSymbol;
                return (
                  <button
                    key={asset.symbol}
                    onClick={() => handleSelectStock(asset.symbol)}
                    className={`w-full h-12 flex items-center justify-center text-2xl transition ${
                      isSelected ? "bg-teal-100" : "hover:bg-gray-100"
                    }`}
                    title={asset.name}
                  >
                    {asset.emoji}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-3xl font-bold text-gray-900">
                Multi-Asset Dashboard
              </h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    fetchAllStocks();
                    fetchHistory(selectedSymbol, selectedInterval);
                  }}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
                >
                  🔄 Refresh
                </button>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-4 py-2 rounded-lg transition text-sm font-medium ${
                    autoRefresh
                      ? "bg-teal-500 text-white hover:bg-teal-600"
                      : "bg-white border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {autoRefresh ? "🟢 Live" : "⏸️ Paused"}
                </button>
              </div>
            </div>
            <p className="text-gray-600">
              Stocks, Crypto, and Forex - Real-time market data with portfolio tracking
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              <p className="font-semibold">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Main Chart Section */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            {/* Chart Header with Trade Buttons */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {selectedAsset && (
                    <span className="text-3xl">{selectedAsset.emoji}</span>
                  )}
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedAsset?.name || selectedSymbol}
                  </h2>
                  {stockData[selectedSymbol] && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-gray-900">
                        ${stockData[selectedSymbol].close.toFixed(2)}
                      </span>
                      {(() => {
                        const { change, percentage } = calculateChange(
                          stockData[selectedSymbol].open,
                          stockData[selectedSymbol].close
                        );
                        const isPositive = change >= 0;
                        return (
                          <span
                            className={`text-lg font-semibold ${
                              isPositive ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {isPositive ? "+" : ""}
                            {change.toFixed(2)} ({isPositive ? "+" : ""}
                            {percentage}%)
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Position Info */}
                {currentPosition && (
                  <div className="bg-blue-50 rounded-lg p-3 inline-block">
                    <p className="text-xs text-blue-600 font-semibold mb-1">Your Position</p>
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Shares:</span>{" "}
                        <span className="font-semibold">{currentPosition.shares}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Avg:</span>{" "}
                        <span className="font-semibold">{formatCurrency(currentPosition.avgPrice)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Value:</span>{" "}
                        <span className="font-semibold">
                          {formatCurrency(currentPosition.shares * (stockData[selectedSymbol]?.close || currentPosition.avgPrice))}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {chartStats && (
                  <div className="flex items-center gap-4 text-sm text-gray-600 mt-2">
                    <span>H: ${chartStats.high.toFixed(2)}</span>
                    <span>L: ${chartStats.low.toFixed(2)}</span>
                    <span
                      className={
                        chartStats.change >= 0 ? "text-green-600" : "text-red-600"
                      }
                    >
                      {chartStats.change >= 0 ? "+" : ""}
                      {chartStats.changePercent}%
                    </span>
                  </div>
                )}
              </div>

              {/* Trade Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTradeType('buy');
                    setShowTradeModal(true);
                  }}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                >
                  🛒 Buy
                </button>
                <button
                  onClick={() => {
                    setTradeType('sell');
                    setShowTradeModal(true);
                  }}
                  disabled={!currentPosition}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  💰 Sell
                </button>
              </div>
            </div>

            {/* Time Interval Selector */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto mb-4">
              {TIME_INTERVALS.map((interval) => (
                <button
                  key={interval.value}
                  onClick={() => handleIntervalChange(interval.value)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    selectedInterval === interval.value
                      ? "bg-white text-teal-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {interval.label}
                </button>
              ))}
            </div>

            {/* Chart Controls */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Chart:</span>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {(["area", "line", "composed"] as ChartType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setChartType(type)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                        chartType === type
                          ? "bg-white text-teal-600 shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {type === "area" ? "📈 Area" : type === "line" ? "📉 Line" : "📊 OHLC"}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowBrush(!showBrush)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  showBrush
                    ? "bg-teal-100 text-teal-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                🔍 {showBrush ? "Zoom On" : "Zoom Off"}
              </button>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Compare:</span>
                <select
                  value={compareSymbol || ""}
                  onChange={(e) => setCompareSymbol(e.target.value || null)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">None</option>
                  {watchlist
                    .filter((a) => a.symbol !== selectedSymbol)
                    .map((asset) => (
                      <option key={asset.symbol} value={asset.symbol}>
                        {asset.symbol}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Chart */}
            {loadingHistory ? (
              <div className="flex items-center justify-center h-[400px]">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-400">Loading chart data...</p>
                </div>
              </div>
            ) : historyData.length > 0 ? (
              <>
                {chartType === "area" && (
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart
                      data={mergedChartData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorCompare" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => formatDateForInterval(d, selectedInterval)}
                        tick={{ fontSize: 12 }}
                        stroke="#94a3b8"
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 12 }}
                        stroke="#94a3b8"
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "0.75rem",
                          padding: "12px",
                        }}
                        formatter={(value: number | undefined, name?: string) => {
                          if (value === undefined) return ["N/A", name || "Price"];
                          const displayName = name === "compareClose" ? compareSymbol : (name || selectedSymbol);
                          return [`$${value.toFixed(2)}`, displayName];
                        }}
                        labelFormatter={(label) => {
                          const date = new Date(label);
                          if (isIntradayInterval(selectedInterval)) {
                            return date.toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          }
                          return date.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          });
                        }}
                      />
                      {compareSymbol && <Legend />}
                      <Area
                        type="monotone"
                        dataKey="close"
                        name={selectedSymbol}
                        stroke="#14b8a6"
                        strokeWidth={2}
                        fill="url(#colorClose)"
                        dot={false}
                        activeDot={{ r: 6, fill: "#14b8a6" }}
                      />
                      {compareSymbol && compareData.length > 0 && (
                        <Area
                          type="monotone"
                          dataKey="compareClose"
                          name={compareSymbol}
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          fill="url(#colorCompare)"
                          dot={false}
                          activeDot={{ r: 6, fill: "#8b5cf6" }}
                        />
                      )}
                      {showBrush && historyData.length > 5 && (
                        <Brush
                          dataKey="date"
                          height={30}
                          stroke="#14b8a6"
                          tickFormatter={(d) => formatDateForInterval(d, selectedInterval)}
                        />
                      )}
                      {chartStats && (
                        <ReferenceLine
                          y={chartStats.first}
                          stroke="#94a3b8"
                          strokeDasharray="5 5"
                          label={{ value: "Start", position: "insideTopRight", fontSize: 10 }}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                )}

                {chartType === "line" && (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart
                      data={historyData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => formatDateForInterval(d, selectedInterval)}
                        tick={{ fontSize: 12 }}
                        stroke="#94a3b8"
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 12 }}
                        stroke="#94a3b8"
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "0.75rem",
                          padding: "12px",
                        }}
                        formatter={(value: number | undefined) => [
                          `$${(value ?? 0).toFixed(2)}`,
                          "Price",
                        ]}
                        labelFormatter={(label) => {
                          const date = new Date(label);
                          if (isIntradayInterval(selectedInterval)) {
                            return date.toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          }
                          return date.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          });
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="close"
                        stroke="#14b8a6"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#14b8a6" }}
                        activeDot={{ r: 6, fill: "#14b8a6" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="high"
                        stroke="#22c55e"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="low"
                        stroke="#ef4444"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        dot={false}
                      />
                      {showBrush && historyData.length > 5 && (
                        <Brush
                          dataKey="date"
                          height={30}
                          stroke="#14b8a6"
                          tickFormatter={(d) => formatDateForInterval(d, selectedInterval)}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {chartType === "composed" && (
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart
                      data={historyData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => formatDateForInterval(d, selectedInterval)}
                        tick={{ fontSize: 12 }}
                        stroke="#94a3b8"
                      />
                      <YAxis
                        yAxisId="price"
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 12 }}
                        stroke="#94a3b8"
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                      />
                      <YAxis
                        yAxisId="range"
                        orientation="right"
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 12 }}
                        stroke="#94a3b8"
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                        hide
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "0.75rem",
                          padding: "12px",
                        }}
                        formatter={(value: number | undefined, name?: string) => [
                          `$${(value ?? 0).toFixed(2)}`,
                          name ? name.charAt(0).toUpperCase() + name.slice(1) : "Price",
                        ]}
                        labelFormatter={(label) => {
                          const date = new Date(label);
                          return date.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          });
                        }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="range"
                        dataKey="high"
                        name="High"
                        fill="#22c55e"
                        opacity={0.3}
                        barSize={8}
                      />
                      <Bar
                        yAxisId="range"
                        dataKey="low"
                        name="Low"
                        fill="#ef4444"
                        opacity={0.3}
                        barSize={8}
                      />
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="open"
                        name="Open"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        dot={false}
                      />
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="close"
                        name="Close"
                        stroke="#14b8a6"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 6 }}
                      />
                      {showBrush && historyData.length > 5 && (
                        <Brush
                          dataKey="date"
                          height={30}
                          stroke="#14b8a6"
                          tickFormatter={(d) => formatDateForInterval(d, selectedInterval)}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-[400px]">
                <p className="text-gray-400">No data available</p>
              </div>
            )}
          </div>

          {/* Asset Details with Metrics */}
          {stockData[selectedSymbol] && (
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Market Details & Financial Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Open</p>
                  <p className="text-xl font-bold text-gray-900">
                    ${stockData[selectedSymbol].open.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Close</p>
                  <p className="text-xl font-bold text-gray-900">
                    ${stockData[selectedSymbol].close.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Day High</p>
                  <p className="text-xl font-bold text-green-600">
                    ${stockData[selectedSymbol].high.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Day Low</p>
                  <p className="text-xl font-bold text-red-600">
                    ${stockData[selectedSymbol].low.toFixed(2)}
                  </p>
                </div>
              </div>

              {stockMetrics[selectedSymbol] && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-md font-semibold mb-3">Financial Metrics</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {stockMetrics[selectedSymbol].pe !== undefined && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">P/E Ratio</p>
                        <p className="text-xl font-bold text-blue-600">
                          {stockMetrics[selectedSymbol].pe!.toFixed(2)}
                        </p>
                      </div>
                    )}
                    {stockMetrics[selectedSymbol].roe !== undefined && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">ROE</p>
                        <p className="text-xl font-bold text-purple-600">
                          {(stockMetrics[selectedSymbol].roe! * 100).toFixed(2)}%
                        </p>
                      </div>
                    )}
                    {stockMetrics[selectedSymbol].volume !== undefined && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Volume</p>
                        <p className="text-xl font-bold text-orange-600">
                          {formatNumber(stockMetrics[selectedSymbol].volume!)}
                        </p>
                      </div>
                    )}
                    {stockMetrics[selectedSymbol].marketCap !== undefined && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Market Cap</p>
                        <p className="text-xl font-bold text-teal-600">
                          {formatNumber(stockMetrics[selectedSymbol].marketCap! * 1e6)}
                        </p>
                      </div>
                    )}
                    {stockMetrics[selectedSymbol].beta !== undefined && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Beta</p>
                        <p className="text-xl font-bold text-indigo-600">
                          {stockMetrics[selectedSymbol].beta!.toFixed(2)}
                        </p>
                      </div>
                    )}
                    {stockMetrics[selectedSymbol].dividendYield !== undefined && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Div Yield</p>
                        <p className="text-xl font-bold text-green-600">
                          {stockMetrics[selectedSymbol].dividendYield!.toFixed(2)}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400">
              Data Source: Finnhub API • {watchlist.length} assets in watchlist • Portfolio Value: {formatCurrency(portfolioValue)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Last updated: {new Date().toLocaleTimeString("en-US")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}