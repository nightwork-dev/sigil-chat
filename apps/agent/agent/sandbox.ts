import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";
import { microsandbox } from "eve/sandbox/microsandbox";

const networkPolicy = "deny-all" as const;

export default defineSandbox({
  backend: () => {
    if (process.env.SIGIL_SANDBOX_MODE === "disabled") {
      return justbash({ autoInstall: false });
    }
    return microsandbox({ networkPolicy, pullPolicy: "if-missing" });
  },
  description:
    "A persistent per-session workspace inside a network-isolated local VM.",
});
