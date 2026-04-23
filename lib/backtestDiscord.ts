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

function getBacktestDetailsUrl(): string {
  return `${getAppBaseUrl()}/polyoiyen/TopBacktestModels`;
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
          `[View Top Backtest Models](${getBacktestDetailsUrl()})`,
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

  const topRunLines = input.topRuns.length
    ? input.topRuns
        .map((row, idx) => {
          const position = idx + 1;
          const ret = formatPct(row.avgReturn);
          const wr = formatPct(row.aggregateWinRate);
          return `${position}. ${row.modelName} (${row.modelVersion}) | Return ${ret} | WR ${wr} | Runs ${row.totalRuns}`;
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
