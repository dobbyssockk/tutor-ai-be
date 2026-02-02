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

router.post("/sign-up", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const trimmedDisplayName =
      typeof displayName === "string" ? displayName.trim() : "";

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      res.status(400).json({ message: "This email is already registered" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
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
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        tutorInstructions: newUser.tutorInstructions,
        createdAt: newUser.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sign-in", async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const token = createJWT(user.id);

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tutorInstructions: user.tutorInstructions,
        createdAt: user.createdAt,
      },
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
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tutorInstructions: user.tutorInstructions,
        createdAt: user.createdAt,
      },
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
      const trimmed = tutorInstructions?.trim();
      updateData.tutorInstructions = trimmed ? trimmed : null;
    }

    if (displayName !== undefined) {
      const trimmed = displayName?.trim();
      updateData.displayName = trimmed ? trimmed : null;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        tutorInstructions: user.tutorInstructions,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/me", requireAuth, async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;

    await prisma.$transaction(async (tx) => {
      const chats = await tx.chat.findMany({
        where: { userId },
        select: { id: true },
      });
      const chatIds = chats.map((chat) => chat.id);

      if (chatIds.length > 0) {
        await tx.message.deleteMany({
          where: { chatId: { in: chatIds } },
        });
      }

      await tx.chat.deleteMany({ where: { userId } });
      await tx.goal.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
