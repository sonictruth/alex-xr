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
  TransformNode,
  Texture,
  AssetsManager,
  PostProcess,
  Effect,
  EventState
} from '@babylonjs/core';
import '@babylonjs/loaders';
import * as GUI from '@babylonjs/gui';
import Emitter from './Emitter';
import LoadingScreen from './LoadingScreen';

import WebXRPolyfill from 'webxr-polyfill';

new WebXRPolyfill();

enum GameView {
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
  private scene: Scene | null = null;
  private enterXRButton: HTMLElement | null = null;
  private xrHelper: WebXRDefaultExperience | null = null;

  private bullets: Mesh[] = [];
  private bulletIndex: number = 0;

  private audioContext: AudioContext | null = null;
  private microphoneSensivity: MicrophoneSensivity
    = MicrophoneSensivity.High;

  private gameViewID: GameView | null = null;
  private previousGameViewID: GameView | null = null;

  private gameViews: TransformNode[] = [];

  private hasShadowSuffix = '_hasShadow';
  private onViewEnterPrefix = 'onStateVisible_';
  private onViewExit = 'onStateHidden_';
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

    const light = new HemisphericLight('light1', new Vector3(0, 1, 0), scene);
    light.intensity = 1;
    light.specular = Color3.White();

    const light2 = new DirectionalLight('light2', new Vector3(0, -0.5, -1.0), scene);
    light2.position = new Vector3(0, 5, 5);
    light2.intensity = 1;

    const shadowGenerator = new ShadowGenerator(1024, light2);


