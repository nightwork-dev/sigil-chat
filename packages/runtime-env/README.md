# Sigil Chat runtime environment

This package is the typed boundary for the environment variables shared by the
Sigil Chat hosts. `./topology` contains browser-safe service and static-build
configuration. `./server` contains credentials, model selection, ports, and
storage paths and must not be imported by browser code.

Invalid values throw `RuntimeEnvironmentError` with stable `code`, `variable`,
and `detail` fields so CLIs and health checks can explain a repair.

The current Sigil doctor descriptor format validates literal variables and
literal service probe URLs; it does not interpolate environment variables into
probe URLs. The checked-in probe URLs therefore mirror the Portless defaults.
When descriptor interpolation lands, the probes should consume `EVE_ORIGIN` and
`GONK_MCP_URL` rather than repeating those defaults.
