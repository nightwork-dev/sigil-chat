import { describe, expect, it } from "vitest"

import { isAllowedUsername } from "./username-rules"
import {
  displayNameFromEmail,
  usernameFromEmail,
} from "./username-from-email"

describe("usernameFromEmail", () => {
  it("derives the sanitized, lowercased local-part", () => {
    expect(usernameFromEmail("David.Smith@example.com")).toBe("david.smith")
    expect(usernameFromEmail("user.name-1@corp.co")).toBe("user.name-1")
    expect(usernameFromEmail("JJ@x.io")).toBe("jj")
  })

  it("trims invalid leading/trailing chars and strips non-charset chars", () => {
    expect(usernameFromEmail("__weird__@x.co")).toBe("weird")
    expect(usernameFromEmail("é/foo@x.com")).toBe("foo")
  })

  it("falls back when the local-part has no usable characters", () => {
    expect(usernameFromEmail("+++@x.com")).toBe("user")
  })

  it("avoids reserved names by suffixing (setup form has no username field)", () => {
    expect(usernameFromEmail("admin@x.com")).toBe("admin1")
  })

  // The load-bearing invariant: a client-derived username MUST pass the server
  // validator, or signup fails with no field for the user to correct.
  it("ALWAYS produces a username the server validator accepts", () => {
    const emails = [
      "David.Smith@example.com",
      "a@b.com",
      "+++@x.com",
      "__weird__@x.co",
      "admin@x.com",
      "api@x.com",
      "system@x.com",
      "user.name-1@corp.co",
      "é/foo@x.com",
      "@nolocal.com",
    ]
    for (const email of emails) {
      expect(isAllowedUsername(usernameFromEmail(email))).toBe(true)
    }
  })
})

describe("displayNameFromEmail", () => {
  it("uses the raw local-part as an editable starting name", () => {
    expect(displayNameFromEmail("David.Smith@example.com")).toBe("David.Smith")
    expect(displayNameFromEmail("jj@x.io")).toBe("jj")
  })
})
