"use client";

import { useEffect, useState } from "react";
import PolyHeader from "../PolyHeader";

interface ModelBacktest {
  id: number;
  name: string;
  version: string;
  description?: string;
  notes?: string;
  modelType: string;
  parameters: string;
  dataStartDate?: string;
  dataEndDate?: string;
  status: "active" | "archived" | "compare" | "experimental";
  isInversePair: boolean;
  parentModelId?: number;
  createdAt: string;
  updatedAt: string;
  runs: Array<{
    id: number;
    aggregateWinRate: number | null;
    avgReturn: number | null;
    avgMaxDrawdown: number | null;
    backtestStatus: string;
    createdAt: string;
  }>;
  strategies: Array<{
    id: number;
    strategyName: string;
    isInverse: boolean;
    runsCount: number;
    winRate: number | null;
    avgReturn: number | null;
  }>;
}

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; text: string }> = {
    active: { bg: "bg-green-900/50", text: "text-green-300" },
    archived: { bg: "bg-gray-900/50", text: "text-gray-400" },
    compare: { bg: "bg-blue-900/50", text: "text-blue-300" },
    experimental: { bg: "bg-yellow-900/50", text: "text-yellow-300" },
  };
  const style = styles[status] || styles.active;
  return <span className={`px-2 py-1 rounded text-xs ${style.bg} ${style.text}`}>{status.toUpperCase()}</span>;
}

