const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      wallet: true
    }
  });
  console.log("USERS IN DATABASE:", JSON.stringify(users, null, 2));

  const battles = await prisma.battle.findMany();
  console.log("BATTLES IN DATABASE:", JSON.stringify(battles, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
