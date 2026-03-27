import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { logic } from '../src/logic'
// Import client to trigger the real UI initialization against the DOM setup in setup.ts
import '../src/client'

const runeInitSpy = global.Rune.initClient as any

describe('Animation Timing', () => {
  let onChangeCallback: any

  beforeEach(() => {
    vi.useFakeTimers()
    onChangeCallback = runeInitSpy.mock.calls[0][0].onChange
    // Cleanup any leftover cards from previous tests
    document.querySelectorAll('.flying-card').forEach(el => el.remove())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reveals and then flies card on successful pick from center', async () => {
    const game = logic.setup(['p1', 'p2'])
    
    // Simulate drawing a card
    game.phase = 'pick'
    game.currentDrawnCard = game.centerCards[0].emoji
    const targetEmoji = game.currentDrawnCard
    const targetId = game.centerCards[0].id

    // Initial state sync to populate UI/guessCardMap
    onChangeCallback({
      game,
      yourPlayerId: 'p1',
      event: { name: 'stateSync' }
    })

    // Mock getBoundingClientRect for ALL source cards to ensure startPos is non-zero
    document.querySelectorAll('.guess-card').forEach(el => {
      el.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 100, top: 100, width: 50, height: 50, right: 150, bottom: 150
      })
    })

    const action = {
      name: 'pickCard',
      playerId: 'p1',
      params: { type: 'center', index: 0 }
    }

    // Update game state for success
    game.playerHands['p1'].push(game.centerCards[0].emoji)
    game.lastResult = {
      success: true,
      emoji: targetEmoji,
      from: { type: 'center', index: 0, id: targetId },
      to: 'p1'
    }
    game.centerCards.splice(0, 1)

    onChangeCallback({
      game,
      yourPlayerId: 'p1',
      action
    })

    // Immediately after onChange, "flying-card" SHOULD be in the body (the reveal phase)
    expect(document.querySelector('.flying-card')).not.toBeNull()
    
    // Check that it stays at startPos during reveal
    vi.advanceTimersByTime(150)
    expect(document.querySelector('.flying-card')).not.toBeNull()

    // Fast-forward to end of reveal animation (300ms)
    vi.advanceTimersByTime(150)
    
    // Trigger reveal onfinish
    let allAnims = document.body.getAnimations?.() || []
    allAnims.forEach(a => (a as any).onfinish?.())
    
    // Reveal finish triggers a 100ms pause before startFlight
    vi.advanceTimersByTime(100)
    
    // Now it should have called startFlight, creating new animations
    allAnims = document.body.getAnimations?.() || []
    expect(allAnims.length).toBeGreaterThan(0)
    
    // Trigger flight onfinish
    allAnims.forEach(a => (a as any).onfinish?.())

    // It should be removed after flight finishes
    expect(document.querySelector('.flying-card')).toBeNull()
  })

  it('reveals card before fly on successful steal', async () => {
    const game = logic.setup(['p1', 'p2'])
    game.playerHands['p2'] = ['🦁']
    game.currentDrawnCard = '🦁'
    
    // Initial state sync
    onChangeCallback({
      game,
      yourPlayerId: 'p1',
      event: { name: 'stateSync' }
    })

    const action = {
      name: 'pickCard',
      playerId: 'p1',
      params: { type: 'player', playerId: 'p2', index: 0 }
    }
    
    // Update game state for success
    game.playerHands['p1'].push('🦁')
    game.playerHands['p2'] = []
    game.lastResult = {
      success: true,
      emoji: '🦁',
      from: { type: 'player', playerId: 'p2', index: 0 },
      to: 'p1'
    }

    onChangeCallback({
      game,
      yourPlayerId: 'p1',
      action
    })

    // Should immediately show a flying card for reveal
    expect(document.querySelector('.flying-card')).not.toBeNull()
    expect(document.querySelector('.flying-card')?.textContent).toContain('🦁')
    
    vi.advanceTimersByTime(300) // end of reveal
    let allAnims = document.body.getAnimations?.() || []
    allAnims.forEach(a => (a as any).onfinish?.())
    
    vi.advanceTimersByTime(100) // pause
    
    // Finish flight
    allAnims = document.body.getAnimations?.() || []
    allAnims.forEach(a => (a as any).onfinish?.())
    
    expect(document.querySelector('.flying-card')).toBeNull()
  })

  it('does NOT delay flyCard on failure/penalty', async () => {
    const game = logic.setup(['p1', 'p2'])
    
    // Simulate a failure (picking wrong card)
    game.phase = 'pick'
    game.currentDrawnCard = '🍎' // Not in center
    const pickedEmoji = game.centerCards[0].emoji
    const pickedId = game.centerCards[0].id

    // Trigger the action
    const action = {
      name: 'pickCard',
      playerId: 'p1',
      params: { type: 'center', index: 0 }
    }
    
    // Update game state for failure
    game.lastResult = {
      success: false,
      emoji: pickedEmoji,
      from: { type: 'center', index: 0, id: pickedId }
    }

    onChangeCallback({
      game,
      yourPlayerId: 'p1',
      action
    })

    // On failure from center, we only show flip + shake, we don't fly the picked card to a slot.
    // However, if there was a penalty where a card flies TO center, it should happen immediately.
    
    const gamePenalty = logic.setup(['p1', 'p2'])
    gamePenalty.playerHands['p1'] = ['🍌']
    gamePenalty.currentDrawnCard = '🍌'
    
    const actionPenalty = {
      name: 'pickCard',
      playerId: 'p1',
      params: { type: 'center', index: 0 }
    }
    
    gamePenalty.lastResult = {
      success: false,
      emoji: gamePenalty.centerCards[0].emoji,
      from: { type: 'center', index: 0, id: gamePenalty.centerCards[0].id },
      to: 'center',
      penalisedPlayerId: 'p1'
    }
    
    onChangeCallback({
      game: gamePenalty,
      yourPlayerId: 'p1',
      action: actionPenalty
    })

    // The penalty fly (card from hand to center) should happen immediately
    expect(document.querySelector('.flying-card')).not.toBeNull()
  })
})
