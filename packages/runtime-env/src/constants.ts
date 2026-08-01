// Reserved identifiers shared by server config resolution and client surfaces.
//
// This entry point is deliberately free of Node imports and of every type that
// would drag one in: it holds bare constants only, so a browser bundle can
// import the same value the server resolver uses instead of re-declaring it.

/** Reserved id for the preset synthesized from `agent.model`. */
export const DEPLOYMENT_DEFAULT_PRESET_ID = "deployment-default"

/** Reserved provider id for that synthesized entry. */
export const DEPLOYMENT_DEFAULT_PROVIDER_ID = "deployment"
