import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AudioLoader, AudioListener, Audio } from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

let gameRunning = false;
let gamePaused = false;
let gameStartTime = 0;

const controllerState = {
  left: { x: 0, z: 0 },
  right: { x: 0, z: 0 }
};

const scene = new THREE.Scene();
const cameraGroup = new THREE.Group();
scene.add(cameraGroup);

cameraGroup.position.y = 50;
cameraGroup.position.z = -1;

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 150, 100);
cameraGroup.add(camera);

const modelPaths = {
  train: 'modeloTren/scene.gltf',
  barrier: 'modeloBarrera/scene.gltf'
};

const trackCount = 3;
const trackWidth = 300;
const trackSpacing = trackWidth / trackCount;

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const listener = new AudioListener();
camera.add(listener);
const audioLoader = new AudioLoader();
const backgroundMusic = new Audio(listener);

audioLoader.load('js/musica.mp3', (buffer) => {
  backgroundMusic.setBuffer(buffer);
  backgroundMusic.setLoop(true);
  backgroundMusic.setVolume(0.5);
});

const trackGroup = new THREE.Group();
scene.add(trackGroup);
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
let mixer;
const animationsMap = {};
let currentAction;

const animationFiles = {
  'Adelante': 'models/fbx/Adelante.fbx',
  'Izquierdo': 'models/fbx/Izquierdo.fbx',
  'Derecho': 'models/fbx/Derecho.fbx',
  'Saltar': 'models/fbx/Saltar.fbx',
  'Caer': 'models/fbx/Caer.fbx',
  'Alto': 'models/fbx/Alto.fbx',
  'Arrastre': 'models/fbx/Arrastre.fbx',
};

function loadAnimation(name, path) {
  fbxLoader.load(path, (anim) => {
    const action = mixer.clipAction(anim.animations[0]);
    animationsMap[name] = action;

    if (name === 'Alto' && !currentAction) {
      action.play();
      currentAction = action;
    }
  });
}

class Box extends THREE.Mesh {
  constructor({ width, height, depth, color = '#00ff00',
    velocity = { x: 0, y: 0, z: 0 },
    position = { x: 0, y: 0, z: 0 },
    zAcceleration = false }) {
    super(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color })
    );

    this.canJump = false;
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.position.set(position.x, position.y, position.z);
    this.velocity = velocity;
    this.gravity = -0.25;
    this.zAcceleration = zAcceleration;

    this.updateSides();
  }

  updateSides() {
    this.right = this.position.x + this.width / 2;
    this.left = this.position.x - this.width / 2;
    this.bottom = this.position.y - this.height / 2;
    this.top = this.position.y + this.height / 2;
    this.front = this.position.z + this.depth / 2;
    this.back = this.position.z - this.depth / 2;
  }

  update(ground) {
    this.updateSides();
    if (this.zAcceleration) this.velocity.z += 0.0003;
    this.position.x += this.velocity.x;
    this.position.z += this.velocity.z;
    this.applyGravity(ground);
  }

  applyGravity(ground) {
    this.velocity.y += this.gravity;
    if (boxCollision({ box1: this, box2: ground })) {
      this.velocity.y = 0;
      this.canJump = true;
      this.position.y = ground.top + this.height / 2;
    } else {
      this.canJump = false;
      this.position.y += this.velocity.y;
    }
  }
}
function boxCollision({ box1, box2 }) {
  const xCollision = box1.right >= box2.left && box1.left <= box2.right;
  const yCollision = box1.bottom + box1.velocity.y <= box2.top && box1.top >= box2.bottom;
  const zCollision = box1.front >= box2.back && box1.back <= box2.front;
  return xCollision && yCollision && zCollision;
}
const cube = new Box({
  width: 20,
  height: 25,
  depth: 10,
  velocity: { x: 0, y: -0.01, z: 0 },
  position: { x: 0, y: 12.5, z: 100 }
});
cube.visible = false;
cube.castShadow = true;
scene.add(cube);

const ground = new Box({
  width: trackWidth,
  height: 5,
  depth: 3000,
  color: '#2D1B0E',
  position: { x: 0, y: -5, z: 0 }
});
ground.receiveShadow = true;
scene.add(ground);

