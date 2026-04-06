import bcrypt from "bcrypt";
import { Router } from "express";
import { Request as JWTRequest } from "express-jwt";
import jwt from "jsonwebtoken";

import prisma from "../db/prisma";
import { BCRYPT_SALT_ROUNDS, JWT_SECRET } from "../config";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

const createJWT = (id: string) =>
  jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: "30d" });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const normalizeEmail = (value: unknown) => normalizeString(value).toLowerCase();
const normalizeOptionalString = (value: unknown) => {
  if (value === undefined) return undefined;
  const trimmed = normalizeString(value);
  return trimmed || null;
};

const toPublicUser = (user: {
  id: string;
  email: string;
  displayName: string | null;
  tutorInstructions: string | null;
  createdAt: Date;
}) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  tutorInstructions: user.tutorInstructions,
  createdAt: user.createdAt,
});

router.post("/sign-up", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = typeof password === "string" ? password : "";
    const trimmedDisplayName = normalizeString(displayName);

    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      res.status(400).json({ message: "A valid email is required" });
      return;
    }

    if (normalizedPassword.length < 6) {
      res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      res.status(400).json({ message: "This email is already registered" });
      return;
    }

    const hashedPassword = await bcrypt.hash(
      normalizedPassword,
      BCRYPT_SALT_ROUNDS
    );
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        displayName: trimmedDisplayName || null,
        password: hashedPassword,
      },
    });

    const token = createJWT(newUser.id);

    res.status(201).json({
      token,
      user: toPublicUser(newUser),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sign-in", async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = typeof password === "string" ? password : "";

    if (
      !normalizedEmail ||
      !EMAIL_RE.test(normalizedEmail) ||
      !normalizedPassword
    ) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user || !(await bcrypt.compare(normalizedPassword, user.password))) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const token = createJWT(user.id);

    res.status(200).json({
      token,
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", requireAuth, async (req: JWTRequest, res) => {
  try {
    const id = req.auth!.sub!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    res.status(200).json({
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/me", requireAuth, async (req: JWTRequest, res) => {
  try {
    const id = req.auth!.sub!;
    const { tutorInstructions, displayName } = req.body as {
      tutorInstructions?: string | null;
      displayName?: string | null;
    };

    const updateData: {
      tutorInstructions?: string | null;
      displayName?: string | null;
    } = {};

    if (tutorInstructions !== undefined) {
      updateData.tutorInstructions = normalizeOptionalString(tutorInstructions);
    }

    if (displayName !== undefined) {
      updateData.displayName = normalizeOptionalString(displayName);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/me", requireAuth, async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const result = await prisma.user.deleteMany({ where: { id: userId } });
    if (!result.count) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
