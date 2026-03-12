"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── types ────────────────────────────────────────────────────────────────────
interface AlertRow {
  id: number;
  eventId: string;
  tokenId: string;
  marketQuestion: string;
  alertType: "PRICE" | "LARGE_ORDER";
  side: "YES" | "NO";
  targetPrice: number | null;
  threshold: number | null;
  triggered: boolean;
  active: boolean;
  createdAt: string;
  triggeredAt: string | null;
}

interface MarketPriceInfo {
  eventId: string;
  yesPrice: number;
  noPrice: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}¢`;
}

// ─── NavBar ───────────────────────────────────────────────────────────────────
function NavBar() {
  const links = [
    { label: "Oiyen.Invest", href: "/markets" },
    { label: "Market", href: "/polyoiyen" },
    { label: "Portfolio", href: "/polyoiyen/PolyPortfolio" },
    { label: "News", href: "/polyoiyen/PolyNews" },
    { label: "Notification", href: "/polyoiyen/PolyNotification", active: true },
  ];
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(22,12,3,0.96)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(249,115,22,0.13)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        height: 56,
      }}
    >
      <span
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20,
          color: "#f97316",
          fontWeight: 400,
          letterSpacing: "-0.01em",
        }}
      >
        Oiyen
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              color: l.active ? "#f97316" : "rgba(255,255,255,0.65)",
              background: l.active ? "rgba(249,115,22,0.12)" : "transparent",
              border: l.active ? "1px solid rgba(249,115,22,0.28)" : "1px solid transparent",
              transition: "all 0.18s",
            }}
          >
            {l.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

// ─── AlertCard ────────────────────────────────────────────────────────────────
interface AlertCardProps {
  alert: AlertRow;
  currentPrice?: number | null;
  isTriggered: boolean;
  onDismiss: (id: number) => void;
}

function AlertCard({ alert, currentPrice, isTriggered, onDismiss }: AlertCardProps) {
  const isPriceAlert = alert.alertType === "PRICE";
  const isYes = alert.side === "YES";

  const accentColor = isTriggered ? "#34d399" : "#f97316";
  const bgColor = isTriggered
    ? "rgba(52,211,153,0.07)"
    : "rgba(249,115,22,0.06)";
  const borderColor = isTriggered
    ? "rgba(52,211,153,0.22)"
    : "rgba(249,115,22,0.18)";

  // Build human-readable description of what triggered / what's being watched
  let statusText = "";
  let detailText = "";

  if (isPriceAlert) {
    const targetPct = pct(alert.targetPrice);
    const curPct = currentPrice != null ? pct(currentPrice) : "—";
    if (isTriggered) {
      statusText = `${isYes ? "YES" : "NO"} price reached ${targetPct} target`;
      detailText = alert.triggeredAt
        ? `Triggered ${timeAgo(alert.triggeredAt)}`
        : "Currently at target or above";
    } else {
      statusText = `Watching ${isYes ? "YES" : "NO"} price → target ${targetPct}`;
      detailText = currentPrice != null ? `Current price: ${curPct}` : "Fetching price…";
    }
  } else {
    const thresholdStr =
      alert.threshold != null ? `$${Number(alert.threshold).toLocaleString()}` : "—";
    if (isTriggered) {
      statusText = `Large ${isYes ? "YES" : "NO"} order ≥ ${thresholdStr} found in order book`;
      detailText = "A qualifying order was detected in the market";
    } else {
      statusText = `Watching for ${isYes ? "YES" : "NO"} order ≥ ${thresholdStr}`;
      detailText = "Checking order book & local trades…";
    }
  }

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        padding: "16px 20px",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        position: "relative",
        transition: "border-color 0.2s",
      }}
    >
      {/* Icon */}
      <div
        style={{
          flexShrink: 0,
          width: 38,
          height: 38,
          borderRadius: 10,
          background: isTriggered
            ? "rgba(52,211,153,0.14)"
            : "rgba(249,115,22,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
        }}
      >
        {isPriceAlert ? "📈" : "🐋"}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Market question */}
        <a
          href={`/oiyen.quadrawebs.com/polyoiyen?eventId=${alert.eventId}`}
          style={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            textDecoration: "none",
            lineHeight: 1.35,
            marginBottom: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={alert.marketQuestion}
        >
          {alert.marketQuestion}
        </a>

        {/* Status */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: accentColor,
            marginBottom: 2,
          }}
        >
          {statusText}
        </div>

        {/* Detail / time */}
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.44)" }}>
          {detailText} &nbsp;·&nbsp; Created {timeAgo(alert.createdAt)}
        </div>
      </div>

      {/* Dismiss button (only for triggered alerts) */}
      {isTriggered && (
        <button
          onClick={() => onDismiss(alert.id)}
          title="Dismiss"
          style={{
            flexShrink: 0,
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.35)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: "2px 4px",
            borderRadius: 6,
          }}
        >
          ×
        </button>
      )}

      {/* Triggered badge */}
      {isTriggered && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: alert.active === false ? 14 : 42,
            background: "rgba(52,211,153,0.18)",
            color: "#34d399",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "2px 7px",
            borderRadius: 20,
          }}
        >
          TRIGGERED
        </div>
      )}
    </div>
  );
}

// ─── Discord / Telegram join banner ─────────────────────────────────────────
function CommunityBanner() {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(88,101,242,0.12), rgba(249,115,22,0.06))",
        border: "1px solid rgba(88,101,242,0.28)",
        borderRadius: 14,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 28,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 3 }}>
          🔔 Get real-time notifications
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          Join our community to receive instant alerts when your targets are hit.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <a
          href="https://discord.gg/jeEpRZaF"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: "#5865F2", color: "white", textDecoration: "none",
            border: "1px solid rgba(88,101,242,0.5)",
            boxShadow: "0 2px 10px rgba(88,101,242,0.3)",
            fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Join Discord
        </a>
        <a
          href="https://t.me/placeholder"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: "#26A5E4", color: "white", textDecoration: "none",
            border: "1px solid rgba(38,165,228,0.5)",
            boxShadow: "0 2px 10px rgba(38,165,228,0.25)",
            fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          Join Telegram
        </a>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PolyNotificationPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [prices, setPrices] = useState<Record<string, MarketPriceInfo>>({});
  // alertId -> whether order book currently has a large order >= threshold
  const [largeOrderHit, setLargeOrderHit] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"triggered" | "active">("triggered");
  // Track which alert IDs have already had a Discord notification sent
  const notifiedIds = useRef<Set<number>>(new Set());

  // Fetch all user alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/polyalerts");
      if (!res.ok) throw new Error("Failed to fetch alerts");
      const data = await res.json();
      setAlerts(data.alerts ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch current market prices for PRICE alerts
  const fetchPrices = useCallback(async (alertList: AlertRow[]) => {
    const priceAlerts = alertList.filter((a) => a.alertType === "PRICE" && a.active);
    const uniqueEventIds = [...new Set(priceAlerts.map((a) => a.eventId))];
    if (uniqueEventIds.length === 0) return;

    const results: Record<string, MarketPriceInfo> = {};

    await Promise.all(
      uniqueEventIds.map(async (eventId) => {
        try {
          const res = await fetch(
            `/api/polymarket?id=${encodeURIComponent(eventId)}&limit=1`
          );
          if (!res.ok) return;
          const data = await res.json();
          const events: Array<{
            id: string;
            markets?: Array<{ closed?: boolean; outcomePrices?: string }>;
          }> = data.events ?? data ?? [];
          const event = events.find(
            (e) => String(e.id) === String(eventId)
          );
          if (!event || !event.markets) return;

          const activeMarket = event.markets.find((m) => !m.closed) ?? event.markets[0];
          if (!activeMarket?.outcomePrices) return;

          let parsed: number[] = [];
          try {
            parsed = JSON.parse(activeMarket.outcomePrices).map(Number);
          } catch {
            return;
          }
          if (parsed.length < 2 || isNaN(parsed[0]) || isNaN(parsed[1])) return;

          results[eventId] = {
            eventId,
            yesPrice: parsed[0],
            noPrice: parsed[1],
          };
        } catch {
          // ignore per-event failures
        }
      })
    );

    setPrices((prev) => ({ ...prev, ...results }));
  }, []);

  // Fetch order books (real CLOB) AND local polybets DB for LARGE_ORDER alerts
  const fetchOrderBooks = useCallback(async (alertList: AlertRow[]) => {
    const orderAlerts = alertList.filter(
      (a) => a.alertType === "LARGE_ORDER" && a.active !== false && !a.triggered
    );
    if (orderAlerts.length === 0) return;

    const hits: Record<number, boolean> = {};
    await Promise.all(
      orderAlerts.map(async (a) => {
        if (a.threshold === null) return;
        const thresh = Number(a.threshold);
        const side = a.side; // "YES" or "NO"

        // ── 1. Check the real Polymarket CLOB order book ──────────────────
        let clobHit = false;
        if (a.tokenId) {
          try {
            const res = await fetch(
              `/api/polymarket/orderbook?token_id=${encodeURIComponent(a.tokenId)}`
            );
            if (res.ok) {
              const data: { bids?: { price: string; size: string }[]; asks?: { price: string; size: string }[] } =
                await res.json();
              // YES buyers show as bids; NO buyers show as asks
              const orders = side === "YES" ? (data.bids ?? []) : (data.asks ?? []);
              clobHit = orders.some((o) => Number(o.size) * Number(o.price) >= thresh);
            }
          } catch {
            // ignore
          }
        }

        // ── 2. Check local PolyBet database (bets placed within this app) ─
        let localHit = false;
        try {
          const params = new URLSearchParams({
            checkLargeOrder: "true",
            eventId: a.eventId,
            side,
            threshold: String(thresh),
          });
          const res = await fetch(`/api/polybets?${params}`);
          if (res.ok) {
            const data: { hit: boolean } = await res.json();
            localHit = data.hit;
          }
        } catch {
          // ignore
        }

        hits[a.id] = clobHit || localHit;
      })
    );
    setLargeOrderHit((prev) => ({ ...prev, ...hits }));
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    if (alerts.length > 0) {
      fetchPrices(alerts);
      fetchOrderBooks(alerts);
    }
  }, [alerts, fetchPrices, fetchOrderBooks]);

  // Send Discord webhook for newly triggered alerts
  useEffect(() => {
    if (loading) return;
    alerts.forEach((a) => {
      if (a.active === false) return;
      const triggered =
        a.triggered ||
        (a.alertType === "LARGE_ORDER" && largeOrderHit[a.id] === true) ||
        (a.alertType === "PRICE" &&
          a.targetPrice !== null &&
          prices[a.eventId] != null &&
          (a.side === "YES"
            ? prices[a.eventId].yesPrice >= Number(a.targetPrice)
            : prices[a.eventId].noPrice >= Number(a.targetPrice)));

      if (triggered && !notifiedIds.current.has(a.id)) {
        notifiedIds.current.add(a.id);
        fetch("/api/discord-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alertType: a.alertType,
            side: a.side,
            marketQuestion: a.marketQuestion,
            targetPrice: a.targetPrice,
            threshold: a.threshold,
            triggeredAt: a.triggeredAt,
            eventId: a.eventId,
          }),
        }).catch(() => {
          // silent fail — don't disrupt the UI
        });
      }
    });
  }, [alerts, prices, largeOrderHit, loading]);

  // Determine triggered status client-side
  function isClientTriggered(a: AlertRow): boolean {
    if (a.triggered) return true;
    if (a.alertType === "LARGE_ORDER") {
      return largeOrderHit[a.id] === true;
    }
    // PRICE alert
    if (a.targetPrice === null) return false;
    const info = prices[a.eventId];
    if (!info) return false;
    const currentPrice = a.side === "YES" ? info.yesPrice : info.noPrice;
    return currentPrice >= Number(a.targetPrice);
  }

  const triggeredAlerts = alerts.filter((a) => isClientTriggered(a) && a.active !== false);
  const activeAlerts = alerts.filter(
    (a) => !isClientTriggered(a) && a.active !== false
  );
  const dismissedAlerts = alerts.filter((a) => a.active === false);

  async function handleDismiss(id: number) {
    try {
      await fetch("/api/polyalerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, active: false } : a))
      );
    } catch {
      // silent
    }
  }

  async function handleDismissAll() {
    try {
      await fetch("/api/polyalerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissAll: true }),
      });
      setAlerts((prev) =>
        prev.map((a) => (isClientTriggered(a) ? { ...a, active: false } : a))
      );
    } catch {
      // silent
    }
  }

  const TABS = [
    { key: "triggered" as const, label: "Triggered", count: triggeredAlerts.length },
    { key: "active" as const, label: "Watching", count: activeAlerts.length },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #160c03 !important; }
        .notif-tab-btn {
          background: transparent;
          border: 1px solid rgba(249,115,22,0.2);
          border-radius: 8px;
          padding: 7px 18px;
          font-size: 13px;
          font-weight: 600;
          color: rgba(255,255,255,0.55);
          cursor: pointer;
          transition: all 0.18s;
          font-family: 'DM Sans', sans-serif;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .notif-tab-btn.active {
          color: #f97316;
          background: rgba(249,115,22,0.12);
          border-color: rgba(249,115,22,0.35);
        }
        .notif-tab-btn:hover:not(.active) {
          color: rgba(255,255,255,0.8);
          border-color: rgba(249,115,22,0.35);
        }
        .notif-badge {
          background: rgba(249,115,22,0.22);
          color: #fb923c;
          font-size: 11px;
          font-weight: 700;
          border-radius: 20px;
          padding: 1px 7px;
          min-width: 20px;
          text-align: center;
        }
        .notif-badge.green {
          background: rgba(52,211,153,0.18);
          color: #34d399;
        }
        .notif-dismiss-all-btn {
          background: transparent;
          border: 1px solid rgba(249,115,22,0.25);
          border-radius: 8px;
          padding: 7px 16px;
          font-size: 12px;
          font-weight: 600;
          color: rgba(249,115,22,0.7);
          cursor: pointer;
          transition: all 0.18s;
          font-family: 'DM Sans', sans-serif;
        }
        .notif-dismiss-all-btn:hover {
          background: rgba(249,115,22,0.09);
          color: #f97316;
        }
      `}</style>
      

      <div
        style={{
          background: "#160c03",
          minHeight: "100vh",
          fontFamily: "'DM Sans', sans-serif",
          color: "white",
        }}
      >
        <NavBar />

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "36px 20px 60px" }}>
          {/* Discord / Telegram banner */}
          <CommunityBanner />

          {/* Page header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 26 }}>🔔</span>
              <h1
                style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: 28,
                  fontWeight: 400,
                  color: "#f97316",
                  letterSpacing: "-0.02em",
                }}
              >
                Notifications
              </h1>
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.44)", marginLeft: 36 }}>
              Your price & large-order alerts live here.
            </p>
          </div>

          {/* Tabs + dismiss all */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`notif-tab-btn${tab === t.key ? " active" : ""}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                  <span
                    className={`notif-badge${t.key === "triggered" ? " green" : ""}`}
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
            {tab === "triggered" && triggeredAlerts.length > 0 && (
              <button className="notif-dismiss-all-btn" onClick={handleDismissAll}>
                Dismiss all
              </button>
            )}
          </div>

          {/* Content */}
          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: "56px 0",
                color: "rgba(255,255,255,0.35)",
                fontSize: 14,
              }}
            >
              Loading alerts…
            </div>
          ) : error ? (
            <div
              style={{
                textAlign: "center",
                padding: "56px 0",
                color: "#f87171",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          ) : (
            <>
              {tab === "triggered" && (
                <AlertList
                  alerts={triggeredAlerts}
                  prices={prices}
                  isTriggeredSection
                  onDismiss={handleDismiss}
                  emptyLabel="No triggered alerts yet — we'll notify you when a target is hit."
                />
              )}
              {tab === "active" && (
                <AlertList
                  alerts={activeAlerts}
                  prices={prices}
                  isTriggeredSection={false}
                  onDismiss={handleDismiss}
                  emptyLabel="No active alerts. Set price or large-order alerts on any market."
                />
              )}

              {/* Dismissed section (collapsed) */}
              {dismissedAlerts.length > 0 && (
                <DismissedSection alerts={dismissedAlerts} prices={prices} />
              )}
            </>
          )}
        </div>
      </div>
      
    </>
  );
}

// ─── AlertList ────────────────────────────────────────────────────────────────
function AlertList({
  alerts,
  prices,
  isTriggeredSection,
  onDismiss,
  emptyLabel,
}: {
  alerts: AlertRow[];
  prices: Record<string, MarketPriceInfo>;
  isTriggeredSection: boolean;
  onDismiss: (id: number) => void;
  emptyLabel: string;
}) {
  if (alerts.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "56px 24px",
          color: "rgba(255,255,255,0.35)",
          fontSize: 14,
          border: "1px dashed rgba(249,115,22,0.15)",
          borderRadius: 16,
        }}
      >
        {emptyLabel}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {alerts.map((a) => {
        const info = prices[a.eventId];
        const currentPrice = info
          ? a.side === "YES"
            ? info.yesPrice
            : info.noPrice
          : null;
        return (
          <AlertCard
            key={a.id}
            alert={a}
            currentPrice={currentPrice}
            isTriggered={isTriggeredSection}
            onDismiss={onDismiss}
          />
        );
      })}
    </div>
  );
}

// ─── DismissedSection ─────────────────────────────────────────────────────────
function DismissedSection({
  alerts,
  prices,
}: {
  alerts: AlertRow[];
  prices: Record<string, MarketPriceInfo>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 32 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.35)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "'DM Sans', sans-serif",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <span>{open ? "▾" : "▸"}</span> Dismissed ({alerts.length})
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {alerts.map((a) => {
            const info = prices[a.eventId];
            const currentPrice = info
              ? a.side === "YES"
                ? info.yesPrice
                : info.noPrice
              : null;
            return (
              <div key={a.id} style={{ opacity: 0.45 }}>
                <AlertCard
                  alert={a}
                  currentPrice={currentPrice}
                  isTriggered={a.triggered}
                  onDismiss={() => {}}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

