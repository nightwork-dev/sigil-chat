// Server-side persistence for the installation settings tier (MDL.2).
//
// Backed by the Gonk KV store at the `project` tier rather than the auth
// libsql database, for one decisive reason: the consumer that must not be
// bypassable — `resolveSelectableModelPreset`, which runs synchronously inside
// thread creation — cannot await, and this store is synchronous while the auth
// database is not. It is also the repo's established home for deployment-global
// server-owned records (agent threads, context receipts, scope registries all
// live at `store.kv("project", …)`), whereas the auth database holds identity
// rows.
//
// Reads are open to any principal because the server evaluates policy on
// everyone's behalf; writes are gated on the owner one layer up, in
// ../model-enablement.server.ts. Nothing in this file authorizes anything —
// it validates and persists.
//
// CONCURRENCY, accepted (Annika's review, 2026-07-31): a write is
// read-then-write over a whole value with no version stamp. Within one Node
// process that is safe — every call here is synchronous, so run-to-completion
// prevents interleaving. Across replicas it is last-write-wins, and two owners
// toggling at the same moment could lose one update with nothing to detect the
// collision. Accepted because this deployment is single-instance; the fix if
// that changes is per-entry keys or a revision column, not a lock, since the
// KV interface has no compare-and-swap to build one on.

import { createScope } from "@gonk/scope"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import type { KvStore } from "@gonk/store/types"

import {
  getInstallationSettingDefinition,
  type InstallationSettingKey,
  type InstallationSettingValue,
} from "./registry"

const NAMESPACE = "sigil-chat.installation-settings.v1"

export class InstallationSettingRejectedError extends Error {
  readonly status = 400

  constructor(key: string) {
    super(`Invalid value for installation setting "${key}"`)
    this.name = "InstallationSettingRejectedError"
  }
}

export interface InstallationSettingsStoreOptions {
  /** Inject a store for tests; production resolves the project-tier KV. */
  kv?: KvStore<unknown>
}

export class InstallationSettingsStore {
  private readonly kv: KvStore<unknown>

  constructor(options: InstallationSettingsStoreOptions = {}) {
    if (options.kv) {
      this.kv = options.kv
      return
    }
    const scope = createScope({ cwd: process.cwd() })
    this.kv = createStoreProvider(scope, {
      backendFactory: mirkBackendFactory(scope),
    }).kv("project", NAMESPACE)
  }

  /**
   * The stored value, or the registered default.
   *
   * A stored value that no longer validates reads as the default rather than
   * throwing: this runs on the session-creation path, and the safe answer to
   * "which models did the owner enable" when the record is unreadable is
   * "none", not "fail every new chat".
   */
  get<K extends InstallationSettingKey>(key: K): InstallationSettingValue<K> {
    const definition = getInstallationSettingDefinition(key)
    const stored = this.kv.get(key)
    return definition.isValid(stored) ? stored : definition.defaultValue
  }

  set<K extends InstallationSettingKey>(
    key: K,
    value: InstallationSettingValue<K>,
  ): void {
    const definition = getInstallationSettingDefinition(key)
    if (!definition.isValid(value)) {
      throw new InstallationSettingRejectedError(key)
    }
    this.kv.set(key, value)
  }
}

let shared: InstallationSettingsStore | undefined

/** The process-wide store. Constructed lazily so importing this file is cheap. */
export function installationSettings(): InstallationSettingsStore {
  shared ??= new InstallationSettingsStore()
  return shared
}
