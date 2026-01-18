import bcrypt from "bcrypt";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { expressjwt, Request as JWTRequest } from "express-jwt";
import jwt from "jsonwebtoken";
import { GoalStatus, PrismaClient } from "@prisma/client";
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
    const { email, password, displayName } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const username = normalizedEmail.split("@")[0] || normalizedEmail;
    const trimmedDisplayName =
      typeof displayName === "string" ? displayName.trim() : "";

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      res.status(400).json({ message: "This email is already registered" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        username,
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
        username: newUser.username,
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

app.post("/auth/sign-in", async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
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

app.get("/auth/me", requireAuth, async (req: JWTRequest, res) => {
  try {
    const id = req.auth!.sub!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
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

app.patch("/auth/me", requireAuth, async (req: JWTRequest, res) => {
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
        username: user.username,
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

app.delete("/auth/me", requireAuth, async (req: JWTRequest, res) => {
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

app.get("/goals", requireAuth, async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({ goals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/goals", requireAuth, async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { title, notes } = req.body as { title?: string; notes?: string };

    const trimmedTitle = (title || "").trim();
    const trimmedNotes = notes?.trim();

    if (!trimmedTitle) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const goal = await prisma.goal.create({
      data: {
        title: trimmedTitle,
        notes: trimmedNotes || null,
        status: GoalStatus.todo,
        userId,
      },
    });

    res.status(201).json({ goal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/goals/:goalId", requireAuth, async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { goalId } = req.params;
    const { title, notes, status } = req.body as {
      title?: string;
      notes?: string;
      status?: GoalStatus;
    };

    const existing = await prisma.goal.findFirst({
      where: { id: goalId, userId },
    });

    if (!existing) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    const updates: Record<string, unknown> = {};

    if (title !== undefined) {
      const trimmed = title.trim();
      if (!trimmed) {
        res.status(400).json({ error: "Title cannot be empty" });
        return;
      }
      updates.title = trimmed;
    }

    if (notes !== undefined) {
      const trimmedNotes = notes.trim();
      updates.notes = trimmedNotes ? trimmedNotes : null;
    }

    if (status !== undefined) {
      if (![GoalStatus.todo, GoalStatus.done].includes(status)) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }
      updates.status = status;
    }

    const goal = await prisma.goal.update({
      where: { id: goalId },
      data: updates,
    });

    res.status(200).json({ goal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/goals/:goalId", requireAuth, async (req: JWTRequest, res) => {
  try {
    const userId = req.auth!.sub!;
    const { goalId } = req.params;

    const existing = await prisma.goal.findFirst({
      where: { id: goalId, userId },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    await prisma.goal.delete({ where: { id: goalId } });
    res.sendStatus(204);
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tutorInstructions: true, displayName: true, username: true },
    });
    const nameForTutor = user?.displayName?.trim() || user?.username;

    const assistantOutputText = await generateGPT(
      [{ role: "user", outputText: input }],
      user?.tutorInstructions,
      nameForTutor
    );

    const newChat = await prisma.chat.create({
      data: {
        title: input.slice(0, 30),
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

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { tutorInstructions: true, displayName: true, username: true },
      });
      const nameForTutor = user?.displayName?.trim() || user?.username;

      const assistantOutputText = await generateGPT(
        context,
        user?.tutorInstructions,
        nameForTutor
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
  }
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
