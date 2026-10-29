/** Keeps applet read concurrency below the document RPC limit. */
export async function readInBatches<T, R>(items: readonly T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = [];
  for (let offset = 0; offset < items.length; offset += 8) {
    result.push(...await Promise.all(items.slice(offset, offset + 8).map(read)));
  }
  return result;
}
