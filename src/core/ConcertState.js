export class ConcertState {
  constructor() {
    this.state = {
      songTitle: 'No track selected',
      isPlaying: false,
      audioScore: 0,
      rawEnergy: 0,
      smoothedEnergy: 0,
      baselineEnergy: 0,
      reactionLevel: 'low',
      isBeat: false,
      hasUserAudio: false
    };
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setAudioMetrics(metrics) {
    this.setState(metrics);
  }

  setPlayback(isPlaying) {
    this.setState({ isPlaying });
  }

  setSong(songTitle, hasUserAudio = true) {
    this.setState({ songTitle, hasUserAudio });
  }

  setState(partial) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener(this.state));
  }
}
