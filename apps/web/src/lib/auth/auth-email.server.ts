export interface AuthEmailConfig {
  apiKey: string
  from: string
}

interface AuthEmailMessage {
  email: string
  url: string
}

interface SendAuthEmailOptions {
  fetcher?: typeof fetch
  siteName: string
}

interface EmailContent {
  subject: string
  text: string
}

async function sendAuthEmail(
  config: AuthEmailConfig | undefined,
  message: AuthEmailMessage,
  content: EmailContent,
  fetcher: typeof fetch = fetch,
) {
  if (!config) {
    throw new Error(
      "Auth email delivery requires RESEND_API_KEY and SIGIL_AUTH_EMAIL_FROM.",
    )
  }

  const response = await fetcher("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: config.from,
      subject: content.subject,
      text: content.text,
      to: [message.email],
    }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  })

  if (!response.ok) {
    throw new Error(`Auth email delivery failed (${response.status}).`)
  }
}

export function sendMagicLinkEmail(
  config: AuthEmailConfig | undefined,
  message: AuthEmailMessage,
  options: SendAuthEmailOptions,
) {
  return sendAuthEmail(
    config,
    message,
    {
      subject: `Sign in to ${options.siteName}`,
      text: [
        `Use this link to sign in to ${options.siteName}:`,
        "",
        message.url,
        "",
        "This link expires in 15 minutes and can only be used once.",
      ].join("\n"),
    },
    options.fetcher,
  )
}

export function sendPasswordResetEmail(
  config: AuthEmailConfig | undefined,
  message: AuthEmailMessage,
  options: SendAuthEmailOptions,
) {
  return sendAuthEmail(
    config,
    message,
    {
      subject: `Reset your ${options.siteName} password`,
      text: [
        `Use this link to choose a new password for ${options.siteName}:`,
        "",
        message.url,
        "",
        "This link expires in 30 minutes and can only be used once.",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    },
    options.fetcher,
  )
}

export function sendVerificationEmail(
  config: AuthEmailConfig | undefined,
  message: AuthEmailMessage,
  options: SendAuthEmailOptions,
) {
  return sendAuthEmail(
    config,
    message,
    {
      subject: `Verify your email for ${options.siteName}`,
      text: [
        `Use this link to verify your email for ${options.siteName}:`,
        "",
        message.url,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    },
    options.fetcher,
  )
}
