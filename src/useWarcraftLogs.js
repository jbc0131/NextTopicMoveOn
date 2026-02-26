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
  const [scores,  setScores]  = useState(() => loadCache() || {});
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchScores = useCallback(async (forceRefresh = false) => {
    if (!roster || roster.length === 0) return;

    // Check cache first (unless force-refreshing)
    if (!forceRefresh) {
      const cached = loadCache();
      if (cached) {
        setScores(cached);
        return;
      }
    }

    // Only fetch players with actual names (skip dividers)
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

  // Auto-fetch on mount if no cached data
  useEffect(() => {
    const cached = loadCache();
    if (cached) {
      setScores(cached);
    } else {
      fetchScores();
    }
  }, [fetchScores]);

  return { scores, loading, error, lastFetch, refetch: () => fetchScores(true) };
}

// ── Score display helpers ─────────────────────────────────────────────────────

// Returns a color based on parse percentile (WarcraftLogs standard colors)
export function getScoreColor(score) {
  if (score == null) return "#555";
  if (score >= 95)   return "#e268a8"; // Pink  — Legendary
  if (score >= 75)   return "#ff8000"; // Orange — Epic
  if (score >= 50)   return "#1eff00"; // Green  — Rare
  if (score >= 25)   return "#0070dd"; // Blue   — Uncommon
  return                    "#9d9d9d"; // Grey   — Common
}

// Returns a short label for display in tight spaces
export function formatScore(score) {
  if (score == null) return "—";
  return score.toFixed(0);
}
