import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { FBXLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/PointerLockControls.js';
import { SimplexNoise } from 'https://unpkg.com/three@0.160.0/examples/jsm/math/SimplexNoise.js';
import { unzipSync } from './vendor/fflate.module.js';
import { unzipSync } from 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/index.js';

const MONSTER_ARCHIVE_URL = './assets/Archive.zip';

window.__LABYRINTH_ECHO_BUILD__ = 'fbx-maze';
console.info('Labyrinth Echo runtime module loaded');
const DESIRED_MONSTER_HEIGHT = 2.8;

const canvas = document.getElementById('scene');
const interactionText = document.getElementById('interaction');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010101);
scene.fog = new THREE.FogExp2(0x040404, 0.08);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const listener = new THREE.AudioListener();
camera.add(listener);
const positionalAudio = new THREE.PositionalAudio(listener);

const audioLoader = new THREE.AudioLoader();
audioLoader.load(
  'https://cdn.jsdelivr.net/gh/anars/blank-audio@master/15-seconds-of-silence.mp3',
  (buffer) => {
    positionalAudio.setBuffer(buffer);
    positionalAudio.setRefDistance(6);
    positionalAudio.setLoop(true);
    positionalAudio.setPlaybackRate(0.75);
    positionalAudio.setVolume(0.35);
    positionalAudio.play();
  },
);

const monsterAudioOffset = new THREE.Vector3(0, 1.5, 0);
const laughterSource = new THREE.Object3D();
laughterSource.add(positionalAudio);
scene.add(laughterSource);

const collisionBoxes = [];
const mixers = [];

const monsterState = {
  object: null,
  mixer: null,
  actions: {},
  currentAction: null,
  patrolPoints: [],
  targetIndex: 0,
  mode: 'dormant',
};

const keyStates = {};
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const previousPlayerPosition = new THREE.Vector3();
const monsterDirection = new THREE.Vector3();
let sprintTimer = 0;
let ritualsCompleted = 0;

const playerCollider = new THREE.Sphere(new THREE.Vector3(), 1.2);

const environment = createEnvironment();
monsterState.patrolPoints = environment.monsterPatrolPoints;
controls.getObject().position.set(environment.playerStart.x, 1.7, environment.playerStart.z);
playerCollider.center.copy(controls.getObject().position);

laughterSource.position.copy(environment.monsterSpawn.clone().add(monsterAudioOffset));

createLighting(environment.lightAnchors);
const updateMist = createMistParticles(environment.bounds);
const interactables = createInteractables(environment.altarSpots);
const chaseThreshold = Math.max(1, Math.min(interactables.length, 2));

loadMonsterFromArchive()
  .then(({ object, mixer, actions }) => {
    monsterState.object = object;
    monsterState.mixer = mixer;
    monsterState.actions = actions;
    mixers.push(mixer);

    object.position.copy(environment.monsterSpawn);
    object.position.y = 0;
    scene.add(object);

    playMonsterAction('idle', 0.1);
    setMonsterMode('patrol');

    interactionText.textContent = 'Stay quiet. Footsteps echo somewhere ahead...';
  })
  .catch((error) => {
    console.error('Failed to load monster', error);
    interactionText.textContent = 'Place assets/Archive.zip with the FBX monster to awaken the maze.';
  });

const clock = new THREE.Clock();
let flickerTimer = 0;

document.addEventListener('click', () => controls.lock());

document.addEventListener('keydown', (event) => {
  keyStates[event.code] = true;
  if (event.code === 'Space' && controls.isLocked) {
    attemptInteraction(chaseThreshold);
  }
});

document.addEventListener('keyup', (event) => {
  keyStates[event.code] = false;
});

controls.addEventListener('lock', () => {
  interactionText.textContent = 'The maze exhales as you step inside...';
});

controls.addEventListener('unlock', () => {
  interactionText.textContent = 'Click to re-enter the labyrinth.';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);
  updatePlayer(delta);
  updateMonster(delta);
  updateFlicker(delta);

  mixers.forEach((mixer) => mixer.update(delta));
  if (updateMist) {
    updateMist(delta);
  }

  renderer.render(scene, camera);
}

animate();

