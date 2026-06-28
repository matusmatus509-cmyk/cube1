import * as THREE from 'three';
import { RubiksCube } from './RubiksCube';
import { CubeInteraction } from './CubeInteraction';
import { CubeStateData, createSolvedState, MoveType } from './CubeState';

export class CubeScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private cube: RubiksCube;
  private cubeGroup: THREE.Group;
  private interaction: CubeInteraction;
  private animFrameId: number = 0;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = null;

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 7.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Lighting
    this.setupLights();

    // Cube group (for whole-cube rotation by dragging)
    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);

    // Initial isometric-like tilt (similar to reference image)
    this.cubeGroup.rotation.x = 0.35;
    this.cubeGroup.rotation.y = 0.65;

    // Create cube
    const initialState = createSolvedState();
    this.cube = new RubiksCube(this.scene, this.cubeGroup, initialState);

    // Interaction
    this.interaction = new CubeInteraction(
      this.cube,
      this.camera,
      this.renderer,
      this.cubeGroup
    );

    // Resize handler
    window.addEventListener('resize', this.onResize);

    // Start render loop
    this.startRenderLoop();
  }

  private setupLights() {
    // Ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    // Main directional light (top-right-front)
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dir1.position.set(5, 8, 6);
    this.scene.add(dir1);

    // Fill light (bottom-left-back)
    const dir2 = new THREE.DirectionalLight(0x8899ff, 0.3);
    dir2.position.set(-4, -3, -4);
    this.scene.add(dir2);

    // Rim light
    const dir3 = new THREE.DirectionalLight(0xffeecc, 0.2);
    dir3.position.set(0, 0, -5);
    this.scene.add(dir3);
  }

  private startRenderLoop() {
    const animate = () => {
      this.animFrameId = requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  setOnStateChange(fn: (state: CubeStateData) => void) {
    this.cube.setOnStateChange(fn);
  }

  reset() {
    const solved = createSolvedState();
    this.cube.setState(solved);
  }

  executeMove(move: MoveType) {
    this.cube.executeMove(move);
  }

  resetRotation() {
    this.cubeGroup.rotation.x = 0.35;
    this.cubeGroup.rotation.y = 0.65;
    this.cubeGroup.rotation.z = 0;
  }

  getState(): CubeStateData {
    return this.cube.getState();
  }

  destroy() {
    cancelAnimationFrame(this.animFrameId);
    this.interaction.destroy();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
