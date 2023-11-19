export function normalizeArg(value) {
  if (!Number.isNaN(+value))
    // number
    return value;
  return `"${value}"`;
}
