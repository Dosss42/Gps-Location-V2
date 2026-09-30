/** How the app's voice sounds. */
export interface SpeechSettings {
  /** BCP 47 language tag of the voice, e.g. 'en-US' or 'fil-PH'. */
  lang: string;
  /** Speed. 1.0 = normal, 0.5 = half speed, 2.0 = double speed. */
  rate: number;
  /** Voice pitch. 1.0 = normal. */
  pitch: number;
  /** 0.0 (silent) to 1.0 (full), relative to the phone's media volume. */
  volume: number;
}

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  lang: 'en-US',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};
