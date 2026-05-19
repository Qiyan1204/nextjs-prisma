type CompletionNotificationInput = {
  modelBacktestId: number;
  modelName: string;
  modelVersion: string;
  runId: number;
  totalRuns: number;
  aggregateWinRate: number | null;
  avgReturn: number | null;
  avgMaxDrawdown: number | null;
  backtestStatus: string;
  createdAt: Date;
  source?: string;
  eventBacktestLinks?: Array<{
    eventId: string | number;
    label?: string;
    totalReturn?: number | null;
  }>;
};

type SummaryTopRun = {
  runId: number;
  modelBacktestId: number;
  modelName: string;
  modelVersion: string;
  avgReturn: number | null;
  aggregateWinRate: number | null;
  totalRuns: number;
  backtestStatus: string;
};

type DailySummaryInput = {
  periodLabel: string;
  totalCompleted: number;
  avgReturn: number | null;
  avgWinRate: number | null;
  statusCounts: Record<string, number>;
  topRuns: SummaryTopRun[];
};

type EventBacktestDetailsInput = {
  eventId: string | number;
  eventTitle?: string;
  totalReturn: number | null;
  winRate: number | null;
  trades: number | null;
  statusLabel: string;
  createdAt: Date;
  timeZone?: string;
  source?: string;
};

type BacktestEventItem = {
  eventId?: string | number;
  eventTitle?: string;
  marketQuestion?: string;
  totalReturn?: number | null;
};

type BacktestEventLinks = {
  winners: string[];
  losers: string[];
};

type BacktestEventBacktestLinks = {
  lines: string[];
};

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatStatus(value: string): string {
  return (value || "unknown").toUpperCase();
}

function getAppBaseUrl(): string {
  return (process.env.POLYOIYEN_BASE_URL || "https://oiyen.quadrawebs.com").replace(/\/$/, "");
}

function getEventDetailsUrl(eventId: string | number): string {
  return `${getAppBaseUrl()}/polyoiyen/${eventId}`;
}

function getTopBacktestModelsUrl(): string {
  return `${getAppBaseUrl()}/polyoiyen/TopBacktestModels`;
}

function getBacktestEventDetailsUrl(eventId: string | number): string {
  return `${getAppBaseUrl()}/polyoiyen/backtest-event/${eventId}`;
}

function formatEventBacktestLine(
  idx: number,
  input: { eventId: string | number; label?: string; totalReturn?: number | null }
): string {
  const title = trimTitle(input.label, 64);
  const totalReturn = toFiniteNumber(input.totalReturn);
  const prefix = totalReturn == null ? "" : `Return ${formatPct(totalReturn)} • `;
  return `${idx}. [${prefix}${title}](${getBacktestEventDetailsUrl(input.eventId)})`;
}

async function resolveDailyTopRunLink(modelBacktestId: number): Promise<{ label: string; url: string }> {
  const enabled = process.env.BACKTEST_INCLUDE_EVENT_LINKS !== "false";
  if (!enabled || !isValidBacktestId(modelBacktestId)) {
    return {
      label: "View Top Backtest Models",
      url: getTopBacktestModelsUrl(),
    };
  }

  try {
    const url = `${getAppBaseUrl()}/api/polyoiyen/backtest-versions/${modelBacktestId}`;
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      return {
        label: "View Top Backtest Models",
        url: getTopBacktestModelsUrl(),
      };
    }

    const payload = await res.json();
    const eventId = payload?.runs?.[0]?.worstEvents?.[0]?.eventId;
    if (eventId == null || String(eventId).trim() === "") {
      return {
        label: "View Top Backtest Models",
        url: getTopBacktestModelsUrl(),
      };
    }

    return {
      label: "View Backtest Event Details",
      url: getBacktestEventDetailsUrl(eventId),
    };
  } catch {
    return {
      label: "View Top Backtest Models",
      url: getTopBacktestModelsUrl(),
    };
  }
}

