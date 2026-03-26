"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PolyHeader from "../PolyHeader";

type Impact = "low" | "medium" | "high";
type Category = "macro" | "earnings" | "crypto" | "policy" | "custom" | "position";
type EventSource = "manual" | "position";
type PositionSide = "YES" | "NO";

type CalendarEvent = {
	id: string;
	dateKey: string;
	time: string;
	title: string;
	impact: Impact;
	category: Category;
	source: EventSource;
	side?: PositionSide;
	eventId?: string;
};

type DraftEvent = {
	title: string;
	time: string;
	impact: Impact;
	category: Category;
};

const STORAGE_KEY = "polyoiyen-mycalendar-events-v1";

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const IMPACT_LABEL: Record<Impact, string> = {
	low: "Low Impact",
	medium: "Medium Impact",
	high: "High Impact",
};

const CATEGORY_LABEL: Record<Category, string> = {
	macro: "Macro",
	earnings: "Earnings",
	crypto: "Crypto",
	policy: "Policy",
	custom: "Custom",
	position: "My Position",
};

type PolyBetLite = {
	eventId: string;
	marketQuestion: string;
	side: PositionSide;
	type?: string;
	shares?: string | number;
};

type PolyEventLite = {
	id: string;
	title?: string;
	endDate?: string;
};

const SEED_EVENTS: CalendarEvent[] = [
	{ id: "seed-1", dateKey: "", time: "08:30", title: "US CPI Release", impact: "high", category: "macro", source: "manual" },
	{ id: "seed-2", dateKey: "", time: "14:00", title: "FOMC Minutes", impact: "high", category: "policy", source: "manual" },
	{ id: "seed-3", dateKey: "", time: "16:30", title: "NVDA Earnings Call", impact: "medium", category: "earnings", source: "manual" },
	{ id: "seed-4", dateKey: "", time: "10:00", title: "BTC ETF Net Flow Update", impact: "medium", category: "crypto", source: "manual" },
	{ id: "seed-5", dateKey: "", time: "09:15", title: "ECB President Speech", impact: "low", category: "policy", source: "manual" },
];

function pad2(num: number) {
	return String(num).padStart(2, "0");
}

function toDateKey(date: Date) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(dateKey: string) {
	const [y, m, d] = dateKey.split("-").map(Number);
	return new Date(y, m - 1, d);
}

