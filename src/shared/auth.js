// src/shared/auth.js
// Discord OAuth auth hook for NTMO.
// Two tiers: member (site access) and admin (admin pages).

import { useState, useEffect } from "react";

const AUTH_CACHE_KEY = "ntmo_auth_cache";
const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LOCAL_DEV_AUTH_STATE = {
  loading: false,
  authenticated: true,
  isAdmin: true,
  fallback: true,
  user: {
    discordId: "238119543157948428",
    username: "jbc0131",
    globalName: "jbc0131",
    avatar: null,
  },
};

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  const hostname = String(window.location?.hostname || "").toLowerCase();
  const port = String(window.location?.port || "");
  return (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || hostname.endsWith(".app.github.dev")
    || hostname.endsWith(".github.dev")
    || port === "4173"
  );
}

export function useAuth() {
  const [state, setState] = useState(() => {
    if (isLocalDevHost()) {
      return LOCAL_DEV_AUTH_STATE;
    }
    // Check sessionStorage cache to avoid flash on every page load
    try {
      const cached = JSON.parse(sessionStorage.getItem(AUTH_CACHE_KEY));
      if (cached && Date.now() < cached.expiresAt) {
        return { loading: false, authenticated: cached.authenticated, isAdmin: cached.isAdmin || false, fallback: false, user: cached.user };
      }
    } catch {}
    return { loading: true, authenticated: false, isAdmin: false, fallback: false, user: null };
  });

  useEffect(() => {
    if (isLocalDevHost()) {
      setState(LOCAL_DEV_AUTH_STATE);
      return undefined;
    }

    let cancelled = false;

    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const result = { authenticated: data.authenticated, isAdmin: data.isAdmin || false, fallback: false, user: data.user || null };
        sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ ...result, expiresAt: Date.now() + AUTH_CACHE_TTL }));
        setState({ loading: false, ...result });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, authenticated: false, isAdmin: false, fallback: false, user: null });
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
