import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";
import { microsandbox } from "eve/sandbox/microsandbox";

const networkPolicy = "deny-all" as const;
const sandboxDisabled = process.env.SIGIL_SANDBOX_MODE === "disabled";

export default defineSandbox({
  backend: () => {
    if (sandboxDisabled) {
      return justbash({ autoInstall: false });
    }
    return microsandbox({ networkPolicy, pullPolicy: "if-missing" });
  },
  description: sandboxDisabled
    ? "A non-executable virtual workspace; production shell and write tools are disabled."
    : "A persistent per-session workspace inside a network-isolated local VM.",
});
