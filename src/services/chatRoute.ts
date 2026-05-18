import { Chat, Message } from "@prisma/client";

import prisma from "../db/prisma";
import { generateAssistantTextForUser } from "./chatService";

type ChatWithMessages = Chat & { messages: Message[] };

export type GetChatResult =
  | { kind: "not_found" }
  | { kind: "ok"; chat: ChatWithMessages };

export type UpdateChatTitleResult =
  | { kind: "not_found" }
  | { kind: "ok"; chat: Chat };

export type DeleteChatResult = { kind: "not_found" } | { kind: "ok" };

export type AddMessageResult =
  | { kind: "not_found" }
  | { kind: "ok"; user: Message; assistant: Message };

export const listChatsForUser = (userId: string): Promise<Chat[]> =>
  prisma.chat.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });

export const getChatForUser = async (
  userId: string,
  chatId: string
): Promise<GetChatResult> => {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!chat) return { kind: "not_found" };
  return { kind: "ok", chat };
};

export const updateChatTitleForUser = async (
  userId: string,
  chatId: string,
  title: string
): Promise<UpdateChatTitleResult> => {
  const updated = await prisma.chat.updateMany({
    where: { id: chatId, userId },
    data: { title, updatedAt: new Date() },
  });
  if (!updated.count) return { kind: "not_found" };

  const chat = await prisma.chat.findFirst({ where: { id: chatId, userId } });
  if (!chat) return { kind: "not_found" };
  return { kind: "ok", chat };
};

export const deleteChatForUser = async (
  userId: string,
  chatId: string
): Promise<DeleteChatResult> => {
  const deleted = await prisma.$transaction(async (tx) => {
    await tx.goalTopic.updateMany({
      where: { lessonChatId: chatId, goal: { userId } },
      data: { lessonChatId: null },
    });
    return tx.chat.deleteMany({ where: { id: chatId, userId } });
  });
  if (!deleted.count) return { kind: "not_found" };
  return { kind: "ok" };
};

export const deleteAllChatsForUser = async (userId: string): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const chats = await tx.chat.findMany({ where: { userId }, select: { id: true } });
    const chatIds = chats.map((c) => c.id);
    if (chatIds.length > 0) {
      await tx.goalTopic.updateMany({
        where: { lessonChatId: { in: chatIds }, goal: { userId } },
        data: { lessonChatId: null },
      });
    }
    await tx.chat.deleteMany({ where: { userId } });
  });
};

export const addMessageToChat = async (
  userId: string,
  chatId: string,
  input: string
): Promise<AddMessageResult> => {
  const chat = await prisma.chat.findFirst({ where: { id: chatId, userId }, select: { id: true } });
  if (!chat) return { kind: "not_found" };

  const userMsg = await prisma.message.create({
    data: { role: "user", outputText: input, chatId },
  });

  const context = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
  });

  const assistantOutputText = await generateAssistantTextForUser(userId, context);

  const assistantMsg = await prisma.message.create({
    data: { role: "assistant", outputText: assistantOutputText, chatId },
  });

  await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

  return { kind: "ok", user: userMsg, assistant: assistantMsg };
};
