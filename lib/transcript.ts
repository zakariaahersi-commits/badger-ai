function tokenKey(value: string): string {
  return value.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function normalizeTranscript(value: unknown): string {
  if (typeof value !== "string") return "";
  const tokens = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!tokens.length) return "";

  // Speech engines sometimes return the same final phrase twice. Remove only
  // adjacent exact repeats, preferring the longest repeated phrase first.
  let changed = true;
  while (changed) {
    changed = false;
    for (let size = Math.min(10, Math.floor(tokens.length / 2)); size >= 1; size -= 1) {
      for (let index = 0; index + size * 2 <= tokens.length; index += 1) {
        const left = tokens.slice(index, index + size).map(tokenKey);
        const right = tokens.slice(index + size, index + size * 2).map(tokenKey);
        if (left.every((token, offset) => token && token === right[offset])) {
          tokens.splice(index + size, size);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return tokens.join(" ").replace(/\s+([,.;!?])/g, "$1").trim();
}

export function mergeTranscript(base: string, incoming: string, maxLength = 240): string {
  const cleanBase = normalizeTranscript(base);
  const cleanIncoming = normalizeTranscript(incoming);
  if (!cleanIncoming) return cleanBase.slice(0, maxLength);
  if (!cleanBase) return cleanIncoming.slice(0, maxLength);

  const baseTokens = cleanBase.split(/\s+/);
  const incomingTokens = cleanIncoming.split(/\s+/);
  let overlap = 0;
  const maxOverlap = Math.min(12, baseTokens.length, incomingTokens.length);
  for (let size = maxOverlap; size >= 1; size -= 1) {
    const tail = baseTokens.slice(-size).map(tokenKey);
    const head = incomingTokens.slice(0, size).map(tokenKey);
    if (tail.every((token, index) => token && token === head[index])) {
      overlap = size;
      break;
    }
  }

  return normalizeTranscript(`${cleanBase} ${incomingTokens.slice(overlap).join(" ")}`).slice(0, maxLength);
}
