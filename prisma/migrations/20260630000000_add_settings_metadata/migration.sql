-- AlterTable
ALTER TABLE `AdminSetting` 
  ADD COLUMN `category` VARCHAR(191) NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'TEXT',
  ADD COLUMN `label` VARCHAR(191) NULL,
  ADD COLUMN `isPublic` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `AdminSetting_category_idx` ON `AdminSetting`(`category`);
