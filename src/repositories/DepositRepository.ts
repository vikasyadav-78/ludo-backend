import prisma from '../database/db';
import { DepositRequest, Prisma } from '@prisma/client';

export class DepositRepository {
  async findById(id: string): Promise<DepositRequest | null> {
    return prisma.depositRequest.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true, mobile: true } } },
    });
  }

  async findOne(filter: Prisma.DepositRequestWhereInput): Promise<DepositRequest | null> {
    return prisma.depositRequest.findFirst({ where: filter });
  }

  async create(depositData: Prisma.DepositRequestUncheckedCreateInput): Promise<DepositRequest> {
    return prisma.depositRequest.create({ data: depositData });
  }

  async find(filter: Prisma.DepositRequestWhereInput = {}): Promise<DepositRequest[]> {
    return prisma.depositRequest.findMany({
      where: filter,
      include: { user: { select: { name: true, email: true, mobile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    updateData: Prisma.DepositRequestUpdateInput,
    txClient?: Prisma.TransactionClient
  ): Promise<DepositRequest | null> {
    const client = txClient || prisma;
    return client.depositRequest.update({
      where: { id },
      data: updateData,
    });
  }

  async count(filter: Prisma.DepositRequestWhereInput = {}): Promise<number> {
    return prisma.depositRequest.count({ where: filter });
  }
}

export const depositRepository = new DepositRepository();
export default depositRepository;
