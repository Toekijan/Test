import * as THREE from "three";
import { ParticleBurst, spawnImpactDecal, spawnTracer } from "./effects";

export interface WeaponStats {
  name: string;
  damage: number;
  fireRate: number; // rounds per second
  magSize: number;
  reloadTime: number;
  spread: number; // radians, hip-fire
  adsSpreadMul: number;
  recoilKick: number;
  automatic: boolean;
}

export const RIFLE_STATS: WeaponStats = {
  name: "AR-15 “Vanguard”",
  damage: 24,
  fireRate: 9,
  magSize: 30,
  reloadTime: 1.7,
  spread: 0.028,
  adsSpreadMul: 0.22,
  recoilKick: 0.028,
  automatic: true,
};

/** Builds a stylized low-poly-but-well-shaded rifle viewmodel from primitives + PBR materials. */
function buildRifleMesh(): THREE.Group {
  const group = new THREE.Group();

  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.85, roughness: 0.35 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x26241f, metalness: 0.1, roughness: 0.65 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.6, roughness: 0.4, emissive: 0x332200, emissiveIntensity: 0.2 });
  const darkTrim = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, metalness: 0.4, roughness: 0.7 });

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.62), gunmetal);
  receiver.position.set(0, 0, 0);
  group.add(receiver);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.42, 12), gunmetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.5);
  group.add(barrel);

  const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.28), polymer);
  foregrip.position.set(0, -0.03, -0.3);
  group.add(foregrip);

  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.26, 0.09), darkTrim);
  magazine.position.set(0, -0.19, -0.06);
  magazine.rotation.x = 0.18;
  group.add(magazine);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.24), polymer);
  stock.position.set(0, -0.01, 0.42);
  group.add(stock);

  const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.03), darkTrim);
  stockPad.position.set(0, -0.01, 0.54);
  group.add(stockPad);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), polymer);
  grip.position.set(0, -0.14, 0.16);
  grip.rotation.x = -0.35;
  group.add(grip);

  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.02), darkTrim);
  trigger.position.set(0, -0.06, 0.08);
  group.add(trigger);

  const magwell = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.1), gunmetal);
  magwell.position.set(0, -0.07, -0.02);
  group.add(magwell);

  const sightPost = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.03), gunmetal);
  sightPost.position.set(0, 0.085, -0.22);
  group.add(sightPost);
  const sightRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 8, 16), accent);
  sightRing.position.set(0, 0.11, -0.22);
  group.add(sightRing);

  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.03), gunmetal);
  rearSight.position.set(0, 0.075, 0.12);
  group.add(rearSight);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.5), darkTrim);
  rail.position.set(0, 0.065, -0.15);
  group.add(rail);

  const accentStripe = new THREE.Mesh(new THREE.BoxGeometry(0.093, 0.01, 0.1), accent);
  accentStripe.position.set(0, 0.03, 0.2);
  group.add(accentStripe);

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });

  return group;
}

export class Weapon {
  stats: WeaponStats;
  mesh: THREE.Group;
  ammoInMag: number;
  reserveAmmo = 180;
  isReloading = false;
  private cooldown = 0;
  private reloadTimer = 0;
  private muzzleFlash: THREE.PointLight;
  private muzzleSprite: THREE.Sprite;
  private muzzleFlashTimer = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private recoilPitchVel = 0;
  private bobSwayGroup: THREE.Group;
  private adsAmount = 0;
  private basePosition = new THREE.Vector3(0.28, -0.24, -0.55);
  private adsPosition = new THREE.Vector3(0, -0.13, -0.32);
  private sparks: ParticleBurst;
  private smoke: ParticleBurst;
  private casings: ParticleBurst;

