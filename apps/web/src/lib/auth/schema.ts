export const authUserAdditionalFields = {
  role: {
    defaultValue: "member",
    input: false,
    required: true,
    type: ["owner", "member"] as ["owner", "member"],
  },
}
