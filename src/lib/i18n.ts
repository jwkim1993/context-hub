export type Language = "ko" | "en";

const STORAGE_KEY = "context-hub-language";

export function getLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "ko") return stored;
  return "ko";
}

export function setLanguage(lang: Language): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

const translations = {
  ko: {
    subtitle: "AI 코딩 도구의 대화 기록을 통합 관리하고, 연결된 리소스를 추적합니다.",
    settings: "설정",
    rescan: "리스캔",
    totalChats: "총 채팅",
    summarized: "요약 완료",
    connectedResources: "연결 리소스",
    manualLinks: "수동 링크",
    searchPlaceholder: "repo, jira, PR 번호로 검색 (예: csg-case-curator-backend #736 AIPF-977)",
    all: "전체",
    allConnections: "연결 전체",
    manual: "수동 링크",
    loading: "데이터를 불러오는 중...",
    noChatsFound: "조건에 맞는 채팅이 없습니다.",
    selectChat: "왼쪽에서 채팅을 선택하세요.",
    untitled: "제목 없음",
    noSummaryHint: "요약 없음. 우측에서 AI 요약을 실행하세요.",
    noConnectionInfo: "연결 정보 없음",
    noWorkspace: "workspace 없음",
    noDateInfo: "시간 정보 없음",
    aiSummaryTags: "AI 요약 / 태그",
    summarizeAndTag: "요약 + 태그 생성",
    regenerateTags: "태그 재생성",
    setupApiKey: "Claude API Key 설정",
    noSummaryYet: "아직 생성된 요약이 없습니다.",
    noTags: "태그 없음",
    connectedResourcesTitle: "연결된 리소스",
    noLinksFound: "연결된 링크가 없습니다.",
    manualBadge: "수동",
    deleteManualLink: "수동 링크 삭제",
    addManualLink: "수동 링크 추가",
    displayNameOptional: "표시 이름(선택)",
    connect: "연결",
    feedbackSummaryUpdated: "AI 요약과 태그를 업데이트했습니다.",
    feedbackSummaryError: "AI 요약 중 오류가 발생했습니다.",
    feedbackTagsUpdated: "태그를 재생성했습니다.",
    feedbackTagsError: "태그 생성 중 오류가 발생했습니다.",
    feedbackLinkAdded: "수동 링크를 연결했습니다.",
    feedbackLinkAddError: "링크 연결에 실패했습니다.",
    feedbackLinkDeleted: "수동 링크를 삭제했습니다.",
    feedbackLinkDeleteError: "링크 삭제에 실패했습니다.",
    feedbackOpenLinkError: "외부 링크를 열 수 없습니다.",
    feedbackLoadError: "채팅 데이터 로딩에 실패했습니다.",

    settingsTitle: "환경 설정",
    settingsApiKeyLabel: "Claude API Key",
    settingsApiKeyDesc: "AI 요약/태그 생성을 위해 사용되며, 키는 로컬 브라우저 스토리지에만 저장됩니다.",
    settingsClose: "닫기",
    settingsSave: "저장",
    settingsSaved: "저장됨",
    settingsLanguage: "언어",

    aiSummary: "AI 요약",
    viewConversation: "대화 보기",
    messages: "댓글",
    created: "생성",
    updated: "업데이트",
    createdAt: "생성 시각",
    summary: "요약",
    justNow: "방금 전",
    minutesAgo: (n: number) => `${n}분 전`,
    hoursAgo: (n: number) => `${n}시간 전`,
    yesterday: "어제",
    daysAgo: (n: number) => `${n}일 전`,

    searchSemanticPlaceholder: "AI로 대화 검색...",
    searchTextPlaceholder: "대화 제목, 내용으로 검색...",
    aiSearch: "AI 검색",
    tags: "태그",
    moreTags: (n: number) => `+${n}개 더보기`,
    clearTagFilter: "태그 필터 해제",
    addTagPlaceholder: "태그 추가...",
    tagAdded: "태그를 추가했습니다.",
    tagRemoved: "태그를 삭제했습니다.",
    tagError: "태그 업데이트에 실패했습니다.",
    scanning: "채팅 데이터를 스캔하는 중...",
    summarizing: "AI 요약을 생성하는 중...",
    generatingTags: "태그를 생성하는 중...",
  },
  en: {
    subtitle: "Unified management of AI coding tool chat histories with connected resource tracking.",
    settings: "Settings",
    rescan: "Rescan",
    totalChats: "Total Chats",
    summarized: "Summarized",
    connectedResources: "Resources",
    manualLinks: "Manual Links",
    searchPlaceholder: "Search by repo, jira, PR number (e.g. csg-case-curator-backend #736 AIPF-977)",
    all: "All",
    allConnections: "All Connections",
    manual: "Manual",
    loading: "Loading data...",
    noChatsFound: "No chats match the current filters.",
    selectChat: "Select a chat from the left panel.",
    untitled: "Untitled",
    noSummaryHint: "No summary yet. Run AI summary from the right panel.",
    noConnectionInfo: "No connections",
    noWorkspace: "No workspace",
    noDateInfo: "No date info",
    aiSummaryTags: "AI Summary / Tags",
    summarizeAndTag: "Summarize + Tag",
    regenerateTags: "Regenerate Tags",
    setupApiKey: "Set Claude API Key",
    noSummaryYet: "No summary generated yet.",
    noTags: "No tags",
    connectedResourcesTitle: "Connected Resources",
    noLinksFound: "No connected links found.",
    manualBadge: "Manual",
    deleteManualLink: "Delete manual link",
    addManualLink: "Add Manual Link",
    displayNameOptional: "Display name (optional)",
    connect: "Connect",
    feedbackSummaryUpdated: "AI summary and tags updated.",
    feedbackSummaryError: "Error during AI summarization.",
    feedbackTagsUpdated: "Tags regenerated.",
    feedbackTagsError: "Error generating tags.",
    feedbackLinkAdded: "Manual link connected.",
    feedbackLinkAddError: "Failed to connect link.",
    feedbackLinkDeleted: "Manual link deleted.",
    feedbackLinkDeleteError: "Failed to delete link.",
    feedbackOpenLinkError: "Cannot open external link.",
    feedbackLoadError: "Failed to load chat data.",

    settingsTitle: "Settings",
    settingsApiKeyLabel: "Claude API Key",
    settingsApiKeyDesc: "Used for AI summary/tag generation. The key is stored only in local browser storage.",
    settingsClose: "Close",
    settingsSave: "Save",
    settingsSaved: "Saved",
    settingsLanguage: "Language",

    aiSummary: "AI Summary",
    viewConversation: "View Chat",
    messages: "messages",
    created: "Created",
    updated: "Updated",
    createdAt: "Created at",
    summary: "Summary",
    justNow: "Just now",
    minutesAgo: (n: number) => `${n}m ago`,
    hoursAgo: (n: number) => `${n}h ago`,
    yesterday: "Yesterday",
    daysAgo: (n: number) => `${n}d ago`,

    searchSemanticPlaceholder: "Search conversations with AI...",
    searchTextPlaceholder: "Search by title, content...",
    aiSearch: "AI Search",
    tags: "Tags",
    moreTags: (n: number) => `+${n} more`,
    clearTagFilter: "Clear tag filter",
    addTagPlaceholder: "Add tag...",
    tagAdded: "Tag added.",
    tagRemoved: "Tag removed.",
    tagError: "Failed to update tags.",
    scanning: "Scanning chat data...",
    summarizing: "Generating AI summary...",
    generatingTags: "Generating tags...",
  },
} as const;

