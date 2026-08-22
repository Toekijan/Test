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
  const hazard = makeHazardTrimMaps(8);
  const crateMaps = makeCrateMaps(1);

  const floorMat = pbrMaterial(concrete, { roughness: 0.95, metalness: 0.05, color: 0xffffff });
  const wallMat = pbrMaterial(metal, { roughness: 0.55, metalness: 0.75, color: 0xffffff });
  const trimMat = pbrMaterial(hazard, { roughness: 0.6, metalness: 0.2, color: 0xffffff, emissive: 0x1a1400, emissiveIntensity: 0.15 });
  const crateMat = pbrMaterial(crateMaps, { roughness: 0.85, metalness: 0.0, color: 0xffffff });

  // Floor
  box(ARENA_SIZE, 1, ARENA_SIZE, floorMat, new THREE.Vector3(0, -0.5, 0), world, physicsWorld, 0);

  // Ceiling (industrial, keeps interior lighting contained + adds silhouette variety)
  const ceilingMat = pbrMaterial(metal, { roughness: 0.9, metalness: 0.3, color: 0x1a1c20 });
  box(ARENA_SIZE, 0.6, ARENA_SIZE, ceilingMat, new THREE.Vector3(0, WALL_HEIGHT, 0), world, physicsWorld, 0);

  // Perimeter walls with a gap (entrances) on N/S for sightlines
  const half = ARENA_SIZE / 2;
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
  const sun = new THREE.DirectionalLight(0xffb066, 9);
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

  const hemi = new THREE.HemisphereLight(0x3a5a8a, 0x1a1410, 3.2);
  group.add(hemi);
  world.lights.push(hemi);

  // Practical point lights (industrial lamps) with subtle flicker for atmosphere
  const lampPositions: [number, number, number, number][] = [
    [-8, 6.2, -8, 0xffab6b],
    [8, 6.2, 8, 0x7fc4e8],
    [0, 6.2, -13, 0xffe0a3],
    [0, 3.4, 13, 0xff8866],
  ];
  const flickerLights: { light: THREE.PointLight; base: number; phase: number }[] = [];
  for (const [x, y, z, color] of lampPositions) {
    const light = new THREE.PointLight(color, 26, 14, 2);
    light.position.set(x, y, z);
    light.castShadow = false;
    group.add(light);
    world.lights.push(light);
    flickerLights.push({ light, base: 26, phase: Math.random() * 10 });

    const fixtureGeo = new THREE.SphereGeometry(0.18, 12, 12);
    const fixtureMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3, roughness: 0.3 });
    const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
    fixture.position.set(x, y, z);
    group.add(fixture);
  }

  world.spawnPoints.push(new THREE.Vector3(0, 1.7, 14));
  world.enemySpawns.push(
    new THREE.Vector3(-10, 1, -10),
    new THREE.Vector3(10, 1, -10),
    new THREE.Vector3(-10, 1, 10),
    new THREE.Vector3(10, 1, 10),
    new THREE.Vector3(0, 1.8, 0)
  );

  world.animate = (t) => {
    for (const fl of flickerLights) {
      const flicker = 1 + Math.sin(t * 8 + fl.phase) * 0.04 + (Math.random() - 0.5) * 0.03;
      fl.light.intensity = fl.base * flicker;
    }
  };

  return world;
}
