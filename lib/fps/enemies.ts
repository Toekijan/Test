import * as THREE from "three";
import * as CANNON from "cannon-es";

type AIState = "patrol" | "chase" | "attack" | "dead";

interface LimbPart {
  mesh: THREE.Mesh;
  body: CANNON.Body | null;
  offset: THREE.Vector3; // rest offset from torso, used before ragdoll activates
}

const MAX_HEALTH = 80;

function makeSoldierMaterial(color: number, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15, emissive, emissiveIntensity: 0.25 });
}

export class Enemy {
  group: THREE.Group;
  health = MAX_HEALTH;
  state: AIState = "patrol";
  id: string;
  private patrolCenter: THREE.Vector3;
  private patrolTarget: THREE.Vector3;
  private speed = 2.4;
  private attackCooldown = 0;
  private stateTimer = 0;
  private torso: LimbPart;
  private head: LimbPart;
  private limbs: LimbPart[] = [];
  private healthBarFill: THREE.Mesh;
  private healthBarGroup: THREE.Group;
  private healthBarVisibleTimer = 0;
  private ragdollActive = false;
  private muzzleFlashMesh: THREE.Mesh;
  private muzzleFlashTimer = 0;
  private bodyMat: CANNON.Material;

  onShootAtPlayer: ((from: THREE.Vector3, to: THREE.Vector3) => void) | null = null;
  onDamagePlayer: ((amount: number) => void) | null = null;
  onDeath: ((enemy: Enemy) => void) | null = null;