function formatFullDate(dateKey: string) {
	return parseDateKey(dateKey).toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

function startOfMonthGrid(anchor: Date) {
	const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
	const day = first.getDay();
	const offset = (day + 6) % 7;
	const gridStart = new Date(first);
	gridStart.setDate(first.getDate() - offset);
	return gridStart;
}

function buildMonthGrid(anchor: Date) {
	const start = startOfMonthGrid(anchor);
	const days: Date[] = [];
	for (let i = 0; i < 42; i += 1) {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		days.push(d);
	}
	return days;
}

function eventSort(a: CalendarEvent, b: CalendarEvent) {
	return a.time.localeCompare(b.time);
}

function getSeededEvents() {
	const now = new Date();
	const base = new Date(now.getFullYear(), now.getMonth(), 1);
	const dates = [4, 9, 13, 18, 24];

	return SEED_EVENTS.map((event, idx) => {
		const d = new Date(base);
		d.setDate(dates[idx]);
		return {
			...event,
			dateKey: toDateKey(d),
		};
	});
}

function getImpactPriority(impact: Impact) {
	if (impact === "high") return 3;
	if (impact === "medium") return 2;
	return 1;
}

function normalizeStoredEvents(rawEvents: CalendarEvent[]) {
	return rawEvents.map((event) => ({
		...event,
		source: event.source ?? "manual",
	}));
}

function toNum(v: unknown) {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}

function buildPositionReminders(bets: PolyBetLite[], eventMap: Map<string, PolyEventLite>) {
	const byPosition = new Map<string, { netShares: number; title: string; side: PositionSide; eventId: string }>();

	for (const bet of bets) {
		if (!bet.eventId || (bet.side !== "YES" && bet.side !== "NO")) continue;

		const key = `${bet.eventId}::${bet.side}`;
		const curr = byPosition.get(key) ?? {
			netShares: 0,
			title: bet.marketQuestion,
			side: bet.side,
			eventId: bet.eventId,
		};

		if ((bet.type || "BUY") === "BUY") {
			curr.netShares += toNum(bet.shares);
		} else if (bet.type === "SELL") {
			curr.netShares -= toNum(bet.shares);
		}

		byPosition.set(key, curr);
	}

	const reminders: CalendarEvent[] = [];
	for (const position of byPosition.values()) {
		if (position.netShares <= 0) continue;

		const event = eventMap.get(position.eventId);
		if (!event?.endDate) continue;

		const endDate = new Date(event.endDate);
		if (Number.isNaN(endDate.getTime())) continue;

		const dateKey = toDateKey(endDate);
		const displayTitle = event.title || position.title || "Market Position";

		reminders.push({
			id: `position-${position.eventId}-${position.side}`,
			dateKey,
			time: "23:59",
			title: `[${position.side}] ${displayTitle} ends today`,
			impact: "high",
			category: "position",
			source: "position",
			side: position.side,
			eventId: position.eventId,
		});
	}

	return reminders;
}

export default function MyCalendarPage() {
	const todayKey = toDateKey(new Date());

	const [monthAnchor, setMonthAnchor] = useState(() => {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), 1);
	});
	const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
	const [manualEvents, setManualEvents] = useState<CalendarEvent[]>([]);
	const [positionEvents, setPositionEvents] = useState<CalendarEvent[]>([]);
	const [positionSyncError, setPositionSyncError] = useState<string | null>(null);
	const [draft, setDraft] = useState<DraftEvent>({
		title: "",
		time: "09:00",
		impact: "medium",
		category: "custom",
	});

	useEffect(() => {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as CalendarEvent[];
				setManualEvents(normalizeStoredEvents(parsed));
				return;
			} catch {
				// Ignore invalid local data and fallback to seed events.
			}
		}
		setManualEvents(getSeededEvents());
	}, []);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(manualEvents));
	}, [manualEvents]);

	useEffect(() => {
		let alive = true;

		async function syncPositionReminders() {
			try {
				setPositionSyncError(null);
				const betRes = await fetch("/api/polybets", { cache: "no-store" });
				if (!betRes.ok) {
					if (betRes.status === 401 && alive) {
						setPositionEvents([]);
						return;
					}
					throw new Error("Failed to load user positions");
				}

				const betPayload = await betRes.json();
				const bets = (betPayload?.bets ?? []) as PolyBetLite[];
				const eventIds = Array.from(new Set(bets.map((b) => b.eventId).filter(Boolean)));

				if (eventIds.length === 0) {
					if (alive) setPositionEvents([]);
					return;
				}

				const detailRows = await Promise.all(
					eventIds.map(async (eventId) => {
						try {
							const res = await fetch(`/api/polymarket?id=${encodeURIComponent(eventId)}`, { cache: "no-store" });
							if (!res.ok) return null;
							const payload = await res.json();
							const event = Array.isArray(payload?.events) ? payload.events[0] : null;
							if (!event) return null;
							return {
								id: eventId,
								title: event.title,
								endDate: event.endDate,
							} as PolyEventLite;
						} catch {
							return null;
						}
					})
				);

				const eventMap = new Map<string, PolyEventLite>();
				for (const row of detailRows) {
					if (row?.id) eventMap.set(row.id, row);
				}

				const reminders = buildPositionReminders(bets, eventMap);
				if (alive) setPositionEvents(reminders);
			} catch (error) {
				if (!alive) return;
				setPositionEvents([]);
				setPositionSyncError(error instanceof Error ? error.message : "Failed to sync position reminders");
			}
		}

		syncPositionReminders();
		return () => {
			alive = false;
		};
	}, []);

	const events = useMemo(() => [...manualEvents, ...positionEvents], [manualEvents, positionEvents]);

	const gridDays = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);

	const eventsByDate = useMemo(() => {
		const map = new Map<string, CalendarEvent[]>();
		for (const event of events) {
			const current = map.get(event.dateKey) ?? [];
			current.push(event);
			map.set(event.dateKey, current);
		}
		for (const [k, list] of map.entries()) {
			map.set(k, [...list].sort(eventSort));
		}
		return map;
	}, [events]);

	const selectedEvents = eventsByDate.get(selectedDateKey) ?? [];

	const monthLabel = monthAnchor.toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
	});

	const stats = useMemo(() => {
		const upcoming = events
			.filter((event) => parseDateKey(event.dateKey).getTime() >= parseDateKey(todayKey).getTime())
			.sort((a, b) => {
				if (a.dateKey === b.dateKey) return a.time.localeCompare(b.time);
				return a.dateKey.localeCompare(b.dateKey);
			});

		const highImpactCount = upcoming.filter((event) => event.impact === "high").length;

		let busiestDateKey = "";
		let busiestCount = 0;
		for (const [dateKey, list] of eventsByDate.entries()) {
			if (list.length > busiestCount) {
				busiestDateKey = dateKey;
				busiestCount = list.length;
			}
		}

		const avgImpact =
			upcoming.length > 0
				? upcoming.reduce((acc, event) => acc + getImpactPriority(event.impact), 0) / upcoming.length
				: 0;

		return {
			upcomingCount: upcoming.length,
			highImpactCount,
			busiestDateKey,
			busiestCount,
			avgImpact,
		};
	}, [events, eventsByDate, todayKey]);

	const handlePrevMonth = () => {
		setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
	};

	const handleNextMonth = () => {
		setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
	};

	const handleGoToday = () => {
		const now = new Date();
		setMonthAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
		setSelectedDateKey(toDateKey(now));
	};

	const handleCreateEvent = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const title = draft.title.trim();
		if (!title) return;

		const newEvent: CalendarEvent = {
			id: `${selectedDateKey}-${Date.now()}`,
			dateKey: selectedDateKey,
			time: draft.time,
			title,
			impact: draft.impact,
			category: draft.category,
			source: "manual",
		};

		setManualEvents((prev) => [...prev, newEvent]);
		setDraft((prev) => ({ ...prev, title: "" }));
	};

	const removeEvent = (eventId: string) => {
		setManualEvents((prev) => prev.filter((event) => event.id !== eventId));
	};

	return (
		<div className="cal-root">
			<style>{CALENDAR_CSS}</style>
			<PolyHeader active="MyCalendar" />

			<div className="cal-shell">
				<section className="cal-hero card">
					<div>
						<p className="cal-kicker">Event Intelligence</p>
						<h1 className="cal-title">MyCalendar</h1>
						<p className="cal-sub">
							Track macro prints, policy meetings, and earnings catalysts in one timeline. Built for fast pre-market prep.
						</p>
					</div>
					<div className="cal-stat-grid">
						<div className="cal-stat">
							<p className="cal-stat-label">Upcoming Events</p>
							<p className="cal-stat-value">{stats.upcomingCount}</p>
						</div>
						<div className="cal-stat">
							<p className="cal-stat-label">High Impact</p>
							<p className="cal-stat-value warn">{stats.highImpactCount}</p>
						</div>
						<div className="cal-stat">
							<p className="cal-stat-label">Busiest Day</p>
							<p className="cal-stat-value tiny">
								{stats.busiestDateKey ? parseDateKey(stats.busiestDateKey).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-"}
								<span>{stats.busiestCount ? ` (${stats.busiestCount})` : ""}</span>
							</p>
						</div>
						<div className="cal-stat">
							<p className="cal-stat-label">Avg Impact Score</p>
							<p className="cal-stat-value">{stats.avgImpact.toFixed(2)}</p>
						</div>
					</div>
				</section>

				<div className="cal-main-grid">
					<section className="card cal-board">
						<div className="cal-toolbar">
							<div>
								<p className="cal-month">{monthLabel}</p>
								<p className="cal-month-sub">Click any date to inspect event flow</p>
							</div>
							<div className="cal-toolbar-actions">
								<button className="chip" onClick={handlePrevMonth} aria-label="Previous month">←</button>
								<button className="chip" onClick={handleGoToday}>Today</button>
								<button className="chip" onClick={handleNextMonth} aria-label="Next month">→</button>
							</div>
						</div>

						<div className="cal-week-head">
							{WEEK_DAYS.map((day) => (
								<div key={day} className="cal-week-cell">{day}</div>
							))}
						</div>

						<div className="cal-grid">
							{gridDays.map((date) => {
								const dateKey = toDateKey(date);
								const inMonth = date.getMonth() === monthAnchor.getMonth();
								const dayEvents = eventsByDate.get(dateKey) ?? [];
								const isToday = dateKey === todayKey;
								const isSelected = dateKey === selectedDateKey;
								const hasHighImpact = dayEvents.some((event) => event.impact === "high");

								return (
									<button
										key={dateKey}
										className={`cal-day${inMonth ? "" : " muted"}${isToday ? " today" : ""}${isSelected ? " selected" : ""}`}
										onClick={() => setSelectedDateKey(dateKey)}
									>
										<div className="cal-day-top">
											<span>{date.getDate()}</span>
											{dayEvents.length > 0 && <span className="count-pill">{dayEvents.length}</span>}
										</div>

										<div className="dot-row">
											{dayEvents.slice(0, 3).map((event) => (
												<span key={event.id} className={`dot ${event.impact}`} title={`${event.time} ${event.title}`} />
											))}
											{dayEvents.length > 3 && <span className="more">+{dayEvents.length - 3}</span>}
										</div>

										{hasHighImpact && <div className="impact-stripe" />}
									</button>
								);
							})}
						</div>
					</section>

					<aside className="card cal-sidebar">
						<div className="agenda-head">
							<p className="agenda-title">Agenda</p>
							<p className="agenda-date">{formatFullDate(selectedDateKey)}</p>
						</div>

						<div className="agenda-list">
							{positionSyncError && (
								<div className="sync-note">Position reminders unavailable right now. {positionSyncError}</div>
							)}
							{selectedEvents.length === 0 ? (
								<div className="empty">
									<p>No event planned for this date.</p>
									<p>Add one below to start building your thesis timeline.</p>
								</div>
							) : (
								selectedEvents.map((event) => (
									<article key={event.id} className="agenda-item">
										<div className="agenda-item-top">
											<span className="time">{event.time}</span>
											<span className={`tag ${event.impact}`}>{IMPACT_LABEL[event.impact]}</span>
										</div>
										<p className="event-title">{event.title}</p>
										<div className="agenda-item-bottom">
											<span className="category">
												{CATEGORY_LABEL[event.category]}
												{event.source === "position" && event.side ? ` · ${event.side}` : ""}
											</span>
											{event.source === "position" && event.eventId ? (
												<Link className="open-link" href={`/polyoiyen/${event.eventId}`}>Open</Link>
											) : (
												<button className="delete" onClick={() => removeEvent(event.id)}>Remove</button>
											)}
										</div>
									</article>
								))
							)}
						</div>

						<form className="quick-form" onSubmit={handleCreateEvent}>
							<p className="form-title">Quick Add</p>
							<input
								value={draft.title}
								onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
								placeholder="Event title (e.g. US NFP Print)"
								className="input"
							/>
							<div className="form-row">
								<input
									type="time"
									value={draft.time}
									onChange={(e) => setDraft((prev) => ({ ...prev, time: e.target.value }))}
									className="input"
								/>
								<select
									value={draft.impact}
									onChange={(e) => setDraft((prev) => ({ ...prev, impact: e.target.value as Impact }))}
									className="input"
								>
									<option value="low">Low</option>
									<option value="medium">Medium</option>
									<option value="high">High</option>
								</select>
							</div>
							<select
								value={draft.category}
								onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value as Category }))}
								className="input"
							>
								<option value="custom">Custom</option>
								<option value="macro">Macro</option>
								<option value="earnings">Earnings</option>
								<option value="crypto">Crypto</option>
								<option value="policy">Policy</option>
							</select>
							<button className="create-btn" type="submit">Add Event</button>
						</form>
					</aside>
				</div>
			</div>
		</div>
	);
}

