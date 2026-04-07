"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import PolyHeader from "./PolyHeader";
import { QUICK_MARKET_FILTERS } from "./shared/categoryConfig";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════
interface PolyMarket {
  outcomePrices: string;
  outcomes: string;
  groupItemTitle?: string;
  clobTokenIds?: string;
  conditionId?: string;
  active?: boolean;
  closed?: boolean;
}

export interface PolyEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  volume?: number;
  liquidity?: number;
  markets: PolyMarket[];
  tags?: { label: string; slug: string }[];
  image?: string;
  commentCount?: number;
}

interface UserBet {
  id: number;
  eventId: string;
  marketQuestion: string;
  side: string;
  amount: string;
  shares: string;
  price: string;
  createdAt: string;
}

interface UserAlert {
  id: number;
  eventId: string;
  tokenId: string;
  marketQuestion: string;
  alertType: string;
  side: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  cooldownMinutes?: number;
  lastNotifiedAt?: string | null;
  targetPrice: string | null;
  threshold: string | null;
  triggered: boolean;
  active: boolean;
  createdAt: string;
  triggeredAt: string | null;
}

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  image: string | null;
  publishedAt: string;
  source: { name: string; url?: string };
}

interface OrderBookEntry {
  price: string;
  size: string;
}

interface OrderBookData {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  market: string;
  asset_id: string;
  hash: string;
  timestamp: string;
}

interface LargeOrderItem {
  side: "BID" | "ASK";
  price: number;
  size: number;
  total: number;
}

interface PredictorsHistoryPoint {
  label: string;
  windowStart: string;
  windowEnd: string;
  uniquePredictors: number;
  tradeCount: number;
  notional: number;
}

interface PredictorsStats {
  conditionId: string;
  uniquePredictors: number;
  totalTrades: number;
  totalTradeNotional: number;
  marketVolume: number;
  averageTradeSizePerUser: number;
  averageObservedTradeSizePerUser: number;
  signal: "retail_hype" | "whale_accumulation" | "balanced";
  history: {
    daily: PredictorsHistoryPoint[];
    weekly: PredictorsHistoryPoint[];
  };
  analysisWindow: {
    daily: { startDate: string; endDate: string; days: number };
    weekly: { startDate: string; endDate: string; weeks: number };
  };
  diagnostics?: {
    fetchedTrades: number;
    scannedPages: number;
    pageSize: number;
    firstTradeDate: string | null;
    lastTradeDate: string | null;
    nonZeroDailyPoints: number;
    nonZeroWeeklyPoints: number;
    tradesInDailyWindow: number;
    tradesInWeeklyWindow: number;
  };
  fetchedAt: string;
}

interface VolatilityPoint {
  ts: number;
  timeLabel: string;
  windowStart: string;
  windowEnd: string;
  tradeCount: number;
  notional: number;
  yesTrades: number;
  noTrades: number;
  imbalanceRate: number;
  volatilityRate: number;
}

interface VolatilityResponse {
  range: "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";
  bucketSeconds: number;
  startTime: string;
  endTime: string;
  points: VolatilityPoint[];
}

interface VolatilityRatingPoint {
  ts: number;
  timeLabel: string;
  yesPrice: number | null;
  noPrice: number | null;
  yesStepScore: number;
  noStepScore: number;
}

interface VolatilityRatingSide {
  totalVolatilityRating: number;
  averageVolatilityRatingPerHour: number;
  totalHours: number;
  hoursWithPrice: number;
}

interface VolatilityRatingResponse {
  window: {
    startTime: string;
    endTime: string;
  };
  bucketSeconds: number;
  rule: string;
  metrics: {
    yes: VolatilityRatingSide;
    no: VolatilityRatingSide;
  };
  diagnostics?: {
    scannedPages: number;
    pageSize: number;
    fetchedTrades: number;
    yesPriceObservations: number;
    noPriceObservations: number;
  };
  points: VolatilityRatingPoint[];
  fetchedAt: string;
}

type VolatilityRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

function getRangeHours(range: VolatilityRange): number {
  switch (range) {
    case "1H":
      return 1;
    case "6H":
      return 6;
    case "1D":
      return 24;
    case "1W":
      return 7 * 24;
    case "1M":
      return 30 * 24;
    case "ALL":
      return 120 * 24;
    default:
      return 7 * 24;
  }
}

const LIMIT = 12;
const TAG_OPTIONS = [
  "All", "Politics", "Sports", "Crypto", "Pop Culture",
  "Business", "Science", "Technology",
];
const QUICK_FILTER_FETCH_LIMIT = 300;
const LARGE_ORDER_THRESHOLD = 500; // default $500 for "large" orders
const BOOKMARK_STORAGE_KEY = "polyoiyen-bookmarks-v1";

// ═══════════════════════════════════════════════════════
//  GLOBAL STYLES
// ═══════════════════════════════════════════════════════
export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --orange: #f97316; --orange2: #fb923c;
    --yes: #34d399; --yes-dim: rgba(52,211,153,0.12); --yes-bdr: rgba(52,211,153,0.28);
    --no: #f87171;  --no-dim: rgba(248,113,113,0.12);  --no-bdr: rgba(248,113,113,0.22);
    --surface: rgba(255,255,255,0.042);
    --bdr: rgba(255,255,255,0.08); --bdr-hi: rgba(255,255,255,0.13);
    --text: rgba(255,255,255,0.9); --muted: rgba(255,255,255,0.44); --dim: rgba(255,255,255,0.22);
    --bg: #160c03; --bg2: rgba(255,255,255,0.04);
    --warn: #fbbf24; --warn-dim: rgba(251,191,36,0.12); --warn-bdr: rgba(251,191,36,0.28);
  }
  body { background: var(--bg); }

  .card {
    background: rgba(255,255,255,0.04); border: 1px solid var(--bdr); border-radius: 16px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.09) inset, 0 -1px 0 rgba(0,0,0,0.45) inset,
      0 4px 14px rgba(0,0,0,0.38), 0 18px 44px rgba(0,0,0,0.26);
  }

  .nav {
    height: 58px; padding: 0 28px;
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(22,12,3,0.92); backdrop-filter: blur(18px);
    border-bottom: 1px solid rgba(255,255,255,0.07);
    position: sticky; top: 0; z-index: 200;
    box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset;
  }
  .nav-left { display: flex; align-items: center; gap: 8px; }
  .nav-logo { display: flex; align-items: center; gap: 7px; cursor: pointer; }
  .nav-logo-img { width: 28px; height: 28px; object-fit: contain; border-radius: 6px; }
  .nav-name { font-size: 15px; font-weight: 700; color: var(--orange); letter-spacing: -0.02em; font-family: 'DM Sans', sans-serif; }
  .nav-divider { color: var(--dim); font-size: 16px; margin: 0 2px; }
  .nav-section { font-size: 13px; font-weight: 600; color: var(--orange2); font-family: 'DM Sans', sans-serif; }
  .nav-links { display: flex; align-items: center; gap: 4px; }
  .nav-link {
    padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
    color: var(--muted); background: none; border: none; cursor: pointer;
    font-family: 'DM Sans', sans-serif; transition: all 0.15s; text-decoration: none;
    display: flex; align-items: center; gap: 5px;
  }
  .nav-link:hover { color: var(--text); background: rgba(255,255,255,0.05); }
  .nav-link.active { color: var(--orange); background: rgba(249,115,22,0.08); }

  .spin { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.28); border-top-color: white; border-radius: 50%; animation: sp 0.7s linear infinite; vertical-align: middle; margin-right: 6px; }
  @keyframes sp { to { transform: rotate(360deg); } }
  @keyframes pop { from { opacity:0; transform: scale(0.96) translateY(4px); } to { opacity:1; transform: scale(1) translateY(0); } }
  @keyframes alertPulse { 0%,100%{box-shadow: 0 0 0 0 rgba(251,191,36,0.4)} 50%{box-shadow: 0 0 12px 4px rgba(251,191,36,0.15)} }
  @keyframes carouselProgress { from { width: 0%; } to { width: 100%; } }

  .mcard {
    background: rgba(255,255,255,0.035); border: 1px solid var(--bdr);
    border-radius: 14px; padding: 20px; cursor: pointer; transition: all 0.18s;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3); position: relative; overflow: hidden;
    font-family: 'DM Sans', sans-serif; display:flex; flex-direction:column; gap:10px;
  }
  .mcard::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(52,211,153,0.2), transparent);
    opacity: 0; transition: opacity 0.2s;
  }
  .mcard:hover { border-color: rgba(52,211,153,0.25); transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
  .mcard:hover::before { opacity: 1; }

  /* ── Carousel ── */
  @keyframes carouselSlideIn {
    from { opacity: 0; transform: translateX(60px) scale(0.97); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }
  .carousel-wrap {
    position: relative; overflow: hidden; border-radius: 16px;
    background: linear-gradient(135deg, rgba(249,115,22,0.06), rgba(52,211,153,0.04));
    border: 1px solid rgba(249,115,22,0.18);
    box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04) inset;
  }
  .carousel-slide {
    animation: carouselSlideIn 0.45s cubic-bezier(0.16,1,0.3,1) both;
  }
  .carousel-dots {
    display: flex; gap: 8px; justify-content: center; padding: 12px 0 16px;
  }
  .carousel-dot {
    width: 28px; height: 4px; border-radius: 3px; border: none; cursor: pointer;
    transition: all 0.25s; background: rgba(255,255,255,0.12);
  }
  .carousel-dot.active {
    background: var(--orange); box-shadow: 0 0 8px rgba(249,115,22,0.4); width: 36px;
  }
  .carousel-progress {
    position: absolute; bottom: 0; left: 0; height: 3px;
    background: linear-gradient(90deg, var(--orange), var(--yes));
    border-radius: 0 2px 0 0;
    transition: width 0.3s linear;
  }
  .carousel-stat {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 8px 14px; border-radius: 10px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  }
  .carousel-nav-btn {
    position: absolute; top: 50%; transform: translateY(-50%);
    width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1);
    background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
    color: rgba(255,255,255,0.6); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; transition: all 0.2s; z-index: 5;
  }
  .carousel-nav-btn:hover { background: rgba(0,0,0,0.7); color: white; border-color: rgba(255,255,255,0.2); }

  /* ── Hero section layout ── */
  .hero-row {
    display: grid; grid-template-columns: 1fr 380px; gap: 16px; margin-bottom: 28;
  }
  @media (max-width: 960px) {
    .hero-row { grid-template-columns: 1fr !important; }
  }

  /* ── News ── */
  .news-panel {
    border-radius: 16px; overflow: hidden;
    background: rgba(255,255,255,0.04); border: 1px solid var(--bdr);
    box-shadow: 0 4px 24px rgba(0,0,0,0.35);
    display: flex; flex-direction: column;
  }
  .news-card {
    display: flex; gap: 10px; padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    transition: all 0.18s; cursor: pointer; text-decoration: none;
  }
  .news-card:hover {
    background: rgba(255,255,255,0.04);
  }
  .news-filter-btn {
    padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 600;
    cursor: pointer; font-family: 'DM Sans', sans-serif;
    border: 1px solid var(--bdr); background: rgba(255,255,255,0.03);
    color: var(--muted); transition: all 0.15s; white-space: nowrap;
  }
  .news-filter-btn.active {
    border-color: rgba(249,115,22,0.3); background: rgba(249,115,22,0.1); color: var(--orange2);
  }
