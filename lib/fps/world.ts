import * as THREE from "three";
import * as CANNON from "cannon-es";
import { makeConcreteMaps, makeMetalPanelMaps, makeHazardTrimMaps, makeCrateMaps, makeSkyGradientTexture } from "./textures";

export interface ColliderBox {
  mesh: THREE.Object3D;
  body: CANNON.Body;
}

export interface World {
  group: THREE.Group;
  colliders: ColliderBox[];
  spawnPoints: THREE.Vector3[];
  enemySpawns: THREE.Vector3[];
  lights: THREE.Light[];
  animate: (t: number, dt: number) => void;
}

const ARENA_SIZE = 34;
const WALL_HEIGHT = 7;

function pbrMaterial(maps: ReturnType<typeof makeConcreteMaps>, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    aoMap: maps.aoMap,
    normalScale: new THREE.Vector2(1, 1),
    ...extra,
  });
}

function addUv2(geo: THREE.BufferGeometry) {
  geo.setAttribute("uv2", new THREE.BufferAttribute(geo.attributes.uv.array, 2));
}

function box(w: number, h: number, d: number, mat: THREE.Material, pos: THREE.Vector3, world: World, physicsWorld: CANNON.World, mass = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  addUv2(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.group.add(mesh);

  const body = new CANNON.Body({
    mass,
    shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    position: new CANNON.Vec3(pos.x, pos.y, pos.z),
  });
  physicsWorld.addBody(body);
  world.colliders.push({ mesh, body });
  return mesh;
}

export function buildWorld(physicsWorld: CANNON.World): World {
  const group = new THREE.Group();
  const world: World = {
    group,
    colliders: [],
    spawnPoints: [],
    enemySpawns: [],
    lights: [],
    animate: () => {},
  };

  const concrete = makeConcreteMaps(10);
  const metal = makeMetalPanelMaps(5);
  const hazard = makeHazardTrimMaps(3);
  const crateMaps = makeCrateMaps(1);

  const floorMat = pbrMaterial(concrete, { roughness: 0.95, metalness: 0.05, color: 0xffffff });
  const wallMat = pbrMaterial(metal, { roughness: 0.55, metalness: 0.75, color: 0xffffff });
  const trimMat = pbrMaterial(hazard, { roughness: 0.6, metalness: 0.2, color: 0xffffff, emissive: 0x1a1400, emissiveIntensity: 0.15 });
  const crateMat = pbrMaterial(crateMaps, { roughness: 0.85, metalness: 0.0, color: 0xffffff });

  // Floor
  box(ARENA_SIZE, 1, ARENA_SIZE, floorMat, new THREE.Vector3(0, -0.5, 0), world, physicsWorld, 0);

  const half = ARENA_SIZE / 2;

  // Ceiling: a perimeter frame + crossing trusses with a large open skylight in the
  // middle, so the "sun" directional light and dusk sky can actually reach the arena
  // floor instead of being fully self-shadowed by a sealed roof.
  const ceilingMat = pbrMaterial(metal, { roughness: 0.75, metalness: 0.5, color: 0x2a2d33 });
  const frameWidth = 5;
  const frameY = WALL_HEIGHT;
  const addCeilingPiece = (w: number, d: number, x: number, z: number) => {
    const geo = new THREE.BoxGeometry(w, 0.6, d);
    addUv2(geo);
    const mesh = new THREE.Mesh(geo, ceilingMat);
    mesh.position.set(x, frameY, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  addCeilingPiece(ARENA_SIZE, frameWidth, 0, -half + frameWidth / 2);
  addCeilingPiece(ARENA_SIZE, frameWidth, 0, half - frameWidth / 2);
  addCeilingPiece(frameWidth, ARENA_SIZE - frameWidth * 2, -half + frameWidth / 2, 0);
  addCeilingPiece(frameWidth, ARENA_SIZE - frameWidth * 2, half - frameWidth / 2, 0);
  // Crossing trusses over the skylight opening for silhouette + dappled shadow detail
  addCeilingPiece(ARENA_SIZE - frameWidth * 2, 0.8, 0, 0);
  addCeilingPiece(0.8, ARENA_SIZE - frameWidth * 2, -7, 0);
  addCeilingPiece(0.8, ARENA_SIZE - frameWidth * 2, 7, 0);

  // Perimeter walls with a gap (entrances) on N/S for sightlines
  const wallThickness = 1;
  box(ARENA_SIZE, WALL_HEIGHT, wallThickness, wallMat, new THREE.Vector3(0, WALL_HEIGHT / 2, -half), world, physicsWorld, 0);
  box(ARENA_SIZE, WALL_HEIGHT, wallThickness, wallMat, new THREE.Vector3(0, WALL_HEIGHT / 2, half), world, physicsWorld, 0);
  box(wallThickness, WALL_HEIGHT, ARENA_SIZE, wallMat, new THREE.Vector3(-half, WALL_HEIGHT / 2, 0), world, physicsWorld, 0);
  box(wallThickness, WALL_HEIGHT, ARENA_SIZE, wallMat, new THREE.Vector3(half, WALL_HEIGHT / 2, 0), world, physicsWorld, 0);

  // Hazard trim band along the base of walls
  for (const [pos, size] of [
    [new THREE.Vector3(0, 0.6, -half + 0.51), [ARENA_SIZE, 0.5, 0.05]],
    [new THREE.Vector3(0, 0.6, half - 0.51), [ARENA_SIZE, 0.5, 0.05]],
    [new THREE.Vector3(-half + 0.51, 0.6, 0), [0.05, 0.5, ARENA_SIZE]],
    [new THREE.Vector3(half - 0.51, 0.6, 0), [0.05, 0.5, ARENA_SIZE]],
  ] as const) {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    addUv2(geo);
    const mesh = new THREE.Mesh(geo, trimMat);
    mesh.position.copy(pos);
    group.add(mesh);
  }

  // Central raised platform (verticality / sightline break, classic arena-shooter device)
  const platformMat = pbrMaterial(concrete, { roughness: 0.9, metalness: 0.1, color: 0xdadada });
  box(8, 1.2, 8, platformMat, new THREE.Vector3(0, 0.1, 0), world, physicsWorld, 0);
  // ramps up to platform
  const rampGeo = new THREE.BoxGeometry(3, 0.3, 5);
  addUv2(rampGeo);
  const ramp = new THREE.Mesh(rampGeo, platformMat);
  ramp.position.set(0, 0.35, 6.2);
  ramp.rotation.x = -0.22;
  ramp.castShadow = ramp.receiveShadow = true;
  group.add(ramp);
  const rampBody = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(1.5, 0.15, 2.5)) });
  rampBody.position.set(0, 0.35, 6.2);
  rampBody.quaternion.setFromEuler(-0.22, 0, 0);
  physicsWorld.addBody(rampBody);
  world.colliders.push({ mesh: ramp, body: rampBody });

  // Scattered crates for cover
  const cratePositions: [number, number, number, number][] = [
    [-9, 0.6, -6, 0.2],
    [-9, 0.6, -4.6, 0.1],
    [9, 0.6, 7, 0.4],
    [6, 0.6, -10, -0.3],
    [-12, 0.6, 9, 0.6],
    [12, 0.6, -3, -0.5],
    [-4, 0.6, 12, 0.15],
  ];
  for (const [x, y, z, rot] of cratePositions) {
    const mesh = box(1.2, 1.2, 1.2, crateMat, new THREE.Vector3(x, y, z), world, physicsWorld, 0);
    mesh.rotation.y = rot;
    world.colliders[world.colliders.length - 1].body.quaternion.setFromEuler(0, rot, 0);
  }

  // Support pillars
  const pillarMat = pbrMaterial(metal, { roughness: 0.4, metalness: 0.85, color: 0xffffff });
  for (const [x, z] of [
    [-13, -13],
    [13, -13],
    [-13, 13],
    [13, 13],
  ]) {
    const geo = new THREE.CylinderGeometry(0.6, 0.7, WALL_HEIGHT, 16);
    const mesh = new THREE.Mesh(geo, pillarMat);
    mesh.position.set(x, WALL_HEIGHT / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(0.6, 0.7, WALL_HEIGHT, 12) });
    body.position.set(x, WALL_HEIGHT / 2, z);
    physicsWorld.addBody(body);
    world.colliders.push({ mesh, body });
  }

  // Skybox (gradient dusk sky as a large inverted sphere)
  const skyTex = makeSkyGradientTexture();
  const skyGeo = new THREE.SphereGeometry(200, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);

  // Lighting: warm key "sunset" light through openings + cool fill + practical industrial lamps
  const sun = new THREE.DirectionalLight(0xffb066, 6.5);
  sun.position.set(-18, 22, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 55;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.bias = -0.0035;
  sun.shadow.normalBias = 0.09;
  sun.shadow.radius = 6;
  sun.shadow.blurSamples = 12;
  group.add(sun);
  group.add(sun.target);
  world.lights.push(sun);

  const hemi = new THREE.HemisphereLight(0x3a5a8a, 0x241c14, 1.1);
  group.add(hemi);
  world.lights.push(hemi);

  // Practical point lights (industrial lamps) with a cage fixture + mounting bracket,
  // subtle flicker, and contact shadows on the two most prominent lamps.
  const lampPositions: [number, number, number, number, boolean][] = [
    [-8, 6.2, -8, 0xffab6b, true],
    [8, 6.2, 8, 0x7fc4e8, true],
    [0, 6.2, -13, 0xffe0a3, false],
    [0, 3.4, 13, 0xff8866, false],
  ];
  const bracketMat = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.5, metalness: 0.6 });
  const flickerLights: { light: THREE.PointLight; base: number; phase: number }[] = [];
  for (const [x, y, z, color, shadows] of lampPositions) {
    const light = new THREE.PointLight(color, 22, 13, 2);
    light.position.set(x, y, z);
    light.castShadow = shadows;
    if (shadows) {
      light.shadow.mapSize.set(512, 512);
      light.shadow.camera.near = 0.3;
      light.shadow.camera.far = 14;
      light.shadow.bias = -0.002;
    }
    group.add(light);
    world.lights.push(light);
    flickerLights.push({ light, base: 22, phase: Math.random() * 10 });

    const fixtureGeo = new THREE.SphereGeometry(0.15, 12, 12);
    const fixtureMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.3, toneMapped: true });
    const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
    fixture.position.set(x, y, z);
    group.add(fixture);

    const cageGeo = new THREE.TorusGeometry(0.24, 0.015, 6, 16);
    for (const rot of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
      const ring = new THREE.Mesh(cageGeo, bracketMat);
      ring.position.set(x, y, z);
      ring.rotation.set(Math.PI / 2, rot, 0);
      group.add(ring);
    }

    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), bracketMat);
    bracket.position.set(x, y + 0.35, z);
    group.add(bracket);
  }

  world.spawnPoints.push(new THREE.Vector3(0, 1.7, 14));
  // Enemy group origin is ground level (leg meshes are built relative to y=0),
  // so spawn points must sit at y=0, not at some mid-body height.
  world.enemySpawns.push(
    new THREE.Vector3(-10, 0, -10),
    new THREE.Vector3(10, 0, -10),
    new THREE.Vector3(-10, 0, 10),
    new THREE.Vector3(10, 0, 10),
    new THREE.Vector3(0, 0.7, 0)
  );

  world.animate = (t) => {
    for (const fl of flickerLights) {
      const flicker = 1 + Math.sin(t * 8 + fl.phase) * 0.04 + (Math.random() - 0.5) * 0.03;
      fl.light.intensity = fl.base * flicker;
    }
  };

  return world;
}
