/**
 * Browser-local display preferences for OpenRGD Live v0.4C.
 * These configure a responsive VIEW, never the monitor/Wayland resolution,
 * robot runtime, host login, or physical actuation authority.
 */
export const DISPLAY_SETTINGS_KEY = 'openrgd.console.live.display.v1';
export const DISPLAY_SETTINGS_EVENT = 'openrgd-live-display-update';

export const DISPLAY_PRESETS = [
  { id: 'compact-5', name: 'Compact · 5″', width: 800, height: 480, description: 'Orizzontale, informazioni essenziali' },
  { id: 'wide-7', name: 'Wide · 7″', width: 1024, height: 600, description: 'Orizzontale, più spazio per la telemetria' },
  { id: 'operator-10', name: 'Operator · 10″', width: 1280, height: 800, description: 'Operatore, pannelli più ampi' },
  { id: 'portrait-5', name: 'Portrait · 5″', width: 480, height: 800, description: 'Verticale, schede impilate' },
  { id: 'custom', name: 'Custom', width: 800, height: 480, description: 'Misure di preview personalizzate' },
] as const;

export type LiveDisplayPreset = typeof DISPLAY_PRESETS[number]['id'];
export type LiveSection = 'body' | 'signals' | 'activity';

export interface LiveDisplaySettings {
  settings_version: 1;
  preset: LiveDisplayPreset;
  custom_width: number;
  custom_height: number;
  text_scale: number;
  contrast: 'standard' | 'high';
  reduced_motion: boolean;
  visible_panels: Record<LiveSection, boolean>;
}

export const DEFAULT_LIVE_DISPLAY: LiveDisplaySettings = {
  settings_version: 1,
  preset: 'compact-5',
  custom_width: 800,
  custom_height: 480,
  text_scale: 1,
  contrast: 'standard',
  reduced_motion: true,
  visible_panels: { body: true, signals: true, activity: true },
};

export function boundNumber(input: unknown, fallback: number, min: number, max: number): number {
  return typeof input === 'number' && Number.isFinite(input)
    ? Math.min(max, Math.max(min, input)) : fallback;
}

/** Never trust localStorage content; invalid settings return safe defaults. */
export function normalizeLiveDisplay(input: unknown): LiveDisplaySettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ...DEFAULT_LIVE_DISPLAY, visible_panels: { ...DEFAULT_LIVE_DISPLAY.visible_panels } };
  const value = input as Partial<LiveDisplaySettings>;
  if (value.settings_version !== 1) return normalizeLiveDisplay(null);
  const panels = value.visible_panels && typeof value.visible_panels === 'object' ? value.visible_panels : DEFAULT_LIVE_DISPLAY.visible_panels;
  const preset = DISPLAY_PRESETS.find(x => x.id === value.preset)?.id ?? DEFAULT_LIVE_DISPLAY.preset;
  const chosen: Record<LiveSection, boolean> = {
    body: typeof panels.body === 'boolean' ? panels.body : true,
    signals: typeof panels.signals === 'boolean' ? panels.signals : true,
    activity: typeof panels.activity === 'boolean' ? panels.activity : true,
  };
  // Without any visible panel, the Live screen would conceal every observation.
  if (!Object.values(chosen).some(Boolean)) chosen.body = true;
  return {
    settings_version: 1,
    preset,
    custom_width: Math.round(boundNumber(value.custom_width, 800, 320, 3840)),
    custom_height: Math.round(boundNumber(value.custom_height, 480, 240, 2160)),
    text_scale: Math.round(boundNumber(value.text_scale, 1, 0.8, 1.5) * 20) / 20,
    contrast: value.contrast === 'high' ? 'high' : 'standard',
    reduced_motion: value.reduced_motion !== false,
    visible_panels: chosen,
  };
}

export function liveViewport(settings: LiveDisplaySettings): { width: number; height: number } {
  const preset = DISPLAY_PRESETS.find(p => p.id === settings.preset) ?? DISPLAY_PRESETS[0];
  return settings.preset === 'custom'
    ? { width: settings.custom_width, height: settings.custom_height }
    : { width: preset.width, height: preset.height };
}

/** No browser APIs in pure helpers — suitable for hermetic Node tests. */
export function loadLiveDisplay(): LiveDisplaySettings {
  if (typeof window === 'undefined') return normalizeLiveDisplay(null);
  try { return normalizeLiveDisplay(JSON.parse(window.localStorage.getItem(DISPLAY_SETTINGS_KEY) || 'null')); }
  catch { return normalizeLiveDisplay(null); }
}

export function saveLiveDisplay(settings: LiveDisplaySettings): LiveDisplaySettings {
  const valid = normalizeLiveDisplay(settings);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(valid));
    window.dispatchEvent(new Event(DISPLAY_SETTINGS_EVENT));
  }
  return valid;
}
