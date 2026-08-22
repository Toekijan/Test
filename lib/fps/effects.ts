import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * Composites the low-FOV viewmodel scene directly into the composer's buffer chain
 * (after SSAO, before bloom/SMAA/grade) so the weapon is antialiased, bloomed and
 * color-graded consistently with the world instead of looking pasted on top of it.
 */
class WeaponPass extends Pass {
  private weaponScene: THREE.Scene;
  private weaponCamera: THREE.PerspectiveCamera;

  constructor(weaponScene: THREE.Scene, weaponCamera: THREE.PerspectiveCamera) {
    super();
    this.needsSwap = false;
    this.weaponScene = weaponScene;
    this.weaponCamera = weaponCamera;
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.weaponScene, this.weaponCamera);
  }
}

/** Final color-grade pass: vignette + filmic grain + subtle chromatic aberration + damage tint. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignetteStrength: { value: 0.3 },
    grainStrength: { value: 0.014 },
    aberration: { value: 0.0005 },
    damageFlash: { value: 0.0 },
    lowHealthPulse: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignetteStrength;
    uniform float grainStrength;
    uniform float aberration;
    uniform float damageFlash;
    uniform float lowHealthPulse;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = length(centered);
      float edge = dist * dist;

      vec2 dir = normalize(centered + 1e-6);
      float ab = aberration * edge;
      vec4 r = texture2D(tDiffuse, vUv - dir * ab);
      vec4 g = texture2D(tDiffuse, vUv);
      vec4 b = texture2D(tDiffuse, vUv + dir * ab);
      vec3 color = vec3(r.r, g.g, b.b);

      float vignette = smoothstep(0.85, 0.25, dist * (1.0 + vignetteStrength));
      color *= mix(1.0 - vignetteStrength, 1.0, vignette);

      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      float grain = (rand(vUv + fract(time) * 0.6180339887) - 0.5) * grainStrength * mix(0.35, 1.0, luma);
      color += grain;

      float pulse = (sin(time * 6.0) * 0.5 + 0.5) * lowHealthPulse;
      color = mix(color, vec3(0.55, 0.02, 0.02), pulse * 0.3 * edge);

      color = mix(color, vec3(0.65, 0.05, 0.05), damageFlash * 0.3 * edge);

      color = pow(color, vec3(0.98));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export interface RenderPipeline {
  composer: EffectComposer;
  gradePass: ShaderPass;
  bloomPass: UnrealBloomPass;
  resize: (w: number, h: number) => void;
  update: (t: number, dt: number) => void;
  setDamageFlash: (v: number) => void;
  setLowHealth: (v: number) => void;
}

export function createRenderPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  weaponScene: THREE.Scene,
  weaponCamera: THREE.PerspectiveCamera
): RenderPipeline {
  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ssaoPass = new SSAOPass(scene, camera, width, height);
  ssaoPass.kernelRadius = 5;
  ssaoPass.minDistance = 0.002;
  ssaoPass.maxDistance = 0.1;
  composer.addPass(ssaoPass);

  // Composite the viewmodel into the buffer chain here (after AO, before bloom/AA/grade)
  // so the weapon is bloomed and color-graded like the rest of the frame instead of
  // looking like a flat sticker pasted on top of a fully post-processed image.
  const weaponPass = new WeaponPass(weaponScene, weaponCamera);
  composer.addPass(weaponPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.75, 0.85);
  composer.addPass(bloomPass);

  // SMAA needs to see clean scene edges, so it runs before the grade pass adds
  // grain/chromatic aberration that would otherwise confuse its edge detector.
  const smaaPass = new SMAAPass();
  composer.addPass(smaaPass);

  const gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  let damageFlash = 0;
  let lowHealth = 0;

  return {
    composer,
    gradePass,
    bloomPass,
    resize(w, h) {
      composer.setSize(w, h);
      ssaoPass.setSize(w, h);
    },
    update(t, dt) {
      gradePass.uniforms.time.value = t;
      damageFlash = Math.max(0, damageFlash - dt * 2.2);
      gradePass.uniforms.damageFlash.value = damageFlash;
      gradePass.uniforms.lowHealthPulse.value = lowHealth;
    },
    setDamageFlash(v) {
      damageFlash = Math.max(damageFlash, v);
    },
    setLowHealth(v) {
      lowHealth = v;
    },
  };
}

/** Lightweight GPU-friendly point-sprite particle system for muzzle flash, sparks, smoke, blood. */
export class ParticleBurst {
  private points: THREE.Points;
  private velocities: Float32Array;
  private lifetimes: Float32Array;
  private maxLife: number;
  private geometry: THREE.BufferGeometry;
  private alive = 0;
  private capacity: number;

