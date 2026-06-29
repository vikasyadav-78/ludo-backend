import { systemSettingsRepository } from './SystemSettingsRepository';

export interface SettingDefinition {
  key: string;
  value: string;
  category: string;
  type: string;
  label: string;
  description: string;
  isPublic: boolean;
}

class SystemSettingsCache {
  private valueCache: Map<string, string> = new Map();
  private recordCache: Map<string, any> = new Map();

  async initialize(): Promise<void> {
    const dbSettings = await systemSettingsRepository.getAll();
    this.valueCache.clear();
    this.recordCache.clear();

    for (const setting of dbSettings) {
      this.valueCache.set(setting.key, setting.value);
      this.recordCache.set(setting.key, setting);
    }
  }

  get(key: string, defaultValue: string = ''): string {
    return this.valueCache.has(key) ? this.valueCache.get(key)! : defaultValue;
  }

  getBoolean(key: string, defaultValue: boolean = false): boolean {
    const val = this.get(key);
    if (!val) return defaultValue;
    return val === 'true';
  }

  getNumber(key: string, defaultValue: number = 0): number {
    const val = this.get(key);
    if (!val) return defaultValue;
    const num = parseFloat(val);
    return isNaN(num) ? defaultValue : num;
  }

  setLocal(key: string, value: string): void {
    this.valueCache.set(key, value);
    if (this.recordCache.has(key)) {
      const record = this.recordCache.get(key);
      record.value = value;
      this.recordCache.set(key, record);
    }
  }

  setRecordLocal(key: string, record: any): void {
    this.valueCache.set(key, record.value);
    this.recordCache.set(key, record);
  }

  getAllRecords(): any[] {
    return Array.from(this.recordCache.values());
  }

  getAllPublicRecords(): any[] {
    return this.getAllRecords().filter((r) => r.isPublic);
  }

  getAllValues(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, val] of this.valueCache.entries()) {
      result[key] = val;
    }
    return result;
  }
}

export const systemSettingsCache = new SystemSettingsCache();
export default systemSettingsCache;
