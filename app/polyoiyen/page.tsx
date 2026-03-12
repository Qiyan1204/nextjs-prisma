"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import PolyHeader from "./PolyHeader";

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

interface PolyEvent {
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

const LIMIT = 12;
const TAG_OPTIONS = [
  "All", "Politics", "Sports", "Crypto", "Pop Culture",
  "Business", "Science", "Technology",
];
const LARGE_ORDER_THRESHOLD = 500; // default $500 for "large" orders

// ═══════════════════════════════════════════════════════
//  GLOBAL STYLES
// ═══════════════════════════════════════════════════════
const GLOBAL_CSS = `
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
    if (a.alertType !== "PRICE" || !a.active || a.triggered) return false;
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
                    {isTriggered ? "🔔 Triggered!" : "Active"}
                    {" · "}{new Date(a.createdAt).toLocaleDateString()}
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
              disabled={saving || (alertType === "PRICE" && (!targetPrice || Number(targetPrice) <= 0 || Number(targetPrice) >= 100))}
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

// ═══════════════════════════════════════════════════════
//  EVENT CARD
// ═══════════════════════════════════════════════════════
function EventCard({
  event,
  onSelect,
}: {
  event: PolyEvent;
  onSelect: (e: PolyEvent) => void;
}) {
  const market = getActiveMarket(event.markets);
  const prices = market ? parsePrices(market) : { yes: 0.5, no: 0.5 };
  const yesPct = Math.round(prices.yes * 100);

  return (
    <div className="mcard" onClick={() => onSelect(event)}>
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
function DetailPage({
  event,
  onBack,
}: {
  event: PolyEvent;
  onBack: () => void;
}) {
  const [side, setSide] = useState("YES");
  const [amount, setAmount] = useState("10");
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [userBets, setUserBets] = useState<UserBet[]>([]);
  const [loadingBets, setLoadingBets] = useState(true);
  const [largeOrders, setLargeOrders] = useState<LargeOrderItem[]>([]);
  const [detailTab, setDetailTab] = useState<"orderbook" | "positions">("orderbook");

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
            <div className="card" style={{ padding: "26px 26px 22px" }}>
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
function ListPage({ onSelect }: { onSelect: (e: PolyEvent) => void }) {
  const [events, setEvents] = useState<PolyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [tag, setTag] = useState("All");
  const [search, setSearch] = useState("");

  const fetchEvents = useCallback(
    async (currentOffset: number, append: boolean) => {
      append ? setLoadingMore(true) : setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(LIMIT),
          offset: String(currentOffset),
        });
        if (tag !== "All") params.set("tag", tag);

        const res = await fetch(`/api/polymarket?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data: PolyEvent[] = await res.json();

        if (data.length < LIMIT) setHasMore(false);
        setEvents((prev) => (append ? [...prev, ...data] : data));
        setOffset(currentOffset + data.length);
      } catch (err) {
        console.error("Fetch events error:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tag]
  );

  useEffect(() => {
    setEvents([]);
    setOffset(0);
    setHasMore(true);
    fetchEvents(0, false);
  }, [tag, fetchEvents]);

  function handleLoadMore() {
    fetchEvents(offset, true);
  }

  const displayed = search
    ? events.filter(
        (e) =>
          e.title.toLowerCase().includes(search.toLowerCase()) ||
          e.description?.toLowerCase().includes(search.toLowerCase()) ||
          e.tags?.some((t) => t.label.toLowerCase().includes(search.toLowerCase()))
      )
    : events;

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
                <EventCard key={e.id} event={e} onSelect={onSelect} />
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
  const [currentEvent, setCurrentEvent] = useState<PolyEvent | null>(null);

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {currentEvent ? (
        <DetailPage event={currentEvent} onBack={() => setCurrentEvent(null)} />
      ) : (
        <ListPage onSelect={setCurrentEvent} />
      )}
    </>
  );
}
