"use client";

import { useEffect, useMemo, useState } from "react";
import {
	PolarAngleAxis,
	PolarGrid,
	PolarRadiusAxis,
	Radar,
	RadarChart,
	ResponsiveContainer,
	Tooltip,
	Legend,
} from "recharts";
import PolyHeader from "../PolyHeader";

type CategoryKey = "elonTweets" | "movieBoxOffice" | "fedRates" | "nbaGames";

type RadarMetric = {
	metric: string;
	[category: string]: string | number;
};

type RawMetricSet = {
	volatility: number;
	reactionSpeed: number;
	confidence: number;
	backtestWinRate: number;
	dataDensity: number;
};

type CategoryComputed = {
	key: CategoryKey;
	label: string;
	matchCount: number;
	usedEventTitles: string[];
	raw: RawMetricSet | null;
	error?: string;
};

type PolyMarketLite = {
	outcomePrices?: string;
	clobTokenIds?: string;
	closed?: boolean;
	active?: boolean;
};

type PolyEventLite = {
	id: string;
	title: string;
	description?: string;
	volume?: number;
	tags?: { label?: string; slug?: string }[];
	markets?: PolyMarketLite[];
};

type VolatilityRatingResponse = {
	metrics?: {
		yes?: { totalVolatilityRating?: number; averageVolatilityRatingPerHour?: number };
		no?: { totalVolatilityRating?: number; averageVolatilityRatingPerHour?: number };
	};
	points?: Array<{ yesPrice?: number | null }>;
	diagnostics?: { fetchedTrades?: number };
};

type PredictorsResponse = {
	uniquePredictors?: number;
	totalTrades?: number;
};

const CATEGORY_CONFIG: Array<{ key: CategoryKey; label: string; keywords: string[] }> = [
	{ key: "elonTweets", label: "Elon Tweets", keywords: ["elon", "musk", "tweet", "twitter", "x.com"] },
	{ key: "movieBoxOffice", label: "Movie Box Office", keywords: ["box office", "movie", "film", "opening weekend"] },
	{ key: "fedRates", label: "US Federal Reserve Interest Rates", keywords: ["federal reserve", "fed", "fomc", "rate hike", "rate cut", "interest rate"] },
	{ key: "nbaGames", label: "NBA Basketball games", keywords: ["nba", "basketball", "playoffs", "lakers", "celtics", "warriors"] },
];

const TOP_EVENTS_PER_CATEGORY = 2;
const MAX_EVENT_SCAN = 350;
const FALLBACK_SCORE = 15;

const chartColors = {
	elonTweets: "#f97316",
	movieBoxOffice: "#22c55e",
	fedRates: "#38bdf8",
	nbaGames: "#eab308",
};

function pickActiveMarket(markets: PolyMarketLite[] | undefined): PolyMarketLite | undefined {
	if (!Array.isArray(markets) || markets.length === 0) return undefined;
	return markets.find((m) => m.active !== false && m.closed !== true) || markets.find((m) => m.closed !== true) || markets[0];
}

function parseTokenIds(market: PolyMarketLite | undefined): { yes: string; no: string } {
	if (!market?.clobTokenIds) return { yes: "", no: "" };
	try {
		const ids = JSON.parse(market.clobTokenIds);
		return {
			yes: typeof ids?.[0] === "string" ? ids[0] : "",
			no: typeof ids?.[1] === "string" ? ids[1] : "",
		};
	} catch {
		return { yes: "", no: "" };
	}
}

function parseYesPrice(market: PolyMarketLite | undefined): number | null {
	if (!market?.outcomePrices) return null;
	try {
		const prices = JSON.parse(market.outcomePrices);
		const yes = Number(prices?.[0]);
		return Number.isFinite(yes) ? yes : null;
	} catch {
		return null;
	}
}

function toEventText(event: PolyEventLite): string {
	const title = event.title || "";
	const desc = event.description || "";
	const tags = (event.tags || []).map((t) => t.label || "").join(" ");
	return `${title} ${desc} ${tags}`.toLowerCase();
}

