/**
 * BullMQ v5 custom IDs cannot contain ":".
 * Keep auxiliary queue IDs readable while remaining valid.
 */
export function buildBullJobId(prefix: string, ...parts: Array<string | number>): string {
  return [prefix, ...parts].join("-");
}
