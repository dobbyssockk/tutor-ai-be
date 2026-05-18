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
export const OPENAI_API_KEY = getRequiredEnv("OPENAI_API_KEY");
export const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
export const EXPOSE_CORRECT_ANSWERS =
  process.env.EXPOSE_CORRECT_ANSWERS === "true";
const parsedAssessmentQuestionCount = Number(
  process.env.ASSESSMENT_QUESTION_COUNT
);
export const ASSESSMENT_QUESTION_COUNT =
  Number.isInteger(parsedAssessmentQuestionCount) &&
  parsedAssessmentQuestionCount > 0
    ? parsedAssessmentQuestionCount
    : 12;
const parsedPassingScore = Number(process.env.PASSING_SCORE);
export const PASSING_SCORE =
  Number.isInteger(parsedPassingScore) && parsedPassingScore > 0
    ? parsedPassingScore
    : 70;

export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