function createTracks() {
  const gltfLoader = new GLTFLoader();
  gltfLoader.load('escenario/scene.gltf', (gltf) => {
    const sceneModel = gltf.scene;
    sceneModel.scale.set(60, 100, 100);
    sceneModel.position.set(-258, -25, 10);
    sceneModel.rotation.y = Math.PI / 2;

    sceneModel.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });

    trackGroup.add(sceneModel);

    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.7,
      metalness: 1
    });

    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      roughness: 0.8,
      metalness: 0.1
    });

    const woodPlanks = [];

    for (let i = 0; i < trackCount; i++) {
      const trackX = -trackWidth / 2 + trackSpacing / 2 + i * trackSpacing;

      const leftRail = new THREE.Mesh(
        new THREE.BoxGeometry(5, 2, 3000),
        railMaterial
      );
      leftRail.position.set(trackX - 15, 0.5, 0);
      leftRail.receiveShadow = true;
      leftRail.castShadow = true;
      trackGroup.add(leftRail);

      const rightRail = new THREE.Mesh(
        new THREE.BoxGeometry(5, 2, 3000),
        railMaterial
      );
      rightRail.position.set(trackX + 15, 0.5, 0);
      rightRail.receiveShadow = true;
      rightRail.castShadow = true;
      trackGroup.add(rightRail);

      for (let z = -1500; z < 1500; z += 10) {
        const woodPlank = new THREE.Mesh(
          new THREE.BoxGeometry(25, 1, 2),
          woodMaterial
        );
        woodPlank.position.set(trackX, 0.25, z);
        woodPlank.receiveShadow = true;
        woodPlank.castShadow = true;
        trackGroup.add(woodPlank);
        woodPlanks.push(woodPlank);
      }
    }

    function movePlanks(speed) {
      woodPlanks.forEach(plank => {
        plank.position.z += speed;
        if (plank.position.z > 1500) {
          plank.position.z = -1500;
        }
      });
    }
    trackGroup.userData.movePlanks = movePlanks;
  });
}
createTracks();

const light = new THREE.DirectionalLight(0xffffff, 0.5);
light.position.set(0, 3, 1);
light.castShadow = true;
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

const backLight = new THREE.DirectionalLight(0xffffff, 1);
backLight.position.set(0, 50, -100);
backLight.castShadow = true;
scene.add(backLight);

let playerModel;
fbxLoader.load(animationFiles['Alto'], (fbx) => {
  playerModel = fbx;
  playerModel.scale.set(0.5, 0.5, -0.5);
  playerModel.position.copy(cube.position);
  playerModel.position.y += 0.5;

  playerModel.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.material.transparent = false;
      child.material.opacity = 1;
      child.material.side = THREE.DoubleSide;
      child.material.color = new THREE.Color(0xffffff);
    }
  });

  scene.add(playerModel);
  mixer = new THREE.AnimationMixer(playerModel);

  if (fbx.animations.length > 0) {
    const clip = fbx.animations[0];
    const action = mixer.clipAction(clip);
    action.play();
    currentAction = action;
    animationsMap['Alto'] = action;
  } else {
    loadAnimation('Alto', animationFiles['Alto']);
  }

  Object.entries(animationFiles).forEach(([name, path]) => {
    if (name !== 'Alto') {
      loadAnimation(name, path);
    }
  });

  Object.values(animationsMap).forEach(action => {
    action.clampWhenFinished = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
  });

  mixer.update(0);
});

const controllerModelFactory = new XRControllerModelFactory();
let controller1, controller2;

function setupXRControllers() {

  if (controller1) cameraGroup.remove(controller1);
  if (controller2) cameraGroup.remove(controller2);

  controller1 = renderer.xr.getController(0);
  // Gatillo izquierdo para mover a la izquierda
  controller1.addEventListener('selectstart', () => keys.a.pressed = true);
  controller1.addEventListener('selectend', () => keys.a.pressed = false);
  // Botón de apretar (squeeze) para saltar
  controller1.addEventListener('squeezestart', () => {
    if (cube.canJump) {
      cube.velocity.y = 6;
      cube.canJump = false;
      playAnimation('Saltar');
    }
  });
  controller1.addEventListener('move', (event) => {
    if (event.controller === controller1) {
      controllerState.left.x = event.gamepad.axes[2] || 0;
      controllerState.left.z = event.gamepad.axes[3] || 0;
    }
  });
  cameraGroup.add(controller1);

  controller2 = renderer.xr.getController(1);
  // Gatillo derecho para mover a la derecha
  controller2.addEventListener('selectstart', () => keys.d.pressed = true);
  controller2.addEventListener('selectend', () => keys.d.pressed = false);
  controller2.addEventListener('move', (event) => {
    if (event.controller === controller2) {
      controllerState.right.x = event.gamepad.axes[2] || 0;
      controllerState.right.z = event.gamepad.axes[3] || 0;
    }
  });
  cameraGroup.add(controller2);

  const controllerGrip1 = renderer.xr.getControllerGrip(0);
  const controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
  cameraGroup.add(controllerGrip1);
  cameraGroup.add(controllerGrip2);
}

