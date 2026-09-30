import { DEFAULT_SPEECH_SETTINGS } from '../models/speech.model';
import { parseSpeechSettings } from './speech.service';

describe('parseSpeechSettings', () => {
  it('reads valid saved settings', () => {
    const json = JSON.stringify({ lang: 'fil-PH', rate: 1.5, pitch: 0.8, volume: 0.6 });
    expect(parseSpeechSettings(json)).toEqual({ lang: 'fil-PH', rate: 1.5, pitch: 0.8, volume: 0.6 });
  });

  it('fills missing fields with defaults', () => {
    expect(parseSpeechSettings('{"rate":0.75}')).toEqual({ ...DEFAULT_SPEECH_SETTINGS, rate: 0.75 });
  });

  it('replaces invalid values with defaults', () => {
    const json = JSON.stringify({ lang: 42, rate: 'fast', volume: 7 });
    expect(parseSpeechSettings(json)).toEqual(DEFAULT_SPEECH_SETTINGS);
  });

  it('survives broken JSON', () => {
    expect(parseSpeechSettings('{not json')).toEqual(DEFAULT_SPEECH_SETTINGS);
  });
});