function updatePlayer(delta) {
  if (!controls.isLocked) return;

  previousPlayerPosition.copy(controls.getObject().position);

  const speed = keyStates['ShiftLeft'] || keyStates['ShiftRight'] ? 22 : 10.5;
  if (keyStates['ShiftLeft'] || keyStates['ShiftRight']) {
    sprintTimer = Math.min(sprintTimer + delta * 0.7, 1);
  } else {
    sprintTimer = Math.max(sprintTimer - delta * 0.8, 0);
  }

  velocity.x -= velocity.x * 8.0 * delta;
  velocity.z -= velocity.z * 8.0 * delta;

  direction.set(0, 0, 0);
  if (keyStates['KeyW']) direction.z -= 1;
  if (keyStates['KeyS']) direction.z += 1;
  if (keyStates['KeyA']) direction.x -= 1;
  if (keyStates['KeyD']) direction.x += 1;

  if (direction.lengthSq() > 0) {
    direction.normalize();
  }

  const currentSpeed = speed + sprintTimer * 12;
  if (direction.z !== 0) velocity.z -= direction.z * currentSpeed * delta;
  if (direction.x !== 0) velocity.x -= direction.x * currentSpeed * delta;

  controls.moveRight(-velocity.x * delta);
  controls.moveForward(-velocity.z * delta);

  const position = controls.getObject().position;
  if (isColliding(position)) {
    position.copy(previousPlayerPosition);
    velocity.set(0, velocity.y, 0);
  }

  position.y = THREE.MathUtils.clamp(position.y, 1.6, 1.82);
  playerCollider.center.copy(position);
  checkInteractions();
}

function isColliding(position) {
  for (const box of collisionBoxes) {
    if (box.containsPoint(position)) {
      return true;
    }
  }
  return false;
}

function updateFlicker(delta) {
  flickerTimer += delta;
  const intensity = 0.5 + Math.sin(flickerTimer * 6.8) * 0.3 + Math.random() * 0.12;
  scene.traverse((object) => {
    if (object.isLight && object.userData?.type === 'flicker') {
      object.intensity = THREE.MathUtils.lerp(object.intensity, intensity, 0.3);
    }
  });
}

function createLighting(anchors) {
  const ambient = new THREE.AmbientLight(0x110507, 0.55);
  scene.add(ambient);

  anchors.forEach((anchor) => {
    const light = new THREE.SpotLight(0xff2b2b, 1.7, 22, Math.PI / 5, 0.6, 1.15);
    light.position.set(anchor.x, anchor.y, anchor.z);
    light.target.position.set(anchor.x, 0, anchor.z);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0004;
    light.userData.type = 'flicker';
    scene.add(light);
    scene.add(light.target);

    const fixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 0.6, 12),
      new THREE.MeshStandardMaterial({
        color: 0x240505,
        emissive: new THREE.Color(0x360000),
        emissiveIntensity: 0.6,
        roughness: 0.45,
      }),
    );
    fixture.position.set(anchor.x, anchor.y - 0.4, anchor.z);
    fixture.rotation.x = Math.PI / 2;
    scene.add(fixture);
  });
}

