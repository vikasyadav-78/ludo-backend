import prisma from '../database/db';
import { AdminAuditLog, Prisma } from '@prisma/client';

export class AuditLogRepository {
  async create(data: Prisma.AdminAuditLogCreateInput): Promise<AdminAuditLog> {
    return prisma.adminAuditLog.create({ data });
  }

  async findMany(
    filter: Prisma.AdminAuditLogWhereInput = {},
    skip = 0,
    take = 50
  ): Promise<AdminAuditLog[]> {
    return prisma.adminAuditLog.findMany({
      where: filter,
      skip,
      take,
      orderBy: { createdAt: 'desc' }
    });
  }

  async count(filter: Prisma.AdminAuditLogWhereInput = {}): Promise<number> {
    return prisma.adminAuditLog.count({ where: filter });
  }
}

export const auditLogRepository = new AuditLogRepository();
export default auditLogRepository;
