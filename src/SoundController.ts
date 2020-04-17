import Emitter from './Emitter';

enum MicrophoneSensivity {
  Low = 60,
  Medium = 30,
  High = 10
}

class SoundController extends Emitter {

  private microphoneSensivity: MicrophoneSensivity
    = MicrophoneSensivity.High;

  private audioContext: AudioContext | null = null;
  private maxAudioValue = 10;
  private lastAudioDiff = 0;
  private frequencyArray: Uint8Array = new Uint8Array();

  constructor() {
    super();
  }

  public getMicrophoneSensitivity(): string {
    return MicrophoneSensivity[this.microphoneSensivity];
  }

  public changeSensitivity(): string {
    const micSensivityValues =
      Object.values(MicrophoneSensivity).filter(key => typeof key === 'number');
    const index = micSensivityValues.indexOf(this.microphoneSensivity);
    this.microphoneSensivity =
      <MicrophoneSensivity>micSensivityValues[index + 1] || micSensivityValues[0];
    return this.getMicrophoneSensitivity();
  }

  public async init() {

    if (this.audioContext !== null &&
      this.audioContext.state === 'running') {
      return;
    }
    this.lastAudioDiff = 0;

    const audioContext = this.audioContext = new AudioContext();

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
    this.frequencyArray = new Uint8Array(analyserNode.frequencyBinCount);
    /*
    FIXME: Not working all the time on Quest also createScriptProcessor deprecated
    const scriptNode: ScriptProcessorNode =
    audioContext.createScriptProcessor(0, 1, 1);
    if (scriptNode !== null) {
      scriptNode.connect(analyserNode);
      scriptNode.onaudioprocess = () => this.handleOnAudioProcess(analyserNode);
    }
    */

    const audioLoop = () => {
      requestAnimationFrame(() => {
        this.handleOnAudioProcess(analyserNode);
        audioLoop();
      }
      );
    }
    audioLoop();

  }

  handleOnAudioProcess(analyserNode: AnalyserNode) {
    const frequencyArray = this.frequencyArray;
    analyserNode.getByteFrequencyData(frequencyArray);

    let values = 0;
    const length = frequencyArray.length;
    for (let i = 0; i < length; i++) {
      values += (frequencyArray[i]);
    }
    const avarageValue = values / length;
    const diff = avarageValue - this.lastAudioDiff;
    if (diff > this.microphoneSensivity) {

      if (avarageValue > this.maxAudioValue) {
        this.maxAudioValue = avarageValue;
      }
      this.dispatchEvent(new CustomEvent('onAudio', {
        detail: {
          value: avarageValue / this.maxAudioValue
        }
      }));
    }
    this.lastAudioDiff = avarageValue
  }
}

export { SoundController, MicrophoneSensivity }; 
