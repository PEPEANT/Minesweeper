import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

const DIFFICULTIES = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 14, height: 14, mines: 32 },
  expert: { width: 18, height: 18, mines: 60 },
};

const NUMBER_COLORS = {
  1: "#65b8ff",
  2: "#69e7a4",
  3: "#ffd166",
  4: "#f4a261",
  5: "#ef476f",
  6: "#b18dff",
  7: "#c7d3e4",
  8: "#ffffff",
};

const STATUS_CLASS_NAMES = ["ready", "running", "win", "lose", "portal", "portal-alert"];
const PLAYER_STATE_CLASS_NAMES = ["running", "win", "lose"];
const KEY_BINDINGS = {
  forward: "KeyW",
  backward: "KeyS",
  left: "KeyA",
  right: "KeyD",
  sprint: "ShiftLeft",
  jump: "Space",
};

class Minefield3D {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.difficultySelect = document.getElementById("difficulty");
    this.newGameButton = document.getElementById("new-game");
    this.modeToggleButton = document.getElementById("mode-toggle");
    this.minesLeftNode = document.getElementById("mines-left");
    this.timeNode = document.getElementById("time");
    this.statusNode = document.getElementById("status");
    this.portalStatusNode = document.getElementById("portal-status");
    this.playerStateNode = document.getElementById("player-state");

    this.chatNode = document.getElementById("chat-ui");
    this.chatLogNode = document.getElementById("chat-log");
    this.chatInputNode = document.getElementById("chat-input");
    this.chatSendButton = document.getElementById("chat-send");
    this.chatToggleButton = document.getElementById("chat-toggle");

    this.portalTransitionNode = document.getElementById("portal-transition");
    this.portalTransitionTextNode = document.getElementById("portal-transition-text");
    this.reticleNode = document.getElementById("reticle");
    this.fpsLockOverlayNode = document.getElementById("fps-lock-overlay");
    this.fpsLockMessageNode = document.getElementById("fps-lock-message");
    this.isTouchDevice =
      window.matchMedia("(hover: none), (pointer: coarse)").matches ||
      "ontouchstart" in window;
    document.body.classList.toggle("is-touch-device", this.isTouchDevice);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#071426");
    this.scene.fog = new THREE.Fog("#071426", 24, 64);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.set(0, 1.66, 7);

    this.controls = new PointerLockControls(this.camera, document.body);
    this.controls.pointerSpeed = 0.9;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI - 0.18;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.animationStart = performance.now();
    this.clock = new THREE.Clock();

    this.boardGroup = new THREE.Group();
    this.scene.add(this.boardGroup);

