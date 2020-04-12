import {
  AmmoJSPlugin,
  Vector3,
  Analyser,
  Sound,
  WebXRState,
  ShadowGenerator,
  Color3,
  Color4,
  Mesh,
  PointerEventTypes,
  AbstractMesh,
  CubeTexture,
  PhysicsImpostor,
  MeshBuilder,
  Nullable,
  HemisphericLight,
  Texture,
  StandardMaterial,
  Engine,
  Scene,
  UniversalCamera,
  WebXRDefaultExperienceOptions,
  DirectionalLight,
  PhysicsImpostorParameters,
  SpotLight,
  PointLight,
  WebXRDefaultExperience
} from '@babylonjs/core';
import '@babylonjs/loaders';
import '@babylonjs/gui';

import Emitter from './Emitter';
import WebXRPolyfill from 'webxr-polyfill';
const webXRPolyfill = new WebXRPolyfill();

import texture from './images/texture.jpg';

type GameState = 'main' | 'playing' | 'win' | 'lost' | 'loading';

class App extends Emitter {
  private canvas: HTMLElement | null = null;
  private scene: Scene | null = null;
  private xrHelper: WebXRDefaultExperience | null = null;

  private bullets: Mesh[] = [];
  private bulletIndex: number = 0;

  private microphoneSensivity: number = 10;

  private gameState: GameState = 'loading';

  constructor(canvas: HTMLElement | null, enterXRButton: HTMLElement | null) {
    super();
    this.canvas = canvas;
  }

