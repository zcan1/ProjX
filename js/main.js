import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/PointerLockControls.js';
import { SimplexNoise } from 'https://unpkg.com/three@0.160.0/examples/jsm/math/SimplexNoise.js';

const CHARACTER_MODEL_URL = './assets/joy-character.glb';
const canvas = document.getElementById('scene');
const interactionText = document.getElementById('interaction');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020303);
scene.fog = new THREE.FogExp2(0x050505, 0.05);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);
const controls = new PointerLockControls(camera, document.body);
controls.getObject().position.set(0, 1.7, 5);
scene.add(controls.getObject());

const listener = new THREE.AudioListener();
camera.add(listener);
const positionalAudio = new THREE.PositionalAudio(listener);

const audioLoader = new THREE.AudioLoader();
audioLoader.load(
  'https://cdn.jsdelivr.net/gh/anars/blank-audio@master/15-seconds-of-silence.mp3',
  (buffer) => {
    positionalAudio.setBuffer(buffer);
    positionalAudio.setRefDistance(4);
    positionalAudio.setLoop(true);
    positionalAudio.setPlaybackRate(0.85);
    positionalAudio.setVolume(0.25);
    positionalAudio.play();
  },
);

const laughterSource = new THREE.Object3D();
laughterSource.position.set(0, 1.5, -45);
laughterSource.add(positionalAudio);
scene.add(laughterSource);

createLighting();
createEnvironment();
const updateMist = createMistParticles();

const mixers = [];
loadCharacter().then((model) => {
  laughterSource.add(model);
  model.position.set(0, -1.4, 0);
  model.rotation.y = Math.PI;
  interactionText.textContent = 'Follow the laughter, but do not stare too long...';
}).catch((error) => {
  console.error('Failed to load character', error);
  interactionText.textContent = 'Missing character asset. Place joy-character.glb in /assets.';
});

const keyStates = {};
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let sprintTimer = 0;

const clock = new THREE.Clock();

document.addEventListener('click', () => controls.lock());

document.addEventListener('keydown', (event) => {
  keyStates[event.code] = true;
  if (event.code === 'Space' && controls.isLocked) {
    attemptInteraction();
  }
});

document.addEventListener('keyup', (event) => {
  keyStates[event.code] = false;
});

controls.addEventListener('lock', () => {
  interactionText.textContent = 'Find the laughter...';
});

controls.addEventListener('unlock', () => {
  interactionText.textContent = 'Click to enter the dark.';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const interactables = createInteractables();
const playerCollider = new THREE.Sphere(new THREE.Vector3(), 1.2);

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);
  updatePlayer(delta);
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

  const speed = keyStates['ShiftLeft'] || keyStates['ShiftRight'] ? 24 : 12;
  if (keyStates['ShiftLeft'] || keyStates['ShiftRight']) {
    sprintTimer = Math.min(sprintTimer + delta * 0.5, 1);
  } else {
    sprintTimer = Math.max(sprintTimer - delta * 0.75, 0);
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

  const currentSpeed = speed + sprintTimer * 10;
  if (direction.z !== 0) velocity.z -= direction.z * currentSpeed * delta;
  if (direction.x !== 0) velocity.x -= direction.x * currentSpeed * delta;

  controls.moveRight(-velocity.x * delta);
  controls.moveForward(-velocity.z * delta);

  const position = controls.getObject().position;
  position.y = THREE.MathUtils.clamp(position.y, 1.6, 1.8);

  playerCollider.center.copy(position);
  checkInteractions();
}

let flickerTimer = 0;
function updateFlicker(delta) {
  flickerTimer += delta;
  const intensity = 0.5 + Math.sin(flickerTimer * 8.0) * 0.25 + Math.random() * 0.15;
  scene.traverse((object) => {
    if (object.isLight && object.userData?.type === 'flicker') {
      object.intensity = THREE.MathUtils.lerp(object.intensity, intensity, 0.25);
    }
  });
}

function createLighting() {
  const ambient = new THREE.AmbientLight(0x130606, 0.6);
  scene.add(ambient);

  const mainLight = new THREE.SpotLight(0xff1f1f, 2.5, 120, Math.PI / 6, 0.3, 0.8);
  mainLight.position.set(0, 20, 10);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(2048, 2048);
  mainLight.shadow.bias = -0.001;
  mainLight.target.position.set(0, 0, -30);
  mainLight.userData.type = 'flicker';
  scene.add(mainLight);
  scene.add(mainLight.target);

  for (let i = 0; i < 5; i += 1) {
    const torch = new THREE.PointLight(0xff3b3b, 1.6, 40, 2);
    torch.position.set((Math.random() - 0.5) * 120, 2.8, -Math.random() * 160);
    torch.castShadow = true;
    torch.userData.type = 'flicker';

    const torchMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.25, 2, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    );
    torchMesh.position.copy(torch.position).add(new THREE.Vector3(0, -1, 0));
    torchMesh.receiveShadow = true;
    torchMesh.castShadow = true;

    scene.add(torchMesh);
    scene.add(torch);
  }
}

