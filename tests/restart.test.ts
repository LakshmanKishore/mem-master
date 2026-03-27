import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { logic } from '../src/logic'
// Import client to trigger the real UI initialization against the DOM setup in setup.ts
import '../src/client'

const runeInitSpy = global.Rune.initClient as any

describe('Game Restart', () => {
  let onChangeCallback: any

  beforeEach(() => {
    vi.useFakeTimers()
    onChangeCallback = runeInitSpy.mock.calls[0][0].onChange
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resets the round indicator to ROUND 1 on restart', async () => {
    const roundIndicator = document.getElementById('round-indicator')!
    
    // 1. Simulate being in Round 3
    const gameRound3 = logic.setup(['p1', 'p2'])
    gameRound3.round = 3
    
    onChangeCallback({
      game: gameRound3,
      yourPlayerId: 'p1',
      event: { name: 'stateSync' }
    })
    
    expect(roundIndicator.textContent).toBe('ROUND 3')

    // 2. Simulate a restart (new setup, round 1)
    const gameRestart = logic.setup(['p1', 'p2'])
    gameRestart.round = 1
    
    onChangeCallback({
      game: gameRestart,
      yourPlayerId: 'p1',
      // The client detects restart if round goes from >1 to 1 OR winner becomes null after being set
      // We pass the previous game state via the closure-maintained 'currentGame' in client.ts
      event: { name: 'stateSync' } 
    })

    // Now it should be ROUND 1
    expect(roundIndicator.textContent).toBe('ROUND 1')
  })
})
