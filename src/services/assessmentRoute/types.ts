export type AttemptQuestionView = {
  id: string;
  prompt: string;
  options: string[];
  correctAnswer?: string;
};

export type AttemptResponse = {
  id: string;
  assessmentId: string;
  questions: AttemptQuestionView[];
  totalCount: number;
  createdAt: Date;
};

export type StartAssessmentAttemptResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "no_questions" }
  | { kind: "success"; attempt: AttemptResponse };

export type GetAssessmentAttemptResult =
  | { kind: "not_found" }
  | { kind: "success"; attempt: AttemptResponse };

export type SubmitAssessmentAttemptResult =
  | { kind: "invalid_answers" }
  | { kind: "not_found" }
  | {
      kind: "success";
      attempt: {
        id: string;
        assessmentId: string;
        score: number;
        correctCount: number;
        totalCount: number;
        completedAt: Date | null;
      };
      chatId: string | null;
      mistakesCount: number;
    };

export type AttemptReviewItem = {
  id: string;
  prompt: string;
  options: string[];
  correctAnswer: string;
  userAnswer: string;
  isCorrect: boolean;
  explanation: string | null;
};

export type GetAssessmentAttemptDetailsResult =
  | { kind: "not_found" }
  | { kind: "not_completed" }
  | {
      kind: "success";
      result: {
        attemptId: string;
        assessmentId: string;
        score: number;
        correctCount: number;
        totalCount: number;
        completedAt: Date;
        chatId: string | null;
        mistakesCount: number;
        goalId: string | null;
        goalTopicId: string | null;
        review: AttemptReviewItem[];
      };
    };

export type CreateAttemptReviewChatResult =
  | { kind: "not_found" }
  | { kind: "not_completed" }
  | { kind: "success"; chatId: string; created: boolean };