  constructor(id: string, scene: THREE.Scene, spawn: THREE.Vector3) {
    this.id = id;
    this.patrolCenter = spawn.clone();
    this.patrolTarget = spawn.clone();
    this.bodyMat = new CANNON.Material({ friction: 0.4, restitution: 0.1 });

    this.group = new THREE.Group();
    this.group.position.copy(spawn);
    scene.add(this.group);

    const uniform = makeSoldierMaterial(0x3c4534);
    const armor = makeSoldierMaterial(0x24291f, 0x1a0000);
    const skin = makeSoldierMaterial(0xb08765);
    const helmet = makeSoldierMaterial(0x1e2118);
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x0a0c0e, emissive: 0xff2200, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 });
    const padMat = makeSoldierMaterial(0x1a1d16, 0x0a0500);
    const bootMat = makeSoldierMaterial(0x15130f);

    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.32), armor);
    torsoMesh.position.set(0, 1.1, 0);
    torsoMesh.castShadow = torsoMesh.receiveShadow = true;
    this.group.add(torsoMesh);
    this.torso = { mesh: torsoMesh, body: null, offset: new THREE.Vector3(0, 1.1, 0) };

    // Chest rig accent + neck (purely decorative children — they inherit the
    // torso mesh's transform automatically, including once it becomes a ragdoll body).
    const chestRig = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.06), padMat);
    chestRig.position.set(0, 0.08, -0.17);
    torsoMesh.add(chestRig);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 10), skin);
    neck.position.set(0, 0.36, 0);
    torsoMesh.add(neck);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.27), helmet);
    headMesh.position.set(0, 1.62, 0);
    headMesh.castShadow = true;
    this.group.add(headMesh);
    this.head = { mesh: headMesh, body: null, offset: new THREE.Vector3(0, 1.62, 0) };

    const visorStrip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.03), visorMat);
    visorStrip.position.set(0, -0.02, -0.14);
    headMesh.add(visorStrip);
    const helmetBrim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.3), helmet);
    helmetBrim.position.set(0, 0.13, 0);
    headMesh.add(helmetBrim);

    const limbDefs: [string, number, number, number, number, number, number, THREE.Material][] = [
      ["armL", 0.34, 1.15, 0, 0.13, 0.48, 0.13, uniform],
      ["armR", -0.34, 1.15, 0, 0.13, 0.48, 0.13, uniform],
      ["legL", 0.14, 0.55, 0, 0.16, 0.58, 0.18, armor],
      ["legR", -0.14, 0.55, 0, 0.16, 0.58, 0.18, armor],
    ];
    for (const [name, x, y, z, w, h, d, mat] of limbDefs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      this.limbs.push({ mesh, body: null, offset: new THREE.Vector3(x, y, z) });

      if (name.startsWith("arm")) {
        const shoulderPad = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.19), padMat);
        shoulderPad.position.set(0, h / 2 - 0.02, 0);
        mesh.add(shoulderPad);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.11), skin);
        hand.position.set(0, -h / 2 - 0.05, 0);
        mesh.add(hand);
      } else {
        const boot = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.14, d + 0.05), bootMat);
        boot.position.set(0, -h / 2 + 0.03, 0.015);
        mesh.add(boot);
      }
    }

    // Health bar billboard (two flat planes: backing + fill)
    this.healthBarGroup = new THREE.Group();
    this.healthBarGroup.position.set(0, 2.05, 0);
    const backing = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.08), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7 }));
    this.healthBarGroup.add(backing);
    this.healthBarFill = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.05), new THREE.MeshBasicMaterial({ color: 0xe23b3b }));
    this.healthBarFill.position.z = 0.001;
    this.healthBarGroup.add(this.healthBarFill);
    this.healthBarGroup.visible = false;
    this.group.add(this.healthBarGroup);

    this.muzzleFlashMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0 })
    );
    this.muzzleFlashMesh.position.set(0.34, 1.15, -0.3);
    this.group.add(this.muzzleFlashMesh);

    this.pickNewPatrolTarget();
  }

  private pickNewPatrolTarget() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2 + Math.random() * 3;
    this.patrolTarget = this.patrolCenter.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }

  takeDamage(amount: number, hitPoint: THREE.Vector3, impulseDir: THREE.Vector3) {
    if (this.state === "dead") return;
    this.health -= amount;
    this.healthBarVisibleTimer = 2.5;
    this.healthBarGroup.visible = true;
    this.healthBarFill.scale.x = Math.max(0, this.health / MAX_HEALTH);
    this.healthBarFill.position.x = -0.29 * (1 - Math.max(0, this.health / MAX_HEALTH));

    if (this.health <= 0) {
      this.die(impulseDir);
    }
  }

  private die(impulseDir: THREE.Vector3) {
    this.state = "dead";
    this.healthBarGroup.visible = false;
    this.activateRagdoll(impulseDir);
    this.onDeath?.(this);
  }

  private activateRagdoll(impulseDir: THREE.Vector3) {
    if (this.ragdollActive) return;
    this.ragdollActive = true;
    // Ragdoll bodies are created lazily by the engine (needs physics world access);
    // engine calls attachRagdollBodies() right after die() via onDeath.
    this.pendingImpulse = impulseDir.clone().normalize();
  }

  pendingImpulse: THREE.Vector3 | null = null;

  attachRagdollBodies(physicsWorld: CANNON.World) {
    const allParts: LimbPart[] = [this.torso, this.head, ...this.limbs];
    const worldPos = this.group.position;
    for (const part of allParts) {
      const size = new THREE.Box3().setFromObject(part.mesh).getSize(new THREE.Vector3());
      const half = new CANNON.Vec3(Math.max(0.05, size.x / 2), Math.max(0.05, size.y / 2), Math.max(0.05, size.z / 2));
      const body = new CANNON.Body({
        mass: part === this.torso ? 8 : 1.5,
        shape: new CANNON.Box(half),
        material: this.bodyMat,
        position: new CANNON.Vec3(worldPos.x + part.offset.x, worldPos.y + part.offset.y, worldPos.z + part.offset.z),
        angularDamping: 0.6,
        linearDamping: 0.15,
      });
      const impulse = this.pendingImpulse ?? new THREE.Vector3(0, 0.4, 1);
      body.velocity.set(impulse.x * 3, Math.abs(impulse.y) * 2 + 1.5, impulse.z * 3);
      body.angularVelocity.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
      physicsWorld.addBody(body);
      part.body = body;
      part.mesh.position.set(0, 0, 0);
      this.group.remove(part.mesh);
      part.mesh.matrixAutoUpdate = true;
    }
    // Reparent limb meshes to scene root (world-space driven directly by physics bodies)
    const scene = this.group.parent;
    if (scene) {
      for (const part of allParts) scene.add(part.mesh);
    }
  }

  syncRagdollMeshes() {
    const allParts: LimbPart[] = [this.torso, this.head, ...this.limbs];
    for (const part of allParts) {
      if (!part.body) continue;
      part.mesh.position.set(part.body.position.x, part.body.position.y, part.body.position.z);
      part.mesh.quaternion.set(part.body.quaternion.x, part.body.quaternion.y, part.body.quaternion.z, part.body.quaternion.w);
    }
  }

  disposeRagdoll(physicsWorld: CANNON.World, scene: THREE.Scene) {
    const allParts: LimbPart[] = [this.torso, this.head, ...this.limbs];
    for (const part of allParts) {
      if (part.body) physicsWorld.removeBody(part.body);
      scene.remove(part.mesh);
      part.mesh.geometry.dispose();
      (part.mesh.material as THREE.Material).dispose();
    }
    scene.remove(this.healthBarGroup);
  }

  update(dt: number, playerPos: THREE.Vector3, hasLineOfSight: (from: THREE.Vector3, to: THREE.Vector3) => boolean) {
    if (this.state === "dead") return;

    if (this.healthBarVisibleTimer > 0) {
      this.healthBarVisibleTimer -= dt;
      if (this.healthBarVisibleTimer <= 0) this.healthBarGroup.visible = false;
    }
    this.healthBarGroup.lookAt(playerPos.x, this.healthBarGroup.getWorldPosition(new THREE.Vector3()).y, playerPos.z);

    const eyePos = this.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    const distToPlayer = eyePos.distanceTo(playerPos);
    const canSee = distToPlayer < 22 && hasLineOfSight(eyePos, playerPos);

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      (this.muzzleFlashMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, this.muzzleFlashTimer / 0.06);
    }

    this.stateTimer -= dt;

    if (this.state === "patrol") {
      if (canSee) {
        this.state = "chase";
      } else {
        const toTarget = this.patrolTarget.clone().sub(this.group.position);
        toTarget.y = 0;
        if (toTarget.length() < 0.3 || this.stateTimer <= 0) {
          this.pickNewPatrolTarget();
          this.stateTimer = 4 + Math.random() * 3;
        } else {
          this.moveToward(this.patrolTarget, dt, this.speed * 0.5);
        }
      }
    } else if (this.state === "chase") {
      if (!canSee && this.stateTimer <= 0) {
        this.state = "patrol";
        this.patrolCenter = this.group.position.clone();
        this.pickNewPatrolTarget();
      } else {
        if (canSee) this.stateTimer = 2.5;
        if (distToPlayer < 9) {
          this.state = "attack";
        } else {
          this.moveToward(playerPos, dt, this.speed);
        }
      }
    } else if (this.state === "attack") {
      this.facePlayer(playerPos, dt);
      if (distToPlayer > 12 || !canSee) {
        this.state = "chase";
      } else {
        if (distToPlayer > 6) {
          this.moveToward(playerPos, dt, this.speed * 0.6);
        }
        this.attackCooldown -= dt;
        if (this.attackCooldown <= 0 && canSee) {
          this.attackCooldown = 1.1 + Math.random() * 0.6;
          this.fireAtPlayer(eyePos, playerPos);
        }
      }
    }
  }

  private moveToward(target: THREE.Vector3, dt: number, speed: number) {
    const dir = target.clone().sub(this.group.position);
    dir.y = 0;
    if (dir.length() > 0.05) {
      dir.normalize();
      this.group.position.addScaledVector(dir, speed * dt);
      const targetAngle = Math.atan2(dir.x, dir.z);
      this.group.rotation.y = THREE.MathUtils.damp(this.group.rotation.y, targetAngle, 8, dt);
    }
  }

  private facePlayer(playerPos: THREE.Vector3, dt: number) {
    const dir = playerPos.clone().sub(this.group.position);
    dir.y = 0;
    const targetAngle = Math.atan2(dir.x, dir.z);
    this.group.rotation.y = THREE.MathUtils.damp(this.group.rotation.y, targetAngle, 10, dt);
  }

  private fireAtPlayer(from: THREE.Vector3, to: THREE.Vector3) {
    this.muzzleFlashTimer = 0.06;
    (this.muzzleFlashMesh.material as THREE.MeshBasicMaterial).opacity = 1;
    const missSpread = 0.09;
    const jittered = to
      .clone()
      .add(new THREE.Vector3((Math.random() - 0.5) * missSpread * 6, (Math.random() - 0.5) * missSpread * 4, (Math.random() - 0.5) * missSpread * 6));
    this.onShootAtPlayer?.(from, jittered);
    const hitChance = 0.55;
    if (Math.random() < hitChance) {
      this.onDamagePlayer?.(6 + Math.random() * 5);
    }
  }
}

