/**
 * A SCENE THAT HANGS IS A FAILURE THAT NAMES THE SCENE (docs/PROMPT25-LOG.md): the runner of the end-to-end suite gives each scene a time to finish. Without it a scene stuck in a call that never returns (a page that stopped answering,
 * a wait for something that will not happen) holds the whole job until the CI's own limit cuts it off an hour later, with nothing in the log that says which scene it was and without the scenes after it ever running.
 * The work is not cancelled by this (a promise cannot be): the runner closes the page afterwards, which makes every call the scene still has pending fail.
 */
export async function withDeadline<T>(what: string, ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not finish in ${ms / 1000} s: a scene that hangs is a failure`)), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}
