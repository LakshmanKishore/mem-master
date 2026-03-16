import { describe, it, expect, vi, beforeAll } from 'vitest'

describe('Integration: Full Game Cycle', () => {
  let onChangeCallback: any

  beforeAll(async () => {
    // 1. Setup DOM
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

    // 2. Import client
    await import('../src/client')
    
    // 3. Capture callback
    const calls = (Rune.initClient as any).mock.calls
    if (calls.length > 0) {
      onChangeCallback = calls[0][0].onChange
    }
  })

  it('plays a full turn correctly', async () => {
    // --- STEP 1: INITIAL STATE ---
    const state1 = {
      playerIds: ['p1', 'p2'],
      turn: 'p1',
      phase: 'draw',
      deck: ['🐶', '🐱'],
      centerCards: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨'],
      playerHands: { p1: [], p2: [] },
      currentDrawnCard: null,
      lastResult: null,
      winner: null,
    }

    onChangeCallback({ game: state1, yourPlayerId: 'p1' })
    await new Promise(r => setTimeout(r, 0))

    const deck = document.getElementById('deck-stack')
    deck?.click()
    expect(Rune.actions.drawCard).toHaveBeenCalled()

    // --- STEP 2: DRAWN STATE ---
    const state2 = {
      ...state1,
      phase: 'pick',
      deck: ['🐱'],
      currentDrawnCard: '🐶'
    }

    onChangeCallback({ game: state2, yourPlayerId: 'p1' })
    await new Promise(r => setTimeout(r, 0))

    // Debugging
    const revealed = document.getElementById('drawn-reveal-container')
    console.log('DEBUG HTML:', revealed?.innerHTML)
    
    // Check innerHTML instead of textContent just in case
    expect(revealed?.innerHTML).toContain('🐶')

    // --- STEP 3: PICK CARD ---
    const guessCards = document.querySelectorAll('.guess-card')
    expect(guessCards.length).toBe(9)
    ;(guessCards[0] as HTMLElement).click()

    expect(Rune.actions.pickCard).toHaveBeenCalledWith({ type: 'center', index: 0 })

    // --- STEP 4: STEAL OPPORTUNITY ---
    const state3 = {
      ...state2,
      playerHands: { p1: [], p2: ['🦊'] },
      centerCards: ['🐶', '🐱', '🐭', '🐹', '🐰', null, '🐻', '🐼', '🐨'],
      currentDrawnCard: '🦊'
    }

    onChangeCallback({ game: state3, yourPlayerId: 'p1' })
    await new Promise(r => setTimeout(r, 0))

    expect(revealed?.innerHTML).toContain('🦊')

    const opponentNode = Array.from(document.querySelectorAll('.player-node'))
      .find(n => n.innerHTML.includes('Opponent')) as HTMLElement
    expect(opponentNode).toBeTruthy()
    opponentNode.click()

    const modal = document.getElementById('steal-overlay')
    expect(modal?.classList.contains('hidden')).toBe(false)

    const stealOption = document.querySelector('.steal-option') as HTMLElement
    stealOption.click()

    expect(Rune.actions.pickCard).toHaveBeenCalledWith({
      type: 'player',
      playerId: 'p2',
      index: 0
    })
  })

  it('updates UI correctly when waiting for opponent turn', async () => {
    // 1. State: It is p2's turn to draw
    const opponentTurnState = {
      playerIds: ['p1', 'p2'],
      turn: 'p2',
      phase: 'draw',
      deck: ['🐶', '🐱'],
      centerCards: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨'],
      playerHands: { p1: [], p2: [] },
      currentDrawnCard: null,
      lastResult: null,
      winner: null,
    }

    onChangeCallback({ game: opponentTurnState, yourPlayerId: 'p1' })
    await new Promise(r => setTimeout(r, 0))

    // 2. Check turn indicator for p2 (Opponent)
    const turnText = document.querySelector('.turn-action-text')
    expect(turnText?.textContent).toBe('WAITING...')
    
    // 3. Check body class to ensure we cannot draw
    expect(document.body.classList.contains('can-draw')).toBe(false)
  })

  it('handles a new player joining mid-game', async () => {
    // 1. Initial State (2 players)
    const state = {
      playerIds: ['p1', 'p2'],
      turn: 'p1',
      phase: 'draw',
      deck: ['🐶'],
      centerCards: [null, '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨'],
      playerHands: { p1: [], p2: [] },
      currentDrawnCard: null,
      lastResult: null,
      winner: null,
    }

    onChangeCallback({ game: state, yourPlayerId: 'p1' })
    await new Promise(r => setTimeout(r, 0))

    expect(document.querySelectorAll('.player-node').length).toBe(2)

    // 2. Simulate p3 joining (event comes in)
    const newState = {
      ...state,
      playerIds: ['p1', 'p2', 'p3'],
      playerHands: { ...state.playerHands, p3: [] }
    }

    onChangeCallback({ 
      game: newState, 
      yourPlayerId: 'p1',
      event: { name: 'playerJoined', playerId: 'p3', params: {} } 
    })
    await new Promise(r => setTimeout(r, 0))

    // 3. Check UI reflects 3 players
    expect(document.querySelectorAll('.player-node').length).toBe(3)
  })

  it('displays winner UI when game ends', async () => {
    // 1. Game over state: p1 has 2 cards, p2 has 1 card
    const gameOverState = {
      playerIds: ['p1', 'p2'],
      turn: 'p1',
      phase: 'draw',
      deck: [],
      centerCards: [null, null, null, null, null, null, null, null, null],
      playerHands: { p1: ['🐶', '🐱'], p2: ['🐹'] },
      currentDrawnCard: null,
      lastResult: null,
      winner: 'p1',
    }

    onChangeCallback({ game: gameOverState, yourPlayerId: 'p1' })
    await new Promise(r => setTimeout(r, 0))

    // 2. Check turn indicator shows WINNER!
    const turnText = document.querySelector('.turn-action-text')
    expect(turnText?.textContent).toBe('WINNER!')
    
    // 3. Verify winner node is active (if logic sets it)
    // Actually, turnIndicator shows the winner name based on game.turn or last result
    // In your client.ts: if (game.winner) statusText = "WINNER!"
    expect(turnText?.textContent).toBe('WINNER!')
  })

  it('updates score badge when a player scores', async () => {
    // 1. Initial State
    const state = {
      playerIds: ['p1', 'p2'],
      turn: 'p1',
      phase: 'draw',
      deck: ['🐶'],
      centerCards: ['🐶', '🐱'],
      playerHands: { p1: [], p2: [] },
      currentDrawnCard: null,
      lastResult: null,
      winner: null,
    }
    onChangeCallback({ game: state, yourPlayerId: 'p1' })
    await new Promise(r => setTimeout(r, 0))

    const scoreBadge = document.querySelector('.player-node.is-me .score-badge')
    expect(scoreBadge?.textContent).toBe('0')

    // 2. Success Result
    const successState = {
      ...state,
      playerHands: { p1: ['🐶'], p2: [] },
      centerCards: [null, '🐱'],
      lastResult: {
        success: true,
        emoji: '🐶',
        from: { type: 'center', index: 0 },
        to: 'p1'
      }
    }
    onChangeCallback({ game: successState, yourPlayerId: 'p1' })
    await new Promise(r => setTimeout(r, 0))

    expect(scoreBadge?.textContent).toBe('1')
  })

  it('reduces opponent score when they are penalised', async () => {
     // 1. Opponent has a card
     const state = {
       playerIds: ['p1', 'p2'],
       turn: 'p1',
       phase: 'pick',
       deck: [],
       centerCards: ['🐱', '🐶'],
       playerHands: { p1: [], p2: ['🐰'] },
       currentDrawnCard: '🐰',
       lastResult: null,
       winner: null,
     }
     onChangeCallback({ game: state, yourPlayerId: 'p1' })
     await new Promise(r => setTimeout(r, 0))
     
     const opponentNode = Array.from(document.querySelectorAll('.player-node'))
       .find(n => n.innerHTML.includes('Opponent'))
     const opponentScore = opponentNode?.querySelector('.score-badge')
     expect(opponentScore?.textContent).toBe('1')

     // 2. p1 guesses WRONG in center (guesses 🐱 instead of 🐰)
     // Penalty: p2 loses the 🐰 back to center
     const penaltyState = {
       ...state,
       playerHands: { p1: [], p2: [] },
       centerCards: ['🐱', '🐶', '🐰'],
       lastResult: {
         success: false,
         emoji: '🐱',
         from: { type: 'center', index: 0 },
         to: 'center',
         penalisedPlayerId: 'p2'
       }
     }
     onChangeCallback({ game: penaltyState, yourPlayerId: 'p1' })
     await new Promise(r => setTimeout(r, 0))

     expect(opponentScore?.textContent).toBe('0')
  })

  it('removes player node when they leave', async () => {
    const state = {
      playerIds: ['p1', 'p2'],
      turn: 'p1',
      phase: 'draw',
      deck: [],
      centerCards: [],
      playerHands: { p1: [], p2: [] },
      currentDrawnCard: null,
      lastResult: null,
      winner: null,
    }
    onChangeCallback({ game: state, yourPlayerId: 'p1' })
    await new Promise(r => setTimeout(r, 0))
    expect(document.querySelectorAll('.player-node').length).toBe(2)

    const leftState = {
      ...state,
      playerIds: ['p1'],
      playerHands: { p1: [] }
    }
    onChangeCallback({ 
      game: leftState, 
      yourPlayerId: 'p1',
      event: { name: 'playerLeft', playerId: 'p2', params: {} }
    })
    await new Promise(r => setTimeout(r, 0))
    expect(document.querySelectorAll('.player-node').length).toBe(1)
  })
})
