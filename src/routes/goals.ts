import { Router } from "express";
import { Request as JWTRequest } from "express-jwt";

import { requireAuth } from "../middleware/requireAuth";
import {
  createGoalForUser,
  createTopicAssessmentForUser,
  createTopicLessonForUser,
  deleteGoalForUser,
  listGoalsForUser,
} from "../services/goalRouteService";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const goals = await listGoalsForUser(userId);

    res.status(200).json({ goals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const result = await createGoalForUser(userId, req.body);

    if (result.kind === "title_required") {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    if (result.kind === "minutes_required") {
      res.status(400).json({ error: "Minutes per day is required" });
      return;
    }

    if (result.kind === "invalid_program") {
      res.status(400).json({ error: "Generated program is invalid" });
      return;
    }

    res.status(201).json({ goal: result.goal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:goalId", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { goalId } = req.params;

    const deleted = await deleteGoalForUser(userId, goalId);
    if (!deleted) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:goalId/topics/:topicId/lesson", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { goalId, topicId } = req.params;
    const { regenerate } = (req.body ?? {}) as { regenerate?: boolean };

    const result = await createTopicLessonForUser({
      userId,
      goalId,
      topicId,
      regenerate: Boolean(regenerate),
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    if (result.kind === "forbidden") {
      res.status(403).json({ error: "Topic is not available" });
      return;
    }

    res.status(result.statusCode).json({ chatId: result.chatId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/:goalId/topics/:topicId/assessment",
  async (req: JWTRequest, res) => {
    try {
      const userId = req.auth!.sub!;
      const { goalId, topicId } = req.params;
      const { regenerate } = (req.body ?? {}) as { regenerate?: boolean };

      const result = await createTopicAssessmentForUser({
        userId,
        goalId,
        topicId,
        regenerate: Boolean(regenerate),
      });

      if (result.kind === "not_found") {
        res.status(404).json({ error: "Topic not found" });
        return;
      }

      if (result.kind === "forbidden") {
        res.status(403).json({ error: "Topic is not available" });
        return;
      }

      if (result.kind === "invalid_generated") {
        res.status(400).json({ error: "Generated assessment is invalid" });
        return;
      }

      res.status(result.statusCode).json({ assessment: result.assessment });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
