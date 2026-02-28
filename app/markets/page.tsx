"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/hooks/useAuth";

// Alternative.me API for Fear & Greed (no key required)
const SENTIMENT_API = 'https://api.alternative.me/fng/?limit=1';

// Types
type StockInfo = {
  symbol: string;
  name: string;
  sector: string;
  c?: number;
  d?: number;
  dp?: number;
  v?: number;
};

type IndexInfo = {
  id: string;
  symbol: string;
  name: string;
};

type SectorInfo = {
  name: string;
  sym: string;
  dp?: number;
};

type NewsItem = {
  datetime: number;
  headline: string;
  source: string;
  url: string;
  category: string;
};

type WatchlistItem = {
  symbol: string;
  name: string;
  emoji?: string;
};

const STOCKS: StockInfo[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'tech' },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'tech' },
  { symbol: 'GOOGL', name: 'Alphabet', sector: 'tech' },
  { symbol: 'AMZN', name: 'Amazon', sector: 'tech' },
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'tech' },
  { symbol: 'META', name: 'Meta Platforms', sector: 'tech' },
  { symbol: 'TSLA', name: 'Tesla', sector: 'tech' },
  { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'finance' },
  { symbol: 'BAC', name: 'Bank of America', sector: 'finance' },
  { symbol: 'GS', name: 'Goldman Sachs', sector: 'finance' },
  { symbol: 'V', name: 'Visa', sector: 'finance' },
];

const INDICES: IndexInfo[] = [
  { id: 'spx', symbol: 'SPY', name: 'S&P 500' },
  { id: 'ndx', symbol: 'QQQ', name: 'NASDAQ' },
  { id: 'dji', symbol: 'DIA', name: 'DOW JONES' },
  { id: 'vix', symbol: 'VIXY', name: 'VIX' },
];

const SECTORS: SectorInfo[] = [
  { name: 'Technology', sym: 'XLK' },
  { name: 'Finance', sym: 'XLF' },
  { name: 'Healthcare', sym: 'XLV' },
  { name: 'Energy', sym: 'XLE' },
  { name: 'Consumer', sym: 'XLY' },
  { name: 'Industrial', sym: 'XLI' },
];

