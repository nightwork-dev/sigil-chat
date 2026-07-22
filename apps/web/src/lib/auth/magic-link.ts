import { createServerFn } from "@tanstack/react-start"

import { readAuthEnvironment } from "./env"

export const fetchMagicLinkAvailability = createServerFn({
  method: "GET",
}).handler((): boolean => {
  return readAuthEnvironment().magicLinkEmail !== undefined
})
