/**
 * DETERMINISTIC MATH (docs/PROMPT22-LOG.md §5): the sine, the cosine, the arctangent and the hypotenuse the SIMULATION uses, made of nothing but the operations whose result is the same on every JavaScript engine —
 * addition, subtraction, multiplication, division, square root, comparison. The language says those are IEEE-754 double operations and rounds each one exactly; it does NOT say that of `Math.sin`, `Math.cos`, `Math.atan2` or
 * `Math.hypot`, which each engine (and each version of it, and each build of the same version) is free to implement as it likes, and does: Node's V8 and Chromium's V8 return a different last bit for `Math.sin` on one input
 * in thirty. A last bit is nothing to a person — and a fork in the road to a simulation that steers a bat by the angle of its flight: the same game, with the same inputs, played in a browser that is not the one it was recorded
 * in, ended the swoop of one bat a tenth of a metre from where it ended in the recording (the E2E of the whole adventure, in CI, at tick 14 400).
 *
 * So the simulation never asks the engine for a transcendental function: it asks for these. They are accurate to about 1e-16 (the tests hold them to 4e-16 against `Math`'s on a dense grid) — the game plays as it did — and they
 * give, for the same arguments, the same bits on every machine. `tests/unit/architecture.test.ts` keeps the simulation from calling the engine's again; `tests/integration/engineIndependence.test.ts` plays a whole game with the engine's
 * made different on purpose and finds not one difference. Rendering, the camera and the audio — which nothing in the simulation reads — keep using `Math`.
 */

const TWO_PI = 6.283185307179586;
const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;
const TWO_OVER_PI = 0.6366197723675814;
/** π/2 in two pieces: the first has only 33 significant bits, so `n * PIO2_1` is exact for any `n` below 2^20, and the second is what is left of it. */
const PIO2_1 = 1.5707963267341256;
const PIO2_1T = 6.077100506506192e-11;

// the kernels of fdlibm's sine and cosine on [-π/4, π/4]
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.7557313707070068e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;
const C1 = 4.1666666666666601904e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

/** The sine of `r`, for |r| ≤ π/4. */
function sinKernel(r: number): number {
  const z = r * r;
  return r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}

/** The cosine of `r`, for |r| ≤ π/4. */
function cosKernel(r: number): number {
  const z = r * r;
  return 1 - (0.5 * z - z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6))))));
}

/** `x` brought to [-π/4, π/4]: the remainder `r` and the quadrant (0…3) it stands in. */
function reduce(x: number): { r: number; quadrant: number } {
  const n = Math.round(x * TWO_OVER_PI);
  return { r: x - n * PIO2_1 - n * PIO2_1T, quadrant: ((n % 4) + 4) % 4 };
}

/** A multiple of a turn away from where it was: what a huge argument is made of before it is reduced (`%` is exact). */
const manageable = (x: number): number => (Math.abs(x) > 1_000_000 ? x % TWO_PI : x);

/** The sine of `x` (radians): as `Math.sin` to 4e-16, and the same on every engine. NaN for a value that is not finite. */
export function dsin(x: number): number {
  if (x === 0) return x; // (with its sign: the sine of −0 is −0)
  if (!Number.isFinite(x)) return NaN;
  const { r, quadrant } = reduce(manageable(x));
  switch (quadrant) {
    case 0:
      return sinKernel(r);
    case 1:
      return cosKernel(r);
    case 2:
      return -sinKernel(r);
    default:
      return -cosKernel(r);
  }
}

/** The cosine of `x` (radians): as `Math.cos` to 4e-16, and the same on every engine. NaN for a value that is not finite. */
export function dcos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const { r, quadrant } = reduce(manageable(x));
  switch (quadrant) {
    case 0:
      return cosKernel(r);
    case 1:
      return -sinKernel(r);
    case 2:
      return -cosKernel(r);
    default:
      return sinKernel(r);
  }
}

/**
 * The arctangent of `t` in [0, 1]: the argument is halved twice (atan t = 2 atan(t / (1 + √(1 + t²)))) — down to 0.2 or less, where the series of the arctangent gives it to 1e-17 in a dozen terms.
 */
function atanPositive(t: number): number {
  const a = t / (1 + Math.sqrt(1 + t * t));
  const b = a / (1 + Math.sqrt(1 + a * a));
  const z = b * b;
  const series = 1 + z * (-1 / 3 + z * (1 / 5 + z * (-1 / 7 + z * (1 / 9 + z * (-1 / 11 + z * (1 / 13 + z * (-1 / 15 + z * (1 / 17 + z * (-1 / 19 + z * (1 / 21 + z * (-1 / 23)))))))))));
  return 4 * b * series;
}

/**
 * The angle of the vector `(x, y)`, in (−π, π]: as `Math.atan2` to 4e-16 (signed zeros and infinities included, as the language defines them), and the same on every engine.
 */
export function datan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (y === 0) return x > 0 || (x === 0 && !Object.is(x, -0)) ? y : Object.is(y, -0) ? -PI : PI;
  if (x === 0) return y > 0 ? HALF_PI : -HALF_PI;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    if (!Number.isFinite(x) && !Number.isFinite(y)) return (x > 0 ? PI / 4 : (3 * PI) / 4) * (y > 0 ? 1 : -1);
    return !Number.isFinite(x) ? (x > 0 ? (y > 0 ? 0 : -0) : y > 0 ? PI : -PI) : y > 0 ? HALF_PI : -HALF_PI;
  }
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let a = ax >= ay ? atanPositive(ay / ax) : HALF_PI - atanPositive(ax / ay);
  if (x < 0) a = PI - a;
  return y < 0 ? -a : a;
}

/** The length of the vector `(x, y)`: `Math.hypot`'s without its scaling (the world is a few hundred metres wide, nothing here comes near an overflow), and the same on every engine. */
export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