  constructor(scene: THREE.Scene, capacity: number, color: THREE.ColorRepresentation, size: number, maxLife: number) {
    this.capacity = capacity;
    this.maxLife = maxLife;
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(capacity * 3);
    const opacities = new Float32Array(capacity).fill(0);
    this.velocities = new Float32Array(capacity * 3);
    this.lifetimes = new Float32Array(capacity).fill(-1);

    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("opacity", new THREE.BufferAttribute(opacities, 1));

    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    // Custom per-particle opacity via onBeforeCompile
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "attribute float opacity;\nvarying float vOpacity;\nvoid main() {")
        .replace("#include <fog_vertex>", "#include <fog_vertex>\nvOpacity = opacity;");
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "varying float vOpacity;\nvoid main() {")
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse, opacity * vOpacity );");
    };

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(origin: THREE.Vector3, direction: THREE.Vector3, count: number, spread: number, speed: number) {
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const idx = this.alive % this.capacity;
      this.alive++;
      const jitter = new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
      const vel = direction.clone().normalize().multiplyScalar(speed * (0.6 + Math.random() * 0.8)).add(jitter);
      posAttr.setXYZ(idx, origin.x, origin.y, origin.z);
      this.velocities[idx * 3] = vel.x;
      this.velocities[idx * 3 + 1] = vel.y;
      this.velocities[idx * 3 + 2] = vel.z;
      this.lifetimes[idx] = this.maxLife;
    }
    posAttr.needsUpdate = true;
  }

  update(dt: number, gravity: number) {
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const opAttr = this.geometry.attributes.opacity as THREE.BufferAttribute;
    for (let i = 0; i < this.capacity; i++) {
      if (this.lifetimes[i] <= 0) {
        opAttr.setX(i, 0);
        continue;
      }
      this.lifetimes[i] -= dt;
      const x = posAttr.getX(i) + this.velocities[i * 3] * dt;
      const y = posAttr.getY(i) + this.velocities[i * 3 + 1] * dt;
      const z = posAttr.getZ(i) + this.velocities[i * 3 + 2] * dt;
      this.velocities[i * 3 + 1] -= gravity * dt;
      posAttr.setXYZ(i, x, y, z);
      opAttr.setX(i, Math.max(0, this.lifetimes[i] / this.maxLife));
    }
    posAttr.needsUpdate = true;
    opAttr.needsUpdate = true;
  }
}

/** Decal-like bullet impact mark using a small flat quad oriented to the hit normal. */
export function spawnImpactDecal(scene: THREE.Scene, position: THREE.Vector3, normal: THREE.Vector3, color = 0x0a0a0a) {
  const size = 0.12 + Math.random() * 0.08;
  const geo = new THREE.CircleGeometry(size, 10);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const decal = new THREE.Mesh(geo, mat);
  decal.position.copy(position).addScaledVector(normal, 0.01);
  decal.lookAt(position.clone().add(normal));
  decal.rotateZ(Math.random() * Math.PI * 2);
  scene.add(decal);

  const life = { t: 8 };
  const fade = () => {
    life.t -= 1;
    if (life.t <= 2) {
      mat.opacity = life.t / 2 * 0.85;
    }
    if (life.t <= 0) {
      scene.remove(decal);
      geo.dispose();
      mat.dispose();
      return;
    }
    setTimeout(fade, 1500);
  };
  setTimeout(fade, 1500);
  return decal;
}

/** Bright, fast-fading tracer streak from muzzle to impact point. */
export function spawnTracer(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  let t = 1;
  const step = () => {
    t -= 0.15;
    mat.opacity = Math.max(0, t) * 0.9;
    if (t <= 0) {
      scene.remove(line);
      geo.dispose();
      mat.dispose();
      return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
