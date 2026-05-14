import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Button, Input, Separator } from "@lattice/ui";

interface TelemetrySettings {
  enabled: boolean;
  endpoint: string;
}

/**
 * v0.1 PR #8 — Telemetry opt-in surface.
 *
 * Off by default ([docs/telemetry.md](../../../docs/telemetry.md)).
 * Settings persist via `telemetry_settings_get` / `telemetry_settings_set`
 * Tauri commands; events land in `<vault>/.lattice/logs/telemetry.jsonl`
 * when enabled. HTTP shipment to `endpoint` is a follow-up PR.
 */
export function SettingsTelemetry() {
  const [settings, setSettings] = useState<TelemetrySettings>({
    enabled: false,
    endpoint: "",
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const current = await invoke<TelemetrySettings>("telemetry_settings_get");
        setSettings(current);
      } catch (err) {
        setError(String(err));
      }
    })();
  }, []);

  async function persist(next: TelemetrySettings) {
    setSaving(true);
    setError(null);
    try {
      await invoke("telemetry_settings_set", { settings: next });
      setSettings(next);
      setSavedAt(Date.now());
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 text-sm">
      <h3 className="font-serif text-lg text-text-primary">Telemetry</h3>
      <p className="text-text-secondary">
        Off by default. When enabled, anonymous performance and crash events are appended to{" "}
        <span className="font-mono">.lattice/logs/telemetry.jsonl</span> for self-hosting. No vault
        content is ever collected. See <span className="font-mono">docs/telemetry.md</span> for the
        full schema.
      </p>
      <Separator className="my-1" />
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => void persist({ ...settings, enabled: e.target.checked })}
          aria-label="Enable telemetry"
          className="h-4 w-4 cursor-pointer accent-accent-primary"
        />
        <span className="text-text-primary">Enable telemetry</span>
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor="telemetry-endpoint" className="text-text-secondary">
          Receiver endpoint (HTTP shipper lands in a follow-up PR)
        </label>
        <Input
          id="telemetry-endpoint"
          value={settings.endpoint}
          placeholder="https://receiver.example.org/lattice"
          onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })}
        />
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void persist(settings)}
          >
            Save endpoint
          </Button>
        </div>
      </div>
      {savedAt && (
        <p className="text-xs text-text-secondary" aria-live="polite">
          Saved {new Date(savedAt).toLocaleTimeString()}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-accent-secondary">
          {error}
        </p>
      )}
    </section>
  );
}
