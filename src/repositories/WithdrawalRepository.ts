import prisma from '../database/db';
import { WithdrawalRequest, Prisma } from '@prisma/client';

export class WithdrawalRepository {
  async findById(id: string): Promise<WithdrawalRequest | null> {
    return prisma.withdrawalRequest.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true, mobile: true } } },
    });
  }

  async create(withdrawalData: Prisma.WithdrawalRequestUncheckedCreateInput): Promise<WithdrawalRequest> {
    return prisma.withdrawalRequest.create({ data: withdrawalData });
  }

  async find(filter: Prisma.WithdrawalRequestWhereInput = {}): Promise<WithdrawalRequest[]> {
    return prisma.withdrawalRequest.findMany({
      where: filter,
      include: { user: { select: { name: true, email: true, mobile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    updateData: Prisma.WithdrawalRequestUpdateInput,
    txClient?: Prisma.TransactionClient
  ): Promise<WithdrawalRequest | null> {
    const client = txClient || prisma;
    return client.withdrawalRequest.update({
      where: { id },
      data: updateData,
    });
  }

  async count(filter: Prisma.WithdrawalRequestWhereInput = {}): Promise<number> {
    return prisma.withdrawalRequest.count({ where: filter });
  }
}

export const withdrawalRepository = new WithdrawalRepository();
export default withdrawalRepository;