    this.cellMeshes = [];
    this.cells = [];
    this.width = 0;
    this.height = 0;
    this.mineCount = 0;
    this.flagsPlaced = 0;
    this.firstRevealDone = false;
    this.gameOver = false;
    this.win = false;
    this.isFlagMode = false;
    this.elapsedSeconds = 0;
    this.timerId = null;
    this.touchState = null;
    this.movementState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
    };
    this.playerHeight = 1.66;
    this.walkSpeed = 4.6;
    this.sprintSpeed = 7.6;
    this.verticalVelocity = 0;
    this.gravity = 22;
    this.jumpVelocity = 8.1;
    this.isGrounded = true;
    this.boardBounds = {
      minX: -18,
      maxX: 18,
      minZ: -18,
      maxZ: 18,
    };
    this.targetedCell = null;
    this.pointerLockErrorNotified = false;

    this.playerAvatar = null;
    this.playerAvatarBaseY = 0.58;

    this.portalCells = [];
    this.portalStatusTimeoutId = null;
    this.portalTransitionTimeoutId = null;

    this.chatCollapsed = false;
    this.chatMaxLines = 72;

    this.tileGeometry = new THREE.BoxGeometry(1, 0.6, 1);
    this.mineGeometry = new THREE.IcosahedronGeometry(0.2, 0);
    this.flagPoleGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10);
    this.flagClothGeometry = new THREE.ConeGeometry(0.12, 0.28, 3);

    this.hiddenMaterial = new THREE.MeshStandardMaterial({
      color: "#285989",
      roughness: 0.4,
      metalness: 0.1,
    });
    this.revealedMaterial = new THREE.MeshStandardMaterial({
      color: "#102746",
      roughness: 0.85,
      metalness: 0.08,
    });
    this.mineMaterial = new THREE.MeshStandardMaterial({
      color: "#131722",
      roughness: 0.35,
      metalness: 0.85,
    });
    this.explodedMaterial = new THREE.MeshStandardMaterial({
      color: "#8f1f2f",
      roughness: 0.45,
      metalness: 0.15,
      emissive: "#5a111c",
      emissiveIntensity: 0.5,
    });

    this.initLights();
    this.initFloor();
    this.initPlayerAvatar();
    this.bindEvents();

    this.resetGame({ announce: false });
    this.seedChat();
    this.setStatus("Ready", "ready");
    this.setPortalStatus("Linked", "portal");
    this.setPlayerState("IDLE");
    this.updateLockUI(false);

    this.animate();
  }

  initLights() {
    const hemi = new THREE.HemisphereLight("#a8dbff", "#2f4568", 1.15);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight("#9ad2ff", 1.05);
    key.position.set(12, 18, 7);
    key.castShadow = false;
    this.scene.add(key);

    const fill = new THREE.PointLight("#9affd9", 0.5, 40);
    fill.position.set(-8, 4, -8);
    this.scene.add(fill);
  }

  initFloor() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(32, 64),
      new THREE.MeshStandardMaterial({
        color: "#0a1b33",
        roughness: 0.96,
        metalness: 0.04,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.32;
    this.scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(13, 13.25, 64),
      new THREE.MeshBasicMaterial({
        color: "#2a638f",
        transparent: true,
        opacity: 0.34,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.3;
    this.scene.add(ring);
  }

  initPlayerAvatar() {
    const avatar = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.68, 16),
      new THREE.MeshStandardMaterial({
        color: "#1f4d73",
        roughness: 0.6,
        metalness: 0.2,
      })
    );
    body.position.y = 0.35;
    avatar.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 18, 18),
      new THREE.MeshStandardMaterial({
        color: "#78cbff",
        roughness: 0.32,
        metalness: 0.22,
        emissive: "#2b6c96",
        emissiveIntensity: 0.24,
      })
    );
    head.position.y = 0.8;
    avatar.add(head);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.07, 0.12),
      new THREE.MeshStandardMaterial({
        color: "#d9f5ff",
        roughness: 0.22,
        metalness: 0.4,
      })
    );
    visor.position.set(0, 0.78, 0.12);
    avatar.add(visor);

    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.52, 0.09, 24),
      new THREE.MeshStandardMaterial({
        color: "#13334f",
        roughness: 0.86,
        metalness: 0.08,
      })
    );
    stand.position.y = 0.05;
    avatar.add(stand);

    avatar.position.set(-7, this.playerAvatarBaseY, 8);
    this.playerAvatar = avatar;
    this.scene.add(avatar);
  }

  bindEvents() {
    window.addEventListener("resize", () => this.handleResize());
    const downEvent = window.PointerEvent ? "pointerdown" : "mousedown";
    this.canvas.addEventListener(downEvent, (event) => this.handlePointerDown(event));
    this.canvas.addEventListener("touchstart", (event) => this.handleTouchStart(event), {
      passive: false,
    });
    this.canvas.addEventListener("touchmove", (event) => this.handleTouchMove(event), {
      passive: false,
    });
    this.canvas.addEventListener("touchend", (event) => this.handleTouchEnd(event), {
      passive: false,
    });
    this.canvas.addEventListener("touchcancel", () => this.clearTouchState());
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("click", () => {
      if (this.isTouchDevice) {
        return;
      }
      if (!this.controls.isLocked) {
        this.tryLockPointer();
      }
    });

    this.newGameButton.addEventListener("click", () => this.resetGame({ announce: true }));
    this.difficultySelect.addEventListener("change", () => this.resetGame({ announce: true }));
    this.modeToggleButton.addEventListener("click", () => this.toggleMode());

    if (this.chatSendButton) {
      this.chatSendButton.addEventListener("click", () => this.sendChatMessage());
    }

    if (this.chatInputNode) {
      this.chatInputNode.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.sendChatMessage();
          this.chatInputNode.blur();
          if (!this.chatCollapsed) {
            this.tryLockPointer();
          }
        }
      });
    }

    if (this.chatToggleButton) {
      this.chatToggleButton.addEventListener("click", () => this.toggleChat());
    }

    if (this.fpsLockOverlayNode && !this.isTouchDevice) {
      this.fpsLockOverlayNode.addEventListener("click", () => this.tryLockPointer());
    }

    this.controls.addEventListener("lock", () => {
      this.pointerLockErrorNotified = false;
      this.updateLockUI(true);
      this.setPlayerState(this.gameOver ? "DOWN" : "ACTIVE", this.gameOver ? "lose" : "running");
      this.addChatLine("Pointer lock engaged. FPS control enabled.", "system");
    });

    this.controls.addEventListener("unlock", () => {
      this.resetMovementState();
      this.updateLockUI(false);
      if (!this.gameOver && !this.chatInputNode?.matches(":focus")) {
        this.setPlayerState("IDLE");
      }
    });

    document.addEventListener("pointerlockerror", () => {
      if (this.pointerLockErrorNotified) {
        return;
      }
      this.pointerLockErrorNotified = true;
      this.updateLockUI(false);
      this.addChatLine("Pointer lock failed. Press L or click game area again.", "alert");
      if (this.fpsLockMessageNode) {
        this.fpsLockMessageNode.textContent = "POINTER LOCK BLOCKED - RETRY WITH CLICK";
      }
    });

    window.addEventListener("blur", () => {
      this.resetMovementState();
      if (this.controls.isLocked) {
        this.controls.unlock();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.resetMovementState();
      }
    });

    document.addEventListener("keydown", (event) => this.handleKeyDown(event));
    document.addEventListener("keyup", (event) => this.handleKeyUp(event));
  }

  handleKeyDown(event) {
    if (this.isEditableTarget(event.target)) {
      if (event.code === "Escape" && this.chatInputNode) {
        this.chatInputNode.blur();
      }
      return;
    }

    if (event.code === "Enter" && this.chatInputNode) {
      event.preventDefault();
      if (!this.chatCollapsed) {
        this.chatInputNode.focus();
      } else {
        this.toggleChat();
      }
      this.controls.unlock();
      return;
    }

    if (event.code === KEY_BINDINGS.forward) {
      this.movementState.forward = true;
      return;
    }
    if (event.code === KEY_BINDINGS.backward) {
      this.movementState.backward = true;
      return;
    }
    if (event.code === KEY_BINDINGS.left) {
      this.movementState.left = true;
      return;
    }
    if (event.code === KEY_BINDINGS.right) {
      this.movementState.right = true;
      return;
    }
    if (event.code === KEY_BINDINGS.sprint) {
      this.movementState.sprint = true;
      return;
    }
    if (event.code === KEY_BINDINGS.jump) {
      if (this.isGrounded) {
        this.verticalVelocity = this.jumpVelocity;
        this.isGrounded = false;
      }
      return;
    }

    if (event.code === "KeyF") {
      this.toggleMode();
    } else if (event.code === "KeyN") {
      this.resetGame({ announce: true });
    } else if (event.code === "KeyC") {
      this.toggleChat();
      if (!this.chatCollapsed) {
        this.controls.unlock();
      }
    } else if (event.code === "KeyL") {
      this.tryLockPointer();
    }
  }

  handleKeyUp(event) {
    if (event.code === KEY_BINDINGS.forward) {
      this.movementState.forward = false;
    } else if (event.code === KEY_BINDINGS.backward) {
      this.movementState.backward = false;
    } else if (event.code === KEY_BINDINGS.left) {
      this.movementState.left = false;
    } else if (event.code === KEY_BINDINGS.right) {
      this.movementState.right = false;
    } else if (event.code === KEY_BINDINGS.sprint) {
      this.movementState.sprint = false;
    }
  }

  resetMovementState() {
    this.movementState.forward = false;
    this.movementState.backward = false;
    this.movementState.left = false;
    this.movementState.right = false;
    this.movementState.sprint = false;
  }

  tryLockPointer() {
    if (this.isTouchDevice) {
      return;
    }
    if (this.isEditableTarget(document.activeElement)) {
      return;
    }
    if (!this.controls.isLocked) {
      this.controls.lock();
    }
  }

  updateLockUI(locked) {
    if (this.isTouchDevice) {
      if (this.reticleNode) {
        this.reticleNode.classList.remove("active");
      }
      if (this.fpsLockOverlayNode) {
        this.fpsLockOverlayNode.classList.add("hidden");
      }
      if (this.fpsLockMessageNode) {
        this.fpsLockMessageNode.textContent = "TOUCH MODE";
      }
      return;
    }

    if (this.reticleNode) {
      this.reticleNode.classList.toggle("active", locked);
    }
    if (this.fpsLockOverlayNode) {
      this.fpsLockOverlayNode.classList.toggle("hidden", locked);
    }
    if (this.fpsLockMessageNode) {
      this.fpsLockMessageNode.textContent = locked
        ? "ACTIVE - LMB Reveal / RMB Flag"
        : "CLICK TO LOCK POINTER";
    }
  }

  updateMovement(delta) {
    const forwardAxis = (this.movementState.forward ? 1 : 0) - (this.movementState.backward ? 1 : 0);
    const rightAxis = (this.movementState.right ? 1 : 0) - (this.movementState.left ? 1 : 0);
    const moving = forwardAxis !== 0 || rightAxis !== 0;
    const speed = this.movementState.sprint ? this.sprintSpeed : this.walkSpeed;
    const frameSpeed = speed * delta;

    if (moving && this.controls.isLocked) {
      const length = Math.hypot(forwardAxis, rightAxis) || 1;
      const normForward = forwardAxis / length;
      const normRight = rightAxis / length;
      this.controls.moveForward(normForward * frameSpeed);
      this.controls.moveRight(normRight * frameSpeed);
    }

    this.verticalVelocity -= this.gravity * delta;
    this.camera.position.y += this.verticalVelocity * delta;
    if (this.camera.position.y <= this.playerHeight) {
      this.camera.position.y = this.playerHeight;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }

    this.clampPlayerToBounds();
  }

  clampPlayerToBounds() {
    this.camera.position.x = THREE.MathUtils.clamp(
      this.camera.position.x,
      this.boardBounds.minX,
      this.boardBounds.maxX
    );
    this.camera.position.z = THREE.MathUtils.clamp(
      this.camera.position.z,
      this.boardBounds.minZ,
      this.boardBounds.maxZ
    );
  }

  updateTargetCell() {
    const next = this.getCellUnderReticle();
    if (next === this.targetedCell) {
      return;
    }

    if (this.targetedCell) {
      this.applyCellHighlight(this.targetedCell, false);
    }
    this.targetedCell = next;
    if (this.targetedCell) {
      this.applyCellHighlight(this.targetedCell, true);
    }
  }

  getCellUnderReticle() {
    this.pointer.set(0, 0);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.cellMeshes, false)[0];
    if (!hit || !hit.object?.userData?.cell) {
      return null;
    }
    return hit.object.userData.cell;
  }

  applyCellHighlight(cell, enabled) {
    if (!cell?.mesh || cell.revealed || !cell.mesh.material?.emissive) {
      return;
    }
    const emissive = enabled ? "#2f6a98" : "#000000";
    cell.mesh.material.emissive.set(emissive);
    cell.mesh.material.emissiveIntensity = enabled ? 0.45 : 0;
  }

  handleBoardCenterInteraction(useFlagMode) {
    if (this.gameOver) {
      return;
    }

    const cell = this.targetedCell || this.getCellUnderReticle();
    if (!cell) {
      return;
    }

    if (useFlagMode) {
      this.toggleFlag(cell);
    } else {
      this.revealCell(cell);
    }
  }

  isEditableTarget(target) {
    if (!target || !(target instanceof HTMLElement)) {
      return false;
    }
    return (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    );
  }

  handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  resetGame({ announce = true } = {}) {
    if (this.targetedCell) {
      this.applyCellHighlight(this.targetedCell, false);
      this.targetedCell = null;
    }
    this.clearBoardGroup();
    this.stopTimer();
    this.clearPortalTransition();

    const config = DIFFICULTIES[this.difficultySelect.value] || DIFFICULTIES.beginner;
    this.width = config.width;
    this.height = config.height;
    this.mineCount = config.mines;

    this.flagsPlaced = 0;
    this.firstRevealDone = false;
    this.gameOver = false;
    this.win = false;
    this.elapsedSeconds = 0;
    this.isFlagMode = false;
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.targetedCell = null;
    this.resetMovementState();

    this.cells = [];
    this.cellMeshes = [];
    this.portalCells = [];

    this.syncModeButton();
    this.updateTimeUI();
    this.updateMinesUI();
    this.setStatus("Ready", "ready");
    this.setPortalStatus("Linked", "portal");
    this.setPlayerState("IDLE");

    this.createBoardCells();
    this.setupPortals();
    this.fitCameraToBoard();

    if (announce) {
      this.addChatLine("New minefield generated.", "system");
      this.addChatLine("Portal link synchronized.", "portal");
    }
  }

  clearBoardGroup() {
    const children = [...this.boardGroup.children];
    for (const child of children) {
      this.disposeObject(child);
      this.boardGroup.remove(child);
    }
  }

  disposeObject(object) {
    object.traverse((node) => {
      if (node.geometry) {
        node.geometry.dispose();
      }

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material) {
          continue;
        }
        if (
          material === this.hiddenMaterial ||
          material === this.revealedMaterial ||
          material === this.mineMaterial ||
          material === this.explodedMaterial
        ) {
          continue;
        }

        if (material.map) {
          material.map.dispose();
        }

        material.dispose();
      }
    });

    object.clear();
  }

  createBoardCells() {
    const xOffset = (this.width - 1) / 2;
    const yOffset = (this.height - 1) / 2;

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const cell = {
          x,
          y,
          mine: false,
          revealed: false,
          flagged: false,
          adjacent: 0,
          mesh: null,
          marker: null,
          numberSprite: null,
          mineMesh: null,
          isPortal: false,
          portalPartner: null,
          portalTriggered: false,
          portalMarker: null,
        };

        const mesh = new THREE.Mesh(this.tileGeometry, this.hiddenMaterial.clone());
        mesh.position.set((x - xOffset) * 1.02, 0.3, (y - yOffset) * 1.02);
        mesh.userData.cell = cell;
        this.boardGroup.add(mesh);

        cell.mesh = mesh;
        this.cells.push(cell);
        this.cellMeshes.push(mesh);
      }
    }
  }

  setupPortals() {
    if (this.cells.length < 2) {
      return;
    }

    const [aIndex, bIndex] = this.pickPortalPairIndices();
    const cellA = this.cells[aIndex];
    const cellB = this.cells[bIndex];

    cellA.isPortal = true;
    cellB.isPortal = true;
    cellA.portalPartner = cellB;
    cellB.portalPartner = cellA;

    cellA.portalMarker = this.createPortalMarker(cellA);
    cellB.portalMarker = this.createPortalMarker(cellB);

    this.boardGroup.add(cellA.portalMarker);
    this.boardGroup.add(cellB.portalMarker);

    this.portalCells = [cellA, cellB];
  }

  pickPortalPairIndices() {
    const tries = Math.min(280, this.cells.length * 4);
    let bestPair = [0, Math.min(1, this.cells.length - 1)];
    let bestScore = -1;

    for (let i = 0; i < tries; i += 1) {
      const aIndex = Math.floor(Math.random() * this.cells.length);
      let bIndex = Math.floor(Math.random() * this.cells.length);
      if (bIndex === aIndex) {
        bIndex = (bIndex + 1) % this.cells.length;
      }

      const cellA = this.cells[aIndex];
      const cellB = this.cells[bIndex];
      const score = Math.hypot(cellA.x - cellB.x, cellA.y - cellB.y);
      if (score > bestScore) {
        bestScore = score;
        bestPair = [aIndex, bIndex];
      }
    }

    return bestPair;
  }

  createPortalMarker(cell) {
    const group = new THREE.Group();

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.25, 0.055, 14, 28),
      new THREE.MeshStandardMaterial({
        color: "#5ed4ff",
        emissive: "#2f9bc6",
        emissiveIntensity: 0.65,
        roughness: 0.32,
        metalness: 0.26,
      })
    );
    halo.rotation.x = Math.PI / 2;
    group.add(halo);

    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.13, 18),
      new THREE.MeshBasicMaterial({
        color: "#aef1ff",
        transparent: true,
        opacity: 0.9,
      })
    );
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.005;
    group.add(core);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.08, 0.28, 10),
      new THREE.MeshStandardMaterial({
        color: "#25557a",
        roughness: 0.62,
        metalness: 0.14,
      })
    );
    pillar.position.y = -0.16;
    group.add(pillar);

    group.position.set(cell.mesh.position.x, 0.68, cell.mesh.position.z);
    group.userData.halo = halo;
    group.userData.core = core;
    group.userData.phase = Math.random() * Math.PI * 2;

    return group;
  }

  fitCameraToBoard() {
    const largestEdge = Math.max(this.width, this.height);
    const halfSpan = largestEdge * 0.58 + 2.4;
    this.boardBounds = {
      minX: -halfSpan,
      maxX: halfSpan,
      minZ: -halfSpan,
      maxZ: halfSpan,
    };

    this.camera.position.set(0, this.playerHeight, halfSpan - 1.4);
    this.camera.lookAt(0, 0.4, 0);
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.targetedCell = null;

    if (this.playerAvatar) {
      const boardRadius = largestEdge * 0.55;
      this.playerAvatar.position.set(-boardRadius - 1.8, this.playerAvatarBaseY, boardRadius + 0.8);
    }
  }

  handlePointerDown(event) {
    if (event.pointerType === "touch") {
      return;
    }

    if (!this.controls.isLocked) {
      this.tryLockPointer();
      return;
    }

    if (event.button === 1) {
      return;
    }

    this.handleBoardCenterInteraction(event.button === 2 || this.isFlagMode);
  }

  handleTouchStart(event) {
    if (event.touches.length !== 1) {
      this.clearTouchState();
      return;
    }

    event.preventDefault();
    const touch = event.touches[0];
    this.touchState = {
      id: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      moved: false,
    };
  }

  handleTouchMove(event) {
    if (!this.touchState) {
      return;
    }

    const touch = [...event.touches].find((item) => item.identifier === this.touchState.id);
    if (!touch) {
      return;
    }

    event.preventDefault();
    this.touchState.lastX = touch.clientX;
    this.touchState.lastY = touch.clientY;
    const dx = touch.clientX - this.touchState.startX;
    const dy = touch.clientY - this.touchState.startY;
    if (Math.hypot(dx, dy) > 12) {
      this.touchState.moved = true;
    }
  }

  handleTouchEnd(event) {
    if (!this.touchState) {
      return;
    }

    const touch = [...event.changedTouches].find((item) => item.identifier === this.touchState.id);
    if (!touch) {
      this.clearTouchState();
      return;
    }

    event.preventDefault();
    const moved = this.touchState.moved;
    const x = touch.clientX ?? this.touchState.lastX;
    const y = touch.clientY ?? this.touchState.lastY;
    this.clearTouchState();

    if (moved) {
      return;
    }

    this.handleBoardInteraction(x, y, this.isFlagMode);
  }

  clearTouchState() {
    this.touchState = null;
  }

  handleBoardInteraction(clientX, clientY, useFlagMode) {
    if (this.gameOver) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObjects(this.cellMeshes, false)[0];
    if (!hit || !hit.object.userData.cell) {
      return;
    }

    const cell = hit.object.userData.cell;
    if (useFlagMode) {
      this.toggleFlag(cell);
      return;
    }

    this.revealCell(cell);
  }

  toggleMode() {
    this.isFlagMode = !this.isFlagMode;
    this.syncModeButton();
    this.addChatLine(
      `Mode switched to ${this.isFlagMode ? "FLAG" : "REVEAL"}.`,
      "system"
    );
  }

  syncModeButton() {
    this.modeToggleButton.setAttribute("data-mode", this.isFlagMode ? "flag" : "reveal");
    this.modeToggleButton.setAttribute("aria-pressed", this.isFlagMode ? "true" : "false");
    this.modeToggleButton.textContent = `Mode: ${this.isFlagMode ? "Flag" : "Reveal"}`;
  }

  placeMines(firstCell) {
    const forbidden = new Set();
    forbidden.add(this.cellToIndex(firstCell.x, firstCell.y));

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = firstCell.x + dx;
        const ny = firstCell.y + dy;
        if (this.isInBounds(nx, ny)) {
          forbidden.add(this.cellToIndex(nx, ny));
        }
      }
    }

    for (const cell of this.cells) {
      if (cell.isPortal) {
        forbidden.add(this.cellToIndex(cell.x, cell.y));
      }
    }

    const pool = [];
    for (let i = 0; i < this.cells.length; i += 1) {
      if (!forbidden.has(i)) {
        pool.push(i);
      }
    }

    this.shuffle(pool);
    const mineTotal = Math.min(this.mineCount, pool.length);
    for (let i = 0; i < mineTotal; i += 1) {
      const idx = pool[i];
      this.cells[idx].mine = true;
    }
  }

  computeAdjacencies() {
    for (const cell of this.cells) {
      if (cell.mine) {
        cell.adjacent = -1;
        continue;
      }
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          if (!this.isInBounds(nx, ny)) {
            continue;
          }
          const neighbor = this.cells[this.cellToIndex(nx, ny)];
          if (neighbor.mine) {
            count += 1;
          }
        }
      }
      cell.adjacent = count;
    }
  }

  revealCell(cell) {
    if (cell.flagged || cell.revealed) {
      return;
    }

    if (!this.firstRevealDone) {
      this.placeMines(cell);
      this.computeAdjacencies();
      this.firstRevealDone = true;
      this.startTimer();
      this.setStatus("Running", "running");
      this.setPlayerState("SWEEP", "running");
      this.addChatLine("Mission started. Minefield live.", "system");
    }

    if (cell.mine) {
      this.revealMine(cell, true);
      this.finishGame(false);
      return;
    }

    this.floodReveal(cell);
    this.checkWin();
  }

  floodReveal(startCell) {
    const queue = [startCell];
    const visited = new Set();

    while (queue.length > 0) {
      const cell = queue.shift();
      const index = this.cellToIndex(cell.x, cell.y);
      if (visited.has(index) || cell.revealed || cell.flagged) {
        continue;
      }
      visited.add(index);

      this.revealSafeCell(cell);
      if (cell.adjacent !== 0) {
        continue;
      }

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          if (!this.isInBounds(nx, ny)) {
            continue;
          }
          const neighbor = this.cells[this.cellToIndex(nx, ny)];
          if (!neighbor.revealed && !neighbor.mine && !neighbor.flagged) {
            queue.push(neighbor);
          }
        }
      }
    }
  }

  revealSafeCell(cell) {
    if (cell.revealed) {
      return;
    }

    if (this.targetedCell === cell) {
      this.applyCellHighlight(cell, false);
      this.targetedCell = null;
    }

    cell.revealed = true;

    const mesh = cell.mesh;
    mesh.position.y = 0.12;
    mesh.scale.y = 0.35;
    mesh.material.color.set(cell.isPortal ? "#175473" : "#133055");

    if (cell.adjacent > 0) {
      cell.numberSprite = this.createTextSprite(String(cell.adjacent), NUMBER_COLORS[cell.adjacent], 210);
      cell.numberSprite.position.set(mesh.position.x, 0.45, mesh.position.z);
      this.boardGroup.add(cell.numberSprite);
    }

    if (cell.isPortal) {
      this.activatePortal(cell);
    }
  }

  activatePortal(cell) {
    if (!cell.isPortal || cell.portalTriggered || !cell.portalPartner) {
      return;
    }

    const partner = cell.portalPartner;
    cell.portalTriggered = true;
    partner.portalTriggered = true;

    this.setPortalStatus("Transit", "running");
    this.showPortalTransition(`Portal ${this.cellLabel(cell)} -> ${this.cellLabel(partner)}`);
    this.addChatLine(
      `Portal link used: ${this.cellLabel(cell)} to ${this.cellLabel(partner)}.`,
      "portal"
    );

    this.focusCameraOnCell(partner);

    if (!partner.revealed && !partner.flagged && !partner.mine) {
      this.revealSafeCell(partner);
      if (partner.adjacent === 0) {
        this.floodReveal(partner);
      }
    }

    if (this.portalStatusTimeoutId) {
      window.clearTimeout(this.portalStatusTimeoutId);
      this.portalStatusTimeoutId = null;
    }

    this.portalStatusTimeoutId = window.setTimeout(() => {
      if (!this.gameOver) {
        this.setPortalStatus("Linked", "portal");
      }
    }, 500);
  }

  focusCameraOnCell(cell) {
    if (!cell || !cell.mesh) {
      return;
    }

    const focusTarget = new THREE.Vector3(cell.mesh.position.x, 0.32, cell.mesh.position.z);
    const toCenter = new THREE.Vector3(-focusTarget.x, 0, -focusTarget.z);
    if (toCenter.lengthSq() < 0.001) {
      toCenter.set(0, 0, 1);
    }
    toCenter.normalize();

    const spawn = focusTarget
      .clone()
      .addScaledVector(toCenter, 2.25)
      .setY(this.playerHeight);

    this.camera.position.copy(spawn);
    this.clampPlayerToBounds();
    this.camera.lookAt(focusTarget);
  }

  revealMine(cell, exploded = false) {
    if (this.targetedCell === cell) {
      this.applyCellHighlight(cell, false);
      this.targetedCell = null;
    }

    const mesh = cell.mesh;
    cell.revealed = true;
    mesh.position.y = 0.13;
    mesh.scale.y = 0.32;

    if (
      mesh.material &&
      mesh.material !== this.hiddenMaterial &&
      mesh.material !== this.revealedMaterial &&
      mesh.material !== this.mineMaterial &&
      mesh.material !== this.explodedMaterial
    ) {
      mesh.material.dispose();
    }

    mesh.material = exploded ? this.explodedMaterial : this.revealedMaterial;

    const mineMesh = new THREE.Mesh(this.mineGeometry, this.mineMaterial);
    mineMesh.position.set(mesh.position.x, 0.4, mesh.position.z);
    this.boardGroup.add(mineMesh);
    cell.mineMesh = mineMesh;
  }

  toggleFlag(cell) {
    if (cell.revealed) {
      return;
    }

    cell.flagged = !cell.flagged;

    if (cell.flagged) {
      this.flagsPlaced += 1;
      cell.marker = this.createFlagMarker(cell.mesh.position.x, cell.mesh.position.z);
      this.boardGroup.add(cell.marker);
      this.addChatLine(`Flag set at ${this.cellLabel(cell)}.`, "system");
    } else {
      this.flagsPlaced = Math.max(0, this.flagsPlaced - 1);
      if (cell.marker) {
        this.disposeObject(cell.marker);
        this.boardGroup.remove(cell.marker);
      }
      cell.marker = null;
      this.addChatLine(`Flag removed from ${this.cellLabel(cell)}.`, "system");
    }

    this.updateMinesUI();
  }

  createFlagMarker(x, z) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      this.flagPoleGeometry,
      new THREE.MeshStandardMaterial({
        color: "#d6dfee",
        roughness: 0.35,
        metalness: 0.48,
      })
    );
    pole.position.y = 0.36;
    group.add(pole);

    const cloth = new THREE.Mesh(
      this.flagClothGeometry,
      new THREE.MeshStandardMaterial({
        color: "#ff5c77",
        roughness: 0.38,
        metalness: 0.04,
      })
    );
    cloth.rotation.z = -Math.PI / 2;
    cloth.position.set(0.12, 0.48, 0);
    group.add(cloth);

    group.position.set(x, 0, z);
    return group;
  }

  finishGame(didWin) {
    this.gameOver = true;
    this.win = didWin;
    this.stopTimer();

    if (didWin) {
      this.setStatus("Victory", "win");
      this.setPortalStatus("Stable", "portal");
      this.setPlayerState("CLEAR", "win");
      this.addChatLine("Mission clear. All safe cells opened.", "system");
      return;
    }

    this.setStatus("Game Over", "lose");
    this.setPortalStatus("Critical", "portal-alert");
    this.setPlayerState("DOWN", "lose");
    this.addChatLine("Mine detonated. Mission failed.", "alert");

    for (const cell of this.cells) {
      if (cell.mine && !cell.revealed) {
        this.revealMine(cell, false);
      }

      if (cell.flagged && !cell.mine && cell.marker) {
        const wrong = this.createTextSprite("X", "#ffd6d6", 180);
        wrong.position.set(cell.mesh.position.x, 0.62, cell.mesh.position.z);
        this.boardGroup.add(wrong);
      }
    }
  }

  checkWin() {
    const revealedSafeCount = this.cells.filter((cell) => cell.revealed && !cell.mine).length;
    const target = this.cells.length - this.mineCount;
    if (revealedSafeCount === target) {
      this.finishGame(true);
    }
  }

  updateMinesUI() {
    const remaining = this.mineCount - this.flagsPlaced;
    this.minesLeftNode.textContent = String(remaining);
  }

  setStatus(text, mode = "ready") {
    this.statusNode.textContent = text;
    this.statusNode.classList.remove(...STATUS_CLASS_NAMES);
    this.statusNode.classList.add(mode);
  }

  setPortalStatus(text, mode = "portal") {
    if (!this.portalStatusNode) {
      return;
    }

    this.portalStatusNode.textContent = text;
    this.portalStatusNode.classList.remove(...STATUS_CLASS_NAMES);
    this.portalStatusNode.classList.add(mode);
  }

  setPlayerState(text, mode = "") {
    if (!this.playerStateNode) {
      return;
    }

    this.playerStateNode.textContent = text;
    this.playerStateNode.classList.remove(...PLAYER_STATE_CLASS_NAMES);
    if (mode) {
      this.playerStateNode.classList.add(mode);
    }
  }

  updateTimeUI() {
    this.timeNode.textContent = String(this.elapsedSeconds);
  }

  startTimer() {
    this.stopTimer();
    this.timerId = window.setInterval(() => {
      if (this.gameOver) {
        return;
      }
      this.elapsedSeconds += 1;
      this.updateTimeUI();
    }, 1000);
  }

  stopTimer() {
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  clearPortalTransition() {
    if (this.portalTransitionTimeoutId) {
      window.clearTimeout(this.portalTransitionTimeoutId);
      this.portalTransitionTimeoutId = null;
    }

    if (this.portalStatusTimeoutId) {
      window.clearTimeout(this.portalStatusTimeoutId);
      this.portalStatusTimeoutId = null;
    }

    if (this.portalTransitionNode) {
      this.portalTransitionNode.classList.remove("active");
      this.portalTransitionNode.setAttribute("aria-hidden", "true");
    }
  }

  showPortalTransition(text) {
    if (!this.portalTransitionNode || !this.portalTransitionTextNode) {
      return;
    }

    this.clearPortalTransition();
    this.portalTransitionTextNode.textContent = text;
    this.portalTransitionNode.classList.add("active");
    this.portalTransitionNode.setAttribute("aria-hidden", "false");

    this.portalTransitionTimeoutId = window.setTimeout(() => {
      if (!this.portalTransitionNode) {
        return;
      }
      this.portalTransitionNode.classList.remove("active");
      this.portalTransitionNode.setAttribute("aria-hidden", "true");
    }, 560);
  }

  seedChat() {
    this.addChatLine("MIC linked. HUD synchronized with pilot profile.", "system");
    this.addChatLine("Portal pair loaded. Reveal a portal tile to transit.", "portal");
    this.addChatLine("Type /help for local commands.", "system");
  }

  sendChatMessage() {
    if (!this.chatInputNode) {
      return;
    }

    const raw = this.chatInputNode.value.trim();
    if (!raw) {
      return;
    }

    this.chatInputNode.value = "";

    if (raw.startsWith("/")) {
      this.handleChatCommand(raw);
      return;
    }

    this.addChatLine(`MIC-01: ${raw}`, "player");
  }

  handleChatCommand(rawCommand) {
    const [command] = rawCommand.toLowerCase().split(/\s+/);

    if (command === "/new") {
      this.resetGame({ announce: true });
      this.addChatLine("Command accepted: new field.", "system");
      return;
    }

    if (command === "/mode") {
      this.toggleMode();
      return;
    }

    if (command === "/portal") {
      if (this.portalCells.length < 2) {
        this.addChatLine("Portal pair unavailable.", "alert");
        return;
      }
      const a = this.cellLabel(this.portalCells[0]);
      const b = this.cellLabel(this.portalCells[1]);
      this.addChatLine(`Portal pair: ${a} <-> ${b}`, "portal");
      return;
    }

    if (command === "/help") {
      this.addChatLine("Commands: /new, /mode, /portal, /help", "system");
      return;
    }

    this.addChatLine(`Unknown command: ${rawCommand}`, "alert");
  }

  addChatLine(text, type = "system") {
    if (!this.chatLogNode) {
      return;
    }

    const line = document.createElement("p");
    line.className = `chat-line ${type}`;
    line.textContent = `[${this.chatTimeStamp()}] ${text}`;

    this.chatLogNode.append(line);
    while (this.chatLogNode.children.length > this.chatMaxLines) {
      this.chatLogNode.firstElementChild.remove();
    }
    this.chatLogNode.scrollTop = this.chatLogNode.scrollHeight;
  }

  chatTimeStamp() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  toggleChat() {
    if (!this.chatNode || !this.chatToggleButton) {
      return;
    }

    this.chatCollapsed = !this.chatCollapsed;
    this.chatNode.classList.toggle("collapsed", this.chatCollapsed);
    this.chatToggleButton.textContent = this.chatCollapsed ? "Show" : "Hide";
    this.chatToggleButton.setAttribute("aria-expanded", this.chatCollapsed ? "false" : "true");

    if (!this.chatCollapsed && this.chatInputNode) {
      this.controls.unlock();
      this.chatInputNode.focus({ preventScroll: true });
    } else if (this.chatCollapsed) {
      this.tryLockPointer();
    }
  }

  createTextSprite(text, color, size = 256) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.floor(size * 0.56)}px "Bahnschrift", "Trebuchet MS", sans-serif`;
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
    ctx.shadowBlur = 12;
    ctx.fillText(text, size / 2, size / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.55, 0.55, 0.55);
    return sprite;
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.05);
    const t = (performance.now() - this.animationStart) / 1000;
    this.updateMovement(delta);
    this.updateTargetCell();

    for (const cell of this.portalCells) {
      if (!cell.portalMarker) {
        continue;
      }

      const marker = cell.portalMarker;
      const phase = marker.userData.phase ?? 0;
      const bob = Math.sin(t * 2.1 + phase) * 0.035;
      marker.rotation.y += 0.018;
      marker.position.y = 0.68 + bob;

      const core = marker.userData.core;
      if (core?.material) {
        core.material.opacity = 0.72 + Math.sin(t * 3.2 + phase) * 0.18;
      }
    }

    if (this.playerAvatar) {
      this.playerAvatar.position.y = this.playerAvatarBaseY + Math.sin(t * 1.6) * 0.03;
      this.playerAvatar.rotation.y = Math.sin(t * 0.7) * 0.12;
    }

    this.renderer.render(this.scene, this.camera);
  }

  cellLabel(cell) {
    return `${this.columnLabel(cell.x)}${cell.y + 1}`;
  }

  columnLabel(index) {
    let value = index + 1;
    let out = "";
    while (value > 0) {
      const mod = (value - 1) % 26;
      out = String.fromCharCode(65 + mod) + out;
      value = Math.floor((value - 1) / 26);
    }
    return out;
  }

  isInBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  cellToIndex(x, y) {
    return y * this.width + x;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}

new Minefield3D();
