"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function LearnMore() {
  const router = useRouter();
  const [scrollY, setScrollY] = useState(0);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setVisible((p) => new Set([...p, e.target.id]));
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll("[data-animate]").forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  const v = (id: string) => visible.has(id);

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", overflowX: "hidden", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --orange: #f97316;
          --ink: #1a1612;
          --ink-60: rgba(26,22,18,0.6);
          --ink-35: rgba(26,22,18,0.35);
          --cream: #fafaf8;
          --cream-dark: #f0ede8;
          --surface: #ffffff;
          --border: rgba(26,22,18,0.1);
          --poly-bg: #1c0f05;
        }

        /* ── Animations ── */
        .fade-up {
          opacity: 0; transform: translateY(28px);
          transition: opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1);
        }
        .fade-up.visible { opacity: 1; transform: translateY(0); }

        /* ── Nav ── */
        .nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 200;
          padding: 0 40px; height: 64px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .nav.scrolled {
          background: linear-gradient(90deg, rgba(255,255,255,0.94) 50%, rgba(28,15,5,0.94) 50%);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(249,115,22,0.12);
        }
        .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .nav-logo-text { font-size: 17px; font-weight: 700; color: var(--orange); letter-spacing: -0.03em; }
        .nav-back {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 500; color: #fb923c;
          background: none; border: none; cursor: pointer;
          font-family: inherit; transition: color 0.2s;
        }
        .nav-back:hover { color: #f97316; }

        /* ════════════════════════════════════════
           HERO — Hard-cut split, editorial style
           Left: white + dot texture  (Invest)
           Right: #1c0f05 + grid      (PolyOiyen)
           Seam: 1px orange rule + floating connector pill
           Content on each side leans toward the center
        ════════════════════════════════════════ */

        /* Full-page split background — persists behind ALL sections */
        .page-split-bg {
          position: fixed; inset: 0; z-index: -1; pointer-events: none;
        }
        .page-split-bg::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(90deg, #ffffff 50%, #1c0f05 50%);
        }

        .hero {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          position: relative;
        }

        /* LEFT — white Invest panel */
        .hero-left {
          background: transparent;
          display: flex;
          flex-direction: column;
          /* center content horizontally toward the seam */
          align-items: flex-end;
          justify-content: center;
          padding: 120px 80px 80px 60px;
          position: relative;
          overflow: hidden;
        }
        /* dot grid texture */
        .hero-left::before {
          content: '';
          position: absolute; inset: 0; pointer-events: none;
          background-image: radial-gradient(circle, rgba(249,115,22,0.1) 1.2px, transparent 1.2px);
          background-size: 24px 24px;
        }
        /* soft bottom-left warm wash */
        .hero-left::after {
          content: '';
          position: absolute; bottom: -100px; left: -100px;
          width: 420px; height: 420px;
          background: radial-gradient(circle, rgba(249,115,22,0.06) 0%, transparent 60%);
          pointer-events: none;
        }
        .hero-left-content {
          position: relative; z-index: 2;
          width: 100%; max-width: 360px;
          /* right-align so text leans toward the center seam */
          text-align: right;
          display: flex; flex-direction: column; align-items: flex-end;
        }

        /* RIGHT — dark brown PolyOiyen panel */
        .hero-right {
          background: transparent;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          padding: 120px 60px 80px 80px;
          position: relative;
          overflow: hidden;
        }
        /* financial grid texture */
        .hero-right::before {
          content: '';
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(249,115,22,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(249,115,22,0.045) 1px, transparent 1px);
          background-size: 44px 44px;
        }
        /* orange bleed from the seam */
        .hero-right::after {
          content: '';
          position: absolute; top: 50%; left: -80px;
          transform: translateY(-50%);
          width: 320px; height: 600px;
          background: radial-gradient(ellipse, rgba(249,115,22,0.09) 0%, transparent 65%);
          pointer-events: none;
        }
        .hero-right-content {
          position: relative; z-index: 2;
          width: 100%; max-width: 360px;
          text-align: left;
          display: flex; flex-direction: column; align-items: flex-start;
        }

        /* THE SEAM — sharp orange rule */
        .hero-seam {
          position: absolute; top: 0; bottom: 0;
          left: 50%; width: 1px;
          background: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(249,115,22,0.25) 10%,
            rgba(249,115,22,0.6) 40%,
            rgba(249,115,22,0.6) 60%,
            rgba(249,115,22,0.25) 90%,
            transparent 100%
          );
          z-index: 20; pointer-events: none;
        }

        /* Connector pill — bridges both worlds */
        .hero-connector {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          z-index: 30;
          background: #f97316;
          border-radius: 100px;
          padding: 9px 20px;
          display: flex; align-items: center; gap: 10px;
          box-shadow:
            0 0 0 6px rgba(249,115,22,0.12),
            0 0 40px rgba(249,115,22,0.3),
            0 4px 16px rgba(0,0,0,0.25);
          white-space: nowrap;
        }
        .conn-side {
          font-size: 11px; font-weight: 700;
          color: rgba(255,255,255,0.9);
          letter-spacing: 0.02em;
        }
        .conn-rule {
          width: 1px; height: 14px;
          background: rgba(255,255,255,0.35);
        }

        /* Eyebrows */
        .eyebrow-light {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.13em;
          text-transform: uppercase;
          color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa;
          padding: 4px 12px; border-radius: 100px;
          margin-bottom: 20px;
        }
        .eyebrow-dark {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 700; letter-spacing: 0.13em;
          text-transform: uppercase;
          color: #fb923c; background: rgba(249,115,22,0.12); border: 1px solid rgba(249,115,22,0.25);
          padding: 4px 12px; border-radius: 100px;
          margin-bottom: 20px;
        }

        /* Left titles */
        .hl-title {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(26px, 3.2vw, 46px);
          color: #1a1612; line-height: 1.08;
          letter-spacing: -0.025em; margin-bottom: 12px;
        }
        .hl-title em { color: var(--orange); font-style: italic; }
        .hl-sub {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(13px, 1.3vw, 16px);
          color: rgba(26,22,18,0.45); font-style: italic;
          margin-bottom: 14px; line-height: 1.4;
        }
        .hl-desc {
          font-size: 13.5px; color: rgba(26,22,18,0.55);
          line-height: 1.75; margin-bottom: 26px;
        }

        /* Right titles */
        .hr-title {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(26px, 3.2vw, 46px);
          color: white; line-height: 1.08;
          letter-spacing: -0.025em; margin-bottom: 12px;
        }
        .hr-title em { color: #fb923c; font-style: italic; }
        .hr-sub {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(13px, 1.3vw, 16px);
          color: rgba(255,255,255,0.32); font-style: italic;
          margin-bottom: 14px; line-height: 1.4;
        }
        .hr-desc {
          font-size: 13.5px; color: rgba(255,255,255,0.42);
          line-height: 1.75; margin-bottom: 26px; font-weight: 300;
        }

        /* CTA buttons */
        .btn-invest {
          display: inline-flex; align-items: center; gap: 7px;
          background: var(--orange); color: white;
          padding: 10px 20px; border-radius: 7px;
          font-size: 13px; font-weight: 600;
          text-decoration: none; transition: all 0.18s;
        }
        .btn-invest:hover { background: #ea580c; transform: translateY(-2px); box-shadow: 0 6px 18px rgba(249,115,22,0.32); }

        .btn-poly {
          display: inline-flex; align-items: center; gap: 7px;
          background: transparent; color: #fb923c;
          border: 1px solid rgba(249,115,22,0.38);
          padding: 10px 20px; border-radius: 7px;
          font-size: 13px; font-weight: 600;
          text-decoration: none; transition: all 0.18s;
        }
        .btn-poly:hover { background: rgba(249,115,22,0.1); transform: translateY(-2px); }

        /* scroll hint */
        .scroll-hint {
          position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
          color: rgba(249,115,22,0.4); z-index: 10;
          animation: sbounce 2.5s ease-in-out infinite;
        }
        @keyframes sbounce {
          0%,100% { transform: translateX(-50%) translateY(0); }
          50%      { transform: translateX(-50%) translateY(6px); }
        }

        /* ── Sections — sit on top of the split bg ── */
        .section { padding: 100px 40px; max-width: 1160px; margin: 0 auto; position: relative; z-index: 1; }
        .section-label {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.14em;
          text-transform: uppercase; color: var(--orange); margin-bottom: 16px;
        }
        .label-line { width: 28px; height: 1.5px; background: var(--orange); }

        /* ── Invest card ── */
        .invest-card {
          background: #ffffff;
          border-radius: 20px;
          border: 1px solid rgba(26,22,18,0.08);
          overflow: hidden;
          /* layered shadow = depth */
          box-shadow:
            0 1px 0 rgba(255,255,255,0.8) inset,
            0 2px 4px rgba(0,0,0,0.04),
            0 8px 24px rgba(0,0,0,0.07),
            0 32px 64px rgba(0,0,0,0.06);
        }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; }
        .card-pad { padding: 60px 60px 0; }
        .invest-badge {
          display: inline-block; font-size: 11px; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: #15803d; background: #dcfce7; border: 1px solid #bbf7d0;
          padding: 4px 12px; border-radius: 100px; margin-bottom: 18px;
        }
        .card-title {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(26px, 3vw, 42px);
          color: var(--ink); line-height: 1.1;
          letter-spacing: -0.02em; margin-bottom: 14px;
        }
        .card-title span { color: var(--orange); }
        .card-desc { font-size: 14.5px; color: var(--ink-60); line-height: 1.75; }
        .philos {
          background: #f5f0ea;
          border-left: 3px solid var(--orange);
          border-radius: 0 10px 10px 0; padding: 18px 22px; margin-top: 24px;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.7) inset,
            0 2px 8px rgba(0,0,0,0.05),
            0 6px 20px rgba(249,115,22,0.06);
        }
        .philos-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--orange); margin-bottom: 7px; }
        .philos-q { font-family: 'DM Serif Display', serif; font-size: 16px; font-style: italic; color: var(--ink); line-height: 1.4; }
        .feat-list { display: flex; flex-direction: column; }
        .feat-item { display: flex; gap: 16px; padding: 18px 0; border-bottom: 1px solid var(--border); }
        .feat-item:last-child { border-bottom: none; }
        .feat-num { font-family: 'DM Mono', monospace; font-size: 12px; color: var(--orange); opacity: 0.55; padding-top: 2px; flex-shrink: 0; width: 22px; }
        .feat-title { font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }
        .feat-desc { font-size: 13px; color: var(--ink-60); line-height: 1.6; }
        .invest-vis {
          background: linear-gradient(160deg, #e8f5e9 0%, #c8e6c9 100%);
          border-top: 1px solid rgba(22,163,74,0.12);
          padding: 36px 60px; display: flex; gap: 14px; margin-top: 44px;
        }
        .mini-chart {
          flex: 1; background: #ffffff; border-radius: 12px; padding: 18px;
          border: 1px solid rgba(22,163,74,0.12);
          /* raised card look */
          box-shadow:
            0 1px 0 rgba(255,255,255,0.9) inset,
            0 2px 0 rgba(22,163,74,0.05),
            0 4px 12px rgba(0,0,0,0.07),
            0 12px 28px rgba(0,0,0,0.05);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .mini-chart:hover {
          transform: translateY(-3px);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.9) inset,
            0 2px 0 rgba(22,163,74,0.05),
            0 8px 20px rgba(0,0,0,0.1),
            0 20px 40px rgba(0,0,0,0.07);
        }
        .mc-lbl { font-size: 10px; font-weight: 600; color: var(--ink-35); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 10px; }
        .mc-val { font-family: 'DM Mono', monospace; font-size: 18px; font-weight: 500; color: var(--ink); margin-bottom: 3px; }
        .mc-delta { font-size: 11px; font-weight: 600; color: #16a34a; }
        .bars { display: flex; align-items: flex-end; gap: 3px; height: 40px; margin-top: 10px; }
        .bar { border-radius: 2px 2px 0 0; background: #86efac; flex: 1; }
        .bar.hi { background: #16a34a; }

        /* ── Poly card ── */
        .poly-card {
          background: var(--poly-bg);
          border-radius: 20px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.07);
          position: relative;
          /* on dark bg: top white highlight + bottom dark press */
          box-shadow:
            0 1px 0 rgba(255,255,255,0.08) inset,
            0 -1px 0 rgba(0,0,0,0.5) inset,
            1px 0 0 rgba(255,255,255,0.04) inset,
            -1px 0 0 rgba(0,0,0,0.3) inset,
            0 4px 8px rgba(0,0,0,0.4),
            0 20px 50px rgba(0,0,0,0.35);
        }
        .poly-card::before {
          content: ''; position: absolute; top: -100px; right: -100px;
          width: 450px; height: 450px;
          background: radial-gradient(circle, rgba(249,115,22,0.1) 0%, transparent 65%);
          pointer-events: none;
        }
        .poly-badge {
          display: inline-block; font-size: 11px; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: #fb923c; background: rgba(249,115,22,0.12); border: 1px solid rgba(249,115,22,0.25);
          padding: 4px 12px; border-radius: 100px; margin-bottom: 18px;
        }
        .poly-card-title {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(26px, 3vw, 42px);
          color: white; line-height: 1.1;
          letter-spacing: -0.02em; margin-bottom: 14px;
        }
        .poly-card-title span { color: var(--orange); }
        .poly-card-desc { font-size: 14.5px; color: rgba(255,255,255,0.48); line-height: 1.75; font-weight: 300; }
        .poly-philos {
          background: rgba(255,255,255,0.04);
          border-left: 3px solid var(--orange);
          border-radius: 0 10px 10px 0; padding: 18px 22px; margin-top: 24px;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.07) inset,
            0 -1px 0 rgba(0,0,0,0.3) inset,
            0 4px 14px rgba(0,0,0,0.25);
        }
        .poly-feat-item { display: flex; gap: 16px; padding: 18px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .poly-feat-item:last-child { border-bottom: none; }
        .poly-feat-num { font-family: 'DM Mono', monospace; font-size: 12px; color: #fb923c; opacity: 0.55; padding-top: 2px; flex-shrink: 0; width: 22px; }
        .poly-feat-title { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.88); margin-bottom: 4px; }
        .poly-feat-desc { font-size: 13px; color: rgba(255,255,255,0.43); line-height: 1.6; }
        .markets-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
        .mkt-card {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 10px; padding: 14px 16px;
          transition: all 0.22s;
          /* white top-edge highlight = glass raised effect on dark */
          box-shadow:
            0 1px 0 rgba(255,255,255,0.12) inset,
            0 -1px 0 rgba(0,0,0,0.35) inset,
            0 2px 6px rgba(0,0,0,0.3),
            0 8px 20px rgba(0,0,0,0.2);
        }
        .mkt-card:hover {
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.09);
          transform: translateY(-3px);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.18) inset,
            0 -1px 0 rgba(0,0,0,0.4) inset,
            0 6px 14px rgba(0,0,0,0.35),
            0 16px 36px rgba(0,0,0,0.25),
            0 0 0 1px rgba(255,255,255,0.06);
        }
        .mkt-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; }
        .mkt-tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
        .mkt-q { font-size: 12.5px; color: rgba(255,255,255,0.76); margin-bottom: 10px; line-height: 1.4; }
        .mkt-bar-row { display: flex; align-items: center; gap: 8px; }
        .mkt-bar { flex: 1; height: 4px; background: rgba(255,255,255,0.07); border-radius: 10px; overflow: hidden; }
        .mkt-fill { height: 100%; border-radius: 10px; background: linear-gradient(90deg, #34d399, #10b981); }
        .mkt-yes { font-size: 10.5px; font-weight: 700; color: #34d399; font-family: 'DM Mono', monospace; }
        .mkt-no  { font-size: 10.5px; font-weight: 700; color: #f87171; font-family: 'DM Mono', monospace; }
        .mkt-vol { font-size: 10px; color: rgba(255,255,255,0.25); }
        .poly-vis {
          border-top: 1px solid rgba(255,255,255,0.1);
          padding: 36px 60px; margin-top: 44px; position: relative; z-index: 1;
          background: rgba(255,255,255,0.02);
        }

        /* ── Synergy ── */
        .syn-wrap {
          background: #ffffff;
          border: 1px solid rgba(26,22,18,0.07);
          border-radius: 20px; padding: 68px 60px;
          position: relative; overflow: hidden;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.8) inset,
            0 2px 4px rgba(0,0,0,0.04),
            0 8px 24px rgba(0,0,0,0.07),
            0 32px 64px rgba(0,0,0,0.06);
        }
        .syn-wrap::after {
          content: ''; position: absolute; top: -60px; left: -60px;
          width: 350px; height: 350px;
          background: radial-gradient(circle, rgba(249,115,22,0.05) 0%, transparent 65%);
          pointer-events: none;
        }
        .syn-head { text-align: center; margin-bottom: 56px; position: relative; z-index: 1; }
        .syn-title {
          font-family: 'DM Serif Display', serif;
          font-size: clamp(26px, 3.2vw, 40px);
          color: var(--ink); line-height: 1.15; letter-spacing: -0.02em; margin-bottom: 12px;
        }
        .syn-title span { color: var(--orange); }
        .syn-sub { font-size: 15px; color: var(--ink-60); max-width: 460px; margin: 0 auto; line-height: 1.7; }
        .syn-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; position: relative; z-index: 1; }
        .syn-card {
          background: #fafaf8;
          border: 1px solid rgba(26,22,18,0.07);
          border-radius: 14px; padding: 28px 24px;
          transition: all 0.22s; position: relative; overflow: hidden;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.9) inset,
            0 2px 6px rgba(0,0,0,0.05),
            0 8px 20px rgba(0,0,0,0.05);
        }
        .syn-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, var(--orange), #fb923c);
          transform: scaleX(0); transform-origin: left; transition: transform 0.28s ease;
        }
        .syn-card:hover {
          transform: translateY(-5px);
          border-color: rgba(249,115,22,0.2);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.9) inset,
            0 4px 12px rgba(0,0,0,0.08),
            0 16px 40px rgba(0,0,0,0.09),
            0 0 0 1px rgba(249,115,22,0.08);
        }
        .syn-card:hover::before { transform: scaleX(1); }
        .syn-num { font-family: 'DM Mono', monospace; font-size: 32px; color: var(--orange); opacity: 0.15; line-height: 1; margin-bottom: 14px; }
        .syn-card-title { font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 8px; }
        .syn-card-desc { font-size: 13px; color: var(--ink-60); line-height: 1.65; }
        .flow-row { display: flex; align-items: center; justify-content: center; margin-top: 48px; flex-wrap: wrap; position: relative; z-index: 1; }
        .flow-node {
          background: #f5f0ea;
          border: 1px solid rgba(26,22,18,0.1); border-radius: 10px; padding: 14px 20px; text-align: center; min-width: 120px;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.8) inset,
            0 2px 6px rgba(0,0,0,0.07),
            0 6px 16px rgba(0,0,0,0.05);
        }
        .flow-node-lbl { font-size: 10px; color: var(--ink-35); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 3px; }
        .flow-node-title { font-size: 13.5px; font-weight: 700; color: var(--ink); }
        .flow-node.mid { background: var(--ink); border-color: var(--ink); }
        .flow-node.mid .flow-node-lbl { color: rgba(255,255,255,0.35); }
        .flow-node.mid .flow-node-title { color: white; }
        .flow-arr { padding: 0 8px; color: var(--orange); }

        /* ── CTA ── */
        .cta-wrap {
          background: linear-gradient(160deg, #241208 0%, #1c0f05 100%);
          border-radius: 20px; padding: 76px 60px; text-align: center;
          position: relative; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.09) inset,
            0 -1px 0 rgba(0,0,0,0.5) inset,
            1px 0 0 rgba(255,255,255,0.04) inset,
            0 8px 24px rgba(0,0,0,0.3),
            0 32px 64px rgba(0,0,0,0.3);
        }
        .cta-wrap::before {
          content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
          width: 580px; height: 380px;
          background: radial-gradient(ellipse, rgba(249,115,22,0.16) 0%, transparent 65%);
          pointer-events: none;
        }
        .cta-wrap::after {
          content: ''; position: absolute; inset: 0;
          background-image: linear-gradient(rgba(249,115,22,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,0.035) 1px, transparent 1px);
          background-size: 56px 56px; pointer-events: none;
        }
        .cta-inner { position: relative; z-index: 1; }
        .cta-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(249,115,22,0.6); margin-bottom: 14px; }
        .cta-title { font-family: 'DM Serif Display', serif; font-size: clamp(24px, 3.2vw, 40px); color: white; line-height: 1.15; letter-spacing: -0.02em; margin-bottom: 10px; }
        .cta-sub { font-size: 15px; color: rgba(255,255,255,0.38); margin-bottom: 36px; font-weight: 300; }
        .cta-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .cta-btn { padding: 13px 30px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; border: none; font-family: inherit; transition: all 0.18s; display: inline-flex; align-items: center; gap: 7px; cursor: pointer; }
        .cta-invest { background: var(--orange); color: white; }
        .cta-invest:hover { background: #ea580c; transform: translateY(-2px); box-shadow: 0 8px 26px rgba(249,115,22,0.38); }
        .cta-poly { background: rgba(255,255,255,0.07); color: white; border: 1px solid rgba(255,255,255,0.16); }
        .cta-poly:hover { background: rgba(255,255,255,0.12); transform: translateY(-2px); }
        .cta-note { font-size: 11.5px; color: rgba(255,255,255,0.2); margin-top: 18px; }

        @media (max-width: 900px) {
          .hero { grid-template-columns: 1fr; }
          .hero-seam, .hero-connector { display: none; }
          .hero-left { align-items: center; padding: 100px 36px 60px; }
          .hero-left-content { text-align: center; align-items: center; max-width: 100%; }
          .hero-right { align-items: center; padding: 60px 36px 80px; }
          .hero-right-content { text-align: center; align-items: center; max-width: 100%; }
          .two-col { grid-template-columns: 1fr; gap: 36px; }
          .card-pad { padding: 40px 32px 0; }
          .invest-vis, .poly-vis { padding: 28px 32px; }
          .syn-grid { grid-template-columns: 1fr; }
          .syn-wrap { padding: 48px 28px; }
          .cta-wrap { padding: 52px 28px; }
          .section { padding: 60px 20px; }
          .nav { padding: 0 20px; }
        }
      `}</style>

      {/* Full-page persistent split background */}
      <div className="page-split-bg" />

      {/* Nav */}
      <nav className={`nav${scrollY > 20 ? " scrolled" : ""}`}>
        <Link href="/" className="nav-logo">
          <img src="/oiyen-logo.png" alt="Oiyen" style={{ width: 34, height: 34, borderRadius: "50%" }} />
          <span className="nav-logo-text">Oiyen</span>
        </Link>
        <button onClick={() => router.back()} className="nav-back">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </button>
      </nav>

      {/* ════════════════ HERO ════════════════ */}
      <section className="hero">

        {/* The vertical seam line */}
        <div className="hero-seam" />

        {/* Connector pill straddling the seam */}
        <div className="hero-connector">
          <span className="conn-side">Oiyen.Invest</span>
          <span className="conn-rule" />
          <span className="conn-side">PolyOiyen</span>
        </div>

        {/* LEFT — Invest */}
        <div className="hero-left">
          <div className="hero-left-content">
            <span className="eyebrow-light">
              <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor"><circle cx="3" cy="3" r="3"/></svg>
              Oiyen · Invest
            </span>
            <h1 className="hl-title">
              Welcome to<br />
              the <em>Oiyen</em><br />
              Universe
            </h1>
            <p className="hl-sub">One Platform, Two Dimensions.</p>
            <p className="hl-desc">
              We don't just help you manage your current wealth — we lead you to foresee future possibilities. Two powerful engines. One unified account.
            </p>
            <Link href="/markets" className="btn-invest">
              Start Investing
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>
        </div>

        {/* RIGHT — PolyOiyen */}
        <div className="hero-right">
          <div className="hero-right-content">
            <span className="eyebrow-dark">
              <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor"><circle cx="3" cy="3" r="3"/></svg>
              PolyOiyen · Prediction Markets
            </span>
            <h1 className="hr-title">
              Predict the<br />
              <em>Future</em> of<br />
              Markets
            </h1>
            <p className="hr-sub">Collective intelligence, real stakes.</p>
            <p className="hr-desc">
              Trade on real-world financial outcomes. Earn when you're right. PolyOiyen turns your market instincts into measurable, tradeable edge.
            </p>
            <Link href="/polyoiyen" className="btn-poly">
              Explore PolyOiyen
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="scroll-hint">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="6 9 12 15 18 9"/></svg>
          Scroll to explore
        </div>
      </section>

      {/* ════ Section 1: Oiyen.Invest ════ */}
      <div className="section">
        <div id="s1" data-animate className={`invest-card fade-up${v("s1") ? " visible" : ""}`}>
          <div className="card-pad two-col">
            <div>
              <div className="invest-badge">Oiyen · Invest</div>
              <h2 className="card-title">Fortify Your<br /><span>Wealth Foundation</span></h2>
              <p className="card-desc">Your personal asset steward. Supporting diverse instruments — from global stocks to cryptocurrencies — focused on long-term value appreciation. Built for those who think in decades, not days.</p>
              <div className="philos">
                <div className="philos-label">Core Philosophy</div>
                <div className="philos-q">"Don't just predict the storm; build a better ship."</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--ink-35)", marginBottom:"18px" }}>What you can do</div>
              <div className="feat-list">
                {[
                  { n:"01", t:"One-Click Allocation", d:"Instantly purchase core global assets across stocks, ETFs, and crypto — all from a single interface." },
                  { n:"02", t:"Real-Time Review", d:"Multi-dimensional P&L charts keep you fully informed of your holdings at every moment." },
                  { n:"03", t:"Risk Buffer", d:"Mitigate market volatility through intelligently diversified portfolios, built around your risk profile." },
                ].map(f => (
                  <div key={f.n} className="feat-item">
                    <div className="feat-num">{f.n}</div>
                    <div><div className="feat-title">{f.t}</div><div className="feat-desc">{f.d}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="invest-vis">
            {[
              { l:"Portfolio Value", v:"$48,220", d:"+12.4% YTD", b:[55,62,58,70,68,75,80,72,85,88,84,92] },
              { l:"Global Stocks",   v:"$21,400", d:"+8.2%",     b:[40,48,44,52,60,55,63,58,70,65,72,78] },
              { l:"Crypto Holdings", v:"$9,800",  d:"+31.6%",    b:[30,35,42,38,55,50,62,58,68,72,80,88] },
            ].map((c, i) => (
              <div key={i} className="mini-chart">
                <div className="mc-lbl">{c.l}</div>
                <div className="mc-val">{c.v}</div>
                <div className="mc-delta">↑ {c.d}</div>
                <div className="bars">
                  {c.b.map((h, j) => <div key={j} className={`bar${j===c.b.length-1?" hi":""}`} style={{height:`${h}%`}} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════ Section 2: PolyOiyen ════ */}
      <div className="section" style={{ paddingTop: 0 }}>
        <div id="s2" data-animate className={`poly-card fade-up${v("s2") ? " visible" : ""}`}>
          <div className="card-pad two-col" style={{ position:"relative", zIndex:1 }}>
            <div>
              <div className="poly-badge">PolyOiyen · Prediction Markets</div>
              <h2 className="poly-card-title">Insight into<br /><span>Future Returns</span></h2>
              <p className="poly-card-desc">A prediction engine powered by collective intelligence. Here, we don't look at price charts — we look at factual outcomes. Be the oracle the market never had.</p>
              <div className="poly-philos">
                <div className="philos-label" style={{color:"#fb923c"}}>Core Philosophy</div>
                <div className="philos-q" style={{color:"white"}}>"Put a price tag on the truth."</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"rgba(255,255,255,0.22)", marginBottom:"18px" }}>What you can do</div>
              {[
                { n:"01", t:"Monetize Your Views", d:"If you believe a tech product will go viral or an election will pivot — turn your judgment into profit." },
                { n:"02", t:"Risk Hedging", d:"Worried about stocks in Oiyen.Invest dropping? Buy YES on related negative events as insurance." },
                { n:"03", t:"Probability Perspective", d:"Sense world changes before the news hits through real-time odds fluctuations." },
              ].map(f => (
                <div key={f.n} className="poly-feat-item">
                  <div className="poly-feat-num">{f.n}</div>
                  <div><div className="poly-feat-title">{f.t}</div><div className="poly-feat-desc">{f.d}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="poly-vis">
            <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(255,255,255,0.22)", marginBottom:"14px" }}>Live Markets Preview</div>
            <div className="markets-grid">
              {[
                { tag:"Macro",   tc:"#818cf8", tb:"rgba(129,140,248,0.12)", q:"Will the Fed cut rates before June 2025?",     yes:72, vol:"$1.2M" },
                { tag:"Equities",tc:"#34d399", tb:"rgba(52,211,153,0.12)",  q:"Will Apple's market cap exceed $4T in 2025?",  yes:58, vol:"$840K" },
                { tag:"Crypto",  tc:"#fbbf24", tb:"rgba(251,191,36,0.12)",  q:"Will Bitcoin hit $120K before July 2025?",     yes:41, vol:"$3.1M" },
                { tag:"Index",   tc:"#60a5fa", tb:"rgba(96,165,250,0.12)",  q:"Will S&P 500 close above 5,800 this quarter?", yes:63, vol:"$2.4M" },
              ].map((m, i) => (
                <div key={i} className="mkt-card">
                  <div className="mkt-top">
                    <span className="mkt-tag" style={{color:m.tc, background:m.tb}}>{m.tag}</span>
                    <span className="mkt-vol">{m.vol} vol</span>
                  </div>
                  <p className="mkt-q">{m.q}</p>
                  <div className="mkt-bar-row">
                    <span className="mkt-yes">YES {m.yes}%</span>
                    <div className="mkt-bar"><div className="mkt-fill" style={{width:`${m.yes}%`}} /></div>
                    <span className="mkt-no">NO {100-m.yes}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ════ Section 3: Synergy ════ */}
      <div className="section" style={{ paddingTop: 0 }}>
        <div id="s3" data-animate className={`syn-wrap fade-up${v("s3") ? " visible" : ""}`}>
          <div className="syn-head">
            <div className="section-label"><div className="label-line" />The Synergy<div className="label-line" /></div>
            <h2 className="syn-title">How They Work <span>Together</span></h2>
            <p className="syn-sub">This is the soul of the platform — the hallmark of our strategic depth. Two products, one unified intelligence.</p>
          </div>
          <div className="syn-grid">
            {[
              { n:"01", t:"Unified Account",        d:"Seamlessly transfer funds between Invest and Poly without the hassle of withdrawals. One wallet, infinite flexibility." },
              { n:"02", t:"Smart Synchronization",  d:"When predictions in PolyOiyen shift drastically, the system alerts you to adjust your Oiyen.Invest strategies accordingly." },
              { n:"03", t:"All-Around Hedging",     d:"Utilize the prediction market as a powerful hedging tool to protect your principal capital in volatile market conditions." },
            ].map(c => (
              <div key={c.n} className="syn-card">
                <div className="syn-num">{c.n}</div>
                <div className="syn-card-title">{c.t}</div>
                <div className="syn-card-desc">{c.d}</div>
              </div>
            ))}
          </div>
          <div className="flow-row">
            <div className="flow-node"><div className="flow-node-lbl">Product</div><div className="flow-node-title">Oiyen.Invest</div></div>
            <div className="flow-arr"><svg width="30" height="14" viewBox="0 0 30 14" fill="none"><path d="M0 7h26M20 1l8 6-8 6" stroke="currentColor" strokeWidth="1.5"/></svg></div>
            <div className="flow-node mid"><div className="flow-node-lbl">Unified</div><div className="flow-node-title">Your Account</div></div>
            <div className="flow-arr"><svg width="30" height="14" viewBox="0 0 30 14" fill="none"><path d="M0 7h26M20 1l8 6-8 6" stroke="currentColor" strokeWidth="1.5"/></svg></div>
            <div className="flow-node"><div className="flow-node-lbl">Product</div><div className="flow-node-title">PolyOiyen</div></div>
          </div>
        </div>
      </div>

      {/* ════ CTA ════ */}
      <div className="section" style={{ paddingTop: 0 }}>
        <div id="s4" data-animate className={`cta-wrap fade-up${v("s4") ? " visible" : ""}`}>
          <div className="cta-inner">
            <div className="cta-kicker">Ready to Begin</div>
            <h2 className="cta-title">Your Dual-Track<br />Investment Journey Awaits</h2>
            <p className="cta-sub">Ready to embark on your dual-track investment journey?</p>
            <div className="cta-btns">
              <Link href="/markets" className="cta-btn cta-invest">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                Start Investing
              </Link>
              <Link href="/polyoiyen" className="cta-btn cta-poly">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg>
                Start Predicting
              </Link>
            </div>
            <p className="cta-note">No extra fees to switch between products · One account covers everything</p>
          </div>
        </div>
      </div>

      <div style={{ height: 60, position: "relative", zIndex: 1 }} />
    </div>
  );
}