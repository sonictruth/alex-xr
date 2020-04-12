class Emitter {
  private delegate: DocumentFragment;
  constructor() {
    this.delegate = document.createDocumentFragment();
  }
  public addEventListener(type: string,
    eventListener: EventListener) {
    this.delegate.addEventListener(type, eventListener)
  }
  public dispatchEvent(event: Event) {
    this.delegate.dispatchEvent(event);
  }
  public removeEventListener(type: string,
    eventListener: EventListener | null | EventListenerObject) {
    this.delegate.removeEventListener(type, eventListener);
  }
}

export default Emitter;
