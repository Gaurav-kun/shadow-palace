"use client";

import { useReaderPrefs } from "@/lib/prefs";
import { Segmented } from "@/components/reader/ReaderChrome";

export type ReaderMode = "pages" | "scroll" | "novel";

interface ReaderSettingsProps {
  mode: ReaderMode;
  onModeChange: (m: ReaderMode) => void;
}

/**
 * Reader settings panel (rendered inside the chrome's bottom sheet).
 * Mode override is per-session; everything else persists.
 */
export function ReaderSettings({ mode, onModeChange }: ReaderSettingsProps) {
  const prefs = useReaderPrefs();

  return (
    <div>
      {mode !== "novel" && (
        <Segmented
          label="Reader mode"
          value={mode}
          options={[
            { value: "pages", label: "Pages" },
            { value: "scroll", label: "Scroll" },
          ]}
          onChange={(m) => onModeChange(m)}
        />
      )}

      {mode === "pages" && (
        <>
          <Segmented
            label="Direction"
            value={prefs.direction}
            options={[
              { value: "ltr", label: "Left → Right" },
              { value: "rtl", label: "Right → Left ◀" },
            ]}
            onChange={(v) => prefs.set({ direction: v })}
          />
          <Segmented
            label="Fit"
            value={prefs.fitMode}
            options={[
              { value: "width", label: "Page width" },
              { value: "screen", label: "Fit screen" },
            ]}
            onChange={(v) => prefs.set({ fitMode: v })}
          />
        </>
      )}

      {mode === "novel" && (
        <>
          <div className="mb-4">
            <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-mist uppercase">
              Text size
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  prefs.set({ novelFontSize: Math.max(14, prefs.novelFontSize - 1) })
                }
                className="rounded-lg border border-veil/60 px-3 py-1.5 text-sm text-mist hover:text-moon"
              >
                A−
              </button>
              <span className="flex-1 text-center text-sm tabular-nums text-moon/90">
                {prefs.novelFontSize}px
              </span>
              <button
                onClick={() =>
                  prefs.set({ novelFontSize: Math.min(26, prefs.novelFontSize + 1) })
                }
                className="rounded-lg border border-veil/60 px-3 py-1.5 text-sm text-mist hover:text-moon"
              >
                A+
              </button>
            </div>
          </div>
          <Segmented
            label="Line spacing"
            value={String(prefs.novelLineHeight)}
            options={[
              { value: "1.6", label: "Compact" },
              { value: "1.8", label: "Cozy" },
              { value: "2.1", label: "Airy" },
            ]}
            onChange={(v) => prefs.set({ novelLineHeight: Number(v) })}
          />
        </>
      )}

      {/* Dimmer */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-mist uppercase">
          Dimmer
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-mist">☀</span>
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={Math.round(prefs.dimmer * 100)}
            onChange={(e) => prefs.set({ dimmer: Number(e.target.value) / 100 })}
            className="h-1 flex-1 accent-flame"
          />
          <span className="w-8 text-right text-xs tabular-nums text-mist">
            {Math.round(prefs.dimmer * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
