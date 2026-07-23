import type { AuthContext } from "@gonk/auth"
import {
  archiveManagedSkill,
  createSkillRegistry,
  upsertManagedSkill,
  withSkillClientCommand,
} from "@workspace/agent-tools/skills"
import { readDataEnvironment } from "@workspace/runtime-env/server"

import { getSession, requireOwner } from "./auth/session"
import type {
  SkillChangeResult,
  SkillDeleteInput,
  SkillGetInput,
  SkillListInput,
  SkillUpsertInput,
} from "./skills"

const skillRegistry = createSkillRegistry(
  readDataEnvironment(process.env).skillsDir,
)

export async function listManagedSkills(input: SkillListInput) {
  requireOwner(await getSession())
  return skillRegistry.list(input)
}

export async function getManagedSkill(input: SkillGetInput) {
  requireOwner(await getSession())
  return skillRegistry.get(input)
}

export async function upsertManagedSkillFromWeb(
  input: SkillUpsertInput,
): Promise<SkillChangeResult> {
  const auth = await ownerAuthContext()
  const result = await upsertManagedSkill(skillRegistry, input, auth)
  return result.status === "ok"
    ? withSkillClientCommand(result, "skill.upsert", input.id)
    : result
}

export async function deleteManagedSkillFromWeb(
  input: SkillDeleteInput,
): Promise<SkillChangeResult> {
  const auth = await ownerAuthContext()
  const result = await archiveManagedSkill(skillRegistry, input, auth)
  return result.status === "ok"
    ? withSkillClientCommand(result, "skill.delete", input.id)
    : result
}

async function ownerAuthContext(): Promise<AuthContext> {
  const session = await getSession()
  requireOwner(session)
  return {
    principal: {
      id: session.user.id,
      kind: "human",
      identity: {
        issuer: "sigil-chat",
        subject: session.user.id,
        method: "session",
      },
      roles: ["owner"],
      scopes: ["global"],
    },
    authorize: () => ({
      outcome: "allow",
      policyId: "sigil-web-owner-skills-v1",
      reason: "The authenticated owner may manage application skills",
    }),
  }
}
