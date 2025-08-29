// src/types/MainTab.ts (or '@/types/MainTab')
export type MainTab =
  | 'chat'
  | 'discussions'
  | 'connections'
  | 'logs'
  | 'files'
  | 'calendar'
  | 'functions'
  | 'goals'
  | 'thoughts'
  | 'tasks'
  | 'timeline'      // ✅ new
  | 'notifications'
  | 'newfunction'
  | 'workshop'
  | 'apis';

export const MAIN_TABS: MainTab[] = [
  'chat',
  'discussions',
  'connections',
  'logs',
  'files',
  'calendar',
  'functions',
  'goals',
  'thoughts',
  'tasks',
  'timeline',       // ✅ new
  'notifications',
  'newfunction',
  'workshop',
  'apis',
];