import { always } from "eve/tools/approval";
import { bash } from "eve/tools/defaults";

export default {
  ...bash,
  approval: always(),
  description:
    "Run a command inside this session's persistent, network-isolated VM workspace.",
};
