-- AlterTable
ALTER TABLE `User` 
  ADD COLUMN `referralCode` VARCHAR(191) NOT NULL,
  ADD COLUMN `isMobileVerified` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `isEmailVerified` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
  ADD COLUMN `lastLoginIp` VARCHAR(191) NULL,
  ADD COLUMN `lastLoginDevice` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_referralCode_key` ON `User`(`referralCode`);