setupXRControllers();

const keys = {
  a: { pressed: false },
  d: { pressed: false },
  w: { pressed: false }
};
window.addEventListener('keydown', (event) => {
  if (!gameRunning || gamePaused) return;

  switch (event.code) {
    case 'KeyA':
      keys.a.pressed = true;
      break;
    case 'KeyD':
      keys.d.pressed = true;
      break;
    case 'Space':
      event.preventDefault();
      if (cube.canJump) {
        cube.velocity.y = 6;
        cube.canJump = false;
        playAnimation('Saltar');
      }
      break;
  }
});

window.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'KeyA':
      keys.a.pressed = false;
      break;
    case 'KeyD':
      keys.d.pressed = false;
      break;
    case 'Space':
      event.preventDefault();
      break;
  }
});

function playAnimation(name) {
  if (currentAction === animationsMap[name]) return;

  if (!cube.canJump) {
    if (cube.velocity.y > 0 && name !== 'Saltar') return;
    if (cube.velocity.y < 0 && name !== 'Caer') return;
  }

  if (animationsMap[name]) {
    const toPlay = animationsMap[name];
    if (currentAction) { currentAction.fadeOut(0.1); }
    toPlay.reset().fadeIn(0.1).play();
    currentAction = toPlay;
  }
}
const enemies = [];
let frames = 0;
let spawnRate = 150;
let trackSpeed = 10;

function startGame() {
  if (!gameRunning) {
    gameRunning = true;
    gamePaused = false;
    gameStartTime = performance.now();
    document.getElementById('startBtn').disabled = true;
    document.getElementById('pauseBtn').disabled = false;
    backgroundMusic.play();
    playAnimation('Alto');

    // Crear el botón VR solo cuando el juego comienza
    const vrButton = VRButton.createButton(renderer);
    vrButton.id = 'vr-button'; // Asignar un ID para poder eliminarlo luego
    document.body.appendChild(vrButton);

    animate();
  }
}
function togglePause() {
  if (gameRunning) {
    if (gamePaused) {
      gamePaused = false;
      document.getElementById('pauseBtn').textContent = 'Pausar';
      backgroundMusic.play();
    } else {
      gamePaused = true;
      document.getElementById('pauseBtn').textContent = 'Reanudar';
      backgroundMusic.pause();
    }
  }
}

function restartGame() {
  if (renderer.xr.isPresenting) {
    renderer.xr.getSession().end();
  }
  renderer.setAnimationLoop(null);

  // Reiniciar posición del cubo exactamente como en la inicialización
  cube.position.set(0, 12.5, 100); // Asegúrate que es la misma Z inicial
  cube.velocity = { x: 0, y: -0.01, z: 0 };

  // Reiniciar cámara y grupo de cámara
  cameraGroup.position.set(0, 50, -1);
  camera.position.set(0, 150, 100);
  camera.lookAt(0, 0, 0);

  // Limpiar enemigos
  enemies.forEach(enemy => {
    if (enemy.userData.model) scene.remove(enemy.userData.model);
    scene.remove(enemy);
  });
  enemies.length = 0;

  // Reiniciar pista
  setupXRControllers();
  trackGroup.position.z = 0;
  trackSpeed = 10;

  // Reiniciar modelo del jugador
  if (playerModel) {
    playerModel.position.copy(cube.position);
    playerModel.position.y += 0.5;
    playAnimation('Alto');
  }

  // Reiniciar otros estados
  frames = 0;
  spawnRate = 150; // Asegúrate que es el mismo valor inicial
  gameRunning = false;
  gamePaused = false;

  // UI
  document.getElementById("gameOverMessage").style.display = "none";
  document.getElementById("startBtn").disabled = false;
  document.getElementById("pauseBtn").disabled = true;
  document.getElementById("pauseBtn").textContent = 'Pausar';

  backgroundMusic.stop();
  startGame();
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('pauseBtn').addEventListener('click', togglePause);
document.getElementById('restartBtn').addEventListener('click', restartGame);
document.getElementById("retryButton").addEventListener("click", restartGame);

document.querySelectorAll('#startBtn, #pauseBtn, #restartBtn, #retryButton').forEach(button => {
  button.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
    }
  });
});
const clock = new THREE.Clock();

