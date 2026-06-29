import prisma from '../database/db';
import { SupportTicket, SupportMessage, Prisma } from '@prisma/client';

export class SupportRepository {
  async createTicket(ticketData: Prisma.SupportTicketUncheckedCreateInput): Promise<SupportTicket> {
    return prisma.supportTicket.create({ data: ticketData });
  }

  async findTicketById(id: string): Promise<any> {
    return prisma.supportTicket.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true, mobile: true, role: true } } },
    });
  }

  async findTickets(filter: Prisma.SupportTicketWhereInput = {}): Promise<SupportTicket[]> {
    return prisma.supportTicket.findMany({
      where: filter,
      include: { user: { select: { id: true, name: true, email: true, mobile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTicketStatus(id: string, status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED'): Promise<SupportTicket | null> {
    return prisma.supportTicket.update({
      where: { id },
      data: { status },
    });
  }

  async createMessage(messageData: Prisma.SupportMessageUncheckedCreateInput): Promise<SupportMessage> {
    return prisma.supportMessage.create({ data: messageData });
  }

  async findMessagesByTicketId(ticketId: string): Promise<SupportMessage[]> {
    return prisma.supportMessage.findMany({
      where: { ticketId },
      include: { sender: { select: { id: true, name: true, avatar: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export const supportRepository = new SupportRepository();
export default supportRepository;
