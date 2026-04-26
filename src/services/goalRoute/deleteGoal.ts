import prisma from "../../db/prisma";

export const deleteGoalForUser = async (userId: string, goalId: string) => {
  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true },
  });

  if (!existing) {
    return false;
  }

  await prisma.goal.delete({ where: { id: goalId } });
  return true;
};
