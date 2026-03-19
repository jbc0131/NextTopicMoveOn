import { useEffect, useMemo, useState } from "react";
import { AppShell, LoadingSpinner, toast } from "../shared/components";
import { useAuth } from "../shared/auth";
import { fetchUserProfile, saveUserProfile } from "../shared/firebase";
import {
  panelStyle, inputStyle, btnStyle, surface, border, text, fontSize, fontWeight, radius, space,
} from "../shared/theme";

function EyeIcon({ open = false }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      {open ? null : <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" />}
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function ProfilePage() {
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [form, setForm] = useState({
    mainCharacterName: "",
    alts: [""],
    wclV1ApiKey: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (auth.loading) return;
      if (!auth.authenticated || !auth.user?.discordId) {
        if (!cancelled) setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const profile = await fetchUserProfile(auth.user.discordId);
        if (!cancelled) {
          setForm({
            mainCharacterName: profile?.mainCharacterName || "",
            alts: (profile?.alts || []).length ? profile.alts : [""],
            wclV1ApiKey: profile?.wclV1ApiKey || "",
          });
        }
      } catch (error) {
        if (!cancelled) {
          toast({ message: `Failed to load profile: ${error.message}`, type: "danger" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();
    return () => { cancelled = true; };
  }, [auth.authenticated, auth.isAdmin, auth.loading, auth.user]);

  const normalizedAlts = useMemo(() => form.alts.map(value => value.trim()).filter(Boolean), [form.alts]);

  async function handleSave() {
    if (!auth.user?.discordId) return;

    setSaving(true);
    try {
      const result = await saveUserProfile(auth.user.discordId, {
        mainCharacterName: form.mainCharacterName.trim(),
        alts: normalizedAlts,
        wclV1ApiKey: form.wclV1ApiKey.trim(),
      });

      toast({
        message: result.persistence === "local" ? "Profile saved locally only." : "Profile saved.",
        type: result.persistence === "local" ? "warning" : "success",
      });

      setForm(prev => ({
        ...prev,
        alts: normalizedAlts.length ? normalizedAlts : [""],
      }));
    } catch (error) {
      toast({ message: `Failed to save profile: ${error.message}`, type: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyApiKey() {
    try {
      await navigator.clipboard.writeText(form.wclV1ApiKey || "");
      toast({ message: "Copied WCL v1 API key.", type: "success" });
    } catch {
      toast({ message: "Clipboard copy failed.", type: "warning" });
    }
  }

  return (
    <AppShell>
      <div style={{ padding: space[4], display: "flex", flexDirection: "column", gap: space[4] }}>
        <div style={{ ...panelStyle, padding: space[4], display: "flex", flexDirection: "column", gap: space[2] }}>
          <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: text.primary }}>Profile</div>
          <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
            Save your character info here. Admins can also store their Warcraft Logs v1 API key for imports.
          </div>
        </div>

        {loading && (
          <div style={{ ...panelStyle, padding: space[6], display: "flex", justifyContent: "center" }}>
            <LoadingSpinner size={24} />
          </div>
        )}

        {!loading && (
          <div style={{ ...panelStyle, padding: space[4], display: "flex", flexDirection: "column", gap: space[4], maxWidth: 760 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
              <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Main Character</div>
              <input
                value={form.mainCharacterName}
                onChange={event => setForm(prev => ({ ...prev, mainCharacterName: event.target.value }))}
                placeholder="Character name"
                style={{ ...inputStyle, height: 38 }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space[2] }}>
                <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Alts</div>
                <button
                  onClick={() => setForm(prev => ({ ...prev, alts: [...prev.alts, ""] }))}
                  style={{ ...btnStyle("default"), height: 28, minWidth: 28, padding: `0 ${space[2]}px` }}
                  aria-label="Add alt"
                >
                  +
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
                {form.alts.map((alt, index) => (
                  <div key={`alt-${index}`} style={{ display: "flex", gap: space[2], alignItems: "center" }}>
                    <input
                      value={alt}
                      onChange={event => setForm(prev => ({
                        ...prev,
                        alts: prev.alts.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)),
                      }))}
                      placeholder={`Alt ${index + 1}`}
                      style={{ ...inputStyle, height: 38, flex: 1 }}
                    />
                    <button
                      onClick={() => setForm(prev => ({
                        ...prev,
                        alts: prev.alts.length === 1 ? [""] : prev.alts.filter((_, entryIndex) => entryIndex !== index),
                      }))}
                      style={{ ...btnStyle("default"), height: 38 }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
              <div style={{ fontSize: fontSize.xs, color: text.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Warcraft Logs v1 API Key</div>
              <div style={{ display: "flex", gap: space[2], alignItems: "center" }}>
                <input
                  value={form.wclV1ApiKey}
                  onChange={event => setForm(prev => ({ ...prev, wclV1ApiKey: event.target.value }))}
                  placeholder="Required for RPB imports"
                  type={showApiKey ? "text" : "password"}
                  style={{ ...inputStyle, height: 38, flex: 1, fontFamily: "monospace" }}
                />
                <button
                  onClick={() => setShowApiKey(value => !value)}
                  style={{ ...btnStyle("default"), height: 38 }}
                  title={showApiKey ? "Hide API key" : "Show API key"}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <EyeIcon open={showApiKey} />
                    <span>{showApiKey ? "Hide" : "Show"}</span>
                  </span>
                </button>
                <button
                  onClick={handleCopyApiKey}
                  style={{ ...btnStyle("default"), height: 38 }}
                  title="Copy API key"
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <CopyIcon />
                    <span>Copy</span>
                  </span>
                </button>
              </div>
              <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                This key is used for Warcraft Logs imports in RPB.
              </div>
              <div style={{ fontSize: fontSize.sm, color: text.secondary }}>
                If you need to create or manage it, visit{" "}
                <a href="https://fresh.warcraftlogs.com/profile" target="_blank" rel="noreferrer" style={{ color: text.primary }}>
                  fresh.warcraftlogs.com/profile
                </a>
                {" "}and edit it at the bottom of that page.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={handleSave} disabled={saving} style={{ ...btnStyle("primary", saving), height: 38 }}>
                {saving ? <LoadingSpinner size={14} /> : "Save Profile"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
