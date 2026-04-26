import { Router } from "express";
import { Request as JWTRequest } from "express-jwt";

import { requireAuth } from "../middleware/requireAuth";
import {
  createAttemptReviewChatForUser,
  getAssessmentAttemptDetailsForUser,
  getAssessmentAttemptForUser,
  listAssessmentsForUser,
  startAssessmentAttemptForUser,
  submitAssessmentAttemptForUser,
} from "../services/assessmentRouteService";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const assessments = await listAssessmentsForUser(userId);
    res.status(200).json({ assessments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:assessmentId/attempts", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { assessmentId } = req.params;

    const result = await startAssessmentAttemptForUser(userId, assessmentId);
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }
    if (result.kind === "forbidden") {
      res.status(403).json({ error: "Assessment not available" });
      return;
    }
    if (result.kind === "no_questions") {
      res.status(400).json({ error: "Assessment has no questions" });
      return;
    }

    res.status(201).json({ attempt: result.attempt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/attempts/:attemptId", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { attemptId } = req.params;

    const result = await getAssessmentAttemptForUser(userId, attemptId);
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    res.status(200).json({ attempt: result.attempt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/attempts/:attemptId/submit", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { attemptId } = req.params;

    const result = await submitAssessmentAttemptForUser(
      userId,
      attemptId,
      (req.body as { answers?: unknown })?.answers
    );

    if (result.kind === "invalid_answers") {
      res.status(400).json({ error: "Answers are required" });
      return;
    }

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    res.status(200).json({
      attempt: result.attempt,
      chatId: result.chatId,
      mistakesCount: result.mistakesCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/attempts/:attemptId/results", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { attemptId } = req.params;

    const result = await getAssessmentAttemptDetailsForUser(userId, attemptId);
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    if (result.kind === "not_completed") {
      res.status(400).json({ error: "Assessment not completed yet" });
      return;
    }

    res.status(200).json({ result: result.result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/attempts/:attemptId/review-chat", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { attemptId } = req.params;

    const result = await createAttemptReviewChatForUser(userId, attemptId);
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    if (result.kind === "not_completed") {
      res.status(400).json({ error: "Assessment not completed yet" });
      return;
    }

    res.status(result.created ? 201 : 200).json({ chatId: result.chatId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
