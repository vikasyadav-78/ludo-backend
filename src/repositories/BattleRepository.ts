import prisma from '../database/db';
import { Battle, Prisma } from '@prisma/client';

export class BattleRepository {
  async findById(id: string): Promise<Battle | null> {
    return prisma.battle.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        joiner: { select: { id: true, name: true, email: true, avatar: true } },
        participants: true,
      },
    });
  }

  async findOne(filter: Prisma.BattleWhereInput): Promise<Battle | null> {
    return prisma.battle.findFirst({
      where: filter,
      include: {
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        joiner: { select: { id: true, name: true, email: true, avatar: true } },
        participants: true,
      },
    });
  }


  async create(battleData: Prisma.BattleCreateInput): Promise<Battle> {
    return prisma.battle.create({ data: battleData });
  }

  async update(id: string, updateData: Prisma.BattleUpdateInput, txClient?: Prisma.TransactionClient): Promise<Battle | null> {
    const client = txClient || prisma;
    return client.battle.update({
      where: { id },
      data: updateData,
    });
  }

  async find(filter: Prisma.BattleWhereInput = {}): Promise<Battle[]> {
    return prisma.battle.findMany({
      where: filter,
      include: {
        creator: { select: { id: true, name: true, email: true, avatar: true } },
        joiner: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(filter: Prisma.BattleWhereInput = {}): Promise<number> {
    return prisma.battle.count({ where: filter });
  }
}

export const battleRepository = new BattleRepository();
export default battleRepository;
