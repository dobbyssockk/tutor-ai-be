import bcrypt from "bcrypt";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { expressjwt, Request as JWTRequest } from "express-jwt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { generateGPT } from "./libs/openai";

dotenv.config(); // load environment variables from a .env file into

const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET as string;
const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS);

const requireAuth = expressjwt({ secret: JWT_SECRET, algorithms: ["HS256"] });
const prisma = new PrismaClient();

const app = express();
app.use(cors());
app.use(express.json());

const createJWT = (id: string) => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not set in .env");
  }
  return jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: "30d" });
};

app.post("/auth/sign-up", async (req, res) => {
  try {
    const { email, password, username } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: "This email is already registered" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const newUser = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
      },
    });

    const token = createJWT(newUser.id);

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        createdAt: newUser.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
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
        username: user.username,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/auth/me", requireAuth, async (req: JWTRequest, res) => {
  try {
    const id = req.auth!.sub!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/chats", requireAuth, async (req: JWTRequest, res) => {
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

app.post("/chats", requireAuth, async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { input } = req.body;

    const count = await prisma.chat.count({ where: { userId } });
    const title = `Chat ${count + 1}`;

    const assistantOutputText = await generateGPT([
      { role: "user", outputText: input },
    ]);

    const newChat = await prisma.chat.create({
      data: {
        title,
        userId,
        messages: {
          create: [
            { role: "user", outputText: input },
            { role: "assistant", outputText: assistantOutputText },
          ],
        },
      },
      include: { messages: true },
    });

    res.status(201).json({ chat: newChat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/chats/:chatId", requireAuth, async (req: JWTRequest, res) => {
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

app.delete("/chats/:chatId", requireAuth, async (req: JWTRequest, res) => {
  try {
    const id = req.params.chatId;
    const userId = req.auth!.sub!;
    await prisma.chat.delete({ where: { id, userId } });
    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post(
  "/chats/:chatId/messages",
  requireAuth,
  async (req: JWTRequest, res) => {
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

      const assistantOutputText = await generateGPT(context);

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
  }
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
