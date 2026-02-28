"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/app/hooks/useAuth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";

// Types
type CompanyProfile = {
  country: string;
  currency: string;
  exchange: string;
  ipo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
  logo: string;
  finnhubIndustry: string;
};

type Quote = {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
};

type Metrics = {
  metric: {
    '10DayAverageTradingVolume': number;
    '52WeekHigh': number;
    '52WeekLow': number;
    '52WeekPriceReturnDaily': number;
    beta: number;
    bookValuePerShareAnnual: number;
    bookValuePerShareQuarterly: number;
    currentRatioAnnual: number;
    dividendPerShareAnnual: number;
    dividendYieldIndicatedAnnual: number;
    epsBasicExclExtraItemsAnnual: number;
    epsBasicExclExtraItemsTTM: number;
    epsGrowth3Y: number;
    epsGrowth5Y: number;
    epsGrowthQuarterlyYoy: number;
    epsGrowthTTMYoy: number;
    epsInclExtraItemsAnnual: number;
    epsInclExtraItemsTTM: number;
    epsNormalizedAnnual: number;
    grossMargin5Y: number;
    grossMarginAnnual: number;
    grossMarginTTM: number;
    marketCapitalization: number;
    netIncomeEmployeeAnnual: number;
    netProfitMarginAnnual: number;
    netProfitMarginTTM: number;
    operatingMargin5Y: number;
    operatingMarginAnnual: number;
    operatingMarginTTM: number;
    pbAnnual: number;
    pbQuarterly: number;
    pcfRatioAnnual: number;
    pcfRatioTTM: number;
    peAnnual: number;
    peBasicExclExtraTTM: number;
    peExclExtraAnnual: number;
    peExclExtraTTM: number;
    peNormalizedAnnual: number;
    peTTM: number;
    pfcfRatioAnnual: number;
    pfcfRatioTTM: number;
    priceRelativeToS5001M: number;
    priceRelativeToS5001Y: number;
    priceRelativeToS5004W: number;
    priceToSalesAnnual: number;
    priceToSalesTTM: number;
    revenueGrowth3Y: number;
    revenueGrowth5Y: number;
    revenueGrowthQuarterlyYoy: number;
    revenueGrowthTTMYoy: number;
    revenuePerShareAnnual: number;
    revenuePerShareTTM: number;
    roaRfy: number;
    roaa5Y: number;
    roae5Y: number;
    roaeTTM: number;
    roeTTM: number;
    roiAnnual: number;
    roiTTM: number;
    tangibleBookValuePerShareAnnual: number;
    totalDebtDividendAnnual: number;
  };
  series: {
    annual: {
      currentRatio: Array<{ period: string; v: number }>;
      eps: Array<{ period: string; v: number }>;
      grossMargin: Array<{ period: string; v: number }>;
      netMargin: Array<{ period: string; v: number }>;
      operatingMargin: Array<{ period: string; v: number }>;
      pb: Array<{ period: string; v: number }>;
      pe: Array<{ period: string; v: number }>;
      pfcf: Array<{ period: string; v: number }>;
      ps: Array<{ period: string; v: number }>;
      roe: Array<{ period: string; v: number }>;
      salesPerShare: Array<{ period: string; v: number }>;
    };
  };
};

type Recommendation = {
  buy: number;
  hold: number;
  period: string;
  sell: number;
  strongBuy: number;
  strongSell: number;
  symbol: string;
};

type PriceTarget = {
  lastUpdated: string;
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetMean: number;
  targetMedian: number;
};

type Earnings = {
  actual: number;
  estimate: number;
  period: string;
  quarter: number;
  surprise: number;
  surprisePercent: number;
  symbol: string;
  year: number;
};

type Ownership = {
  ownership: Array<{
    name: string;
    share: number;
    change: number;
    filingDate: string;
  }>;
  symbol: string;
};

type InsiderTransaction = {
  name: string;
  share: number;
  change: number;
  filingDate: string;
  transactionCode: string;
  transactionPrice: number;
};

type NewsItem = {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
};

