import { systemSettingsCache } from '../modules/system-settings/SystemSettingsCache';

class SettingsCacheAdapter {
  getAll(): Record<string, string> {
    return systemSettingsCache.getAllValues();
  }

  setLocal(key: string, value: string): void {
    systemSettingsCache.setLocal(key, value);
  }
}

export const settingsCache = new SettingsCacheAdapter();
export default settingsCache;
