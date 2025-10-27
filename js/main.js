import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { unzipSync } from './vendor/fflate.module.js';

const MONSTER_ARCHIVE_URL = './assets/Archive.zip';

window.__LABYRINTH_ECHO_BUILD__ = 'fbx-maze';
console.info('Labyrinth Echo runtime module loaded');
const DESIRED_MONSTER_HEIGHT = 2.8;

const canvas = document.getElementById('scene');
const interactionText = document.getElementById('interaction');
const restartButton = document.getElementById('restart-button');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080202);
scene.fog = new THREE.FogExp2(0x120202, 0.06);

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
  mode: 'dormant',
};

const keyStates = {};
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const previousPlayerPosition = new THREE.Vector3();
const monsterDirection = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const tempVector = new THREE.Vector3();
let sprintTimer = 0;

const gameState = {
  phase: 'approach',
  triggered: false,
  ambushTimer: 0,
  movementLocked: false,
  ended: false,
};

const playerCollider = new THREE.Sphere(new THREE.Vector3(), 1.2);

const environment = createEnvironment();
controls.getObject().position.set(environment.playerStart.x, 1.7, environment.playerStart.z);
playerCollider.center.copy(controls.getObject().position);

laughterSource.position.copy(environment.monsterSpawn.clone().add(monsterAudioOffset));

createLighting(environment.lightAnchors);
const updateMist = null;

loadMonsterFromArchive()
  .then(({ object, mixer, actions }) => {
    monsterState.object = object;
    monsterState.mixer = mixer;
    monsterState.actions = actions;
    mixers.push(mixer);

    object.visible = false;
    object.position.copy(environment.monsterSpawn);
    object.position.y = 0;
    scene.add(object);

    playMonsterAction('idle', 0.1);
    setMonsterMode('dormant');

    interactionText.textContent = 'Walk forward. Something hums beyond the bend...';
    interactionText.classList.add('active');
  })
  .catch((error) => {
    console.error('Failed to load monster', error);
    interactionText.textContent = 'Place assets/Archive.zip with the FBX monster to awaken the maze.';
  });

const clock = new THREE.Clock();
let flickerTimer = 0;

document.addEventListener('click', () => {
  if (!gameState.ended) {
    controls.lock();
  }
});

document.addEventListener('keydown', (event) => {
  keyStates[event.code] = true;
});

document.addEventListener('keyup', (event) => {
  keyStates[event.code] = false;
});

controls.addEventListener('lock', () => {
  if (gameState.ended) return;
  interactionText.textContent =
    gameState.phase === 'approach'
      ? 'Step forward. The hallway forces you ahead.'
      : 'Keep moving. The monster is right behind you!';
  interactionText.classList.add('active');
});

controls.addEventListener('unlock', () => {
  if (gameState.ended) {
    interactionText.textContent = 'Click Restart to try again.';
  } else {
    interactionText.textContent = 'Click to re-enter the hallway.';
  }
});

restartButton.addEventListener('click', () => {
  window.location.reload();
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
  updateAmbush(delta);
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
  const playerObject = controls.getObject();
  const position = playerObject.position;

  if (!controls.isLocked) {
    playerCollider.center.copy(position);
    return;
  }

  if (gameState.ended) {
    velocity.x = 0;
    velocity.z = 0;
    playerCollider.center.copy(position);
    return;
  }

  previousPlayerPosition.copy(position);

  if (gameState.movementLocked) {
    velocity.x = 0;
    velocity.z = 0;
    playerCollider.center.copy(position);
    checkChaseTrigger();
    checkWinCondition();
    return;
  }

  const speed = keyStates['ShiftLeft'] || keyStates['ShiftRight'] ? 12.5 : 7.5;
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

  const currentSpeed = speed + sprintTimer * 8;
  if (direction.z !== 0) velocity.z -= direction.z * currentSpeed * delta;
  if (direction.x !== 0) velocity.x -= direction.x * currentSpeed * delta;

  controls.moveRight(-velocity.x * delta);
  controls.moveForward(-velocity.z * delta);

  if (isColliding(position)) {
    position.copy(previousPlayerPosition);
    velocity.set(0, velocity.y, 0);
  }

  position.y = THREE.MathUtils.clamp(position.y, 1.6, 1.82);
  playerCollider.center.copy(position);
  checkChaseTrigger();
  checkWinCondition();
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
  const ambient = new THREE.AmbientLight(0x1a0808, 0.64);
  scene.add(ambient);

  anchors.forEach((anchor, index) => {
    if (index % 2 !== 0) {
      return;
    }

    const light = new THREE.PointLight(0xff3a20, 1.4, 24, 2.2);
    light.position.set(anchor.x, anchor.y, anchor.z);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0006;
    light.userData.type = 'flicker';
    scene.add(light);

    const fixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.3, 0.5, 12),
      new THREE.MeshStandardMaterial({
        color: 0x2a0606,
        emissive: new THREE.Color(0x4c0000),
        emissiveIntensity: 0.55,
        roughness: 0.38,
      }),
    );
    fixture.position.set(anchor.x, anchor.y - 0.28, anchor.z);
    fixture.rotation.x = Math.PI / 2;
    scene.add(fixture);
  });
}

