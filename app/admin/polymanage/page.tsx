"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────
type MarketType = "binary" | "multi" | "scalar";
type Category   = { id: string; label: string; color: string; };
type Option     = { id: string; label: string; color: string; };

const CATEGORIES: Category[] = [
  { id: "macro",    label: "Macro",       color: "#818cf8" },
  { id: "equities", label: "Equities",    color: "#34d399" },
  { id: "crypto",   label: "Crypto",      color: "#fbbf24" },
  { id: "sports",   label: "Sports",      color: "#f97316" },
  { id: "politics", label: "Politics",    color: "#f87171" },
  { id: "tech",     label: "Tech",        color: "#60a5fa" },
  { id: "culture",  label: "Culture",     color: "#c084fc" },
  { id: "other",    label: "Other",       color: "#94a3b8" },
];

const OPTION_COLORS = [
  "#34d399","#60a5fa","#f97316","#c084fc",
  "#fbbf24","#f87171","#818cf8","#2dd4bf",
];

const PRESET_MARKETS = [
  {
    label: "Sports Champion",
    question: "Who will win the badminton singles gold at the 2028 LA Olympics?",
    type: "multi" as MarketType,
    category: "sports",
    options: ["Lee Zii Jia", "Shi Yuqi", "Viktor Axelsen", "Kunlavut Vitidsarn"],
  },
  {
    label: "Binary Event",
    question: "Will the Federal Reserve cut rates before June 2025?",
    type: "binary" as MarketType,
    category: "macro",
    options: [],
  },
  {
    label: "Election Winner",
    question: "Who will win the 2028 US Presidential Election?",
    type: "multi" as MarketType,
    category: "politics",
    options: ["Democrat candidate", "Republican candidate", "Third party"],
  },
  {
    label: "Tech Milestone",
    question: "Which company will first reach $5 trillion market cap?",
    type: "multi" as MarketType,
    category: "tech",
    options: ["Apple", "Microsoft", "NVIDIA", "Alphabet"],
  },
];

// ─── Published market card type ──────────────────
type PublishedMarket = {
  id: string;
  question: string;
  type: MarketType;
  category: string;
  options: Option[];
  liquidity: number;
  closeDate: string;
  status: "live" | "pending" | "resolved";
  volume: number;
  traders: number;
  createdAt: string;
};

const DEMO_MARKETS: PublishedMarket[] = [
  {
    id: "mkt-001",
    question: "Will the Federal Reserve cut interest rates before June 2025?",
    type: "binary", category: "macro",
    options: [
      { id: "y", label: "YES", color: "#34d399" },
      { id: "n", label: "NO",  color: "#f87171" },
    ],
    liquidity: 100, closeDate: "2025-06-18",
    status: "live", volume: 1247830, traders: 3412,
    createdAt: "2025-01-14",
  },
  {
    id: "mkt-002",
    question: "Who will win the 2026 FIFA World Cup?",
    type: "multi", category: "sports",
    options: [
      { id: "a", label: "Brazil",    color: "#34d399" },
      { id: "b", label: "France",    color: "#60a5fa" },
      { id: "c", label: "Germany",   color: "#fbbf24" },
      { id: "d", label: "Argentina", color: "#f97316" },
    ],
    liquidity: 200, closeDate: "2026-07-19",
    status: "live", volume: 892100, traders: 2188,
    createdAt: "2025-01-10",
  },
];

