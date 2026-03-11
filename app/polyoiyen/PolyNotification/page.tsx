"use client";

import { useState, useEffect, useCallback } from "react";

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
    { label: "Portfolio", href: "/portfolio" },
    { label: "News", href: "/polyoiyen?tab=news" },
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
          href={`/polyoiyen?eventId=${alert.eventId}`}
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PolyNotificationPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [prices, setPrices] = useState<Record<string, MarketPriceInfo>>({});
  // alertId -> whether order book currently has a large order >= threshold
  const [largeOrderHit, setLargeOrderHit] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"triggered" | "active">("triggered");

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