function createEnvironment() {
  const mazeLayout = [
    '#############',
    '###....#..C##',
    '###.##.#.####',
    '###.#......##',
    '###.#..#.#.##',
    '###.#....#.##',
    '###...####.##',
    '######.T...##',
    '######.######',
    '######.######',
    '######.######',
    '######S######',
    '#############',
  ];

  const cellSize = 6;
  const wallHeight = 4.4;
  const cols = mazeLayout[0].length;
  const rows = mazeLayout.length;
  const originX = -((cols - 1) * cellSize) / 2;
  const originZ = -((rows - 1) * cellSize) / 2;

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a1515,
    roughness: 0.92,
    metalness: 0.08,
  });
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0x080404,
    roughness: 0.78,
    metalness: 0.12,
    side: THREE.BackSide,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a1616,
    roughness: 0.5,
    metalness: 0.18,
    emissive: new THREE.Color(0x1a0000),
    emissiveIntensity: 0.2,
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a0404,
    roughness: 0.88,
    metalness: 0.1,
  });

  const floorGeometry = new THREE.PlaneGeometry(cellSize, cellSize);
  floorGeometry.rotateX(-Math.PI / 2);

  const ceilingGeometry = new THREE.PlaneGeometry(cellSize, cellSize);
  ceilingGeometry.rotateX(Math.PI / 2);

  const wallGeometry = new THREE.BoxGeometry(cellSize, wallHeight, cellSize);
  const trimGeometry = new THREE.BoxGeometry(cellSize, 0.12, cellSize);

  const lightAnchors = [];
  let playerStart = new THREE.Vector3(0, 0, 0);
  let monsterSpawn = new THREE.Vector3(0, 0, 0);
  let chaseTrigger = null;
  let goalPosition = null;

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

      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.position.set(worldX, -0.06, worldZ);
      floor.receiveShadow = true;
      scene.add(floor);

      const trim = new THREE.Mesh(trimGeometry, trimMaterial);
      trim.position.set(worldX, 0.02, worldZ);
      trim.receiveShadow = true;
      scene.add(trim);

      const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
      ceiling.position.set(worldX, wallHeight - 0.18, worldZ);
      scene.add(ceiling);

      const anchor = new THREE.Vector3(worldX, wallHeight - 0.6, worldZ);
      lightAnchors.push(anchor);

      if (cell === 'S') {
        playerStart = new THREE.Vector3(worldX, 0, worldZ);
      }
      if (cell === 'T') {
        chaseTrigger = new THREE.Vector3(worldX, 0, worldZ);
        monsterSpawn = chaseTrigger.clone();
      }
      if (cell === 'C') {
        goalPosition = new THREE.Vector3(worldX, 0, worldZ);
      }
    }
  }

  if (!monsterSpawn) {
    monsterSpawn = playerStart.clone();
  }
  if (!chaseTrigger) {
    chaseTrigger = monsterSpawn.clone();
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

  return {
    playerStart,
    monsterSpawn,
    chaseTrigger,
    goalPosition,
    lightAnchors: uniqueAnchors,
    bounds: {
      width: cols * cellSize,
      depth: rows * cellSize,
    },
    cellSize,
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
  let clips = object.animations && object.animations.length > 0 ? object.animations : loader.animations || [];

  clips = clips
    .map((clip) => {
      if (!clip) return null;

      clip.tracks = clip.tracks.filter((track) => {
        if (!track || !track.times || track.times.length === 0) return false;
        if (track._projxEmptyTrack) return false;
        return track.times.length > 1 || track.times[0] !== track.times[track.times.length - 1];
      });

      if (clip.tracks.length === 0) {
        return null;
      }

      clip.resetDuration();
      return clip;
    })
    .filter((clip) => clip && clip.tracks.length > 0 && clip.duration > 0);

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

  if (mode === 'ambush') {
    playMonsterAction('attack', 0.3);
  } else if (mode === 'chase') {
    playMonsterAction('walk', 0.25);
  } else {
    playMonsterAction('idle', 0.5);
  }
}

function updateMonster(delta) {
  if (!monsterState.object || !monsterState.object.visible) return;

  const monsterPosition = monsterState.object.position;
  const playerPosition = controls.getObject().position;

  if (monsterState.mode === 'ambush') {
    monsterState.object.lookAt(playerPosition.x, 1.6, playerPosition.z);
    laughterSource.position.copy(monsterPosition).add(monsterAudioOffset);
    return;
  }

  if (monsterState.mode === 'chase') {
    monsterDirection.copy(playerPosition).sub(monsterPosition);
    const distance = monsterDirection.length();

    if (distance > 0.05) {
      monsterDirection.normalize();
      const baseSpeed = 4.2;
      const speed = baseSpeed + Math.min(1.8, sprintTimer * 1.2);
      monsterPosition.addScaledVector(monsterDirection, speed * delta);
      monsterState.object.position.y = 0;
      monsterState.object.rotation.y = Math.atan2(monsterDirection.x, monsterDirection.z);
    }

    laughterSource.position.copy(monsterPosition).add(monsterAudioOffset);

    const playerDistance = monsterPosition.distanceTo(playerPosition);
    if (!gameState.ended) {
      interactionText.textContent =
        playerDistance < 3
          ? "Don't look back. It's breathing on your neck."
          : 'Run. The monster is right behind you!';
      interactionText.classList.add('active');
    }

    if (playerDistance < 1.15) {
      endGame('caught');
    }
    return;
  }

  laughterSource.position.copy(monsterPosition).add(monsterAudioOffset);
}

function checkChaseTrigger() {
  if (gameState.triggered || gameState.ended || !environment.chaseTrigger) return;

  const triggerRadius = environment.cellSize * 0.45;
  const distanceSq = controls
    .getObject()
    .position.distanceToSquared(environment.chaseTrigger);

  if (distanceSq < triggerRadius * triggerRadius) {
    triggerAmbush();
  }
}

function triggerAmbush() {
  if (!monsterState.object) return;

  gameState.triggered = true;
  gameState.phase = 'ambush';
  gameState.movementLocked = true;
  gameState.ambushTimer = 0;

  const playerObject = controls.getObject();
  const playerPosition = playerObject.position;
  controls.getDirection(forwardVector);
  forwardVector.y = 0;
  if (forwardVector.lengthSq() < 0.0001) {
    forwardVector.set(0, 0, -1);
  } else {
    forwardVector.normalize();
  }

  const ambushDistance = Math.max(environment.cellSize * 0.65, 3.5);
  tempVector.copy(playerPosition).addScaledVector(forwardVector, ambushDistance);

  monsterState.object.visible = true;
  monsterState.object.position.set(tempVector.x, 0, tempVector.z);
  monsterState.object.lookAt(playerPosition.x, 1.6, playerPosition.z);
  laughterSource.position.copy(monsterState.object.position).add(monsterAudioOffset);

  setMonsterMode('ambush');

  interactionText.textContent = 'It blocks the path. Turn around!';
  interactionText.classList.add('active');
}

function updateAmbush(delta) {
  if (gameState.phase !== 'ambush' || !monsterState.object) return;

  gameState.ambushTimer += delta;
  if (gameState.ambushTimer < 1.2) {
    return;
  }

  const yawObject = controls.getObject();
  yawObject.rotation.y = THREE.MathUtils.euclideanModulo(
    yawObject.rotation.y + Math.PI,
    Math.PI * 2,
  );

  gameState.phase = 'chase';
  gameState.movementLocked = false;

  setMonsterMode('chase');
  interactionText.textContent = 'Run! It\'s coming from behind!';
  interactionText.classList.add('active');
}

function checkWinCondition() {
  if (gameState.ended || !environment.goalPosition) return;

  const winRadius = environment.cellSize * 0.4;
  const distanceSq = controls
    .getObject()
    .position.distanceToSquared(environment.goalPosition);

  if (distanceSq < winRadius * winRadius) {
    endGame('survived');
  }
}

function endGame(outcome) {
  if (gameState.ended) return;

  gameState.ended = true;
  gameState.phase = outcome;
  gameState.movementLocked = true;

  const shouldHideMonster = outcome === 'survived';
  if (monsterState.object && shouldHideMonster) {
    monsterState.object.visible = false;
  }
  setMonsterMode('dormant');

  if (positionalAudio.isPlaying) {
    positionalAudio.stop();
  }

  const message =
    outcome === 'survived'
      ? 'You reach the maze heart. The creature loses you.'
      : 'The creature catches you. The maze swallows the light.';
  interactionText.textContent = `${message} Click Restart to try again.`;
  interactionText.classList.add('active');

  restartButton.classList.add('visible');

  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
}

// Legacy shrine interactivity was removed for the focused hallway scenario.