function isValidBacktestId(modelBacktestId: number): boolean {
  return Number.isInteger(modelBacktestId) && modelBacktestId > 0;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function trimTitle(value: string | undefined, maxLen = 52): string {
  if (!value) return "Unknown Event";
  const text = value.trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

function formatBacktestDateTime(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

async function resolveEventLinks(modelBacktestId: number): Promise<BacktestEventLinks> {
  const enabled = process.env.BACKTEST_INCLUDE_EVENT_LINKS !== "false";
  if (!enabled || !isValidBacktestId(modelBacktestId)) {
    return { winners: [], losers: [] };
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.BACKTEST_EVENT_LINK_TIMEOUT_MS || "2500");
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 2500);

  try {
    const url = `${getAppBaseUrl()}/api/polyoiyen/backtest-versions/${modelBacktestId}`;
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return { winners: [], losers: [] };

    const payload = await res.json();
    const rawEvents = payload?.runs?.[0]?.worstEvents;
    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return { winners: [], losers: [] };
    }

    const normalized = rawEvents
      .map((row: BacktestEventItem) => {
        const eventId = row?.eventId != null ? String(row.eventId).trim() : "";
        const totalReturn = toFiniteNumber(row?.totalReturn);
        const title = trimTitle(row?.eventTitle || row?.marketQuestion);
        if (!eventId || totalReturn == null) return null;
        return { eventId, totalReturn, title };
      })
      .filter((row): row is { eventId: string; totalReturn: number; title: string } => Boolean(row));

    if (normalized.length === 0) return { winners: [], losers: [] };

    const byLoss = [...normalized].sort((a, b) => a.totalReturn - b.totalReturn);
    const byWin = [...normalized].sort((a, b) => b.totalReturn - a.totalReturn);

    const losers = byLoss.slice(0, 3).map((evt) => {
      const ret = `${evt.totalReturn >= 0 ? "+" : ""}${evt.totalReturn.toFixed(2)}%`;
      return `[LOSS ${ret} • ${evt.title}](${getEventDetailsUrl(evt.eventId)})`;
    });

    const winnerSeen = new Set(losers.map((line) => line.match(/\/polyoiyen\/(\d+)/)?.[1]).filter(Boolean));
    const winners = byWin
      .filter((evt) => !winnerSeen.has(evt.eventId))
      .slice(0, 3)
      .map((evt) => {
        const ret = `${evt.totalReturn >= 0 ? "+" : ""}${evt.totalReturn.toFixed(2)}%`;
        return `[WIN ${ret} • ${evt.title}](${getEventDetailsUrl(evt.eventId)})`;
      });

    return { winners, losers };
  } catch {
    return { winners: [], losers: [] };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveEventBacktestLinks(modelBacktestId: number, limit = 10): Promise<BacktestEventBacktestLinks> {
  const enabled = process.env.BACKTEST_INCLUDE_EVENT_LINKS !== "false";
  if (!enabled || !isValidBacktestId(modelBacktestId)) {
    return { lines: [] };
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.BACKTEST_EVENT_LINK_TIMEOUT_MS || "2500");
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 2500);

  try {
    const url = `${getAppBaseUrl()}/api/polyoiyen/backtest-versions/${modelBacktestId}`;
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return { lines: [] };

    const payload = await res.json();
    const rawEvents = payload?.runs?.[0]?.worstEvents;
    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return { lines: [] };
    }

    const normalized = rawEvents
      .map((row: BacktestEventItem) => {
        const eventId = row?.eventId != null ? String(row.eventId).trim() : "";
        const totalReturn = toFiniteNumber(row?.totalReturn);
        const label = trimTitle(row?.eventTitle || row?.marketQuestion, 64);
        if (!eventId) return null;
        return { eventId, totalReturn, label };
      })
      .filter((row): row is { eventId: string; totalReturn: number | null; label: string } => Boolean(row));

    if (normalized.length === 0) return { lines: [] };

    const sorted = [...normalized].sort((a, b) => (a.totalReturn ?? 0) - (b.totalReturn ?? 0));
    const limited = sorted.slice(0, Math.max(1, limit));

    return {
      lines: limited.map((evt, idx) =>
        formatEventBacktestLine(idx + 1, {
          eventId: evt.eventId,
          label: evt.label,
          totalReturn: evt.totalReturn,
        })
      ),
    };
  } catch {
    return { lines: [] };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveBacktestLink(modelBacktestId: number): Promise<{ label: string; url: string }> {
  return {
    label: "View Top Backtest Models",
    url: getTopBacktestModelsUrl(),
  };
}

async function postDiscord(payload: unknown): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook failed (${res.status}): ${text}`);
  }
}

export async function sendBacktestCompletedDiscord(input: CompletionNotificationInput): Promise<void> {
  const resolvedEventLinks = input.eventBacktestLinks?.length
    ? {
        lines: input.eventBacktestLinks
          .slice(0, 10)
          .map((evt, idx) => formatEventBacktestLine(idx + 1, evt)),
      }
    : await resolveEventBacktestLinks(input.modelBacktestId, 10);

  const eventSection = resolvedEventLinks.lines.length
    ? ["", "**Event Backtest Details (Top 10)**", ...resolvedEventLinks.lines]
    : [];

  const payload = {
    embeds: [
      {
        title: "Backtest Completed",
        description: [
          `**Model:** ${input.modelName} (${input.modelVersion})`,
          `**Status:** ${formatStatus(input.backtestStatus)}`,
          `**Runs:** ${input.totalRuns.toLocaleString()}`,
          `**Avg Return:** ${formatPct(input.avgReturn)}`,
          `**Win Rate:** ${formatPct(input.aggregateWinRate)}`,
          `**Max Drawdown:** ${formatPct(input.avgMaxDrawdown)}`,
          input.source ? `**Source:** ${input.source}` : null,
          ...eventSection,
          "",
          `[View Top Backtest Models](${getTopBacktestModelsUrl()})`,
        ]
          .filter(Boolean)
          .join("\n"),
        color: 0x22c55e,
        footer: { text: `PolyOiyen Backtest • Run #${input.runId}` },
        timestamp: input.createdAt.toISOString(),
      },
    ],
  };

  await postDiscord(payload);
}

