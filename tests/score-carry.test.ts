import { describe, it, expect } from 'vitest'
import { logic, generateGame, GameState } from '../src/logic'

describe('Score Carry Over Logic', () => {
  it('should carry over scores and powerups to the next round', () => {
    // 1. Setup
    const playerIds = ['p1', 'p2']
    const game = generateGame(playerIds)
    
    // 2. Manipulate state to simulate end of round 1
    game.deck = [] // Empty deck
    game.centerCards = [] // Empty center
    
    // Give p1 3 cards
    game.playerHands['p1'] = ['🐶', '🐱', '🐭']
    // Give p2 1 card
    game.playerHands['p2'] = ['🐹']
    
    // Give p1 a powerup
    game.powerUps['p1'] = ['shuffle']

    // 3. Trigger round transition via pickCard
    // We need to trigger pickCard to run the round transition logic.
    // But pickCard requires a valid target and phase.
    // The round transition happens at the end of pickCard.
    // So we need to set up a state where pickCard is valid and leads to round end.
    
    // Let's say it's p1's turn, phase is pick.
    // There is 1 card in center, deck is empty.
    // p1 picks the last card.
    
    // Reset state to "almost end of round"
    game.phase = 'pick'
    game.turn = 'p1'
    game.deck = []
    game.centerCards = [{ id: 99, emoji: '🐸' }]
    game.currentDrawnCard = '🐸' // Match!
    
    // Execute pickCard
    logic.actions.pickCard({ type: 'center', index: 0 }, { game, playerId: 'p1' })
    
    // 4. Verify Round 2 State
    expect(game.round).toBe(2)
    
    // Scores should be carried over
    // p1 had 3 cards + picked 1 = 4
    expect(game.scores['p1']).toBe(4)
    // p2 had 1 card
    expect(game.scores['p2']).toBe(1)
    
    // Hands should be reset for new round
    expect(game.playerHands['p1'].length).toBe(0)
    expect(game.playerHands['p2'].length).toBe(0)
    
    // Powerups should be preserved
    expect(game.powerUps['p1']).toContain('shuffle')
    // p1 might have gained a powerup if they had a streak, but we care about the carried one
    // actually, logic clears streaks on new round? 
    // "const currentStreaks = { ...game.streaks }" -> preserved.
    // But powerups? "const currentPowerUps = JSON.parse(JSON.stringify(game.powerUps))" -> preserved.
    
    // Note: p1 picked a match, so streak increased. If streak reached 3, they got a powerup.
    // But we just want to ensure the 'shuffle' we added manually is still there.
    expect(game.powerUps['p1']).toContain('shuffle')
  })

  it('should determine winner based on total accumulated score', () => {
    // 1. Setup Game at Round 3 (Final Round)
    const playerIds = ['p1', 'p2']
    const game = generateGame(playerIds, 3)
    
    // 2. Set accumulated scores from previous rounds
    game.scores['p1'] = 10
    game.scores['p2'] = 5
    
    // 3. Set current round hands
    // p1 gets 1 card
    game.playerHands['p1'] = ['🐶']
    // p2 gets 7 cards
    game.playerHands['p2'] = ['🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼']
    
    // Total: p1 = 11, p2 = 12. p2 should win.
    
    // 4. Trigger Game Over
    // p1's turn, pick match, empty center & deck
    game.phase = 'pick'
    game.turn = 'p1'
    game.deck = []
    game.centerCards = [{ id: 99, emoji: '🐸' }]
    game.currentDrawnCard = '🐸'
    
    logic.actions.pickCard({ type: 'center', index: 0 }, { game, playerId: 'p1' })
    
    // p1 total = 10 + 1 (existing) + 1 (picked) = 12
    // p2 total = 5 + 7 = 12
    // Tie!
    
    // Let's make p2 have 8 cards to win clearly.
    // p1 total = 12
    // p2 total = 5 + 8 = 13
    // But wait, I already ran the action.
    
    // Let's retry setup with clear winner.
    
    const game2 = generateGame(playerIds, 3)
    game2.scores['p1'] = 20
    game2.scores['p2'] = 5
    game2.playerHands['p1'] = []
    game2.playerHands['p2'] = ['🐱', '🐭'] // 2 cards
    
    game2.phase = 'pick'
    game2.turn = 'p2' // p2 picks last card
    game2.deck = []
    game2.centerCards = [{ id: 100, emoji: '🦁' }]
    game2.currentDrawnCard = '🦁'
    
    logic.actions.pickCard({ type: 'center', index: 0 }, { game: game2, playerId: 'p2' })
    
    // p1 total = 20 + 0 = 20
    // p2 total = 5 + 2 (existing) + 1 (picked) = 8
    
    expect(game2.winner).toBe('p1')
  })
})
