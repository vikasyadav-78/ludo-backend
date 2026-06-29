const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database reset...');

  // Disable foreign keys check before truncating tables
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

  const tables = [
    'UserDevice',
    'Announcement',
    'Banner',
    'PlatformRevenue',
    'SupportMessage',
    'SupportTicket',
    'ReferralReward',
    'Referral',
    'BattleResult',
    'BattleParticipant',
    'Battle',
    'OtpVerification',
    'LoginHistory',
    'AdminAuditLog',
    'WalletLedger',
    'Wallet',
    'Transaction',
    'DepositRequest',
    'WithdrawalRequest',
    'AdminSetting',
    'User',
  ];

  for (const table of tables) {
    try {
      console.log(`Truncating table: ${table}`);
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\`;`);
    } catch (err) {
      console.error(`Failed to truncate ${table}:`, err.message);
    }
  }

  // Re-enable foreign key checks
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('All tables truncated successfully.');

  // Create fresh Admin Account
  const email = 'yadavvikas787840@gmail.com';
  const mobile = '7878402570';
  const plainPassword = 'LudoAdmin@7878@';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  console.log('Creating default Admin account...');
  const admin = await prisma.user.create({
    data: {
      name: 'System Admin',
      email,
      mobile,
      password: passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      isEmailVerified: true,
      isMobileVerified: true,
      referralCode: 'SYSADMIN',
    },
  });

  // Create wallet for Admin
  await prisma.wallet.create({
    data: {
      userId: admin.id,
      depositBalance: 0,
      winningBalance: 0,
      bonusBalance: 0,
    },
  });

  console.log('Default Admin account created successfully!');
  console.log(`Email: ${email}`);
  console.log(`Mobile: ${mobile}`);
  console.log('Wallet initialized.');
}

main()
  .catch((e) => {
    console.error('Error executing reset script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