    scene.meshes.forEach(mesh => {
      if (mesh.name.endsWith(this.hasShadowSuffix)) {
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

    const ground = scene.getMeshByName('BackgroundPlane');
    if (ground !== null) {
      console.log('setupXR found ground');
      XRExperienceOptions.floorMeshes = [ground];
    }

    const xrHelper = await scene.createDefaultXRExperienceAsync(XRExperienceOptions);
    // engine.setHardwareScalingLevel(0.25); 
    if (xrHelper.baseExperience) {
      xrHelper.baseExperience.onStateChangedObservable.add((state) => {
        if (state === WebXRState.IN_XR || state === WebXRState.NOT_IN_XR) {
          engine.resize();
        }
      });
    } else {
      console.error('No baseExperience.')
    };

    xrHelper.pointerSelection.displayLaserPointer = false;
    xrHelper.pointerSelection.disablePointerLighting = false;
    // xrHelper.baseExperience.sessionManager.scene
    // xrHelper.renderTarget = new WebXRRenderTarget()
    return xrHelper;
  }

  private async addEnv(scene: Scene): Promise<Mesh | null> {
    let ground = null;
    this.enableScenePhysics(scene);

    let skyBoxTexture;
    const assetsManager = new AssetsManager(scene);
    const task = assetsManager
      .addCubeTextureTask('sky', './images/TropicalSunnyDay');

    task.onSuccess = (task) => {
      skyBoxTexture = task.texture;
      skyBoxTexture.coordinatesMode = Texture.SKYBOX_MODE;
    }
    await assetsManager.loadAsync();

    const worldSize = 1000;
    const envHelper = scene.createDefaultEnvironment({
      skyboxColor: Color3.White(),
      groundColor: Color3.White(),
      skyboxTexture: skyBoxTexture,
      skyboxSize: worldSize,
      groundSize: worldSize,
      enableGroundShadow: true
    });

    if (envHelper !== null &&
      envHelper.ground !== null &&
      envHelper.skybox !== null) {

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

  private addGui(
    root: TransformNode,
    buttons: { text: string, textSize: number, handler: Function, }[]
  ): Mesh {

    const guiPlane = Mesh.CreatePlane('plane', 2, root.getScene());
    guiPlane.parent = root;
    guiPlane.position.y = 2;

    const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(guiPlane);
    const panel = new GUI.StackPanel();

    advancedTexture.addControl(panel);

    buttons.forEach((button, index) => {
      const guiButton = GUI.Button.CreateSimpleButton(`button${index}`, button.text);
      guiButton.paddingTop = 20;
      guiButton.height = '200px';
      guiButton.fontSize = button.textSize;
      guiButton.width = '400px';
      guiButton.color = 'Gray';
      guiButton.background = 'White';
      guiButton.thickness = 1;
      guiButton.cornerRadius = 50;
      // guiButton.fontFamily = 'Curier';
      guiButton.onPointerClickObservable.add((vector, event) => button.handler(event))
      panel.addControl(guiButton);
    })
    return guiPlane;
  }
  private async createMainMenuView(scene: Scene): Promise<TransformNode> {
    const root = new TransformNode('main');
    root.setEnabled(false);


    const getMicriphoneButtonStringText = () => {
      return 'Micophone\sensitivity\n' + MicrophoneSensivity[this.microphoneSensivity];
    }
    this.addGui(root,
      [
        {
          text: 'Start',
          textSize: 60,
          handler: () => this.setGameView(GameView.Playing)
        },
        {
          text: getMicriphoneButtonStringText(),
          textSize: 40,
          handler: (event: EventState) => {
            const micSensivityValues =
              Object.values(MicrophoneSensivity).filter(key => typeof key === 'number');
            const index = micSensivityValues.indexOf(this.microphoneSensivity);
            this.microphoneSensivity =
              <MicrophoneSensivity>micSensivityValues[index + 1] || micSensivityValues[0];
            const button = <GUI.Button>event.target;
            if (button.textBlock)
              button.textBlock.text = getMicriphoneButtonStringText();;
          }
        }
      ]);



    const sphere = MeshBuilder.CreateSphere('s', { diameter: 2 })
    sphere.parent = root;
    sphere.position.y = 1;
    sphere.position.z = .5;


    return root;
  }


  private async createEndView(scene: Scene): Promise<TransformNode> {
    const root = new TransformNode('End');
    root.setEnabled(false);

    this.addGui(root, [{
      text: 'OK',
      textSize: 50,
      handler: () => {
        this.setGameView(GameView.MainMenu);
      }
    }
    ])

    return root;
  }

  private async createPlayingView(scene: Scene): Promise<TransformNode> {
    const root = new TransformNode('Playing');
    root.setEnabled(false);
    const box = MeshBuilder.CreateBox('box', { size: 1 }, scene)
    box.position = new Vector3(0, 2, 1);
    box.parent = root;


    this.addEventListener(`${this.onViewEnterPrefix}${GameView.Playing}`,
      (event) => {
        setTimeout(() => {
          this.setGameView(GameView.End);
        }, 5000)
      });
    return root;
  }

  private addViewHandlers(
    state: GameView,
    onEnter: EventListener,
    onExit: EventListener): void {
    this.addEventListener(`${this.onViewEnterPrefix}${state}`, onEnter);
    this.addEventListener(`${this.onViewExit}${state}`, onExit);
  }

  private async setGameView(id: GameView) {
    const previousGameViewID = this.previousGameViewID;

    if (previousGameViewID !== null && this.gameViews[previousGameViewID]) {
      await this.fadeCamera();
      this.dispatchEvent(
        new CustomEvent(`${this.onViewExit}${previousGameViewID}`)
      )
      this.gameViews[previousGameViewID].setEnabled(false);
    }

    if (this.gameViews[id]) {
      this.gameViewID = id;
      this.gameViews[id]?.setEnabled(true);
      this.dispatchEvent(
        new CustomEvent(`${this.onViewEnterPrefix}${id}`)
      )
      await this.fadeCamera(true);
      this.previousGameViewID = id;
    }
  }

  private async addScene(engine: Engine, canvas: HTMLElement | null): Promise<Scene> {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(1, 1, 1, 1);
    await this.addEnv(scene);
    this.addcamera(scene, canvas);
    return scene;
  }

  async run() {
    if (this.gameViewID === null) {

      Effect.ShadersStore['customFragmentShader'] = `
      precision highp float;

      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform float fadeLevel;

      void main(void){
        vec4 baseColor = texture2D(textureSampler, vUV);
      
        gl_FragColor = baseColor*(1.-fadeLevel) + vec4(1., 1., 1., 1.)* fadeLevel;
      }
      `;

      this.enterXRButton?.addEventListener('click', () => {
        this.enterXR();
      })

      const engine = new Engine(<Nullable<HTMLCanvasElement>>this.canvas, true);
      engine.loadingScreen = new LoadingScreen('Please wait');



      const scene = this.scene = await this.addScene(engine, this.canvas);
      engine.runRenderLoop(() => scene.render());

      this.gameViews[GameView.Playing] = await this.createPlayingView(scene);
      this.gameViews[GameView.MainMenu] = await this.createMainMenuView(scene);
      this.gameViews[GameView.End] = await this.createEndView(scene);
      this.setGameView(GameView.MainMenu);

      this.addLightsAndShadows(scene);

      this.xrHelper = await this.setupXR(scene);
      engine.hideLoadingUI();

    }
  }

  private async fadeCamera(reverse: boolean = false) {
    const scene = this.scene;
    if (scene) {
      const postProcess = new PostProcess(
        reverse ? 'fadeIn' : 'fadeOut',
        'custom', ['fadeLevel'], null, 1.0, scene.activeCamera
      );
      let from = 0.0;
      let to = 1.0;
      let speed = 0.05;
      if (reverse) {
        from = 1.0;
        to = 0.0;
        speed = -0.03;
      }

      const effect = postProcess.getEffect();

      const promise = new Promise((resolve) => {
        postProcess.onBeforeRenderObservable.add(() => {
          if ((reverse && from >= to) || (!reverse && from <= to)) {
            effect.setFloat('fadeLevel', from);
            from = from + speed;
          } else {
            effect.setFloat('fadeLevel', to);
            resolve();
          }
        });
      });
      await promise;
      postProcess.dispose();
    }
  }

}



export default App;