`;

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function parsePrices(market: PolyMarket): { yes: number; no: number } {
  try {
    const prices = JSON.parse(market.outcomePrices || "[]");
    const yes = prices[0] !== undefined ? Number(prices[0]) : NaN;
    const no  = prices[1] !== undefined ? Number(prices[1]) : NaN;
    if (isNaN(yes) || isNaN(no)) return { yes: 0.5, no: 0.5 };
    return { yes, no };
  } catch {
    return { yes: 0.5, no: 0.5 };
  }
}

/** Pick the first open (not closed) market, falling back to the first market */
function getActiveMarket(markets: PolyMarket[] | undefined): PolyMarket | undefined {
  if (!markets || markets.length === 0) return undefined;
  return markets.find(m => !m.closed) || markets[0];
}

function parseTokenIds(market: PolyMarket): { yes: string; no: string } {
  try {
    const ids = JSON.parse(market.clobTokenIds || "[]");
    return { yes: ids[0] || "", no: ids[1] || "" };
  } catch {
    return { yes: "", no: "" };
  }
}

function formatVolume(v: number | undefined): string {
  if (!v) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatSize(s: number): string {
  if (s >= 1_000_000) return `${(s / 1_000_000).toFixed(1)}M`;
  if (s >= 1_000) return `${(s / 1_000).toFixed(1)}K`;
  return s.toFixed(1);
}

function formatMoney(v: number): string {
  if (!Number.isFinite(v)) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function zNormalize(values: number[]): number[] {
  const avg = mean(values);
  const sd = stdDev(values);
  if (sd === 0) return values.map(() => 0);
  return values.map((value) => (value - avg) / sd);
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : 0;
}

function computeLagTable(
  leader: number[],
  follower: number[],
  maxLag: number
): Array<{ lag: number; correlation: number; sampleSize: number }> {
  const table: Array<{ lag: number; correlation: number; sampleSize: number }> = [];
  const n = Math.min(leader.length, follower.length);
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const j = i + lag;
      if (j < 0 || j >= n) continue;
      a.push(leader[i]);
      b.push(follower[j]);
    }
    table.push({
      lag,
      correlation: pearson(a, b),
      sampleSize: a.length,
    });
  }
  return table;
}

// ═══════════════════════════════════════════════════════
//  SECTION HEADER (reusable)
// ═══════════════════════════════════════════════════════
function SectionTitle({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--orange2)", marginBottom: 12 }}>
      {icon} {text}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  ORDER BOOK COMPONENT
// ═══════════════════════════════════════════════════════
function OrderBookPanel({
  tokenId,
  largeOrderThreshold,
  onLargeOrders,
}: {
  tokenId: string;
  largeOrderThreshold: number;
  onLargeOrders: (items: LargeOrderItem[]) => void;
}) {
  const [book, setBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const prevLargeRef = useRef<string>("");

  const fetchBook = useCallback(async () => {
    if (!tokenId) return;
    try {
      const res = await fetch(`/api/polymarket/orderbook?token_id=${encodeURIComponent(tokenId)}`);
      if (!res.ok) throw new Error("Failed");
      const data: OrderBookData = await res.json();
      setBook(data);
      setError("");

      // detect large orders
      const largeItems: LargeOrderItem[] = [];
      for (const b of data.bids || []) {
        const sz = Number(b.size);
        const pr = Number(b.price);
        const total = sz * pr;
        if (total >= largeOrderThreshold) {
          largeItems.push({ side: "BID", price: pr, size: sz, total });
        }
      }
      for (const a of data.asks || []) {
        const sz = Number(a.size);
        const pr = Number(a.price);
        const total = sz * pr;
        if (total >= largeOrderThreshold) {
          largeItems.push({ side: "ASK", price: pr, size: sz, total });
        }
      }
      // Only fire callback when large orders change
      const sig = JSON.stringify(largeItems.map(l => `${l.side}${l.price}${l.size}`));
      if (sig !== prevLargeRef.current) {
        prevLargeRef.current = sig;
        onLargeOrders(largeItems);
      }
    } catch {
      setError("Could not load order book");
    } finally {
      setLoading(false);
    }
  }, [tokenId, largeOrderThreshold, onLargeOrders]);

  useEffect(() => {
    fetchBook();
    const interval = setInterval(fetchBook, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchBook]);

  if (!tokenId) {
    return <div style={{ fontSize: 13, color: "var(--dim)", padding: 12 }}>No token ID available for order book.</div>;
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: "var(--muted)", padding: 12 }}><span className="spin" /> Loading order book...</div>;
  }

  if (error || !book) {
    return <div style={{ fontSize: 13, color: "var(--no)", padding: 12 }}>{error || "No data"}</div>;
  }

  const bids = (book.bids || []).slice(0, 10).map(e => ({ price: Number(e.price), size: Number(e.size) }));
  const asks = (book.asks || []).slice(0, 10).map(e => ({ price: Number(e.price), size: Number(e.size) }));

  const maxBidSize = Math.max(...bids.map(b => b.size), 1);
  const maxAskSize = Math.max(...asks.map(a => a.size), 1);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {/* BIDS */}
        <div style={{ borderRight: "1px solid var(--bdr)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 70px", padding: "8px 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--yes)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span>Price</span><span style={{ textAlign: "right" }}>Size</span><span style={{ textAlign: "right" }}>Total</span>
          </div>
          {bids.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: "var(--dim)" }}>No bids</div>
          ) : bids.map((b, i) => {
            const fillPct = (b.size / maxBidSize) * 100;
            const isLarge = b.size * b.price >= largeOrderThreshold;
            return (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "70px 1fr 70px",
                padding: "5px 14px", fontFamily: "'DM Mono', monospace", fontSize: 11.5,
                borderBottom: "1px solid rgba(255,255,255,0.03)", position: "relative",
                background: isLarge ? "rgba(251,191,36,0.06)" : "transparent",
              }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${fillPct}%`, background: "var(--yes)", opacity: 0.06 }} />
                <span style={{ color: "var(--yes)", fontWeight: 500 }}>{(b.price * 100).toFixed(1)}¢</span>
                <span style={{ color: "var(--text)", textAlign: "right" }}>
                  {formatSize(b.size)}
                  {isLarge && <span style={{ color: "var(--warn)", marginLeft: 4, fontSize: 9 }}>🐋</span>}
                </span>
                <span style={{ color: "var(--dim)", textAlign: "right" }}>${(b.size * b.price).toFixed(0)}</span>
              </div>
            );
          })}
        </div>
        {/* ASKS */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 70px", padding: "8px 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--no)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span>Price</span><span style={{ textAlign: "right" }}>Size</span><span style={{ textAlign: "right" }}>Total</span>
          </div>
          {asks.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: "var(--dim)" }}>No asks</div>
          ) : asks.map((a, i) => {
            const fillPct = (a.size / maxAskSize) * 100;
            const isLarge = a.size * a.price >= largeOrderThreshold;
            return (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "70px 1fr 70px",
                padding: "5px 14px", fontFamily: "'DM Mono', monospace", fontSize: 11.5,
                borderBottom: "1px solid rgba(255,255,255,0.03)", position: "relative",
                background: isLarge ? "rgba(251,191,36,0.06)" : "transparent",
              }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${fillPct}%`, background: "var(--no)", opacity: 0.06 }} />
                <span style={{ color: "var(--no)", fontWeight: 500 }}>{(a.price * 100).toFixed(1)}¢</span>
                <span style={{ color: "var(--text)", textAlign: "right" }}>
                  {formatSize(a.size)}
                  {isLarge && <span style={{ color: "var(--warn)", marginLeft: 4, fontSize: 9 }}>🐋</span>}
                </span>
                <span style={{ color: "var(--dim)", textAlign: "right" }}>${(a.size * a.price).toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ padding: "8px 14px", fontSize: 10, color: "var(--dim)", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between" }}>
        <span>Spread: {bids[0] && asks[0] ? `${((asks[0].price - bids[0].price) * 100).toFixed(1)}¢` : "—"}</span>
        <span>🐋 = ${largeOrderThreshold}+ orders</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  ALERTS PANEL COMPONENT
// ═══════════════════════════════════════════════════════
function AlertsPanel({
  event,
  tokenIds,
  currentPrices,
}: {
  event: PolyEvent;
  tokenIds: { yes: string; no: string };
  currentPrices: { yes: number; no: number };
}) {
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [alertType, setAlertType] = useState<"PRICE" | "LARGE_ORDER">("PRICE");
  const [alertSide, setAlertSide] = useState("YES");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [cooldownMinutes, setCooldownMinutes] = useState("30");
  const [targetPrice, setTargetPrice] = useState("");
  const [threshold, setThreshold] = useState("500");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAlerts();
  }, []);

  async function fetchAlerts() {
    try {
      const res = await fetch(`/api/polyalerts?eventId=${encodeURIComponent(event.id)}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts);
      }
    } catch {
      // not logged in
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const tokenId = alertSide === "YES" ? tokenIds.yes : tokenIds.no;
      const res = await fetch("/api/polyalerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          tokenId,
          marketQuestion: event.title,
          alertType,
          side: alertSide,
          severity,
          cooldownMinutes: Number(cooldownMinutes),
          targetPrice: alertType === "PRICE" ? Number(targetPrice) / 100 : null,
          threshold: alertType === "LARGE_ORDER" ? Number(threshold) : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts(prev => [data.alert, ...prev]);
        setShowForm(false);
        setTargetPrice("");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create alert. Please login first.");
      }
    } catch {
      alert("Failed to create alert.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/polyalerts?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== id));
      }
    } catch {
      // ignore
    }
  }

  // Check if any price alerts are triggered based on current prices
  const triggeredAlerts = alerts.filter(a => {
    if (a.alertType !== "PRICE" || !a.active) return false;
    const curr = a.side === "YES" ? currentPrices.yes : currentPrices.no;
    const target = Number(a.targetPrice);
    return curr >= target;
  });

  return (
    <div>
      {/* Triggered alerts banner */}
      {triggeredAlerts.length > 0 && (
        <div style={{
          margin: "0 0 12px",
          padding: "10px 14px",
          background: "var(--warn-dim)",
          border: "1px solid var(--warn-bdr)",
          borderRadius: 10,
          animation: "alertPulse 2s ease-in-out infinite",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--warn)", marginBottom: 4 }}>
            🔔 PRICE ALERT TRIGGERED
          </div>
          {triggeredAlerts.map(a => (
            <div key={a.id} style={{ fontSize: 12, color: "var(--text)", marginTop: 4 }}>
              {a.side} price reached {(Number(a.targetPrice) * 100).toFixed(1)}¢ target!
            </div>
          ))}
        </div>
      )}

      {/* Active alerts list */}
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)", padding: 8 }}>
          <span className="spin" /> Loading alerts...
        </div>
      ) : alerts.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {alerts.map(a => {
            const isTriggered = triggeredAlerts.some(t => t.id === a.id);
            return (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", borderRadius: 8,
                background: isTriggered ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${isTriggered ? "var(--warn-bdr)" : "rgba(255,255,255,0.06)"}`,
              }}>
                <span style={{ fontSize: 14 }}>{a.alertType === "PRICE" ? "📈" : "🐋"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--text)", fontWeight: 600 }}>
                    {a.alertType === "PRICE"
                      ? `${a.side} → ${(Number(a.targetPrice) * 100).toFixed(1)}¢`
                      : `Large order ≥ $${Number(a.threshold).toFixed(0)} on ${a.side}`}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--dim)" }}>
                    {isTriggered ? "🔔 Trigger condition met" : "Watching"}
                    {" · "}Lv.{String(a.severity || "MEDIUM")}
                    {" · "}CD {Number(a.cooldownMinutes || 30)}m
                    {" · "}{new Date(a.createdAt).toLocaleDateString()}
                    {a.lastNotifiedAt ? ` · last ${new Date(a.lastNotifiedAt).toLocaleTimeString()}` : ""}
                  </div>
                </div>
                <button onClick={() => handleDelete(a.id)} style={{
                  background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
                  borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 10,
                  color: "var(--no)", fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                }}>✕</button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--dim)", padding: 8, marginBottom: 8 }}>
          No alerts set. Create one below.
        </div>
      )}

      {/* Add alert form */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{
          width: "100%", padding: "10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          border: "1px solid var(--warn-bdr)", background: "var(--warn-dim)",
          color: "var(--warn)", transition: "all 0.15s",
        }}>
          + Set New Alert
        </button>
      ) : (
        <div style={{
          padding: 14, borderRadius: 10,
          background: "rgba(255,255,255,0.03)", border: "1px solid var(--bdr)",
        }}>
          {/* Alert type toggle */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
            {(["PRICE", "LARGE_ORDER"] as const).map(t => (
              <button key={t} onClick={() => setAlertType(t)} style={{
                padding: "8px 0", borderRadius: 7, fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                border: alertType === t ? "1px solid var(--warn-bdr)" : "1px solid var(--bdr)",
                background: alertType === t ? "var(--warn-dim)" : "rgba(255,255,255,0.03)",
                color: alertType === t ? "var(--warn)" : "var(--muted)",
              }}>
                {t === "PRICE" ? "📈 Price Alert" : "🐋 Large Order"}
              </button>
            ))}
          </div>

          {/* Side toggle */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
            {["YES", "NO"].map(s => (
              <button key={s} onClick={() => setAlertSide(s)} style={{
                padding: "7px 0", borderRadius: 7, fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                border: alertSide === s
                  ? `1px solid ${s === "YES" ? "var(--yes-bdr)" : "var(--no-bdr)"}`
                  : "1px solid var(--bdr)",
                background: alertSide === s
                  ? (s === "YES" ? "var(--yes-dim)" : "var(--no-dim)")
                  : "rgba(255,255,255,0.03)",
                color: alertSide === s ? (s === "YES" ? "var(--yes)" : "var(--no)") : "var(--muted)",
              }}>
                {s}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>
                Alert Level
              </div>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--bdr)",
                  color: "white",
                  fontSize: 12,
                }}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>
                Cooldown (min)
              </div>
              <input
                type="number"
                min="1"
                max="1440"
                value={cooldownMinutes}
                onChange={(e) => setCooldownMinutes(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: "'DM Mono', monospace",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--bdr)",
                  color: "white",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {alertType === "PRICE" ? (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>
                Alert when price reaches (¢)
              </div>
              <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 6 }}>
                Current: {(( alertSide === "YES" ? currentPrices.yes : currentPrices.no) * 100).toFixed(1)}¢
              </div>
              <input
                type="number" min="1" max="99" step="1" placeholder="e.g. 75"
                value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14,
                  fontFamily: "'DM Mono', monospace", fontWeight: 600,
                  background: "rgba(255,255,255,0.05)", border: "1px solid var(--bdr)",
                  color: "white", outline: "none",
                }}
              />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>
                Alert when order size ≥ ($)
              </div>
              <input
                type="number" min="100" step="100" placeholder="e.g. 500"
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14,
                  fontFamily: "'DM Mono', monospace", fontWeight: 600,
                  background: "rgba(255,255,255,0.05)", border: "1px solid var(--bdr)",
                  color: "white", outline: "none",
                }}
              />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12 }}>
            <button onClick={() => setShowForm(false)} style={{
              padding: "9px 0", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              border: "1px solid var(--bdr)", background: "rgba(255,255,255,0.04)",
              color: "var(--muted)",
            }}>
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={
                saving ||
                Number(cooldownMinutes) < 1 ||
                Number(cooldownMinutes) > 1440 ||
                (alertType === "PRICE" && (!targetPrice || Number(targetPrice) <= 0 || Number(targetPrice) >= 100))
              }
              style={{
                padding: "9px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif",
                border: "none", background: "linear-gradient(135deg, #92400e, #fbbf24)",
                color: "white", opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? "Saving…" : "Create Alert"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  LARGE ORDER BANNER
// ═══════════════════════════════════════════════════════
function LargeOrderBanner({ items }: { items: LargeOrderItem[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{
      padding: "12px 16px", borderRadius: 10, marginBottom: 12,
      background: "rgba(251,191,36,0.06)", border: "1px solid var(--warn-bdr)",
      animation: "alertPulse 2s ease-in-out infinite",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--warn)", marginBottom: 8, letterSpacing: "0.08em" }}>
        🐋 LARGE ORDERS DETECTED
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8, fontSize: 12,
            padding: "6px 10px", borderRadius: 6,
            background: "rgba(255,255,255,0.03)",
          }}>
            <span style={{
              fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 4,
              background: item.side === "BID" ? "var(--yes-dim)" : "var(--no-dim)",
              color: item.side === "BID" ? "var(--yes)" : "var(--no)",
              border: `1px solid ${item.side === "BID" ? "var(--yes-bdr)" : "var(--no-bdr)"}`,
            }}>
              {item.side}
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--text)" }}>
              {formatSize(item.size)} shares @ {(item.price * 100).toFixed(1)}¢
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--warn)", fontWeight: 700, marginLeft: "auto" }}>
              ${item.total.toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PredictorsPerMarketPanel({
  conditionId,
  volume,
  tokenIds,
}: {
  conditionId?: string;
  volume?: number;
  tokenIds?: { yes: string; no: string };
}) {
  const [yesStats, setYesStats] = useState<PredictorsStats | null>(null);
  const [noStats, setNoStats] = useState<PredictorsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [interval, setInterval] = useState<"day" | "week">("day");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const cid = conditionId;
    const yesId = tokenIds?.yes || "";
    const noId = tokenIds?.no || "";

    if (!yesId || !noId) {
      setYesStats(null);
      setNoStats(null);
      setError("This market has incomplete CLOB token IDs, so YES/NO comparison cannot be loaded.");
      return;
    }

    let alive = true;
    async function fetchPredictors() {
      setLoading(true);
      setError("");
      try {
        const buildParams = (assetId: string) => {
          const params = new URLSearchParams();
          if (cid) params.set("conditionId", String(cid));
          params.set("assetIds", assetId);
          params.set("volume", String(volume || 0));
          params.set("limit", "250");
          params.set("maxPages", "60");
          return params;
        };

        const [yesRes, noRes] = await Promise.all([
          fetch(`/api/polymarket/predictors?${buildParams(yesId).toString()}`),
          fetch(`/api/polymarket/predictors?${buildParams(noId).toString()}`),
        ]);

        if (!yesRes.ok || !noRes.ok) {
          const failed = !yesRes.ok ? yesRes : noRes;
          let msg = "Failed to fetch YES/NO predictors metrics";
          try {
            const body = await failed.json();
            if (body?.error) msg = String(body.error);
          } catch {
            // ignore
          }
          throw new Error(msg);
        }

        const [yesData, noData]: [PredictorsStats, PredictorsStats] = await Promise.all([
          yesRes.json(),
          noRes.json(),
        ]);
        if (!alive) return;
        setYesStats(yesData);
        setNoStats(noData);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Could not load predictors metrics right now.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchPredictors();
    return () => {
      alive = false;
    };
  }, [conditionId, volume, tokenIds?.yes, tokenIds?.no]);

  const yesHistory = interval === "day" ? (yesStats?.history.daily || []) : (yesStats?.history.weekly || []);
  const noHistory = interval === "day" ? (noStats?.history.daily || []) : (noStats?.history.weekly || []);
  const maxPredictors = Math.max(
    ...yesHistory.map(h => h.uniquePredictors),
    ...noHistory.map(h => h.uniquePredictors),
    1
  );
  const rangeLabel = yesStats
    ? interval === "day"
      ? `${yesStats.analysisWindow.daily.startDate} to ${yesStats.analysisWindow.daily.endDate} (${yesStats.analysisWindow.daily.days} days)`
      : `${yesStats.analysisWindow.weekly.startDate} to ${yesStats.analysisWindow.weekly.endDate} (${yesStats.analysisWindow.weekly.weeks} weeks)`
    : "";
  const noDataInWindow = yesStats && noStats
    ? interval === "day"
      ? (yesStats.diagnostics?.tradesInDailyWindow || 0) + (noStats.diagnostics?.tradesInDailyWindow || 0) === 0
      : (yesStats.diagnostics?.tradesInWeeklyWindow || 0) + (noStats.diagnostics?.tradesInWeeklyWindow || 0) === 0
    : false;
  const hoveredYes = hoveredIndex != null ? yesHistory[hoveredIndex] : null;
  const hoveredNo = hoveredIndex != null
    ? noHistory[hoveredIndex] || {
        label: hoveredYes?.label || "",
        windowStart: hoveredYes?.windowStart || "",
        windowEnd: hoveredYes?.windowEnd || "",
        uniquePredictors: 0,
        tradeCount: 0,
        notional: 0,
      }
    : null;

  useEffect(() => {
    setHoveredIndex(null);
  }, [interval, yesHistory.length, noHistory.length]);

  return (
    <div className="card" style={{ padding: "20px 24px" }}>
      <SectionTitle icon="🧠" text="Predictors per Market" />

      {loading && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}><span className="spin" /> Loading predictors metrics...</div>
      )}

      {!loading && error && (
        <div style={{ fontSize: 13, color: "var(--no)" }}>{error}</div>
      )}

      {!loading && !error && yesStats && noStats && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {([
              ["day", "Daily view"],
              ["week", "Weekly view"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setInterval(key)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 7,
                  fontSize: 11,
                  fontWeight: 700,
                  border: interval === key ? "1px solid var(--yes-bdr)" : "1px solid var(--bdr)",
                  background: interval === key ? "var(--yes-dim)" : "rgba(255,255,255,0.03)",
                  color: interval === key ? "var(--yes)" : "var(--muted)",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{
            marginBottom: 12,
            padding: "9px 11px",
            borderRadius: 8,
            border: "1px solid var(--bdr)",
            background: "rgba(255,255,255,0.02)",
            fontSize: 11,
            color: "var(--muted)",
            fontFamily: "'DM Mono', monospace",
          }}>
            Analysis Window: {rangeLabel}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px,1fr))", gap: 10, marginBottom: 12 }}>
            {[
              { label: "YES Predictors", value: yesStats.uniquePredictors.toLocaleString() },
              { label: "NO Predictors", value: noStats.uniquePredictors.toLocaleString() },
              { label: "YES Trades", value: yesStats.totalTrades.toLocaleString() },
              { label: "NO Trades", value: noStats.totalTrades.toLocaleString() },
            ].map((item) => (
              <div key={item.label} style={{
                padding: "10px 12px", borderRadius: 9,
                background: "rgba(255,255,255,0.03)", border: "1px solid var(--bdr)",
              }}>
                <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, color: "var(--text)", fontWeight: 600 }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div style={{ padding: "9px 11px", borderRadius: 8, border: "1px solid var(--yes-bdr)", background: "var(--yes-dim)", color: "var(--yes)", fontSize: 11.5, fontWeight: 700 }}>
              YES Signal: {yesStats.signal}
            </div>
            <div style={{ padding: "9px 11px", borderRadius: 8, border: "1px solid var(--no-bdr)", background: "var(--no-dim)", color: "var(--no)", fontSize: 11.5, fontWeight: 700 }}>
              NO Signal: {noStats.signal}
            </div>
          </div>

          {noDataInWindow && (
            <div style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 9,
              background: "rgba(251,191,36,0.08)",
              border: "1px solid var(--warn-bdr)",
              color: "var(--warn)",
              fontSize: 11.5,
              lineHeight: 1.5,
            }}>
              Current window has no trades on both YES and NO sides, so chart values are 0.
              {yesStats.diagnostics?.lastTradeDate ? ` Last YES trade date: ${yesStats.diagnostics.lastTradeDate}.` : ""}
              {noStats.diagnostics?.lastTradeDate ? ` Last NO trade date: ${noStats.diagnostics.lastTradeDate}.` : ""}
            </div>
          )}

          {yesHistory.length > 0 || noHistory.length > 0 ? (
            <div>
              <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                Predictors per Market Chart YES vs NO ({interval === "day" ? "10-day view" : "10-week view"})
              </div>
              <div style={{
                height: 170,
                display: "flex",
                alignItems: "flex-end",
                gap: 6,
                padding: "10px 10px 6px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--bdr)",
              }}>
                {yesHistory.map((p, i) => {
                  const noPoint = noHistory[i] || {
                    label: p.label,
                    windowStart: p.windowStart,
                    windowEnd: p.windowEnd,
                    uniquePredictors: 0,
                    tradeCount: 0,
                    notional: 0,
                  };
                  const yesH = Math.max(8, Math.round((p.uniquePredictors / maxPredictors) * 130));
                  const noH = Math.max(8, Math.round((noPoint.uniquePredictors / maxPredictors) * 130));
                  return (
                    <div
                      key={`${p.windowStart}-${p.windowEnd}`}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex((current) => (current === i ? null : current))}
                      style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                    >
                      <div style={{ fontSize: 9, color: "var(--dim)", fontFamily: "'DM Mono', monospace" }}>
                        Y:{p.uniquePredictors} N:{noPoint.uniquePredictors}
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, width: "100%", justifyContent: "center" }}>
                        <div
                          title={`YES ${p.windowStart} ~ ${p.windowEnd} • ${p.uniquePredictors} predictors • ${p.tradeCount} trades`}
                          style={{
                            width: 10,
                            height: yesH,
                            borderRadius: "6px 6px 3px 3px",
                            background: "linear-gradient(180deg, #34d399 0%, #059669 100%)",
                            boxShadow: "0 3px 12px rgba(5,150,105,0.35)",
                          }}
                        />
                        <div
                          title={`NO ${noPoint.windowStart} ~ ${noPoint.windowEnd} • ${noPoint.uniquePredictors} predictors • ${noPoint.tradeCount} trades`}
                          style={{
                            width: 10,
                            height: noH,
                            borderRadius: "6px 6px 3px 3px",
                            background: "linear-gradient(180deg, #f87171 0%, #dc2626 100%)",
                            boxShadow: "0 3px 12px rgba(220,38,38,0.35)",
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 9, color: "var(--dim)", fontFamily: "'DM Mono', monospace" }}>{p.label}</div>
                    </div>
                  );
                })}
              </div>
              {hoveredYes && hoveredNo && (
                <div style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 9,
                  border: "1px solid var(--bdr)",
                  background: "rgba(255,255,255,0.03)",
                  fontSize: 11,
                  color: "var(--muted)",
                  fontFamily: "'DM Mono', monospace",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 8,
                }}>
                  <div style={{ color: "var(--text)", fontWeight: 600 }}>{hoveredYes.windowStart} ~ {hoveredYes.windowEnd}</div>
                  <div style={{ color: "var(--yes)" }}>YES: {hoveredYes.uniquePredictors} predictors · {hoveredYes.tradeCount} trades · {formatMoney(hoveredYes.notional)}</div>
                  <div style={{ color: "var(--no)" }}>NO: {hoveredNo.uniquePredictors} predictors · {hoveredNo.tradeCount} trades · {formatMoney(hoveredNo.notional)}</div>
                </div>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10.5 }}>
                <span style={{ color: "var(--yes)" }}>■ YES</span>
                <span style={{ color: "var(--no)" }}>■ NO</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--dim)" }}>No recent trades found for this market.</div>
          )}
        </>
      )}
    </div>
  );
}

function VolatilityClusterPanel({ tokenIds }: { tokenIds?: { yes: string; no: string } }) {
  const [range, setRange] = useState<VolatilityRange>("1W");
  const [clusterPoints, setClusterPoints] = useState<VolatilityPoint[]>([]);
  const [ratingPayload, setRatingPayload] = useState<VolatilityRatingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoveredClusterIndex, setHoveredClusterIndex] = useState<number | null>(null);
  const [hoveredRatingIndex, setHoveredRatingIndex] = useState<number | null>(null);

  useEffect(() => {
    const yesId = tokenIds?.yes || "";
    const noId = tokenIds?.no || "";
    if (!yesId || !noId) {
      setClusterPoints([]);
      setRatingPayload(null);
      setError("This market has incomplete CLOB token IDs, so Volatility Cluster cannot be loaded.");
      return;
    }

    let alive = true;
    async function fetchVolatility() {
      setLoading(true);
      setError("");
      try {
        const clusterParams = new URLSearchParams();
        clusterParams.set("yesAssetId", yesId);
        clusterParams.set("noAssetId", noId);
        clusterParams.set("range", range);
        clusterParams.set("limit", "300");
        clusterParams.set("maxPages", "120");

        const rangeHours = getRangeHours(range);
        const now = Date.now();
        const startTime = new Date(now - rangeHours * 3600 * 1000).toISOString();
        const endTime = new Date(now).toISOString();

        const ratingParams = new URLSearchParams();
        ratingParams.set("yesAssetId", yesId);
        ratingParams.set("noAssetId", noId);
        ratingParams.set("startTime", startTime);
        ratingParams.set("endTime", endTime);
        ratingParams.set("limit", "300");
        ratingParams.set("maxPages", "220");

        const [clusterRes, ratingRes] = await Promise.all([
          fetch(`/api/polymarket/volatility?${clusterParams.toString()}`),
          fetch(`/api/polymarket/volatility-rating?${ratingParams.toString()}`),
        ]);

        if (!clusterRes.ok) {
          let msg = "Failed to fetch volatility cluster";
          try {
            const body = await clusterRes.json();
            if (body?.error) msg = String(body.error);
          } catch {
            // ignore
          }
          throw new Error(msg);
        }

        if (!ratingRes.ok) {
          let msg = "Failed to fetch volatility rating";
          try {
            const body = await ratingRes.json();
            if (body?.error) msg = String(body.error);
          } catch {
            // ignore
          }
          throw new Error(msg);
        }

        const data: VolatilityResponse = await clusterRes.json();
        const ratingData: VolatilityRatingResponse = await ratingRes.json();
        if (!alive) return;
        setClusterPoints(Array.isArray(data.points) ? data.points : []);
        setRatingPayload(ratingData || null);
      } catch (e) {
        if (!alive) return;
        setClusterPoints([]);
        setRatingPayload(null);
        setError(e instanceof Error ? e.message : "Could not load volatility cluster data right now.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchVolatility();
    return () => {
      alive = false;
    };
  }, [range, tokenIds?.yes, tokenIds?.no]);

  useEffect(() => {
    setHoveredClusterIndex(null);
    setHoveredRatingIndex(null);
  }, [range, clusterPoints.length, ratingPayload?.points?.length]);

  const chartW = 860;
  const chartH = 250;
  const padL = 52;
  const padR = 18;
  const padT = 18;
  const padB = 44;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const maxValue = Math.max(...clusterPoints.map((p) => p.volatilityRate), 1);

  const linePoints = clusterPoints.map((p, i) => {
    const x = padL + (clusterPoints.length <= 1 ? plotW / 2 : (i / (clusterPoints.length - 1)) * plotW);
    const y = padT + (1 - p.volatilityRate / maxValue) * plotH;
    return { x, y, point: p };
  });

  const line = linePoints.map((pt) => `${pt.x},${pt.y}`).join(" ");
  const hovered = hoveredClusterIndex != null ? linePoints[hoveredClusterIndex] : null;

  const ratingPoints = ratingPayload?.points || [];
  const ratingChartH = 250;
  const ratingPlotH = ratingChartH - padT - padB;
  const yesMax = Math.max(...ratingPoints.map((p) => p.yesStepScore), 1);
  const noMax = Math.max(...ratingPoints.map((p) => p.noStepScore), 1);
  const ratingMax = Math.max(yesMax, noMax, 1);

  const ratingCoords = ratingPoints.map((p, i) => {
    const x = padL + (ratingPoints.length <= 1 ? plotW / 2 : (i / (ratingPoints.length - 1)) * plotW);
    const yYes = padT + (1 - p.yesStepScore / ratingMax) * ratingPlotH;
    const yNo = padT + (1 - p.noStepScore / ratingMax) * ratingPlotH;
    return { x, yYes, yNo, point: p, i };
  });

  const yesLine = ratingCoords.map((pt) => `${pt.x},${pt.yYes}`).join(" ");
  const noLine = ratingCoords.map((pt) => `${pt.x},${pt.yNo}`).join(" ");
  const hoveredRating = hoveredRatingIndex != null ? ratingCoords[hoveredRatingIndex] : null;
  const ratingYes = ratingPayload?.metrics.yes;
  const ratingNo = ratingPayload?.metrics.no;

  return (
    <div className="card" style={{ padding: "20px 24px" }}>
      <SectionTitle icon="📉" text="Volatility Cluster" />

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(["1H", "6H", "1D", "1W", "1M", "ALL"] as VolatilityRange[]).map((key) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            style={{
              padding: "7px 12px",
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 700,
              border: range === key ? "1px solid var(--yes-bdr)" : "1px solid var(--bdr)",
              background: range === key ? "var(--yes-dim)" : "rgba(255,255,255,0.03)",
              color: range === key ? "var(--yes)" : "var(--muted)",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {key}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 13, color: "var(--muted)" }}><span className="spin" /> Loading volatility data...</div>}
      {!loading && error && <div style={{ fontSize: 13, color: "var(--no)" }}>{error}</div>}

      {!loading && !error && clusterPoints.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
            Volatility Cluster Rate Line Chart ({range})
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--bdr)", borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
            <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", minWidth: 660, height: 250, display: "block" }}>
              {[0, 25, 50, 75, 100].map((tick) => {
                const y = padT + (1 - tick / 100) * plotH;
                return (
                  <g key={tick}>
                    <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                    <text x={padL - 8} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.36)" fontSize="10" fontFamily="'DM Mono', monospace">
                      {tick}
                    </text>
                  </g>
                );
              })}

              <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

              <polyline
                fill="none"
                stroke="#34d399"
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={line}
              />

              {linePoints.map((pt, i) => (
                <g
                  key={pt.point.ts}
                  onMouseEnter={() => setHoveredClusterIndex(i)}
                  onMouseLeave={() => setHoveredClusterIndex((current) => (current === i ? null : current))}
                >
                  <circle cx={pt.x} cy={pt.y} r={hoveredClusterIndex === i ? 4.2 : 2.6} fill="#34d399" opacity={hoveredClusterIndex === i ? 1 : 0.82} />
                </g>
              ))}

              {clusterPoints.map((p, i) => {
                const x = padL + (clusterPoints.length <= 1 ? plotW / 2 : (i / (clusterPoints.length - 1)) * plotW);
                if (i % Math.ceil(clusterPoints.length / 8) !== 0 && i !== clusterPoints.length - 1) return null;
                return (
                  <text
                    key={`${p.ts}-label`}
                    x={x}
                    y={padT + plotH + 16}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.36)"
                    fontSize="10"
                    fontFamily="'DM Mono', monospace"
                  >
                    {p.timeLabel}
                  </text>
                );
              })}
            </svg>
          </div>

          {hovered && (
            <div style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 9,
              border: "1px solid var(--bdr)",
              background: "rgba(255,255,255,0.03)",
              fontSize: 11,
              color: "var(--muted)",
              fontFamily: "'DM Mono', monospace",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 8,
            }}>
              <div style={{ color: "var(--text)", fontWeight: 600 }}>{hovered.point.windowStart} ~ {hovered.point.windowEnd}</div>
              <div style={{ color: "var(--yes)" }}>Volatility: {hovered.point.volatilityRate.toFixed(2)}</div>
              <div>Trades: {hovered.point.tradeCount} · Notional: {formatMoney(hovered.point.notional)}</div>
              <div>YES trades: {hovered.point.yesTrades} · NO trades: {hovered.point.noTrades}</div>
              <div>Imbalance: {hovered.point.imbalanceRate.toFixed(2)}%</div>
            </div>
          )}

          {ratingPayload && ratingYes && ratingNo && (
            <>
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10, marginBottom: 10 }}>
                <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--yes-bdr)", background: "var(--yes-dim)" }}>
                  <div style={{ fontSize: 10, color: "var(--yes)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>YES Volatility Rating</div>
                  <div style={{ color: "var(--yes)", fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 700 }}>{ratingYes.totalVolatilityRating.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>Avg/hour: <span style={{ color: "var(--text)", fontFamily: "'DM Mono', monospace" }}>{ratingYes.averageVolatilityRatingPerHour.toFixed(4)}</span></div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>Hours tracked: {ratingYes.totalHours}</div>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--no-bdr)", background: "var(--no-dim)" }}>
                  <div style={{ fontSize: 10, color: "var(--no)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>NO Volatility Rating</div>
                  <div style={{ color: "var(--no)", fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 700 }}>{ratingNo.totalVolatilityRating.toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>Avg/hour: <span style={{ color: "var(--text)", fontFamily: "'DM Mono', monospace" }}>{ratingNo.averageVolatilityRatingPerHour.toFixed(4)}</span></div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>Hours tracked: {ratingNo.totalHours}</div>
                </div>
              </div>

              <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                Hourly Volatility Rating Points ({range})
              </div>
              <div style={{ overflowX: "auto", border: "1px solid var(--bdr)", borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
                <svg viewBox={`0 0 ${chartW} ${ratingChartH}`} style={{ width: "100%", minWidth: 660, height: 250, display: "block" }}>
                  {[0, 25, 50, 75, 100].map((tick) => {
                    const y = padT + (1 - tick / 100) * ratingPlotH;
                    return (
                      <g key={tick}>
                        <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                        <text x={padL - 8} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.36)" fontSize="10" fontFamily="'DM Mono', monospace">
                          {Math.round((tick / 100) * ratingMax)}
                        </text>
                      </g>
                    );
                  })}

                  <line x1={padL} y1={padT + ratingPlotH} x2={padL + plotW} y2={padT + ratingPlotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  <line x1={padL} y1={padT} x2={padL} y2={padT + ratingPlotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

                  <polyline fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={yesLine} />
                  <polyline fill="none" stroke="#f87171" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={noLine} />

                  {ratingCoords.map((pt) => (
                    <g
                      key={pt.point.ts}
                      onMouseEnter={() => setHoveredRatingIndex(pt.i)}
                      onMouseLeave={() => setHoveredRatingIndex((current) => (current === pt.i ? null : current))}
                    >
                      <circle cx={pt.x} cy={pt.yYes} r={hoveredRatingIndex === pt.i ? 3.8 : 2.2} fill="#34d399" opacity={hoveredRatingIndex === pt.i ? 1 : 0.85} />
                      <circle cx={pt.x} cy={pt.yNo} r={hoveredRatingIndex === pt.i ? 3.8 : 2.2} fill="#f87171" opacity={hoveredRatingIndex === pt.i ? 1 : 0.85} />
                    </g>
                  ))}

                  {ratingPoints.map((p, i) => {
                    const x = padL + (ratingPoints.length <= 1 ? plotW / 2 : (i / (ratingPoints.length - 1)) * plotW);
                    if (i % Math.ceil(ratingPoints.length / 8) !== 0 && i !== ratingPoints.length - 1) return null;
                    return (
                      <text
                        key={`${p.ts}-rating-label`}
                        x={x}
                        y={padT + ratingPlotH + 16}
                        textAnchor="middle"
                        fill="rgba(255,255,255,0.36)"
                        fontSize="10"
                        fontFamily="'DM Mono', monospace"
                      >
                        {p.timeLabel}
                      </text>
                    );
                  })}
                </svg>
              </div>

              {hoveredRating && (
                <div style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 9,
                  border: "1px solid var(--bdr)",
                  background: "rgba(255,255,255,0.03)",
                  fontSize: 11,
                  color: "var(--muted)",
                  fontFamily: "'DM Mono', monospace",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 8,
                }}>
                  <div style={{ color: "var(--text)", fontWeight: 600 }}>{hoveredRating.point.timeLabel}</div>
                  <div style={{ color: "var(--yes)" }}>YES step: {hoveredRating.point.yesStepScore.toFixed(2)}</div>
                  <div style={{ color: "var(--no)" }}>NO step: {hoveredRating.point.noStepScore.toFixed(2)}</div>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10.5 }}>
                <span style={{ color: "var(--yes)" }}>■ YES hourly points</span>
                <span style={{ color: "var(--no)" }}>■ NO hourly points</span>
              </div>
            </>
          )}
        </>
      )}

      {!loading && !error && clusterPoints.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--dim)" }}>No volatility data found for this range.</div>
      )}
    </div>
  );
}

function SignalLeadLagPanel({ tokenIds }: { tokenIds?: { yes: string; no: string } }) {
  const [range, setRange] = useState<VolatilityRange>("1W");
  const [points, setPoints] = useState<VolatilityPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const yesId = tokenIds?.yes || "";
    const noId = tokenIds?.no || "";
    if (!yesId || !noId) {
      setPoints([]);
      setError("This market has incomplete CLOB token IDs, so Signal Lead-Lag cannot be loaded.");
      return;
    }

    let alive = true;
    async function fetchSignals() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("yesAssetId", yesId);
        params.set("noAssetId", noId);
        params.set("range", range);
        params.set("limit", "300");
        params.set("maxPages", "120");

        const res = await fetch(`/api/polymarket/volatility?${params.toString()}`);
        if (!res.ok) {
          let msg = "Failed to fetch signal data";
          try {
            const body = await res.json();
            if (body?.error) msg = String(body.error);
          } catch {
            // ignore
          }
          throw new Error(msg);
        }
        const data: VolatilityResponse = await res.json();
        if (!alive) return;
        setPoints(Array.isArray(data.points) ? data.points : []);
      } catch (e) {
        if (!alive) return;
        setPoints([]);
        setError(e instanceof Error ? e.message : "Could not load signal data right now.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchSignals();
    return () => {
      alive = false;
    };
  }, [range, tokenIds?.yes, tokenIds?.no]);

  useEffect(() => {
    setHoveredIndex(null);
  }, [range, points.length]);

  const imbalanceSeries = zNormalize(points.map((p) => p.imbalanceRate));
  const volatilitySeries = zNormalize(points.map((p) => p.volatilityRate));
  const maxLag = Math.min(12, Math.max(2, Math.floor(points.length / 4)));
  const lagTable = computeLagTable(imbalanceSeries, volatilitySeries, maxLag);
  const best = lagTable.reduce(
    (acc, row) => (Math.abs(row.correlation) > Math.abs(acc.correlation) ? row : acc),
    { lag: 0, correlation: 0, sampleSize: 0 }
  );
  const confidence = Math.abs(best.correlation);
  const confidenceLabel = confidence >= 0.65 ? "High" : confidence >= 0.4 ? "Medium" : "Low";
  const leadText =
    best.lag > 0
      ? `Imbalance leads Volatility by ${best.lag} bucket(s)`
      : best.lag < 0
        ? `Volatility leads Imbalance by ${Math.abs(best.lag)} bucket(s)`
        : "Signals mostly move in-sync (lag 0)";

  const chartW = 860;
  const chartH = 260;
  const padL = 52;
  const padR = 18;
  const padT = 18;
  const padB = 44;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const coords = points.map((point, i) => {
    const x = padL + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const yImbalance = padT + ((2.5 - Math.max(-2.5, Math.min(2.5, imbalanceSeries[i] || 0))) / 5) * plotH;
    const yVolatility = padT + ((2.5 - Math.max(-2.5, Math.min(2.5, volatilitySeries[i] || 0))) / 5) * plotH;
    return { x, yImbalance, yVolatility, point, i };
  });

  const imbalanceLine = coords.map((pt) => `${pt.x},${pt.yImbalance}`).join(" ");
  const volatilityLine = coords.map((pt) => `${pt.x},${pt.yVolatility}`).join(" ");
  const hovered = hoveredIndex != null ? coords[hoveredIndex] : null;

  return (
    <div className="card" style={{ padding: "20px 24px" }}>
      <SectionTitle icon="📡" text="Signal Lead-Lag Tracker" />

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(["1H", "6H", "1D", "1W", "1M", "ALL"] as VolatilityRange[]).map((key) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            style={{
              padding: "7px 12px",
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 700,
              border: range === key ? "1px solid var(--yes-bdr)" : "1px solid var(--bdr)",
              background: range === key ? "var(--yes-dim)" : "rgba(255,255,255,0.03)",
              color: range === key ? "var(--yes)" : "var(--muted)",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {key}
          </button>
        ))}
      </div>

      {loading && <div style={{ fontSize: 13, color: "var(--muted)" }}><span className="spin" /> Loading signal data...</div>}
      {!loading && error && <div style={{ fontSize: 13, color: "var(--no)" }}>{error}</div>}

      {!loading && !error && points.length > 1 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 10, marginBottom: 12 }}>
            <div style={{ padding: "10px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid var(--bdr)", fontSize: 11.5, color: "var(--muted)" }}>
              Best Lag: <span style={{ color: "var(--text)", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{best.lag}</span>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid var(--bdr)", fontSize: 11.5, color: "var(--muted)" }}>
              Correlation: <span style={{ color: "var(--text)", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{best.correlation.toFixed(3)}</span>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid var(--bdr)", fontSize: 11.5, color: "var(--muted)" }}>
              Confidence: <span style={{ color: "var(--yes)", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{confidenceLabel}</span>
            </div>
          </div>

          <div style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 9,
            border: "1px solid var(--bdr)",
            background: "rgba(255,255,255,0.02)",
            fontSize: 11,
            color: "var(--muted)",
            fontFamily: "'DM Mono', monospace",
          }}>
            {leadText}
          </div>

          <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
            Signal Lead-Lag Chart ({range})
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--bdr)", borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
            <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", minWidth: 660, height: 260, display: "block" }}>
              {[-2, -1, 0, 1, 2].map((tick) => {
                const y = padT + ((2.5 - tick) / 5) * plotH;
                return (
                  <g key={tick}>
                    <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                    <text x={padL - 8} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.36)" fontSize="10" fontFamily="'DM Mono', monospace">
                      {tick}
                    </text>
                  </g>
                );
              })}

              <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

              <polyline fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={imbalanceLine} />
              <polyline fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={volatilityLine} />

              {coords.map((pt) => (
                <g
                  key={pt.point.ts}
                  onMouseEnter={() => setHoveredIndex(pt.i)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === pt.i ? null : current))}
                >
                  <circle cx={pt.x} cy={pt.yImbalance} r={hoveredIndex === pt.i ? 3.8 : 2.3} fill="#f59e0b" opacity={hoveredIndex === pt.i ? 1 : 0.84} />
                  <circle cx={pt.x} cy={pt.yVolatility} r={hoveredIndex === pt.i ? 3.8 : 2.3} fill="#60a5fa" opacity={hoveredIndex === pt.i ? 1 : 0.84} />
                </g>
              ))}

              {points.map((p, i) => {
                const x = padL + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
                if (i % Math.ceil(points.length / 8) !== 0 && i !== points.length - 1) return null;
                return (
                  <text
                    key={`${p.ts}-signal-label`}
                    x={x}
                    y={padT + plotH + 16}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.36)"
                    fontSize="10"
                    fontFamily="'DM Mono', monospace"
                  >
                    {p.timeLabel}
                  </text>
                );
              })}
            </svg>
          </div>

          {hovered && (
            <div style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 9,
              border: "1px solid var(--bdr)",
              background: "rgba(255,255,255,0.03)",
              fontSize: 11,
              color: "var(--muted)",
              fontFamily: "'DM Mono', monospace",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 8,
            }}>
              <div style={{ color: "var(--text)", fontWeight: 600 }}>{hovered.point.windowStart} ~ {hovered.point.windowEnd}</div>
              <div style={{ color: "#f59e0b" }}>Imbalance z-score: {(imbalanceSeries[hovered.i] || 0).toFixed(3)}</div>
              <div style={{ color: "#60a5fa" }}>Volatility z-score: {(volatilitySeries[hovered.i] || 0).toFixed(3)}</div>
              <div>Imbalance rate: {hovered.point.imbalanceRate.toFixed(2)}%</div>
              <div>Volatility rate: {hovered.point.volatilityRate.toFixed(2)}</div>
            </div>
          )}

          <div style={{ marginTop: 12, overflowX: "auto", border: "1px solid var(--bdr)", borderRadius: 9 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", color: "var(--dim)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 10 }}>
                  <th style={{ padding: "9px 10px", textAlign: "left", borderBottom: "1px solid var(--bdr)" }}>Lag</th>
                  <th style={{ padding: "9px 10px", textAlign: "center", borderBottom: "1px solid var(--bdr)" }}>Correlation</th>
                  <th style={{ padding: "9px 10px", textAlign: "right", borderBottom: "1px solid var(--bdr)" }}>Samples</th>
                </tr>
              </thead>
              <tbody>
                {lagTable
                  .slice()
                  .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
                  .slice(0, 5)
                  .map((row) => (
                    <tr key={row.lag}>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>{row.lag}</td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", textAlign: "center", color: "var(--text)", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                        {row.correlation.toFixed(3)}
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", textAlign: "right", color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>{row.sampleSize}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && !error && points.length <= 1 && (
        <div style={{ fontSize: 12, color: "var(--dim)" }}>Not enough points to compute lag correlation for this range.</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  EVENT CARD
// ═══════════════════════════════════════════════════════
function EventCard({
  event,
  onSelect,
  isBookmarked,
  onToggleBookmark,
}: {
  event: PolyEvent;
  onSelect: (e: PolyEvent) => void;
  isBookmarked: boolean;
  onToggleBookmark: (e: PolyEvent) => void;
}) {
  const market = getActiveMarket(event.markets);
  const prices = market ? parsePrices(market) : { yes: 0.5, no: 0.5 };
  const yesPct = Math.round(prices.yes * 100);

  return (
    <div className="mcard" onClick={() => onSelect(event)}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleBookmark(event);
        }}
        aria-label={isBookmarked ? "Remove favorite" : "Add favorites"}
        title={isBookmarked ? "Remove favorite" : "Add favorites"}
        style={{
          position: "absolute",
          top: 0,
          right: 14,
          width: 28,
          height: 42,
          border: "none",
          cursor: "pointer",
          clipPath: "polygon(0 0,100% 0,100% 84%,50% 100%,0 84%)",
          background: isBookmarked
            ? "linear-gradient(180deg,#f59e0b 0%,#b45309 100%)"
            : "linear-gradient(180deg,rgba(255,255,255,0.22) 0%,rgba(255,255,255,0.08) 100%)",
          color: "white",
          boxShadow: isBookmarked
            ? "0 5px 14px rgba(245,158,11,0.35)"
            : "0 2px 8px rgba(0,0,0,0.24)",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
        }}
      >
        {isBookmarked ? "★" : "☆"}
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {event.image && (
          <img src={event.image} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
        )}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {event.tags?.slice(0, 3).map((t) => (
            <span key={t.slug} style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "2px 8px", borderRadius: 4,
              background: "rgba(249,115,22,0.1)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.2)",
            }}>{t.label}</span>
          ))}
        </div>
      </div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 14, lineHeight: 1.4, color: "white", minHeight: 40 }}>
        {event.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--yes)" }}>YES</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--yes)" }}>{yesPct}%</span>
        </div>
        <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 100, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${yesPct}%`, background: "linear-gradient(90deg,#059669,#34d399)", borderRadius: 4, transition: "width 0.5s" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--no)" }}>{100 - yesPct}%</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--no)" }}>NO</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, color: "var(--dim)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "3px 7px", borderRadius: 5 }}>
          📦 {formatVolume(event.volume)}
        </span>
        {event.endDate && (
          <span style={{ fontSize: 10.5, color: "var(--dim)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "3px 7px", borderRadius: 5 }}>
            ⏱ {new Date(event.endDate).toLocaleDateString()}
          </span>
        )}
        {event.markets && event.markets.length > 1 && (
          <span style={{ fontSize: 10.5, color: "var(--dim)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "3px 7px", borderRadius: 5 }}>
            📊 {event.markets.length} markets
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  DETAIL PAGE
// ═══════════════════════════════════════════════════════
export function DetailPage({
  event,
  onBack,
  isBookmarked,
  onToggleBookmark,
}: {
  event: PolyEvent;
  onBack: () => void;
  isBookmarked: boolean;
  onToggleBookmark: (e: PolyEvent) => void;
}) {
  const [side, setSide] = useState("YES");
  const [amount, setAmount] = useState("10");
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [loadingBets, setLoadingBets] = useState(true);
  const [largeOrders, setLargeOrders] = useState<LargeOrderItem[]>([]);
  const [detailTab, setDetailTab] = useState<"orderbook" | "positions">("orderbook");
  const [showPredictors, setShowPredictors] = useState(false);
  const [showVolatility, setShowVolatility] = useState(false);
  const [showSignal, setShowSignal] = useState(false);

  const market = getActiveMarket(event.markets);
  const prices = market ? parsePrices(market) : { yes: 0.5, no: 0.5 };
  const tokenIds = market ? parseTokenIds(market) : { yes: "", no: "" };
  const yesPct = Math.round(prices.yes * 100);
  const amtNum = parseFloat(amount) || 0;
  const currentPrice = side === "YES" ? prices.yes : prices.no;
  const sharesOut = currentPrice > 0 && amtNum > 0 ? amtNum / currentPrice : 0;

  // Use the YES token for order book by default
  const activeTokenId = tokenIds.yes;

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchUserBets();
  }, []);

  async function fetchUserBets() {
    try {
      const res = await fetch("/api/polybets");
      if (res.ok) {
        const data = await res.json();
        setUserBets(data.bets.filter((b: UserBet) => b.eventId === event.id));
      }
    } catch {
      // not logged in
    } finally {
      setLoadingBets(false);
    }
  }

  const KNOWN_CATEGORIES = ["Politics","Sports","Crypto","Pop Culture","Business","Finance","Science","Technology"];
  function pickCategory(tags?: { label: string }[]): string {
    if (!tags?.length) return "Other";
    for (const t of tags) {
      const found = KNOWN_CATEGORIES.find(c => c.toLowerCase() === t.label.toLowerCase());
      if (found) return found;
    }
    return tags[0].label || "Other";
  }

  async function handleTrade() {
    if (!amtNum || amtNum <= 0 || confirming) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/polybets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          marketQuestion: event.title,
          side,
          amount: amtNum,
          shares: sharesOut,
          price: currentPrice,
          type: "BUY",
          category: pickCategory(event.tags),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUserBets((prev) => [data.bet, ...prev]);
        setConfirmed(true);
        setTimeout(() => setConfirmed(false), 2800);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to place bet. Please login first.");
      }
    } catch {
      alert("Failed to place bet. Please check your connection.");
    } finally {
      setConfirming(false);
    }
  }

  const handleLargeOrders = useCallback((items: LargeOrderItem[]) => {
    setLargeOrders(items);
  }, []);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "white" }}>
      <PolyHeader active="Market">
        <button onClick={onBack} style={{
          display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500,
          color: "var(--muted)", background: "none", border: "none", cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif", padding: "6px 12px", borderRadius: 7, transition: "all 0.15s",
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          All Markets
        </button>
      </PolyHeader>

      <div style={{ maxWidth: 1260, margin: "0 auto", padding: "24px 28px 80px" }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 336px", gap: 20, alignItems: "start" }} className="detail-layout">
          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Market Header */}
            <div className="card" style={{ padding: "26px 26px 22px", position: "relative", overflow: "hidden" }}>
              {/* Bookmark ribbon button */}
              <button
                onClick={() => onToggleBookmark(event)}
                aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
                title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 16,
                  width: 32,
                  height: 50,
                  border: "none",
                  cursor: "pointer",
                  clipPath: "polygon(0 0,100% 0,100% 84%,50% 100%,0 84%)",
                  background: isBookmarked
                    ? "linear-gradient(180deg,#f59e0b 0%,#b45309 100%)"
                    : "linear-gradient(180deg,rgba(255,255,255,0.22) 0%,rgba(255,255,255,0.08) 100%)",
                  color: "white",
                  boxShadow: isBookmarked
                    ? "0 5px 14px rgba(245,158,11,0.35)"
                    : "0 2px 8px rgba(0,0,0,0.24)",
                  zIndex: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  transition: "background 0.2s",
                }}
              >
                {isBookmarked ? "★" : "☆"}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                {event.image && (
                  <img src={event.image} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" }} />
                )}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {event.tags?.slice(0, 4).map((t) => (
                    <span key={t.slug} style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                      padding: "2px 8px", borderRadius: 4,
                      background: "rgba(249,115,22,0.1)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.2)",
                    }}>{t.label}</span>
                  ))}
                </div>
              </div>
              <h1 style={{
                fontFamily: "'DM Serif Display', serif", fontSize: "clamp(18px,2.2vw,28px)",
                lineHeight: 1.25, letterSpacing: "-0.02em", color: "white", marginBottom: 18,
              }}>
                {event.title}
              </h1>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {[
                  { k: "Volume", v: formatVolume(event.volume) },
                  { k: "Liquidity", v: formatVolume(event.liquidity) },
                  { k: "End Date", v: event.endDate ? new Date(event.endDate).toLocaleDateString() : "N/A" },
                  { k: "Markets", v: String(event.markets?.length || 0) },
                ].map((m) => (
                  <div key={m.k} style={{
                    display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)",
                    background: "rgba(255,255,255,0.04)", border: "1px solid var(--bdr)",
                    padding: "4px 10px", borderRadius: 6,
                  }}>
                    <span>{m.k}</span>
                    <b style={{ color: "var(--text)", fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>{m.v}</b>
                  </div>
                ))}
              </div>
            </div>

            {/* Probability */}
            <div className="card" style={{ padding: "22px 24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "YES", pct: yesPct, price: prices.yes, cls: "yes" },
                  { label: "NO", pct: 100 - yesPct, price: prices.no, cls: "no" },
                ].map((s) => (
                  <div key={s.label} style={{
                    borderRadius: 12, padding: "16px 18px",
                    background: s.cls === "yes" ? "var(--yes-dim)" : "var(--no-dim)",
                    border: `1px solid ${s.cls === "yes" ? "var(--yes-bdr)" : "var(--no-bdr)"}`,
                    boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, color: s.cls === "yes" ? "var(--yes)" : "var(--no)" }}>{s.label}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 38, fontWeight: 500, lineHeight: 1, marginBottom: 4, color: s.cls === "yes" ? "var(--yes)" : "var(--no)" }}>{s.pct}%</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      Price: <b style={{ color: "var(--text)", fontFamily: "'DM Mono', monospace" }}>${s.price.toFixed(3)}</b> / share
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ height: 7, background: "rgba(255,255,255,0.06)", borderRadius: 100, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${yesPct}%`, background: "linear-gradient(90deg,#059669,#34d399)", borderRadius: 100, transition: "width 0.5s cubic-bezier(0.16,1,0.3,1)", boxShadow: "0 0 10px rgba(52,211,153,0.45)" }} />
              </div>
            </div>

            {/* Description */}
            {event.description && (
              <div className="card" style={{ padding: "20px 24px" }}>
                <SectionTitle icon="📊" text="Description" />
                <p style={{ fontSize: 13, lineHeight: 1.75, color: "rgba(255,255,255,0.65)" }}>{event.description}</p>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-start", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setShowPredictors(prev => !prev)}
                style={{
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: showPredictors ? "1px solid var(--yes-bdr)" : "1px solid var(--bdr)",
                  background: showPredictors ? "var(--yes-dim)" : "rgba(255,255,255,0.04)",
                  color: showPredictors ? "var(--yes)" : "var(--muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                }}
              >
                📈 Predictors per Market
              </button>

              <button
                onClick={() => setShowVolatility(prev => !prev)}
                style={{
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: showVolatility ? "1px solid var(--yes-bdr)" : "1px solid var(--bdr)",
                  background: showVolatility ? "var(--yes-dim)" : "rgba(255,255,255,0.04)",
                  color: showVolatility ? "var(--yes)" : "var(--muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                }}
              >
                📉 Volatility Cluster
              </button>

              <button
                onClick={() => setShowSignal(prev => !prev)}
                style={{
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: showSignal ? "1px solid var(--yes-bdr)" : "1px solid var(--bdr)",
                  background: showSignal ? "var(--yes-dim)" : "rgba(255,255,255,0.04)",
                  color: showSignal ? "var(--yes)" : "var(--muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                }}
              >
                📡 Signal Lead-Lag
              </button>
            </div>

            {showPredictors && (
              <PredictorsPerMarketPanel conditionId={market?.conditionId} volume={event.volume} tokenIds={tokenIds} />
            )}

            {showVolatility && (
              <VolatilityClusterPanel tokenIds={tokenIds} />
            )}

            {showSignal && (
              <SignalLeadLagPanel tokenIds={tokenIds} />
            )}

            {/* ORDER BOOK & POSITIONS TABS */}
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ display: "flex", borderBottom: "1px solid var(--bdr)" }}>
                {([["orderbook", "📗 Order Book"], ["positions", "🎯 Your Positions"]] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setDetailTab(key)} style={{
                    padding: "13px 18px", fontSize: 12, fontWeight: 600, background: "none",
                    border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    letterSpacing: "0.02em",
                    color: detailTab === key ? "var(--orange2)" : "var(--muted)",
                    borderBottom: `2px solid ${detailTab === key ? "var(--orange)" : "transparent"}`,
                    marginBottom: -1, transition: "all 0.15s",
                  }}>{label}</button>
                ))}
              </div>

              {detailTab === "orderbook" && (
                <OrderBookPanel
                  tokenId={activeTokenId}
                  largeOrderThreshold={LARGE_ORDER_THRESHOLD}
                  onLargeOrders={handleLargeOrders}
                />
              )}

              {detailTab === "positions" && (
                <div style={{ padding: "16px 20px" }}>
                  {loadingBets ? (
                    <div style={{ fontSize: 13, color: "var(--muted)", padding: 8 }}><span className="spin" /> Loading...</div>
                  ) : userBets.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--dim)", padding: 8 }}>No positions yet. Place a bet to get started!</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{
                        display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr",
                        padding: "8px 14px", fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}>
                        <span>Side</span>
                        <span style={{ textAlign: "right" }}>Amount</span>
                        <span style={{ textAlign: "right" }}>Shares</span>
                        <span style={{ textAlign: "right" }}>Price</span>
                        <span style={{ textAlign: "right" }}>Date</span>
                      </div>
                      {userBets.map((b) => (
                        <div key={b.id} style={{
                          display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr",
                          padding: "8px 14px", fontSize: 12, alignItems: "center",
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                        }}>
                          <span style={{
                            fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 4, width: "fit-content",
                            background: b.side === "YES" ? "var(--yes-dim)" : "var(--no-dim)",
                            color: b.side === "YES" ? "var(--yes)" : "var(--no)",
                            border: `1px solid ${b.side === "YES" ? "var(--yes-bdr)" : "var(--no-bdr)"}`,
                          }}>{b.side}</span>
                          <span style={{ color: "var(--text)", fontFamily: "'DM Mono', monospace", textAlign: "right" }}>${Number(b.amount).toFixed(2)}</span>
                          <span style={{ color: "var(--muted)", fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{Number(b.shares).toFixed(2)}</span>
                          <span style={{ color: "var(--muted)", fontFamily: "'DM Mono', monospace", textAlign: "right" }}>{(Number(b.price) * 100).toFixed(1)}¢</span>
                          <span style={{ color: "var(--dim)", fontFamily: "'DM Mono', monospace", fontSize: 10.5, textAlign: "right" }}>{new Date(b.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sub-markets if multiple */}
            {event.markets && event.markets.length > 1 && (
              <div className="card" style={{ padding: "20px 24px" }}>
                <SectionTitle icon="📊" text="All Markets in this Event" />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {event.markets.map((m, i) => {
                    const mp = parsePrices(m);
                    const yp = Math.round(mp.yes * 100);
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
                      }}>
                        <span style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{m.groupItemTitle || `Market ${i + 1}`}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "var(--yes)" }}>{yp}%</span>
                        <div style={{ width: 60, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 100, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${yp}%`, background: "linear-gradient(90deg,#059669,#34d399)", borderRadius: 100 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Large order banner after sub-markets */}
            <LargeOrderBanner items={largeOrders} />
          </div>

          {/* RIGHT PANEL: TRADE + ALERTS — single sticky scroll container */}
          <div style={{ position: "sticky", top: 72, maxHeight: "calc(100vh - 88px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Trade panel */}
            <div className="card">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
                {(["YES", "NO"] as const).map((s) => (
                  <button key={s} onClick={() => setSide(s)} style={{
                    padding: 15, fontSize: 14, fontWeight: 700, textAlign: "center", cursor: "pointer",
                    border: "none", fontFamily: "'DM Sans', sans-serif", transition: "all 0.18s", letterSpacing: "0.02em",
                    background: side === s ? (s === "YES" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)") : "rgba(255,255,255,0.03)",
                    color: side === s ? (s === "YES" ? "var(--yes)" : "var(--no)") : "var(--muted)",
                  }}>
                    {s === "YES" ? "🟢" : "🔴"}&nbsp; Buy {s}
                  </button>
                ))}
              </div>

              <div style={{ padding: "18px 18px 4px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>Amount (USD)</div>
                <div style={{
                  display: "flex", alignItems: "center",
                  background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)",
                  borderRadius: 10, overflow: "hidden", marginBottom: 10,
                }}>
                  <span style={{ padding: "11px 12px", color: "var(--muted)", fontSize: 14, fontWeight: 600, borderRight: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>$</span>
                  <input type="number" min="0" step="1" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)}
                    style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "11px 13px", fontSize: 20, fontWeight: 600, color: "white", fontFamily: "'DM Mono', monospace" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginBottom: 16 }}>
                  {["5", "10", "25", "50"].map((v) => (
                    <button key={v} onClick={() => setAmount(v)} style={{
                      padding: "6px 0", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif", border: "1px solid var(--bdr)",
                      background: "rgba(255,255,255,0.045)", color: "var(--muted)", transition: "all 0.14s",
                    }}>${v}</button>
                  ))}
                </div>

                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                  {[
                    { k: `Current ${side} price`, v: `${(currentPrice * 100).toFixed(2)}¢`, col: "" },
                    { k: "Shares received", v: amtNum > 0 ? sharesOut.toFixed(3) : "—", col: side === "YES" ? "var(--yes)" : "var(--no)" },
                    { k: "Payout if wins", v: amtNum > 0 ? `$${sharesOut.toFixed(2)}` : "—", col: "#fbbf24" },
                    { k: "Return if wins", v: amtNum > 0 && sharesOut > 0 ? `+${(((sharesOut / amtNum) - 1) * 100).toFixed(1)}%` : "—", col: "#fbbf24" },
                  ].map((r) => (
                    <div key={r.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3.5px 0" }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.k}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12.5, color: r.col || "var(--text)", fontWeight: 500 }}>{r.v}</span>
                    </div>
                  ))}
                </div>

                <button onClick={handleTrade} disabled={confirming || amtNum <= 0} style={{
                  width: "100%", padding: 13, borderRadius: 10, fontSize: 14, fontWeight: 700,
                  cursor: confirming || amtNum <= 0 ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif",
                  border: "none", transition: "all 0.18s", opacity: (confirming || amtNum <= 0) ? 0.45 : 1,
                  background: side === "YES" ? "linear-gradient(135deg,#065f46,#34d399)" : "linear-gradient(135deg,#7f1d1d,#f87171)",
                  color: "white",
                  boxShadow: side === "YES" ? "0 1px 0 rgba(255,255,255,0.18) inset, 0 5px 18px rgba(52,211,153,0.28)" : "0 1px 0 rgba(255,255,255,0.18) inset, 0 5px 18px rgba(248,113,113,0.28)",
                }}>
                  {confirming ? <><span className="spin" />Confirming…</> : `Buy ${side} · $${amtNum > 0 ? amtNum.toFixed(2) : "0.00"}`}
                </button>

                {confirmed && (
                  <div style={{
                    marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    background: "rgba(52,211,153,0.09)", border: "1px solid rgba(52,211,153,0.22)",
                    borderRadius: 9, padding: 11, color: "#34d399", fontSize: 12.5, fontWeight: 600,
                    animation: "pop 0.3s cubic-bezier(0.16,1,0.3,1)",
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    Bet placed & saved!
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--bdr)", padding: "14px 18px", fontSize: 11, color: "var(--dim)", lineHeight: 1.65 }}>
                Bets are saved to your account and persist across sessions.
              </div>
            </div>

            {/* ALERTS PANEL - inside the same sticky container */}
            <div className="card" style={{ padding: "20px 20px" }}>
              <SectionTitle icon="🔔" text="Alerts" />
              <AlertsPanel event={event} tokenIds={tokenIds} currentPrices={prices} />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .detail-layout { grid-template-columns: 1fr !important; }
          .detail-layout > div:last-child { position: static !important; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  TOP EVENTS CAROUSEL
// ═══════════════════════════════════════════════════════
function TopEventsCarousel({ events, onSelect }: { events: PolyEvent[]; onSelect: (e: PolyEvent) => void }) {
  const top5 = [...events]
    .filter(e => e.markets?.length > 0 && (e.volume || 0) > 0)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, 5);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (resumeRef.current) { clearTimeout(resumeRef.current); resumeRef.current = null; }
  }, []);

  const startAutoplay = useCallback(() => {
    clearTimers();
    timerRef.current = setInterval(() => {
      setIdx(prev => (prev + 1) % top5.length);
    }, 3000);
  }, [top5.length, clearTimers]);

  useEffect(() => {
    if (top5.length === 0) return;
    if (!paused) startAutoplay();
    return clearTimers;
  }, [paused, startAutoplay, top5.length, clearTimers]);

  const handleMouseEnter = () => {
    setPaused(true);
    clearTimers();
  };

  const handleMouseLeave = () => {
    clearTimers();
    resumeRef.current = setTimeout(() => {
      setPaused(false);
    }, 1000);
  };

  const goTo = (i: number) => {
    setIdx(i);
    if (!paused) startAutoplay();
  };

  if (top5.length === 0) return null;

  const ev = top5[idx];
  const market = getActiveMarket(ev.markets);
  const prices = market ? parsePrices(market) : { yes: 0.5, no: 0.5 };
  const yesPct = Math.round(prices.yes * 100);

  return (
    <div
      className="carousel-wrap"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header */}
      <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--orange)", background: "rgba(249,115,22,0.12)", padding: "3px 10px", borderRadius: 5, border: "1px solid rgba(249,115,22,0.2)" }}>🔥 HOT</span>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>Top {top5.length} Most Traded Events</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: "var(--dim)", fontFamily: "'DM Mono', monospace" }}>{idx + 1}/{top5.length}</span>
          {paused && <span style={{ fontSize: 9, color: "var(--warn)", fontWeight: 700, marginLeft: 4 }}>⏸ PAUSED</span>}
        </div>
      </div>

      {/* Nav arrows */}
      <button className="carousel-nav-btn" style={{ left: 10 }} onClick={(e) => { e.stopPropagation(); goTo((idx - 1 + top5.length) % top5.length); }}>‹</button>
      <button className="carousel-nav-btn" style={{ right: 10 }} onClick={(e) => { e.stopPropagation(); goTo((idx + 1) % top5.length); }}>›</button>

      {/* Main slide content */}
      <div
        key={idx}
        className="carousel-slide"
        onClick={() => onSelect(ev)}
        style={{ cursor: "pointer", padding: "14px 20px 10px" }}
      >
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          {/* Image */}
          {ev.image && (
            <div style={{ flexShrink: 0 }}>
              <img src={ev.image} alt="" style={{ width: 90, height: 90, borderRadius: 14, objectFit: "cover", border: "1px solid rgba(255,255,255,0.08)" }} />
              <div style={{ textAlign: "center", marginTop: 6 }}>
                <span style={{ fontSize: 9, color: "var(--dim)", fontFamily: "'DM Mono', monospace" }}>#{idx + 1} Trending</span>
              </div>
            </div>
          )}

          {/* Event info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
              {ev.tags?.slice(0, 3).map(t => (
                <span key={t.slug} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, background: "rgba(249,115,22,0.1)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.2)" }}>{t.label}</span>
              ))}
            </div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, lineHeight: 1.25, color: "white", marginBottom: 8 }}>
              {ev.title}
            </div>

            {/* Description */}
            {ev.description && (
              <div style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,0.5)", marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                {ev.description}
              </div>
            )}

            {/* Probability bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "var(--yes)" }}>YES</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700, color: "var(--yes)", lineHeight: 1 }}>{yesPct}%</span>
                </div>
                <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 100, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${yesPct}%`, background: "linear-gradient(90deg,#059669,#34d399)", borderRadius: 100, transition: "width 0.5s", boxShadow: "0 0 12px rgba(52,211,153,0.3)" }} />
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700, color: "var(--no)", lineHeight: 1 }}>{100 - yesPct}%</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "var(--no)" }}>NO</span>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="carousel-stat">
                <span style={{ fontSize: 9, color: "var(--dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Volume</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{formatVolume(ev.volume)}</span>
              </div>
              <div className="carousel-stat">
                <span style={{ fontSize: 9, color: "var(--dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Liquidity</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{formatVolume(ev.liquidity)}</span>
              </div>
              <div className="carousel-stat">
                <span style={{ fontSize: 9, color: "var(--dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Markets</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{ev.markets?.length || 0}</span>
              </div>
              {ev.endDate && (
                <div className="carousel-stat">
                  <span style={{ fontSize: 9, color: "var(--dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Ends</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{new Date(ev.endDate).toLocaleDateString()}</span>
                </div>
              )}
              <div className="carousel-stat" style={{ marginLeft: "auto", background: "var(--yes-dim)", border: "1px solid var(--yes-bdr)" }}>
                <span style={{ fontSize: 9, color: "var(--yes)", letterSpacing: "0.06em", textTransform: "uppercase" }}>YES Price</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--yes)" }}>{(prices.yes * 100).toFixed(1)}¢</span>
              </div>
              <div className="carousel-stat" style={{ background: "var(--no-dim)", border: "1px solid var(--no-bdr)" }}>
                <span style={{ fontSize: 9, color: "var(--no)", letterSpacing: "0.06em", textTransform: "uppercase" }}>NO Price</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--no)" }}>{(prices.no * 100).toFixed(1)}¢</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dots */}
      <div className="carousel-dots">
        {top5.map((_, i) => (
          <button
            key={i}
            className={`carousel-dot${i === idx ? " active" : ""}`}
            onClick={(e) => { e.stopPropagation(); goTo(i); }}
          />
        ))}
      </div>

      {/* Progress bar */}
      {!paused && (
        <div
          className="carousel-progress"
          key={`p-${idx}`}
          style={{
            animation: "carouselProgress 3s linear",
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  NEWS SECTION
// ═══════════════════════════════════════════════════════
const NEWS_CATEGORIES: { label: string; value: string }[] = [
  { label: "🔥 Top", value: "general" },
  { label: "⚡ Breaking", value: "breaking-news" },
  { label: "💰 Finance", value: "business" },
  { label: "🏛️ Politics", value: "nation" },
  { label: "🌍 World", value: "world" },
  { label: "🔬 Science", value: "science" },
  { label: "💻 Tech", value: "technology" },
  { label: "⚽ Sports", value: "sports" },
];

function NewsSection() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("general");
  const [showCount, setShowCount] = useState(3);

  useEffect(() => {
    setLoading(true);
    setShowCount(3);
    async function fetchNews() {
      try {
        const res = await fetch(`/api/news?category=${encodeURIComponent(category)}&max=10`);
        if (res.ok) {
          const data = await res.json();
          setArticles((data.articles || []).filter((a: NewsArticle) => a.title && a.title !== "[Removed]"));
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchNews();
  }, [category]);

  const shown = articles.slice(0, showCount);

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="news-panel" style={{ height: "100%" }}>
      {/* Header with filters */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--orange2)" }}>
            📰 News
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {NEWS_CATEGORIES.map(c => (
            <button
              key={c.value}
              className={`news-filter-btn${category === c.value ? " active" : ""}`}
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Articles list */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
            <span className="spin" /><span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>Loading…</span>
          </div>
        ) : articles.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", fontSize: 12, color: "var(--dim)" }}>No news available.</div>
        ) : (
          <>
            {shown.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="news-card"
              >
                {a.image && (
                  <img
                    src={a.image}
                    alt=""
                    style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.4, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                    {a.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--dim)" }}>
                    <span style={{ fontWeight: 700, color: "var(--orange2)" }}>{a.source.name}</span>
                    <span>·</span>
                    <span>{timeAgo(a.publishedAt)}</span>
                  </div>
                </div>
              </a>
            ))}
            {showCount < articles.length && (
              <button
                onClick={() => setShowCount(prev => Math.min(prev + 3, articles.length))}
                style={{
                  display: "block", width: "calc(100% - 24px)", margin: "8px 12px", padding: "8px 0",
                  borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", border: "1px solid var(--bdr)",
                  background: "rgba(255,255,255,0.04)", color: "var(--muted)", transition: "all 0.15s",
                }}
              >
                Load More ({articles.length - showCount} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  LIST PAGE
// ═══════════════════════════════════════════════════════
function ListPage({
  onSelect,
  bookmarkedIds,
  bookmarkedEvents,
  setBookmarkedEvents,
  toggleBookmark,
}: {
  onSelect: (e: PolyEvent) => void;
  bookmarkedIds: string[];
  bookmarkedEvents: Record<string, PolyEvent>;
  setBookmarkedEvents: React.Dispatch<React.SetStateAction<Record<string, PolyEvent>>>;
  toggleBookmark: (e: PolyEvent) => void;
}) {
  const [events, setEvents] = useState<PolyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [tag, setTag] = useState("All");
  const [search, setSearch] = useState("");
  const [bookmarkFilter, setBookmarkFilter] = useState(false);
  const [quickMarket, setQuickMarket] = useState("All");

  // Sync newly-loaded events into bookmarkedEvents cache
  useEffect(() => {
    if (bookmarkedIds.length === 0) return;
    setBookmarkedEvents((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const e of events) {
        if (bookmarkedIds.includes(e.id) && !next[e.id]) {
          next[e.id] = e;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [events, bookmarkedIds, setBookmarkedEvents]);

  const fetchEvents = useCallback(
    async (currentOffset: number, append: boolean) => {
      append ? setLoadingMore(true) : setLoading(true);
      try {
        const quickFilter = QUICK_MARKET_FILTERS.find((f) => f.label === quickMarket);
        const usingQuickFilter = quickMarket !== "All";
        const requestLimit = usingQuickFilter ? QUICK_FILTER_FETCH_LIMIT : LIMIT;
        const requestOffset = usingQuickFilter ? 0 : currentOffset;

        let data: PolyEvent[] = [];

        if (usingQuickFilter && quickFilter && quickFilter.tagSlugs.length > 0) {
          const perSlugLimit = Math.max(60, Math.floor(requestLimit / quickFilter.tagSlugs.length));
          const fetched = await Promise.all(
            quickFilter.tagSlugs.map(async (slug) => {
              const quickParams = new URLSearchParams({
                limit: String(perSlugLimit),
                offset: "0",
                tagSlug: slug,
              });
              const quickRes = await fetch(`/api/polymarket?${quickParams.toString()}`);
              if (!quickRes.ok) return [] as PolyEvent[];
              const quickData = await quickRes.json();
              return Array.isArray(quickData)
                ? (quickData as PolyEvent[])
                : Array.isArray(quickData?.events)
                  ? (quickData.events as PolyEvent[])
                  : [];
            })
          );

          const deduped = new Map<string, PolyEvent>();
          fetched.flat().forEach((event) => {
            if (event?.id && !deduped.has(event.id)) deduped.set(event.id, event);
          });
          data = Array.from(deduped.values());
        } else {
          const params = new URLSearchParams({
            limit: String(requestLimit),
            offset: String(requestOffset),
          });
          if (tag !== "All") params.set("tag", tag);

          const res = await fetch(`/api/polymarket?${params.toString()}`);
          if (!res.ok) throw new Error("Failed to fetch");
          const raw = await res.json();
          data = Array.isArray(raw) ? raw : Array.isArray(raw?.events) ? raw.events : [];
        }

        if (usingQuickFilter) {
          setHasMore(false);
          setEvents(data);
          setOffset(data.length);
        } else {
          if (data.length < LIMIT) setHasMore(false);
          setEvents((prev) => (append ? [...prev, ...data] : data));
          setOffset(currentOffset + data.length);
        }
      } catch (err) {
        console.error("Fetch events error:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tag, quickMarket]
  );

  useEffect(() => {
    setEvents([]);
    setOffset(0);
    setHasMore(true);
    fetchEvents(0, false);
  }, [tag, quickMarket, fetchEvents]);

  function handleLoadMore() {
    fetchEvents(offset, true);
  }

  const sourceEvents = bookmarkFilter
    ? bookmarkedIds
        .map((id) => bookmarkedEvents[id])
        .filter((e): e is PolyEvent => Boolean(e))
    : events;

  const displayed = sourceEvents.filter((e) => {
    const text = `${e.title} ${e.description || ""} ${e.slug || ""} ${(e.tags || [])
      .map((t) => `${t.label || ""} ${t.slug || ""}`)
      .join(" ")}`.toLowerCase();

    const searchMatch =
      !search ||
      text.includes(search.toLowerCase());

    const quickFilter = QUICK_MARKET_FILTERS.find((f) => f.label === quickMarket);
    const quickMatch =
      quickMarket === "All" ||
      (quickFilter
        ? quickFilter.tagSlugs.some((slug) => text.includes(slug.toLowerCase())) ||
          quickFilter.signals.some((signal) => text.includes(signal.toLowerCase())) ||
          quickFilter.keywords.some((kw) => text.includes(kw.toLowerCase()))
        : true);

    return searchMatch && quickMatch;
  });

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "white" }}>
      <PolyHeader active="Market">
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--orange)" }}>{events.length}</div>
            <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Loaded</div>
          </div>
          <a
            href="https://discord.gg/T4dpAgqhsy"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: "#5865F2", color: "white", textDecoration: "none",
              border: "1px solid rgba(88,101,242,0.6)",
              boxShadow: "0 2px 10px rgba(88,101,242,0.35)",
              fontFamily: "'DM Sans', sans-serif", transition: "all 0.18s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#4752c4")}
            onMouseLeave={e => (e.currentTarget.style.background = "#5865F2")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Join Discord
          </a>
        </div>
      </PolyHeader>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ marginBottom: 36 }}>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif", fontSize: "clamp(28px,4vw,48px)",
            fontWeight: 400, lineHeight: 1.1, letterSpacing: "-0.03em", color: "white", marginBottom: 8,
          }}>
            Trade on what <span style={{ color: "var(--orange)" }}>matters most</span>
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)" }}>
            Real prediction markets from Polymarket. Browse, filter, and place bets.
          </p>
        </div>

        {/* ── Hot Events Carousel + News side by side ── */}
        <div className="hero-row" style={{ marginBottom: 28 }}>
          <TopEventsCarousel events={events} onSelect={onSelect} />
          <NewsSection />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 28, flexWrap: "wrap" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.04)", border: "1px solid var(--bdr)",
            borderRadius: 10, padding: "9px 14px", flex: 1, minWidth: 200,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input placeholder="Search loaded markets…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "var(--text)", fontFamily: "'DM Sans', sans-serif", width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button
              onClick={() => setBookmarkFilter((v) => !v)}
              style={{
                position: "relative",
                padding: "7px 14px 7px 18px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                border: bookmarkFilter ? "1px solid rgba(245,158,11,0.55)" : "1px solid var(--bdr)",
                background: bookmarkFilter
                  ? "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(180,83,9,0.18))"
                  : "rgba(255,255,255,0.04)",
                color: bookmarkFilter ? "#fbbf24" : "var(--muted)",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 9,
                  background: bookmarkFilter ? "#b45309" : "rgba(255,255,255,0.18)",
                  clipPath: "polygon(0 0,100% 0,100% 100%,50% 86%,0 100%)",
                }}
              />
              🔖 ({bookmarkedIds.length})
            </button>

            {TAG_OPTIONS.map((t) => (
              <button key={t} onClick={() => setTag(t)} style={{
                padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: tag === t ? "1px solid var(--yes-bdr)" : "1px solid var(--bdr)",
                background: tag === t ? "var(--yes-dim)" : "rgba(255,255,255,0.04)",
                color: tag === t ? "var(--yes)" : "var(--muted)", cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
              }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Quick Markets</span>
          <button
            onClick={() => setQuickMarket("All")}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              border: quickMarket === "All" ? "1px solid var(--orange2)" : "1px solid var(--bdr)",
              background: quickMarket === "All" ? "rgba(249,115,22,0.12)" : "rgba(255,255,255,0.03)",
              color: quickMarket === "All" ? "var(--orange2)" : "var(--muted)",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            All
          </button>
          {QUICK_MARKET_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => {
                setQuickMarket(f.label);
                setSearch("");
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                border: quickMarket === f.label ? "1px solid var(--orange2)" : "1px solid var(--bdr)",
                background: quickMarket === f.label ? "rgba(249,115,22,0.12)" : "rgba(255,255,255,0.03)",
                color: quickMarket === f.label ? "var(--orange2)" : "var(--muted)",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: "var(--dim)", fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>
          {loading ? "Loading…" : `${displayed.length} market${displayed.length !== 1 ? "s" : ""} loaded`}
        </div>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <span className="spin" style={{ width: 24, height: 24 }} />
          </div>
        )}

        {!loading && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {displayed.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  onSelect={onSelect}
                  isBookmarked={bookmarkedIds.includes(e.id)}
                  onToggleBookmark={toggleBookmark}
                />
              ))}
            </div>

            {displayed.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--dim)", fontSize: 14 }}>
                No markets found. Try a different filter.
              </div>
            )}

            {hasMore && !search && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 32 }}>
                <button onClick={handleLoadMore} disabled={loadingMore} style={{
                  padding: "12px 36px", borderRadius: 10, fontSize: 14, fontWeight: 700,
                  cursor: loadingMore ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif",
                  border: "1px solid var(--yes-bdr)", background: "var(--yes-dim)",
                  color: "var(--yes)", transition: "all 0.18s", opacity: loadingMore ? 0.6 : 1,
                }}>
                  {loadingMore ? <><span className="spin" />Loading…</> : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  ROOT — ROUTER
// ═══════════════════════════════════════════════════════
export default function App() {
  const router = useRouter();
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [bookmarkedEvents, setBookmarkedEvents] = useState<Record<string, PolyEvent>>({});
  const bookmarkSaveReady = useRef(false);

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOOKMARK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ids?: string[]; events?: Record<string, PolyEvent> };
        if (Array.isArray(parsed.ids)) setBookmarkedIds(parsed.ids);
        if (parsed.events && typeof parsed.events === "object") setBookmarkedEvents(parsed.events);
      }
    } catch { /* ignore invalid data */ }
  }, []);

  // Save bookmarks to localStorage — skip the very first run (initial mount with empty state)
  // so we don't overwrite the just-loaded data before the state updates propagate.
  useEffect(() => {
    if (!bookmarkSaveReady.current) {
      bookmarkSaveReady.current = true;
      return;
    }
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify({ ids: bookmarkedIds, events: bookmarkedEvents }));
  }, [bookmarkedIds, bookmarkedEvents]);

  function toggleBookmark(event: PolyEvent) {
    const isOn = bookmarkedIds.includes(event.id);
    setBookmarkedIds((prev) => (isOn ? prev.filter((id) => id !== event.id) : [event.id, ...prev]));
    setBookmarkedEvents((prev) => {
      if (isOn) { const next = { ...prev }; delete next[event.id]; return next; }
      return { ...prev, [event.id]: event };
    });
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <ListPage
        onSelect={(event) => router.push(`/polyoiyen/${encodeURIComponent(event.id)}`)}
        bookmarkedIds={bookmarkedIds}
        bookmarkedEvents={bookmarkedEvents}
        setBookmarkedEvents={setBookmarkedEvents}
        toggleBookmark={toggleBookmark}
      />
    </>
  );
}