type ResearchData = {
  profile: CompanyProfile | null;
  quote: Quote | null;
  metrics: Metrics | null;
  recommendation: Recommendation[] | null;
  priceTarget: PriceTarget | null;
  earnings: Earnings[] | null;
  ownership: Ownership | null;
  insider: { data: InsiderTransaction[] } | null;
  news: NewsItem[] | null;
  peers: string[] | null;
};

// Format helpers
const fmt = (num: number | undefined | null, decimals = 2): string => {
  if (num === undefined || num === null || isNaN(num)) return "—";
  return num.toLocaleString('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

const fmtBig = (num: number | undefined | null): string => {
  if (num === undefined || num === null || isNaN(num)) return "—";
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

const fmtPct = (num: number | undefined | null): string => {
  if (num === undefined || num === null || isNaN(num)) return "—";
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
};

const fmtDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Pie chart colors
const RATING_COLORS = {
  strongBuy: '#16a34a',
  buy: '#22c55e',
  hold: '#eab308',
  sell: '#f97316',
  strongSell: '#dc2626',
};

export default function ResearchPage() {
  const router = useRouter();
  const { user, isLoggedIn, loading: authLoading, refetch } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchSymbol, setSearchSymbol] = useState("AAPL");
  const [currentSymbol, setCurrentSymbol] = useState("AAPL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Research data
  const [data, setData] = useState<ResearchData | null>(null);

  // Active section
  const [activeSection, setActiveSection] = useState("overview");

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

  // Fetch research data
  const fetchResearchData = useCallback(async (symbol: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/research?symbol=${symbol}&type=all`);
      if (!res.ok) {
        throw new Error('Failed to fetch research data');
      }
      const result = await res.json();
      
      if (result.error) {
        throw new Error(result.message || result.error);
      }
      
      setData(result);
      setCurrentSymbol(symbol);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchResearchData(currentSymbol);
  }, []);

  // Handle search
  const handleSearch = () => {
    if (searchSymbol.trim()) {
      fetchResearchData(searchSymbol.trim().toUpperCase());
    }
  };

  // Prepare chart data
  const getRecommendationData = () => {
    if (!data?.recommendation || data.recommendation.length === 0) return [];
    const latest = data.recommendation[0];
    return [
      { name: 'Strong Buy', value: latest.strongBuy, color: RATING_COLORS.strongBuy },
      { name: 'Buy', value: latest.buy, color: RATING_COLORS.buy },
      { name: 'Hold', value: latest.hold, color: RATING_COLORS.hold },
      { name: 'Sell', value: latest.sell, color: RATING_COLORS.sell },
      { name: 'Strong Sell', value: latest.strongSell, color: RATING_COLORS.strongSell },
    ].filter(item => item.value > 0);
  };

  const getEpsChartData = () => {
    if (!data?.earnings) return [];
    return data.earnings.slice(0, 8).reverse().map(e => ({
      period: `Q${e.quarter} ${e.year}`,
      actual: e.actual,
      estimate: e.estimate,
    }));
  };

  const getHistoricalMetrics = () => {
    if (!data?.metrics?.series?.annual) return { eps: [], pe: [], margin: [] };
    const series = data.metrics.series.annual;
    
    return {
      eps: (series.eps || []).slice(0, 5).reverse().map(item => ({
        period: item.period,
        value: item.v,
      })),
      pe: (series.pe || []).slice(0, 5).reverse().map(item => ({
        period: item.period,
        value: item.v,
      })),
      margin: (series.grossMargin || []).slice(0, 5).reverse().map(item => ({
        period: item.period,
        gross: item.v * 100,
        net: (series.netMargin?.find(n => n.period === item.period)?.v || 0) * 100,
      })),
    };
  };

  const getRecommendationTrend = () => {
    if (!data?.recommendation) return [];
    return data.recommendation.slice(0, 6).reverse().map(r => ({
      period: r.period,
      strongBuy: r.strongBuy,
      buy: r.buy,
      hold: r.hold,
      sell: r.sell,
      strongSell: r.strongSell,
    }));
  };

  const historicalMetrics = getHistoricalMetrics();
  const recommendationData = getRecommendationData();
  const epsChartData = getEpsChartData();
  const recommendationTrend = getRecommendationTrend();

  // Calculate total ratings
  const totalRatings = recommendationData.reduce((sum, item) => sum + item.value, 0);

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'financials', label: 'Financials' },
    { id: 'valuation', label: 'Valuation' },
    { id: 'analysts', label: 'Analysts' },
    { id: 'ownership', label: 'Ownership' },
    { id: 'insider', label: 'Insider Trading' },
    { id: 'news', label: 'News' },
  ];

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
        .nav-link.active { color: #f97316; font-weight: 600; }

        .panel {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .tab {
          padding: 10px 20px;
          font-size: 13px;
          border: none;
          background: none;
          color: #6b7280;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
          font-weight: 500;
          border-bottom: 2px solid transparent;
        }
        .tab.active {
          color: #f97316;
          border-bottom-color: #f97316;
        }
        .tab:hover:not(.active) {
          color: #111827;
          background: #f9fafb;
        }

        .metric-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          transition: all 0.2s;
        }
        .metric-card:hover {
          border-color: #f97316;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.1);
        }

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
          font-family: inherit;
        }
        .btn-primary:hover { background: #ea580c; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .input-field {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.2s;
          font-family: inherit;
        }
        .input-field:focus {
          outline: none;
          border-color: #f97316;
          box-shadow: 0 0 0 3px rgba(249,115,22,0.1);
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

        .spin { animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .peer-btn {
          padding: 8px 14px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
        }
        .peer-btn:hover {
          border-color: #f97316;
          color: #f97316;
          background: #fff7ed;
        }

        .news-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          transition: all 0.2s;
          text-decoration: none;
          display: block;
        }
        .news-card:hover {
          border-color: #f97316;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.1);
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th {
          padding: 12px 16px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }
        .data-table td {
          padding: 14px 16px;
          font-size: 14px;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
        }
        .data-table tr:hover td {
          background: #f9fafb;
        }

        .progress-bar {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.5s ease-in-out;
        }
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
                className={`nav-link${item === 'Research' ? ' active' : ''}`}
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
            Stock Research
          </h1>
          <p style={{ color: '#6b7280', fontSize: '15px' }}>
            Comprehensive analysis, financials, and insights for any stock
          </p>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', maxWidth: '500px' }}>
          <input
            type="text"
            value={searchSymbol}
            onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter stock symbol (e.g., AAPL)"
            className="input-field"
            style={{ textTransform: 'uppercase' }}
          />
          <button onClick={handleSearch} className="btn-primary" disabled={loading}>
            {loading ? <span className="spin">↻</span> : 'Search'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <p style={{ color: '#dc2626', fontSize: '14px' }}>{error}</p>
          </div>
        )}

        {/* Stock Header */}
        {!loading && data?.profile && (
          <div className="panel" style={{ padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                {data.profile.logo && (
                  <img 
                    src={data.profile.logo} 
                    alt={data.profile.name}
                    style={{ width: 64, height: 64, borderRadius: '12px', background: 'white', padding: '8px', border: '1px solid #e5e7eb' }}
                  />
                )}
                <div>
                  <h2 style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                    {currentSymbol}
                  </h2>
                  <p style={{ color: '#6b7280', fontSize: '15px', marginBottom: '12px' }}>{data.profile.name}</p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', padding: '4px 10px', background: '#f3f4f6', color: '#6b7280', borderRadius: '4px' }}>
                      {data.profile.finnhubIndustry}
                    </span>
                    <span style={{ fontSize: '12px', padding: '4px 10px', background: '#f3f4f6', color: '#6b7280', borderRadius: '4px' }}>
                      {data.profile.exchange}
                    </span>
                    <span style={{ fontSize: '12px', padding: '4px 10px', background: '#f3f4f6', color: '#6b7280', borderRadius: '4px' }}>
                      {data.profile.country}
                    </span>
                  </div>
                </div>
              </div>
              {data.quote && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#111827' }}>
                    ${fmt(data.quote.c)}
                  </p>
                  <p style={{ fontSize: '1.1rem', color: data.quote.d >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {data.quote.d >= 0 ? '↑' : '↓'} ${fmt(Math.abs(data.quote.d))} ({fmtPct(data.quote.dp)})
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="panel" style={{ padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div className="loading-shimmer" style={{ width: 64, height: 64, borderRadius: '12px' }} />
              <div>
                <div className="loading-shimmer" style={{ width: 150, height: 32, marginBottom: '8px' }} />
                <div className="loading-shimmer" style={{ width: 250, height: 20, marginBottom: '12px' }} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div className="loading-shimmer" style={{ width: 80, height: 24 }} />
                  <div className="loading-shimmer" style={{ width: 80, height: 24 }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section Tabs */}
        {!loading && data && (
          <>
            <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '24px', overflowX: 'auto' }}>
              <div style={{ display: 'flex', minWidth: 'fit-content' }}>
                {sections.map(section => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`tab ${activeSection === section.id ? 'active' : ''}`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Overview Section */}
            {activeSection === 'overview' && (
              <div>
                {/* Key Metrics */}
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Key Metrics</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    {[
                      { label: 'Market Cap', value: fmtBig(data.profile?.marketCapitalization ? data.profile.marketCapitalization * 1e6 : null) },
                      { label: '52W High', value: data.metrics?.metric?.['52WeekHigh'] ? `$${fmt(data.metrics.metric['52WeekHigh'])}` : '—' },
                      { label: '52W Low', value: data.metrics?.metric?.['52WeekLow'] ? `$${fmt(data.metrics.metric['52WeekLow'])}` : '—' },
                      { label: 'P/E Ratio', value: fmt(data.metrics?.metric?.peTTM) },
                      { label: 'EPS (TTM)', value: data.metrics?.metric?.epsInclExtraItemsTTM ? `$${fmt(data.metrics.metric.epsInclExtraItemsTTM)}` : '—' },
                      { label: 'Div Yield', value: data.metrics?.metric?.dividendYieldIndicatedAnnual ? `${fmt(data.metrics.metric.dividendYieldIndicatedAnnual)}%` : '—' },
                    ].map((metric, idx) => (
                      <div key={idx} className="metric-card">
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>{metric.label}</p>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{metric.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Company Profile */}
                {data.profile && (
                  <div className="panel" style={{ padding: '20px', marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Company Profile</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Industry</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>{data.profile.finnhubIndustry}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Exchange</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>{data.profile.exchange}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>IPO Date</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>{data.profile.ipo || '—'}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>Shares Outstanding</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>{fmtBig(data.profile.shareOutstanding ? data.profile.shareOutstanding * 1e6 : null)}</p>
                      </div>
                    </div>
                    {data.profile.weburl && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                        <a href={data.profile.weburl} target="_blank" rel="noopener noreferrer" style={{ color: '#f97316', fontSize: '14px', textDecoration: 'none' }}>
                          {data.profile.weburl} →
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Peer Companies */}
                {data.peers && data.peers.length > 0 && (
                  <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Peer Companies</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {data.peers.slice(0, 12).map((peer, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSearchSymbol(peer);
                            fetchResearchData(peer);
                          }}
                          className="peer-btn"
                        >
                          {peer}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Financials Section */}
            {activeSection === 'financials' && (
              <div>
                {/* EPS Charts */}
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Earnings Per Share (EPS)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                    <div className="panel" style={{ padding: '20px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '16px' }}>Quarterly EPS vs Estimates</h4>
                      {epsChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={epsChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="period" tick={{ fill: '#6b7280', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                            <Tooltip
                              contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
                            />
                            <Legend />
                            <Bar dataKey="estimate" name="Estimate" fill="#d1d5db" />
                            <Bar dataKey="actual" name="Actual" fill="#f97316" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                          No earnings data available
                        </div>
                      )}
                    </div>
                    <div className="panel" style={{ padding: '20px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '16px' }}>Annual EPS Trend</h4>
                      {historicalMetrics.eps.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <AreaChart data={historicalMetrics.eps}>
                            <defs>
                              <linearGradient id="epsGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="period" tick={{ fill: '#6b7280', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
                            <Area type="monotone" dataKey="value" stroke="#f97316" fill="url(#epsGradient)" name="EPS" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                          No historical data available
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Profit Margins */}
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Profit Margins</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                    <div className="panel" style={{ padding: '20px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '16px' }}>Current Margins (TTM)</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[
                          { label: 'Gross Margin', value: data.metrics?.metric?.grossMarginTTM, color: '#16a34a' },
                          { label: 'Operating Margin', value: data.metrics?.metric?.operatingMarginTTM, color: '#f97316' },
                          { label: 'Net Profit Margin', value: data.metrics?.metric?.netProfitMarginTTM, color: '#8b5cf6' },
                        ].map((margin, idx) => (
                          <div key={idx}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ fontSize: '13px', color: '#6b7280' }}>{margin.label}</span>
                              <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                                {margin.value ? `${(margin.value * 100).toFixed(2)}%` : '—'}
                              </span>
                            </div>
                            <div className="progress-bar">
                              <div
                                className="progress-fill"
                                style={{
                                  width: margin.value ? `${Math.min(margin.value * 100, 100)}%` : '0%',
                                  backgroundColor: margin.color,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="panel" style={{ padding: '20px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '16px' }}>Historical Margins</h4>
                      {historicalMetrics.margin.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={historicalMetrics.margin}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="period" tick={{ fill: '#6b7280', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                            <Tooltip
                              contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
                              formatter={(value) => value != null ? [`${Number(value).toFixed(2)}%`] : ['—']}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="gross" name="Gross Margin" stroke="#16a34a" strokeWidth={2} dot={{ fill: '#16a34a' }} />
                            <Line type="monotone" dataKey="net" name="Net Margin" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                          No historical data available
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Growth Metrics */}
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Growth Metrics</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    {[
                      { label: 'Revenue Growth (3Y)', value: data.metrics?.metric?.revenueGrowth3Y },
                      { label: 'Revenue Growth (5Y)', value: data.metrics?.metric?.revenueGrowth5Y },
                      { label: 'EPS Growth (3Y)', value: data.metrics?.metric?.epsGrowth3Y },
                      { label: 'EPS Growth (5Y)', value: data.metrics?.metric?.epsGrowth5Y },
                    ].map((metric, idx) => (
                      <div key={idx} className="metric-card">
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>{metric.label}</p>
                        <p style={{ 
                          fontSize: '1.5rem', 
                          fontWeight: 700, 
                          color: metric.value && metric.value > 0 ? '#16a34a' : metric.value && metric.value < 0 ? '#dc2626' : '#111827' 
                        }}>
                          {metric.value !== undefined && metric.value !== null ? `${metric.value > 0 ? '+' : ''}${(metric.value * 100).toFixed(1)}%` : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Valuation Section */}
            {activeSection === 'valuation' && (
              <div>
                {/* Valuation Ratios */}
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Valuation Ratios</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                    {[
                      { label: 'P/E (TTM)', value: data.metrics?.metric?.peTTM },
                      { label: 'P/E (Annual)', value: data.metrics?.metric?.peAnnual },
                      { label: 'P/B (Quarterly)', value: data.metrics?.metric?.pbQuarterly },
                      { label: 'P/S (TTM)', value: data.metrics?.metric?.priceToSalesTTM },
                      { label: 'P/CF (TTM)', value: data.metrics?.metric?.pcfRatioTTM },
                      { label: 'P/FCF (TTM)', value: data.metrics?.metric?.pfcfRatioTTM },
                    ].map((metric, idx) => (
                      <div key={idx} className="metric-card">
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>{metric.label}</p>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
                          {metric.value !== undefined && metric.value !== null ? fmt(metric.value) : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Historical P/E */}
                <div className="panel" style={{ padding: '20px', marginBottom: '32px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '16px' }}>Historical P/E Ratio</h4>
                  {historicalMetrics.pe.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={historicalMetrics.pe}>
                        <defs>
                          <linearGradient id="peGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="period" tick={{ fill: '#6b7280', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
                        <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#peGradient)" name="P/E Ratio" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                      No historical data available
                    </div>
                  )}
                </div>

                {/* Dividend Info */}
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Dividend Information</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    {[
                      { label: 'Dividend Yield', value: data.metrics?.metric?.dividendYieldIndicatedAnnual, suffix: '%' },
                      { label: 'Dividend Per Share', value: data.metrics?.metric?.dividendPerShareAnnual, prefix: '$' },
                      { label: 'Book Value/Share', value: data.metrics?.metric?.bookValuePerShareAnnual, prefix: '$' },
                      { label: 'Beta', value: data.metrics?.metric?.beta },
                    ].map((metric, idx) => (
                      <div key={idx} className="metric-card">
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>{metric.label}</p>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
                          {metric.value !== undefined && metric.value !== null
                            ? `${metric.prefix || ''}${fmt(metric.value)}${metric.suffix || ''}`
                            : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Analysts Section */}
            {activeSection === 'analysts' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                  {/* Rating Distribution */}
                  <div className="panel" style={{ padding: '20px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '16px' }}>Rating Distribution</h4>
                    {recommendationData.length > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <ResponsiveContainer width={160} height={160}>
                          <PieChart>
                            <Pie
                              data={recommendationData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={70}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {recommendationData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ flex: 1 }}>
                          {recommendationData.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                              <div style={{ width: 12, height: 12, borderRadius: '2px', background: item.color }} />
                              <span style={{ fontSize: '13px', color: '#6b7280', flex: 1 }}>{item.name}</span>
                              <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{item.value}</span>
                              <span style={{ fontSize: '12px', color: '#9ca3af' }}>({((item.value / totalRatings) * 100).toFixed(0)}%)</span>
                            </div>
                          ))}
                          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>Total Analysts: </span>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{totalRatings}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                        No rating data available
                      </div>
                    )}
                  </div>

                  {/* Price Target */}
                  <div className="panel" style={{ padding: '20px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '16px' }}>Price Target</h4>
                    {data.priceTarget ? (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                          <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Low</p>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>
                              ${fmt(data.priceTarget.targetLow)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Mean</p>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f97316' }}>
                              ${fmt(data.priceTarget.targetMean)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>High</p>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>
                              ${fmt(data.priceTarget.targetHigh)}
                            </p>
                          </div>
                        </div>
                        {/* Price Target Bar */}
                        <div style={{ position: 'relative', paddingTop: '16px' }}>
                          <div style={{ height: 8, background: 'linear-gradient(to right, #dc2626, #f97316, #16a34a)', borderRadius: 4 }} />
                          {data.quote && (
                            <div
                              style={{
                                position: 'absolute',
                                top: 8,
                                width: 2,
                                height: 24,
                                background: '#111827',
                                left: `${Math.min(Math.max(((data.quote.c - data.priceTarget.targetLow) / (data.priceTarget.targetHigh - data.priceTarget.targetLow)) * 100, 0), 100)}%`,
                              }}
                            >
                              <div style={{ position: 'absolute', top: -20, left: -30, fontSize: '11px', color: '#111827', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                Current: ${fmt(data.quote.c)}
                              </div>
                            </div>
                          )}
                        </div>
                        {data.quote && data.priceTarget.targetMean && (
                          <div style={{ marginTop: '24px', textAlign: 'center' }}>
                            <p style={{ fontSize: '14px', color: '#6b7280' }}>
                              Upside Potential:{' '}
                              <span style={{ fontWeight: 700, color: ((data.priceTarget.targetMean - data.quote.c) / data.quote.c) > 0 ? '#16a34a' : '#dc2626' }}>
                                {fmtPct(((data.priceTarget.targetMean - data.quote.c) / data.quote.c) * 100)}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                        No price target data available
                      </div>
                    )}
                  </div>
                </div>

                {/* Recommendation Trend */}
                <div className="panel" style={{ padding: '20px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '16px' }}>Recommendation Trend</h4>
                  {recommendationTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={recommendationTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="period" tick={{ fill: '#6b7280', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
                        <Legend />
                        <Bar dataKey="strongBuy" name="Strong Buy" stackId="a" fill={RATING_COLORS.strongBuy} />
                        <Bar dataKey="buy" name="Buy" stackId="a" fill={RATING_COLORS.buy} />
                        <Bar dataKey="hold" name="Hold" stackId="a" fill={RATING_COLORS.hold} />
                        <Bar dataKey="sell" name="Sell" stackId="a" fill={RATING_COLORS.sell} />
                        <Bar dataKey="strongSell" name="Strong Sell" stackId="a" fill={RATING_COLORS.strongSell} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                      No trend data available
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Ownership Section */}
            {activeSection === 'ownership' && (
              <div className="panel">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>Institutional Ownership</h3>
                </div>
                {data.ownership?.ownership && data.ownership.ownership.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Institution</th>
                        <th style={{ textAlign: 'right' }}>Shares</th>
                        <th style={{ textAlign: 'right' }}>Change</th>
                        <th style={{ textAlign: 'right' }}>Filing Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ownership.ownership.slice(0, 15).map((owner, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 500 }}>{owner.name}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(owner.share, 0)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', color: owner.change > 0 ? '#16a34a' : owner.change < 0 ? '#dc2626' : '#6b7280' }}>
                            {owner.change > 0 ? '+' : ''}{fmt(owner.change, 0)}
                          </td>
                          <td style={{ textAlign: 'right', color: '#6b7280' }}>{fmtDate(owner.filingDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
                    No institutional ownership data available
                  </div>
                )}
              </div>
            )}

            {/* Insider Trading Section */}
            {activeSection === 'insider' && (
              <div className="panel">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>Insider Transactions</h3>
                </div>
                {data.insider?.data && data.insider.data.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th style={{ textAlign: 'center' }}>Type</th>
                        <th style={{ textAlign: 'right' }}>Shares</th>
                        <th style={{ textAlign: 'right' }}>Price</th>
                        <th style={{ textAlign: 'right' }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.insider.data.slice(0, 20).map((transaction, idx) => {
                        const isBuy = transaction.transactionCode === 'P' || transaction.change > 0;
                        const transactionType = transaction.transactionCode === 'P' ? 'Buy' :
                          transaction.transactionCode === 'S' ? 'Sell' :
                          transaction.transactionCode === 'A' ? 'Award' :
                          transaction.transactionCode === 'M' ? 'Exercise' : transaction.transactionCode;
                        
                        return (
                          <tr key={idx}>
                            <td style={{ fontWeight: 500 }}>{transaction.name}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                fontSize: '12px',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                background: isBuy ? '#dcfce7' : '#fef2f2',
                                color: isBuy ? '#16a34a' : '#dc2626',
                                fontWeight: 600,
                              }}>
                                {transactionType}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                              {fmt(Math.abs(transaction.change), 0)}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                              {transaction.transactionPrice ? `$${fmt(transaction.transactionPrice)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', color: '#6b7280' }}>
                              {fmtDate(transaction.filingDate)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
                    No insider trading data available
                  </div>
                )}
              </div>
            )}

            {/* News Section */}
            {activeSection === 'news' && (
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Latest News</h3>
                {data.news && data.news.length > 0 ? (
                  <div style={{ display: 'grid', gap: '16px' }}>
                    {data.news.map((item, idx) => (
                      <a
                        key={idx}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="news-card"
                      >
                        <div style={{ display: 'flex', gap: '16px' }}>
                          {item.image && (
                            <img
                              src={item.image}
                              alt=""
                              style={{ width: 100, height: 80, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '8px', lineHeight: 1.4 }}>
                              {item.headline}
                            </h4>
                            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {item.summary}
                            </p>
                            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#9ca3af' }}>
                              <span>{item.source}</span>
                              <span>{new Date(item.datetime * 1000).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="panel" style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
                    No news available
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '48px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#9ca3af' }}>
            Data provided by Finnhub • Updated in real-time
          </p>
        </div>
      </div>
    </div>
  );
}
