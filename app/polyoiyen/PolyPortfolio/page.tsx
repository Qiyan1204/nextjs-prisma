"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import PolyHeader from "../PolyHeader";

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface Position {
  eventId: string;
  marketQuestion: string;
  eventTitle?: string;
  side: string;
  category: string;
  netShares: number;
  avgPrice: number;
  totalInvested: number;
  realizedPL: number;
}

interface BetRow {
  id: number;
  eventId: string;
  marketQuestion: string;
  eventTitle?: string;
  side: string;
  type: string;
  amount: number;
  shares: number;
  price: number;
  category: string;
  createdAt: string;
}

interface PriceInfo {
  yesPrice: number;
  noPrice: number;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function fmt$(v: number): string {
  return v >= 0 ? `$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`;
}
function fmtPct(v: number): string {
  const s = (v * 100).toFixed(1);
  return v >= 0 ? `+${s}%` : `${s}%`;
}
function timeStr(d: string): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  Politics: "#f97316",
  Sports: "#34d399",
  Crypto: "#a78bfa",
  "Pop Culture": "#ec4899",
  Business: "#7b5a07",
  Finance: "#facc15",
  Science: "#38bdf8",
  Technology: "#818cf8",
  Other: "#94a3b8",
};
const CATEGORY_EMOJI: Record<string, string> = {
  Politics: "🟧",
  Sports: "🟩",
  Crypto: "🟪",
  "Pop Culture": "🟥",
  Business: "🟨",
  Finance: "💰",
  Science: "🩵",
  Technology: "🔵",
  Other: "⬜",
};
function catColor(cat: string): string {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
}
function catEmoji(cat: string): string {
  return CATEGORY_EMOJI[cat] || CATEGORY_EMOJI.Other;
}

