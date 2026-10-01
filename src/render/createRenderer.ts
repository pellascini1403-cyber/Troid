import * as THREE from 'three';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  antialias: boolean;
  /** Upper bound for devicePixelRatio. Phones are capped to keep fill-rate in check. */
  maxPixelRatio: number;
  shadows: boolean;
}

/**
 * Single place where the WebGLRenderer is configured. Quality profiles (F18) feed
 * this; nothing else in the project should construct a renderer.
 */
export function createRenderer(opts: RendererOptions): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas: opts.canvas,
    antialias: opts.antialias,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = opts.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio));
  return renderer;
}
