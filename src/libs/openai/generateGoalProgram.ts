import { requestJsonPayload } from "./requestJson";

export type GoalProgramInput = {
  discipline: string;
  description: string;
  currentLevel?: string | null;
  targetLevel?: string | null;
  minutesPerDay: number;
  notes?: string | null;
};

export type GeneratedGoalTopic = {
  title: string;
  summary?: string;
  durationWeeks?: number;
  subtopics?: string[];
};

export const generateGoalProgram = async ({
  discipline,
  description,
  currentLevel,
  targetLevel,
  minutesPerDay,
  notes,
}: GoalProgramInput): Promise<GeneratedGoalTopic[]> => {
  const promptLines = [
    `Create a learning program for "${discipline}".`,
    `Learner description: ${description}.`,
    currentLevel ? `Current level: ${currentLevel}.` : "Current level: unknown.",
    targetLevel ? `Target level: ${targetLevel}.` : "Target level: not specified.",
    `Available time: ${minutesPerDay} minutes per day.`,
    notes ? `Additional context: ${notes}.` : "Additional context: none.",
    "If this discipline/class exists on Yaklass, mirror Yaklass section titles 1:1 and keep the same structure.",
    "Return a structured program with topics, subtopics, and duration in weeks.",
    "Keep durations realistic for the available time.",
    "Return JSON only with this shape:",
    '{ "topics": [ { "title": "...", "summary": "...", "durationWeeks": 2, "subtopics": ["..."] } ] }',
  ];

  return requestJsonPayload(
    "You generate learning programs. Respond with valid JSON only.",
    promptLines,
    "Invalid program response",
    (value) => {
      if (
        value &&
        typeof value === "object" &&
        "topics" in value &&
        Array.isArray((value as { topics?: unknown }).topics)
      ) {
        return (value as { topics: GeneratedGoalTopic[] }).topics;
      }
      return null;
    }
  );
};