// ─── Utility ─────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 8);
const fmt = (n: number) => n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n}`;

export default function AdminCreateMarket() {
  const router = useRouter();

  // Form state
  const [step, setStep]         = useState<1 | 2 | 3>(1);
  const [mType, setMType]       = useState<MarketType>("binary");
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("macro");
  const [options, setOptions]   = useState<Option[]>([
    { id: uid(), label: "", color: OPTION_COLORS[0] },
    { id: uid(), label: "", color: OPTION_COLORS[1] },
  ]);
  const [liquidity, setLiquidity] = useState(100);
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("23:59");
  const [description, setDescription] = useState("");
  const [resolutionCriteria, setResolutionCriteria] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished]   = useState(false);

  // Markets list
  const [markets, setMarkets] = useState<PublishedMarket[]>(DEMO_MARKETS);
  const [filterStatus, setFilterStatus] = useState<"all"|"live"|"pending"|"resolved">("all");
  const [activeView, setActiveView] = useState<"list"|"create">("list");

  // Option helpers
  const addOption = () => {
    if (options.length >= 8) return;
    setOptions(o => [...o, { id: uid(), label: "", color: OPTION_COLORS[o.length % OPTION_COLORS.length] }]);
  };
  const removeOption = (id: string) => {
    if (options.length <= 2) return;
    setOptions(o => o.filter(x => x.id !== id));
  };
  const updateOption = (id: string, label: string) =>
    setOptions(o => o.map(x => x.id === id ? { ...x, label } : x));

  const applyPreset = (p: typeof PRESET_MARKETS[0]) => {
    setMType(p.type);
    setQuestion(p.question);
    setCategory(p.category);
    if (p.type === "multi" && p.options.length) {
      setOptions(p.options.map((label, i) => ({ id: uid(), label, color: OPTION_COLORS[i % OPTION_COLORS.length] })));
    } else {
      setOptions([
        { id: uid(), label: "", color: OPTION_COLORS[0] },
        { id: uid(), label: "", color: OPTION_COLORS[1] },
      ]);
    }
  };

  const finalOptions: Option[] = mType === "binary"
    ? [
        { id: "yes", label: "YES", color: "#34d399" },
        { id: "no",  label: "NO",  color: "#f87171" },
      ]
    : options.filter(o => o.label.trim());

  const canPublish =
    question.trim().length > 8 &&
    closeDate &&
    (mType === "binary" || finalOptions.length >= 2);

  function handlePublish() {
    if (!canPublish || publishing) return;
    setPublishing(true);
    setTimeout(() => {
      const newMarket: PublishedMarket = {
        id: `mkt-${uid()}`,
        question: question.trim(),
        type: mType,
        category,
        options: finalOptions,
        liquidity,
        closeDate,
        status: "live",
        volume: 0,
        traders: 0,
        createdAt: new Date().toISOString().split("T")[0],
      };
      setMarkets(m => [newMarket, ...m]);
      setPublishing(false);
      setPublished(true);
      setTimeout(() => {
        setPublished(false);
        setActiveView("list");
        // reset form
        setQuestion(""); setDescription(""); setResolutionCriteria("");
        setMType("binary"); setCategory("macro"); setCloseDate(""); setStep(1);
        setOptions([
          { id: uid(), label: "", color: OPTION_COLORS[0] },
          { id: uid(), label: "", color: OPTION_COLORS[1] },
        ]);
      }, 1800);
    }, 1000);
  }

  const filtered = markets.filter(m => filterStatus === "all" || m.status === filterStatus);
  const cat = (id: string) => CATEGORIES.find(c => c.id === id);

  return (
    <div style={{ background: "#160c03", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "white" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --orange: #f97316; --orange2: #fb923c;
          --bdr: rgba(255,255,255,0.08); --bdr-hi: rgba(255,255,255,0.14);
          --surface: rgba(255,255,255,0.04); --surface-hi: rgba(255,255,255,0.07);
          --text: rgba(255,255,255,0.9); --muted: rgba(255,255,255,0.44); --dim: rgba(255,255,255,0.22);
        }

        /* ── 3D card ── */
        .card {
          background: rgba(255,255,255,0.04); border: 1px solid var(--bdr); border-radius: 16px;
          box-shadow: 0 1px 0 rgba(255,255,255,0.09) inset, 0 -1px 0 rgba(0,0,0,0.45) inset,
                      0 4px 14px rgba(0,0,0,0.38), 0 18px 44px rgba(0,0,0,0.24);
        }
        .card-sm {
          background: rgba(255,255,255,0.035); border: 1px solid var(--bdr); border-radius: 10px;
          box-shadow: 0 1px 0 rgba(255,255,255,0.07) inset, 0 2px 8px rgba(0,0,0,0.32);
        }

        /* ── NAV ── */
        .nav {
          height: 58px; padding: 0 28px; display: flex; align-items: center; justify-content: space-between;
          background: rgba(22,12,3,0.9); backdrop-filter: blur(18px);
          border-bottom: 1px solid rgba(255,255,255,0.07); position: sticky; top: 0; z-index: 200;
          box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset;
        }
        .nav-left { display: flex; align-items: center; gap: 6px; }
        .nav-logo { display: flex; align-items: center; gap: 7px; text-decoration: none; }
        .nav-name  { font-size: 15px; font-weight: 700; color: var(--orange); letter-spacing: -0.02em; }
        .nav-div   { color: var(--dim); margin: 0 2px; }
        .nav-section { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.5); }
        .admin-badge {
          display: flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 6px;
          background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.25);
          font-size: 11px; font-weight: 700; color: var(--orange2); letter-spacing: 0.05em;
        }

        /* ── PAGE ── */
        .page { max-width: 1100px; margin: 0 auto; padding: 28px 28px 80px; }

        /* ── PAGE HEADER ── */
        .page-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 28px;
        }
        .page-title {
          font-family: 'DM Serif Display', serif;
          font-size: 28px; color: white; letter-spacing: -0.02em;
        }
        .page-title span { color: var(--orange); }

        /* ── VIEW TOGGLE ── */
        .view-toggle { display: flex; gap: 8px; }
        .vtbtn {
          padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
          cursor: pointer; border: none; font-family: inherit; transition: all 0.16s;
          display: flex; align-items: center; gap: 6px;
        }
        .vtbtn.inactive { background: var(--surface); color: var(--muted); border: 1px solid var(--bdr); }
        .vtbtn.inactive:hover { background: var(--surface-hi); color: var(--text); }
        .vtbtn.active   { background: var(--orange); color: white; box-shadow: 0 4px 14px rgba(249,115,22,0.3); }

        /* ── STATS ROW ── */
        .stats-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
        .stat-card {
          background: rgba(255,255,255,0.04); border: 1px solid var(--bdr); border-radius: 12px;
          padding: 16px 18px;
          box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset, 0 3px 10px rgba(0,0,0,0.3);
        }
        .stat-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin-bottom: 8px; }
        .stat-value { font-family: 'DM Mono', monospace; font-size: 22px; font-weight: 500; color: white; }
        .stat-sub   { font-size: 11px; color: var(--muted); margin-top: 3px; }

        /* ── FILTER BAR ── */
        .filter-bar { display: flex; gap: 6px; margin-bottom: 16px; align-items: center; }
        .filter-label { font-size: 11px; color: var(--dim); margin-right: 4px; }
        .fpill {
          padding: 5px 14px; border-radius: 100px; font-size: 12px; font-weight: 600;
          cursor: pointer; border: 1px solid var(--bdr); background: var(--surface);
          color: var(--muted); transition: all 0.15s; font-family: inherit;
        }
        .fpill.active { background: rgba(249,115,22,0.12); color: var(--orange2); border-color: rgba(249,115,22,0.3); }
        .fpill:not(.active):hover { background: var(--surface-hi); color: var(--text); }

        /* ── MARKET LIST ── */
        .mkt-list { display: flex; flex-direction: column; gap: 10px; }
        .mkt-row {
          background: rgba(255,255,255,0.04); border: 1px solid var(--bdr); border-radius: 12px;
          padding: 16px 20px; display: grid; align-items: center;
          grid-template-columns: 1fr auto auto auto;
          gap: 20px; transition: all 0.18s;
          box-shadow: 0 1px 0 rgba(255,255,255,0.07) inset, 0 3px 10px rgba(0,0,0,0.28);
        }
        .mkt-row:hover { background: rgba(255,255,255,0.06); border-color: var(--bdr-hi); }
        .mkt-row-q { font-size: 14px; font-weight: 500; color: var(--text); margin-bottom: 8px; line-height: 1.4; }
        .mkt-row-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .mkt-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
        .option-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 100px; font-size: 10.5px; font-weight: 600;
          border: 1px solid; opacity: 0.85;
        }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .status-live    { background: #34d399; box-shadow: 0 0 6px rgba(52,211,153,0.6); }
        .status-pending { background: #fbbf24; }
        .status-resolved{ background: #94a3b8; }
        .mkt-stat { text-align: right; }
        .mkt-stat-val { font-family: 'DM Mono', monospace; font-size: 14px; color: var(--text); }
        .mkt-stat-lbl { font-size: 10px; color: var(--dim); margin-top: 2px; }
        .row-actions { display: flex; gap: 6px; }
        .row-btn {
          padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600;
          cursor: pointer; border: 1px solid var(--bdr); background: var(--surface);
          color: var(--muted); transition: all 0.15s; font-family: inherit;
        }
        .row-btn:hover { background: var(--surface-hi); color: var(--text); }
        .row-btn.resolve { border-color: rgba(251,191,36,0.3); color: #fbbf24; background: rgba(251,191,36,0.08); }
        .row-btn.resolve:hover { background: rgba(251,191,36,0.14); }

        /* ── CREATE FORM ── */
        .create-layout { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; }

        /* Stepper */
        .stepper { display: flex; align-items: center; gap: 0; margin-bottom: 28px; }
        .step-item { display: flex; align-items: center; gap: 10px; }
        .step-circle {
          width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; flex-shrink: 0; transition: all 0.2s;
        }
        .step-circle.done   { background: var(--orange); color: white; box-shadow: 0 0 12px rgba(249,115,22,0.35); }
        .step-circle.active { background: rgba(249,115,22,0.15); color: var(--orange2); border: 1.5px solid var(--orange); }
        .step-circle.idle   { background: rgba(255,255,255,0.05); color: var(--dim); border: 1px solid var(--bdr); }
        .step-label { font-size: 12px; font-weight: 600; color: var(--muted); white-space: nowrap; }
        .step-label.active { color: var(--text); }
        .step-line  { flex: 1; height: 1px; background: var(--bdr); margin: 0 10px; min-width: 24px; }
        .step-line.done { background: var(--orange); }

        /* Form card */
        .form-card { padding: 28px; }
        .form-section-title {
          font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--dim); margin-bottom: 18px; display: flex; align-items: center; gap: 8px;
        }
        .form-section-title::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.06); }

        /* Market type selector */
        .type-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 22px; }
        .type-card {
          border-radius: 10px; padding: 14px 16px; cursor: pointer; border: 1.5px solid var(--bdr);
          background: var(--surface); transition: all 0.16s; text-align: left;
        }
        .type-card:hover { border-color: var(--bdr-hi); background: var(--surface-hi); }
        .type-card.active { border-color: var(--orange); background: rgba(249,115,22,0.08); box-shadow: 0 0 0 1px rgba(249,115,22,0.15); }
        .type-icon { font-size: 20px; margin-bottom: 6px; }
        .type-name { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
        .type-desc { font-size: 11px; color: var(--muted); line-height: 1.4; }

        /* Text inputs */
        .field { margin-bottom: 18px; }
        .flabel { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin-bottom: 7px; display: flex; justify-content: space-between; }
        .flabel span { color: var(--muted); font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 11px; }
        .finput {
          width: 100%; background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.11);
          border-radius: 9px; padding: 11px 14px; font-size: 14px; color: white;
          font-family: inherit; outline: none; transition: all 0.15s; resize: vertical;
          box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 8px rgba(0,0,0,0.28);
        }
        .finput:focus { border-color: rgba(249,115,22,0.5); box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 2px rgba(249,115,22,0.12); }
        .finput::placeholder { color: rgba(255,255,255,0.2); }
        textarea.finput { min-height: 80px; }

        /* Category grid */
        .cat-grid { display: flex; gap: 6px; flex-wrap: wrap; }
        .cat-pill {
          padding: 5px 12px; border-radius: 100px; font-size: 12px; font-weight: 600;
          cursor: pointer; border: 1px solid; transition: all 0.15s; font-family: inherit;
        }
        .cat-pill:not(.active) { opacity: 0.45; }
        .cat-pill.active { opacity: 1; }

        /* Option builder */
        .options-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .option-row {
          display: flex; align-items: center; gap: 10px;
          background: rgba(255,255,255,0.04); border: 1px solid var(--bdr);
          border-radius: 9px; padding: 8px 12px;
          box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 6px rgba(0,0,0,0.25);
          transition: border-color 0.15s;
        }
        .option-row:focus-within { border-color: rgba(249,115,22,0.35); }
        .option-color { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .option-num { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--dim); flex-shrink: 0; width: 18px; }
        .option-input {
          flex: 1; background: transparent; border: none; outline: none;
          font-size: 13.5px; font-weight: 500; color: white; font-family: inherit;
        }
        .option-input::placeholder { color: rgba(255,255,255,0.2); }
        .option-del {
          width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1); color: var(--dim); cursor: pointer;
          display: flex; align-items: center; justify-content: center; font-size: 13px;
          transition: all 0.15s; flex-shrink: 0; font-family: inherit;
        }
        .option-del:hover { background: rgba(248,113,113,0.15); border-color: rgba(248,113,113,0.3); color: #f87171; }
        .add-option-btn {
          display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
          background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.14);
          color: var(--muted); font-size: 13px; font-weight: 500; cursor: pointer;
          font-family: inherit; transition: all 0.15s; width: 100%;
        }
        .add-option-btn:hover { background: rgba(255,255,255,0.07); color: var(--text); border-color: rgba(255,255,255,0.22); }
        .add-option-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        /* Liquidity slider */
        .slider-wrap { position: relative; }
        .bslider {
          width: 100%; appearance: none; height: 5px; border-radius: 100px;
          background: rgba(255,255,255,0.1); outline: none; cursor: pointer;
        }
        .bslider::-webkit-slider-thumb {
          appearance: none; width: 18px; height: 18px; border-radius: 50%;
          background: var(--orange); cursor: pointer;
          box-shadow: 0 0 0 3px rgba(249,115,22,0.2), 0 2px 8px rgba(0,0,0,0.4);
        }
        .b-labels { display: flex; justify-content: space-between; font-size: 10px; color: var(--dim); margin-top: 6px; font-family: 'DM Mono', monospace; }

        /* Row of inputs */
        .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* Step nav buttons */
        .step-nav { display: flex; justify-content: space-between; margin-top: 24px; gap: 10px; }
        .snbtn {
          padding: 11px 24px; border-radius: 9px; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: all 0.16s; border: none;
          display: flex; align-items: center; gap: 6px;
        }
        .snbtn.back { background: rgba(255,255,255,0.06); color: var(--muted); border: 1px solid var(--bdr); }
        .snbtn.back:hover { background: rgba(255,255,255,0.1); color: var(--text); }
        .snbtn.next { background: var(--orange); color: white; box-shadow: 0 4px 14px rgba(249,115,22,0.28); }
        .snbtn.next:hover:not(:disabled) { background: #ea580c; box-shadow: 0 6px 20px rgba(249,115,22,0.4); transform: translateY(-1px); }
        .snbtn.next:disabled { opacity: 0.4; cursor: not-allowed; }
        .snbtn.publish {
          background: linear-gradient(135deg, #059669, #34d399); color: white;
          box-shadow: 0 1px 0 rgba(255,255,255,0.2) inset, 0 5px 18px rgba(52,211,153,0.3);
          flex: 1;
        }
        .snbtn.publish:hover:not(:disabled) { box-shadow: 0 1px 0 rgba(255,255,255,0.25) inset, 0 8px 28px rgba(52,211,153,0.45); transform: translateY(-1px); }
        .snbtn.publish:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }

        .spin { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: sp 0.7s linear infinite; vertical-align: middle; }
        @keyframes sp { to { transform: rotate(360deg); } }

        /* ── PREVIEW PANEL ── */
        .preview-panel { position: sticky; top: 76px; }
        .preview-card { padding: 20px; }
        .preview-title { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .preview-q {
          font-family: 'DM Serif Display', serif;
          font-size: 16px; color: white; line-height: 1.35; margin-bottom: 14px; min-height: 44px;
          color: ${`question ? "white" : "var(--dim)"}`};
        }
        .preview-options { display: flex; flex-direction: column; gap: 7px; }
        .preview-opt {
          display: flex; align-items: center; justify-content: space-between;
          border-radius: 8px; padding: 9px 12px; font-size: 13px;
          border: 1px solid; transition: all 0.2s;
        }
        .preview-opt-label { display: flex; align-items: center; gap: 8px; font-weight: 600; }
        .preview-opt-dot   { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .preview-opt-pct   { font-family: 'DM Mono', monospace; font-size: 12px; }
        .preset-section    { margin-bottom: 20px; }
        .preset-title      { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin-bottom: 10px; }
        .preset-grid       { display: flex; flex-direction: column; gap: 6px; }
        .preset-btn {
          display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 8px;
          background: var(--surface); border: 1px solid var(--bdr);
          color: var(--muted); font-size: 12px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all 0.15s; text-align: left;
        }
        .preset-btn:hover { background: var(--surface-hi); color: var(--text); border-color: var(--bdr-hi); }
        .preset-icon { font-size: 15px; flex-shrink: 0; }

        /* Success flash */
        .success-overlay {
          position: fixed; inset: 0; z-index: 500;
          background: rgba(22,12,3,0.85); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
        }
        .success-card {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(52,211,153,0.3);
          border-radius: 20px; padding: 48px 56px; text-align: center;
          box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset, 0 0 60px rgba(52,211,153,0.1), 0 24px 60px rgba(0,0,0,0.4);
          animation: pop 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes pop { from { opacity:0; transform:scale(0.88); } to { opacity:1; transform:scale(1); } }
        .success-icon { font-size: 52px; margin-bottom: 16px; }
        .success-title { font-family: 'DM Serif Display', serif; font-size: 26px; color: white; margin-bottom: 8px; }
        .success-sub   { font-size: 14px; color: var(--muted); }

        @media (max-width: 900px) {
          .create-layout { grid-template-columns: 1fr; }
          .preview-panel { position: static; }
          .stats-row { grid-template-columns: repeat(2,1fr); }
          .page { padding: 16px 14px 60px; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav-left">
          <Link href="/" className="nav-logo">
            <img src="/oiyen-logo.png" alt="" style={{ width: 27, height: 27, borderRadius: "50%" }} />
            <span className="nav-name">Oiyen</span>
          </Link>
          <span className="nav-div">/</span>
          <span className="nav-section">PolyOiyen</span>
          <span className="nav-div">/</span>
          <span className="nav-section">Admin</span>
        </div>
        <div className="admin-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Admin Panel
        </div>
      </nav>

      {/* Success overlay */}
      {published && (
        <div className="success-overlay">
          <div className="success-card">
            <div className="success-icon">🎯</div>
            <div className="success-title">Market Published!</div>
            <div className="success-sub">Your market is now live for traders</div>
          </div>
        </div>
      )}

      <div className="page">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Market <span>Management</span></h1>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Create and manage prediction markets across all categories</p>
          </div>
          <div className="view-toggle">
            <button className={`vtbtn ${activeView === "list" ? "active" : "inactive"}`} onClick={() => setActiveView("list")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              All Markets
            </button>
            <button className={`vtbtn ${activeView === "create" ? "active" : "inactive"}`} onClick={() => setActiveView("create")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create Market
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          {[
            { l: "Total Markets",  v: markets.length,                              s: `${markets.filter(m=>m.status==="live").length} live` },
            { l: "Total Volume",   v: fmt(markets.reduce((a,m)=>a+m.volume,0)),    s: "across all markets" },
            { l: "Total Traders",  v: markets.reduce((a,m)=>a+m.traders,0).toLocaleString(), s: "unique wallets" },
            { l: "Avg Liquidity b",v: Math.round(markets.reduce((a,m)=>a+m.liquidity,0)/Math.max(1,markets.length)), s: "liquidity parameter" },
          ].map(s => (
            <div key={s.l} className="stat-card">
              <div className="stat-label">{s.l}</div>
              <div className="stat-value">{s.v}</div>
              <div className="stat-sub">{s.s}</div>
            </div>
          ))}
        </div>

        {/* ══════ LIST VIEW ══════ */}
        {activeView === "list" && (
          <>
            <div className="filter-bar">
              <span className="filter-label">Filter:</span>
              {(["all","live","pending","resolved"] as const).map(f => (
                <button key={f} className={`fpill${filterStatus===f?" active":""}`} onClick={()=>setFilterStatus(f)}>
                  {f.charAt(0).toUpperCase()+f.slice(1)}
                </button>
              ))}
            </div>

            <div className="mkt-list">
              {filtered.map(m => {
                const c = cat(m.category);
                const equalPct = Math.round(100 / m.options.length);
                return (
                  <div key={m.id} className="mkt-row">
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: c?.color, flexShrink: 0, display: "inline-block", boxShadow: `0 0 6px ${c?.color}80` }} />
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c?.color }}>{c?.label}</span>
                        <span style={{ fontSize: 10, color: "var(--dim)", fontFamily: "DM Mono" }}>{m.id}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                          <span className={`status-dot status-${m.status}`} />
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: m.status==="live"?"#34d399":m.status==="pending"?"#fbbf24":"#94a3b8" }}>{m.status}</span>
                        </div>
                      </div>
                      <div className="mkt-row-q">{m.question}</div>
                      <div className="mkt-chips">
                        {m.options.map((o, i) => (
                          <span key={o.id} className="option-chip"
                            style={{ color: o.color, borderColor: `${o.color}44`, background: `${o.color}11` }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: o.color, display:"inline-block" }} />
                            {o.label}
                            <span style={{ color: "var(--dim)", fontFamily: "DM Mono", fontSize: 10 }}>{equalPct}%</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mkt-stat">
                      <div className="mkt-stat-val">{fmt(m.volume)}</div>
                      <div className="mkt-stat-lbl">Volume</div>
                    </div>
                    <div className="mkt-stat">
                      <div className="mkt-stat-val">{m.traders.toLocaleString()}</div>
                      <div className="mkt-stat-lbl">Traders</div>
                    </div>
                    <div className="row-actions">
                      <button className="row-btn" onClick={() => router.push(`/polyoiyen/${m.id}`)}>View</button>
                      {m.status === "live" && (
                        <button className="row-btn resolve"
                          onClick={() => setMarkets(prev => prev.map(x => x.id===m.id ? {...x, status:"resolved"} : x))}>
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--dim)", fontSize: 14 }}>
                  No markets found for this filter.
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════ CREATE VIEW ══════ */}
        {activeView === "create" && (
          <div className="create-layout">

            {/* ── LEFT: Form ── */}
            <div>
              {/* Stepper */}
              <div className="stepper">
                {[
                  { n: 1, l: "Market Type" },
                  { n: 2, l: "Question & Options" },
                  { n: 3, l: "Settings & Publish" },
                ].map((s, i, arr) => (
                  <div key={s.n} style={{ display: "flex", alignItems: "center", flex: i < arr.length - 1 ? 1 : 0 }}>
                    <div className="step-item" onClick={() => step > s.n && setStep(s.n as 1|2|3)} style={{ cursor: step > s.n ? "pointer" : "default" }}>
                      <div className={`step-circle ${step > s.n ? "done" : step === s.n ? "active" : "idle"}`}>
                        {step > s.n
                          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          : s.n}
                      </div>
                      <span className={`step-label${step === s.n ? " active" : ""}`}>{s.l}</span>
                    </div>
                    {i < arr.length - 1 && <div className={`step-line${step > s.n ? " done" : ""}`} />}
                  </div>
                ))}
              </div>

              {/* ── STEP 1: Type ── */}
              {step === 1 && (
                <div className="card form-card">
                  <div className="form-section-title">Choose Market Type</div>
                  <div className="type-grid">
                    {([
                      { id: "binary", icon: "⚖️", name: "Binary",   desc: "Classic YES / NO outcome" },
                      { id: "multi",  icon: "🏆", name: "Multiple", desc: "Multiple named outcomes" },
                      { id: "scalar", icon: "📊", name: "Scalar",   desc: "Numeric range outcome (coming soon)" },
                    ] as const).map(t => (
                      <div key={t.id}
                        className={`type-card${mType===t.id?" active":""}${t.id==="scalar"?" opacity-50":""}`}
                        onClick={() => t.id !== "scalar" && setMType(t.id as MarketType)}
                        style={{ opacity: t.id === "scalar" ? 0.45 : 1, cursor: t.id === "scalar" ? "not-allowed" : "pointer" }}>
                        <div className="type-icon">{t.icon}</div>
                        <div className="type-name">{t.name}</div>
                        <div className="type-desc">{t.desc}</div>
                      </div>
                    ))}
                  </div>

                  <div className="form-section-title" style={{ marginTop: 8 }}>Category</div>
                  <div className="cat-grid">
                    {CATEGORIES.map(c => (
                      <button key={c.id}
                        className={`cat-pill${category===c.id?" active":""}`}
                        style={{ color: c.color, borderColor: `${c.color}55`, background: category===c.id?`${c.color}18`:"transparent" }}
                        onClick={() => setCategory(c.id)}>
                        {c.label}
                      </button>
                    ))}
                  </div>

                  <div className="step-nav">
                    <div />
                    <button className="snbtn next" onClick={() => setStep(2)}>
                      Next: Write Question
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 2: Question & Options ── */}
              {step === 2 && (
                <div className="card form-card">
                  <div className="field">
                    <div className="flabel">
                      Market Question
                      <span>{question.length} / 200 chars</span>
                    </div>
                    <textarea
                      className="finput"
                      placeholder={mType === "binary"
                        ? "e.g. Will the Fed cut rates before June 2025?"
                        : "e.g. Who will win the badminton singles gold at the 2028 LA Olympics?"}
                      value={question}
                      onChange={e => setQuestion(e.target.value.slice(0, 200))}
                      rows={3}
                    />
                  </div>

                  <div className="field">
                    <div className="flabel">Description <span>Optional</span></div>
                    <textarea
                      className="finput"
                      placeholder="Provide context, data sources, or background information for traders…"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={2}
                    />
                  </div>

                  {/* Options */}
                  <div className="form-section-title" style={{ marginTop: 4 }}>
                    {mType === "binary" ? "Outcomes (fixed)" : `Outcomes · ${finalOptions.length} options`}
                  </div>

                  {mType === "binary" ? (
                    <div className="options-list">
                      {[
                        { label: "YES", color: "#34d399" },
                        { label: "NO",  color: "#f87171" },
                      ].map(o => (
                        <div key={o.label} className="option-row" style={{ borderColor: `${o.color}55` }}>
                          <span className="option-color" style={{ background: o.color }} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: o.color, flex: 1 }}>{o.label}</span>
                          <span style={{ fontSize: 11, color: "var(--dim)", fontFamily: "DM Mono" }}>Fixed outcome</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="options-list">
                        {options.map((o, i) => (
                          <div key={o.id} className="option-row">
                            <span className="option-color" style={{ background: o.color }} />
                            <span className="option-num">{String(i + 1).padStart(2, "0")}</span>
                            <input
                              className="option-input"
                              placeholder={`Option ${i + 1} — e.g. Lee Zii Jia`}
                              value={o.label}
                              onChange={e => updateOption(o.id, e.target.value)}
                            />
                            <button className="option-del" onClick={() => removeOption(o.id)}>×</button>
                          </div>
                        ))}
                      </div>
                      <button className="add-option-btn" onClick={addOption} disabled={options.length >= 8}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add option {options.length >= 8 ? "(max 8)" : `(${options.length}/8)`}
                      </button>
                    </>
                  )}

                  <div className="field" style={{ marginTop: 18 }}>
                    <div className="flabel">Resolution Criteria <span>Optional but recommended</span></div>
                    <textarea
                      className="finput"
                      placeholder="How will this market be resolved? e.g. Official Olympic records as reported by the IOC…"
                      value={resolutionCriteria}
                      onChange={e => setResolutionCriteria(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className="step-nav">
                    <button className="snbtn back" onClick={() => setStep(1)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                      Back
                    </button>
                    <button
                      className="snbtn next"
                      disabled={!question.trim() || (mType === "multi" && finalOptions.length < 2)}
                      onClick={() => setStep(3)}>
                      Next: Settings
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Settings & Publish ── */}
              {step === 3 && (
                <div className="card form-card">
                  <div className="form-section-title">Market Settings</div>

                  <div className="input-row" style={{ marginBottom: 18 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <div className="flabel">Close Date</div>
                      <input
                        className="finput" type="date"
                        style={{ colorScheme: "dark" }}
                        value={closeDate}
                        onChange={e => setCloseDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <div className="flabel">Close Time (UTC)</div>
                      <input
                        className="finput" type="time"
                        style={{ colorScheme: "dark" }}
                        value={closeTime}
                        onChange={e => setCloseTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <div className="flabel">
                      Liquidity Parameter (b)
                      <span style={{ color: "var(--orange2)", fontWeight: 600 }}>b = {liquidity}</span>
                    </div>
                    <input
                      type="range" className="bslider"
                      min={20} max={500} step={10}
                      value={liquidity}
                      onChange={e => setLiquidity(Number(e.target.value))}
                    />
                    <div className="b-labels">
                      <span>20 (low liquidity)</span>
                      <span>500 (high liquidity)</span>
                    </div>
                    <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(249,115,22,0.07)", borderRadius: 8, border: "1px solid rgba(249,115,22,0.15)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                      Max subsidy loss: <span style={{ color: "var(--orange2)", fontFamily: "DM Mono", fontWeight: 600 }}>${(liquidity * Math.log(2) * (mType === "binary" ? 1 : finalOptions.length * 0.6)).toFixed(2)}</span>
                      &nbsp;·&nbsp; Higher b = less price impact per trade
                    </div>
                  </div>

                  {/* Review summary */}
                  <div className="form-section-title" style={{ marginTop: 4 }}>Review</div>
                  <div className="card-sm" style={{ padding: "14px 16px", marginBottom: 20 }}>
                    {[
                      { k: "Type",     v: mType === "binary" ? "Binary (YES / NO)" : `Multiple choice (${finalOptions.length} options)` },
                      { k: "Category", v: cat(category)?.label || category },
                      { k: "Closes",   v: closeDate ? `${closeDate} at ${closeTime} UTC` : "—" },
                      { k: "b param",  v: String(liquidity) },
                      { k: "Options",  v: finalOptions.map(o => o.label).join(", ") || "YES, NO" },
                    ].map(r => (
                      <div key={r.k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
                        <span style={{ color: "var(--muted)" }}>{r.k}</span>
                        <span style={{ color: "var(--text)", fontFamily: "DM Mono", fontSize: 11.5, textAlign: "right", maxWidth: "55%" }}>{r.v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="step-nav">
                    <button className="snbtn back" onClick={() => setStep(2)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                      Back
                    </button>
                    <button className="snbtn publish" onClick={handlePublish} disabled={!canPublish || publishing}>
                      {publishing
                        ? <><span className="spin" style={{ marginRight: 8 }} /> Publishing…</>
                        : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg> Publish Market</>}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT: Presets + Live Preview ── */}
            <div className="preview-panel">

              {/* Presets */}
              <div className="card" style={{ padding: "18px 20px", marginBottom: 14 }}>
                <div className="preset-title" style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 12 }}>
                  Quick Presets
                </div>
                <div className="preset-grid">
                  {PRESET_MARKETS.map(p => (
                    <button key={p.label} className="preset-btn" onClick={() => { applyPreset(p); setStep(2); }}>
                      <span className="preset-icon">
                        {p.category==="sports"?"🏆":p.category==="macro"?"📊":p.category==="politics"?"🗳️":"💡"}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 12 }}>{p.label}</div>
                        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1, lineHeight: 1.3 }}>
                          {p.question.slice(0, 52)}…
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live preview */}
              <div className="card preview-card">
                <div className="preview-title">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="#34d399"><circle cx="5" cy="5" r="5"/></svg>
                  Live Preview
                </div>

                {/* Category tag */}
                {category && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                      padding: "3px 10px", borderRadius: 100,
                      background: `${cat(category)?.color}18`,
                      color: cat(category)?.color,
                      border: `1px solid ${cat(category)?.color}44`,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cat(category)?.color, display: "inline-block" }} />
                      {cat(category)?.label}
                    </span>
                  </div>
                )}

                <div style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: 15, lineHeight: 1.35, marginBottom: 16,
                  color: question ? "white" : "var(--dim)",
                  minHeight: 44,
                }}>
                  {question || "Your question will appear here…"}
                </div>

                {/* Option previews */}
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {(mType === "binary"
                    ? [{ label: "YES", color: "#34d399" }, { label: "NO", color: "#f87171" }]
                    : finalOptions.length > 0
                      ? finalOptions
                      : [{ label: "Option A", color: OPTION_COLORS[0] }, { label: "Option B", color: OPTION_COLORS[1] }]
                  ).map((o, i, arr) => {
                    const pct = Math.round(100 / arr.length);
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        borderRadius: 8, padding: "9px 12px",
                        background: `${o.color}10`,
                        border: `1px solid ${o.color}35`,
                        position: "relative", overflow: "hidden",
                      }}>
                        {/* depth fill bar */}
                        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, background: `${o.color}08` }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: o.color, flexShrink: 0, boxShadow: `0 0 6px ${o.color}88` }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: o.color }}>{o.label || `Option ${i+1}`}</span>
                        </div>
                        <span style={{ fontFamily: "DM Mono", fontSize: 12, color: o.color, position: "relative" }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>

                {/* Meta preview */}
                {closeDate && (
                  <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid var(--bdr)", fontSize: 11, color: "var(--dim)", display: "flex", justifyContent: "space-between" }}>
                    <span>Closes {closeDate}</span>
                    <span style={{ fontFamily: "DM Mono" }}>b = {liquidity}</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}