import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { type Language, type Translations, getLanguage, setLanguage as persistLanguage, t } from "./i18n";

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getLanguage);

  const setLang = useCallback((next: Language) => {
    persistLanguage(next);
    setLangState(next);
  }, []);

  const translations = t(lang);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
