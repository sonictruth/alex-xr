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
  Animation,
  AbstractMesh
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
  private previousGameState: GameState = GameState.Uninitialized;

  private hasShadowSuffix = '_hasShadow';
  private onSceneEnterPrefix = 'onStateVisible_';
  private onSceneExitPrefix = 'onStateHidden_';
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
          this.dispatchEvent(new CustomEvent('onSound', {
            detail: {
              value: diff
            }
          }));
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

  private addEnvirooment(scene: Scene): Mesh | null {
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

  private addButton(
    panel: GUI.StackPanel3D,
    text: string,
    size: number = 60
  ): GUI.HolographicButton {
    const button = new GUI.HolographicButton(text, true);

    panel.addControl(button);

    const text1 = new GUI.TextBlock()
    //button.frontMaterial.innerGlowColor = Color3.FromHexString('#ff0000')
    //button.backMaterial.albedoColor = Color3.Gray();
    //button.frontMaterial.albedoColor = Color3.FromHexString('#ff0000')

    text1.text = text;
    text1.color = '#ffffff';
    text1.fontSize = size;
    button.content = text1;

    return button;
  }

  private getMenuAnimation(): Animation {
    const menuAnimation = new Animation(
      'mainAnimation',
      'rotation.x',
      30,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    menuAnimation.setKeys([{
      frame: 0,
      value: 1.8
    }, {
      frame: 30,
      value: .9
    }]);
    return menuAnimation;
  }

  private async createMainMenuScene(engine: Engine) {
    const scene = new Scene(engine);

    scene.clearColor = new Color4(1, 1, 1, 1);
    this.addLightsAndShadows(scene);
    this.addcamera(scene);

    const manager = new GUI.GUI3DManager(scene);
    const panel = new GUI.StackPanel3D();
    manager.addControl(panel)
    panel.margin = 0.02;

    this.addButton(panel, 'Start')
      .onPointerClickObservable.add(() => {
        console.log('click');
        this.setGameState(GameState.Playing)
      }
      );

    const getMicriphoneButtonStringText = () => {
      return 'Micophone \n' + MicrophoneSensivity[this.microphoneSensivity];
    }

    this.addButton(panel, getMicriphoneButtonStringText(), 20)
      .onPointerClickObservable.add((position, event) => {
        const micSensivityValues =
          Object.values(MicrophoneSensivity).filter(key => typeof key === 'number');
        const index = micSensivityValues.indexOf(this.microphoneSensivity);
        this.microphoneSensivity =
          <MicrophoneSensivity>micSensivityValues[index + 1] || micSensivityValues[0];
        event.currentTarget.content.text = getMicriphoneButtonStringText();
      });


    const anchor = new AbstractMesh('anchor', scene);
    panel.linkToTransformNode(anchor);
    panel.position.y = 1;
    anchor.animations.push(this.getMenuAnimation());


    this.addSceneStateHandlers(
      GameState.MainMenu,
      () => {
        if (manager.utilityLayer)
          manager.utilityLayer.shouldRender = true;

        scene.beginAnimation(anchor, 0, 30, false);
      },
      () => {
        console.log('exit');
        if (manager.utilityLayer)
          manager.utilityLayer.shouldRender = false;
      });

    // Test loader
    await new Promise((resolve) => {
      setTimeout(() => resolve(), 1000);
    })
    return scene;
  }


  private async createEndScene(engine: Engine) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(1, 1, 1, 1);

    this.addcamera(scene);
    this.addLightsAndShadows(scene);

    const manager = new GUI.GUI3DManager(scene);
    const panel = new GUI.StackPanel3D();
    manager.addControl(panel)
    panel.margin = 0.02;

    if (manager.utilityLayer)
      manager.utilityLayer.shouldRender = false;

    const anchor = new AbstractMesh('anchor', scene);
    panel.linkToTransformNode(anchor);
    panel.position.y = 1;
    anchor.animations.push(this.getMenuAnimation());
    this.addButton(panel, 'OK', 100)
      .onPointerClickObservable.add(() => {
        this.setGameState(GameState.MainMenu)
      }
      );
    this.addSceneStateHandlers(
      GameState.End,
      () => {
        scene.beginAnimation(anchor, 0, 30, false);
        if (manager.utilityLayer)
          manager.utilityLayer.shouldRender = true;
      },
      () => {
        if (manager.utilityLayer)
          manager.utilityLayer.shouldRender = false;
      });
    return scene;
  }

  private async createPlayingScene(engine: Engine) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(1, 0, 1, 1);
    MeshBuilder.CreateBox('box', { size: 1 }, scene).position = new Vector3(0, 2, 1);
    this.addLightsAndShadows(scene);
    this.addcamera(scene, this.canvas);

    this.addEventListener(`${this.onSceneEnterPrefix}${GameState.Playing}`,
      (event) => {
        setTimeout(() => {
          this.setGameState(GameState.End);
        }, 5000)
      });
    return scene;
  }

  private async createLoadingScene(engine: Engine) {
    const scene = new Scene(engine);

    scene.clearColor = new Color4(1, 1, 1, 1);
    this.addcamera(scene);

    const sphere = MeshBuilder.CreateSphere('sphere1', { diameter: 2, segments: 2 }, scene);
    sphere.material = this.addStandardMaterial(scene, '#000000');
    sphere.material.wireframe = true;

    sphere.position.y = 1.6;
    sphere.position.z = 0;

    const animationBox = new Animation(
      'loadingAnimation',
      'rotation.y',
      30,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    animationBox.setKeys([{
      frame: 0,
      value: 0
    }, {
      frame: 60,
      value: 1.5708
    }]);
    sphere.animations.push(animationBox);
    scene.beginAnimation(sphere, 0, 60, true);

    this.addLightsAndShadows(scene);

    return scene;
  }

  private addSceneStateHandlers(
    state: GameState,
    onEnter: EventListener,
    onExit: EventListener): void {
    this.addEventListener(`${this.onSceneEnterPrefix}${state}`, onEnter);
    this.addEventListener(`${this.onSceneExitPrefix}${state}`, onExit);
  }

  private setGameState(state: GameState) {
    this.dispatchEvent(
      new CustomEvent(`${this.onSceneExitPrefix}${this.previousGameState}`)
    )
    this.gameState = state;
    this.dispatchEvent(
      new CustomEvent(`${this.onSceneEnterPrefix}${state}`)
    )
    this.previousGameState = state;
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
        } else {
          throw Error('Missing scene');
        };
      });

      scenes[GameState.Loading] = await this.createLoadingScene(engine);
      scenes[GameState.MainMenu] = await this.createMainMenuScene(engine);
      scenes[GameState.Playing] = await this.createPlayingScene(engine);
      scenes[GameState.End] = await this.createEndScene(engine);
      this.xrHelper = await this.setupXR(scenes[GameState.MainMenu]);
      this.setGameState(GameState.MainMenu);
    }
  }

}

export default App;
