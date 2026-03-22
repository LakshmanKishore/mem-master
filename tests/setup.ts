import { vi } from 'vitest'

// Mock Rune SDK
global.Rune = {
  initLogic: vi.fn(),
  initClient: vi.fn(),
  gameOver: vi.fn(), // Added
  invalidAction: vi.fn(), // Added
  getPlayerInfo: (id: string) => ({
    playerId: id,
    displayName: id === 'p1' ? 'You' : 'Opponent',
    avatarUrl: '',
  }),
  actions: {
    drawCard: vi.fn(),
    pickCard: vi.fn(),
  },
} as any

// Mock Audio
global.Audio = class {
  play() { return Promise.resolve() }
  pause() {}
} as any

class MockAudioContext {
  createOscillator() {
    return {
      connect: vi.fn(),
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      start: vi.fn(),
      stop: vi.fn(),
      type: 'sine'
    }
  }
  createGain() {
    return {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
    }
  }
  destination = {}
  currentTime = 0
}

;(global as any).AudioContext = MockAudioContext
;(global as any).webkitAudioContext = MockAudioContext

// Mock Animation API
if (!Element.prototype.animate) {
  Element.prototype.animate = () => ({
    onfinish: null,
    finished: Promise.resolve(),
    cancel: () => {},
    reverse: () => {},
    pause: () => {},
    play: () => {},
  } as any);
}

// Mock RequestAnimationFrame
global.requestAnimationFrame = (cb: any) => setTimeout(cb, 0) as any

// Create the HTML structure
document.body.innerHTML = `
<div id="ui-layer">
  <div id="turn-indicator"></div>
  <button id="help-btn">?</button>
  <div id="status-toast"></div>
  <div id="my-hand-container"></div>
</div>
<div id="game-container">
  <div id="table-surface"></div>
  <div id="guess-cards-ring"></div>
  <div id="players-ring"></div>
  <div id="deck-stack"><div class="deck-top">🎴</div></div>
  <div id="drawn-reveal-container"></div>
</div>
<div id="steal-overlay" class="hidden">
  <div class="steal-modal">
    <h2>Steal a Card!</h2>
    <div id="steal-grid"></div>
    <button id="cancel-steal">Cancel</button>
  </div>
</div>
<div id="help-overlay" class="hidden">
  <div class="help-modal">
    <button id="close-help">Got it!</button>
  </div>
</div>
`
