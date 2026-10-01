import * as THREE from 'three';

/**
 * The game's single surface style: 3-tone toon shading + optional rim light + hit-flash.
 *
 * Why one custom material instead of PBR: a stylised, high-contrast look reads at phone scale (see
 * docs/ART_DIRECTION.md), is cheap on mobile GPUs, and — through the rim light — guarantees actors separate
 * from any background regardless of how the scene is lit.
 */

export interface ToonUniforms {
  uRimColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uRimPower: { value: number };
  uFlash: { value: number };
  uFlashColor: { value: THREE.Color };
  uLightFloor: { value: number };
}

export interface ToonOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  vertexColors?: boolean;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  /** Light bands (0..1), darkest first. */
  ramp?: readonly number[];
  rimColor?: THREE.ColorRepresentation;
  /** 0 disables the rim. */
  rimStrength?: number;
  rimPower?: number;
  /**
   * Minimum lit fraction of the albedo (0..1), applied even in full shadow. Characters use ≈ 0.5 so a white
   * mannequin in a dark corner never drops to murky grey: readability beats physical shading (see ART_DIRECTION §3).
   */
  lightFloor?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

const rampCache = new Map<string, THREE.DataTexture>();

/** Shared, cached gradient texture. Never dispose these: they belong to the whole app. */
export function getToonRamp(stops: readonly number[] = [0.4, 0.68, 1]): THREE.DataTexture {
  const key = stops.join(',');
  let tex = rampCache.get(key);
  if (!tex) {
    const data = new Uint8Array(stops.map((s) => Math.round(Math.min(1, Math.max(0, s)) * 255)));
    tex = new THREE.DataTexture(data, stops.length, 1, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    rampCache.set(key, tex);
  }
  return tex;
}

const UNIFORM_DECL = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uRimPower;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uLightFloor;
`;

// Inserted right before <opaque_fragment>, where `outgoingLight` and view-space `normal` are in scope.
const FX_FRAGMENT = /* glsl */ `
{
  outgoingLight = max( outgoingLight, diffuseColor.rgb * uLightFloor );
  vec3 rimN = normalize( normal );
  vec3 rimV = normalize( vViewPosition );
  float rimF = pow( 1.0 - saturate( dot( rimN, rimV ) ), uRimPower );
  // favour surfaces facing up/back so the rim reads like a backlight, not a uniform outline
  float rimBias = smoothstep( -0.6, 0.7, rimN.y + 0.25 );
  outgoingLight += uRimColor * ( rimF * rimBias * uRimStrength );
  outgoingLight = mix( outgoingLight, uFlashColor, uFlash );
}
`;

export function createToonMaterial(opts: ToonOptions = {}): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    vertexColors: opts.vertexColors ?? false,
    gradientMap: getToonRamp(opts.ramp),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    fog: true,
  });

  const uniforms: ToonUniforms = {
    uRimColor: { value: new THREE.Color(opts.rimColor ?? 0xffffff) },
    uRimStrength: { value: opts.rimStrength ?? 0 },
    uRimPower: { value: opts.rimPower ?? 3 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(0xffffff) },
    uLightFloor: { value: opts.lightFloor ?? 0 },
  };
  material.userData.toon = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${UNIFORM_DECL}\nvoid main() {`)
      .replace('#include <opaque_fragment>', `${FX_FRAGMENT}\n#include <opaque_fragment>`);
  };
  // All toon materials share one program; per-instance values live in uniforms.
  material.customProgramCacheKey = () => 'troid-toon-v1';
  return material;
}

export function getToonUniforms(material: THREE.Material): ToonUniforms | undefined {
  return material.userData.toon as ToonUniforms | undefined;
}

/** Hit flash: 0 = normal, 1 = solid `color` (default white). */
export function setToonFlash(material: THREE.Material, amount: number, color?: THREE.ColorRepresentation): void {
  const u = getToonUniforms(material);
  if (!u) return;
  u.uFlash.value = amount;
  if (color !== undefined) u.uFlashColor.value.set(color);
}