export class EnemyManager {
  enemies: Enemy[] = [];
  private scene: THREE.Scene;
  private physicsWorld: CANNON.World;
  private ragdollTimers = new Map<string, number>();

  onPlayerDamage: ((amount: number) => void) | null = null;
  onEnemyKilled: (() => void) | null = null;
  onTracerShot: ((from: THREE.Vector3, to: THREE.Vector3) => void) | null = null;

  constructor(scene: THREE.Scene, physicsWorld: CANNON.World) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
  }

  spawn(id: string, position: THREE.Vector3) {
    const enemy = new Enemy(id, this.scene, position);
    enemy.onDamagePlayer = (amount) => this.onPlayerDamage?.(amount);
    enemy.onShootAtPlayer = (from, to) => this.onTracerShot?.(from, to);
    enemy.onDeath = (e) => {
      e.attachRagdollBodies(this.physicsWorld);
      this.ragdollTimers.set(e.id, 12);
      this.onEnemyKilled?.();
    };
    this.enemies.push(enemy);
    return enemy;
  }

  update(dt: number, playerPos: THREE.Vector3, hasLineOfSight: (from: THREE.Vector3, to: THREE.Vector3) => boolean) {
    for (const enemy of this.enemies) {
      if (enemy.state === "dead") {
        enemy.syncRagdollMeshes();
        continue;
      }
      enemy.update(dt, playerPos, hasLineOfSight);
    }

    for (const [id, t] of this.ragdollTimers) {
      const remaining = t - dt;
      if (remaining <= 0) {
        const enemy = this.enemies.find((e) => e.id === id);
        if (enemy) {
          enemy.disposeRagdoll(this.physicsWorld, this.scene);
          this.enemies = this.enemies.filter((e) => e.id !== id);
        }
        this.ragdollTimers.delete(id);
      } else {
        this.ragdollTimers.set(id, remaining);
      }
    }
  }

  get aliveCount() {
    return this.enemies.filter((e) => e.state !== "dead").length;
  }

  raycastEnemies(origin: THREE.Vector3, direction: THREE.Vector3, maxDist: number): { enemy: Enemy; point: THREE.Vector3; distance: number } | null {
    let closest: { enemy: Enemy; point: THREE.Vector3; distance: number } | null = null;
    for (const enemy of this.enemies) {
      if (enemy.state === "dead") continue;
      const box = new THREE.Box3().setFromObject(enemy.group);
      const ray = new THREE.Ray(origin, direction.clone().normalize());
      const target = new THREE.Vector3();
      const result = ray.intersectBox(box, target);
      if (result) {
        const distance = origin.distanceTo(result);
        if (distance <= maxDist && (!closest || distance < closest.distance)) {
          closest = { enemy, point: result, distance };
        }
      }
    }
    return closest;
  }
}
