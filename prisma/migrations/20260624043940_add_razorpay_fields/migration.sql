-- AlterTable
ALTER TABLE `transaction` ADD COLUMN `gatewayResponse` TEXT NULL,
    ADD COLUMN `paymentMethod` VARCHAR(191) NULL,
    ADD COLUMN `razorpayOrderId` VARCHAR(191) NULL,
    ADD COLUMN `razorpayPaymentId` VARCHAR(191) NULL,
    ADD COLUMN `razorpaySignature` VARCHAR(191) NULL;
