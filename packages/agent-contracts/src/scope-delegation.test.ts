import { describe, expect, it } from "vitest";

import {
  issueScopeDelegation,
  readScopeDelegation,
  verifyScopeDelegation,
} from "./scope-delegation.server";

const SECRET = "test-only-scope-delegation-secret";

describe("agent scope delegation", () => {
  it("binds the proof to its principal, scope, and expiry", () => {
    const proof = issueScopeDelegation(
      { expiresAt: 200, scope: "session:thread-1", subject: "user-1" },
      SECRET,
    );

    expect(
      verifyScopeDelegation(
        proof,
        { now: 199, scope: "session:thread-1", subject: "user-1" },
        SECRET,
      ),
    ).toBe(true);
    expect(
      verifyScopeDelegation(
        proof,
        { now: 199, scope: "session:thread-2", subject: "user-1" },
        SECRET,
      ),
    ).toBe(false);
    expect(
      verifyScopeDelegation(
        proof,
        { now: 199, scope: "session:thread-1", subject: "user-2" },
        SECRET,
      ),
    ).toBe(false);
    expect(
      verifyScopeDelegation(
        proof,
        { now: 200, scope: "session:thread-1", subject: "user-1" },
        SECRET,
      ),
    ).toBe(false);
  });

  it("rejects tampering and malformed tokens", () => {
    const proof = issueScopeDelegation(
      { expiresAt: 200, scope: "session:thread-1", subject: "user-1" },
      SECRET,
    );
    const expected = {
      now: 100,
      scope: "session:thread-1",
      subject: "user-1",
    };

    expect(verifyScopeDelegation(`${proof}x`, expected, SECRET)).toBe(false);
    expect(verifyScopeDelegation("not-a-token", expected, SECRET)).toBe(false);
  });

  it("returns a signed subject only after integrity and expiry validation", () => {
    const proof = issueScopeDelegation(
      { expiresAt: 200, scope: "workspace:launch", subject: "user-1" },
      SECRET,
    );

    expect(readScopeDelegation(proof, 199, SECRET)).toMatchObject({
      scope: "workspace:launch",
      subject: "user-1",
    });
    expect(readScopeDelegation(proof, 200, SECRET)).toBeUndefined();
    expect(readScopeDelegation(`${proof}x`, 199, SECRET)).toBeUndefined();
  });

  it("cryptographically binds an optional Eve actor session", () => {
    const proof = issueScopeDelegation(
      {
        actorSessionId: "eve-session-1",
        expiresAt: 200,
        scope: "workspace:launch",
        subject: "user-1",
      },
      SECRET,
    );

    expect(readScopeDelegation(proof, 199, SECRET)).toMatchObject({
      actorSessionId: "eve-session-1",
      scope: "workspace:launch",
      subject: "user-1",
    });

    const [encoded, signature] = proof.split(".");
    const payload = JSON.parse(
      Buffer.from(encoded!, "base64url").toString("utf8"),
    );
    payload.actorSessionId = "eve-session-2";
    const tampered = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
    expect(readScopeDelegation(tampered, 199, SECRET)).toBeUndefined();
  });
});
