import {
  Vector3,
  FreeCamera,
  AbstractMesh,
  MeshBuilder,
  Nullable,
  Color3,
  HemisphericLight,
  Texture,
  Engine,
  Scene
} from '@babylonjs/core';

class VRApp {
  private canvas: HTMLElement;
  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
  }
  private async createScene(canvas: HTMLElement) {
    const engine = new Engine(<Nullable<HTMLCanvasElement>>canvas, true);
    const scene = new Scene(engine);

    const camera = new FreeCamera('camera1', new Vector3(0, 5, -10), scene);

    camera.setTarget(Vector3.Zero());
    camera.attachControl(canvas, true);

    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    //Objects
    const sphere = MeshBuilder.CreateSphere('sphere', { diameter: 2, segments: 32 }, scene);
    sphere.position.y = 1;

    const environment = scene.createDefaultEnvironment();
    const ground = <AbstractMesh>environment?.ground;
    const xrHelper = await scene.createDefaultXRExperienceAsync({
      floorMeshes: [ground]
    });
    const input = xrHelper.input;
    input.onControllerAddedObservable.add((xrController) => {
      const motionController = xrController.motionController;
      console.log('motionController');
      if (!motionController) {
        console.log('motionController not found');
      }
    })
 
    // disable:
    xrHelper.teleportation.detach();
    xrHelper.pointerSelection.detach();

    // (re)enable:
    xrHelper.teleportation.attach();
    xrHelper.pointerSelection.attach();
    return scene;
  }

  async run() {
    const scene = await this.createScene(this.canvas);
    scene.getEngine().runRenderLoop(() => {
      scene.render();
    });
  }
}


new VRApp(
  <HTMLCanvasElement>document.getElementById('renderCanvas')
).run();
