import prisma from '../../database/db';

export class SystemSettingsRepository {
  async getAll() {
    return prisma.adminSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async getByKey(key: string) {
    return prisma.adminSetting.findUnique({
      where: { key },
    });
  }

  async upsertSetting(key: string, data: { value: string; category?: string; type?: string; label?: string; description?: string; isPublic?: boolean }) {
    return prisma.adminSetting.upsert({
      where: { key },
      update: {
        value: data.value,
        ...(data.category && { category: data.category }),
        ...(data.type && { type: data.type }),
        ...(data.label && { label: data.label }),
        ...(data.description && { description: data.description }),
        ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
      },
      create: {
        key,
        value: data.value,
        category: data.category || 'GENERAL',
        type: data.type || 'TEXT',
        label: data.label || key,
        description: data.description || `Global config for ${key}`,
        isPublic: data.isPublic !== undefined ? data.isPublic : false,
      },
    });
  }
}

export const systemSettingsRepository = new SystemSettingsRepository();
export default systemSettingsRepository;
