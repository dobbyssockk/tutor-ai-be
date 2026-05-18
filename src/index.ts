import cors from "cors";
import express from "express";

import { CORS_ORIGIN, PORT } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import assessmentsRoutes from "./routes/assessments";
import chatsRoutes from "./routes/chats";
import goalsRoutes from "./routes/goals";

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/assessments", assessmentsRoutes);
app.use("/chats", chatsRoutes);
app.use("/goals", goalsRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
