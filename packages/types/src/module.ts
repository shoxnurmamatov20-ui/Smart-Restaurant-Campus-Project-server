/**
 * The 10 Phase-1 modules of CAMPUS.
 * Source: docs/source/CAMPUS_Yagona_Raqamli_Platforma.docx
 */

export type ModuleKey =
  | 'hr'
  | 'students'
  | 'online'
  | 'edms'
  | 'rttm'
  | 'psychology'
  | 'exams'
  | 'library'
  | 'media'
  | 'kpi';

export type ModuleDefinition = {
  key: ModuleKey;
  name_uz: string;
  name_ru: string;
  name_en: string;
  icon: string;
  order: number;
  enabled: boolean;
};

export const PHASE_1_MODULES: ReadonlyArray<ModuleDefinition> = [
  {
    key: 'hr',
    name_uz: 'Kadrlar',
    name_ru: 'Кадры',
    name_en: 'HR',
    icon: 'users-cog',
    order: 1,
    enabled: true,
  },
  {
    key: 'students',
    name_uz: 'Talabalar',
    name_ru: 'Студенты',
    name_en: 'Students',
    icon: 'graduation-cap',
    order: 2,
    enabled: true,
  },
  {
    key: 'online',
    name_uz: 'Online platforma',
    name_ru: 'Онлайн платформа',
    name_en: 'Online Platform',
    icon: 'video',
    order: 3,
    enabled: true,
  },
  {
    key: 'edms',
    name_uz: 'Hujjat aylanishi',
    name_ru: 'Документооборот',
    name_en: 'E-Document Workflow',
    icon: 'file-text',
    order: 4,
    enabled: true,
  },
  {
    key: 'rttm',
    name_uz: 'RTTM',
    name_ru: 'РТТМ',
    name_en: 'IT Inventory',
    icon: 'monitor',
    order: 5,
    enabled: true,
  },
  {
    key: 'psychology',
    name_uz: 'Psixologik test',
    name_ru: 'Психологические тесты',
    name_en: 'Psychology Tests',
    icon: 'brain',
    order: 6,
    enabled: true,
  },
  {
    key: 'exams',
    name_uz: 'Test tizimi',
    name_ru: 'Тесты',
    name_en: 'Exam Engine',
    icon: 'clipboard-check',
    order: 7,
    enabled: true,
  },
  {
    key: 'library',
    name_uz: 'Kutubxona',
    name_ru: 'Библиотека',
    name_en: 'E-Library',
    icon: 'book-open',
    order: 8,
    enabled: true,
  },
  {
    key: 'media',
    name_uz: 'Media',
    name_ru: 'Медиа',
    name_en: 'Media DAM',
    icon: 'image',
    order: 9,
    enabled: true,
  },
  {
    key: 'kpi',
    name_uz: 'KPI',
    name_ru: 'KPI',
    name_en: 'KPI Dashboard',
    icon: 'chart-bar',
    order: 10,
    enabled: true,
  },
] as const;
