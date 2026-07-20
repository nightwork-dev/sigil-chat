import { always } from "eve/tools/approval";
import { writeFile } from "eve/tools/defaults";

export default {
  ...writeFile,
  approval: always(),
  description: `Write a file inside this session's persistent VM workspace.\n\n${writeFile.description}`,
};