// Helper functions
const fmt = (n: number | undefined, decimals = 2): string => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const fmtBig = (n: number | undefined): string => {
  if (!n) return '—';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  return n.toFixed(0);
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function MarketsPage() {
  const router = useRouter();
  const { user, isLoggedIn, loading: authLoading, refetch } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [clock, setClock] = useState('--:--:--');
  const [currentTab, setCurrentTab] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [indices, setIndices] = useState<Record<string, { c?: number; dp?: number }>>({});
  const [stockData, setStockData] = useState<StockInfo[]>([]);
  const [sectors, setSectors] = useState<SectorInfo[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [sentiment, setSentiment] = useState({ score: 50, mood: 'Loading...', color: '#f97316' });
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [loadingSentiment, setLoadingSentiment] = useState(true);

  // Watchlist state
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistData, setWatchlistData] = useState<Record<string, { c?: number; dp?: number }>>({});
  const [showAddStock, setShowAddStock] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState('');

  // Order Entry state
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [orderSymbol, setOrderSymbol] = useState('');
  const [orderShares, setOrderShares] = useState('');
  const [orderPrice, setOrderPrice] = useState<number | null>(null);

  // Handle logout
  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await refetch();
      setShowProfileMenu(false);
      router.push("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get watchlist storage key based on user
  const getWatchlistKey = useCallback(() => {
    return user?.id ? `investment-watchlist-${user.id}` : 'market-watchlist';
  }, [user?.id]);

  // Load watchlist from localStorage
  useEffect(() => {
    const key = getWatchlistKey();
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch {
        setWatchlist([
          { symbol: 'AAPL', name: 'Apple Inc.', emoji: '🍎' },
          { symbol: 'TSLA', name: 'Tesla', emoji: '⚡' },
          { symbol: 'NVDA', name: 'NVIDIA', emoji: '🎮' },
        ]);
      }
    } else {
      // Default watchlist
      setWatchlist([
        { symbol: 'AAPL', name: 'Apple Inc.', emoji: '🍎' },
        { symbol: 'TSLA', name: 'Tesla', emoji: '⚡' },
        { symbol: 'NVDA', name: 'NVIDIA', emoji: '🎮' },
      ]);
    }
  }, [getWatchlistKey]);

  // Listen for storage changes from other pages (e.g., Portfolio)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      const key = getWatchlistKey();
      if (e.key === key && e.newValue) {
        try {
          setWatchlist(JSON.parse(e.newValue));
        } catch {
          // Ignore parse errors
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [getWatchlistKey]);

  // Save watchlist to localStorage
  useEffect(() => {
    if (watchlist.length > 0) {
      const key = getWatchlistKey();
      localStorage.setItem(key, JSON.stringify(watchlist));
    }
  }, [watchlist, getWatchlistKey]);

  // Clock
  useEffect(() => {
    const updateClock = () => {
      setClock(new Date().toLocaleTimeString('en-US', { hour12: false }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch quote via server-side API (with caching and rate limiting)
  const fetchQuote = useCallback(async (symbol: string) => {
    const r = await fetch(`/api/finnhub?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=1`);
    if (!r.ok) {
      console.warn(`Failed to fetch ${symbol}: ${r.status}`);
      return {}; // Return empty object on failure
    }
    const data = await r.json();
    // Transform server response to quote format
    const quote = data.data?.[0];
    if (quote) {
      return {
        c: quote.close,
        o: quote.open,
        h: quote.high,
        l: quote.low,
        dp: quote.open ? ((quote.close - quote.open) / quote.open * 100) : 0
      };
    }
    return {};
  }, []);

  // Fetch news (using simplified approach without direct API key exposure)
  const fetchNews = useCallback(async () => {
    // For now, return empty array as we don't have a news endpoint
    // In production, you'd want to create a /api/finnhub/news route
    return [];
  }, []);

  // Fetch Fear & Greed Index from API
  const fetchSentiment = useCallback(async () => {
    setLoadingSentiment(true);
    try {
      // Using alternative.me Fear & Greed API (no key required)
      const r = await fetch(SENTIMENT_API);
      if (!r.ok) throw new Error('Failed to fetch sentiment');
      const data = await r.json();
      const fng = data.data?.[0];
      
      if (fng) {
        const score = parseInt(fng.value);
        let mood, color;
        
        if (score <= 25) { mood = 'EXTREME FEAR'; color = '#ef4444'; }
        else if (score <= 45) { mood = 'FEAR'; color = '#f97316'; }
        else if (score <= 55) { mood = 'NEUTRAL'; color = '#eab308'; }
        else if (score <= 75) { mood = 'GREED'; color = '#22c55e'; }
        else { mood = 'EXTREME GREED'; color = '#10b981'; }
        
        setSentiment({ score, mood, color });
      }
    } catch (e) {
      console.warn('Sentiment API error:', e);
      // Fallback to calculation based on market data
    } finally {
      setLoadingSentiment(false);
    }
  }, []);

  // Load indices
  const loadIndices = useCallback(async () => {
    const results: Record<string, { c?: number; dp?: number }> = {};
    for (const idx of INDICES) {
      try {
        const q = await fetchQuote(idx.symbol);
        results[idx.id] = { c: q.c, dp: q.dp };
      } catch (e) {
        console.warn('Index error:', idx.symbol, e);
      }
    }
    setIndices(results);
  }, [fetchQuote]);

  // Load stocks
  const loadStocks = useCallback(async () => {
    setLoadingStocks(true);
    const results: StockInfo[] = [];
    for (const s of STOCKS) {
      try {
        const q = await fetchQuote(s.symbol);
        results.push({ ...s, ...q });
      } catch (e) {
        console.warn(s.symbol, e);
        results.push(s);
      }
      await sleep(100);
    }
    setStockData(results);
    setLoadingStocks(false);
    return results;
  }, [fetchQuote]);

  // Load watchlist data
  const loadWatchlistData = useCallback(async () => {
    const results: Record<string, { c?: number; dp?: number }> = {};
    for (const item of watchlist) {
      try {
        const q = await fetchQuote(item.symbol);
        results[item.symbol] = { c: q.c, dp: q.dp };
      } catch (e) {
        console.warn('Watchlist error:', item.symbol, e);
      }
      await sleep(100);
    }
    setWatchlistData(results);
  }, [fetchQuote, watchlist]);

  // Load sectors
  const loadSectors = useCallback(async () => {
    const results: SectorInfo[] = [];
    for (const sec of SECTORS) {
      try {
        const q = await fetchQuote(sec.sym);
        results.push({ ...sec, dp: q.dp || 0 });
      } catch (e) {
        results.push({ ...sec, dp: 0 });
      }
      await sleep(100);
    }
    setSectors(results);
  }, [fetchQuote]);

  // Load news
  const loadNews = useCallback(async () => {
    try {
      const data = await fetchNews();
      setNews(data.slice(0, 6));
    } catch (e) {
      console.warn('News error', e);
    }
  }, [fetchNews]);

  // Refresh all
  const refreshAll = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([loadIndices(), loadNews(), fetchSentiment()]);
      await loadStocks();
      await loadSectors();
      await loadWatchlistData();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, loadIndices, loadNews, fetchSentiment, loadStocks, loadSectors, loadWatchlistData]);

  // Initial load
  useEffect(() => {
    refreshAll();
    const interval = setInterval(() => {
      loadIndices();
      loadWatchlistData();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Update watchlist data when watchlist changes
  useEffect(() => {
    if (watchlist.length > 0) {
      loadWatchlistData();
    }
  }, [watchlist]);

  // Add to watchlist
  const addToWatchlist = async () => {
    if (!searchSymbol.trim()) return;
    const symbol = searchSymbol.toUpperCase().trim();
    
    if (watchlist.find(w => w.symbol === symbol)) {
      alert('Already in watchlist');
      return;
    }

    try {
      // Verify the symbol exists by fetching a quote
      const q = await fetchQuote(symbol);
      if (q.c) {
        // Try to find the stock name from STOCKS constant
        const stockInfo = STOCKS.find(s => s.symbol === symbol);
        const newItem: WatchlistItem = { 
          symbol, 
          name: stockInfo?.name || symbol,
          emoji: '📈' // Default emoji for new stocks
        };
        setWatchlist([...watchlist, newItem]);
        setWatchlistData({ ...watchlistData, [symbol]: { c: q.c, dp: q.dp } });
        setSearchSymbol('');
        setShowAddStock(false);
      }
    } catch (e) {
      alert('Invalid symbol');
    }
  };

  // Remove from watchlist
  const removeFromWatchlist = (symbol: string) => {
    setWatchlist(watchlist.filter(w => w.symbol !== symbol));
  };

  // Open order modal
  const openOrderModal = (symbol: string, type: 'buy' | 'sell') => {
    setOrderSymbol(symbol);
    setOrderType(type);
    setOrderShares('');
    const stock = stockData.find(s => s.symbol === symbol) || { c: watchlistData[symbol]?.c };
    setOrderPrice(stock?.c || null);
    setShowOrderModal(true);
  };

  // Execute order
  const executeOrder = () => {
    if (!orderSymbol || !orderShares || !orderPrice) return;
    
    const shares = parseInt(orderShares);
    if (shares <= 0) return;

    // Get wallet from localStorage
    const userId = (user as any)?.id;
    if (!userId) {
      alert('Please login to trade');
      return;
    }

    const saved = localStorage.getItem(`investment-wallet-${userId}`);
    let wallet = saved ? JSON.parse(saved) : { cash: 100000, positions: {}, transactions: [] };

    const total = shares * orderPrice;

    if (orderType === 'buy') {
      if (total > wallet.cash) {
        alert('Insufficient funds');
        return;
      }
      wallet.cash -= total;
      wallet.positions[orderSymbol] = (wallet.positions[orderSymbol] || 0) + shares;
    } else {
      if ((wallet.positions[orderSymbol] || 0) < shares) {
        alert('Insufficient shares');
        return;
      }
      wallet.cash += total;
      wallet.positions[orderSymbol] -= shares;
      if (wallet.positions[orderSymbol] <= 0) {
        delete wallet.positions[orderSymbol];
      }
    }

    // Add transaction
    wallet.transactions.unshift({
      id: Date.now().toString(),
      symbol: orderSymbol,
      type: orderType,
      shares,
      price: orderPrice,
      total,
      date: new Date().toISOString(),
    });

    localStorage.setItem(`investment-wallet-${userId}`, JSON.stringify(wallet));
    setShowOrderModal(false);
    alert(`${orderType === 'buy' ? 'Bought' : 'Sold'} ${shares} shares of ${orderSymbol} at $${orderPrice.toFixed(2)}`);
  };

  // Filter stocks by tab
  const filteredStocks = currentTab === 'all' ? stockData : stockData.filter(s => s.sector === currentTab);

  // Gainers and losers
  const sortedStocks = [...stockData].filter(s => s.dp != null).sort((a, b) => (b.dp || 0) - (a.dp || 0));
  const gainers = sortedStocks.slice(0, 5);
  const losers = sortedStocks.slice(-5).reverse();

  return (
    <div style={{ minHeight: '100vh', background: 'white', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .nav-bar {
          background: white;
          border-bottom: 1px solid #e5e7eb;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .nav-link {
          color: #6b7280;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: color 0.2s;
        }
        .nav-link:hover { color: #111827; }
        .nav-link.active {
          color: #f97316;
          font-weight: 600;
        }

        .index-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          padding: 20px 24px;
          border-radius: 8px;
          transition: all 0.3s;
        }
        .index-card:hover { 
          border-color: #f97316;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.1);
        }

        .panel {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .tab {
          padding: 8px 16px;
          font-size: 13px;
          border: 1px solid transparent;
          background: none;
          color: #6b7280;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
          border-radius: 6px;
          font-weight: 500;
        }
        .tab.active {
          border-color: #f97316;
          color: #f97316;
          background: #fff7ed;
        }
        .tab:hover:not(.active) {
          color: #111827;
          background: #f3f4f6;
        }

        .stock-row {
          border-bottom: 1px solid #f3f4f6;
          transition: background 0.2s;
          cursor: pointer;
        }
        .stock-row:hover { background: #f9fafb; }

        .sector-block {
          padding: 14px;
          border-radius: 8px;
          transition: all 0.2s;
          cursor: pointer;
          border: 1px solid #e5e7eb;
        }
        .sector-block:hover { 
          transform: scale(1.02);
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        .news-item {
          padding: 14px 20px;
          border-bottom: 1px solid #f3f4f6;
          transition: background 0.2s;
          cursor: pointer;
        }
        .news-item:hover { background: #f9fafb; }

        .loading-shimmer {
          background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 4px;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .profile-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #f97316;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          color: white;
          cursor: pointer;
          border: 2px solid #fed7aa;
          transition: all 0.2s;
          overflow: hidden;
          padding: 0;
        }
        .profile-btn:hover {
          background: #ea580c;
          transform: scale(1.05);
        }

        .profile-menu {
          position: absolute;
          top: 50px;
          right: 0;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 8px;
          min-width: 200px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          z-index: 1000;
        }

        .profile-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-radius: 6px;
          color: #374151;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.15s;
          text-decoration: none;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
        }
        .profile-menu-item:hover { background: #f3f4f6; }
        .profile-menu-item.logout { color: #ef4444; }
        .profile-menu-item.logout:hover { background: #fef2f2; }

        .ticker-track {
          display: flex;
          animation: ticker 35s linear infinite;
          width: max-content;
        }
        .ticker-track:hover { animation-play-state: paused; }
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        .spin { animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .btn-primary {
          padding: 10px 20px;
          background: #f97316;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary:hover { background: #ea580c; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-secondary {
          padding: 10px 20px;
          background: white;
          color: #374151;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-secondary:hover { background: #f9fafb; border-color: #9ca3af; }

        .btn-buy {
          padding: 6px 12px;
          background: #dcfce7;
          color: #16a34a;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-buy:hover { background: #bbf7d0; }

        .btn-sell {
          padding: 6px 12px;
          background: #fef2f2;
          color: #dc2626;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-sell:hover { background: #fecaca; }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          border-radius: 12px;
          padding: 24px;
          min-width: 400px;
          max-width: 90%;
          box-shadow: 0 20px 25px rgba(0,0,0,0.15);
        }

        .input-field {
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.2s;
        }
        .input-field:focus {
          outline: none;
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249,115,22,0.1);
        }

        .watchlist-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid #f3f4f6;
          transition: all 0.2s;
        }
        .watchlist-item:hover { background: #f9fafb; }
      `}</style>

      {/* Navigation */}
      <nav className="nav-bar">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
            <img src="/oiyen-logo.png" alt="Oiyen" style={{ width: 46, height: 46, borderRadius: '50%' }} />
            <span style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f97316' }}>Oiyen</span>
          </Link>

          <div style={{ display: 'flex', gap: '32px' }}>
            {['Markets', 'Portfolio', 'Research', 'Pricing'].map(item => (
              <Link 
                key={item} 
                href={`/${item.toLowerCase()}`} 
                className={`nav-link${item === 'Markets' ? ' active' : ''}`}
              >
                {item}
              </Link>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>
              <span style={{ width: 6, height: 6, background: '#22c55e', borderRadius: '50%', animation: 'pulse 1.5s infinite' }}></span>
              Live Data
            </div>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{clock}</span>
            <button 
              onClick={refreshAll} 
              disabled={isRefreshing}
              className="btn-secondary"
              style={{ padding: '6px 14px' }}
            >
              {isRefreshing ? <span className="spin">↻</span> : '↻'} Refresh
            </button>

            {/* Profile */}
            {authLoading ? (
              <div style={{ width: 36, height: 36 }} />
            ) : isLoggedIn ? (
              <div style={{ position: 'relative' }} ref={menuRef}>
                <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="profile-btn" title={user?.name || "Profile"}>
                  {user?.image ? (
                    <img src={user.image} alt={user.name || 'Profile'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    user?.name?.charAt(0).toUpperCase() || "U"
                  )}
                </button>
                {showProfileMenu && (
                  <div className="profile-menu">
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', marginBottom: '8px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>{user?.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{user?.email}</div>
                    </div>
                    <Link href="/profile" className="profile-menu-item" onClick={() => setShowProfileMenu(false)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      My Profile
                    </Link>
                    <Link href="/profile" className="profile-menu-item" onClick={() => setShowProfileMenu(false)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                      Portfolio
                    </Link>
                    <button onClick={handleLogout} className="profile-menu-item logout">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login" className="btn-primary" style={{ padding: '8px 20px', textDecoration: 'none' }}>
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 2rem 60px' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
            Markets
          </h1>
          <p style={{ color: '#6b7280', fontSize: '15px' }}>
            Real-time market data, news, and trading insights
          </p>
        </div>

        {/* Ticker Strip */}
        <div style={{ overflow: 'hidden', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '32px', padding: '12px 0' }}>
          <div className="ticker-track">
            {[...stockData, ...stockData].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 28px', borderRight: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{s.symbol}</span>
                <span style={{ fontSize: '14px', color: '#374151' }}>${fmt(s.c)}</span>
                <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: (s.dp || 0) >= 0 ? '#dcfce7' : '#fef2f2', color: (s.dp || 0) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 500 }}>
                  {(s.dp || 0) >= 0 ? '+' : ''}{fmt(s.dp)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Market Indices */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
          {INDICES.map(idx => (
            <div key={idx.id} className="index-card">
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{idx.name}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                {indices[idx.id]?.c ? fmt(indices[idx.id].c) : <span className="loading-shimmer" style={{ display: 'inline-block', width: 80, height: 28 }} />}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: (indices[idx.id]?.dp || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                {indices[idx.id]?.dp != null ? `${(indices[idx.id].dp || 0) >= 0 ? '+' : ''}${fmt(indices[idx.id].dp)}%` : <span className="loading-shimmer" style={{ display: 'inline-block', width: 50, height: 16 }} />}
              </div>
            </div>
          ))}
        </div>

        {/* Main Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', marginBottom: '32px' }}>
          {/* Stock Table */}
          <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                Popular Stocks
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['all', 'tech', 'finance'].map(tab => (
                  <button key={tab} className={`tab ${currentTab === tab ? 'active' : ''}`} onClick={() => setCurrentTab(tab)}>
                    {tab === 'all' ? 'All' : tab === 'tech' ? 'Tech' : 'Finance'}
                  </button>
                ))}
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Stock</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Price</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Change</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>%</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Volume</th>
                  <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Trade</th>
                </tr>
              </thead>
              <tbody>
                {loadingStocks ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i} className="stock-row">
                      <td style={{ padding: '14px 20px' }}><span className="loading-shimmer" style={{ display: 'inline-block', width: 100, height: 20 }} /></td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}><span className="loading-shimmer" style={{ display: 'inline-block', width: 60, height: 20 }} /></td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}><span className="loading-shimmer" style={{ display: 'inline-block', width: 40, height: 20 }} /></td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}><span className="loading-shimmer" style={{ display: 'inline-block', width: 50, height: 20 }} /></td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}><span className="loading-shimmer" style={{ display: 'inline-block', width: 40, height: 20 }} /></td>
                      <td style={{ padding: '14px 20px' }}></td>
                    </tr>
                  ))
                ) : (
                  filteredStocks.map(s => (
                    <tr key={s.symbol} className="stock-row">
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: 36, height: 36, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#f97316' }}>
                            {s.symbol.slice(0, 3)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#111827', fontSize: '14px' }}>{s.symbol}</div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>{s.name}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#111827', fontWeight: 600, fontSize: '14px' }}>${fmt(s.c)}</td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontSize: '14px', color: (s.d || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                        {(s.d || 0) >= 0 ? '+' : ''}{fmt(s.d)}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', background: (s.dp || 0) >= 0 ? '#dcfce7' : '#fef2f2', color: (s.dp || 0) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {(s.dp || 0) >= 0 ? '+' : ''}{fmt(s.dp)}%
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#6b7280', fontSize: '13px' }}>{fmtBig(s.v)}</td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button className="btn-buy" onClick={() => openOrderModal(s.symbol, 'buy')}>Buy</button>
                          <button className="btn-sell" onClick={() => openOrderModal(s.symbol, 'sell')}>Sell</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Market Sentiment */}
            <div className="panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
                Market Sentiment
              </h3>
              <div style={{ textAlign: 'center' }}>
                {loadingSentiment ? (
                  <span className="loading-shimmer" style={{ display: 'inline-block', width: 80, height: 48 }} />
                ) : (
                  <>
                    <div style={{ fontSize: '3rem', fontWeight: 700, color: sentiment.color, marginBottom: '8px' }}>
                      {sentiment.score}
                    </div>
                    <div style={{ 
                      display: 'inline-block',
                      padding: '6px 16px', 
                      borderRadius: '20px', 
                      background: `${sentiment.color}15`,
                      color: sentiment.color,
                      fontWeight: 600,
                      fontSize: '13px'
                    }}>
                      {sentiment.mood}
                    </div>
                    <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '12px' }}>
                      Fear & Greed Index (via alternative.me API)
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Watchlist */}
            <div className="panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                  Watchlist
                </h3>
                <button 
                  onClick={() => setShowAddStock(!showAddStock)}
                  style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', fontSize: '20px', fontWeight: 500 }}
                >
                  {showAddStock ? '×' : '+'}
                </button>
              </div>
              
              {showAddStock && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={searchSymbol}
                    onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                    placeholder="Enter symbol..."
                    className="input-field"
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                    onKeyDown={(e) => e.key === 'Enter' && addToWatchlist()}
                  />
                  <button onClick={addToWatchlist} className="btn-primary" style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>
                    Add
                  </button>
                </div>
              )}

              <div>
                {watchlist.map(item => (
                  <div key={item.symbol} className="watchlist-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: 32, height: 32, background: '#f3f4f6', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#374151' }}>
                        {item.symbol.slice(0, 3)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#111827' }}>{item.symbol}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>{item.name}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#111827' }}>
                          {watchlistData[item.symbol]?.c ? `$${fmt(watchlistData[item.symbol].c)}` : '—'}
                        </div>
                        <div style={{ fontSize: '11px', color: (watchlistData[item.symbol]?.dp || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                          {watchlistData[item.symbol]?.dp != null ? `${(watchlistData[item.symbol].dp || 0) >= 0 ? '+' : ''}${fmt(watchlistData[item.symbol].dp)}%` : '—'}
                        </div>
                      </div>
                      <button 
                        onClick={() => removeFromWatchlist(item.symbol)}
                        style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '16px', padding: '4px' }}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                {watchlist.length === 0 && (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                    No stocks in watchlist
                  </div>
                )}
              </div>
            </div>

            {/* Quick Trade */}
            <div className="panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
                Quick Trade
              </h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                {['AAPL', 'TSLA', 'NVDA'].map(symbol => (
                  <div key={symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#374151' }}>{symbol}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-buy" onClick={() => openOrderModal(symbol, 'buy')}>Buy</button>
                      <button className="btn-sell" onClick={() => openOrderModal(symbol, 'sell')}>Sell</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {/* Sector Performance */}
          <div className="panel">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                Sector Performance
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '16px' }}>
              {sectors.map(s => {
                const isUp = (s.dp || 0) >= 0;
                return (
                  <div key={s.name} className="sector-block" style={{ background: isUp ? '#f0fdf4' : '#fef2f2' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{s.name}</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: isUp ? '#16a34a' : '#dc2626' }}>
                      {isUp ? '+' : ''}{fmt(s.dp)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Gainers */}
          <div className="panel">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>▲</span> Top Gainers
              </h3>
            </div>
            <div>
              {gainers.map(s => (
                <div key={s.symbol} className="news-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>{s.symbol}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{s.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>${fmt(s.c)}</div>
                    <span style={{ fontSize: '12px', padding: '2px 8px', background: '#dcfce7', color: '#16a34a', borderRadius: '4px', fontWeight: 600 }}>
                      +{fmt(s.dp)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Losers */}
          <div className="panel">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>▼</span> Top Losers
              </h3>
            </div>
            <div>
              {losers.map(s => (
                <div key={s.symbol} className="news-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>{s.symbol}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{s.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>${fmt(s.c)}</div>
                    <span style={{ fontSize: '12px', padding: '2px 8px', background: '#fef2f2', color: '#dc2626', borderRadius: '4px', fontWeight: 600 }}>
                      {fmt(s.dp)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Market News Section */}
        <div className="panel" style={{ marginTop: '24px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
              Market News
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0' }}>
            {news.length === 0 ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="news-item" style={{ borderRight: i < 2 ? '1px solid #e5e7eb' : 'none' }}>
                  <span className="loading-shimmer" style={{ display: 'block', width: '100%', height: 16, marginBottom: 8 }} />
                  <span className="loading-shimmer" style={{ display: 'block', width: '70%', height: 12 }} />
                </div>
              ))
            ) : (
              news.slice(0, 6).map((n, i) => (
                <div 
                  key={i} 
                  className="news-item" 
                  style={{ borderRight: (i + 1) % 3 !== 0 ? '1px solid #e5e7eb' : 'none' }}
                  onClick={() => window.open(n.url, '_blank')}
                >
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>
                    {new Date(n.datetime * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · {n.source}
                  </div>
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5, fontWeight: 500 }}>
                    {n.headline?.slice(0, 100)}{n.headline?.length > 100 ? '...' : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Order Modal */}
      {showOrderModal && (
        <div className="modal-overlay" onClick={() => setShowOrderModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                {orderType === 'buy' ? '🟢 Buy' : '🔴 Sell'} {orderSymbol}
              </h3>
              <button onClick={() => setShowOrderModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer' }}>
                ×
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                Current Price
              </label>
              <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                ${orderPrice?.toFixed(2) || '—'}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                Number of Shares
              </label>
              <input
                type="number"
                value={orderShares}
                onChange={(e) => setOrderShares(e.target.value)}
                placeholder="Enter quantity"
                min="1"
                className="input-field"
              />
            </div>

            {orderShares && orderPrice && (
              <div style={{ padding: '16px', background: orderType === 'buy' ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                  <span style={{ color: '#6b7280' }}>Estimated Total</span>
                  <span style={{ fontWeight: 700, fontSize: '1.25rem', color: orderType === 'buy' ? '#16a34a' : '#dc2626' }}>
                    ${(parseInt(orderShares) * orderPrice).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowOrderModal(false)} className="btn-secondary" style={{ flex: 1 }}>
                Cancel
              </button>
              <button 
                onClick={executeOrder} 
                disabled={!orderShares || parseInt(orderShares) <= 0}
                className="btn-primary"
                style={{ 
                  flex: 1, 
                  background: orderType === 'buy' ? '#16a34a' : '#dc2626',
                  opacity: (!orderShares || parseInt(orderShares) <= 0) ? 0.5 : 1
                }}
              >
                {orderType === 'buy' ? 'Buy' : 'Sell'} {orderSymbol}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