function createEnvironment() {
  const mazeLayout = [
    '############',
    '#S..+..#..M#',
    '##.#.#.##.##',
    '#.+..#.+..##',
    '#.####.##.##',
    '#.....+...##',
    '############',
  ];

  const cellSize = 7;
  const wallHeight = 5;
  const cols = mazeLayout[0].length;
  const rows = mazeLayout.length;
  const originX = -((cols - 1) * cellSize) / 2;
  const originZ = -((rows - 1) * cellSize) / 2;

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x190a0a,
    roughness: 0.96,
    metalness: 0.04,
  });
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0x050404,
    roughness: 0.82,
    metalness: 0.08,
    side: THREE.BackSide,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x250505,
    roughness: 0.45,
    metalness: 0.22,
    emissive: new THREE.Color(0x250000),
    emissiveIntensity: 0.28,
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x050101,
    roughness: 0.84,
    metalness: 0.12,
  });

  const floorGeometry = new THREE.PlaneGeometry(cellSize, cellSize);
  floorGeometry.rotateX(-Math.PI / 2);

  const ceilingGeometry = new THREE.PlaneGeometry(cellSize, cellSize);
  ceilingGeometry.rotateX(Math.PI / 2);

  const wallGeometry = new THREE.BoxGeometry(cellSize, wallHeight, cellSize);
  const trimGeometry = new THREE.BoxGeometry(cellSize, 0.18, cellSize);

  const noise = new SimplexNoise();
  const lightAnchors = [];
  const altarCandidates = [];
  const monsterPatrolPoints = [];
  let playerStart = new THREE.Vector3(0, 0, 0);
  let monsterSpawn = new THREE.Vector3(0, 0, 0);

  for (let row = 0; row < rows; row += 1) {
    const line = mazeLayout[row];
    for (let col = 0; col < cols; col += 1) {
      const cell = line[col];
      const worldX = originX + col * cellSize;
      const worldZ = originZ + row * cellSize;

      if (cell === '#') {
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(worldX, wallHeight / 2, worldZ);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);

        const box = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(worldX, wallHeight / 2, worldZ),
          new THREE.Vector3(cellSize * 0.92, wallHeight, cellSize * 0.92),
        );
        collisionBoxes.push(box);
        continue;
      }

      const heightJitter = noise.noise(worldX * 0.12, worldZ * 0.12) * 0.22;
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.set(worldX, heightJitter - 0.04, worldZ);
      floor.receiveShadow = true;
      scene.add(floor);

      const trim = new THREE.Mesh(trimGeometry, trimMaterial);
      trim.position.set(worldX, heightJitter + 0.01, worldZ);
      trim.receiveShadow = true;
      scene.add(trim);

      const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
      ceiling.position.set(worldX, wallHeight - 0.1, worldZ);
      scene.add(ceiling);

      if (cell === 'S') {
        playerStart = new THREE.Vector3(worldX, 0, worldZ);
      }
      if (cell === 'M') {
        monsterSpawn = new THREE.Vector3(worldX, 0, worldZ);
        lightAnchors.push(new THREE.Vector3(worldX, wallHeight - 0.4, worldZ));
      }

      if (cell === '+' || cell === 'M') {
        monsterPatrolPoints.push(new THREE.Vector3(worldX, 0, worldZ));
        lightAnchors.push(new THREE.Vector3(worldX, wallHeight - 0.4, worldZ));
      } else if (cell === '.' && (row + col) % 3 === 0) {
        altarCandidates.push(new THREE.Vector3(worldX, 0, worldZ));
      }

      if ((row + col) % 4 === 0) {
        const column = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.35, wallHeight, 6),
          trimMaterial,
        );
        column.position.set(worldX - cellSize / 2 + 0.4, wallHeight / 2, worldZ + cellSize / 2 - 0.4);
        column.castShadow = true;
        scene.add(column);
      }
    }
  }

  const anchorKeys = new Set();
  const uniqueAnchors = [];
  lightAnchors.forEach((anchor) => {
    const key = `${anchor.x.toFixed(2)}|${anchor.z.toFixed(2)}`;
    if (!anchorKeys.has(key)) {
      anchorKeys.add(key);
      uniqueAnchors.push(anchor);
    }
  });

  const altarSpots = altarCandidates.slice(0, 4);

  return {
    playerStart,
    monsterSpawn,
    monsterPatrolPoints,
    altarSpots,
    lightAnchors: uniqueAnchors,
    bounds: {
      width: cols * cellSize,
      depth: rows * cellSize,
    },
  };
}