/* ─── PieChart (SVG) with hover tooltip ───────────────────────────────────── */
function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const [hover, setHover] = useState<{ label: string; pct: string; color: string; x: number; y: number } | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  let cumulativePercent = 0;
  const slices = data.map((d) => {
    const pct = d.value / total;
    const startAngle = cumulativePercent * 2 * Math.PI;
    cumulativePercent += pct;
    const endAngle = cumulativePercent * 2 * Math.PI;
    const largeArc = pct > 0.5 ? 1 : 0;
    const x1 = 50 + 40 * Math.cos(startAngle - Math.PI / 2);
    const y1 = 50 + 40 * Math.sin(startAngle - Math.PI / 2);
    const x2 = 50 + 40 * Math.cos(endAngle - Math.PI / 2);
    const y2 = 50 + 40 * Math.sin(endAngle - Math.PI / 2);

    const handleMouse = (e: React.MouseEvent) => {
      const rect = (e.currentTarget as SVGElement).closest("svg")?.getBoundingClientRect();
      if (!rect) return;
      setHover({
        label: d.label,
        pct: (pct * 100).toFixed(1),
        color: d.color,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10,
      });
    };
    const props = {
      onMouseMove: handleMouse,
      onMouseEnter: handleMouse,
      onMouseLeave: () => setHover(null),
      style: { cursor: "pointer", transition: "opacity 0.15s", opacity: hover && hover.label !== d.label ? 0.55 : 1 },
    };

    if (pct >= 0.9999) {
      return <circle key={d.label} cx="50" cy="50" r="40" fill={d.color} {...props} />;
    }
    return (
      <path
        key={d.label}
        d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={d.color}
        {...props}
      />
    );
  });

  return (
    <div style={{ position: "relative", width: 180, height: 180, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" width="180" height="180">
        {slices}
        {/* Center hole for donut effect */}
        <circle cx="50" cy="50" r="22" fill="#160c03" />
      </svg>
      {/* Tooltip */}
      {hover && (
        <div style={{
          position: "absolute",
          left: hover.x, top: hover.y,
          transform: "translate(-50%, -100%)",
          background: "rgba(28,16,8,0.95)",
          border: `1px solid ${hover.color}55`,
          borderRadius: 8,
          padding: "6px 12px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: hover.color }}>
            {catEmoji(hover.label)} {hover.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "white", marginLeft: 8 }}>
            {hover.pct}%
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Trade Modal ─────────────────────────────────────────────────────────── */
interface TradeModalProps {
  position: Position;
  currentPrice: number;
  mode: "BUY" | "SELL";
  onClose: () => void;
  onTrade: (type: string, shares: number, amount: number, price: number) => Promise<boolean>;
}

function TradeModal({ position, currentPrice, mode, onClose, onTrade }: TradeModalProps) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const amtNum = Number(amount) || 0;

  const isBuy = mode === "BUY";
  const sharesCalc = currentPrice > 0 ? amtNum / currentPrice : 0;
  // For SELL: user enters shares to sell, amount = shares * currentPrice
  const [sellShares, setSellShares] = useState("");
  const sellSharesNum = Number(sellShares) || 0;
  const sellAmount = sellSharesNum * currentPrice;

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      let ok: boolean;
      if (isBuy) {
        if (amtNum <= 0) { setError("Enter a valid amount"); setSubmitting(false); return; }
        ok = await onTrade("BUY", sharesCalc, amtNum, currentPrice);
      } else {
        if (sellSharesNum <= 0) { setError("Enter shares to sell"); setSubmitting(false); return; }
        if (sellSharesNum > position.netShares) { setError(`Max ${position.netShares.toFixed(3)} shares`); setSubmitting(false); return; }
        ok = await onTrade("SELL", sellSharesNum, sellAmount, currentPrice);
      }
      if (ok) onClose();
    } catch {
      setError("Transaction failed");
    }
    setSubmitting(false);
  }

  const accent = position.side === "YES" ? "#34d399" : "#f87171";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#1c1008", border: "1px solid rgba(249,115,22,0.2)",
        borderRadius: 16, padding: "28px 24px", width: 360, maxWidth: "90vw",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: accent }}>
            {isBuy ? "Buy More" : "Sell"} {position.side}
          </h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.4)",
            fontSize: 20, cursor: "pointer",
          }}>×</button>
        </div>

        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
          {position.eventTitle || position.marketQuestion}
        </div>

        <div style={{
          fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6,
          fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          Current Price: {(currentPrice * 100).toFixed(1)}¢
        </div>

        {isBuy ? (
          <>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, marginTop: 12,
            }}>Amount (USD)</div>
            <div style={{
              display: "flex", alignItems: "center",
              background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)",
              borderRadius: 10, overflow: "hidden", marginBottom: 10,
            }}>
              <span style={{ padding: "10px 12px", color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: 600, borderRight: "1px solid rgba(255,255,255,0.08)" }}>$</span>
              <input type="number" min="0" step="1" placeholder="0" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "10px 13px", fontSize: 18, fontWeight: 600, color: "white", fontFamily: "'DM Mono', monospace" }} />
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
              ≈ {sharesCalc.toFixed(3)} shares
            </div>
          </>
        ) : (
          <>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, marginTop: 12,
            }}>Shares to Sell (max: {position.netShares.toFixed(3)})</div>
            <input type="number" min="0" step="0.001" placeholder="0" value={sellShares}
              onChange={(e) => setSellShares(e.target.value)}
              style={{
                width: "100%", background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)",
                borderRadius: 10, padding: "10px 13px", fontSize: 18, fontWeight: 600, color: "white",
                fontFamily: "'DM Mono', monospace", outline: "none", marginBottom: 6,
              }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[0.25, 0.5, 0.75, 1].map((frac) => (
                <button key={frac} onClick={() => setSellShares((position.netShares * frac).toFixed(3))}
                  style={{
                    flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
                    cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>{frac === 1 ? "MAX" : `${frac * 100}%`}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
              ≈ {fmt$(sellAmount)} proceeds
            </div>
          </>
        )}

        {error && (
          <div style={{ fontSize: 12, color: "#f87171", marginBottom: 10 }}>{error}</div>
        )}

        <button onClick={handleSubmit} disabled={submitting} style={{
          width: "100%", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700,
          cursor: submitting ? "not-allowed" : "pointer",
          border: "none", opacity: submitting ? 0.5 : 1,
          background: isBuy
            ? "linear-gradient(135deg,#065f46,#34d399)"
            : "linear-gradient(135deg,#7f1d1d,#f87171)",
          color: "white", fontFamily: "'DM Sans', sans-serif",
        }}>
          {submitting ? "Processing…" : isBuy ? `Buy ${position.side}` : `Sell ${position.side}`}
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
export default function PolyPortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [bets, setBets] = useState<BetRow[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [loading, setLoading] = useState(true);
  const [tradeTarget, setTradeTarget] = useState<{ pos: Position; mode: "BUY" | "SELL" } | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"ALL" | "BUY" | "SELL" >("ALL");

  // Fetch positions + bets
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/polybets?positions=true");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setPositions(data.positions ?? []);
      setBets(data.bets ?? []);
    } catch {
      // not logged in or error
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch live prices for each unique eventId
  const fetchPrices = useCallback(async (posList: Position[]) => {
    const eventIds = [...new Set(posList.filter((p) => p.netShares > 0).map((p) => p.eventId))];
    const results: Record<string, PriceInfo> = {};
    await Promise.all(
      eventIds.map(async (id) => {
        try {
          const res = await fetch(`/api/polymarket?id=${encodeURIComponent(id)}`);
          if (!res.ok) return;
          const data = await res.json();
          const events = data.events ?? (Array.isArray(data) ? data : []);
          const ev = events.find((e: { id: string }) => String(e.id) === String(id));
          if (!ev?.markets) return;
          const mkt = ev.markets.find((m: { closed?: boolean }) => !m.closed) ?? ev.markets[0];
          if (!mkt?.outcomePrices) return;
          const parsed: number[] = JSON.parse(mkt.outcomePrices).map(Number);
          if (parsed.length >= 2 && !isNaN(parsed[0]) && !isNaN(parsed[1])) {
            results[id] = { yesPrice: parsed[0], noPrice: parsed[1] };
          }
        } catch { /* ignore */ }
      })
    );
    setPrices((prev) => ({ ...prev, ...results }));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (positions.length > 0) fetchPrices(positions);
  }, [positions, fetchPrices]);

  // Derived data
  const activePositions = useMemo(
    () => positions.filter((p) => p.netShares > 0),
    [positions]
  );

  const totalUnrealizedPL = useMemo(() => {
    return activePositions.reduce((sum, p) => {
      const info = prices[p.eventId];
      if (!info) return sum;
      const cp = p.side === "YES" ? info.yesPrice : info.noPrice;
      return sum + (cp - p.avgPrice) * p.netShares;
    }, 0);
  }, [activePositions, prices]);

  const totalRealizedPL = useMemo(
    () => positions.reduce((sum, p) => sum + p.realizedPL, 0),
    [positions]
  );

  const totalPotentialPayout = useMemo(
    () => activePositions.reduce((sum, p) => sum + p.netShares * 1.0, 0),
    [activePositions]
  );

  const totalInvested = useMemo(
    () => activePositions.reduce((sum, p) => sum + p.avgPrice * p.netShares, 0),
    [activePositions]
  );

  // Category breakdown
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of activePositions) {
      const invested = p.avgPrice * p.netShares;
      map[p.category] = (map[p.category] || 0) + invested;
    }
    return Object.entries(map)
      .map(([label, value]) => ({ label, value, color: catColor(label) }))
      .sort((a, b) => b.value - a.value);
  }, [activePositions]);

  // Trade handler
  async function handleTrade(type: string, shares: number, amount: number, price: number): Promise<boolean> {
    if (!tradeTarget) return false;
    const { pos } = tradeTarget;
    try {
      const res = await fetch("/api/polybets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: pos.eventId,
          marketQuestion: pos.marketQuestion,
          side: pos.side,
          type,
          amount,
          shares,
          price,
          category: pos.category,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed");
        return false;
      }
      await fetchData();
      return true;
    } catch {
      return false;
    }
  }

  // Filtered history
  const filteredBets = useMemo(() => {
    if (historyFilter === "ALL") return bets;
    return bets.filter((b) => b.type === historyFilter);
  }, [bets, historyFilter]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #160c03 !important; }
        .pp-card {
          background: rgba(249,115,22,0.04);
          border: 1px solid rgba(249,115,22,0.12);
          border-radius: 16px;
          padding: 22px 20px;
        }
        .pp-stat-card {
          background: rgba(249,115,22,0.06);
          border: 1px solid rgba(249,115,22,0.15);
          border-radius: 14px;
          padding: 16px 18px;
          flex: 1;
          min-width: 140px;
        }
        .pp-btn {
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.6);
          font-family: 'DM Sans', sans-serif;
          transition: all 0.15s;
        }
        .pp-btn:hover { background: rgba(255,255,255,0.08); color: white; }
        .pp-btn-buy { border-color: rgba(52,211,153,0.3); color: #34d399; }
        .pp-btn-buy:hover { background: rgba(52,211,153,0.12); }
        .pp-btn-sell { border-color: rgba(248,113,113,0.3); color: #f87171; }
        .pp-btn-sell:hover { background: rgba(248,113,113,0.12); }
        .pp-filter-btn {
          padding: 5px 14px;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid rgba(249,115,22,0.18);
          background: transparent;
          color: rgba(255,255,255,0.45);
          font-family: 'DM Sans', sans-serif;
          transition: all 0.15s;
        }
        .pp-filter-btn.active {
          color: #f97316;
          background: rgba(249,115,22,0.1);
          border-color: rgba(249,115,22,0.35);
        }
        .pp-table-row {
          display: grid;
          grid-template-columns: 2fr 60px 80px 80px 90px 90px 100px;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          gap: 8px;
        }
        .pp-table-header {
          font-size: 10px;
          font-weight: 700;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 8px 0;
          border-bottom: 1px solid rgba(249,115,22,0.12);
        }
        @media (max-width: 768px) {
          .pp-table-row, .pp-table-header {
            grid-template-columns: 1.5fr 50px 70px 70px 80px 80px 80px;
            font-size: 11px;
          }
        }
      `}</style>

      <div style={{
        background: "#160c03", minHeight: "100vh",
        fontFamily: "'DM Sans', sans-serif", color: "white",
      }}>
        <PolyHeader active="PolyPortfolio" />

        <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px 80px" }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontFamily: "'DM Serif Display', serif", fontSize: 28, fontWeight: 400,
              color: "#f97316", letterSpacing: "-0.02em", marginBottom: 4,
            }}>
              📊 Portfolio
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
              Track your positions, manage trades, and review performance.
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
              Loading portfolio…
            </div>
          ) : (
            <>
              {/* ─── Summary Stats ─────────────────────────────────────────── */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                {[
                  { label: "Total Invested", value: fmt$(totalInvested), color: "#f97316" },
                  { label: "Unrealized P&L", value: fmt$(totalUnrealizedPL), color: totalUnrealizedPL >= 0 ? "#34d399" : "#f87171" },
                  { label: "Realized P&L", value: fmt$(totalRealizedPL), color: totalRealizedPL >= 0 ? "#34d399" : "#f87171" },
                  { label: "Potential Payout", value: fmt$(totalPotentialPayout), color: "#fbbf24" },
                ].map((s) => (
                  <div key={s.label} className="pp-stat-card">
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'DM Mono', monospace" }}>
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* ─── 1. Active Positions ───────────────────────────────────── */}
              <div className="pp-card" style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f97316", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📈</span> Active Positions
                  <span style={{
                    fontSize: 11, background: "rgba(249,115,22,0.15)", color: "#fb923c",
                    padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                  }}>{activePositions.length}</span>
                </h2>

                {activePositions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    No active positions. <a href="/polyoiyen" style={{ color: "#f97316", textDecoration: "none" }}>Go to Market →</a>
                  </div>
                ) : (
                  <>
                    <div className="pp-table-row pp-table-header">
                      <span>Market</span><span>Side</span><span>Shares</span>
                      <span>Avg Cost</span><span>Current</span>
                      <span>P&L</span><span>Actions</span>
                    </div>
                    {activePositions.map((p) => {
                      const info = prices[p.eventId];
                      const currentPrice = info ? (p.side === "YES" ? info.yesPrice : info.noPrice) : null;
                      const unrealizedPL = currentPrice !== null ? (currentPrice - p.avgPrice) * p.netShares : 0;
                      const plColor = unrealizedPL >= 0 ? "#34d399" : "#f87171";
                      const pctReturn = p.avgPrice > 0 && currentPrice !== null
                        ? (currentPrice - p.avgPrice) / p.avgPrice : 0;

                      return (
                        <div key={`${p.eventId}-${p.side}`} className="pp-table-row">
                          <a href={`/polyoiyen/${encodeURIComponent(p.eventId)}`} style={{
                            fontSize: 13, fontWeight: 600, color: "white",
                            textDecoration: "none", overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }} title={p.eventTitle || p.marketQuestion}>
                            {p.eventTitle || p.marketQuestion}
                          </a>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: p.side === "YES" ? "#34d399" : "#f87171",
                            background: p.side === "YES" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
                            padding: "2px 8px", borderRadius: 4, textAlign: "center",
                          }}>{p.side}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                            {p.netShares.toFixed(2)}
                          </span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                            {(p.avgPrice * 100).toFixed(1)}¢
                          </span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: currentPrice !== null ? "white" : "rgba(255,255,255,0.3)" }}>
                            {currentPrice !== null ? `${(currentPrice * 100).toFixed(1)}¢` : "…"}
                          </span>
                          <div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: plColor }}>
                              {fmt$(unrealizedPL)}
                            </div>
                            <div style={{ fontSize: 10, color: plColor, opacity: 0.7 }}>
                              {fmtPct(pctReturn)}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button className="pp-btn pp-btn-buy" onClick={() => setTradeTarget({ pos: p, mode: "BUY" })}>Buy</button>
                            <button className="pp-btn pp-btn-sell" onClick={() => setTradeTarget({ pos: p, mode: "SELL" })}>Sell</button>
                          </div>
                        </div>
                      );
                    })}
                    {/* Potential Payout row */}
                    <div style={{
                      marginTop: 14, padding: "14px 16px",
                      background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)",
                      borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                        💰 If all positions win ($1.00 each):
                      </span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: "#fbbf24" }}>
                        {fmt$(totalPotentialPayout)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* ─── 2. Category Breakdown ─────────────────────────────────── */}
              <div className="pp-card" style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f97316", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🎯</span> Category Breakdown
                </h2>
                {categoryData.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    No active investments to display.
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
                    <PieChart data={categoryData} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 200 }}>
                      {categoryData.map((c) => {
                        const total = categoryData.reduce((s, d) => s + d.value, 0);
                        const pct = total > 0 ? ((c.value / total) * 100).toFixed(1) : "0";
                        return (
                          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 14, flexShrink: 0, width: 20, textAlign: "center" }}>{catEmoji(c.label)}</span>
                            <span style={{ fontSize: 13, color: c.color, fontWeight: 600, flex: 1 }}>{c.label}</span>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                              {fmt$(c.value)}
                            </span>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: c.color, fontWeight: 700, width: 48, textAlign: "right" }}>
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ─── 3. Activity History ───────────────────────────────────── */}
              <div className="pp-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f97316", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>📋</span> Activity History
                  </h2>
                  <div style={{ display: "flex", gap: 5 }}>
                    {(["ALL", "BUY", "SELL"] as const).map((f) => (
                      <button key={f}
                        className={`pp-filter-btn${historyFilter === f ? " active" : ""}`}
                        onClick={() => setHistoryFilter(f)}
                      >{f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}</button>
                    ))}
                  </div>
                </div>

                {filteredBets.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    No {historyFilter === "ALL" ? "" : historyFilter.toLowerCase()} transactions yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {filteredBets.map((b) => {
                      const isBuy = b.type === "BUY";
                      const isSell = b.type === "SELL";
                      const typeColor = isBuy ? "#34d399" : isSell ? "#f87171" : "#fbbf24";
                      const typeIcon = isBuy ? "🟢" : isSell ? "🔴" : "🏆";
                      return (
                        <div key={b.id} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "11px 14px",
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.05)",
                          borderRadius: 10,
                        }}>
                          <span style={{ fontSize: 16 }}>{typeIcon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {b.eventTitle || b.marketQuestion}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                              {timeStr(b.createdAt)}
                            </div>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: typeColor,
                            background: `${typeColor}18`,
                            padding: "2px 8px", borderRadius: 4, letterSpacing: "0.06em",
                          }}>{b.type}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: b.side === "YES" ? "#34d399" : "#f87171",
                          }}>{b.side}</span>
                          <div style={{ textAlign: "right", minWidth: 70 }}>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: "white" }}>
                              {fmt$(b.amount)}
                            </div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                              {b.shares.toFixed(2)} @ {(b.price * 100).toFixed(1)}¢
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Trade Modal */}
        {tradeTarget && prices[tradeTarget.pos.eventId] && (
          <TradeModal
            position={tradeTarget.pos}
            currentPrice={
              tradeTarget.pos.side === "YES"
                ? prices[tradeTarget.pos.eventId].yesPrice
                : prices[tradeTarget.pos.eventId].noPrice
            }
            mode={tradeTarget.mode}
            onClose={() => setTradeTarget(null)}
            onTrade={handleTrade}
          />
        )}
      </div>
    </>
  );
}
