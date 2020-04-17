import { ILoadingScreen } from "@babylonjs/core";

class LoadingScreen implements ILoadingScreen {

  public loadingUIBackgroundColor: string = 'White';
  public className = 'loading'
  constructor(public loadingUIText: string) {
  }
  public displayLoadingUI() {
    document.body.classList.add(this.className);
  }

  public hideLoadingUI() {
    document.body.classList.remove(this.className);
  }
}

export default LoadingScreen;
