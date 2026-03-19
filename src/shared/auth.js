// src/shared/auth.js
// Discord OAuth auth hook for NTMO.
// Two tiers: member (site access) and admin (admin pages).
// Falls back to password gate if Discord OAuth env vars aren't configured on the server.

import { useState, useEffect } from "react";

const AUTH_CACHE_KEY = "ntmo_auth_cache";
const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useAuth() {
  const [state, setState] = useState(() => {
    // Check sessionStorage cache to avoid flash on every page load
    try {
      const cached = JSON.parse(sessionStorage.getItem(AUTH_CACHE_KEY));
      if (cached && Date.now() < cached.expiresAt) {
        return { loading: false, authenticated: cached.authenticated, isAdmin: cached.isAdmin || false, user: cached.user, fallback: false };
      }
    } catch {}
    return { loading: true, authenticated: false, isAdmin: false, user: null, fallback: false };
  });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const result = { authenticated: data.authenticated, isAdmin: data.isAdmin || false, user: data.user || null };
        sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ ...result, expiresAt: Date.now() + AUTH_CACHE_TTL }));
        setState({ loading: false, ...result, fallback: false });
      })
      .catch(() => {
        if (cancelled) return;
        // If /api/auth/me fails (e.g. env vars not set), fall back to password gate
        setState({ loading: false, authenticated: false, isAdmin: false, user: null, fallback: true });
      });

    return () => { cancelled = true; };
  }, []);

  return state;
}

export function getLoginUrl(returnTo) {
  return `/api/auth/discord?returnTo=${encodeURIComponent(returnTo || window.location.pathname)}`;
}

export function getLogoutUrl(returnTo) {
  return `/api/auth/logout?returnTo=${encodeURIComponent(returnTo || "/")}`;
}

export function clearAuthCache() {
  sessionStorage.removeItem(AUTH_CACHE_KEY);
}
