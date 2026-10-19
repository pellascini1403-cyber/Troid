import { describe, expect, it } from 'vitest';
import { readBody } from '@/assets/artIO';

/**
 * HOW MANY BYTES OF AN IMAGE HAVE ARRIVED (docs/PROMPT13-LOG.md): the loading indicator's percentage is made of what the responses carry, never of a guess. `readBody` reads a response's body and
 * says how much of it has come as it does — when the response says how big it is and the bytes it carries are the bytes it counts; otherwise it says nothing until the end.
 */
function respond(chunks: number[][], headers: Record<string, string>): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new Uint8Array(c));
      controller.close();
    },
  });
  return new Response(stream, { headers });
}

describe('reading a body and saying how much of it has arrived', () => {
  it('reports the real bytes chunk by chunk when the response says how big it is, and returns the whole body', async () => {
    const seen: Array<[number, number]> = [];
    const blob = await readBody(respond([[1, 2, 3, 4], [5, 6, 7, 8, 9, 10]], { 'content-length': '10', 'content-type': 'image/png' }), (l, t) => seen.push([l, t]));
    expect(seen).toEqual([[0, 10], [4, 10], [10, 10]]);
    expect(blob.size).toBe(10);
    expect(blob.type).toBe('image/png');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('with no size in the response it cannot say how much has come: it reads the body whole and says so once, at the end', async () => {
    const seen: Array<[number, number]> = [];
    const blob = await readBody(respond([[1, 2], [3]], {}), (l, t) => seen.push([l, t]));
    expect(seen).toEqual([[3, 3]]);
    expect(blob.size).toBe(3);
  });

  it('a body the server compressed on the way is counted in other units than the size it announces: no per-chunk numbers are given', async () => {
    const seen: Array<[number, number]> = [];
    const blob = await readBody(respond([[1, 2, 3, 4, 5, 6]], { 'content-length': '3', 'content-encoding': 'gzip' }), (l, t) => seen.push([l, t]));
    expect(seen).toEqual([[6, 6]]);
    expect(blob.size).toBe(6);
  });

  it('never reports more than the size it announced', async () => {
    const seen: Array<[number, number]> = [];
    await readBody(respond([[1, 2, 3, 4, 5, 6]], { 'content-length': '4' }), (l, t) => seen.push([l, t]));
    expect(seen.every(([l, t]) => l <= t)).toBe(true);
  });

  it('asked for nothing it just returns the body', async () => {
    const blob = await readBody(respond([[1, 2, 3]], { 'content-length': '3' }));
    expect(blob.size).toBe(3);
  });
});
