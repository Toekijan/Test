import * as THREE from "three";
import * as CANNON from "cannon-es";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildWorld, World } from "./world";
import { createRenderPipeline, RenderPipeline } from "./effects";
import { Player } from "./player";
import { Weapon, setWeaponSceneRef } from "./weapon";
import { EnemyManager } from "./enemies";
import { AudioEngine } from "./audio";

export interface HudState {
  health: number;
  ammoInMag: number;
  ammoReserve: number;
  isReloading: boolean;
  enemiesAlive: number;
  enemiesTotal: number;
  hitmarker: number; // increment token to trigger a flash
  killfeed: string[];
  gameOver: boolean;
  won: boolean;
}

export type HudListener = (state: HudState) => void;

const TOTAL_WAVE_ENEMIES = 5;

export class FpsEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private weaponScene: THREE.Scene;
  private weaponCamera: THREE.PerspectiveCamera;
  private physicsWorld: CANNON.World;
  private world: World;
  private player: Player;
  private weapon: Weapon;
  private enemyManager: EnemyManager;
  private pipeline: RenderPipeline;
  private audio: AudioEngine;
  private clock = new THREE.Clock();
  private raf = 0;
  private container: HTMLElement;
  private pointerLocked = false;
  private hudListeners: HudListener[] = [];
  private hud: HudState;
  private disposed = false;
  private killCount = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1a1610, 0.016);
    setWeaponSceneRef(this.scene);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTexture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(78, container.clientWidth / container.clientHeight, 0.05, 300);
    this.scene.add(this.camera);

    // Viewmodel renders through its own low-FOV camera/scene so the weapon doesn't
    // stretch into a converging plank under the wide gameplay FOV, matching how
    // real FPS renderers separate the world and hands/weapon render passes.
    this.weaponScene = new THREE.Scene();
    this.weaponScene.environment = envTexture;
    this.weaponCamera = new THREE.PerspectiveCamera(58, container.clientWidth / container.clientHeight, 0.01, 10);
    this.weaponScene.add(this.weaponCamera);
    const weaponKeyLight = new THREE.DirectionalLight(0xfff2e0, 2.4);
    weaponKeyLight.position.set(0.4, 1, 0.6);
    this.weaponCamera.add(weaponKeyLight);
    const weaponFillLight = new THREE.HemisphereLight(0x88aaff, 0x201810, 0.9);
    this.weaponScene.add(weaponFillLight);

    this.physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
    this.physicsWorld.broadphase = new CANNON.SAPBroadphase(this.physicsWorld);
    (this.physicsWorld.solver as CANNON.GSSolver).iterations = 10;

    this.world = buildWorld(this.physicsWorld);
    this.scene.add(this.world.group);

    this.player = new Player(this.camera, this.physicsWorld, this.world.spawnPoints[0]);
    this.player.onFootstep = () => this.audio.footstep(0.25 + Math.random() * 0.1);

    this.weapon = new Weapon(this.weaponScene, this.weaponCamera);
    this.weapon.onShoot = () => {
      this.audio.gunshot(1, 0.7);
      this.pushHudUpdate();
    };
    this.weapon.onReloadStart = () => {
      this.audio.reload();
      this.pushHudUpdate();
    };
    this.weapon.onReloadEnd = () => this.pushHudUpdate();
    this.weapon.onEmptyTrigger = () => this.audio.impact(0.15);
    this.weapon.onHit = (point, _distance, damage, isEnemy) => {
      if (isEnemy) {
        this.audio.hitmarker();
        this.triggerHitmarker();
      } else {
        this.audio.impact(0.35);
      }
      void point;
      void damage;
    };

    this.enemyManager = new EnemyManager(this.scene, this.physicsWorld);
    this.enemyManager.onPlayerDamage = (amount) => this.damagePlayer(amount);
    this.enemyManager.onTracerShot = () => this.audio.impact(0.1);
    for (let i = 0; i < TOTAL_WAVE_ENEMIES; i++) {
      const spawnPos = this.world.enemySpawns[i % this.world.enemySpawns.length];
      this.enemyManager.spawn(`enemy-${i}`, spawnPos.clone());
    }

    this.pipeline = createRenderPipeline(this.renderer, this.scene, this.camera, container.clientWidth, container.clientHeight);
    this.audio = new AudioEngine();

    this.hud = {
      health: this.player.health,
      ammoInMag: this.weapon.ammoInMag,
      ammoReserve: this.weapon.reserveAmmo,
      isReloading: false,
      enemiesAlive: this.enemyManager.aliveCount,
      enemiesTotal: TOTAL_WAVE_ENEMIES,
      hitmarker: 0,
      killfeed: [],
      gameOver: false,
      won: false,
    };

    this.bindInput();
    window.addEventListener("resize", this.handleResize);
  }

  private keys: Record<string, boolean> = {};

  private bindInput() {
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    this.renderer.domElement.addEventListener("mousedown", this.onMouseDown);
    this.renderer.domElement.addEventListener("mouseup", this.onMouseUp);
    this.renderer.domElement.addEventListener("click", this.requestPointerLock);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (e.code === "KeyR") this.weapon.reload();
    this.syncPlayerInput();
    if (e.code === "Space") this.player.input.jumpQueued = true;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
    this.syncPlayerInput();
  };

  private syncPlayerInput() {
    this.player.input.forward = !!this.keys["KeyW"];
    this.player.input.back = !!this.keys["KeyS"];
    this.player.input.left = !!this.keys["KeyA"];
    this.player.input.right = !!this.keys["KeyD"];
    this.player.input.sprint = !!this.keys["ShiftLeft"];
    this.player.input.crouch = !!this.keys["ControlLeft"] || !!this.keys["KeyC"];
  }

  private mouseDeltaAccum = { x: 0, y: 0 };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.mouseDeltaAccum.x += e.movementX;
    this.mouseDeltaAccum.y += e.movementY;
  };

  private firing = false;
  private onMouseDown = (e: MouseEvent) => {
    this.audio.resume();
    if (e.button === 0) this.firing = true;
    if (e.button === 2) this.weapon.setInputADS(true);
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false;
    if (e.button === 2) this.weapon.setInputADS(false);
  };

  private requestPointerLock = () => {
    this.renderer.domElement.requestPointerLock();
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
  };

  private handleResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = w / h;
    this.weaponCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.pipeline.resize(w, h);
  };

  private damagePlayer(amount: number) {
    this.player.health = Math.max(0, this.player.health - amount);
    this.pipeline.setDamageFlash(1);
    this.audio.damageThud();
    this.pipeline.setLowHealth(this.player.health < 30 ? 1 : 0);
    if (this.player.health <= 0 && !this.hud.gameOver) {
      this.hud.gameOver = true;
      this.hud.won = false;
      this.exitPointerLock();
    }
    this.pushHudUpdate();
  }

  private hitmarkerToken = 0;
  private triggerHitmarker() {
    this.hitmarkerToken++;
    this.pushHudUpdate();
  }

  private exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private raycastLevel(origin: THREE.Vector3, direction: THREE.Vector3, maxDist = 100): { point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null {
    const raycaster = new THREE.Raycaster(origin, direction.clone().normalize(), 0.01, maxDist);
    const meshes = this.world.colliders.map((c) => c.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length === 0) return null;
    const hit = intersects[0];
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    return { point: hit.point, normal, distance: hit.distance };
  }

  private hasLineOfSight = (from: THREE.Vector3, to: THREE.Vector3): boolean => {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    const hit = this.raycastLevel(from, dir.normalize(), dist);
    return !hit || hit.distance > dist - 0.3;
  };

  private combinedRaycast = (origin: THREE.Vector3, direction: THREE.Vector3) => {
    const levelHit = this.raycastLevel(origin, direction, 100);
    const enemyHit = this.enemyManager.raycastEnemies(origin, direction, 100);
    if (enemyHit && (!levelHit || enemyHit.distance < levelHit.distance)) {
      const impulseDir = direction.clone();
      enemyHit.enemy.takeDamage(this.weapon.stats.damage, enemyHit.point, impulseDir);
      if (enemyHit.enemy.state === "dead") {
        this.killCount++;
        this.hud.killfeed = [`${enemyHit.enemy.id.toUpperCase()} eliminated`, ...this.hud.killfeed].slice(0, 4);
        if (this.enemyManager.aliveCount === 0) {
          this.hud.gameOver = true;
          this.hud.won = true;
          this.exitPointerLock();
        }
      }
      return { point: enemyHit.point, normal: direction.clone().negate(), distance: enemyHit.distance, isEnemy: true };
    }
    if (levelHit) {
      return { point: levelHit.point, normal: levelHit.normal, distance: levelHit.distance, isEnemy: false };
    }
    return null;
  };

  onHudUpdate(listener: HudListener) {
    this.hudListeners.push(listener);
    listener({ ...this.hud });
  }

  private pushHudUpdate() {
    this.hud = {
      ...this.hud,
      health: this.player.health,
      ammoInMag: this.weapon.ammoInMag,
      ammoReserve: this.weapon.reserveAmmo,
      isReloading: this.weapon.isReloading,
      enemiesAlive: this.enemyManager.aliveCount,
      hitmarker: this.hitmarkerToken,
    };
    for (const l of this.hudListeners) l({ ...this.hud });
  }

  private lastYaw = 0;
  private lastPitch = 0;

  start() {
    this.clock.start();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.getElapsedTime();

      if (this.pointerLocked) {
        this.player.handleMouseMove(this.mouseDeltaAccum.x, this.mouseDeltaAccum.y, 0.0022);
        this.mouseDeltaAccum.x = 0;
        this.mouseDeltaAccum.y = 0;
      }

      this.physicsWorld.step(1 / 60, dt, 5);
      this.player.update(dt);

      const yawDelta = this.player.yaw - this.lastYaw;
      const pitchDelta = this.player.pitch - this.lastPitch;
      this.lastYaw = this.player.yaw;
      this.lastPitch = this.player.pitch;

      const moving = Math.hypot(this.player.velocityXZ.x, this.player.velocityXZ.y) > 0.5;
      this.weapon.update(dt, moving, this.player.input.sprint, yawDelta, pitchDelta);

      if (this.firing && this.pointerLocked && !this.hud.gameOver) {
        const muzzleWorld = new THREE.Vector3();
        this.camera.getWorldPosition(muzzleWorld);
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        this.weapon.tryFire(muzzleWorld, dir, this.combinedRaycast);
      }

      this.enemyManager.update(dt, this.player.position, this.hasLineOfSight);
      this.world.animate(t, dt);
      this.pipeline.update(t, dt);

      this.pipeline.composer.render();
      this.renderer.setRenderTarget(null);
      this.renderer.clearDepth();
      this.renderer.render(this.weaponScene, this.weaponCamera);
    };
    loop();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.exitPointerLock();
    this.audio.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
