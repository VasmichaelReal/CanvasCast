import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

// У dev Next.js перезавантажує модулі; тримаємо один клієнт, щоб не плодити з'єднання.
const globalForPrisma = globalThis as unknown as { __canvascastPrisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__canvascastPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__canvascastPrisma = prisma;
}
