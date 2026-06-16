const RESERVED_WINDOWS_NAMES = new Set([
  "aux",
  "con",
  "nul",
  "prn",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

export interface PortableSlugOptions {
  fallback: string;
  maxLength?: number;
}

export function toPortableSlug(
  value: string,
  { fallback, maxLength = 48 }: PortableSlugOptions
): string {
  const normalized = value.toLowerCase().normalize("NFD");
  let slug = "";
  let previousWasSeparator = false;

  for (const char of normalized) {
    if (isCombiningMark(char)) continue;
    if (isAsciiLetter(char) || isDigit(char)) {
      slug += char;
      previousWasSeparator = false;
      continue;
    }
    if (!previousWasSeparator && slug.length > 0) {
      slug += "-";
      previousWasSeparator = true;
    }
  }

  slug = trimHyphens(slug).slice(0, maxLength);
  slug = trimHyphens(slug);

  const candidate = slug || fallback;
  if (RESERVED_WINDOWS_NAMES.has(candidate)) {
    return `${candidate}-folder`;
  }
  return candidate;
}

function trimHyphens(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "-") start += 1;
  while (end > start && value[end - 1] === "-") end -= 1;
  return value.slice(start, end);
}

function isCombiningMark(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x0300 && code <= 0x036f;
}

function isAsciiLetter(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}
