import * as THREE from "three";
import * as CANNON from "cannon-es";

export interface PlayerInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  crouch: boolean;
  jumpQueued: boolean;
}

const EYE_HEIGHT_STAND = 1.7;
const EYE_HEIGHT_CROUCH = 1.1;
const RADIUS = 0.4;
const WALK_SPEED = 5.2;
const SPRINT_SPEED = 8.4;
const CROUCH_SPEED = 2.6;
const ACCEL = 45;
const JUMP_VELOCITY = 6.4;

export class Player {
  camera: THREE.PerspectiveCamera;
  body: CANNON.Body;
  yaw = 0;
  pitch = 0;
  input: PlayerInput = { forward: false, back: false, left: false, right: false, sprint: false, crouch: false, jumpQueued: false };
  health = 100;
  isCrouching = false;
  grounded = false;
  velocityXZ = new THREE.Vector2();
  bobTime = 0;
  currentEyeHeight = EYE_HEIGHT_STAND;
  private groundContacts = 0;
  onFootstep: (() => void) | null = null;
  private footstepDistance = 0;

  constructor(camera: THREE.PerspectiveCamera, physicsWorld: CANNON.World, spawn: THREE.Vector3) {
    this.camera = camera;
    this.body = new CANNON.Body({
      mass: 78,
      shape: new CANNON.Sphere(RADIUS),
      position: new CANNON.Vec3(spawn.x, spawn.y, spawn.z),
      fixedRotation: true,
      linearDamping: 0.0,
    });
    this.body.material = new CANNON.Material({ friction: 0.0, restitution: 0 });
    physicsWorld.addBody(this.body);

    this.body.addEventListener("collide", (e: any) => {
      const contact = e.contact as CANNON.ContactEquation;
      const normal = contact.bi === this.body ? contact.ni : contact.ni.clone().negate();
      if (normal.y > 0.5) {
        this.groundContacts++;
      }
    });
  }

  handleMouseMove(dx: number, dy: number, sensitivity: number) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
  }

  update(dt: number) {
    this.grounded = this.groundContacts > 0;
    this.groundContacts = 0;

    const euler = new THREE.Euler(0, this.yaw, 0, "YXZ");
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(euler);
    const right = new THREE.Vector3(1, 0, 0).applyEuler(euler);

    let moveX = 0;
    let moveZ = 0;
    if (this.input.forward) {
      moveX += forward.x;
      moveZ += forward.z;
    }
    if (this.input.back) {
      moveX -= forward.x;
      moveZ -= forward.z;
    }
    if (this.input.right) {
      moveX += right.x;
      moveZ += right.z;
    }
    if (this.input.left) {
      moveX -= right.x;
      moveZ -= right.z;
    }
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 0.001) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    this.isCrouching = this.input.crouch;
    const targetSpeed = this.isCrouching ? CROUCH_SPEED : this.input.sprint && this.input.forward ? SPRINT_SPEED : WALK_SPEED;

    const targetVX = moveX * targetSpeed;
    const targetVZ = moveZ * targetSpeed;
    const curVX = this.body.velocity.x;
    const curVZ = this.body.velocity.z;
    const accel = this.grounded ? ACCEL : ACCEL * 0.35;
    const newVX = THREE.MathUtils.damp(curVX, targetVX, accel / 10, dt);
    const newVZ = THREE.MathUtils.damp(curVZ, targetVZ, accel / 10, dt);
    this.body.velocity.x = newVX;
    this.body.velocity.z = newVZ;

    if (this.input.jumpQueued && this.grounded) {
      this.body.velocity.y = JUMP_VELOCITY;
    }
    this.input.jumpQueued = false;

    const targetEye = this.isCrouching ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STAND;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 10, dt);

    const speed = Math.hypot(newVX, newVZ);
    this.velocityXZ.set(newVX, newVZ);
    let bobOffset = 0;
    let swayX = 0;
    if (speed > 0.5 && this.grounded) {
      const bobSpeedMul = this.input.sprint ? 1.6 : this.isCrouching ? 0.7 : 1.0;
      this.bobTime += dt * speed * bobSpeedMul * 1.4;
      bobOffset = Math.abs(Math.sin(this.bobTime)) * 0.055 * (speed / SPRINT_SPEED + 0.4);
      swayX = Math.sin(this.bobTime * 0.5) * 0.03;

      this.footstepDistance += speed * dt;
      const stepInterval = this.input.sprint ? 2.1 : 3.0;
      if (this.footstepDistance > stepInterval) {
        this.footstepDistance = 0;
        this.onFootstep?.();
      }
    } else {
      this.bobTime = 0;
    }

    this.camera.position.set(
      this.body.position.x + swayX,
      this.body.position.y + this.currentEyeHeight + bobOffset,
      this.body.position.z
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  get position(): THREE.Vector3 {
    return new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
  }
}
