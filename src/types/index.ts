export type BattleStatusType =
  | 'OPEN'
  | 'JOINED'
  | 'IN_PROGRESS'
  | 'RESULT_SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED';

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'BATTLE_ENTRY'
  | 'BATTLE_WIN'
  | 'BATTLE_REFUND'
  | 'REFERRAL_BONUS'
  | 'ADMIN_CREDIT'
  | 'ADMIN_DEBIT';

export type UserRole = 'USER' | 'ADMIN' | 'SUPPORT';
