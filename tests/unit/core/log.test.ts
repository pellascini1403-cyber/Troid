import { describe, expect, it } from 'vitest';
import { describeError } from '@/core/log';

/**
 * AN ERROR AS A TEXT THAT SAYS WHY (docs/PROMPT20-LOG.md §6): Chromium's `stack` begins with the name and the message; Firefox's and Safari's list only the places. A frame that failed in Firefox (found by running the
 * game in it) was reported as a list of functions and nothing else — so what the log writes must carry the message whichever engine made the error.
 */
const withStack = (error: Error, stack: string | undefined): Error => {
  Object.defineProperty(error, 'stack', { value: stack, configurable: true });
  return error;
};

describe('describeError', () => {
  it('Chromium: a stack that begins with the name and the message is written as it is (nothing twice)', () => {
    const e = withStack(new TypeError('r.shader is undefined'), 'TypeError: r.shader is undefined\n    at execute (app.js:1:2)');
    expect(describeError(e)).toBe('TypeError: r.shader is undefined\n    at execute (app.js:1:2)');
  });

  it('Firefox and Safari: a stack of places only gets the name and the message in front of it', () => {
    const e = withStack(new TypeError('r.shader is undefined'), 'execute@http://x/app.js:1:2\nrender@http://x/app.js:3:4\n');
    const text = describeError(e);
    expect(text.startsWith('TypeError: r.shader is undefined\n')).toBe(true);
    expect(text).toContain('execute@http://x/app.js:1:2');
    expect(text.match(/r\.shader is undefined/g)).toHaveLength(1);
  });

  it('an error with no stack at all is its name and its message', () => {
    expect(describeError(withStack(new RangeError('too far'), undefined))).toBe('RangeError: too far');
    expect(describeError(withStack(new Error('plain'), ''))).toBe('Error: plain');
  });

  it('what is thrown and is not an Error (a string, an object, nothing) is written as the language writes it', () => {
    expect(describeError('boom')).toBe('boom');
    expect(describeError(42)).toBe('42');
    expect(describeError(undefined)).toBe('undefined');
    expect(describeError(null)).toBe('null');
    expect(describeError({ toString: () => 'custom' })).toBe('custom');
  });

  it('an error with an empty message is still named', () => {
    expect(describeError(withStack(new Error(''), 'f@x:1:1'))).toBe('Error: \nf@x:1:1');
  });
});