function animate() {
  renderer.setAnimationLoop(function () {
    if (gamePaused) return;

    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsedTime = (performance.now() - gameStartTime) / 1000;

    if (cube) {
      backLight.position.set(
        cube.position.x,
        cube.position.y + 50,
        cube.position.z - 100
      );
      backLight.target.position.copy(cube.position);
      backLight.target.updateMatrixWorld();
    }

    if (mixer) mixer.update(delta);
    if (elapsedTime >= 1 && trackGroup.userData.movePlanks) {
      trackGroup.userData.movePlanks(trackSpeed * delta * 10);
    }

    if (elapsedTime >= 1 && frames % 1000 === 0) {
      trackSpeed += 0.3;
    }

    cube.velocity.x = 0;
    cube.velocity.z = 0;

    if (elapsedTime >= 1) {
      const joystickThreshold = 0.1;

      // Prioridad a los joysticks
      if (Math.abs(controllerState.left.x) > joystickThreshold) {
        cube.velocity.x = controllerState.left.x * 3;
      }
      else if (Math.abs(controllerState.right.x) > joystickThreshold) {
        cube.velocity.x = controllerState.right.x * 3;
      }
      // Luego a los gatillos/teclado
      else {
        if (keys.a.pressed) cube.velocity.x = -2; // Izquierda
        if (keys.d.pressed) cube.velocity.x = 2;  // Derecha
      }

      // Animaciones
      if (cube.canJump) {
        if (keys.w.pressed) {
          playAnimation('Arrastre');
        }
        else if (cube.velocity.x < -0.1) {
          playAnimation('Izquierdo');
        } else if (cube.velocity.x > 0.1) {
          playAnimation('Derecho');
        } else {
          playAnimation('Adelante');
        }
      } else {
        if (cube.velocity.y > 0) {
          playAnimation('Saltar');
        } else {
          playAnimation('Caer');
        }
      }
    }
    const limitX = (ground.width / 2) - (cube.width / 2) - 15;
    cube.position.x = Math.max(-limitX, Math.min(limitX, cube.position.x));
    cube.update(ground);

    if (!renderer.xr.isPresenting) {
      camera.position.x = cube.position.x;
      camera.position.z = cube.position.z + 300;
      camera.lookAt(cube.position.x, cube.position.y + 100, cube.position.z);
    }

    if (playerModel) {
      playerModel.position.lerp(cube.position, 0.3);

      // Ajusta la posición de la cámara en modo VR para estar frente al personaje
      if (renderer.xr.isPresenting) {
        const offsetZ = 200; // Distancia frente al personaje
        const offsetY = 100; // Altura de la cámara
        cameraGroup.position.x = cube.position.x;
        cameraGroup.position.z = cube.position.z + offsetZ;
        cameraGroup.position.y = cube.position.y + offsetY;

        // Hacer que la cámara mire al personaje
        camera.lookAt(cube.position.x, cube.position.y + 10, cube.position.z);
      }
    }


    if (elapsedTime >= 1) {
      enemies.forEach((collider, index) => {
        collider.update(ground);
        collider.position.z += trackSpeed * delta;

        if (collider.userData.model) {
          collider.userData.model.position.copy(collider.position);
          collider.userData.model.position.y = 0;
        }

        if (boxCollision({ box1: cube, box2: collider })) {
          if (renderer.xr.isPresenting) {
            renderer.xr.getSession().end(); // Sale del modo VR
          }

          document.getElementById("gameOverMessage").style.display = "block";
          document.getElementById("scoreDisplay").textContent = frames;
          gameRunning = false;
          backgroundMusic.stop();
          renderer.setAnimationLoop(null);
        }
      });

      if (frames % spawnRate === 0 && gameRunning && !gamePaused) {
        if (spawnRate > 50) spawnRate -= 2;

        const trackIndex = Math.floor(Math.random() * trackCount);
        const trackX = -trackWidth / 2 + trackSpacing / 2 + trackIndex * trackSpacing;

        const spawnTrain = Math.random() > 0.5;

        if (spawnTrain) {
          gltfLoader.load(modelPaths.train, (gltf) => {
            const enemyModel = gltf.scene;
            enemyModel.scale.set(30, 30, 30);
            enemyModel.rotation.y = Math.PI;

            const collider = new Box({
              width: 80,
              height: 90,
              depth: 600,
              position: {
                x: trackX + (Math.random() - 0.5) * 5,
                y: 45,
                z: trackGroup.position.z - 1000
              },
              velocity: { x: 0, y: 0, z: trackSpeed },
              color: 'red',
              zAcceleration: false
            });
            collider.visible = false;

            enemyModel.position.copy(collider.position);
            enemyModel.position.y = 0;
            collider.userData.model = enemyModel;

            scene.add(enemyModel);
            scene.add(collider);
            enemies.push(collider);
          });
        } else {
          gltfLoader.load(modelPaths.barrier, (gltf) => {
            const barrierModel = gltf.scene;
            barrierModel.scale.set(40, 40, 40);
            barrierModel.rotation.y = Math.PI;

            const collider = new Box({
              width: 70,
              height: 10,
              depth: 5,
              position: {
                x: trackX + (Math.random() - 0.5) * 5,
                y: 25,
                z: trackGroup.position.z - 1000
              },
              velocity: { x: 0, y: 0, z: trackSpeed },
              color: 'orange',
              zAcceleration: false
            });
            collider.visible = false;

            barrierModel.position.copy(collider.position);
            barrierModel.position.y = 0;
            collider.userData.model = barrierModel;

            scene.add(barrierModel);
            scene.add(collider);
            enemies.push(collider);
          });
        }
      }
    }

    // Sistema de Leaderboard
    const leaderboardKey = 'railRunnerLeaderboard';
    let leaderboardVisible = false;

    function getLeaderboard() {
      const scores = localStorage.getItem(leaderboardKey);
      return scores ? JSON.parse(scores) : [];
    }

    function saveScore(score) {
      const scores = getLeaderboard();
      const newScore = {
        score: score,
        date: new Date().toLocaleDateString()
      };

      scores.push(newScore);
      // Ordenar de mayor a menor y mantener solo las top 10
      scores.sort((a, b) => b.score - a.score);
      const topScores = scores.slice(0, 10);

      localStorage.setItem(leaderboardKey, JSON.stringify(topScores));
      return topScores;
    }

    function updateLeaderboardDisplay() {
      const scores = getLeaderboard();
      const tableBody = document.querySelector('#scoresTable tbody');
      tableBody.innerHTML = '';

      scores.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="padding: 5px; text-align: center;">${index + 1}</td>
            <td style="padding: 5px; text-align: center;">${entry.score}</td>
            <td style="padding: 5px; text-align: center;">${entry.date}</td>
        `;
        tableBody.appendChild(row);
      });
    }

    function toggleLeaderboard() {
      leaderboardVisible = !leaderboardVisible;
      document.getElementById('leaderboard').style.display = leaderboardVisible ? 'block' : 'none';
      document.getElementById('toggleLeaderboard').textContent = leaderboardVisible ? 'Ocultar Tabla' : 'Mostrar Tabla';

      if (leaderboardVisible) {
        updateLeaderboardDisplay();
      }
    }

    // Modificar la función restartGame para guardar el puntaje al finalizar
    const originalRestartGame = restartGame;
    restartGame = function () {
      if (!gameRunning && frames > 0) {
        saveScore(frames);
      }
      originalRestartGame.apply(this, arguments);
    };

    // Modificar el manejo de colisión para guardar el puntaje
    enemies.forEach((collider, index) => {
      if (boxCollision({ box1: cube, box2: collider })) {
        if (renderer.xr.isPresenting) {
          renderer.xr.getSession().end();
        }

        document.getElementById("gameOverMessage").style.display = "block";
        document.getElementById("scoreDisplay").textContent = frames;
        gameRunning = false;
        backgroundMusic.stop();
        renderer.setAnimationLoop(null);

        // Guardar puntuación cuando el juego termina
        saveScore(frames);
      }
    });

    // Evento para el botón de toggle
    document.getElementById('toggleLeaderboard').addEventListener('click', toggleLeaderboard);

    // Inicializar leaderboard oculto
    updateLeaderboardDisplay();

    frames++;
    renderer.render(scene, camera);
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});