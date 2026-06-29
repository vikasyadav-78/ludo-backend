import prisma from '../database/db';
import { Wallet, Prisma, BalanceType } from '@prisma/client';

export class WalletRepository {
  async findByUserId(userId: string): Promise<Wallet | null> {
    return prisma.wallet.findUnique({ where: { userId } });
  }

  async create(userId: string): Promise<Wallet> {
    return prisma.wallet.create({ data: { userId } });
  }

  async updateBalanceWithLedger(
    userId: string,
    amount: number,
    balanceType: BalanceType,
    description: string,
    transactionId?: string,
    txClient?: Prisma.TransactionClient
  ): Promise<Wallet> {
    // If a transaction client is passed, use it; otherwise use default global client
    const client = txClient || prisma;

    const wallet = await client.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new Error(`Wallet not found for user ${userId}`);
    }

    let previousBalance = 0;
    const updateData: Prisma.WalletUpdateInput = {};

    if (balanceType === 'DEPOSIT') {
      previousBalance = wallet.depositBalance;
      updateData.depositBalance = previousBalance + amount;
    } else if (balanceType === 'WINNING') {
      previousBalance = wallet.winningBalance;
      updateData.winningBalance = previousBalance + amount;
    } else if (balanceType === 'BONUS') {
      previousBalance = wallet.bonusBalance;
      updateData.bonusBalance = previousBalance + amount;
    }

    if (((updateData.depositBalance || 0) as number) < 0 ||
        ((updateData.winningBalance || 0) as number) < 0 ||
        ((updateData.bonusBalance || 0) as number) < 0) {
      throw new Error(`Insufficient ${balanceType} balance`);
    }

    // Apply Update
    const updatedWallet = await client.wallet.update({
      where: { userId },
      data: updateData,
    });

    // Create Ledger entry
    await client.walletLedger.create({
      data: {
        walletId: wallet.id,
        userId: userId,
        transactionId: transactionId || null,
        previousBalance,
        newBalance: previousBalance + amount,
        balanceType,
        description,
      },
    });

    return updatedWallet;
  }
}

export const walletRepository = new WalletRepository();
export default walletRepository;
