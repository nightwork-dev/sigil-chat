export type LoginAction = "magic-link" | "password" | "provider"

export interface LoginFeedback {
  message: string
  tone: "error" | "success"
}

export function loginErrorFeedback(
  status: number | undefined,
  action: LoginAction,
): LoginFeedback {
  if (status === 429) {
    return {
      message: "Too many sign-in attempts. Wait one minute, then try again.",
      tone: "error",
    }
  }

  return {
    message:
      action === "password"
        ? "Incorrect email or password."
        : action === "magic-link"
          ? "We couldn't send a sign-in link. Try again later or use your password."
          : "We couldn't complete that provider sign-in. Try again or use another method.",
    tone: "error",
  }
}
