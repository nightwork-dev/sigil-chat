import { describe, expect, it } from "vitest";

import {
  issueScopeDelegation,
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
});
