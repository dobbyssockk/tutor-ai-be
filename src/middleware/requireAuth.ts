import { expressjwt } from "express-jwt";

import { JWT_SECRET } from "../config";

export const requireAuth = expressjwt({
  secret: JWT_SECRET,
  algorithms: ["HS256"],
});
