import express from "express";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { expressjwt, Request as JWTRequest } from "express-jwt";

dotenv.config(); // load environment variables from a .env file into process.env
const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET as string;
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
    }

    const hashedPassword = await bcrypt.hash(password, 10);
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
    } else {
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
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/auth/me", requireAuth, async (req: JWTRequest, res) => {
  try {
    const id = req.auth?.sub;
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
