
'use client';

import type { AppSettings } from '@/lib/definitions';
import { useState, useEffect, useCallback } from 'react';

const APP_SETTINGS_KEY = 'contentCuratorAppSettings';

const defaultSettings: Partial<AppSettings> = {
  defaultTopic: 'General AI',
  lineUserId: undefined,
  githubRepoUrl: undefined,
};

export function useAppSettings(): [Partial<AppSettings>, (newSettings: Partial<AppSettings>) => void, boolean] {
  const [settings, setSettings] = useState<Partial<AppSettings>>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedSettings = localStorage.getItem(APP_SETTINGS_KEY);
        if (storedSettings) {
          const parsedSettings = JSON.parse(storedSettings) as Partial<AppSettings>;
          const validKeys: (keyof AppSettings)[] = ['defaultTopic', 'lineUserId', 'githubRepoUrl'];
          const filteredSettings: Partial<AppSettings> = {};
          validKeys.forEach(key => {
            if (parsedSettings[key] !== undefined) {
              filteredSettings[key] = parsedSettings[key];
            }
          });
          setSettings(prev => ({ ...prev, ...filteredSettings }));
        }
      } catch (e) {
        console.error("Failed to parse settings from localStorage", e);
        localStorage.removeItem(APP_SETTINGS_KEY); // Clear corrupted data
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false); // Not in browser environment
    }
  }, []);

  const saveSettingsToLocalStorage = useCallback((newSettings: Partial<AppSettings>) => {
    if (typeof window !== 'undefined') {
      try {
        // Ensure only valid keys are saved
        const validKeys: (keyof AppSettings)[] = ['defaultTopic', 'lineUserId', 'githubRepoUrl'];
        const settingsToSave: Partial<AppSettings> = {};
         validKeys.forEach(key => {
            if (newSettings[key] !== undefined) {
              settingsToSave[key] = newSettings[key];
            }
          });

        const updatedSettings = { ...settings, ...settingsToSave };
        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(updatedSettings));
        setSettings(updatedSettings);
      } catch (e) {
        console.error("Failed to save settings to localStorage", e);
      }
    }
  }, [settings]);

  return [settings, saveSettingsToLocalStorage, isLoading];
}
