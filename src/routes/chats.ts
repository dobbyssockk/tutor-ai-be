import { Router } from "express";
import { Request as JWTRequest } from "express-jwt";

import { requireAuth } from "../middleware/requireAuth";
import { createChatWithPrompt } from "../services/chatService";
import {
  addMessageToChat,
  deleteChatForUser,
  deleteAllChatsForUser,
  getChatForUser,
  listChatsForUser,
  updateChatTitleForUser,
} from "../services/chatRoute";

const router = Router();

router.use(requireAuth);

router.get("/", async (req: JWTRequest, res) => {
  const chats = await listChatsForUser(req.auth!.sub!);
  res.status(200).json({ chats });
});

router.post("/", async (req: JWTRequest, res) => {
  const input = typeof req.body?.input === "string" ? req.body.input.trim() : "";
  if (!input) {
    res.status(400).json({ error: "Content is required" });
    return;
  }
  const newChat = await createChatWithPrompt(req.auth!.sub!, input);
  res.status(201).json({ chat: newChat });
});

router.get("/:chatId", async (req: JWTRequest, res) => {
  const result = await getChatForUser(req.auth!.sub!, req.params.chatId);
  if (result.kind === "not_found") {
    res.status(404).json({ error: "Chat not found" });
    return;
  }
  res.status(200).json({ chat: result.chat });
});

router.patch("/:chatId", async (req: JWTRequest, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  if (title.length > 120) {
    res.status(400).json({ error: "Title is too long" });
    return;
  }

  const result = await updateChatTitleForUser(req.auth!.sub!, req.params.chatId, title);
  if (result.kind === "not_found") {
    res.status(404).json({ error: "Chat not found" });
    return;
  }
  res.status(200).json({ chat: result.chat });
});

router.delete("/:chatId", async (req: JWTRequest, res) => {
  const result = await deleteChatForUser(req.auth!.sub!, req.params.chatId);
  if (result.kind === "not_found") {
    res.status(404).json({ error: "Chat not found" });
    return;
  }
  res.sendStatus(204);
});

router.delete("/", async (req: JWTRequest, res) => {
  await deleteAllChatsForUser(req.auth!.sub!);
  res.sendStatus(204);
});

router.post("/:chatId/messages", async (req: JWTRequest, res) => {
  const input = typeof req.body?.input === "string" ? req.body.input.trim() : "";
  if (!input) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  const result = await addMessageToChat(req.auth!.sub!, req.params.chatId, input);
  if (result.kind === "not_found") {
    res.status(404).json({ error: "Chat not found" });
    return;
  }
  res.status(200).json({ user: result.user, assistant: result.assistant });
});

export default router;
