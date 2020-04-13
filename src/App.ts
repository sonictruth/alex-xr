import {
  AmmoJSPlugin,
  Vector3,
  WebXRState,
  ShadowGenerator,
  Color3,
  Color4,
  Mesh,
  PhysicsImpostor,
  MeshBuilder,
  Nullable,
  HemisphericLight,
  StandardMaterial,
  Engine,
  Scene,
  UniversalCamera,
  WebXRDefaultExperienceOptions,
  DirectionalLight,
  WebXRDefaultExperience,
  Animation
} from '@babylonjs/core';
import '@babylonjs/loaders';
import * as GUI from '@babylonjs/gui';
import Emitter from './Emitter';

import WebXRPolyfill from 'webxr-polyfill';
new WebXRPolyfill();

enum GameState {
  Uninitialized,
  Loading,
  MainMenu,
  Playing,
  End,
}

enum MicrophoneSensivity {
  Low = 60,
  Medium = 30,
  High = 10
}
class App extends Emitter {
  private canvas: HTMLElement | null = null;
  private enterXRButton: HTMLElement | null = null;
  private xrHelper: WebXRDefaultExperience | null = null;

  private bullets: Mesh[] = [];
  private bulletIndex: number = 0;

  private audioContext: AudioContext | null = null;
  private microphoneSensivity: MicrophoneSensivity
    = MicrophoneSensivity.High;

  private gameState: GameState = GameState.Uninitialized;

  private hasShadowSuffix = '_hasShadow';
  private objectsFolder = './objects/';

  constructor(
    canvas: HTMLElement | null,
    enterXRButton: HTMLElement | null
  ) {
    super();
    this.canvas = canvas;
    this.enterXRButton = enterXRButton;
  }

  private async startListeningforMicrophoneInput() {
    if (this.audioContext !== null &&
      this.audioContext.state === 'running') {
      return;
    }
    const audioContext = this.audioContext = new AudioContext();
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
          // this.throwBullet(diff / 10);
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

  private addcamera(scene: Scene, canvas: HTMLElement | null = null):
    UniversalCamera {
    const cameraPosition = new Vector3(0, 1.6, -4);
    const camera = new UniversalCamera('camera1', cameraPosition, scene);
    camera.inputs.clear();
    camera.inputs.addMouse();

    camera.setTarget(new Vector3(0, 1.6, 0));

    if (canvas !== null) {
      console.log('Canvas found');
      camera.attachControl(canvas, true);
    }
    return camera;
  }

  private removeBullets(scene: Scene) {
    this.bullets.forEach(bullet => {
      scene.removeMesh(bullet);
    });
    this.bullets = [];
    this.bulletIndex = 0;
  }

  private addBullets(scene: Scene, maxBullets: number = 20): Mesh[] {
    const bulletSize = 0.1;
    const bullets: Mesh[] = [];
    this.bulletIndex = 0;
    for (let i = 0; i < maxBullets; i++) {
      const sphere = Mesh.CreateSphere(`spere${i}${this.hasShadowSuffix}`, 8, bulletSize, scene);
      sphere.physicsImpostor = new PhysicsImpostor(
        sphere,
        PhysicsImpostor.SphereImpostor,
        { mass: 0.1 },
        scene
      );
      sphere.position.y = bulletSize;
      sphere.position.x = 0;
      sphere.position.z = -3 + (i * bulletSize);
      bullets.push(sphere);
    }
    this.bullets = bullets;
    return bullets;
  }

  private throwBullet(speed: number = 7, scene: Scene) {
    const nextBullet = this.bullets[this.bulletIndex];
    if (scene != null && scene.activeCamera !== null && nextBullet) {
      const throwRay = scene.activeCamera.getForwardRay();
      const position = throwRay.origin.clone();
      position.y = position.y - 0.05;
      nextBullet.position.copyFrom(position);
      if (nextBullet.physicsImpostor !== null) {
        // sphere.physicsImpostor.setAngularVelocity(throwRay.direction.scale(30));
        nextBullet.physicsImpostor.setLinearVelocity(throwRay.direction.scale(10));
        this.bulletIndex = this.bulletIndex + 1;
        if (this.bulletIndex >= this.bullets.length) {
          this.bulletIndex = 0;
        }
      }
    }
  }

  private addLightsAndShadows(scene: Scene): void {

    const light = new HemisphericLight("light1", new Vector3(0, 1, 0), scene);
    light.intensity = 0.6;
    light.specular = Color3.Black();

    const light2 = new DirectionalLight("dir01", new Vector3(0, -0.5, -1.0), scene);
    light2.position = new Vector3(0, 5, 5);

    const shadowGenerator = new ShadowGenerator(1024, light2);
    // shadowGenerator.useBlurExponentialShadowMap = true;
    // shadowGenerator.blurKernel = 32;
    // shadowGenerator.setDarkness(0.5);
    // shadowGenerator.usePoissonSampling = true;
    // shadowGenerator.getShadowMap().renderList.push(mesh);

    scene.meshes.forEach(mesh => {
      if (mesh.name.endsWith(this.hasShadowSuffix)) {
        console.log('shadow enabled for' + mesh.name)
        shadowGenerator.addShadowCaster(mesh);
        mesh.receiveShadows = true;
      }
    });

  }


  private async enterXR() {
    try {
      await this.startListeningforMicrophoneInput();
    } catch (error) {
      alert('Error getting microphone. Sound input disabled. ' + error);
    }

    try {
      await this.xrHelper?.baseExperience
        .enterXRAsync('immersive-vr', 'local-floor');
    } catch (error) {
      alert('Error entering VR mode. ' + error);
    }
  }

  private async setupXR(scene: Scene, groundMashName: string = 'ground')
    : Promise<WebXRDefaultExperience> {
    const engine = scene.getEngine();
    const XRExperienceOptions: WebXRDefaultExperienceOptions = {
      disableDefaultUI: true,
      disableTeleportation: true
    };
    const ground = scene.getMeshByName('groundMashName');
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

    xrHelper.pointerSelection.displayLaserPointer = false;
    xrHelper.pointerSelection.disablePointerLighting = false;
    return xrHelper;
  }

  private addEnvitoment(scene: Scene): Mesh | null {
    let ground = null;
    this.enableScenePhysics(scene);

    const worldSize = 30;
    const envHelper = scene.createDefaultEnvironment({
      skyboxColor: Color3.White(),
      groundColor: Color3.White(),
      skyboxTexture: './images/TropicalSunnyDay',
      skyboxSize: worldSize,
      groundSize: worldSize,
      enableGroundShadow: true
    });

    if (envHelper !== null &&
      envHelper.ground !== null &&
      envHelper.skybox !== null) {
      // envHelper.setMainColor(Color3.Teal());

      ground = envHelper.ground;
      ground.parent = null;
      envHelper.ground.position.y = 0;
      ground.physicsImpostor = new PhysicsImpostor(
        ground,
        PhysicsImpostor.PlaneImpostor,
        { mass: 0 },
        scene
      );
      envHelper.skybox.parent = null;

      envHelper.skybox.physicsImpostor = new PhysicsImpostor(
        envHelper.skybox,
        PhysicsImpostor.MeshImpostor,
        { mass: 0 },
        scene
      );
    }
    return ground;
  }

  private async createMainMenuScene(engine: Engine) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(1, 1, 1, 0);
    this.addEnvitoment(scene);
    var manager = new GUI.GUI3DManager(scene);

    // Let's add a button
    const m = MeshBuilder.CreateSphere('a', { diameter: 1 });
    const buttons = new GUI.MeshButton3D(m, '')
    buttons.position.z = 2
    ;
    var button = new GUI.HolographicButton('start');
    manager.addControl(button);
    manager.addControl(buttons);
    // button.linkToTransformNode(anchor);
    button.position.z = 4;
    button.tooltipText = 'Starts the game';
    button.text = 'START';
    button.onPointerUpObservable.add(() => {

    });

    this.addLightsAndShadows(scene);
    const camera = this.addcamera(scene, this.canvas);
    camera.rotation.y = 0.01;
    await new Promise((resolve) => {
      setTimeout(()=> resolve(), 9000);
    })
    return scene;
  }

