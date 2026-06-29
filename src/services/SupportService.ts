import supportRepository from '../repositories/SupportRepository';
import AppError from '../utils/AppError';

export class SupportService {
  async createTicket(userId: string, data: any): Promise<any> {
    const { title, description, category, priority } = data;

    const ticket = await supportRepository.createTicket({
      userId,
      title,
      description,
      category,
      priority,
      status: 'OPEN',
    });

    // Create initial message
    await supportRepository.createMessage({
      ticketId: ticket.id,
      senderId: userId,
      senderRole: 'USER',
      message: description,
    });

    return ticket;
  }

  async getMyTickets(userId: string) {
    return supportRepository.findTickets({ userId });
  }

  async getTicketDetails(userId: string, ticketId: string) {
    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket) {
      throw new AppError('Ticket not found', 404);
    }
    // Access control: only creator, support or admin can view
    if (ticket.userId !== userId && ticket.user?.role === 'USER') {
      throw new AppError('Access denied', 403);
    }

    const messages = await supportRepository.findMessagesByTicketId(ticketId);
    return { ticket, messages };
  }

  async replyToTicket(userId: string, role: any, ticketId: string, message: string, attachments?: string[]): Promise<any> {
    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket) {
      throw new AppError('Ticket not found', 404);
    }

    if (role === 'USER' && ticket.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    // Update status based on sender
    const newStatus = role === 'USER' ? 'OPEN' : 'IN_PROGRESS';
    await supportRepository.updateTicketStatus(ticketId, newStatus);

    return supportRepository.createMessage({
      ticketId: ticket.id,
      senderId: userId,
      senderRole: role,
      message,
      attachments: attachments ? attachments.join(',') : undefined,
    });
  }

  async closeTicket(userId: string, ticketId: string, role: string): Promise<void> {
    const ticket = await supportRepository.findTicketById(ticketId);
    if (!ticket) {
      throw new AppError('Ticket not found', 404);
    }

    if (role === 'USER' && ticket.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    await supportRepository.updateTicketStatus(ticketId, 'CLOSED');
  }
}

export const supportService = new SupportService();
export default supportService;
