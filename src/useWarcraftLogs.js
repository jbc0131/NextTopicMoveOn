// src/useWarcraftLogs.js
// Hook that fetches Median Performance Average scores for all roster players.
// Scores are cached in sessionStorage so we don't re-fetch on every tab switch.
// Players can have a `wclName` override — used for fetch + lookup in place of display name.

import { useState, useEffect, useCallback, useRef } from "react";
import { getRole } from "./constants";

const CACHE_KEY = "wcl_scores_v5";
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

// Build a stable key from the names list so we only re-fetch when names actually change
function buildNamesKey(roster) {
  return roster
    .filter(p => p.name && !p.isDivider)
    .map(p => p.wclName?.trim() || p.name)
    .sort()
    .join("|");
}

export function useWarcraftLogs(roster) {
  const [scores,    setScores]    = useState(() => loadCache() || {});
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  // Track the last names key we successfully fetched — avoids re-fetching
  // when Firebase delivers a new array reference with the same players
  const lastFetchedKey = useRef(null);

  const fetchScores = useCallback(async (forceRefresh = false) => {
    if (!roster || roster.length === 0) return;

    const namesKey = buildNamesKey(roster);

    if (!forceRefresh) {
      const cached = loadCache();
      if (cached) {
        setScores(cached);
        lastFetchedKey.current = namesKey;
        return;
      }
      // Same names as last fetch and no force-refresh — don't hit API again
      if (namesKey === lastFetchedKey.current) return;
    }

    const seen = new Set();
    const players = roster
      .filter(p => p.name && !p.isDivider)
      .reduce((acc, p) => {
        const name = p.wclName?.trim() || p.name;
        if (!seen.has(name)) {
          seen.add(name);
          acc.push({ name, role: getRole(p) });
        }
        return acc;
      }, []);

    if (players.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/warcraftlogs", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ players }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      saveCache(data);
      setScores(data);
      setLastFetch(new Date());
      lastFetchedKey.current = namesKey;
    } catch (err) {
      console.error("WCL fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roster]);

  useEffect(() => {
    if (!roster || roster.length === 0) return;
    const namesKey = buildNamesKey(roster);
    const cached = loadCache();
    if (cached) {
      setScores(cached);
      lastFetchedKey.current = namesKey;
      return;
    }
    // Only fetch if names have actually changed since last fetch
    if (namesKey !== lastFetchedKey.current) {
      fetchScores();
    }
  }, [fetchScores]);

  return { scores, loading, error, lastFetch, refetch: () => fetchScores(true) };
}

// ── Score helpers ─────────────────────────────────────────────────────────────

// Returns the correct score for a player, respecting wclName override.
export function getScoreForPlayer(scores, player, activeTab) {
  const lookupName = player?.wclName?.trim() || player?.name;
  if (!lookupName) return null;
  const p = scores?.[lookupName];
  if (!p) return null;
  if (activeTab === "kara") return p.kara;
  if (activeTab === "gruul" || activeTab === "mags") return p.gruulMags;
  return null;
}

// Legacy helper — looks up by plain name string
export function getScoreForTab(scores, playerName, activeTab) {
  const p = scores?.[playerName];
  if (!p) return null;
  if (activeTab === "kara") return p.kara;
  if (activeTab === "gruul" || activeTab === "mags") return p.gruulMags;
  return null;
}

// WarcraftLogs official parse color breakdown
export function getScoreColor(score) {
  if (score == null)  return null;
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