  private async startListeningforMicrophoneInput() {
    const audioContext = new AudioContext();
    let lastAudioDiff = 0;
    const mediaStreamConstraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1
      },
      video: false
    };
    const stream: MediaStream = await navigator.mediaDevices
      .getUserMedia(mediaStreamConstraints);

    const microphoneAudioNode = audioContext.createMediaStreamSource(stream);
    const analyserNode = audioContext.createAnalyser();
    analyserNode.smoothingTimeConstant = 0;
    analyserNode.fftSize = 1024;
    microphoneAudioNode.connect(analyserNode);
    const scriptNode: ScriptProcessorNode =
      audioContext.createScriptProcessor(0, 1, 1);
    if (scriptNode !== null) {
      scriptNode.connect(analyserNode);
      scriptNode.onaudioprocess = () => {
        const frequencyArray: Uint8Array = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(frequencyArray);

        let values = 0;
        const length = frequencyArray.length;
        for (let i = 0; i < length; i++) {
          values += (frequencyArray[i]);
        }
        const avarageValue = values / length;

        const diff = avarageValue - lastAudioDiff;
        if (diff > this.microphoneSensivity) {
          this.throwBullet(diff / 10);
        }
        lastAudioDiff = avarageValue
      };
    }
  }

  private enableScenePhysics(scene: Scene): void {
    const ammo = new AmmoJSPlugin(true);
    ammo.setMaxSteps(10);
    ammo.setFixedTimeStep(1 / (240));
    scene.enablePhysics(new Vector3(0, -10, 0), ammo);
  }

  private addStandardMaterial(
    scene: Scene,
    color: string = '#ffffff',
    backFaceCulling: boolean = false,
    name: string = 'material'
  ) {
    const material = new StandardMaterial(name, scene);

    material.backFaceCulling = backFaceCulling;
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor = Color3.FromHexString(color);

    // material.wireframe = true;
    // material.ambientColor = Color3.FromHexString(color);
    // material.specularColor  = Color3.FromHexString(color);
    return material;
  }

  private addSky(scene: Scene, diameter: number = 100): Mesh {
    scene.clearColor = new Color4(1, 1, 1, 1);
    const color = '#ffffff';
    const skyDome = MeshBuilder.CreateSphere(
      'skyDome',
      { diameter },
      scene
    );
    new PhysicsImpostor(
      skyDome,
      PhysicsImpostor.MeshImpostor,
      { mass: 0, friction: 20, restitution: 4 },
      scene
    );

    skyDome.material = this.addStandardMaterial(scene, color, false, 'skyDomeMat');
    return skyDome;
  }

  private addcamera(scene: Scene, canvas: HTMLElement): UniversalCamera {
    const cameraPosition = new Vector3(0, 1.6, 5); // new Vector3(0, 1.6, -20);
    const camera = new UniversalCamera('camera1', cameraPosition, scene);
    camera.inputs.clear();
    camera.inputs.addMouse();

    camera.setTarget(new Vector3(0, 1.6, 0));
    camera.attachControl(canvas, true);
    return camera;
  }

  private addBullets(scene: Scene, maxBullets: number = 20): Mesh[] {
    const bulletSize = 0.1;
    const bullets: Mesh[] = [];
    for (let i = 0; i < maxBullets; i++) {
      const sphere = Mesh.CreateSphere(`spere${i}_shadow`, 8, bulletSize, scene);
      sphere.physicsImpostor = new PhysicsImpostor(
        sphere,
        PhysicsImpostor.SphereImpostor,
        { mass: 0.1 },
        scene
      );
      sphere.position.y = bulletSize;
      sphere.position.x = 0;
      sphere.position.z = 2 + (i * bulletSize);
      bullets.push(sphere);
    }
    return bullets;
  }

  private throwBullet(speed: number = 7, scene: Scene | null = this.scene) {
    if (scene != null && scene.activeCamera !== null) {
      const throwRay = scene.activeCamera.getForwardRay();
      const sphere = this.bullets[this.bulletIndex];
      const position = throwRay.origin.clone();
      position.y = position.y - 0.05;
      sphere.position.copyFrom(position);
      if (sphere.physicsImpostor !== null) {
        // sphere.physicsImpostor.setAngularVelocity(throwRay.direction.scale(30));
        sphere.physicsImpostor.setLinearVelocity(throwRay.direction.scale(10));
        this.bulletIndex = this.bulletIndex + 1;
        if (this.bulletIndex >= this.bullets.length) {
          this.bulletIndex = 0;
        }
      }
    }
  }

  private addLightsAndShadows(scene: Scene): void {
    const hLight = new HemisphericLight('light', new Vector3(-1, 1, 0), scene);
    hLight.intensity = .7;
    hLight.diffuse = Color3.FromHexString('#ff0000');
    hLight.specular = Color3.FromHexString('#00ff00');
    hLight.groundColor = Color3.FromHexString('#0000ff');

    const light = new DirectionalLight(
      'directLight',
      new Vector3(0, -100, -100),
      scene
    );

    scene.meshes.forEach(mesh => {
      if (mesh.name.endsWith('_shadow')) {
        const shadowGenerator = new ShadowGenerator(1024, light);
        shadowGenerator.addShadowCaster(mesh);
        shadowGenerator.setDarkness(0.5);
        shadowGenerator.usePoissonSampling = true;
        // shadowGenerator.getShadowMap().renderList.push(mesh);
        // shadowGenerator.useExponentialShadowMap = true;
        // shadowGenerator.useBlurExponentialShadowMap = true;
        mesh.receiveShadows = true;
      }
    });

  }

  private addGround(scene: Scene, groundName: string = 'ground'): Mesh {
    const color = '#FFE5B4'
    const ground = MeshBuilder.CreateBox(
      groundName,
      { height: 0.1, width: 1000, depth: 1000 },
      scene
    );
    ground.position.y = 0;
    ground.position.x = 0;

    ground.material = this.addStandardMaterial(scene, color, false, 'groundMat');
    ground.receiveShadows = true;

    ground.physicsImpostor = new PhysicsImpostor(
      ground,
      PhysicsImpostor.BoxImpostor,
      { mass: 0, friction: 0.5, restitution: 2 },
      scene
    );
    return ground;
  }

  private async enterXR() {
    try {
      await this.startListeningforMicrophoneInput();
      await this.xrHelper?.baseExperience
        .enterXRAsync('immersive-vr', 'local-floor');
    } catch (error) {
      alert('Error initializing: ' + error);
    }
  }

  private async setupXR(scene: Scene, ground: Mesh): Promise<WebXRDefaultExperience> {
    const engine = scene.getEngine();
    const XRExperienceOptions: WebXRDefaultExperienceOptions = {
      disableDefaultUI: true,
      disableTeleportation: true
    };
    if (ground !== null) {
      XRExperienceOptions.floorMeshes = [ground];
    }

    const xrHelper = await scene.createDefaultXRExperienceAsync(XRExperienceOptions);
    // engine.setHardwareScalingLevel(0.25); 
    if (xrHelper.baseExperience) {
      xrHelper.baseExperience.onStateChangedObservable.add((state) => {
        if (state === WebXRState.IN_XR ||
          state === WebXRState.NOT_IN_XR) {
          engine.resize();
        }
      });
    } else {
      console.error('No baseExperience.')
    };

    const xrInput = xrHelper.input;
    xrInput.onControllerAddedObservable.add((xrController) => {
      const motionController = xrController.motionController;
      if (motionController) {
        const mainComponent = motionController.getMainComponent();
      }
    });

    // TODO: disable cardboard pointer
    xrHelper.pointerSelection.displayLaserPointer = false;
    xrHelper.pointerSelection.disablePointerLighting = false;
    return xrHelper;
  }

  private async createScene(canvas: HTMLElement) {
    const engine = new Engine(<Nullable<HTMLCanvasElement>>canvas, true);
    const scene = this.scene = new Scene(engine);

    this.enableScenePhysics(scene);
    const ground = this.addGround(scene);
    this.addSky(scene, 30);
    this.addcamera(scene, canvas);
    this.addLightsAndShadows(scene);
    this.bullets = this.addBullets(scene);

    ////// Test object
    const sphere = MeshBuilder.CreateSphere('sphere_shadow',
      { diameter: 1, segments: 32 }, scene);
    sphere.physicsImpostor = new PhysicsImpostor(
      sphere,
      PhysicsImpostor.SphereImpostor,
      { mass: 0.2 },
      scene
    );
    sphere.material = this.addStandardMaterial(scene, '#ff0000', true, 'sphMat');
    sphere.receiveShadows = true;
    sphere.position.y = 2;
    sphere.position.x = 0;
    //////
    scene.onPointerObservable.add((event) => {
      if(event.type == PointerEventTypes.POINTERDOWN) {
        this.throwBullet();
      }
    });
    this.xrHelper = await this.setupXR(scene, ground);
    return scene;
  }

  async run() {
    this.gameState = 'loading';
    const scene = await this.createScene(<HTMLElement>this.canvas);
    this.gameState = 'main';
    scene.getEngine().runRenderLoop(() => {
      scene.render();
    });
  }
}

export default App;
