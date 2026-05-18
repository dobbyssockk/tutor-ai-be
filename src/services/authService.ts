import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { BCRYPT_SALT_ROUNDS, JWT_SECRET } from "../config";
import prisma from "../db/prisma";

export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  tutorInstructions: string | null;
  createdAt: Date;
};

export type SignUpResult =
  | { kind: "email_invalid" }
  | { kind: "password_too_short" }
  | { kind: "email_taken" }
  | { kind: "ok"; token: string; user: PublicUser };

export type SignInResult =
  | { kind: "credentials_required" }
  | { kind: "invalid_credentials" }
  | { kind: "ok"; token: string; user: PublicUser };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const normalizeEmail = (value: unknown) =>
  normalizeString(value).toLowerCase();

export const normalizeOptionalString = (value: unknown) => {
  if (value === undefined) return undefined;
  const trimmed = normalizeString(value);
  return trimmed || null;
};

export const toPublicUser = (user: PublicUser): PublicUser => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  tutorInstructions: user.tutorInstructions,
  createdAt: user.createdAt,
});

export const createJWT = (id: string) =>
  jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: "30d" });

export const signUp = async (
  email: unknown,
  password: unknown,
  displayName: unknown
): Promise<SignUpResult> => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = typeof password === "string" ? password : "";
  const trimmedDisplayName = normalizeString(displayName);

  if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
    return { kind: "email_invalid" };
  }
  if (normalizedPassword.length < 6) {
    return { kind: "password_too_short" };
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { kind: "email_taken" };
  }

  const hashedPassword = await bcrypt.hash(normalizedPassword, BCRYPT_SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      displayName: trimmedDisplayName || null,
      password: hashedPassword,
    },
  });

  return { kind: "ok", token: createJWT(user.id), user: toPublicUser(user) };
};

export const signIn = async (
  email: unknown,
  password: unknown
): Promise<SignInResult> => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = typeof password === "string" ? password : "";

  if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail) || !normalizedPassword) {
    return { kind: "credentials_required" };
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !(await bcrypt.compare(normalizedPassword, user.password))) {
    return { kind: "invalid_credentials" };
  }

  return { kind: "ok", token: createJWT(user.id), user: toPublicUser(user) };
};

export const getMe = async (userId: string): Promise<PublicUser> => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toPublicUser(user);
};

export const updateMe = async (
  userId: string,
  data: { tutorInstructions?: string | null; displayName?: string | null }
): Promise<PublicUser> => {
  const updateData: { tutorInstructions?: string | null; displayName?: string | null } = {};

  if (data.tutorInstructions !== undefined) {
    updateData.tutorInstructions = normalizeOptionalString(data.tutorInstructions);
  }
  if (data.displayName !== undefined) {
    updateData.displayName = normalizeOptionalString(data.displayName);
  }

  const user = await prisma.user.update({ where: { id: userId }, data: updateData });
  return toPublicUser(user);
};

export const deleteMe = async (userId: string): Promise<boolean> => {
  const result = await prisma.user.deleteMany({ where: { id: userId } });
  return result.count > 0;
};
