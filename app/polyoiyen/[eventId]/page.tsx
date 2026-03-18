"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DetailPage, GLOBAL_CSS, type PolyEvent } from "../page";

const BOOKMARK_STORAGE_KEY = "polyoiyen-bookmarks-v1";

export default function PolyOiyenEventPage() {
  const router = useRouter();
  const params = useParams<{ eventId?: string }>();
  const [event, setEvent] = useState<PolyEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [bookmarkedEvents, setBookmarkedEvents] = useState<Record<string, PolyEvent>>({});
  const bookmarkSaveReady = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOOKMARK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ids?: string[]; events?: Record<string, PolyEvent> };
        if (Array.isArray(parsed.ids)) setBookmarkedIds(parsed.ids);
        if (parsed.events && typeof parsed.events === "object") setBookmarkedEvents(parsed.events);
      }
    } catch {
      // ignore invalid data
    }
  }, []);

  useEffect(() => {
    if (!bookmarkSaveReady.current) {
      bookmarkSaveReady.current = true;
      return;
    }
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify({ ids: bookmarkedIds, events: bookmarkedEvents }));
  }, [bookmarkedIds, bookmarkedEvents]);

  useEffect(() => {
    const rawEventId = Array.isArray(params?.eventId) ? params.eventId[0] : params?.eventId;
    const eventId = decodeURIComponent(rawEventId || "");
    if (!eventId) {
      setLoading(false);
      setError("Missing event id.");
      return;
    }

    let alive = true;
    async function fetchEvent() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/polymarket?id=${encodeURIComponent(eventId)}`);
        if (!res.ok) throw new Error("Failed to load event");
        const payload = await res.json();
        const item = Array.isArray(payload?.events) ? payload.events[0] : payload;
        if (!alive) return;
        if (!item || !item.id) {
          setEvent(null);
          setError("Event not found.");
          return;
        }
        setEvent(item as PolyEvent);
      } catch (e) {
        if (!alive) return;
        setEvent(null);
        setError(e instanceof Error ? e.message : "Could not load event.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchEvent();
    return () => {
      alive = false;
    };
  }, [params]);

  function toggleBookmark(target: PolyEvent) {
    const isOn = bookmarkedIds.includes(target.id);
    setBookmarkedIds((prev) => (isOn ? prev.filter((id) => id !== target.id) : [target.id, ...prev]));
    setBookmarkedEvents((prev) => {
      if (isOn) {
        const next = { ...prev };
        delete next[target.id];
        return next;
      }
      return { ...prev, [target.id]: target };
    });
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {loading && (
        <div style={{ background: "var(--bg)", minHeight: "100vh", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}><span className="spin" /> Loading event...</div>
        </div>
      )}

      {!loading && (error || !event) && (
        <div style={{ background: "var(--bg)", minHeight: "100vh", color: "white", fontFamily: "'DM Sans', sans-serif", padding: "48px 24px" }}>
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <div style={{ fontSize: 24, marginBottom: 10 }}>Event unavailable</div>
            <div style={{ color: "var(--muted)", marginBottom: 20 }}>{error || "Event not found."}</div>
            <button
              onClick={() => router.push("/polyoiyen")}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--bdr)",
                background: "rgba(255,255,255,0.04)",
                color: "var(--text)",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
              }}
            >
              Back to Markets
            </button>
          </div>
        </div>
      )}

      {!loading && event && (
        <DetailPage
          event={event}
          onBack={() => router.push("/polyoiyen")}
          isBookmarked={bookmarkedIds.includes(event.id)}
          onToggleBookmark={toggleBookmark}
        />
      )}
    </>
  );
}
