import { useState } from "react";
import { Check, Globe, Key, ShieldCheck, X } from "lucide-react";

import { getApiKey, setApiKey } from "../lib/claude";
import { useLanguage } from "../lib/LanguageContext";
import type { Language } from "../lib/i18n";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const { lang, setLang, t } = useLanguage();
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setApiKey(apiKey.trim());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const languageOptions: { value: Language; label: string }[] = [
    { value: "ko", label: "한국어" },
    { value: "en", label: "English" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{t.settingsTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-panel hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <Globe className="h-4 w-4 text-accent" />
              {t.settingsLanguage}
            </label>
            <div className="mt-2 flex gap-2">
              {languageOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLang(opt.value)}
                  className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${lang === opt.value
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-white text-muted hover:border-accent/50 hover:text-ink"
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <Key className="h-4 w-4 text-accent" />
              {t.settingsApiKeyLabel}
            </label>

            <div className="mt-2 flex items-start gap-3 rounded-xl border border-line bg-panel p-3 text-sm text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
              {t.settingsApiKeyDesc}
            </div>

            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKeyState(event.target.value)}
              placeholder="sk-ant-..."
              className="mt-2 h-11 w-full rounded-xl border border-line px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="action-button"
          >
            {t.settingsClose}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="action-button action-button-primary"
          >
            {saved ? (
              <>
                <Check className="h-4 w-4" />
                {t.settingsSaved}
              </>
            ) : (
              t.settingsSave
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
