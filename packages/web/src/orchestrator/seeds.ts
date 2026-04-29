export function deriveSeed(master: bigint, cellIndex: number, runIndex: number): bigint {
  const a = master ^ (BigInt(cellIndex) * 0x9e3779b97f4a7c15n);
  const b = a ^ (BigInt(runIndex) * 0xbf58476d1ce4e5b9n);
  return b & 0xffffffffffffffffn;
}
