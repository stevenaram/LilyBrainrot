import * as THREE from "three";
import { PAD_POSITIONS, RARITIES } from "./config";
import type { EventBus } from "./events";
import type { GameController } from "./game";
import type { BrainrotInstance, GameState, RarityTier } from "./types";

type CharacterNode = {
  group: THREE.Group;
  sprite: THREE.Sprite;
  shadow: THREE.Sprite;
  aura: THREE.Sprite[];
  instance: BrainrotInstance;
  walkProgress: number;
  phase: number;
};

const STAGE_WIDTH = 14.82;
const STAGE_HEIGHT = 8.34;

export class ParadeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 50);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerWorld = new THREE.Vector3();
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.4);
  private textures = new Map<number, THREE.Texture>();
  private nodes = new Map<string, CharacterNode>();
  private pads: THREE.Mesh[] = [];
  private padCenters: THREE.Mesh[] = [];
  private padHalos: THREE.Mesh[] = [];
  private particles: THREE.Sprite[] = [];
  private emojiTextures = new Map<string, THREE.CanvasTexture>();
  private draggedId: string | null = null;
  private dragOffset = new THREE.Vector3();
  private animationFrame = 0;
  private previousTime = performance.now();
  private cameraKick = 0;
  private state: GameState;
  private resizeObserver: ResizeObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    private container: HTMLElement,
    private game: GameController,
    private bus: EventBus,
  ) {
    this.state = game.state;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(0, 0.12, 11.1);
    this.camera.lookAt(0, 0, 0);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.bindEvents();
  }

  async load(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const loadTexture = (url: string) => loader.loadAsync(url).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      return texture;
    });

    const [background, first, second, third] = await Promise.all([
      loadTexture(new URL("../assets/world-background-1.png", import.meta.url).href),
      loadTexture(new URL("../assets/brainrot1.png", import.meta.url).href),
      loadTexture(new URL("../assets/brainrot2.png", import.meta.url).href),
      loadTexture(new URL("../assets/brainrot3.png", import.meta.url).href),
    ]);
    this.textures.set(1, first);
    this.textures.set(2, second);
    this.textures.set(3, third);

    const backgroundMaterial = new THREE.MeshBasicMaterial({ map: background, depthWrite: false });
    const backgroundMesh = new THREE.Mesh(new THREE.PlaneGeometry(STAGE_WIDTH, STAGE_HEIGHT), backgroundMaterial);
    backgroundMesh.position.z = -2.5;
    backgroundMesh.renderOrder = -10;
    this.scene.add(backgroundMesh);

    this.createPads();
    this.syncState(this.state);
    this.resize();
    this.animate(performance.now());
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }

  private bindEvents(): void {
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.onPointerUp(event));
    window.addEventListener("blur", () => this.cancelDrag());

    this.bus.on("statechange", (state) => {
      this.state = state;
      this.syncState(state);
    });
    this.bus.on("merge", ({ padId }) => {
      const position = PAD_POSITIONS[padId];
      this.burst(position.x, position.y + 0.2, RARITIES.rainbow.css, 20);
      this.cameraKick = this.state.settings.reducedMotion ? 0 : 0.16;
    });
    this.bus.on("rosterexpand", ({ unlockedPads }) => {
      const firstNewPad = Math.max(0, unlockedPads - 2);
      for (let id = firstNewPad; id < unlockedPads; id += 1) {
        const position = PAD_POSITIONS[id];
        this.burst(position.x, position.y, "#9dffea", 10);
      }
    });
    this.bus.on("discover", ({ instance }) => {
      const color = RARITIES[instance.rarity].css;
      this.burst(0, 0.2, color, 12);
    });
    this.bus.on("income", ({ padId }) => {
      const position = PAD_POSITIONS[padId];
      this.floatStar(position.x, position.y + 0.65);
    });
  }

  private createPads(): void {
    PAD_POSITIONS.forEach((position, id) => {
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(0.72, 48),
        new THREE.MeshBasicMaterial({
          color: id % 2 === 0 ? 0xff7abb : 0x9a64ff,
          transparent: true,
          opacity: 0.94,
          depthWrite: false,
        }),
      );
      pad.position.set(position.x, position.y, -0.05);
      pad.scale.y = 0.35;
      pad.userData.padId = id;
      pad.renderOrder = 1;
      this.scene.add(pad);
      this.pads.push(pad);

      const center = new THREE.Mesh(
        new THREE.CircleGeometry(0.61, 48),
        new THREE.MeshBasicMaterial({ color: 0xcaff7c, transparent: true, opacity: 0.9, depthWrite: false }),
      );
      center.position.set(position.x, position.y, -0.04);
      center.scale.y = 0.35;
      center.renderOrder = 2;
      this.scene.add(center);
      this.padCenters.push(center);

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.68, 0.84, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffff9a,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      halo.position.set(position.x, position.y, -0.03);
      halo.scale.y = 0.35;
      halo.renderOrder = 3;
      this.scene.add(halo);
      this.padHalos.push(halo);
    });
  }

  private syncState(state: GameState): void {
    this.layoutPads(state.unlockedPads);
    const currentIds = new Set(state.instances.map((instance) => instance.id));
    for (const [id, node] of this.nodes) {
      if (!currentIds.has(id)) {
        this.scene.remove(node.group);
        node.sprite.material.dispose();
        this.nodes.delete(id);
      }
    }

    state.instances.forEach((instance, index) => {
      let node = this.nodes.get(instance.id);
      if (!node) {
        node = this.createCharacter(instance, index);
        this.nodes.set(instance.id, node);
        this.scene.add(node.group);
      }
      node.instance = instance;
      this.applyRarity(node, instance.rarity);
      if (instance.status === "placed" && instance.padId !== null && this.draggedId !== instance.id) {
        const position = PAD_POSITIONS[instance.padId];
        node.group.position.x = position.x;
        node.group.position.y = position.y + this.placedYOffset();
        node.group.position.z = 0.25;
        node.group.scale.setScalar(this.placedScale());
      }
    });
  }

  private createCharacter(instance: BrainrotInstance, index: number): CharacterNode {
    const texture = this.textures.get(instance.type);
    if (!texture) throw new Error(`Missing texture for brainrot ${instance.type}`);
    const group = new THREE.Group();
    group.position.set((index % 3 - 1) * 0.5, 1.35, 0.2);

    const shadowTexture = this.createShadowTexture();
    const shadow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }));
    shadow.scale.set(1.1, 0.28, 1);
    shadow.position.set(0, -0.92, -0.08);
    shadow.renderOrder = 4;
    group.add(shadow);

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.78, 2.38, 1);
    sprite.position.y = 0;
    sprite.userData.instanceId = instance.id;
    sprite.renderOrder = 5;
    group.add(sprite);

    const aura = Array.from({ length: 3 }, (_, auraIndex) => {
      const auraSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
      }));
      auraSprite.scale.setScalar(0.36);
      auraSprite.position.z = 0.08;
      auraSprite.userData.auraIndex = auraIndex;
      auraSprite.renderOrder = 7;
      auraSprite.visible = false;
      group.add(auraSprite);
      return auraSprite;
    });

    return {
      group,
      sprite,
      shadow,
      aura,
      instance,
      walkProgress: 0,
      phase: Math.random() * Math.PI * 2,
    };
  }

  private applyRarity(node: CharacterNode, rarity: RarityTier): void {
    const material = node.sprite.material;
    material.color.setHex(RARITIES[rarity].color);
    material.opacity = 1;
    if (rarity === "bubblegum") material.color.offsetHSL(-0.04, 0.18, 0.08);
    if (rarity === "neon") material.color.offsetHSL(0.05, 0.3, 0.12);
    if (rarity === "ocean") material.color.offsetHSL(0.08, 0.22, -0.02);
    node.sprite.userData.rarity = rarity;
    const emoji = RARITIES[rarity].emoji;
    node.aura.forEach((aura) => {
      const auraMaterial = aura.material as THREE.SpriteMaterial;
      auraMaterial.map = emoji ? this.getEmojiTexture(emoji, RARITIES[rarity].css) : null;
      auraMaterial.needsUpdate = true;
      aura.visible = Boolean(emoji) && node.instance.status === "placed";
    });
  }

  private layoutPads(unlockedPads: number): void {
    const compact = unlockedPads > 6;
    this.pads.forEach((pad, id) => {
      const visible = id < unlockedPads;
      const size = compact ? 0.78 : 1;
      pad.visible = visible;
      this.padCenters[id].visible = visible;
      this.padHalos[id].visible = visible;
      pad.scale.set(size, 0.35 * size, 1);
      this.padCenters[id].scale.set(size, 0.35 * size, 1);
      if ((this.padHalos[id].material as THREE.MeshBasicMaterial).opacity === 0) {
        this.padHalos[id].scale.set(size, 0.35 * size, 1);
      }
    });
  }

  private placedScale(): number {
    if (this.state.unlockedPads >= 11) return 0.52;
    if (this.state.unlockedPads > 6) return 0.62;
    return 0.9;
  }

  private placedYOffset(): number {
    return this.state.unlockedPads > 6 ? 0.17 : 0.25;
  }

  private getEmojiTexture(emoji: string, color: string): THREE.CanvasTexture {
    const key = `${emoji}:${color}`;
    const cached = this.emojiTextures.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.beginPath();
    context.arc(64, 64, 46, 0, Math.PI * 2);
    context.fillStyle = `${color}cc`;
    context.shadowColor = "#ffffff";
    context.shadowBlur = 16;
    context.fill();
    context.lineWidth = 7;
    context.strokeStyle = "#ffffff";
    context.stroke();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "64px Apple Color Emoji, Segoe UI Emoji, sans-serif";
    context.shadowBlur = 0;
    context.fillText(emoji, 64, 68);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.emojiTextures.set(key, texture);
    return texture;
  }

  private createShadowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 32, 2, 64, 32, 54);
    gradient.addColorStop(0, "rgba(78,51,72,.75)");
    gradient.addColorStop(1, "rgba(78,51,72,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 64);
    return new THREE.CanvasTexture(canvas);
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.draggedId) return;
    this.updatePointer(event);
    const sprites = [...this.nodes.values()].map((node) => node.sprite);
    const hit = this.raycaster.intersectObjects(sprites, false)[0];
    if (!hit) return;
    const id = hit.object.userData.instanceId as string;
    const node = this.nodes.get(id);
    if (!node) return;

    this.canvas.setPointerCapture(event.pointerId);
    this.raycaster.ray.intersectPlane(this.dragPlane, this.pointerWorld);
    this.dragOffset.copy(node.group.position).sub(this.pointerWorld);
    this.draggedId = id;
    this.game.catchInstance(id);
    node.group.scale.multiplyScalar(1.12);
    node.group.position.z = 0.55;
    this.highlightPads(node.instance);

    window.setTimeout(() => {
      if (this.draggedId === id) {
        this.draggedId = null;
        this.game.autoPlace(id);
        this.clearPadHighlights();
      }
    }, 3_000);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.draggedId) return;
    this.updatePointer(event);
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.pointerWorld)) return;
    const node = this.nodes.get(this.draggedId);
    if (!node) return;
    node.group.position.copy(this.pointerWorld).add(this.dragOffset);
    node.group.position.x = THREE.MathUtils.clamp(node.group.position.x, -5, 5);
    node.group.position.y = THREE.MathUtils.clamp(node.group.position.y, -2.6, 2.2);
    node.group.position.z = 0.55;
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.draggedId) return;
    const id = this.draggedId;
    const node = this.nodes.get(id);
    this.draggedId = null;
    this.clearPadHighlights();
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (!node) return;

    let closestPad = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    PAD_POSITIONS.slice(0, this.state.unlockedPads).forEach((position, index) => {
      const distance = Math.hypot(node.group.position.x - position.x, node.group.position.y - (position.y + 0.25));
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPad = index;
      }
    });
    if (closestDistance < 1.25) {
      this.game.place(id, closestPad);
    } else if (node.instance.padId !== null) {
      this.game.place(id, node.instance.padId);
    } else {
      this.game.autoPlace(id);
    }
  }

  private cancelDrag(): void {
    if (!this.draggedId) return;
    const id = this.draggedId;
    this.draggedId = null;
    this.clearPadHighlights();
    this.game.autoPlace(id);
  }

  private highlightPads(instance: BrainrotInstance): void {
    this.padHalos.forEach((halo, id) => {
      const occupantId = this.state.pads[id]?.occupantId;
      const occupant = occupantId ? this.state.instances.find((item) => item.id === occupantId) : null;
      const isMerge = occupant?.type === instance.type;
      const material = halo.material as THREE.MeshBasicMaterial;
      material.color.set(isMerge ? 0xffff55 : 0x8fffff);
      material.opacity = 0.9;
    });
  }

  private clearPadHighlights(): void {
    this.padHalos.forEach((halo) => {
      (halo.material as THREE.MeshBasicMaterial).opacity = 0;
    });
  }

  private burst(x: number, y: number, color: string, count: number): void {
    if (this.state.settings.reducedMotion) count = Math.min(5, count);
    for (let index = 0; index < count; index += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.createStarTexture(color),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      sprite.position.set(x, y, 1);
      sprite.scale.setScalar(0.25 + Math.random() * 0.25);
      sprite.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 2.2, Math.random() * 2 + 0.5, 0);
      sprite.userData.life = 0.8 + Math.random() * 0.5;
      sprite.userData.age = 0;
      sprite.renderOrder = 20;
      this.scene.add(sprite);
      this.particles.push(sprite);
    }
  }

  private floatStar(x: number, y: number): void {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.createStarTexture("#ffd83d"),
      transparent: true,
      depthWrite: false,
    }));
    sprite.position.set(x, y, 1);
    sprite.scale.setScalar(0.35);
    sprite.userData.velocity = new THREE.Vector3(0, 0.7, 0);
    sprite.userData.life = 1.2;
    sprite.userData.age = 0;
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    this.particles.push(sprite);
  }

  private createStarTexture(color: string): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d")!;
    context.translate(32, 32);
    context.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 === 0 ? 27 : 12;
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    context.closePath();
    context.fillStyle = color;
    context.shadowColor = "#fff";
    context.shadowBlur = 8;
    context.fill();
    return new THREE.CanvasTexture(canvas);
  }

  private animate = (time: number): void => {
    const delta = Math.min(0.04, (time - this.previousTime) / 1000);
    this.previousTime = time;
    const seconds = time / 1000;

    for (const node of this.nodes.values()) {
      const { instance } = node;
      if (this.draggedId === instance.id) continue;
      const reduce = this.state.settings.reducedMotion;

      if (instance.status === "walking") {
        node.walkProgress += delta * 0.025;
        if (node.walkProgress > 0.82) node.walkProgress = 0;
        const p = node.walkProgress;
        node.group.position.x = Math.sin(p * Math.PI * 2 + node.phase) * (0.16 + p * 0.28);
        node.group.position.y = 1.42 - p * 3.65 + (reduce ? 0 : Math.abs(Math.sin(seconds * 7 + node.phase)) * 0.08);
        node.group.position.z = 0.18 + p * 0.2;
        node.group.scale.setScalar(0.52 + p * 0.66);
      } else if (instance.status === "placed" && instance.padId !== null) {
        const position = PAD_POSITIONS[instance.padId];
        node.group.position.x = position.x + (reduce ? 0 : Math.sin(seconds * 2.7 + node.phase) * 0.04);
        node.group.position.y = position.y + this.placedYOffset() + (reduce ? 0 : Math.abs(Math.sin(seconds * 3.5 + node.phase)) * 0.06);
        node.group.rotation.z = reduce ? 0 : Math.sin(seconds * 2.7 + node.phase) * 0.045;
        node.group.scale.setScalar(this.placedScale());
      }

      if (instance.rarity === "rainbow") {
        (node.sprite.material as THREE.SpriteMaterial).color.setHSL((seconds * 0.13 + node.phase) % 1, 0.65, 0.72);
      }
      if (instance.rarity === "cosmic") {
        (node.sprite.material as THREE.SpriteMaterial).color.setHSL((0.72 + Math.sin(seconds * 0.8 + node.phase) * 0.08) % 1, 0.7, 0.66);
      }
      if (instance.rarity === "golden" && Math.random() < delta * 1.5) {
        this.burst(node.group.position.x, node.group.position.y + 0.35, "#ffd94a", 1);
      }
      node.aura.forEach((aura, auraIndex) => {
        aura.visible = Boolean(RARITIES[instance.rarity].emoji) && instance.status === "placed";
        if (!aura.visible) return;
        const orbit = seconds * (0.55 + auraIndex * 0.08) + node.phase + auraIndex * 2.1;
        aura.position.x = Math.cos(orbit) * (0.72 + auraIndex * 0.04);
        aura.position.y = 0.1 + ((seconds * (0.28 + auraIndex * 0.04) + auraIndex * 0.31) % 1.25);
        const auraMaterial = aura.material as THREE.SpriteMaterial;
        auraMaterial.opacity = 0.72 + Math.sin(orbit * 2) * 0.2;
        aura.scale.setScalar(0.5 + auraIndex * 0.06);
      });
    }

    this.particles = this.particles.filter((particle) => {
      particle.userData.age += delta;
      particle.position.addScaledVector(particle.userData.velocity as THREE.Vector3, delta);
      const remaining = 1 - particle.userData.age / particle.userData.life;
      (particle.material as THREE.SpriteMaterial).opacity = Math.max(0, remaining);
      particle.scale.multiplyScalar(1 + delta * 0.5);
      if (remaining <= 0) {
        this.scene.remove(particle);
        (particle.material as THREE.SpriteMaterial).dispose();
        return false;
      }
      return true;
    });

    this.padHalos.forEach((halo, index) => {
      if ((halo.material as THREE.MeshBasicMaterial).opacity > 0) {
        halo.scale.set(1 + Math.sin(seconds * 5 + index) * 0.08, 0.35 + Math.sin(seconds * 5 + index) * 0.025, 1);
      }
    });

    this.game.tickIncome();
    const kick = this.cameraKick;
    this.camera.position.x = kick ? Math.sin(seconds * 50) * kick : 0;
    this.cameraKick = Math.max(0, this.cameraKick - delta * 0.75);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private resize(): void {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
