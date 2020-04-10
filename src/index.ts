import {
  AmmoJSPlugin,
  Vector3,
  Color3,
  Color4,
  Mesh,
  PointerEventTypes,
  AbstractMesh,
  PhysicsImpostor,
  MeshBuilder,
  Nullable,
  HemisphericLight,
  Texture,
  StandardMaterial,
  Engine,
  Scene,
  UniversalCamera
} from '@babylonjs/core';

import texture from './images/texture.jpg';
// import Ammo from 'ammo.js';

class VRApp {
  private canvas: HTMLElement;
  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
  }
  private async createScene(canvas: HTMLElement) {
    const engine = new Engine(<Nullable<HTMLCanvasElement>>canvas, true);
    const scene = new Scene(engine);
    scene.clearColor = Color4.FromHexString('#fcf2d8ff');

    const ammo = new AmmoJSPlugin(true);
    ammo.setMaxSteps(10);
    ammo.setFixedTimeStep(1 / (240));
    scene.enablePhysics(new Vector3(0, -10, 0), ammo);

    // Create spheres to be thrown
    const throwSpheres: Mesh[] = [];
    let sphereIndex = 0;
    for (let i = 0; i < 10; i++) {
      const sphere = Mesh.CreateSphere(`spere${i}`, 16, 0.1, scene);
      sphere.physicsImpostor = new PhysicsImpostor(
        sphere,
        PhysicsImpostor.SphereImpostor,
        { mass: 0.2 }, scene
      );
      throwSpheres.push(sphere);
    }

    scene.onPointerObservable.add((event) => {
      if (
        scene.activeCamera !== null &&
        event.type == PointerEventTypes.POINTERDOWN
      ) {
        const throwRay = scene.activeCamera.getForwardRay();
        const sphere = throwSpheres[sphereIndex];
        sphere.position.copyFrom(throwRay.origin);
        if (sphere.physicsImpostor !== null) {
          sphere.physicsImpostor.setLinearVelocity(throwRay.direction.scale(7));
          sphereIndex = ++sphereIndex % throwSpheres.length;
        }
      }
    })

    const cameraPosition = new Vector3(0, 1.6, -5);

    const camera = new UniversalCamera('camera1', cameraPosition, scene);
    camera.inputs.clear();
    camera.inputs.addMouse();

    camera.setTarget(new Vector3(0, 1.6, 0));
    camera.attachControl(canvas, true);

    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    //Objects
    const sphere = MeshBuilder.CreateSphere('sphere',
      { diameter: 1, segments: 32 }, scene);
    sphere.position.y = .5;
    sphere.position.x = 0;

    const sphere2 = MeshBuilder.CreateSphere('sphere2',
      { diameter: 1, segments: 32 }, scene);
    sphere2.position.y = 2;
    sphere2.position.x = 0;
    const myMaterial = new StandardMaterial('myMaterial', scene);
    myMaterial.diffuseTexture = new Texture(texture, scene);
    sphere2.material = myMaterial;


    var ground = MeshBuilder.CreateGround('ground',
      { height: 100, width: 100, subdivisions: 100 },
      scene);

    ground.position.y = 0;
    ground.position.x = 0;

    ground.physicsImpostor = new PhysicsImpostor(
      ground,
      PhysicsImpostor.BoxImpostor,
      { mass: 0, friction: 0.5, restitution: 0.7 },
      scene
    );
    ground.material = myMaterial;

    /*
    const environment = scene.createDefaultEnvironment({
      groundColor: Color3.FromHexString('#ffffff'),
      // skyboxColor: new Color3(255, 0, 0)
      skyboxSize: 100
    });
    */
    //const ground = <AbstractMesh>environment?.ground;
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
