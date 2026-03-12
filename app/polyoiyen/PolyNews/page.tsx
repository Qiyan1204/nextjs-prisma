"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import PolyHeader from "../PolyHeader";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface NewsArticle {
  title: string;
  description: string;
  url: string;
  image: string | null;
  publishedAt: string;
  source: { name: string; url: string };
}

/* ─── Constants ──────────────────────────────────────────────────────────── */
const NEWS_CATEGORIES = [
  { label: "🔥 Top", value: "general" },
  { label: "⚡ Breaking", value: "breaking-news" },
  { label: "💰 Finance", value: "business" },
  { label: "🏛️ Politics", value: "nation" },
  { label: "🌍 World", value: "world" },
  { label: "🔬 Science", value: "science" },
  { label: "💻 Tech", value: "technology" },
  { label: "⚽ Sports", value: "sports" },
];

const PAGE_SIZE = 12;

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── News Banner (auto-slide carousel) ──────────────────────────────────── */
function NewsBanner({ articles }: { articles: NewsArticle[] }) {
  const top = articles.slice(0, 6);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (resumeRef.current) { clearTimeout(resumeRef.current); resumeRef.current = null; }
  }, []);

  const startAutoplay = useCallback(() => {
    clearTimers();
    timerRef.current = setInterval(() => {
      setIdx(prev => (prev + 1) % top.length);
    }, 3000);
  }, [top.length, clearTimers]);

  useEffect(() => {
    if (top.length === 0) return;
    if (!paused) startAutoplay();
    return clearTimers;
  }, [paused, startAutoplay, top.length, clearTimers]);

  const handleMouseEnter = () => { setPaused(true); clearTimers(); };
  const handleMouseLeave = () => {
    clearTimers();
    resumeRef.current = setTimeout(() => setPaused(false), 1000);
  };

  const goTo = (i: number) => { setIdx(i); if (!paused) startAutoplay(); };

  if (top.length === 0) return null;
  const a = top[idx];

  return (
    <div
      className="news-banner"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background image */}
      <div className="news-banner-bg" style={{
        backgroundImage: a.image ? `url(${a.image})` : "none",
      }} />

      {/* Gradient overlay */}
      <div className="news-banner-overlay" />

      {/* Nav arrows */}
      <button className="banner-arrow banner-arrow-left" onClick={(e) => { e.stopPropagation(); goTo((idx - 1 + top.length) % top.length); }}>‹</button>
      <button className="banner-arrow banner-arrow-right" onClick={(e) => { e.stopPropagation(); goTo((idx + 1) % top.length); }}>›</button>

      {/* Content */}
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="news-banner-content" key={idx}>
        <div className="news-banner-meta">
          <span className="news-banner-source">{a.source.name}</span>
          <span className="news-banner-dot">·</span>
          <span className="news-banner-time">{timeAgo(a.publishedAt)}</span>
          {paused && <span className="news-banner-paused">⏸ PAUSED</span>}
        </div>
        <h2 className="news-banner-title">{a.title}</h2>
        {a.description && (
          <p className="news-banner-desc">{a.description}</p>
        )}
      </a>

      {/* Dots */}
      <div className="news-banner-dots">
        {top.map((_, i) => (
          <button
            key={i}
            className={`banner-dot${i === idx ? " active" : ""}`}
            onClick={(e) => { e.stopPropagation(); goTo(i); }}
          />
        ))}
      </div>

      {/* Progress bar */}
      {!paused && (
        <div className="banner-progress" key={`p-${idx}`} />
      )}
    </div>
  );
}