export interface Translations {
  subtitle: string;
  settings: string;
  rescan: string;
  totalChats: string;
  summarized: string;
  connectedResources: string;
  manualLinks: string;
  searchPlaceholder: string;
  all: string;
  allConnections: string;
  manual: string;
  loading: string;
  noChatsFound: string;
  selectChat: string;
  untitled: string;
  noSummaryHint: string;
  noConnectionInfo: string;
  noWorkspace: string;
  noDateInfo: string;
  aiSummaryTags: string;
  summarizeAndTag: string;
  regenerateTags: string;
  setupApiKey: string;
  noSummaryYet: string;
  noTags: string;
  connectedResourcesTitle: string;
  noLinksFound: string;
  manualBadge: string;
  deleteManualLink: string;
  addManualLink: string;
  displayNameOptional: string;
  connect: string;
  feedbackSummaryUpdated: string;
  feedbackSummaryError: string;
  feedbackTagsUpdated: string;
  feedbackTagsError: string;
  feedbackLinkAdded: string;
  feedbackLinkAddError: string;
  feedbackLinkDeleted: string;
  feedbackLinkDeleteError: string;
  feedbackOpenLinkError: string;
  feedbackLoadError: string;
  settingsTitle: string;
  settingsApiKeyLabel: string;
  settingsApiKeyDesc: string;
  settingsClose: string;
  settingsSave: string;
  settingsSaved: string;
  settingsLanguage: string;
  aiSummary: string;
  viewConversation: string;
  messages: string;
  created: string;
  updated: string;
  createdAt: string;
  summary: string;
  justNow: string;
  minutesAgo: (n: number) => string;
  hoursAgo: (n: number) => string;
  yesterday: string;
  daysAgo: (n: number) => string;
  searchSemanticPlaceholder: string;
  searchTextPlaceholder: string;
  aiSearch: string;
  tags: string;
  moreTags: (n: number) => string;
  clearTagFilter: string;
  addTagPlaceholder: string;
  tagAdded: string;
  tagRemoved: string;
  tagError: string;
  scanning: string;
  summarizing: string;
  generatingTags: string;
}

export function t(lang: Language): Translations {
  return translations[lang];
}
