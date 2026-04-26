import prisma from "../../db/prisma";

export const listGoalsForUser = (userId: string) =>
  prisma.goal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { topics: { orderBy: { order: "asc" } } },
  });
