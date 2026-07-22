export class DevelopmentReadinessError extends Error {
  constructor(code, message, { remediation, retryable = true } = {}) {
    super(message);
    this.name = "DevelopmentReadinessError";
    this.code = code;
    this.remediation = remediation;
    this.retryable = retryable;
  }
}

export async function checkDevelopmentReadiness({
  credentials,
  fetcher = fetch,
  topology,
}) {
  await checkWebReadiness({ fetcher, topology });
  const session = await createDevelopmentAuthSession({
    credentials,
    fetcher,
    topology,
  });
  await checkAuthenticatedServices({
    fetcher,
    session,
    topology,
  });
  return { status: "ready" };
}

async function checkWebReadiness({ fetcher, topology }) {
  await expectOk(
    fetcher(new URL("/healthz", topology.webOrigin), requestOptions()),
    "WEB_UNHEALTHY",
    "Web and account storage are not ready.",
  );
}

async function createDevelopmentAuthSession({
  credentials,
  fetcher,
  topology,
}) {
  const signIn = await expectOk(
    fetcher(
      new URL("/api/auth/sign-in/email", topology.webOrigin),
      requestOptions({
        body: JSON.stringify(credentials),
        headers: {
          "content-type": "application/json",
          origin: topology.webOrigin,
        },
        method: "POST",
      }),
    ),
    "OWNER_SIGN_IN_FAILED",
    "The seeded development owner could not sign in.",
    {
      remediation: "Run pnpm dev:reset to create a fresh local owner.",
      retryableStatus: isTransientHttpStatus,
    },
  );
  const cookie = responseCookies(signIn.headers)
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  if (!cookie) {
    throw new DevelopmentReadinessError(
      "OWNER_SESSION_MISSING",
      "The development owner signed in without receiving a session cookie.",
      {
        remediation:
          "Run pnpm dev:reset to rebuild local authentication state.",
        retryable: false,
      },
    );
  }

  const tokenResponse = await expectOk(
    fetcher(
      new URL("/api/auth/token", topology.webOrigin),
      requestOptions({ headers: { cookie } }),
    ),
    "EVE_TOKEN_FAILED",
    "The web session could not mint an Eve bearer token.",
    {
      remediation: "Run pnpm dev:reset to rebuild local authentication state.",
      retryableStatus: isTransientHttpStatus,
    },
  );
  const tokenPayload = await tokenResponse.json();
  const eveToken = tokenPayload?.token;
  if (typeof eveToken !== "string" || !eveToken) {
    throw new DevelopmentReadinessError(
      "EVE_TOKEN_INVALID",
      "The web session returned an invalid Eve bearer token.",
      { retryable: false },
    );
  }
  return { eveToken };
}

async function checkAuthenticatedServices({
  fetcher,
  session,
  topology,
}) {
  const authorization = { authorization: `Bearer ${session.eveToken}` };
  await expectOk(
    fetcher(
      new URL("/sigil/v1/readiness", topology.eveOrigin),
      requestOptions({ headers: authorization }),
    ),
    "EVE_UNHEALTHY",
    "Eve or the local Codex model session is not ready.",
    {
      remediation:
        "Run codex login status, then inspect explicit Eve auth overrides in .env.",
      retryableStatus: isTransientHttpStatus,
    },
  );

  const infoResponse = await expectOk(
    fetcher(
      new URL("/eve/v1/info", topology.eveOrigin),
      requestOptions({ headers: authorization }),
    ),
    "EVE_CATALOG_UNAVAILABLE",
    "Eve could not return its authenticated capability catalog.",
    {
      remediation: "Inspect explicit Eve auth overrides in .env.",
      retryableStatus: isTransientHttpStatus,
    },
  );
  const info = await infoResponse.json();
  if (!hasNativeGonkTools(info?.dynamic)) {
    throw new DevelopmentReadinessError(
      "GONK_TOOLS_MISSING",
      "Eve is running but its native Sigil Chat tools are unavailable.",
    );
  }
}

export async function waitForDevelopmentReadiness(
  options,
  { delay = wait, intervalMs = 500, timeoutMs = 60_000 } = {},
) {
  const resolvedOptions = { fetcher: fetch, ...options };
  const deadline = Date.now() + timeoutMs;
  await retryUntilReady(
    () => checkWebReadiness(resolvedOptions),
    deadline,
    delay,
    intervalMs,
  );
  const session = await retryUntilReady(
    () => createDevelopmentAuthSession(resolvedOptions),
    deadline,
    delay,
    intervalMs,
  );
  await retryUntilReady(
    () => checkAuthenticatedServices({ ...resolvedOptions, session }),
    deadline,
    delay,
    intervalMs,
  );
  return { status: "ready" };
}

async function retryUntilReady(operation, deadline, delay, intervalMs) {
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DevelopmentReadinessError && !error.retryable) {
        throw error;
      }
      lastError = error;
      await delay(intervalMs);
    }
  }
  throw (
    lastError ??
    new DevelopmentReadinessError(
      "STARTUP_TIMEOUT",
      "Sigil Chat did not become ready before the startup deadline.",
    )
  );
}

async function expectOk(
  responsePromise,
  code,
  message,
  { remediation, retryable = true, retryableStatus } = {},
) {
  let response;
  try {
    response = await responsePromise;
  } catch {
    throw new DevelopmentReadinessError(code, message, {
      remediation,
      retryable,
    });
  }
  if (!response.ok) {
    throw new DevelopmentReadinessError(
      code,
      `${message} HTTP ${response.status}.`,
      {
        remediation,
        retryable: retryableStatus?.(response.status) ?? retryable,
      },
    );
  }
  return response;
}

function isTransientHttpStatus(status) {
  return status === 404 || status === 408 || status === 429 || status >= 500;
}

function requestOptions(options = {}) {
  return {
    ...options,
    signal: AbortSignal.timeout(5_000),
  };
}

function responseCookies(headers) {
  return (
    headers.getSetCookie?.() ??
    (headers.get("set-cookie") ? [headers.get("set-cookie")] : [])
  );
}

function hasNativeGonkTools(dynamicResolvers) {
  if (!Array.isArray(dynamicResolvers)) return false;
  return dynamicResolvers.some(
    (resolver) =>
      resolver?.id === "sigil-gonk-tools" &&
      resolver.trigger === "step.started",
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
