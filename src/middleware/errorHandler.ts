import { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "express-jwt";

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof UnauthorizedError) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
