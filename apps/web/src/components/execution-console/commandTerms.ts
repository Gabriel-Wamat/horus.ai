export function splitCommandTerms(value: string): string[] {
  const terms: string[] = [];
  let current = "";
  for (const char of value.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLowercaseAscii = code >= 97 && code <= 122;
    if (isDigit || isLowercaseAscii) {
      current += char;
      continue;
    }
    if (current) {
      terms.push(current);
      current = "";
    }
  }
  if (current) terms.push(current);
  return terms;
}

export function isRepairCommandId(commandId: string): boolean {
  const terms = splitCommandTerms(commandId);
  return (
    terms.some((term) => term === "install" || term === "setup") &&
    terms.some((term) =>
      ["dep", "deps", "dependencies", "package", "packages", "requirements"].includes(
        term
      )
    )
  );
}
