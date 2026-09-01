/**
 * T6 raid registry.
 *
 * Mount Hyjal and Black Temple are two separate modules (own route, own
 * Firestore document, own roster) that share one admin/public implementation —
 * the same boss/phase/slot config format SSC and TK use.
 */
import { MH_BOSSES, BT_BOSSES } from "../../shared/constants";

export const T6_RAIDS = {
  hyjal: {
    key:    "hyjal",              // route segment, localStorage + Firestore key
    title:  "Mount Hyjal",
    nav:    "T6 - Mount Hyjal",
    icon:   "🔥",
    empty:  "🔥",
    bosses: MH_BOSSES,
  },
  bt: {
    key:    "bt",
    title:  "Black Temple",
    nav:    "T6 - Black Temple",
    icon:   "🗡",
    empty:  "🗡",
    bosses: BT_BOSSES,
  },
};

// key → row config, for max/ordered lookups during drag & drop.
export function rowsByKey(bosses) {
  const out = {};
  bosses.forEach(b => b.phases.forEach(p => p.slots.forEach(r => { out[r.key] = r; })));
  return out;
}
