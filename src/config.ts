import "./env";

const getRequiredEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not set in environment variables`);
  }
  return value;
};

export const PORT = Number(process.env.PORT) || 3000;
export const JWT_SECRET = getRequiredEnv("JWT_SECRET");
export const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
export const PASSING_SCORE = 70;
