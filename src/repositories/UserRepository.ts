import prisma from '../database/db';
import { User, Prisma } from '@prisma/client';

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findByMobile(mobile: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { mobile } });
  }

  async create(userData: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data: userData });
  }

  async update(id: string, updateData: Prisma.UserUpdateInput): Promise<User | null> {
    return prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  async find(filter: Prisma.UserWhereInput = {}): Promise<User[]> {
    return prisma.user.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(filter: Prisma.UserWhereInput = {}): Promise<number> {
    return prisma.user.count({ where: filter });
  }
}

export const userRepository = new UserRepository();
export default userRepository;