function average(nums: number[]): number {
	if (nums.length === 0) return 0;
	return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function computeTrendConsistency(points: Array<{ yesPrice?: number | null }> | undefined): number {
	if (!Array.isArray(points) || points.length < 4) return 50;

	const series = points
		.map((p) => (typeof p.yesPrice === "number" ? p.yesPrice : null))
		.filter((v): v is number => v != null);

	if (series.length < 4) return 50;

	const directions: number[] = [];
	for (let i = 1; i < series.length; i += 1) {
		const diff = series[i] - series[i - 1];
		if (Math.abs(diff) < 0.003) continue;
		directions.push(diff > 0 ? 1 : -1);
	}

	if (directions.length < 3) return 50;

	let sameDirectionCount = 0;
	for (let i = 1; i < directions.length; i += 1) {
		if (directions[i] === directions[i - 1]) sameDirectionCount += 1;
	}

	return (sameDirectionCount / (directions.length - 1)) * 100;
}

function normalizeMetricRows(rows: CategoryComputed[], key: keyof RawMetricSet): Record<CategoryKey, number> {
	const usable = rows.filter((r) => r.raw != null).map((r) => ({ key: r.key, value: r.raw![key] }));
	const result = {
		elonTweets: FALLBACK_SCORE,
		movieBoxOffice: FALLBACK_SCORE,
		fedRates: FALLBACK_SCORE,
		nbaGames: FALLBACK_SCORE,
	};

	if (usable.length === 0) return result;

	const values = usable.map((u) => u.value);
	const min = Math.min(...values);
	const max = Math.max(...values);

	for (const u of usable) {
		if (max === min) {
			result[u.key] = 70;
			continue;
		}
		const normalized = 35 + ((u.value - min) / (max - min)) * 60;
		result[u.key] = Math.round(Math.max(0, Math.min(100, normalized)));
	}

	return result;
}

async function fetchCategoryMetrics(category: { key: CategoryKey; label: string; keywords: string[] }, events: PolyEventLite[]): Promise<CategoryComputed> {
	const matched = events
		.filter((e) => category.keywords.some((kw) => toEventText(e).includes(kw)))
		.sort((a, b) => (b.volume || 0) - (a.volume || 0));

	const withMarkets = matched
		.map((event) => ({ event, market: pickActiveMarket(event.markets) }))
		.map((entry) => ({ ...entry, tokens: parseTokenIds(entry.market), yesPrice: parseYesPrice(entry.market) }))
		.filter((entry) => Boolean(entry.tokens.yes && entry.tokens.no))
		.slice(0, TOP_EVENTS_PER_CATEGORY);

	if (withMarkets.length === 0) {
		return {
			key: category.key,
			label: category.label,
			matchCount: matched.length,
			usedEventTitles: [],
			raw: null,
			error: "No active market with complete YES/NO token IDs in this category.",
		};
	}

	const endTime = new Date().toISOString();
	const startTime = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

	const eventResults = await Promise.all(
		withMarkets.map(async ({ event, tokens, yesPrice }) => {
			const attempt = async (limit: string, maxPages: string) => {
				const volParams = new URLSearchParams({
					yesAssetId: tokens.yes,
					noAssetId: tokens.no,
					startTime,
					endTime,
					bucketSeconds: "3600",
					limit,
					maxPages,
				});

				const predictorsParams = new URLSearchParams({
					assetIds: `${tokens.yes},${tokens.no}`,
					volume: String(event.volume || 0),
					limit,
					maxPages,
				});

				const [volRes, predictorsRes] = await Promise.all([
					fetch(`/api/polymarket/volatility-rating?${volParams.toString()}`),
					fetch(`/api/polymarket/predictors?${predictorsParams.toString()}`),
				]);

				if (!volRes.ok || !predictorsRes.ok) {
					const volText = volRes.ok ? "" : await volRes.text();
					const predText = predictorsRes.ok ? "" : await predictorsRes.text();
					throw new Error(`vol=${volRes.status} pred=${predictorsRes.status} ${volText || predText}`.trim());
				}

				const volData = (await volRes.json()) as VolatilityRatingResponse;
				const predictorsData = (await predictorsRes.json()) as PredictorsResponse;

				const totalVolatility = (volData.metrics?.yes?.totalVolatilityRating || 0) + (volData.metrics?.no?.totalVolatilityRating || 0);
				const avgReaction = ((volData.metrics?.yes?.averageVolatilityRatingPerHour || 0) + (volData.metrics?.no?.averageVolatilityRatingPerHour || 0)) / 2;
				const confidence = yesPrice != null ? Math.abs(yesPrice - 0.5) * 200 : 50;
				const backtest = computeTrendConsistency(volData.points);
				const tradeCount = Number(predictorsData.totalTrades || 0);
				const uniquePredictors = Number(predictorsData.uniquePredictors || 0);
				const density = Math.log1p(tradeCount) * 10 + Math.log1p(uniquePredictors) * 18;

				return {
					title: event.title,
					raw: {
						volatility: totalVolatility,
						reactionSpeed: avgReaction,
						confidence,
						backtestWinRate: backtest,
						dataDensity: density,
					},
				};
			};

			try {
				return await attempt("200", "80");
			} catch (primaryErr) {
				try {
					return await attempt("120", "40");
				} catch (retryErr) {
					const message = retryErr instanceof Error ? retryErr.message : String(primaryErr);
					return {
						title: event.title,
						raw: null as RawMetricSet | null,
						error: message,
					};
				}
			}
		})
	);

	const successful = eventResults.filter((r): r is { title: string; raw: RawMetricSet } => Boolean(r.raw));
	const failed = eventResults.filter((r) => !r.raw);

	if (successful.length === 0) {
		return {
			key: category.key,
			label: category.label,
			matchCount: matched.length,
			usedEventTitles: [],
			raw: null,
			error: failed.length > 0
				? `All sampled markets failed metrics fetch (${failed.map((f) => f.title).join(", ")}).`
				: "No metrics could be computed for this category.",
		};
	}

	return {
		key: category.key,
		label: category.label,
		matchCount: matched.length,
		usedEventTitles: successful.map((r) => r.title),
		raw: {
			volatility: average(successful.map((r) => r.raw.volatility)),
			reactionSpeed: average(successful.map((r) => r.raw.reactionSpeed)),
			confidence: average(successful.map((r) => r.raw.confidence)),
			backtestWinRate: average(successful.map((r) => r.raw.backtestWinRate)),
			dataDensity: average(successful.map((r) => r.raw.dataDensity)),
		},
		error: failed.length > 0 ? `Partial data: ${successful.length}/${eventResults.length} sampled markets succeeded.` : undefined,
	};
}

export default function CrossCategoryEventAnalysisPage() {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [rows, setRows] = useState<CategoryComputed[]>([]);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError(null);
			try {
				const params = new URLSearchParams({
					limit: String(MAX_EVENT_SCAN),
					offset: "0",
				});

				const eventsRes = await fetch(`/api/polymarket?${params.toString()}`, { cache: "no-store" });
				if (!eventsRes.ok) throw new Error("Failed to fetch active markets.");
				const payload = await eventsRes.json();
				const events: PolyEventLite[] = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [];

				const computed = await Promise.all(CATEGORY_CONFIG.map((cat) => fetchCategoryMetrics(cat, events)));
				if (cancelled) return;
				setRows(computed);
			} catch (e) {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : "Failed to compute chart metrics.");
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, []);

	const radarData = useMemo<RadarMetric[]>(() => {
		if (rows.length === 0) {
			return [
				{ metric: "Volatility", elonTweets: FALLBACK_SCORE, movieBoxOffice: FALLBACK_SCORE, fedRates: FALLBACK_SCORE, nbaGames: FALLBACK_SCORE },
				{ metric: "Reaction Speed", elonTweets: FALLBACK_SCORE, movieBoxOffice: FALLBACK_SCORE, fedRates: FALLBACK_SCORE, nbaGames: FALLBACK_SCORE },
				{ metric: "Confidence", elonTweets: FALLBACK_SCORE, movieBoxOffice: FALLBACK_SCORE, fedRates: FALLBACK_SCORE, nbaGames: FALLBACK_SCORE },
				{ metric: "Backtest Win Rate", elonTweets: FALLBACK_SCORE, movieBoxOffice: FALLBACK_SCORE, fedRates: FALLBACK_SCORE, nbaGames: FALLBACK_SCORE },
				{ metric: "Data Density", elonTweets: FALLBACK_SCORE, movieBoxOffice: FALLBACK_SCORE, fedRates: FALLBACK_SCORE, nbaGames: FALLBACK_SCORE },
			];
		}

		const volatility = normalizeMetricRows(rows, "volatility");
		const reaction = normalizeMetricRows(rows, "reactionSpeed");
		const confidence = normalizeMetricRows(rows, "confidence");
		const backtest = normalizeMetricRows(rows, "backtestWinRate");
		const density = normalizeMetricRows(rows, "dataDensity");

		return [
			{ metric: "Volatility", ...volatility },
			{ metric: "Reaction Speed", ...reaction },
			{ metric: "Confidence", ...confidence },
			{ metric: "Backtest Win Rate", ...backtest },
			{ metric: "Data Density", ...density },
		];
	}, [rows]);

	return (
		<div
			style={{
				minHeight: "100vh",
				background: "radial-gradient(circle at top, #2a1707 0%, #130902 38%, #0c0602 100%)",
				color: "#f5f5f4",
			}}
		>
			<PolyHeader active="Market" />

			<main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 54px" }}>
				<section style={{ marginBottom: 20 }}>
					<h1
						style={{
							margin: 0,
							fontSize: "clamp(24px, 3vw, 38px)",
							fontWeight: 800,
							letterSpacing: "-0.02em",
							color: "#fff7ed",
						}}
					>
						Cross-Category Spider Chart
					</h1>
					<p style={{ marginTop: 10, color: "rgba(255,255,255,0.72)", fontSize: 14, lineHeight: 1.65 }}>
						Live metrics are computed from active Polymarket events plus YES/NO trade behavior over the last 7 days.
						Scores are normalized to 0-100 for category-to-category comparison.
					</p>
				</section>

				{loading && (
					<div
						style={{
							marginBottom: 14,
							border: "1px solid rgba(255,255,255,0.12)",
							borderRadius: 12,
							background: "rgba(255,255,255,0.04)",
							padding: "10px 12px",
							fontSize: 13,
							color: "rgba(255,255,255,0.8)",
						}}
					>
						Computing real-time category metrics...
					</div>
				)}

				{error && (
					<div
						style={{
							marginBottom: 14,
							border: "1px solid rgba(248,113,113,0.42)",
							borderRadius: 12,
							background: "rgba(127,29,29,0.34)",
							padding: "10px 12px",
							fontSize: 13,
							color: "#fecaca",
						}}
					>
						{error}
					</div>
				)}

				<section
					style={{
						border: "1px solid rgba(255,255,255,0.12)",
						borderRadius: 18,
						background: "linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
						boxShadow: "0 10px 28px rgba(0,0,0,0.34)",
						padding: "16px 10px 10px",
					}}
				>
					<div style={{ width: "100%", height: 560 }}>
						<ResponsiveContainer>
							<RadarChart data={radarData} outerRadius="72%">
								<PolarGrid stroke="rgba(255,255,255,0.18)" />
								<PolarAngleAxis
									dataKey="metric"
									tick={{ fill: "rgba(255,255,255,0.86)", fontSize: 13, fontWeight: 700 }}
								/>
								<PolarRadiusAxis
									angle={90}
									domain={[0, 100]}
									tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
									axisLine={false}
									tickCount={6}
								/>
								<Tooltip
									formatter={(value) => [`${Number(value ?? 0)} / 100`, "Score"]}
									contentStyle={{
										border: "1px solid rgba(255,255,255,0.2)",
										borderRadius: 10,
										background: "rgba(20,10,3,0.92)",
										color: "#fff",
									}}
								/>
								<Legend wrapperStyle={{ color: "rgba(255,255,255,0.88)", fontSize: 13 }} />

								<Radar
									name="Elon Tweets"
									dataKey="elonTweets"
									stroke={chartColors.elonTweets}
									fill={chartColors.elonTweets}
									fillOpacity={0.14}
									strokeWidth={2.5}
									dot={{ r: 3 }}
								/>
								<Radar
									name="Movie Box Office"
									dataKey="movieBoxOffice"
									stroke={chartColors.movieBoxOffice}
									fill={chartColors.movieBoxOffice}
									fillOpacity={0.12}
									strokeWidth={2.5}
									dot={{ r: 3 }}
								/>
								<Radar
									name="US Federal Reserve Interest Rates"
									dataKey="fedRates"
									stroke={chartColors.fedRates}
									fill={chartColors.fedRates}
									fillOpacity={0.12}
									strokeWidth={2.5}
									dot={{ r: 3 }}
								/>
								<Radar
									name="NBA Basketball games"
									dataKey="nbaGames"
									stroke={chartColors.nbaGames}
									fill={chartColors.nbaGames}
									fillOpacity={0.12}
									strokeWidth={2.5}
									dot={{ r: 3 }}
								/>
							</RadarChart>
						</ResponsiveContainer>
					</div>
				</section>

				{rows.length > 0 && (
					<section
						style={{
							marginTop: 14,
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
							gap: 10,
						}}
					>
						{rows.map((row) => (
							<div
								key={row.key}
								style={{
									border: "1px solid rgba(255,255,255,0.12)",
									borderRadius: 12,
									background: "rgba(255,255,255,0.03)",
									padding: "10px 12px",
								}}
							>
								<div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{row.label}</div>
								<div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
									Matched events: {row.matchCount}
								</div>
								<div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.58)" }}>
									Used markets: {row.usedEventTitles.length > 0 ? row.usedEventTitles.join(" | ") : "none"}
								</div>
								{row.error && (
									<div style={{ marginTop: 4, fontSize: 11, color: "#fecaca" }}>{row.error}</div>
								)}
							</div>
						))}
					</section>
				)}

			</main>
		</div>
	);
}
