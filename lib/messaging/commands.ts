export type PilotCommand = "START" | "DONE" | "STUCK" | "TODAY" | "PLAN" | "PAUSE" | "RESUME" | "STOP";

export function messagingCommand(message: string): PilotCommand | null {
  const first = message.trim().split(/\s+/, 1)[0]?.toUpperCase();
  if (["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(first)) return "STOP";
  if (first === "START" || first === "DONE" || first === "STUCK" || first === "TODAY" || first === "PLAN" || first === "PAUSE" || first === "RESUME") return first;
  return null;
}

export function commandMessageBody(message: string, command: PilotCommand): string {
  return message.trim().replace(new RegExp(`^${command}\\b`, "i"), "").replace(/^\s*[-—:,.]?\s*/, "").trim();
}
