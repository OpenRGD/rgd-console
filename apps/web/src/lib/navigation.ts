export const SECTIONS = [
  { id: 'overview', label: 'Overview', description: 'System summary' },
  { id: 'onboarding', label: 'Onboarding', description: 'Model-first setup' },
  { id: 'body', label: 'Body', description: 'Kinematics & joints' },
  { id: 'electronics', label: 'Electronics', description: 'Hardware signals' },
  { id: 'mind', label: 'Mind', description: 'Decision events' },
  { id: 'memory', label: 'Memory', description: 'Causal timeline' },
  { id: 'modules', label: 'Modules', description: 'Extensions registry' },
  { id: 'voice', label: 'Voice Lab', description: 'Manual read-only diagnostics' },
  { id: 'settings', label: 'Settings', description: 'Console configuration' },
] as const;
export type SectionId = typeof SECTIONS[number]['id'];
