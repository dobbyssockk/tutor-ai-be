import { Router } from "express";
import { Request as JWTRequest } from "express-jwt";

import { requireAuth } from "../middleware/requireAuth";
import {
  deleteMe,
  getMe,
  signIn,
  signUp,
  updateMe,
} from "../services/authService";

const router = Router();

router.post("/sign-up", async (req, res) => {
  const { email, password, displayName } = req.body;
  const result = await signUp(email, password, displayName);

  if (result.kind === "email_invalid") {
    res.status(400).json({ message: "A valid email is required" });
    return;
  }
  if (result.kind === "password_too_short") {
    res.status(400).json({ message: "Password must be at least 6 characters" });
    return;
  }
  if (result.kind === "email_taken") {
    res.status(400).json({ message: "This email is already registered" });
    return;
  }

  res.status(201).json({ token: result.token, user: result.user });
});

router.post("/sign-in", async (req, res) => {
  const { email, password } = req.body;
  const result = await signIn(email, password);

  if (result.kind === "credentials_required") {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }
  if (result.kind === "invalid_credentials") {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  res.status(200).json({ token: result.token, user: result.user });
});

router.get("/me", requireAuth, async (req: JWTRequest, res) => {
  const user = await getMe(req.auth!.sub!);
  res.status(200).json({ user });
});

router.patch("/me", requireAuth, async (req: JWTRequest, res) => {
  const { tutorInstructions, displayName } = req.body as {
    tutorInstructions?: string | null;
    displayName?: string | null;
  };
  const user = await updateMe(req.auth!.sub!, { tutorInstructions, displayName });
  res.status(200).json({ user });
});

router.delete("/me", requireAuth, async (req: JWTRequest, res) => {
  const deleted = await deleteMe(req.auth!.sub!);
  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
