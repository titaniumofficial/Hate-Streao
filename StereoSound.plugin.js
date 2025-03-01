/**
 * @name HateStereoV1
 * @version 0.0.1
 * @author omkar.dxddy
 * @description Maximizes microphone output with a dynamic gain and soft limiter filter for loud yet clear audio.
 */

module.exports = class HateStereoV1 {
  constructor() {
    this.config = {
      info: {
        name: "HateStereoV1",
        authors: [{ name: "omkar.dxddy" }],
        version: "0.0.1",
      },
      defaultConfig: []
    };
  }

  start() {
    this.settingsWarning();
    
    // Patch transport options to ensure a stereo, high-bitrate stream.
    const voiceModule = BdApi.Webpack.getModule(m => m?.prototype?.updateVideoQuality);
    if (voiceModule) {
      BdApi.Patcher.after("HateStereoV1", voiceModule.prototype, "updateVideoQuality", (thisObj, _args, ret) => {
        if (thisObj && thisObj.conn?.setTransportOptions) {
          const originalSetTransportOptions = thisObj.conn.setTransportOptions;
          thisObj.conn.setTransportOptions = function (options) {
            if (options.audioEncoder) {
              options.audioEncoder.channels = 2;
              options.audioEncoder.gain = 1.0;
            }
            if (options.fec) {
              options.fec = false;
            }
            options.encodingVoiceBitRate = 1024000; // 1,024,000 bps for better clarity
            originalSetTransportOptions.call(thisObj, options);
          };
        }
        return ret;
      });
    }
    
    // Patch audio processing to inject our new gain + soft limiter filter.
    const audioProcessor = BdApi.Webpack.getModule(m => m?.prototype?.processAudio);
    if (audioProcessor) {
      BdApi.Patcher.before("HateStereoV1GainLimiter", audioProcessor.prototype, "processAudio", (thisObj, args) => {
        if (args[0] instanceof Float32Array) {
          const gainFactor = 3.0;        // Boost mic by 3x
          const limiterThreshold = 0.95; // Limit samples above 0.95
          const limiterRatio = 10.0;     // Soft knee compression ratio
          args[0] = this.applyGainAndLimiter(args[0], gainFactor, limiterThreshold, limiterRatio);
        }
      });
    }
  }
  
  /**
   * applyGainAndLimiter(samples, gain, threshold, ratio)
   *   - Applies a gain boost to the samples.
   *   - If an amplified sample exceeds the threshold, it is compressed using a soft limiter.
   */
  applyGainAndLimiter(samples, gain, threshold, ratio) {
    for (let i = 0; i < samples.length; i++) {
      let amplified = samples[i] * gain;
      const absVal = Math.abs(amplified);
      if (absVal > threshold) {
        const sign = Math.sign(amplified);
        amplified = sign * (threshold + (absVal - threshold) / ratio);
      }
      samples[i] = amplified;
    }
    return samples;
  }

  settingsWarning() {
    const voiceSettingsStore = BdApi.Webpack.getModule(m => typeof m?.getEchoCancellation === "function");
    if (!voiceSettingsStore) return;
    
    if (
      voiceSettingsStore.getNoiseSuppression() ||
      voiceSettingsStore.getNoiseCancellation() ||
      voiceSettingsStore.getEchoCancellation()
    ) {
      setTimeout(() => {
        BdApi.UI.showToast(
          "⚠️ Please disable echo cancellation, noise reduction, and noise suppression for HateStereoV1",
          { type: "warning", timeout: 5000 }
        );
      }, 1000);
    }
  }

  stop() {
    BdApi.Patcher.unpatchAll("HateStereoV1");
  }
};
