import * as THREE from 'three';

/**
 * Inverted-hull outline: the mesh is drawn again with back faces, pushed outward along its (skinned) normals.
 * Costs one extra draw per character and no post-processing, which keeps it mobile-friendly. It is what
 * keeps a white mannequin readable against a bright sky and a dark enemy readable against a dark wall.
 *
 * The vertex shader reuses three's skinning chunks, so it follows the animated skeleton exactly.
 */
export interface OutlineUniforms {
  uThickness: { value: number };
  uColor: { value: THREE.Color };
}

export function createOutlineMaterial(thickness: number, color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  const uniforms: OutlineUniforms = {
    uThickness: { value: thickness },
    uColor: { value: new THREE.Color(color) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    side: THREE.BackSide,
    fog: false,
    vertexShader: /* glsl */ `
      uniform float uThickness;
      #include <common>
      #include <skinning_pars_vertex>
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        transformed += normalize( objectNormal ) * uThickness;
        #include <project_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4( uColor, 1.0 );
        #include <colorspace_fragment>
      }
    `,
  });
  material.name = 'Troid_Outline';
  return material;
}
