import prisma from '../database/db';
import { Transaction, Prisma } from '@prisma/client';

export class TransactionRepository {
  async findById(id: string): Promise<Transaction | null> {
    return prisma.transaction.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true, mobile: true } } },
    });
  }

  async create(transactionData: Prisma.TransactionUncheckedCreateInput, txClient?: Prisma.TransactionClient): Promise<Transaction> {
    const client = txClient || prisma;
    return client.transaction.create({ data: transactionData });
  }

  async find(filter: Prisma.TransactionWhereInput = {}): Promise<Transaction[]> {
    return prisma.transaction.findMany({
      where: filter,
      include: { user: { select: { name: true, email: true, mobile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: string,
    status: 'PENDING' | 'SUCCESS' | 'FAILED',
    txClient?: Prisma.TransactionClient
  ): Promise<Transaction | null> {
    const client = txClient || prisma;
    return client.transaction.update({
      where: { id },
      data: { status },
    });
  }

  async count(filter: Prisma.TransactionWhereInput = {}): Promise<number> {
    return prisma.transaction.count({ where: filter });
  }
}

export const transactionRepository = new TransactionRepository();
export default transactionRepository;