function createMistParticles(bounds) {
  const particleGeometry = new THREE.BufferGeometry();
  const particleCount = 1100;
  const positions = new Float32Array(particleCount * 3);
  const speeds = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * bounds.width * 0.9;
    positions[i * 3 + 1] = 0.4 + Math.random() * 3.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * bounds.depth * 0.9;
    speeds[i] = 0.3 + Math.random() * 0.7;
  }

  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

  const particleMaterial = new THREE.PointsMaterial({
    color: 0xaa2020,
    size: 0.7,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  const mist = new THREE.Points(particleGeometry, particleMaterial);
  mist.name = 'mist';
  scene.add(mist);

  return (delta) => {
    const posAttr = mist.geometry.getAttribute('position');
    const speedAttr = mist.geometry.getAttribute('speed');
    const time = performance.now() * 0.001;

    for (let i = 0; i < posAttr.count; i += 1) {
      const speed = speedAttr.getX(i);
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      x += Math.sin(time * 0.4 + z * 0.08) * delta * 0.9;
      y += Math.cos(time + x * 0.25) * delta * 0.5;
      z += speed * delta * 1.5;

      if (z > bounds.depth / 2) {
        z = -bounds.depth / 2;
      }
      if (x > bounds.width / 2) {
        x = -bounds.width / 2;
      } else if (x < -bounds.width / 2) {
        x = bounds.width / 2;
      }

      posAttr.setXYZ(i, x, THREE.MathUtils.clamp(y, 0.4, 4.6), z);
    }

    posAttr.needsUpdate = true;
  };
}

async function loadMonsterFromArchive() {
  const response = await fetch(MONSTER_ARCHIVE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch monster archive (${response.status})`);
  }

  const archiveBuffer = await response.arrayBuffer();
  const archive = unzipSync(new Uint8Array(archiveBuffer));

  let fbxBytes = null;
  const textureURLs = new Map();
  const temporaryURLs = [];

  for (const [name, data] of Object.entries(archive)) {
    const normalized = normalizePath(name);
    const extension = normalized.split('.').pop();
    if (!extension) continue;

    if (extension === 'fbx' && !fbxBytes) {
      fbxBytes = data;
      continue;
    }

    if (['png', 'jpg', 'jpeg', 'tga', 'bmp', 'webp'].includes(extension)) {
      const mimeType =
        extension === 'png'
          ? 'image/png'
          : extension === 'webp'
          ? 'image/webp'
          : extension === 'bmp'
          ? 'image/bmp'
          : 'image/jpeg';
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      textureURLs.set(normalized, url);
      temporaryURLs.push(url);
    }
  }

  if (!fbxBytes) {
    throw new Error('Archive.zip did not contain an FBX model.');
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const normalized = normalizePath(url);
    if (textureURLs.has(normalized)) {
      return textureURLs.get(normalized);
    }
    const basename = normalized.split('/').pop();
    if (basename) {
      for (const [key, value] of textureURLs.entries()) {
        if (key.endsWith(basename)) {
          return value;
        }
      }
    }
    return url;
  });

  const cleanup = () => {
    while (temporaryURLs.length > 0) {
      const url = temporaryURLs.pop();
      URL.revokeObjectURL(url);
    }
  };

  manager.onError = cleanup;
  manager.onAbort = cleanup;

  const loader = new FBXLoader(manager);
  const arrayBuffer = fbxBytes.buffer.slice(fbxBytes.byteOffset, fbxBytes.byteOffset + fbxBytes.byteLength);

  const object = loader.parse(arrayBuffer, './');
  const container = new THREE.Group();
  container.name = 'Monster';
  container.add(object);

  container.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material?.map) {
        child.material.map.anisotropy = 8;
      }
    }
  });

  const bounds = new THREE.Box3().setFromObject(container);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  if (size.y > 0) {
    const scale = DESIRED_MONSTER_HEIGHT / size.y;
    container.scale.setScalar(scale);
  }
  bounds.setFromObject(container);
  container.position.y -= bounds.min.y;

  const mixer = new THREE.AnimationMixer(container);
  const clips = object.animations && object.animations.length > 0 ? object.animations : loader.animations || [];

  const findClip = (keywords) =>
    clips.find((clip) => keywords.some((keyword) => clip.name.toLowerCase().includes(keyword))) || null;

  const idleClip = findClip(['idle', 'breath', 'stand']) || clips[0] || null;
  const walkClip = findClip(['walk', 'prowl', 'pace']) || idleClip;
  const attackClip = findClip(['attack', 'scream', 'lunge', 'hit']) || walkClip;

  const actions = {
    idle: idleClip ? mixer.clipAction(idleClip) : null,
    walk: walkClip ? mixer.clipAction(walkClip) : null,
    attack: attackClip ? mixer.clipAction(attackClip) : null,
  };

  if (!actions.walk && actions.idle) {
    actions.walk = actions.idle;
  }
  if (!actions.attack && (actions.walk || actions.idle)) {
    actions.attack = actions.walk || actions.idle;
  }

  manager.onLoad = cleanup;

  return { object: container, mixer, actions };
}

function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function playMonsterAction(name, fade = 0.45) {
  const action = monsterState.actions[name];
  if (!action || monsterState.currentAction === action) {
    return;
  }

  action.reset().fadeIn(fade).play();
  if (monsterState.currentAction) {
    monsterState.currentAction.fadeOut(fade * 0.8);
  }
  monsterState.currentAction = action;
}

function setMonsterMode(mode) {
  if (monsterState.mode === mode) return;
  monsterState.mode = mode;

  if (mode === 'patrol') {
    playMonsterAction('walk', 0.6);
  } else if (mode === 'chase') {
    playMonsterAction('attack', 0.2);
  } else {
    playMonsterAction('idle', 0.6);
  }
}

function updateMonster(delta) {
  if (!monsterState.object) return;

  let targetPosition = null;
  if (monsterState.mode === 'chase') {
    targetPosition = controls.getObject().position;
  } else if (monsterState.patrolPoints.length > 0) {
    targetPosition = monsterState.patrolPoints[monsterState.targetIndex];
  }

  const monsterPosition = monsterState.object.position;
  if (targetPosition) {
    monsterDirection.copy(targetPosition).sub(monsterPosition);
    const distance = monsterDirection.length();

    if (distance > 0.05) {
      monsterDirection.normalize();
      const speed = monsterState.mode === 'chase' ? 3.6 : 1.6;
      monsterPosition.addScaledVector(monsterDirection, speed * delta);
      monsterState.object.position.y = 0;
      monsterState.object.rotation.y = Math.atan2(monsterDirection.x, monsterDirection.z);

      if (monsterState.mode === 'patrol' && distance < 0.6) {
        monsterState.targetIndex = (monsterState.targetIndex + 1) % monsterState.patrolPoints.length;
      }
    }
  }

  laughterSource.position.copy(monsterPosition).add(monsterAudioOffset);

  const playerDistance = monsterPosition.distanceTo(controls.getObject().position);
  if (monsterState.mode === 'chase') {
    if (playerDistance < 1.5) {
      interactionText.textContent = 'It caught you. The maze inhales.';
      interactionText.classList.add('active');
    } else {
      interactionText.textContent = 'Run. The footsteps are right behind you!';
      interactionText.classList.add('active');
    }
  } else if (playerDistance < 7) {
    interactionText.textContent = 'Stay quiet. Something is pacing nearby.';
    interactionText.classList.add('active');
  }
}

function createInteractables(spots) {
  const interactableObjects = [];
  if (!spots || spots.length === 0) {
    return interactableObjects;
  }

  const geometry = new THREE.BoxGeometry(1.6, 0.4, 1.6);
  const material = new THREE.MeshStandardMaterial({
    color: 0x1f0707,
    roughness: 0.8,
    metalness: 0.1,
  });

  spots.forEach((spot, index) => {
    const altar = new THREE.Mesh(geometry, material);
    altar.position.set(spot.x, 0.2, spot.z);
    altar.castShadow = true;
    altar.receiveShadow = true;
    altar.userData = {
      interacted: false,
      message: index === 0 ? 'Press SPACE to steady the whispers' : 'Press SPACE to hush the next whisper',
    };

    const candle = new THREE.PointLight(0xff5a2a, 0.9, 10, 2.2);
    candle.position.set(spot.x, 1.3, spot.z);
    candle.userData.type = 'flicker';
    candle.castShadow = true;

    scene.add(altar);
    scene.add(candle);

    interactableObjects.push(altar);
  });

  return interactableObjects;
}

function checkInteractions() {
  let nearest = null;
  let minDistance = Infinity;

  for (const object of interactables) {
    const distance = object.position.distanceTo(playerCollider.center);
    if (distance < 3 && distance < minDistance) {
      nearest = object;
      minDistance = distance;
    }
  }

  if (nearest) {
    if (!nearest.userData.interacted) {
      interactionText.textContent = nearest.userData.message;
    } else if (monsterState.mode !== 'chase') {
      interactionText.textContent = 'The air is listening for you...';
    }
    interactionText.classList.add('active');
  } else if (monsterState.mode !== 'chase') {
    interactionText.textContent = 'Trace the whispers threading through the maze...';
    interactionText.classList.remove('active');
  }
}

function attemptInteraction(threshold) {
  let nearest = null;
  let minDistance = Infinity;

  for (const object of interactables) {
    const distance = object.position.distanceTo(playerCollider.center);
    if (distance < 3 && distance < minDistance) {
      nearest = object;
      minDistance = distance;
    }
  }

  if (nearest && !nearest.userData.interacted) {
    nearest.userData.interacted = true;
    ritualsCompleted += 1;
    interactionText.textContent = 'The whisper cuts out. Something else stirs.';
    interactionText.classList.add('active');

    scene.traverse((object) => {
      if (object.isLight && object.userData?.type === 'flicker') {
        object.intensity += 0.4;
      }
    });

    if (ritualsCompleted >= threshold) {
      setMonsterMode('chase');
      interactionText.textContent = 'Run. The creature is hunting you now!';
      interactionText.classList.add('active');
    }
  }
}
