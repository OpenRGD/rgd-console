'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_LIVE_DISPLAY, DISPLAY_SETTINGS_EVENT, DISPLAY_SETTINGS_KEY,
  loadLiveDisplay, normalizeLiveDisplay, saveLiveDisplay,
  type LiveDisplaySettings,
} from '@/lib/display-profiles';

/** Browser-local display profile: syncs cross-tab via storage and same-page via custom event. */
export function useLiveDisplay(): [LiveDisplaySettings, (value: LiveDisplaySettings) => void] {
  const [settings, setSettings] = useState<LiveDisplaySettings>(() => normalizeLiveDisplay(DEFAULT_LIVE_DISPLAY));

  useEffect(() => {
    const sync = () => setSettings(loadLiveDisplay());
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === DISPLAY_SETTINGS_KEY || event.key === null) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(DISPLAY_SETTINGS_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(DISPLAY_SETTINGS_EVENT, sync);
    };
  }, []);

  const update = useCallback((incoming: LiveDisplaySettings) => {
    setSettings(saveLiveDisplay(incoming));
  }, []);
  return [settings, update];
}
