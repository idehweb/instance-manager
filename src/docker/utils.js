export function normalizeArg(value) {
  if (!Number.isNaN(+value))
    // number
    return value;
  return `"${value}"`;
}
export function getInstanceName(instance) {
  return `nwi-${instance.name}`;
}
