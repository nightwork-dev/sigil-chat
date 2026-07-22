export interface MagicLinkEmailConfig {
  apiKey: string
  from: string
}

interface MagicLinkMessage {
  email: string
  url: string
}

interface SendMagicLinkOptions {
  fetcher?: typeof fetch
  siteName: string
}

export async function sendMagicLinkEmail(
  config: MagicLinkEmailConfig | undefined,
  message: MagicLinkMessage,
  options: SendMagicLinkOptions,
) {
  if (!config) {
    throw new Error(
      "Magic-link delivery requires RESEND_API_KEY and SIGIL_AUTH_EMAIL_FROM.",
    )
  }

  const fetcher = options.fetcher ?? fetch
  const response = await fetcher("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: config.from,
      subject: `Sign in to ${options.siteName}`,
      text: [
        `Use this link to sign in to ${options.siteName}:`,
        "",
        message.url,
        "",
        "This link expires in 15 minutes and can only be used once.",
      ].join("\n"),
      to: [message.email],
    }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  })

  if (!response.ok) {
    throw new Error(`Magic-link email delivery failed (${response.status}).`)
  }
}
