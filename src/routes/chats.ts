import { Router } from "express";
import { Request as JWTRequest } from "express-jwt";

import prisma from "../db/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { createChatWithPrompt } from "../services/chatService";
import { generateGPT } from "../libs/openai";

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
    const { input } = req.body;
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
    await prisma.$transaction(async (tx) => {
      await tx.goalTopic.updateMany({
        where: { lessonChatId: id, goal: { userId } },
        data: { lessonChatId: null },
      });
      await tx.chat.delete({ where: { id, userId } });
    });
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
    const { input } = req.body;

    if (!input.trim()) {
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tutorInstructions: true, displayName: true, email: true },
    });

    const assistantOutputText = await generateGPT(
      context,
      user?.tutorInstructions,
      user?.displayName
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