  onShoot: ((ammo: number, mag: number) => void) | null = null;
  onHit: ((point: THREE.Vector3, distance: number, damage: number, isEnemy: boolean) => void) | null = null;
  onReloadStart: (() => void) | null = null;
  onReloadEnd: (() => void) | null = null;
  onEmptyTrigger: (() => void) | null = null;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, stats: WeaponStats = RIFLE_STATS) {
    this.stats = stats;
    this.ammoInMag = stats.magSize;

    this.bobSwayGroup = new THREE.Group();
    this.mesh = buildRifleMesh();
    this.mesh.position.copy(this.basePosition);
    this.bobSwayGroup.add(this.mesh);
    camera.add(this.bobSwayGroup);

    const flashCanvas = document.createElement("canvas");
    flashCanvas.width = flashCanvas.height = 64;
    const fctx = flashCanvas.getContext("2d")!;
    const grad = fctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,240,200,1)");
    grad.addColorStop(0.4, "rgba(255,180,80,0.8)");
    grad.addColorStop(1, "rgba(255,120,20,0)");
    fctx.fillStyle = grad;
    fctx.fillRect(0, 0, 64, 64);
    const flashTex = new THREE.CanvasTexture(flashCanvas);
    const flashMat = new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.muzzleSprite = new THREE.Sprite(flashMat);
    this.muzzleSprite.scale.set(0.18, 0.18, 0.18);
    this.muzzleSprite.position.set(0, 0.012, -0.72);
    this.mesh.add(this.muzzleSprite);

    this.muzzleFlash = new THREE.PointLight(0xffaa44, 0, 6, 2);
    this.muzzleFlash.position.copy(this.muzzleSprite.position);
    this.mesh.add(this.muzzleFlash);

    this.sparks = new ParticleBurst(scene, 200, 0xffcc66, 0.06, 0.25);
    this.smoke = new ParticleBurst(scene, 100, 0x999999, 0.18, 1.2);
    this.casings = new ParticleBurst(scene, 60, 0xd4a017, 0.03, 1.5);

    if (!camera.parent) {
      // camera must be added to scene by caller; weapon just attaches to camera object
    }
    void scene;
  }

  setInputADS(active: boolean) {
    this.wantsADS = active;
  }
  private wantsADS = false;

  tryFire(muzzleWorldPos: THREE.Vector3, direction: THREE.Vector3, raycast: (origin: THREE.Vector3, dir: THREE.Vector3) => { point: THREE.Vector3; normal: THREE.Vector3; distance: number; isEnemy: boolean; enemyId?: string } | null) {
    if (this.isReloading) return;
    if (this.cooldown > 0) return;
    if (this.ammoInMag <= 0) {
      this.onEmptyTrigger?.();
      this.cooldown = 0.2;
      return;
    }
    this.cooldown = 1 / this.stats.fireRate;
    this.ammoInMag--;
    this.onShoot?.(this.ammoInMag, this.stats.magSize);

    const spread = this.stats.spread * (this.wantsADS ? this.stats.adsSpreadMul : 1);
    const spreadDir = direction
      .clone()
      .applyEuler(new THREE.Euler((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2, 0));

    const hit = raycast(muzzleWorldPos, spreadDir);
    const endPoint = hit ? hit.point : muzzleWorldPos.clone().addScaledVector(spreadDir, 100);

    this.recoilPitchVel += this.stats.recoilKick;
    this.recoilYaw += (Math.random() - 0.5) * this.stats.recoilKick * 0.4;
    this.muzzleFlashTimer = 0.045;

    this.sparks.emit(this.muzzleSprite.getWorldPosition(new THREE.Vector3()), spreadDir, 8, 0.15, 6);
    this.smoke.emit(this.muzzleSprite.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 1, 0), 2, 0.08, 0.6);
    this.casings.emit(
      this.mesh.localToWorld(new THREE.Vector3(0.05, -0.02, -0.05)),
      new THREE.Vector3(1, 0.6, -0.3),
      1,
      0.05,
      2.2
    );

    if (hit) {
      spawnTracer(sceneRef!, muzzleWorldPos, endPoint);
      if (!hit.isEnemy) spawnImpactDecal(sceneRef!, hit.point, hit.normal);
      this.onHit?.(hit.point, hit.distance, this.stats.damage, hit.isEnemy);
    }
  }

  reload() {
    if (this.isReloading || this.ammoInMag === this.stats.magSize || this.reserveAmmo <= 0) return;
    this.isReloading = true;
    this.reloadTimer = this.stats.reloadTime;
    this.onReloadStart?.();
  }

  update(dt: number, moving: boolean, sprinting: boolean, aimYawDelta: number, aimPitchDelta: number) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      const t = Math.max(0, this.muzzleFlashTimer / 0.045);
      this.muzzleFlash.intensity = t * 8;
      (this.muzzleSprite.material as THREE.SpriteMaterial).opacity = t;
      this.muzzleSprite.material.rotation = Math.random() * Math.PI;
    } else {
      this.muzzleFlash.intensity = 0;
      (this.muzzleSprite.material as THREE.SpriteMaterial).opacity = 0;
    }

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const needed = this.stats.magSize - this.ammoInMag;
        const take = Math.min(needed, this.reserveAmmo);
        this.ammoInMag += take;
        this.reserveAmmo -= take;
        this.isReloading = false;
        this.onReloadEnd?.();
      }
    }

    this.recoilPitch += this.recoilPitchVel * dt;
    this.recoilPitchVel = THREE.MathUtils.damp(this.recoilPitchVel, 0, 10, dt);
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 6, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 4.5, dt);

    this.adsAmount = THREE.MathUtils.damp(this.adsAmount, this.wantsADS && !this.isReloading ? 1 : 0, 14, dt);
    const targetPos = new THREE.Vector3().lerpVectors(this.basePosition, this.adsPosition, this.adsAmount);

    const swayX = -aimYawDelta * 0.6;
    const swayY = aimPitchDelta * 0.6;
    this.mesh.position.x = THREE.MathUtils.damp(this.mesh.position.x, targetPos.x + swayX * (1 - this.adsAmount * 0.7), 10, dt);
    this.mesh.position.y = THREE.MathUtils.damp(
      this.mesh.position.y,
      targetPos.y + swayY * (1 - this.adsAmount * 0.7) - this.recoilPitch * 0.5,
      10,
      dt
    );
    this.mesh.position.z = THREE.MathUtils.damp(this.mesh.position.z, targetPos.z + this.recoilPitch * 0.15, 10, dt);
    this.mesh.rotation.x = THREE.MathUtils.damp(this.mesh.rotation.x, -this.recoilPitch * 2.2, 8, dt);
    this.mesh.rotation.z = THREE.MathUtils.damp(this.mesh.rotation.z, this.recoilYaw * 1.5, 8, dt);

    const bobFreq = sprinting ? 11 : moving ? 7 : 1.2;
    const bobAmp = sprinting ? 0.012 : moving ? 0.008 : 0.0025;
    const time = performance.now() / 1000;
    this.bobSwayGroup.position.x = Math.sin(time * bobFreq) * bobAmp * (1 - this.adsAmount * 0.8);
    this.bobSwayGroup.position.y = Math.abs(Math.cos(time * bobFreq)) * bobAmp * 0.8 * (1 - this.adsAmount * 0.8);

    this.sparks.update(dt, 4);
    this.smoke.update(dt, -0.2);
    this.casings.update(dt, 5.5);
  }

  get adsProgress() {
    return this.adsAmount;
  }
}

let sceneRef: THREE.Scene | null = null;
export function setWeaponSceneRef(scene: THREE.Scene) {
  sceneRef = scene;
}