export async function sendBacktestDailySummaryDiscord(input: DailySummaryInput): Promise<void> {
  const statusLine = Object.entries(input.statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${formatStatus(key)}: ${count}`)
    .join(" | ");

  const topRunsWithLinks = await Promise.all(
    input.topRuns.map(async (row) => ({
      row,
      link: await resolveDailyTopRunLink(row.modelBacktestId),
    }))
  );

  const topRunLines = topRunsWithLinks.length
    ? topRunsWithLinks
        .map(({ row, link }, idx) => {
          const position = idx + 1;
          const ret = formatPct(row.avgReturn);
          const wr = formatPct(row.aggregateWinRate);
          return `${position}. [${row.modelName} (${row.modelVersion})](${link.url}) | Return ${ret} | WR ${wr} | Runs ${row.totalRuns}`;
        })
        .join("\n")
    : "No completed backtests in this window.";

  const payload = {
    embeds: [
      {
        title: "Daily Backtest Summary",
        description: [
          `**Period:** ${input.periodLabel}`,
          `**Completed Runs:** ${input.totalCompleted}`,
          `**Average Return:** ${formatPct(input.avgReturn)}`,
          `**Average Win Rate:** ${formatPct(input.avgWinRate)}`,
          statusLine ? `**Statuses:** ${statusLine}` : null,
          "",
          "**Top Runs**",
          topRunLines,
          "",
          `[View Top Backtest Models](${getTopBacktestModelsUrl()})`,
        ]
          .filter((line) => line !== null)
          .join("\n"),
        color: 0x3b82f6,
        footer: { text: "PolyOiyen Backtest Daily" },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  await postDiscord(payload);
}

export async function sendEventBacktestDetailsDiscord(input: EventBacktestDetailsInput): Promise<void> {
  const timeZone = input.timeZone || process.env.POLYOIYEN_NOTIFY_TZ || "Asia/Kuala_Lumpur";
  const detailsUrl = getBacktestEventDetailsUrl(input.eventId);
  const footerTimestamp = formatBacktestDateTime(input.createdAt, timeZone);
  const titleLabel = trimTitle(input.eventTitle ? String(input.eventTitle) : `Event ${String(input.eventId)}`, 72);

  const payload = {
    embeds: [
      {
        title: `Market Backtest Completed • ${titleLabel}`,
        url: detailsUrl,
        description: [
          "Click title to open details page",
          "",
          "Event ID",
          String(input.eventId),
          "Event Title",
          input.eventTitle ? trimTitle(String(input.eventTitle), 120) : "N/A",
          "Total Return",
          formatPct(input.totalReturn),
          "Win Rate",
          formatPct(input.winRate),
          "Trades",
          input.trades != null && Number.isFinite(input.trades) ? Number(input.trades).toLocaleString() : "N/A",
          "Status",
          input.statusLabel || "Unknown",
          "Link",
          detailsUrl,
          input.source ? `Source: ${input.source}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        color: 0xf97316,
        footer: { text: `PolyOiyen Backtest • ${footerTimestamp}` },
        timestamp: input.createdAt.toISOString(),
      },
    ],
  };

  await postDiscord(payload);
}
