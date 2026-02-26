// src/useWarcraftLogs.js
// Hook that fetches Median Performance Average scores for all roster players.
// Scores are cached in sessionStorage so we don't re-fetch on every tab switch.

import { useState, useEffect, useCallback } from "react";

const CACHE_KEY = "wcl_scores_v1";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { scores, fetchedAt } = JSON.parse(raw);
    if (Date.now() - fetchedAt > CACHE_TTL) return null;
    return scores;
  } catch {
    return null;
  }
}

function saveCache(scores) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ scores, fetchedAt: Date.now() }));
  } catch {}
}

export function useWarcraftLogs(roster) {
  const [scores,    setScores]    = useState(() => loadCache() || {});
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchScores = useCallback(async (forceRefresh = false) => {
    if (!roster || roster.length === 0) return;

    if (!forceRefresh) {
      const cached = loadCache();
      if (cached) { setScores(cached); return; }
    }

    const names = roster
      .filter(p => p.name && !p.isDivider)
      .map(p => p.name);

    if (names.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/warcraftlogs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ names }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      saveCache(data);
      setScores(data);
      setLastFetch(new Date());
    } catch (err) {
      console.error("WCL fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roster]);

  useEffect(() => {
    if (!roster || roster.length === 0) return; // wait until roster is actually loaded
    const cached = loadCache();
    if (cached) { setScores(cached); }
    else { fetchScores(); }
  }, [fetchScores, roster.length]); // re-run if roster goes from 0 → populated

  return { scores, loading, error, lastFetch, refetch: () => fetchScores(true) };
}

// ── Score helpers ─────────────────────────────────────────────────────────────

// Returns the correct score key based on the active raid tab
export function getScoreForTab(scores, playerName, activeTab) {
  const p = scores?.[playerName];
  if (!p) return null;
  if (activeTab === "kara") return p.kara;
  if (activeTab === "gruul" || activeTab === "mags") return p.gruulMags;
  return null;
}

// WarcraftLogs official parse color breakdown
export function getScoreColor(score) {
  if (score == null)  return null;        // no data — don't show anything
  if (score === 100)  return "#e5cc80";   // Gold   — rank 1
  if (score >= 99)    return "#e268a8";   // Pink   — 99
  if (score >= 95)    return "#ff8000";   // Orange — 95-98
  if (score >= 75)    return "#a335ee";   // Purple — 75-94
  if (score >= 50)    return "#0070dd";   // Blue   — 50-74
  if (score >= 25)    return "#1eff00";   // Green  — 25-49
  return                     "#9d9d9d";   // Grey   — 0-24
}

export function formatScore(score) {
  if (score == null) return null;
  return Math.round(score).toString();
}