  private setGameState(state: GameState) {
    this.gameState = state;
  }

  private async createLoadingScene(engine: Engine) {
    const scene = new Scene(engine);

    scene.clearColor = new Color4(1, 1, 1, 0);
    this.addcamera(scene);
  
    const plane = MeshBuilder.CreatePlane('plane', { size: 3, });
    plane.position.y = 3;
    const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 800, 800);
    const rectangle = new GUI.Rectangle();
    const text1 = new GUI.TextBlock();
    text1.text = 'please wait...';
    rectangle.addControl(text1);
    advancedTexture.addControl(rectangle);

    const box = MeshBuilder.CreateSphere('box', { diameter: 2, segments: 2 });
    box.material = this.addStandardMaterial(scene, '#000000');
    box.material.wireframe = true;

    box.position.y = 1.6;
    box.position.z = 0;
    const animationBox = new Animation(
      'loadingAnimation',
      'rotation.y',
      30,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    // animationBox.enableBlending = true;
    // animationBox.blendingSpeed = 0.01;
    animationBox.setKeys([{
      frame: 0,
      value: 0
    }, {
      frame: 60,
      value: 1.5708
    }]);
    box.animations.push(animationBox);

    this.addLightsAndShadows(scene);

    scene.beginAnimation(box, 0, 60, true);

    return scene;
  }

  async run() {
    if (this.gameState === GameState.Uninitialized) {
      this.enterXRButton?.addEventListener('click', () => {
        this.enterXR();
      })

      const engine = new Engine(<Nullable<HTMLCanvasElement>>this.canvas, true);
      engine.hideLoadingUI();
      const scenes: Scene[] = [];

      this.setGameState(GameState.Loading);

      engine.runRenderLoop(() => {
        if (scenes[this.gameState]) {
          scenes[this.gameState].render()
        };
      });

      scenes[GameState.Loading] = await this.createLoadingScene(engine);
      scenes[GameState.MainMenu] = await this.createMainMenuScene(engine);
      this.xrHelper = await this.setupXR(scenes[GameState.MainMenu]);
      this.setGameState(GameState.MainMenu);
    }
  }

}

export default App;
