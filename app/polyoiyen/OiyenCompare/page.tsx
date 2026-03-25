"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PolyHeader from "../PolyHeader";

type BucketMinutes = 60 | 15 | 5;
type ChartMode = "area" | "scatter";

interface DensityPoint {
	ts: number;
	label: string;
	polyPullsPerMin: number;
	investPullsPerMin: number;
}

function clampNumber(v: number, min: number, max: number): number {
	if (!Number.isFinite(v)) return min;
	return Math.max(min, Math.min(max, v));
}

export default function OiyenComparePage() {
	const [bucketMinutes, setBucketMinutes] = useState<BucketMinutes>(60);
	const [chartMode, setChartMode] = useState<ChartMode>("area");
	const [hoursBack, setHoursBack] = useState(12);
	const [points, setPoints] = useState<DensityPoint[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sourceHint, setSourceHint] = useState<string>("");
	const [updatedAt, setUpdatedAt] = useState<string>("");

	const loadDensity = useCallback(async (isRefresh = false) => {
		if (isRefresh) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}
		setError(null);
		setSourceHint("");

		try {
			const res = await fetch(`/api/polyoiyen/pull-metrics?bucketMinutes=${bucketMinutes}&hoursBack=${hoursBack}`);
			if (!res.ok) {
				throw new Error("Failed to load pull metrics");
			}

			const data = await res.json();
			const rows = Array.isArray(data?.points) ? data.points : [];
			setPoints(rows as DensityPoint[]);
			setSourceHint("Using real API pull logs from server runtime: poly_probe (market data) vs invest_pull/invest_action (execution side).");
			setUpdatedAt(new Date().toLocaleTimeString());
		} catch (e) {
			setPoints([]);
			setError(e instanceof Error ? e.message : "Failed to load API call frequency comparison");
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [bucketMinutes, hoursBack]);

	useEffect(() => {
		let alive = true;
		async function run() {
			if (!alive) return;
			await loadDensity(false);
		}
		run();

		const interval = setInterval(() => {
			loadDensity(true);
		}, 60_000);

		return () => {
			alive = false;
			clearInterval(interval);
		};
	}, [loadDensity]);

	const summary = useMemo(() => {
		if (points.length === 0) {
			return {
				avgPoly: 0,
				avgInvest: 0,
				ratio: 0,
				totalPolyCalls: 0,
				totalInvestActions: 0,
			};
		}

		const avgPoly = points.reduce((acc, p) => acc + p.polyPullsPerMin, 0) / points.length;
		const avgInvest = points.reduce((acc, p) => acc + p.investPullsPerMin, 0) / points.length;
		const ratio = avgInvest > 0 ? avgPoly / avgInvest : avgPoly;
		const totalPolyCalls = points.reduce((acc, p) => acc + p.polyPullsPerMin * bucketMinutes, 0);
		const totalInvestActions = points.reduce((acc, p) => acc + p.investPullsPerMin * bucketMinutes, 0);

		return { avgPoly, avgInvest, ratio, totalPolyCalls, totalInvestActions };
	}, [points, bucketMinutes]);

	const chart = useMemo(() => {
		const chartW = 980;
		const chartH = 320;
		const padL = 52;
		const padR = 18;
		const padT = 18;
		const padB = 46;
		const plotW = chartW - padL - padR;
		const plotH = chartH - padT - padB;

		const maxY = Math.max(
			1,
			...points.map((p) => Math.max(p.polyPullsPerMin, p.investPullsPerMin))
		);

		const coords = points.map((p, i) => {
			const x = padL + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
			const yPoly = padT + (1 - p.polyPullsPerMin / maxY) * plotH;
			const yInvest = padT + (1 - p.investPullsPerMin / maxY) * plotH;
			return { x, yPoly, yInvest, point: p };
		});

		const polyLine = coords.map((c) => `${c.x},${c.yPoly}`).join(" ");
		const investLine = coords.map((c) => `${c.x},${c.yInvest}`).join(" ");
		const polyArea = `${padL},${padT + plotH} ${polyLine} ${padL + plotW},${padT + plotH}`;
		const investArea = `${padL},${padT + plotH} ${investLine} ${padL + plotW},${padT + plotH}`;

		return { chartW, chartH, padL, padT, plotW, plotH, maxY, coords, polyLine, investLine, polyArea, investArea };
	}, [points]);

	const insightText = useMemo(() => {
		if (summary.avgInvest <= 0) {
			return "🛰️ Monitoring is active while 🎯 execution is sparse or unavailable in this window. This is expected when strategy is selective or account data is not accessible.";
		}
		return `🛰️ PolyOiyen monitors about ${summary.avgPoly.toFixed(2)} pulls/min while 🎯 Oiyen.Invest executes ${summary.avgInvest.toFixed(2)} actions/min. Monitoring is ${summary.ratio.toFixed(1)}x denser and supports selective execution.`;
	}, [summary]);

	return (
		<div style={{ background: "#160c03", minHeight: "100vh", color: "white", fontFamily: "'DM Sans', sans-serif" }}>
			<PolyHeader active="OiyenCompare" />

			<main style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 24px 68px" }}>
				<h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: "#f97316", fontSize: 34 }}>
					🛰️ vs 🎯 API Call Frequency & Data Density
				</h1>
				<p style={{ marginTop: 8, color: "rgba(255,255,255,0.56)", fontSize: 14 }}>
					Compare high-frequency PolyOiyen monitoring against lower-frequency Oiyen.Invest execution to show finer-grain sensing drives precise actions.
				</p>

				<div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
					<select
						value={bucketMinutes}
						onChange={(e) => setBucketMinutes(Number(e.target.value) as BucketMinutes)}
						style={{ background: "#1f140b", color: "white", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "7px 10px", fontSize: 12 }}
					>
						<option value={60}>Snapshot: 60m</option>
						<option value={15}>Snapshot: 15m</option>
						<option value={5}>Snapshot: 5m</option>
					</select>

					<select
						value={chartMode}
						onChange={(e) => setChartMode(e.target.value as ChartMode)}
						style={{ background: "#1f140b", color: "white", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "7px 10px", fontSize: 12 }}
					>
						<option value="area">Area Chart</option>
						<option value="scatter">Scatter Plot</option>
					</select>

					<label style={{ display: "flex", alignItems: "center", gap: 6, background: "#1f140b", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "7px 10px", fontSize: 12 }}>
						Window (hours)
						<input
							type="number"
							min={1}
							max={48}
							value={hoursBack}
							onChange={(e) => setHoursBack(clampNumber(Number(e.target.value), 1, 48))}
							style={{ width: 56, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white", borderRadius: 6, padding: "4px 6px" }}
						/>
					</label>

					<button
						onClick={() => loadDensity(true)}
						disabled={refreshing}
						style={{ border: "1px solid rgba(249,115,22,0.35)", color: "#f97316", background: refreshing ? "rgba(249,115,22,0.07)" : "rgba(249,115,22,0.12)", borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 700, cursor: refreshing ? "not-allowed" : "pointer" }}
					>
						{refreshing ? "Refreshing..." : "Refresh"}
					</button>
				</div>

				<div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.56)" }}>
					Updated: {updatedAt || "--:--:--"}
				</div>

				{sourceHint && (
					<div style={{ marginTop: 10, border: "1px solid rgba(96,165,250,0.34)", borderRadius: 10, padding: "10px 12px", color: "#bfdbfe", fontSize: 12, background: "rgba(96,165,250,0.08)" }}>
						{sourceHint}
					</div>
				)}

				{error && (
					<div style={{ marginTop: 10, border: "1px solid rgba(248,113,113,0.35)", borderRadius: 10, padding: "10px 12px", color: "#fecaca", fontSize: 12, background: "rgba(248,113,113,0.08)" }}>
						{error}
					</div>
				)}

				<div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
					<div style={{ border: "1px solid rgba(255,255,255,0.11)", borderRadius: 12, background: "rgba(255,255,255,0.02)", padding: 12 }}>
						<div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>🛰️ Avg Poly Pulls/min</div>
						<div style={{ marginTop: 6, color: "#34d399", fontWeight: 800, fontSize: 24 }}>{summary.avgPoly.toFixed(2)}</div>
					</div>
					<div style={{ border: "1px solid rgba(255,255,255,0.11)", borderRadius: 12, background: "rgba(255,255,255,0.02)", padding: 12 }}>
						<div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>🎯 Avg Oiyen Pulls/min</div>
						<div style={{ marginTop: 6, color: "#60a5fa", fontWeight: 800, fontSize: 24 }}>{summary.avgInvest.toFixed(2)}</div>
					</div>
					<div style={{ border: "1px solid rgba(255,255,255,0.11)", borderRadius: 12, background: "rgba(255,255,255,0.02)", padding: 12 }}>
						<div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Density Ratio (🛰️/🎯)</div>
						<div style={{ marginTop: 6, color: "#f97316", fontWeight: 800, fontSize: 24 }}>{summary.ratio.toFixed(1)}x</div>
					</div>
					<div style={{ border: "1px solid rgba(255,255,255,0.11)", borderRadius: 12, background: "rgba(255,255,255,0.02)", padding: 12 }}>
						<div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Window Totals</div>
						<div style={{ marginTop: 6, color: "rgba(255,255,255,0.9)", fontWeight: 700, fontSize: 14 }}>
							🛰️ {Math.round(summary.totalPolyCalls).toLocaleString()} calls · 🎯 {Math.round(summary.totalInvestActions).toLocaleString()} actions
						</div>
					</div>
				</div>

				<div style={{ marginTop: 14, border: "1px solid rgba(249,115,22,0.25)", borderRadius: 12, background: "rgba(249,115,22,0.06)", padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
					{insightText}
				</div>

				<div style={{ marginTop: 14, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
					{loading ? (
						<div style={{ padding: "16px 12px", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Loading API density comparison...</div>
					) : points.length === 0 ? (
						<div style={{ padding: "16px 12px", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>No data points in selected window.</div>
					) : (
						<div style={{ overflowX: "auto" }}>
							<svg viewBox={`0 0 ${chart.chartW} ${chart.chartH}`} style={{ width: "100%", minWidth: 760, height: 320, display: "block" }}>
								{[0, 25, 50, 75, 100].map((tick) => {
									const y = chart.padT + (1 - tick / 100) * chart.plotH;
									return (
										<g key={tick}>
											<line x1={chart.padL} y1={y} x2={chart.padL + chart.plotW} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
											<text x={chart.padL - 10} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="'DM Mono', monospace">
												{((tick / 100) * chart.maxY).toFixed(2)}
											</text>
										</g>
									);
								})}

								<line x1={chart.padL} y1={chart.padT + chart.plotH} x2={chart.padL + chart.plotW} y2={chart.padT + chart.plotH} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
								<line x1={chart.padL} y1={chart.padT} x2={chart.padL} y2={chart.padT + chart.plotH} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />

								{chartMode === "area" && (
									<>
										<polygon points={chart.polyArea} fill="rgba(52,211,153,0.20)" />
										<polygon points={chart.investArea} fill="rgba(96,165,250,0.20)" />
									</>
								)}

								<polyline fill="none" stroke="#34d399" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={chart.polyLine} />
								<polyline fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" points={chart.investLine} />

								{chartMode === "scatter" && chart.coords.map((c) => (
									<g key={`scatter-${c.point.ts}`}>
										<circle cx={c.x} cy={c.yPoly} r={3.4} fill="#34d399">
											<title>{`${c.point.label} | Poly pulls/min: ${c.point.polyPullsPerMin.toFixed(2)}`}</title>
										</circle>
										<circle cx={c.x} cy={c.yInvest} r={3.4} fill="#60a5fa">
											<title>{`${c.point.label} | Oiyen pulls/min: ${c.point.investPullsPerMin.toFixed(2)}`}</title>
										</circle>
									</g>
								))}

								{chart.coords.map((c, i) => {
									if (i % Math.ceil(chart.coords.length / 10) !== 0 && i !== chart.coords.length - 1) return null;
									return (
										<text
											key={`x-${c.point.ts}`}
											x={c.x}
											y={chart.padT + chart.plotH + 18}
											textAnchor="middle"
											fill="rgba(255,255,255,0.42)"
											fontSize="10"
											fontFamily="'DM Mono', monospace"
										>
											{c.point.label}
										</text>
									);
								})}
							</svg>
						</div>
					)}

					<div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "8px 12px 12px", fontSize: 11 }}>
						<span style={{ color: "#34d399" }}>🛰️ PolyOiyen Pulls/min</span>
						<span style={{ color: "#60a5fa" }}>🎯 Oiyen.Invest Pulls/min</span>
						<span style={{ color: "rgba(255,255,255,0.64)" }}>Mode: {chartMode === "area" ? "Area Chart" : "Scatter Plot"}</span>
					</div>
				</div>

				<div style={{ marginTop: 14, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
					<div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.54)", fontWeight: 700 }}>
						<span>Time</span>
						<span style={{ textAlign: "right" }}>🛰️ Poly/min</span>
						<span style={{ textAlign: "right" }}>🎯 Invest/min</span>
					</div>

					{points.slice(-14).map((p) => (
						<div key={p.ts} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
							<span style={{ color: "rgba(255,255,255,0.82)", fontFamily: "'DM Mono', monospace" }}>{p.label}</span>
							<span style={{ textAlign: "right", color: "#34d399", fontWeight: 700 }}>{p.polyPullsPerMin.toFixed(2)}</span>
							<span style={{ textAlign: "right", color: "#60a5fa", fontWeight: 700 }}>{p.investPullsPerMin.toFixed(2)}</span>
						</div>
					))}
				</div>
			</main>
		</div>
	);
}

