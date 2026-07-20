import { always } from "eve/tools/approval";
import { disableTool } from "eve/tools";
import { writeFile } from "eve/tools/defaults";

export default process.env.SIGIL_SANDBOX_MODE === "disabled" ? disableTool() : {
  ...writeFile,
  approval: always(),
  description: `Write a file inside this session's persistent VM workspace.\n\n${writeFile.description}`,
};