export default function BacktestManagerPage() {
  const [backtests, setBacktests] = useState<ModelBacktest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<"all" | "active" | "archived">("active");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    version: "",
    description: "",
    notes: "",
    modelType: "PolyOiyen",
  });

  useEffect(() => {
    fetchBacktests();
  }, [selectedFilter]);

  async function fetchBacktests() {
    try {
      setLoading(true);
      const query =
        selectedFilter === "all"
          ? ""
          : `?status=${selectedFilter}`;
      const res = await fetch(`/api/polyoiyen/backtest-versions${query}`);
      const data = await res.json();
      setBacktests(data);
    } catch (error) {
      console.error("Failed to fetch backtests:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBacktest() {
    try {
      const res = await fetch("/api/polyoiyen/backtest-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to create backtest");

      setFormData({ name: "", version: "", description: "", notes: "", modelType: "PolyOiyen" });
      setShowCreateForm(false);
      fetchBacktests();
    } catch (error) {
      console.error("Failed to create backtest:", error);
      alert("Error creating backtest");
    }
  }

  async function handleArchive(id: number) {
    if (!confirm("Archive this backtest?")) return;
    try {
      const res = await fetch(`/api/polyoiyen/backtest-versions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to archive");
      fetchBacktests();
    } catch (error) {
      console.error("Failed to archive backtest:", error);
      alert("Error archiving backtest");
    }
  }

  async function handlePromoteRun(backtest: ModelBacktest) {
    const runId = backtest.runs[0]?.id;
    if (!runId) {
      alert("No run available to mark as version.");
      return;
    }
    const versionName = prompt("Version name", `PolyOiyen Snapshot ${new Date().toLocaleDateString()}`)?.trim();
    if (!versionName) return;
    const version = prompt("Version number", "1.0")?.trim();
    if (!version) return;
    const notes = prompt("Notes", "Promoted from auto snapshot")?.trim() || "Promoted from auto snapshot";

    try {
      const res = await fetch("/api/polyoiyen/backtest-mark-version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          name: versionName,
          version,
          notes,
          description: `Snapshot promoted from ${backtest.name}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to promote run");
      fetchBacktests();
    } catch (error) {
      console.error("Failed to promote run:", error);
      alert("Error promoting snapshot to version");
    }
  }

  const filtered = backtests.filter(
    (b) => selectedFilter === "all" || b.status === selectedFilter
  );

  return (
    <div style={{ background: "#1a1a1a", color: "#e4e4e7", minHeight: "100vh" }}>
      <PolyHeader active="BacktestManager" />

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "20px" }}>
        <div style={{ marginBottom: "30px" }}>
          <h1 style={{ fontSize: "28px", marginBottom: "10px" }}>📊 Backtest Manager</h1>
          <p style={{ color: "#a1a1a1", fontSize: "14px" }}>
            Auto snapshots are saved from data-health and inverse strategies are generated automatically.
          </p>
        </div>

        {/* Filter & Create */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            padding: "15px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "8px",
          }}
        >
          <div style={{ display: "flex", gap: "10px" }}>
            {(["all", "active", "archived"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSelectedFilter(f)}
                style={{
                  padding: "8px 16px",
                  background: selectedFilter === f ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${selectedFilter === f ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.1)"}`,
                  color: selectedFilter === f ? "#60a5fa" : "#a1a1a1",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              padding: "8px 16px",
              background: "rgba(34,197,94,0.2)",
              border: "1px solid rgba(34,197,94,0.5)",
              color: "#86efac",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            + MANUAL VERSION
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div
            style={{
              marginBottom: "20px",
              padding: "20px",
              background: "rgba(22,163,74,0.1)",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: "8px",
            }}
          >
            <h3 style={{ marginBottom: "15px", color: "#86efac" }}>Create New Backtest Version</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "15px" }}>
              <input
                type="text"
                placeholder="Backtest Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#e4e4e7",
                  borderRadius: "4px",
                }}
              />
              <input
                type="text"
                placeholder="Version (e.g., 1.0)"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                style={{
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#e4e4e7",
                  borderRadius: "4px",
                }}
              />
            </div>
            <textarea
              placeholder="Notes (why this version, what changed...)"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e4e4e7",
                borderRadius: "4px",
                marginBottom: "15px",
                fontFamily: "monospace",
                fontSize: "12px",
                resize: "none",
              }}
            />
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={handleCreateBacktest}
                style={{
                  padding: "8px 16px",
                  background: "rgba(34,197,94,0.3)",
                  border: "1px solid rgba(34,197,94,0.5)",
                  color: "#86efac",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                CREATE
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                style={{
                  padding: "8px 16px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#a1a1a1",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* Backtests List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#a1a1a1" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#a1a1a1" }}>
            No backtests found
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "15px" }}>
            {filtered.map((backtest) => (
              <div
                key={backtest.id}
                style={{
                  padding: "20px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                      <h3 style={{ fontSize: "16px", margin: 0 }}>{backtest.name}</h3>
                      <span style={{ fontSize: "12px", color: "#a1a1a1" }}>v{backtest.version}</span>
                      {statusBadge(backtest.status)}
                      {backtest.isInversePair && (
                        <span style={{ fontSize: "11px", color: "#fbbf24", background: "rgba(251,191,36,0.15)", padding: "4px 8px", borderRadius: "3px" }}>
                          INVERSE
                        </span>
                      )}
                    </div>
                    {backtest.notes && (
                      <p style={{ fontSize: "12px", color: "#a1a1a1", margin: "8px 0" }}>{backtest.notes}</p>
                    )}
                  </div>
                  <div style={{ textAlign: "right", minWidth: "200px" }}>
                    {backtest.runs[0] && (
                      <div style={{ fontSize: "12px", color: "#a1a1a1" }}>
                        <div>
                          WR: {backtest.runs[0].aggregateWinRate?.toFixed(1) || "N/A"}% | Ret: {backtest.runs[0].avgReturn?.toFixed(2) || "N/A"}%
                        </div>
                        <div>DD: {backtest.runs[0].avgMaxDrawdown?.toFixed(2) || "N/A"}%</div>
                        <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                          {new Date(backtest.runs[0].createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Strategies Preview */}
                {backtest.strategies.length > 0 && (
                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: "11px", color: "#a1a1a1", marginBottom: "8px" }}>
                      {backtest.strategies.length} strateg{backtest.strategies.length > 1 ? "ies" : "y"}:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {backtest.strategies.slice(0, 5).map((strat) => (
                        <span
                          key={strat.id}
                          style={{
                            fontSize: "11px",
                            padding: "4px 8px",
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "3px",
                            color: "#d4d4d8",
                          }}
                        >
                          {strat.strategyName} ({strat.runsCount}x)
                        </span>
                      ))}
                      {backtest.strategies.length > 5 && (
                        <span style={{ fontSize: "11px", color: "#a1a1a1" }}>
                          +{backtest.strategies.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                  <a
                    href={`/polyoiyen/backtest-details/${backtest.id}`}
                    style={{
                      fontSize: "11px",
                      padding: "6px 12px",
                      background: "rgba(59,130,246,0.2)",
                      border: "1px solid rgba(59,130,246,0.4)",
                      color: "#60a5fa",
                      borderRadius: "3px",
                      textDecoration: "none",
                      cursor: "pointer",
                    }}
                  >
                    VIEW DETAILS
                  </a>
                  {!backtest.isInversePair && (
                    <button
                      onClick={() => alert("Inverse is auto-generated from existing data in data-health.")}
                      style={{
                        fontSize: "11px",
                        padding: "6px 12px",
                        background: "rgba(168,85,247,0.2)",
                        border: "1px solid rgba(168,85,247,0.4)",
                        color: "#d8b4fe",
                        borderRadius: "3px",
                        cursor: "pointer",
                      }}
                    >
                      INVERSE: AUTO
                    </button>
                  )}
                  {backtest.version === "auto" && backtest.runs[0] && (
                    <button
                      onClick={() => handlePromoteRun(backtest)}
                      style={{
                        fontSize: "11px",
                        padding: "6px 12px",
                        background: "rgba(34,197,94,0.2)",
                        border: "1px solid rgba(34,197,94,0.4)",
                        color: "#86efac",
                        borderRadius: "3px",
                        cursor: "pointer",
                      }}
                    >
                      MARK AS VERSION
                    </button>
                  )}
                  {backtest.status === "active" && (
                    <button
                      onClick={() => handleArchive(backtest.id)}
                      style={{
                        fontSize: "11px",
                        padding: "6px 12px",
                        background: "rgba(239,68,68,0.2)",
                        border: "1px solid rgba(239,68,68,0.4)",
                        color: "#fca5a5",
                        borderRadius: "3px",
                        cursor: "pointer",
                      }}
                    >
                      ARCHIVE
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
