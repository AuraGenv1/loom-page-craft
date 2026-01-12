import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'zh' | 'ja';

export interface Language {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', label: 'EN', nativeLabel: 'English' },
  { code: 'es', label: 'ES', nativeLabel: 'Español' },
  { code: 'fr', label: 'FR', nativeLabel: 'Français' },
  { code: 'de', label: 'DE', nativeLabel: 'Deutsch' },
  { code: 'it', label: 'IT', nativeLabel: 'Italiano' },
  { code: 'pt', label: 'PT', nativeLabel: 'Português' },
  { code: 'zh', label: 'ZH', nativeLabel: '中文' },
  { code: 'ja', label: 'JA', nativeLabel: '日本語' },
];

// Static UI translations
export const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    join: 'Join',
    signIn: 'Sign In',
    signOut: 'Sign Out',
    search: 'Search',
    searchPlaceholder: 'What would you like to learn?',
    whereToStay: 'Where to Stay',
    theVibe: 'The Vibe',
    downloadPDF: 'Download PDF',
    aCuratedGuide: 'A Curated Guide',
    printPreview: 'Print Preview',
    newGuide: 'New Guide',
    dashboard: 'Dashboard',
    myProjects: 'My Projects',
    saveToLibrary: 'Save to Library',
    localResources: 'Local Resources',
    enableLocation: 'Enable Location',
    chapterOne: 'Chapter One',
    chapterTwo: 'Chapter Two',
    chapterThree: 'Chapter Three',
    tableOfContents: 'Table of Contents',
    commonMistakes: 'Common Mistakes',
    proTips: 'Pro Tips',
    keyTakeaways: 'Key Takeaways',
    loading: 'Loading...',
    generating: 'Generating your guide...',
    tryAgain: 'Try Again',
    powered_by: 'Powered by',
    introductionTo: 'Introduction to',
    // NEW KEYS
    weaving: 'Weaving your guide...',
    downloadFreeSample: 'Download Free Sample (PDF)',
    unlockFullGuide: 'Unlock Full Artisan Guide',
    puttingItIntoPractice: 'Putting It Into Practice',
    saving: 'Saving...',
    saved: 'Saved to your library',
  },
  es: {
    join: 'Unirse',
    signIn: 'Iniciar Sesión',
    signOut: 'Cerrar Sesión',
    search: 'Buscar',
    searchPlaceholder: '¿Qué te gustaría aprender?',
    whereToStay: 'Dónde Alojarse',
    theVibe: 'El Ambiente',
    downloadPDF: 'Descargar PDF',
    aCuratedGuide: 'Una Guía Curada',
    printPreview: 'Vista de Impresión',
    newGuide: 'Nueva Guía',
    dashboard: 'Panel',
    myProjects: 'Mis Proyectos',
    saveToLibrary: 'Guardar en Biblioteca',
    localResources: 'Recursos Locales',
    enableLocation: 'Activar Ubicación',
    chapterOne: 'Capítulo Uno',
    chapterTwo: 'Capítulo Dos',
    chapterThree: 'Capítulo Tres',
    tableOfContents: 'Índice',
    commonMistakes: 'Errores Comunes',
    proTips: 'Consejos Pro',
    keyTakeaways: 'Puntos Clave',
    loading: 'Cargando...',
    generating: 'Generando tu guía...',
    tryAgain: 'Intentar de Nuevo',
    powered_by: 'Impulsado por',
    introductionTo: 'Introducción a',
    // NEW KEYS
    weaving: 'Weaving tu guía...',
    downloadFreeSample: 'Descargar Muestra Gratis (PDF)',
    unlockFullGuide: 'Desbloquear Guía Artesanal Completa',
    puttingItIntoPractice: 'Poniéndolo en Práctica',
    saving: 'Guardando...',
    saved: 'Guardado en tu biblioteca',
  },
  fr: {
    join: 'Rejoindre',
    signIn: 'Se Connecter',
    signOut: 'Se Déconnecter',
    search: 'Rechercher',
    searchPlaceholder: "Qu'aimeriez-vous apprendre?",
    whereToStay: 'Où Séjourner',
    theVibe: "L'Ambiance",
    downloadPDF: 'Télécharger PDF',
    aCuratedGuide: 'Un Guide Soigné',
    printPreview: "Aperçu d'Impression",
    newGuide: 'Nouveau Guide',
    dashboard: 'Tableau de Bord',
    myProjects: 'Mes Projets',
    saveToLibrary: 'Sauvegarder',
    localResources: 'Ressources Locales',
    enableLocation: 'Activer la Localisation',
    chapterOne: 'Chapitre Un',
    chapterTwo: 'Chapitre Deux',
    chapterThree: 'Chapitre Trois',
    tableOfContents: 'Table des Matières',
    commonMistakes: 'Erreurs Courantes',
    proTips: 'Conseils Pro',
    keyTakeaways: 'Points Clés',
    loading: 'Chargement...',
    generating: 'Génération de votre guide...',
    tryAgain: 'Réessayer',
    powered_by: 'Propulsé par',
    introductionTo: 'Introduction à',
    // NEW KEYS
    weaving: 'Weaving votre guide...',
    downloadFreeSample: 'Télécharger Échantillon Gratuit (PDF)',
    unlockFullGuide: 'Débloquer le Guide Artisan Complet',
    puttingItIntoPractice: 'Mise en Pratique',
    saving: 'Enregistrement...',
    saved: 'Enregistré dans votre bibliothèque',
  },
  de: {
    join: 'Beitreten',
    signIn: 'Anmelden',
    signOut: 'Abmelden',
    search: 'Suchen',
    searchPlaceholder: 'Was möchten Sie lernen?',
    whereToStay: 'Unterkunft',
    theVibe: 'Die Atmosphäre',
    downloadPDF: 'PDF Herunterladen',
    aCuratedGuide: 'Ein Kuratierter Leitfaden',
    printPreview: 'Druckvorschau',
    newGuide: 'Neuer Leitfaden',
    dashboard: 'Dashboard',
    myProjects: 'Meine Projekte',
    saveToLibrary: 'Speichern',
    localResources: 'Lokale Ressourcen',
    enableLocation: 'Standort Aktivieren',
    chapterOne: 'Kapitel Eins',
    chapterTwo: 'Kapitel Zwei',
    chapterThree: 'Kapitel Drei',
    tableOfContents: 'Inhaltsverzeichnis',
    commonMistakes: 'Häufige Fehler',
    proTips: 'Profi-Tipps',
    keyTakeaways: 'Wichtigste Erkenntnisse',
    loading: 'Laden...',
    generating: 'Ihr Leitfaden wird erstellt...',
    tryAgain: 'Erneut Versuchen',
    powered_by: 'Unterstützt von',
    introductionTo: 'Einführung in',
    // NEW KEYS
    weaving: 'Weaving Ihren Leitfaden...',
    downloadFreeSample: 'Kostenlose Probe Herunterladen (PDF)',
    unlockFullGuide: 'Vollständigen Handwerker-Leitfaden Freischalten',
    puttingItIntoPractice: 'In die Praxis Umsetzen',
    saving: 'Speichern...',
    saved: 'In Ihrer Bibliothek gespeichert',
  },
  it: {
    join: 'Unisciti',
    signIn: 'Accedi',
    signOut: 'Esci',
    search: 'Cerca',
    searchPlaceholder: 'Cosa vorresti imparare?',
    whereToStay: 'Dove Alloggiare',
    theVibe: "L'Atmosfera",
    downloadPDF: 'Scarica PDF',
    aCuratedGuide: 'Una Guida Curata',
    printPreview: 'Anteprima di Stampa',
    newGuide: 'Nuova Guida',
    dashboard: 'Dashboard',
    myProjects: 'I Miei Progetti',
    saveToLibrary: 'Salva in Libreria',
    localResources: 'Risorse Locali',
    enableLocation: 'Attiva Posizione',
    chapterOne: 'Capitolo Uno',
    chapterTwo: 'Capitolo Due',
    chapterThree: 'Capitolo Tre',
    tableOfContents: 'Indice',
    commonMistakes: 'Errori Comuni',
    proTips: 'Consigli Pro',
    keyTakeaways: 'Punti Chiave',
    loading: 'Caricamento...',
    generating: 'Generazione della tua guida...',
    tryAgain: 'Riprova',
    powered_by: 'Alimentato da',
    introductionTo: 'Introduzione a',
    // NEW KEYS
    weaving: 'Weaving la tua guida...',
    downloadFreeSample: 'Scarica Campione Gratuito (PDF)',
    unlockFullGuide: 'Sblocca la Guida Artigianale Completa',
    puttingItIntoPractice: 'Metterlo in Pratica',
    saving: 'Salvataggio...',
    saved: 'Salvato nella tua libreria',
  },
  pt: {
    join: 'Junte-se',
    signIn: 'Entrar',
    signOut: 'Sair',
    search: 'Pesquisar',
    searchPlaceholder: 'O que você gostaria de aprender?',
    whereToStay: 'Onde Ficar',
    theVibe: 'A Vibe',
    downloadPDF: 'Baixar PDF',
    aCuratedGuide: 'Um Guia Curado',
    printPreview: 'Visualizar Impressão',
    newGuide: 'Novo Guia',
    dashboard: 'Painel',
    myProjects: 'Meus Projetos',
    saveToLibrary: 'Salvar na Biblioteca',
    localResources: 'Recursos Locais',
    enableLocation: 'Ativar Localização',
    chapterOne: 'Capítulo Um',
    chapterTwo: 'Capítulo Dois',
    chapterThree: 'Capítulo Três',
    tableOfContents: 'Índice',
    commonMistakes: 'Erros Comuns',
    proTips: 'Dicas Pro',
    keyTakeaways: 'Pontos-Chave',
    loading: 'Carregando...',
    generating: 'Gerando seu guia...',
    tryAgain: 'Tentar Novamente',
    powered_by: 'Desenvolvido por',
    introductionTo: 'Introdução a',
    // NEW KEYS
    weaving: 'Weaving seu guia...',
    downloadFreeSample: 'Baixar Amostra Grátis (PDF)',
    unlockFullGuide: 'Desbloquear Guia Artesanal Completo',
    puttingItIntoPractice: 'Colocando em Prática',
    saving: 'Salvando...',
    saved: 'Salvo na sua biblioteca',
  },
  zh: {
    join: '加入',
    signIn: '登录',
    signOut: '退出',
    search: '搜索',
    searchPlaceholder: '您想学习什么？',
    whereToStay: '住宿推荐',
    theVibe: '氛围',
    downloadPDF: '下载PDF',
    aCuratedGuide: '精选指南',
    printPreview: '打印预览',
    newGuide: '新指南',
    dashboard: '控制面板',
    myProjects: '我的项目',
    saveToLibrary: '保存到书库',
    localResources: '本地资源',
    enableLocation: '启用定位',
    chapterOne: '第一章',
    chapterTwo: '第二章',
    chapterThree: '第三章',
    tableOfContents: '目录',
    commonMistakes: '常见错误',
    proTips: '专业提示',
    keyTakeaways: '关键要点',
    loading: '加载中...',
    generating: '正在生成您的指南...',
    tryAgain: '重试',
    powered_by: '技术支持',
    introductionTo: '简介',
    // NEW KEYS
    weaving: 'Weaving 您的指南...',
    downloadFreeSample: '下载免费样本 (PDF)',
    unlockFullGuide: '解锁完整工匠指南',
    puttingItIntoPractice: '付诸实践',
    saving: '保存中...',
    saved: '已保存到您的书库',
  },
  ja: {
    join: '参加',
    signIn: 'ログイン',
    signOut: 'ログアウト',
    search: '検索',
    searchPlaceholder: '何を学びたいですか？',
    whereToStay: '宿泊先',
    theVibe: '雰囲気',
    downloadPDF: 'PDFダウンロード',
    aCuratedGuide: 'キュレーションガイド',
    printPreview: '印刷プレビュー',
    newGuide: '新しいガイド',
    dashboard: 'ダッシュボード',
    myProjects: 'マイプロジェクト',
    saveToLibrary: 'ライブラリに保存',
    localResources: '地域リソース',
    enableLocation: '位置情報を有効にする',
    chapterOne: '第1章',
    chapterTwo: '第2章',
    chapterThree: '第3章',
    tableOfContents: '目次',
    commonMistakes: 'よくある間違い',
    proTips: 'プロのヒント',
    keyTakeaways: '重要ポイント',
    loading: '読み込み中...',
    generating: 'ガイドを生成中...',
    tryAgain: '再試行',
    powered_by: '提供',
    introductionTo: '入門',
    // NEW KEYS
    weaving: 'Weaving ガイドを作成中...',
    downloadFreeSample: '無料サンプルをダウンロード (PDF)',
    unlockFullGuide: '完全な職人ガイドをアンロック',
    puttingItIntoPractice: '実践する',
    saving: '保存中...',
    saved: 'ライブラリに保存されました',
  },
};

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
  currentLanguage: Language;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    // Try to load from localStorage
    const stored = localStorage.getItem('loom_language');
    if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored)) {
      return stored as LanguageCode;
    }
    return 'en';
  });

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    localStorage.setItem('loom_language', lang);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[language][key] || translations.en[key] || key;
  }, [language]);

  const currentLanguage = SUPPORTED_LANGUAGES.find(l => l.code === language) || SUPPORTED_LANGUAGES[0];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, currentLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
