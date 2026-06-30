-- CreateTable
CREATE TABLE `AdminAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `adminName` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NOT NULL,
    `device` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable (Add AI and Admin verification columns to Battle, and update status ENUM to support SETTLED)
ALTER TABLE `Battle` 
  ADD COLUMN `aiConfidence` DOUBLE NULL,
  ADD COLUMN `aiResponse` JSON NULL,
  ADD COLUMN `verificationStatus` ENUM('FAILED', 'AUTO_SETTLED', 'DISPUTED', 'MANUAL_SETTLED', 'REFUNDED', 'REJECTED') NULL,
  ADD COLUMN `verificationTimestamp` DATETIME(3) NULL,
  ADD COLUMN `settlementTimestamp` DATETIME(3) NULL,
  ADD COLUMN `adminNotes` VARCHAR(191) NULL,
  MODIFY COLUMN `status` ENUM('OPEN', 'JOINED', 'IN_PROGRESS', 'RESULT_SUBMITTED', 'PENDING_APPROVAL', 'COMPLETED', 'SETTLED', 'DISPUTED', 'CANCELLED') NOT NULL DEFAULT 'OPEN';

-- AlterTable (Add screenshotPublicId to BattleParticipant)
ALTER TABLE `BattleParticipant` 
  ADD COLUMN `screenshotPublicId` VARCHAR(191) NULL;

-- AlterTable (Add screenshotPublicId to BattleResult)
ALTER TABLE `BattleResult` 
  ADD COLUMN `screenshotPublicId` VARCHAR(191) NULL;
