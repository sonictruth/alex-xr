import {
  Animation,
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
  EventState,
  SceneLoader,
  ExecuteCodeAction,
  ActionManager
} from '@babylonjs/core';
import '@babylonjs/loaders';
import * as GUI from '@babylonjs/gui';
import Emitter from './Emitter';
import LoadingScreen from './LoadingScreen';
import { SoundController } from './SoundController';

import WebXRPolyfill from 'webxr-polyfill';

enum GameView {
  MainMenu,
  Playing,
  End,
}

class App extends Emitter {
  private canvas: HTMLElement | null = null;
  private scene: Scene | null = null;
  private enterXRButton: HTMLElement | null = null;

  private xrHelper: WebXRDefaultExperience | null = null;

  private bullets: Mesh[] = [];
  private bulletIndex = 0;

  private gameViewID: GameView | null = null;
  private previousGameViewID: GameView | null = null;

  private gameViews: TransformNode[] = [];

  private hasShadowSuffix = '_hasShadow';
  private onViewEnterPrefix = 'onViewVisible_';
  private onViewExit = 'onViewHidden_';

  private soundController = new SoundController();

  constructor(
    canvas: HTMLElement | null,
    enterXRButton: HTMLElement | null
  ) {
    super();
    this.canvas = canvas;
    this.enterXRButton = enterXRButton;
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

    camera.setTarget(new Vector3(0, 3, 0));

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
      await this.xrHelper?.baseExperience
        .enterXRAsync('immersive-vr', 'local-floor');

    } catch (error) {
      alert('Error entering VR mode. ' + error);
    }
  }

  private getGround(scene: Scene) {
    return scene.getMeshByName('BackgroundPlane');
  }

  private async setupXR(scene: Scene)
    : Promise<WebXRDefaultExperience> {

    const engine = scene.getEngine();
    const XRExperienceOptions: WebXRDefaultExperienceOptions = {
      disableDefaultUI: true,
      disableTeleportation: true
    };

    const ground = this.getGround(scene);
    if (ground !== null) {
      console.log('setupXR found ground');
      XRExperienceOptions.floorMeshes = [ground];
    }

    const xrHelper = await scene.createDefaultXRExperienceAsync(XRExperienceOptions);
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

    return xrHelper;
  }

  private async addScene(engine: Engine, canvas: HTMLElement | null)
    : Promise<Scene> {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(1, 1, 1, 1);
    await this.addEnvironment(scene);
    this.addcamera(scene, canvas);
    return scene;
  }

  private async addEnvironment(scene: Scene): Promise<Mesh | null> {
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

    const envHelper = scene.createDefaultEnvironment({
      skyboxColor: Color3.White(),
      groundColor: Color3.White(),
      skyboxTexture: skyBoxTexture,
      skyboxSize: 2000,
      groundSize: 1000,
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

  private addMiniGUI(
    root: TransformNode,
    buttons: { text: string, textSize: number, handler: Function }[],
    text: string = ''
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
      guiButton.onPointerClickObservable.add((vector, event) => button.handler(event))
      panel.addControl(guiButton);
    })
    if (text) {
      const text1 = new GUI.TextBlock('text');
      text1.text = text;
      text1.color = 'Gray';
      text1.height = '100px';
      text1.fontSize = 30;
      panel.addControl(text1);
    }
    return guiPlane;
  }
  private async createMainMenuView(scene: Scene): Promise<TransformNode> {
    const root = new TransformNode('main');
    root.setEnabled(false);


    const getMicriphoneButtonStringText = () => {
      return 'Micophone sensitivity\n' +
        this.soundController.getMicrophoneSensitivity();
    }
    this.addMiniGUI(root,
      [
        {
          text: 'Start',
          textSize: 60,
          handler: () => this.setGameView(GameView.Playing)
        },
        {
          text: getMicriphoneButtonStringText(),
          textSize: 30,
          handler: (event: EventState) => {
            this.soundController.changeSensitivity();
            const button = <GUI.Button>event.target;
            if (button.textBlock)
              button.textBlock.text = getMicriphoneButtonStringText();;
          }
        }
      ], 'Make some noise to test the microphone input');

    const sphere = MeshBuilder.CreateSphere('sphere', { diameter: 0.2 })
    sphere.parent = root;
    sphere.position.y = 1.4;
    sphere.position.z = 1;
    sphere.material = this.addStandardMaterial(scene, '#ff0000');
    const animbox = new Animation(
      'miccheck', 'scaling', 30,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE
    );
    animbox.enableBlending = true;
    animbox.blendingSpeed = 0.01;
    sphere.animations = [animbox];
    const initialScale = sphere.scaling.clone();

    const handleOnAudio = (event: any) => {
      const size = event.detail.value * 10;
      console.log(size);
      animbox.setKeys([
        {
          frame: 0,
          value: new Vector3(size, size, size)
        },
        {
          frame: 30,
          value: initialScale
        }
      ]);
      scene.beginAnimation(sphere, 0, 30, false);
    };

    this.addViewHandlers(
      GameView.MainMenu,
      () =>
        this.soundController.addEventListener('onAudio', handleOnAudio)
      ,
      () =>
        this.soundController.removeEventListener('onAudio', handleOnAudio)
    )

    return root;
  }


  private async createEndView(scene: Scene): Promise<TransformNode> {
    const root = new TransformNode('End');
    root.setEnabled(false);

    this.addMiniGUI(root, [{
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

    const earthNode = new TransformNode('e01');
    earthNode.parent = root;
    const mesh = await SceneLoader.ImportMeshAsync('RotateMe', './objects/', 'earth.gltf');
    mesh.meshes[0].parent = earthNode;
    earthNode.position.x = 0;
    earthNode.scaling = new Vector3(500, 500, 500);
    earthNode.position.z = 600;
    earthNode.position.y = -300;

    const earthAnimation = new Animation('earth01', 'rotation', 30, Animation.ANIMATIONTYPE_VECTOR3);
    earthAnimation.setKeys([
      {
        frame: 0,
        value: Vector3.Zero,
      },
      {
        frame: 2530,
        value: new Vector3(-Math.PI * 2, 0, - Math.PI * 2),
      }
    ]);

    const throwBulletWrapper = () => {
      this.throwBullet(200, scene);
    }

    const main = <Mesh>mesh.meshes[0];
    
 

    earthNode.animations.push(earthAnimation);
    const ground = this.getGround(scene);
    this.addViewHandlers(
      GameView.Playing,
      () => {
        scene.beginAnimation(earthNode, 0, 2530, true);
        ground?.dispose();
        this.addBullets(scene);
        this.soundController.addEventListener('onAudio', throwBulletWrapper);

      },
      () => {
        scene.stopAnimation(earthNode);
        ground?.setEnabled(true);
        this.removeBullets(scene);
        this.soundController.removeEventListener('onAudio', throwBulletWrapper);

      }
    );
    return root;
  }

  private addViewHandlers(
    viewId: GameView,
    onEnter: EventListener,
    onExit: EventListener): void {
    this.addEventListener(`${this.onViewEnterPrefix}${viewId}`, onEnter);
    this.addEventListener(`${this.onViewExit}${viewId}`, onExit);
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

  async run() {
    if (this.gameViewID === null) {

      this.enterXRButton?.addEventListener('click', () => {
        this.enterXR();
      });

      this.soundController.init();

      const engine = new Engine(<Nullable<HTMLCanvasElement>>this.canvas, true);
      engine.loadingScreen = new LoadingScreen('Please wait');

      if (!(new WebXRPolyfill()).nativeWebXR) {
        // FIXME: FirefoxReality needs this 
        engine.setHardwareScalingLevel(0.5);
      }

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

      this.soundController.init();
      const advancedTexture = GUI.AdvancedDynamicTexture
        .CreateFullscreenUI('Fade' + reverse ? 'in' : 'out');
      const rectangle = new GUI.Container('fader');
      rectangle.background = 'white';

      let from = 0;
      let to = 1;
      let speed = 0.04;
      if (reverse) {
        from = 1;
        to = 0;
        speed = -0.08;
      }
      rectangle.alpha = from;
      advancedTexture.addControl(rectangle);

      const promise = new Promise(resolve => {
        const loop = () => {
          from = from + speed;
          rectangle.alpha = from;
          if (from < 0 || from > 1) {
            rectangle.alpha = to;
            scene.onBeforeRenderObservable.removeCallback(loop);
            resolve();
          } else {
            rectangle.alpha = from;
          }
        };
        scene.onBeforeRenderObservable.add(loop);
      })

      await promise;

      advancedTexture.dispose();
    }


  }

}



export default App;
