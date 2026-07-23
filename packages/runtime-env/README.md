# Sigil Chat runtime environment

This package is the typed boundary for the environment variables shared by the
Sigil Chat hosts. `./topology` contains browser-safe service and static-build
configuration. `./server` contains secret-file and storage-path readers and
must not be imported by browser code.

Invalid values throw `RuntimeEnvironmentError` with stable `code`, `variable`,
and `detail` fields so CLIs and health checks can explain a repair.

`SIGIL_DATA_DIR` also owns the shared managed-skill substrate at `skills/`.
Both the web host and Eve resolve Gonk's skill tiers from that directory, so
separate processes and containers observe the same lifecycle state.

The current Sigil doctor descriptor format validates literal variables and
literal service probe URLs; it does not interpolate environment variables into
probe URLs. The checked-in probe URLs therefore mirror the Portless defaults.
When descriptor interpolation lands, the agent probe should consume
`EVE_ORIGIN` rather than repeating its default.
