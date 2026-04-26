import { GoalStatus, GoalTopicStatus } from "@prisma/client";

import prisma from "../../db/prisma";
import { generateGoalProgram } from "../../libs/openai";
import { normalizeProgramTopics } from "../goalService";
import { listGoalsForUser } from "./list";
import { toCreateGoalPayload } from "./helpers";

export type CreateGoalForUserResult =
  | { kind: "title_required" }
  | { kind: "minutes_required" }
  | { kind: "invalid_program" }
  | { kind: "success"; goal: Awaited<ReturnType<typeof listGoalsForUser>>[number] };

export const createGoalForUser = async (
  userId: string,
  body: unknown
): Promise<CreateGoalForUserResult> => {
  const {
    trimmedTitle,
    trimmedDescription,
    trimmedCurrentLevel,
    trimmedTargetLevel,
    trimmedNotes,
    normalizedMinutes,
    programDescription,
  } = toCreateGoalPayload(body);

  if (!trimmedTitle) {
    return { kind: "title_required" };
  }

  if (!normalizedMinutes || normalizedMinutes < 5) {
    return { kind: "minutes_required" };
  }

  const generatedTopics = await generateGoalProgram({
    discipline: trimmedTitle,
    description: programDescription,
    currentLevel: trimmedCurrentLevel || null,
    targetLevel: trimmedTargetLevel || null,
    minutesPerDay: normalizedMinutes,
    notes: trimmedNotes || null,
  });

  const programTopics = normalizeProgramTopics(generatedTopics);
  if (programTopics.length === 0) {
    return { kind: "invalid_program" };
  }

  const goal = await prisma.goal.create({
    data: {
      title: trimmedTitle,
      description: trimmedDescription || trimmedNotes || null,
      currentLevel: trimmedCurrentLevel || null,
      targetLevel: trimmedTargetLevel || null,
      minutesPerDay: normalizedMinutes,
      notes: trimmedNotes || null,
      status: GoalStatus.todo,
      userId,
      topics: {
        create: programTopics.map((topic, index) => ({
          order: index + 1,
          title: topic.title,
          summary: topic.summary,
          subtopics: topic.subtopics,
          durationWeeks: topic.durationWeeks,
          status:
            index === 0 ? GoalTopicStatus.in_progress : GoalTopicStatus.locked,
          startAt: null,
          dueAt: null,
        })),
      },
    },
    include: { topics: { orderBy: { order: "asc" } } },
  });

  return { kind: "success", goal };
};
