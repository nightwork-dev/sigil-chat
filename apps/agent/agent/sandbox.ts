import { defineSandbox } from "eve/sandbox";
import { microsandbox } from "eve/sandbox/microsandbox";

const networkPolicy = "deny-all" as const;

export default defineSandbox({
  backend: () =>
    microsandbox({
      networkPolicy,
      pullPolicy: "if-missing",
    }),
  description:
    "A persistent per-session workspace inside a network-isolated local VM.",
  async onSession({ use }) {
    await use({ networkPolicy });
  },
});
