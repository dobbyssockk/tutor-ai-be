import { Router } from "express";
import { Request as JWTRequest } from "express-jwt";

import prisma from "../db/prisma";
import { requireAuth } from "../middleware/requireAuth";
import {
  createChatWithPrompt,
  generateAssistantTextForUser,
} from "../services/chatService";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const chats = await prisma.chat.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    res.status(200).json({ chats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const input =
      typeof req.body?.input === "string" ? req.body.input.trim() : "";
    if (!input) {
      res.status(400).json({ error: "Content is required" });
      return;
    }
    const newChat = await createChatWithPrompt(userId, input);
    res.status(201).json({ chat: newChat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:chatId", async (req: JWTRequest, res) => {
  try {
    const id = req.params.chatId;
    const userId = req.auth!.sub!;
    const chat = await prisma.chat.findFirst({
      where: { id, userId },
      include: { messages: true },
    });
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.status(200).json({ chat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:chatId", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { chatId } = req.params;
    const title =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";

    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    if (title.length > 120) {
      res.status(400).json({ error: "Title is too long" });
      return;
    }

    const updated = await prisma.chat.updateMany({
      where: { id: chatId, userId },
      data: {
        title,
        updatedAt: new Date(),
      },
    });

    if (!updated.count) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId },
    });

    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    res.status(200).json({ chat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:chatId", async (req: JWTRequest, res) => {
  try {
    const id = req.params.chatId;
    const userId = req.auth!.sub!;
    const deleted = await prisma.$transaction(async (tx) => {
      await tx.goalTopic.updateMany({
        where: { lessonChatId: id, goal: { userId } },
        data: { lessonChatId: null },
      });
      return tx.chat.deleteMany({ where: { id, userId } });
    });
    if (!deleted.count) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    await prisma.$transaction(async (tx) => {
      const chats = await tx.chat.findMany({
        where: { userId },
        select: { id: true },
      });
      const chatIds = chats.map((chat) => chat.id);

      if (chatIds.length > 0) {
        await tx.goalTopic.updateMany({
          where: { lessonChatId: { in: chatIds }, goal: { userId } },
          data: { lessonChatId: null },
        });
      }

      await tx.chat.deleteMany({ where: { userId } });
    });
    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:chatId/messages", async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { chatId } = req.params;
    const input =
      typeof req.body?.input === "string" ? req.body.input.trim() : "";

    if (!input) {
      res.status(400).json({ error: "Content is required" });
      return;
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId },
      select: { id: true },
    });
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    const userMsg = await prisma.message.create({
      data: { role: "user", outputText: input, chatId },
    });

    const context = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: "asc" },
    });

    const assistantOutputText = await generateAssistantTextForUser(
      userId,
      context,
      "Извините, сейчас не удалось сгенерировать ответ. Попробуйте позже."
    );

    const assistantMsg = await prisma.message.create({
      data: {
        role: "assistant",
        outputText: assistantOutputText,
        chatId,
      },
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    res.status(200).json({ user: userMsg, assistant: assistantMsg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
