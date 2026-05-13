import { NextRequest, NextResponse } from "next/server";
import { sendBacktestCompletedDiscord, sendEventBacktestDetailsDiscord } from "@/lib/backtestDiscord";
import { recordBacktestNotification } from "@/lib/backtestNotificationLog";

/**
 * GET /api/polyoiyen/test-backtest-notification
 * Send a test backtest completion notification to Discord
 * ?modelBacktestId=1 (optional, defaults to 1)
 */
export async function GET(request: NextRequest) {
  try {
    const split = request.nextUrl.searchParams.get("split") === "1";
    const splitSource = (request.nextUrl.searchParams.get("splitSource") || "topCandidates").trim();

    // Get modelBacktestId from query params, default to 1
    const modelBacktestId = parseInt(request.nextUrl.searchParams.get("modelBacktestId") || "1");

    if (isNaN(modelBacktestId) || modelBacktestId <= 0) {
      return NextResponse.json({ error: "Invalid modelBacktestId" }, { status: 400 });
    }

    let eventBacktestLinks:
      | Array<{
          eventId: string | number;
          label?: string;
          totalReturn?: number | null;
          winRate?: number | null;
          trades?: number | null;
          statusLabel?: string;
        }>
      | undefined;

    const baseUrl = request.nextUrl.origin.replace(/\/$/, "");
    const desiredCount = 10;
    const perCategory = 2;
    const desiredCategories = ["elonTweets", "movieBoxOffice", "fedRates", "nbaGames", "nflMarkets"] as const;

    type CandidateRow = { eventId: string; title?: string; slug?: string };

    type BacktestEventSummary = {
      totalReturn: number | null;
      winRate: number | null;
      tradeCount: number | null;
      hasExited: boolean | null;
      marketTitle: string | null;
      marketQuestion: string | null;
    };

    const loadTopCandidates = async (limitPerCategory: number): Promise<Record<string, CandidateRow[]>> => {
      const res = await fetch(`${baseUrl}/api/polyoiyen/top-candidates?limit=${encodeURIComponent(String(limitPerCategory))}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) return {};

      const payload = await res.json();
      const categories = (payload && typeof payload === "object") ? (payload as Record<string, unknown>).categories : undefined;
      if (!categories || typeof categories !== "object") return {};

      const out: Record<string, CandidateRow[]> = {};
      for (const key of desiredCategories) {
        const rowsRaw = (categories as Record<string, unknown>)[key];
        const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
        out[key] = rows
          .map((row) => {
            const rec = (row && typeof row === "object") ? (row as Record<string, unknown>) : {};
            const eventId = typeof rec.eventId === "string" ? rec.eventId : "";
            const title = typeof rec.title === "string" ? rec.title : "";
            const slug = typeof rec.slug === "string" ? rec.slug : "";
            return { eventId, title, slug };
          })
          .filter((r) => Boolean(r.eventId));
      }

      return out;
    };

    const tryFetchBacktestEventSummary = async (eventId: string): Promise<BacktestEventSummary> => {
      try {
        const res = await fetch(`${baseUrl}/api/polyoiyen/backtest-event/${encodeURIComponent(eventId)}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          return {
            totalReturn: null,
            winRate: null,
            tradeCount: null,
            hasExited: null,
            marketTitle: null,
            marketQuestion: null,
          };
        }

        const payload = (await res.json()) as Record<string, unknown>;
        const totalReturn = typeof payload?.totalReturn === "number" && Number.isFinite(payload.totalReturn)
          ? (payload.totalReturn as number)
          : null;
        const winRate = typeof payload?.winRate === "number" && Number.isFinite(payload.winRate)
          ? (payload.winRate as number)
          : null;
        const tradeCount = typeof payload?.tradeCount === "number" && Number.isFinite(payload.tradeCount)
          ? (payload.tradeCount as number)
          : null;
        const hasExited = typeof payload?.hasExited === "boolean" ? (payload.hasExited as boolean) : null;
        const marketTitle = typeof payload?.marketTitle === "string" ? (payload.marketTitle as string) : null;
        const marketQuestion = typeof payload?.marketQuestion === "string" ? (payload.marketQuestion as string) : null;

        return { totalReturn, winRate, tradeCount, hasExited, marketTitle, marketQuestion };
      } catch {
        return {
          totalReturn: null,
          winRate: null,
          tradeCount: null,
          hasExited: null,
          marketTitle: null,
          marketQuestion: null,
        };
      }
    };

    const buildTopCandidateEventLinks = async (): Promise<
      Array<{ eventId: string; label: string; totalReturn: number | null; trades: number | null; statusLabel: string; winRate: number | null }>
    > => {
      const categories = await loadTopCandidates(20);
      const existing = new Set<string>();
      const out: Array<{ eventId: string; label: string; totalReturn: number | null; trades: number | null; statusLabel: string; winRate: number | null }> = [];

      const addRow = async (row: CandidateRow) => {
        if (out.length >= desiredCount) return;
        const eventId = String(row.eventId || "").trim();
        if (!eventId) return;
        if (existing.has(eventId)) return;
        existing.add(eventId);

        const label = (row.title || row.slug || `Event ${eventId}`).trim();
        const summary = await tryFetchBacktestEventSummary(eventId);
        const statusLabel = summary.hasExited === true ? "Exited" : summary.hasExited === false ? "Active" : "Unknown";
        out.push({
          eventId,
          label,
          totalReturn: summary.totalReturn,
          trades: summary.tradeCount,
          statusLabel,
          winRate: summary.winRate,
        });
      };

      for (const categoryKey of desiredCategories) {
        const rows = categories[categoryKey] || [];
        for (const row of rows.slice(0, perCategory)) {
          await addRow(row);
        }
      }

      if (out.length < desiredCount) {
        for (const categoryKey of desiredCategories) {
          if (out.length >= desiredCount) break;
          const rows = categories[categoryKey] || [];
          for (const row of rows) {
            if (out.length >= desiredCount) break;
            await addRow(row);
          }
        }
      }

      return out.slice(0, desiredCount);
    };

    if (split) {
      eventBacktestLinks = await buildTopCandidateEventLinks();

      type WorstEventItem = {
        eventId?: string | number;
        eventTitle?: string;
        marketTitle?: string;
        marketQuestion?: string;
        totalReturn?: number;
      };

      const createdAt = new Date();
      const notificationIds: number[] = [];

      // Default alignment: use the same source as Backtest Completed Discord embed
      // (latest run worstEvents from backtest-versions), so details match.
      if (splitSource === "topCandidates") {
        if (!eventBacktestLinks?.length) {
          return NextResponse.json({ error: "Failed to build top-candidate events" }, { status: 500 });
        }

        for (const item of eventBacktestLinks.slice(0, desiredCount)) {
          const totalReturn = item.totalReturn ?? null;
          const winRate = item.winRate != null
            ? item.winRate
            : totalReturn == null
              ? null
              : totalReturn >= 0
                ? 100
                : 0;
          const trades = item.trades ?? null;
          const statusLabel = item.statusLabel || "Unknown";

          const id = await recordBacktestNotification({
            kind: "EVENT_BACKTEST_DETAILS",
            modelBacktestId,
            backtestVersionRunId: null,
            eventId: String(item.eventId),
            payload: {
              eventId: String(item.eventId),
              label: item.label,
              totalReturn,
              winRate,
              trades,
              statusLabel,
              createdAt: createdAt.toISOString(),
              source: "Test Split Notification (topCandidates)",
            },
            send: () =>
              sendEventBacktestDetailsDiscord({
                eventId: String(item.eventId),
                totalReturn,
                winRate,
                trades,
                statusLabel,
                createdAt,
                source: "Test Split Notification (topCandidates)",
              }),
          });

          notificationIds.push(id);
        }

        return NextResponse.json({
          message: "Split notifications sent successfully (topCandidates)",
          modelBacktestId,
          requested: desiredCount,
          sent: notificationIds.length,
          notificationIds,
          note:
            "If some events have N/A return, it means there are no PolyBet rows for that event yet.",
        });
      }

      if (splitSource !== "backtestEvent") {
        try {
          const res = await fetch(`${baseUrl}/api/polyoiyen/backtest-versions/${encodeURIComponent(String(modelBacktestId))}`, {
            method: "GET",
            cache: "no-store",
          });

          if (res.ok) {
            const payload = await res.json();
            const runs = Array.isArray(payload?.runs) ? payload.runs : [];
            const worstEventsRaw = runs?.[0]?.worstEvents;
            const worstEvents: WorstEventItem[] = Array.isArray(worstEventsRaw) ? worstEventsRaw : [];

            const normalized = worstEvents
              .map((row) => {
                const rec = (row && typeof row === "object") ? (row as Record<string, unknown>) : {};
                const eventId = rec.eventId as string | number | undefined;
                const totalReturn = typeof rec.totalReturn === "number" ? rec.totalReturn : null;
                const label =
                  (typeof rec.eventTitle === "string" && rec.eventTitle)
                  || (typeof rec.marketTitle === "string" && rec.marketTitle)
                  || (typeof rec.marketQuestion === "string" && rec.marketQuestion)
                  || (eventId != null ? `Event ${String(eventId)}` : "Event");

                if (eventId == null) return null;
                return {
                  eventId: String(eventId),
                  label,
                  totalReturn,
                };
              })
              .filter((x): x is { eventId: string; label: string; totalReturn: number | null } => Boolean(x))
              .sort((a, b) => (a.totalReturn ?? 0) - (b.totalReturn ?? 0))
              .slice(0, desiredCount);

            if (normalized.length === 0) {
              return NextResponse.json(
                { error: "No worstEvents found for this modelBacktestId" },
                { status: 404 }
              );
            }

            for (const item of normalized) {
              const totalReturn = item.totalReturn;
              const extra = await tryFetchBacktestEventSummary(String(item.eventId));
              const winRate = extra.winRate != null
                ? extra.winRate
                : totalReturn == null
                  ? null
                  : totalReturn >= 0
                    ? 100
                    : 0;
              const trades = extra.tradeCount;
              const statusLabel = extra.hasExited === true ? "Exited" : extra.hasExited === false ? "Active" : "Unknown";

              const id = await recordBacktestNotification({
                kind: "EVENT_BACKTEST_DETAILS",
                modelBacktestId,
                backtestVersionRunId: null,
                eventId: item.eventId,
                payload: {
                  eventId: item.eventId,
                  label: item.label,
                  totalReturn,
                  winRate,
                  trades,
                  statusLabel,
                  createdAt: createdAt.toISOString(),
                  source: "Test Split Notification (aligned)",
                },
                send: () =>
                  sendEventBacktestDetailsDiscord({
                    eventId: item.eventId,
                    totalReturn,
                    winRate,
                    trades: trades ?? null,
                    statusLabel,
                    createdAt,
                    source: "Test Split Notification (aligned)",
                  }),
              });

              notificationIds.push(id);
            }

            return NextResponse.json({
              message: "Split notifications sent successfully (aligned)",
              modelBacktestId,
              requested: desiredCount,
              sent: notificationIds.length,
              notificationIds,
              note:
                notificationIds.length < desiredCount
                  ? "This model has fewer than 10 worstEvents in its latest run, so fewer aligned notifications were sent."
                  : undefined,
            });
          }
        } catch {
          // fall through to backtestEvent computation
        }
      }

      // Fallback: compute per-event details via backtest-event API (may differ from combined worstEvents).
      try {
        const desiredCategories = ["elonTweets", "movieBoxOffice", "fedRates", "nbaGames", "nflMarkets"] as const;
        const perCategory = 2;

        type CandidateRow = { eventId: string; title?: string; slug?: string };
        type BacktestEventPayload = {
          eventId: string;
          marketTitle?: string;
          marketQuestion?: string;
          tradeCount?: number;
          totalReturn?: number;
          winRate?: number;
          returnDetails?: unknown;
        };

        const selected: Array<{ row: CandidateRow; details: BacktestEventPayload }> = [];
        const selectedEventIds = new Set<string>();

        const tryAdd = async (row: CandidateRow) => {
          if (selected.length >= desiredCount) return;
          if (!row?.eventId) return;
          const key = String(row.eventId);
          if (selectedEventIds.has(key)) return;

          const res = await fetch(`${baseUrl}/api/polyoiyen/backtest-event/${encodeURIComponent(row.eventId)}`, {
            method: "GET",
            cache: "no-store",
          });
          if (!res.ok) return;

          const payload = (await res.json()) as BacktestEventPayload;
          if (!payload || String(payload.eventId || "") !== String(row.eventId)) return;
          if (typeof payload.totalReturn !== "number" || !Number.isFinite(payload.totalReturn)) return;

          selectedEventIds.add(key);
          selected.push({ row, details: payload });
        };

        const candidatesRes = await fetch(`${baseUrl}/api/polyoiyen/top-candidates?limit=50`, {
          method: "GET",
          cache: "no-store",
        });

        if (!candidatesRes.ok) {
          return NextResponse.json({ error: "Failed to load top candidates" }, { status: 500 });
        }

        const candidatesPayload = await candidatesRes.json();
        const categories = (candidatesPayload && typeof candidatesPayload === "object")
          ? (candidatesPayload as Record<string, unknown>).categories
          : undefined;

        const getRows = (categoryKey: string): CandidateRow[] => {
          if (!categories || typeof categories !== "object") return [];
          const rowsRaw = (categories as Record<string, unknown>)[categoryKey];
          if (!Array.isArray(rowsRaw)) return [];
          return rowsRaw
            .map((row) => {
              const rec = (row && typeof row === "object") ? (row as Record<string, unknown>) : {};
              const eventId = typeof rec.eventId === "string" ? rec.eventId : "";
              const title = typeof rec.title === "string" ? rec.title : "";
              const slug = typeof rec.slug === "string" ? rec.slug : "";
              return { eventId, title, slug };
            })
            .filter((r) => Boolean(r.eventId));
        };

        for (const categoryKey of desiredCategories) {
          const rows = getRows(categoryKey);
          let added = 0;
          for (const row of rows) {
            if (added >= perCategory) break;
            await tryAdd(row);
            if (selectedEventIds.has(String(row.eventId))) added += 1;
          }
        }

        if (selected.length < desiredCount) {
          for (const categoryKey of desiredCategories) {
            if (selected.length >= desiredCount) break;
            const rows = getRows(categoryKey);
            for (const row of rows) {
              if (selected.length >= desiredCount) break;
              await tryAdd(row);
            }
          }
        }

        for (const item of selected.slice(0, desiredCount)) {
          const details = item.details;
          const totalReturn = typeof details.totalReturn === "number" ? details.totalReturn : 0;
          const winRate = typeof details.winRate === "number" ? details.winRate : 0;
          const trades = typeof details.tradeCount === "number" ? details.tradeCount : null;
          const marketTitle = details.marketTitle || item.row.title || item.row.slug || details.marketQuestion || "";

          const id = await recordBacktestNotification({
            kind: "EVENT_BACKTEST_DETAILS",
            modelBacktestId,
            backtestVersionRunId: null,
            eventId: String(details.eventId),
            payload: {
              eventId: String(details.eventId),
              marketTitle,
              totalReturn,
              winRate,
              trades,
              returnDetails: details.returnDetails,
              createdAt: createdAt.toISOString(),
              source: "Test Split Notification (computed)",
            },
            send: () =>
              sendEventBacktestDetailsDiscord({
                eventId: String(details.eventId),
                totalReturn,
                winRate,
                trades: trades ?? null,
                statusLabel: "completed",
                createdAt,
                source: "Test Split Notification (computed)",
              }),
          });

          notificationIds.push(id);
        }

        return NextResponse.json({
          message: "Split notifications sent successfully (computed)",
          modelBacktestId,
          requested: desiredCount,
          sent: notificationIds.length,
          notificationIds,
          note:
            notificationIds.length < desiredCount
              ? "Not enough backtest events with return details were found to reach 10. Add more PolyBet rows to enable more events."
              : undefined,
        });
      } catch (error) {
        console.error("Failed to send split test notifications:", error);
        return NextResponse.json(
          { error: "Failed to send split test notifications", details: String(error) },
          { status: 500 }
        );
      }
    }

    try {
      eventBacktestLinks = await buildTopCandidateEventLinks();
    } catch {
      eventBacktestLinks = undefined;
    }

    const createdAt = new Date();
    const discordPayload = {
      modelBacktestId,
      modelName: "Test Model",
      modelVersion: "v1.0",
      runId: 12345,
      totalRuns: 10,
      aggregateWinRate: 55.5,
      avgReturn: 12.3,
      avgMaxDrawdown: -8.5,
      backtestStatus: "completed",
      createdAt,
      source: "Test Notification",
      eventBacktestLinks,
    };

    const notificationId = await recordBacktestNotification({
      kind: "BACKTEST_COMPLETED",
      modelBacktestId,
      backtestVersionRunId: null,
      payload: {
        ...discordPayload,
        createdAt: createdAt.toISOString(),
      },
      send: () => sendBacktestCompletedDiscord(discordPayload),
    });

    return NextResponse.json({
      message: "Test notification sent successfully",
      modelBacktestId,
      notificationId,
      dashboardUrl: `https://oiyen.quadrawebs.com/polyoiyen/TopBacktestModels`,
    });
  } catch (error) {
    console.error("Failed to send test notification:", error);
    return NextResponse.json(
      { error: "Failed to send test notification", details: String(error) },
      { status: 500 }
    );
  }
}