/* ─── News Card ──────────────────────────────────────────────────────────── */
function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <a href={article.url} target="_blank" rel="noopener noreferrer" className="grid-news-card">
      <div className="grid-news-img-wrap">
        {article.image ? (
          <img
            src={article.image}
            alt=""
            className="grid-news-img"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="grid-news-img-placeholder">📰</div>
        )}
      </div>
      <div className="grid-news-body">
        <h3 className="grid-news-title">{article.title}</h3>
        {article.description && (
          <p className="grid-news-desc">{article.description}</p>
        )}
        <div className="grid-news-meta">
          <span className="grid-news-source">{article.source.name}</span>
          <span>·</span>
          <span>{timeAgo(article.publishedAt)}</span>
        </div>
      </div>
    </a>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function PolyNewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("general");
  const [showCount, setShowCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setLoading(true);
    setShowCount(PAGE_SIZE);
    async function fetchNews() {
      try {
        const res = await fetch(`/api/news?category=${encodeURIComponent(category)}&max=10`);
        if (res.ok) {
          const data = await res.json();
          setArticles((data.articles || []).filter((a: NewsArticle) => a.title && a.title !== "[Removed]"));
        }
      } catch {
        /* silently fail */
      } finally {
        setLoading(false);
      }
    }
    fetchNews();
  }, [category]);

  const bannerArticles = articles.slice(0, 6);
  const gridArticles = articles.slice(6);
  const shown = gridArticles.slice(0, showCount);
  const hasMore = showCount < gridArticles.length;

  return (
    <div className="poly-news-root">
      <style>{GLOBAL_CSS}</style>
      <PolyHeader active="News" />

      <div className="poly-news-container">
        {/* Section Header */}
        <div className="poly-news-header">
          <h1 className="poly-news-heading">📰 PolyNews</h1>
          <p className="poly-news-sub">Stay informed with the latest headlines across markets, politics, and more.</p>
        </div>

        {/* Category Filters */}
        <div className="poly-news-filters">
          {NEWS_CATEGORIES.map(c => (
            <button
              key={c.value}
              className={`filter-chip${category === c.value ? " active" : ""}`}
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="poly-news-loading">
            <span className="spin" />
            <span style={{ marginLeft: 10, fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Loading news…</span>
          </div>
        ) : articles.length === 0 ? (
          <div className="poly-news-empty">No news available for this category.</div>
        ) : (
          <>
            {/* Banner Carousel */}
            <NewsBanner articles={bannerArticles} />

            {/* Grid */}
            {gridArticles.length > 0 && (
              <>
                <div className="poly-news-grid-header">
                  <span>More Stories</span>
                </div>
                <div className="poly-news-grid">
                  {shown.map((a, i) => (
                    <NewsCard key={i} article={a} />
                  ))}
                </div>

                {hasMore && (
                  <button
                    className="load-more-btn"
                    onClick={() => setShowCount(prev => prev + PAGE_SIZE)}
                  >
                    Load More ({gridArticles.length - showCount} remaining)
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── CSS ─────────────────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Serif+Display&family=DM+Mono:wght@400;500&display=swap');

/* ── Root ── */
.poly-news-root {
  background: #160c03;
  min-height: 100vh;
  font-family: 'DM Sans', sans-serif;
  color: white;
}
.poly-news-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 24px 60px;
}

/* ── Header ── */
.poly-news-header {
  margin-bottom: 20px;
}
.poly-news-heading {
  font-family: 'DM Serif Display', serif;
  font-size: 32px;
  font-weight: 400;
  color: #f97316;
  margin: 0 0 6px;
}
.poly-news-sub {
  font-size: 14px;
  color: rgba(255,255,255,0.45);
  margin: 0;
}

/* ── Filters ── */
.poly-news-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.filter-chip {
  padding: 7px 16px;
  border-radius: 100px;
  font-size: 13px;
  font-weight: 600;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.6);
  transition: all 0.18s;
}
.filter-chip:hover {
  background: rgba(249,115,22,0.08);
  border-color: rgba(249,115,22,0.25);
  color: rgba(255,255,255,0.85);
}
.filter-chip.active {
  background: rgba(249,115,22,0.15);
  border-color: rgba(249,115,22,0.4);
  color: #f97316;
}

/* ── Loading / Empty ── */
.poly-news-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
}
.poly-news-empty {
  text-align: center;
  padding: 80px 0;
  font-size: 14px;
  color: rgba(255,255,255,0.35);
}

/* ── Spinner ── */
@keyframes spinAnim { to { transform: rotate(360deg); } }
.spin {
  display: inline-block;
  width: 20px; height: 20px;
  border: 2px solid rgba(249,115,22,0.2);
  border-top-color: #f97316;
  border-radius: 50%;
  animation: spinAnim 0.7s linear infinite;
}

/* ═══════════════════════════════════════════
   BANNER CAROUSEL
   ═══════════════════════════════════════════ */
.news-banner {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  height: 340px;
  margin-bottom: 32px;
  cursor: pointer;
}
.news-banner-bg {
  position: absolute; inset: 0;
  background-size: cover;
  background-position: center;
  transition: opacity 0.5s;
}
.news-banner-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(
    to top,
    rgba(22,12,3,0.97) 0%,
    rgba(22,12,3,0.82) 35%,
    rgba(22,12,3,0.45) 65%,
    rgba(22,12,3,0.25) 100%
  );
}

/* Arrows */
.banner-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 36px; height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(22,12,3,0.7);
  color: rgba(255,255,255,0.7);
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: all 0.15s;
  opacity: 0;
}
.news-banner:hover .banner-arrow { opacity: 1; }
.banner-arrow:hover {
  background: rgba(249,115,22,0.2);
  border-color: rgba(249,115,22,0.4);
  color: #f97316;
}
.banner-arrow-left { left: 14px; }
.banner-arrow-right { right: 14px; }

/* Content */
.news-banner-content {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 24px 28px 20px;
  text-decoration: none;
  color: white;
  z-index: 5;
  animation: bannerFadeIn 0.45s ease-out;
}
@keyframes bannerFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.news-banner-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 12px;
}
.news-banner-source {
  font-weight: 700;
  color: #f97316;
}
.news-banner-dot { color: rgba(255,255,255,0.3); }
.news-banner-time { color: rgba(255,255,255,0.45); }
.news-banner-paused {
  margin-left: 8px;
  font-size: 10px;
  font-weight: 700;
  color: #fbbf24;
  background: rgba(251,191,36,0.12);
  padding: 2px 8px;
  border-radius: 4px;
}
.news-banner-title {
  font-family: 'DM Serif Display', serif;
  font-size: 26px;
  line-height: 1.25;
  margin: 0 0 8px;
  color: white;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.news-banner-desc {
  font-size: 13px;
  line-height: 1.55;
  color: rgba(255,255,255,0.5);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Dots */
.news-banner-dots {
  position: absolute;
  bottom: 14px; right: 28px;
  display: flex;
  gap: 6px;
  z-index: 10;
}
.banner-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.25);
  cursor: pointer;
  padding: 0;
  transition: all 0.2s;
}
.banner-dot.active {
  background: #f97316;
  width: 22px;
  border-radius: 4px;
}

/* Progress bar */
.banner-progress {
  position: absolute;
  bottom: 0; left: 0;
  height: 3px;
  background: linear-gradient(90deg, #f97316, #fb923c);
  border-radius: 0 3px 0 0;
  animation: bannerProgressAnim 3s linear forwards;
  z-index: 10;
}
@keyframes bannerProgressAnim {
  from { width: 0; }
  to   { width: 100%; }
}

/* ═══════════════════════════════════════════
   NEWS GRID
   ═══════════════════════════════════════════ */
.poly-news-grid-header {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
  margin-bottom: 16px;
}
.poly-news-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
  margin-bottom: 24px;
}
@media (max-width: 900px) {
  .poly-news-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 640px) {
  .poly-news-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 420px) {
  .poly-news-grid { grid-template-columns: 1fr; }
}

/* ── Card ── */
.grid-news-card {
  display: flex;
  flex-direction: column;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px;
  overflow: hidden;
  text-decoration: none;
  color: white;
  transition: all 0.2s;
}
.grid-news-card:hover {
  background: rgba(249,115,22,0.06);
  border-color: rgba(249,115,22,0.2);
  transform: translateY(-3px);
  box-shadow: 0 8px 30px rgba(0,0,0,0.35);
}
.grid-news-img-wrap {
  position: relative;
  width: 100%;
  padding-top: 56%;
  overflow: hidden;
  background: rgba(255,255,255,0.04);
}
.grid-news-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}
.grid-news-card:hover .grid-news-img {
  transform: scale(1.05);
}
.grid-news-img-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  background: rgba(249,115,22,0.06);
}
.grid-news-body {
  padding: 14px 14px 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
}
.grid-news-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  margin: 0 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.grid-news-desc {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255,255,255,0.4);
  margin: 0 0 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}
.grid-news-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: rgba(255,255,255,0.3);
  margin-top: auto;
}
.grid-news-source {
  font-weight: 700;
  color: #f97316;
}

/* ── Load More ── */
.load-more-btn {
  display: block;
  width: 100%;
  padding: 14px 0;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  border: 1px solid rgba(249,115,22,0.2);
  background: rgba(249,115,22,0.06);
  color: #f97316;
  transition: all 0.18s;
  margin-bottom: 10px;
}
.load-more-btn:hover {
  background: rgba(249,115,22,0.14);
  border-color: rgba(249,115,22,0.4);
}
`;
