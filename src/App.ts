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
  WebXRDefaultExperience,
  AssetsManager,
  SceneLoader
} from '@babylonjs/core';
import '@babylonjs/loaders';
import * as GUI from '@babylonjs/gui';
import Emitter from './Emitter';

import WebXRPolyfill from 'webxr-polyfill';
new WebXRPolyfill();

enum GameState {
  Uninitialized,
  Loading,
  Main,
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

    if (this.canvas !== null) {
      console.log('Canvas found');
      camera.attachControl(this.canvas, true);
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
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;
    shadowGenerator.setDarkness(0.5);
    // shadowGenerator.usePoissonSampling = true;
    // shadowGenerator.getShadowMap().renderList.push(mesh);
    // shadowGenerator.useExponentialShadowMap = true;
    // shadowGenerator.useBlurExponentialShadowMap = true;

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
      skyboxTexture: './TropicalSunnyDay',
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

  private async createMainScene(engine: Engine) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(1, 1, 1, 0);

    // const assetsManager = new AssetsManager(scene);
    // assetsManager.addMeshTask('skull task', '', 'scenes/', 'skull.babylon');
    // SceneLoader.LoadAsync()
    // vs ImportMesh
    //SceneLoader.Append(this.objectsFolder, 'rooom.gltf', scene, (newScene)=> {
    //  console.log(newScene);
    ///  newScene.animate();
    //});
    const importedMesh = await SceneLoader.ImportMeshAsync('', this.objectsFolder, 'rooom.gltf', scene);
    

    // this.enableScenePhysics(scene);
    // ground = this.addWorld(scene);
    this.addcamera(scene, this.canvas);

  
    // this.addBullets(scene);
    // this.removeBullets(scene);
    const sphere = MeshBuilder.CreateSphere(`sphere${this.hasShadowSuffix}`,
      { diameter: 1, segments: 32 }, scene);
      /*
    sphere.physicsImpostor = new PhysicsImpostor(
      sphere,
      PhysicsImpostor.SphereImpostor,
      { mass: 0.2 },
      scene
    );
    */
    sphere.material = this.addStandardMaterial(scene, '#ff0000', true, 'sphMat');
    sphere.receiveShadows = true;
    sphere.position.y = 2;
    sphere.position.x = 0;
    //////

    const plane = MeshBuilder.CreatePlane('plane', { size: 2 });
    plane.parent = sphere;
    plane.position.y = 2;

    const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(plane);

    const button1 = GUI.Button.CreateSimpleButton("but1", "Click Me");
    button1.width = 1;
    button1.height = 0.4;
    button1.color = "white";
    button1.fontSize = 50;
    button1.background = "green";
    button1.onPointerUpObservable.add(() => {
      if(this.gameState === GameState.Loading) {
        this.setGameState(GameState.Main);
       } else {
         this.setGameState(GameState.Loading);
       }
       console.log(scene);
    });
    advancedTexture.addControl(button1);


   this.addLightsAndShadows(scene);
    scene.onPointerObservable.add((event) => {
      if (event.type == PointerEventTypes.POINTERDOWN) {
      }
    });
    return scene;
  }

  private setGameState(state: GameState) {
    this.gameState = state;
  }

  private async createLoadingScene(engine: Engine) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(1, 1, 1, 0);
    this.addcamera(scene);

    const plane = MeshBuilder.CreatePlane('plane', { size: 10 });
    plane.position.y = 1.6;
    const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 1024, 1024);
    const rectangle = new GUI.Rectangle('rect');

    var text1 = new GUI.TextBlock('text1');
    text1.fontFamily = "Helvetica";
    text1.textWrapping = true;

    text1.text = 'Loading...'
    text1.color = 'black';
    text1.fontSize = '14px';

    rectangle.addControl(text1);
    advancedTexture.addControl(rectangle);

    return scene;
  }

  async run() {
    if (this.gameState === GameState.Uninitialized) {
      this.enterXRButton?.addEventListener('click', () => {
        this.enterXR();
      })

      const engine = new Engine(<Nullable<HTMLCanvasElement>>this.canvas, true);

      this.setGameState(GameState.Loading);

      engine.runRenderLoop(() => {
        if(scenes[this.gameState]) {
          scenes[this.gameState].render();
        }
      });

      const scenes: Scene[] = [];
      scenes[GameState.Loading] = await this.createLoadingScene(engine);
      scenes[GameState.Main] = await this.createMainScene(engine);

      this.xrHelper = await this.setupXR(scenes[GameState.Main]);
      
      this.setGameState(GameState.Main);


    }
  }

}

export default App;