function createEnvironment() {
  const noise = new SimplexNoise();
  const floorGeometry = new THREE.PlaneGeometry(400, 400, 180, 180);
  const positions = floorGeometry.attributes.position;

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const n = noise.noise(x * 0.02, y * 0.02);
    positions.setZ(i, n * 1.6);
  }
  floorGeometry.computeVertexNormals();

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x120808,
    metalness: 0.1,
    roughness: 0.95,
  });

  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const fogGeometry = new THREE.CylinderGeometry(120, 140, 40, 32, 4, true);
  const fogMaterial = new THREE.MeshBasicMaterial({
    color: 0x050707,
    transparent: true,
    opacity: 0.35,
    side: THREE.BackSide,
  });
  const fogWall = new THREE.Mesh(fogGeometry, fogMaterial);
  fogWall.position.y = 5;
  scene.add(fogWall);

  const skyGeometry = new THREE.SphereGeometry(200, 32, 32);
  const skyMaterial = new THREE.MeshBasicMaterial({
    color: 0x010101,
    side: THREE.BackSide,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(sky);
}

function createMistParticles() {
  const particleGeometry = new THREE.BufferGeometry();
  const particleCount = 1500;
  const positions = new Float32Array(particleCount * 3);
  const speeds = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 220;
    positions[i * 3 + 1] = Math.random() * 12;
    positions[i * 3 + 2] = -Math.random() * 200;
    speeds[i] = 0.4 + Math.random() * 0.6;
  }

  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

  const particleMaterial = new THREE.PointsMaterial({
    color: 0x882222,
    size: 0.9,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  const mist = new THREE.Points(particleGeometry, particleMaterial);
  mist.name = 'mist';

  scene.add(mist);

  const tempVec = new THREE.Vector3();
  return (delta) => {
    const pos = mist.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const speed = mist.geometry.attributes.speed.getX(i);
      tempVec.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      tempVec.z += speed * delta * 4;
      if (tempVec.z > 20) {
        tempVec.z = -200 - Math.random() * 50;
      }
      pos.setXYZ(i, tempVec.x, tempVec.y, tempVec.z);
    }
    pos.needsUpdate = true;
  };
}

async function loadCharacter() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  return new Promise((resolve, reject) => {
    loader.load(
      CHARACTER_MODEL_URL,
      (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        root.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material?.map) {
              child.material.map.anisotropy = 8;
            }
          }
        });

        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(root);
          const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'Idle') || gltf.animations[0];
          const action = mixer.clipAction(idleClip);
          action.play();
          mixers.push(mixer);
        }

        resolve(root);
      },
      undefined,
      (error) => reject(error),
    );
  });
}

function createInteractables() {
  const interactableObjects = [];
  const geometry = new THREE.BoxGeometry(2, 0.3, 2);
  const material = new THREE.MeshStandardMaterial({ color: 0x220202, roughness: 0.8 });

  for (let i = 0; i < 6; i += 1) {
    const altar = new THREE.Mesh(geometry, material);
    altar.position.set((Math.random() - 0.5) * 160, 0.15, -20 - Math.random() * 120);
    altar.castShadow = true;
    altar.receiveShadow = true;
    altar.userData = {
      interacted: false,
      message: 'Press SPACE to focus on the whispers',
    };

    const candle = new THREE.PointLight(0xff6600, 1, 12, 2);
    candle.position.set(altar.position.x, 1.2, altar.position.z);
    candle.userData.type = 'flicker';
    candle.castShadow = true;

    scene.add(altar);
    scene.add(candle);

    interactableObjects.push(altar);
  }

  return interactableObjects;
}

function checkInteractions() {
  let nearest = null;
  let minDistance = Infinity;

  for (const object of interactables) {
    const distance = object.position.distanceTo(playerCollider.center);
    if (distance < 3.5 && distance < minDistance) {
      nearest = object;
      minDistance = distance;
    }
  }

  if (nearest) {
    if (!nearest.userData.interacted) {
      interactionText.textContent = nearest.userData.message;
    } else {
      interactionText.textContent = 'Something woke in the dark...';
    }
    interactionText.classList.add('active');
  } else if (controls.isLocked) {
    interactionText.textContent = 'The cold mist bites at your skin';
    interactionText.classList.remove('active');
  }
}

function attemptInteraction() {
  let nearest = null;
  let minDistance = Infinity;

  for (const object of interactables) {
    const distance = object.position.distanceTo(playerCollider.center);
    if (distance < 3.5 && distance < minDistance) {
      nearest = object;
      minDistance = distance;
    }
  }

  if (nearest && !nearest.userData.interacted) {
    nearest.userData.interacted = true;
    interactionText.textContent = 'You hear footsteps behind you...';
    scene.traverse((object) => {
      if (object.isLight && object.userData?.type === 'flicker') {
        object.intensity += 0.6;
      }
    });
  }
}
