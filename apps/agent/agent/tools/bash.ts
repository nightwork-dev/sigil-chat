import { always } from "eve/tools/approval";
import { disableTool } from "eve/tools";
import { bash } from "eve/tools/defaults";

export default process.env.SIGIL_SANDBOX_MODE === "disabled" ? disableTool() : {
  ...bash,
  approval: always(),
  description:
    "Run a command inside this session's persistent, network-isolated VM workspace.",
};
