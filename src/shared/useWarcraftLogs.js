/**
 * useWarcraftLogs — WarcraftLogs parse score hook
 *
 * Changes from v1:
 *   - Cache key is now namespaced by teamId + module (Risk 3 fix)
 *     Pattern: wcl_scores_v6_{teamId}_{module}
 *   - Second argument { teamId, module } is required
 *   - Version bump v5 → v6 invalidates old cached data on first load
 *
 * Usage:
 *   const { scores, loading, error, lastFetch, refetch } =
 *     useWarcraftLogs(roster, { teamId: "team-dick", module: "kara" });
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getRole } from "./constants";

const CACHE_VERSION = "v6";
const CACHE_TTL     = 30 * 60 * 1000; // 30 minutes (matches server-side cache)

function cacheKey(teamId, module) {
  return `wcl_scores_${CACHE_VERSION}_${teamId}_${module}`;
}

function loadCache(teamId, module) {
  try {
    const raw = sessionStorage.getItem(cacheKey(teamId, module));
    if (!raw) return null;
    const { scores, fetchedAt } = JSON.parse(raw);
    if (Date.now() - fetchedAt > CACHE_TTL) return null;
    return scores;
  } catch {
    return null;
  }
}

function saveCache(scores, teamId, module) {
  try {
    sessionStorage.setItem(
      cacheKey(teamId, module),
      JSON.stringify({ scores, fetchedAt: Date.now() })
    );
  } catch {}
}

function buildNamesKey(roster) {
  return roster
    .filter(p => p.name && !p.isDivider)
    .map(p => p.wclName?.trim() || p.name)
    .sort()
    .join("|");
}

export function useWarcraftLogs(roster, { teamId, module } = {}) {
  const [scores,    setScores]    = useState(() => {
    if (!teamId || !module) return {};
    return loadCache(teamId, module) || {};
  });
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const lastFetchedKey  = useRef(null);
  const lastTeamModule  = useRef(`${teamId}|${module}`);
  const fetchInFlight   = useRef(false);

  // Reset fetch key when team or module changes so we always refetch
  const currentTeamModule = `${teamId}|${module}`;
  if (currentTeamModule !== lastTeamModule.current) {
    lastTeamModule.current  = currentTeamModule;
    lastFetchedKey.current  = null;
  }

  // Stabilize roster identity — only change when player names actually change
  const namesKey = useMemo(() => buildNamesKey(roster || []), [roster]);
  const stableNamesKey = useRef(namesKey);
  const stableRoster   = useRef(roster);
  if (namesKey !== stableNamesKey.current) {
    stableNamesKey.current = namesKey;
    stableRoster.current   = roster;
  }

  const fetchScores = useCallback(async (forceRefresh = false) => {
    const currentRoster = stableRoster.current;
    if (!currentRoster || currentRoster.length === 0) return;
    if (!teamId || !module) {
      console.warn("useWarcraftLogs: teamId and module are required");
      return;
    }
    if (fetchInFlight.current && !forceRefresh) return;

    const currentNamesKey = stableNamesKey.current;

    if (!forceRefresh) {
      const cached = loadCache(teamId, module);
      if (cached) {
        setScores(prev => {
          // Avoid re-render if cache content is identical
          const prevJson = JSON.stringify(prev);
          const cachedJson = JSON.stringify(cached);
          return prevJson === cachedJson ? prev : cached;
        });
        lastFetchedKey.current = currentNamesKey;
        return;
      }
      if (currentNamesKey === lastFetchedKey.current) return;
    }

    const seen    = new Set();
    const players = currentRoster
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

    fetchInFlight.current = true;
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
      saveCache(data, teamId, module);
      setScores(data);
      setLastFetch(new Date());
      lastFetchedKey.current = currentNamesKey;
    } catch (err) {
      console.error("WCL fetch error:", err);
      setError(err.message);
    } finally {
      fetchInFlight.current = false;
      setLoading(false);
    }
  }, [teamId, module, namesKey]);

  useEffect(() => {
    if (!roster || roster.length === 0 || !teamId || !module) return;
    const currentNamesKey = stableNamesKey.current;
    const cached = loadCache(teamId, module);
    if (cached) {
      setScores(prev => {
        const prevJson = JSON.stringify(prev);
        const cachedJson = JSON.stringify(cached);
        return prevJson === cachedJson ? prev : cached;
      });
      lastFetchedKey.current = currentNamesKey;
      return;
    }
    if (currentNamesKey !== lastFetchedKey.current) {
      fetchScores();
    }
  }, [fetchScores, teamId, module]);

  return {
    scores,
    loading,
    error,
    lastFetch,
    refetch: () => fetchScores(true),
  };
}

// ── Score helpers ─────────────────────────────────────────────────────────────
export function getScoreForPlayer(scores, player, activeTab) {
  const lookupName = player?.wclName?.trim() || player?.name;
  if (!lookupName) return null;
  const p = scores?.[lookupName];
  if (!p) return null;
  if (activeTab === "kara")                          return p.kara;
  if (activeTab === "gruul" || activeTab === "mags") return p.gruulMags;
  return null;
}

export function getScoreForTab(scores, playerName, activeTab) {
  const p = scores?.[playerName];
  if (!p) return null;
  if (activeTab === "kara")                          return p.kara;
  if (activeTab === "gruul" || activeTab === "mags") return p.gruulMags;
  return null;
}

export function getScoreColor(score) {
  if (score == null) return null;
  if (score === 100)  return "#e5cc80";
  if (score >= 99)    return "#e268a8";
  if (score >= 95)    return "#ff8000";
  if (score >= 75)    return "#a335ee";
  if (score >= 50)    return "#0070dd";
  if (score >= 25)    return "#1eff00";
  return                     "#9d9d9d";
}

export function formatScore(score) {
  if (score == null) return null;
  return Math.round(score).toString();
}