const CALENDAR_CSS = `
	@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Serif+Display:ital@0;1&display=swap');
	* { box-sizing: border-box; }
	body { background: #160c03; }

	.cal-root {
		min-height: 100vh;
		background:
			radial-gradient(1000px 500px at 8% -10%, rgba(249,115,22,0.2), transparent 55%),
			radial-gradient(700px 380px at 100% 10%, rgba(251,146,60,0.14), transparent 60%),
			#160c03;
		color: rgba(255,255,255,0.9);
		font-family: 'DM Sans', sans-serif;
	}

	.cal-shell {
		width: min(1200px, 94vw);
		margin: 24px auto 40px;
		display: grid;
		gap: 16px;
	}

	.card {
		background: rgba(255,255,255,0.045);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 16px;
		box-shadow: 0 16px 42px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06);
	}

	.cal-hero {
		padding: 20px;
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: 18px;
		align-items: center;
	}

	.cal-kicker {
		font-size: 11px;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: rgba(255,255,255,0.45);
		margin-bottom: 6px;
	}

	.cal-title {
		margin: 0;
		font-family: 'DM Serif Display', serif;
		font-size: clamp(30px, 4vw, 42px);
		line-height: 1;
		color: #fb923c;
	}

	.cal-sub {
		margin-top: 8px;
		max-width: 56ch;
		font-size: 14px;
		line-height: 1.7;
		color: rgba(255,255,255,0.62);
	}

	.cal-stat-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.cal-stat {
		background: rgba(255,255,255,0.045);
		border: 1px solid rgba(255,255,255,0.08);
		border-radius: 12px;
		padding: 12px;
	}

	.cal-stat-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(255,255,255,0.45);
		margin-bottom: 8px;
	}

	.cal-stat-value {
		margin: 0;
		font-size: 22px;
		font-weight: 700;
		color: rgba(255,255,255,0.92);
	}
	.cal-stat-value.warn { color: #fbbf24; }
	.cal-stat-value.tiny { font-size: 15px; line-height: 1.2; }

	.cal-main-grid {
		display: grid;
		grid-template-columns: 1.7fr 1fr;
		gap: 16px;
	}

	.cal-board {
		padding: 14px;
	}

	.cal-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px;
	}

	.cal-month {
		margin: 0;
		font-size: 22px;
		font-weight: 700;
		color: #fb923c;
	}

	.cal-month-sub {
		margin: 3px 0 0;
		font-size: 12px;
		color: rgba(255,255,255,0.5);
	}

	.cal-toolbar-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.chip {
		border: 1px solid rgba(255,255,255,0.14);
		background: rgba(255,255,255,0.05);
		color: rgba(255,255,255,0.9);
		padding: 8px 12px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		transition: 0.16s ease;
	}
	.chip:hover { border-color: rgba(249,115,22,0.5); color: #fb923c; }

	.cal-week-head {
		margin-top: 8px;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 8px;
		padding: 0 4px;
	}

	.cal-week-cell {
		font-size: 11px;
		text-align: center;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(255,255,255,0.42);
		padding: 5px 0;
	}

	.cal-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 8px;
		margin-top: 8px;
	}

	.cal-day {
		min-height: 92px;
		border-radius: 12px;
		border: 1px solid rgba(255,255,255,0.07);
		background: rgba(255,255,255,0.03);
		color: rgba(255,255,255,0.9);
		text-align: left;
		padding: 8px;
		position: relative;
		cursor: pointer;
		transition: 0.16s ease;
	}

	.cal-day:hover {
		border-color: rgba(249,115,22,0.38);
		transform: translateY(-1px);
	}

	.cal-day.muted {
		opacity: 0.45;
	}

	.cal-day.today {
		border-color: rgba(251,146,60,0.75);
		box-shadow: inset 0 0 0 1px rgba(251,146,60,0.38);
	}

	.cal-day.selected {
		background: rgba(249,115,22,0.12);
		border-color: rgba(249,115,22,0.66);
	}

	.cal-day-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		font-weight: 700;
	}

	.count-pill {
		font-size: 10px;
		font-weight: 700;
		color: #160c03;
		background: #fbbf24;
		padding: 2px 6px;
		border-radius: 99px;
	}

	.dot-row {
		margin-top: 18px;
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 14px;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		display: inline-block;
	}

	.dot.low { background: #60a5fa; }
	.dot.medium { background: #fbbf24; }
	.dot.high { background: #f87171; }

	.more {
		font-size: 10px;
		color: rgba(255,255,255,0.55);
	}

	.impact-stripe {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 3px;
		border-radius: 0 0 12px 12px;
		background: linear-gradient(90deg, rgba(248,113,113,0.06), rgba(248,113,113,0.88), rgba(248,113,113,0.06));
	}

	.cal-sidebar {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.agenda-head {
		padding-bottom: 8px;
		border-bottom: 1px solid rgba(255,255,255,0.08);
	}

	.agenda-title {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: #fb923c;
	}

	.agenda-date {
		margin: 4px 0 0;
		font-size: 12px;
		color: rgba(255,255,255,0.5);
	}

	.agenda-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 360px;
		overflow-y: auto;
		padding-right: 4px;
	}

	.agenda-item {
		padding: 10px;
		border-radius: 10px;
		border: 1px solid rgba(255,255,255,0.08);
		background: rgba(255,255,255,0.03);
	}

	.agenda-item-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}

	.time {
		font-size: 12px;
		font-weight: 700;
		color: rgba(255,255,255,0.9);
	}

	.tag {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		border-radius: 99px;
		padding: 3px 8px;
		font-weight: 700;
	}

	.tag.low { background: rgba(96,165,250,0.16); color: #93c5fd; }
	.tag.medium { background: rgba(251,191,36,0.16); color: #fcd34d; }
	.tag.high { background: rgba(248,113,113,0.18); color: #fca5a5; }

	.event-title {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		line-height: 1.4;
		color: rgba(255,255,255,0.92);
	}

	.agenda-item-bottom {
		margin-top: 8px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.category {
		font-size: 11px;
		color: rgba(255,255,255,0.45);
	}

	.delete {
		border: none;
		background: transparent;
		color: #f87171;
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
		padding: 0;
	}

	.open-link {
		font-size: 11px;
		font-weight: 700;
		color: #fb923c;
		text-decoration: none;
	}
	.open-link:hover {
		text-decoration: underline;
	}

	.empty {
		border: 1px dashed rgba(255,255,255,0.2);
		background: rgba(255,255,255,0.02);
		border-radius: 10px;
		padding: 14px;
		font-size: 12px;
		line-height: 1.5;
		color: rgba(255,255,255,0.55);
	}

	.sync-note {
		border: 1px solid rgba(248,113,113,0.35);
		background: rgba(248,113,113,0.08);
		border-radius: 10px;
		padding: 10px;
		font-size: 11px;
		line-height: 1.4;
		color: #fca5a5;
	}

	.quick-form {
		margin-top: auto;
		border-top: 1px solid rgba(255,255,255,0.08);
		padding-top: 12px;
		display: grid;
		gap: 8px;
	}

	.form-title {
		margin: 0 0 2px;
		font-size: 13px;
		font-weight: 700;
		color: rgba(255,255,255,0.82);
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.input {
		width: 100%;
		border: 1px solid rgba(255,255,255,0.12);
		border-radius: 10px;
		background: rgba(255,255,255,0.04);
		color: rgba(255,255,255,0.95);
		font-size: 12px;
		padding: 10px;
		outline: none;
	}

	.input:focus {
		border-color: rgba(249,115,22,0.62);
		box-shadow: 0 0 0 3px rgba(249,115,22,0.18);
	}

	.create-btn {
		border: 1px solid rgba(249,115,22,0.55);
		background: linear-gradient(180deg, #fb923c, #f97316);
		color: white;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.03em;
		padding: 10px;
		cursor: pointer;
		transition: transform 0.12s ease, filter 0.12s ease;
	}
	.create-btn:hover { transform: translateY(-1px); filter: brightness(1.05); }

	@media (max-width: 1080px) {
		.cal-main-grid {
			grid-template-columns: 1fr;
		}
		.agenda-list {
			max-height: 260px;
		}
	}

	@media (max-width: 760px) {
		.cal-shell { width: min(1200px, 96vw); margin-top: 14px; }
		.cal-hero {
			grid-template-columns: 1fr;
			padding: 16px;
		}
		.cal-stat-grid {
			grid-template-columns: 1fr 1fr;
		}
		.cal-month { font-size: 18px; }
		.cal-month-sub { font-size: 11px; }
		.cal-day {
			min-height: 78px;
			padding: 6px;
		}
		.dot-row { margin-top: 12px; }
	}
`;

