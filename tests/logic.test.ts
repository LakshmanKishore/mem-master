import { describe, it } from "node:test"
import assert from "node:assert"
import { logic, generateGame, EMOJIS } from "../src/logic.ts"

// Mock Rune environment
globalThis.Rune = {
  gameOver: () => {},
  initLogic: () => {},
  invalidAction: () => { throw new Error("Invalid action") },
} as any

describe("Memory Master Logic", () => {
  it("generates a valid initial state", () => {
    const playerIds = ["p1", "p2"]
    const state = generateGame(playerIds)

    assert.strictEqual(state.playerIds.length, 2)
    assert.strictEqual(state.centerCards.length, 9)
    assert.ok(state.deck.length > 0)
    assert.strictEqual(state.phase, "draw")
    assert.strictEqual(state.turn, "p1")
  })

  it("has balanced deck generation", () => {
    const playerIds = ["p1"]
    const state = generateGame(playerIds)
    const gameEmojis = state.centerCards.filter(c => c !== null) as string[]
    
    // Count occurrences of each emoji in the deck
    const counts: Record<string, number> = {}
    state.deck.forEach(emoji => {
      counts[emoji] = (counts[emoji] || 0) + 1
    })

    // Check that all emojis from center are present in the deck
    gameEmojis.forEach(emoji => {
      assert.ok(counts[emoji] > 0, `Emoji ${emoji} should be in the deck`)
    })
  })

  it("handles drawCard action", () => {
    const state = generateGame(["p1"])
    const initialDeckSize = state.deck.length
    
    logic.actions.drawCard(null, { game: state, playerId: "p1" })
    
    assert.strictEqual(state.phase, "pick")
    assert.strictEqual(state.deck.length, initialDeckSize - 1)
    assert.ok(state.currentDrawnCard)
  })

  it("handles drawCard guard clauses", () => {
    const state = generateGame(["p1", "p2"])
    
    // Wrong turn
    logic.actions.drawCard(null, { game: state, playerId: "p2" })
    assert.strictEqual(state.phase, "draw")

    // Wrong phase (after drawing)
    logic.actions.drawCard(null, { game: state, playerId: "p1" })
    assert.strictEqual(state.phase, "pick")
    logic.actions.drawCard(null, { game: state, playerId: "p1" })
    assert.strictEqual(state.phase, "pick")

    // Empty deck
    state.deck = []
    state.phase = "draw"
    logic.actions.drawCard(null, { game: state, playerId: "p1" })
    assert.strictEqual(state.phase, "draw")
  })

  it("implements single player smart draw", () => {
    // Force a state where the top of the deck is already in player's hand
    const state = generateGame(["p1"])
    const emojiInHand = state.centerCards[0]!
    state.playerHands["p1"] = [emojiInHand]
    
    // Put that same emoji on top of the deck
    state.deck.push(emojiInHand)
    
    // Ensure there's a card in the center that we can swap with
    state.centerCards[1] = EMOJIS.find(e => !state.playerHands["p1"].includes(e)) || EMOJIS[5]
    const centerEmoji = state.centerCards[1]!

    // Mock Math.random to always swap (0 < 0.8)
    const oldRandom = Math.random
    Math.random = () => 0.1
    
    try {
      logic.actions.drawCard(null, { game: state, playerId: "p1" })
      // Since it's a swap, the drawn card should likely NOT be the one in hand
      // (Probability is 80%, and we forced random to 0.1)
      assert.notStrictEqual(state.currentDrawnCard, emojiInHand)
    } finally {
      Math.random = oldRandom
    }
  })

  it("handles pickCard guard clauses", () => {
    const state = generateGame(["p1", "p2"])
    
    // Pick before drawing
    logic.actions.pickCard({ type: "center", index: 0 }, { game: state, playerId: "p1" })
    assert.strictEqual(state.lastResult, null)

    // Draw first
    logic.actions.drawCard(null, { game: state, playerId: "p1" })
    
    // Wrong turn
    logic.actions.pickCard({ type: "center", index: 0 }, { game: state, playerId: "p2" })
    assert.strictEqual(state.lastResult, null)

    // Pick empty slot (null card)
    state.centerCards[0] = null
    logic.actions.pickCard({ type: "center", index: 0 }, { game: state, playerId: "p1" })
    assert.strictEqual(state.lastResult, null)
  })

  it("handles successful steal from player", () => {
    const state = generateGame(["p1", "p2"])
    state.currentDrawnCard = "🐶"
    state.phase = "pick"
    state.playerHands["p2"] = ["🐶"]
    
    logic.actions.pickCard({ type: "player", playerId: "p2", index: 0 }, { game: state, playerId: "p1" })
    
    assert.strictEqual(state.playerHands["p2"].length, 0)
    assert.strictEqual(state.playerHands["p1"][0], "🐶")
    assert.strictEqual(state.lastResult?.success, true)
  })

  it("moves matching card to center on failed guess (Penalty)", () => {
    const state = generateGame(["p1", "p2"])
    
    // p1 draws a card
    state.currentDrawnCard = "🐶"
    state.phase = "pick"
    state.turn = "p1"
    
    // p2 has the matching card
    state.playerHands["p2"] = ["🐶"]
    
    // Create an empty slot in center
    state.centerCards[5] = null

    // p1 picks a WRONG card in the center
    state.centerCards[0] = "🐱"
    logic.actions.pickCard({ type: "center", index: 0 }, { game: state, playerId: "p1" })
    
    // Penalty: p2 should lose the "🐶" and it should go to center empty slot
    assert.strictEqual(state.playerHands["p2"].length, 0)
    assert.strictEqual(state.centerCards[5], "🐶")
    assert.strictEqual(state.lastResult?.to, "center")
    assert.strictEqual(state.lastResult?.penalisedPlayerId, "p2")
  })

  it("moves stolen card back to center on failed steal", () => {
    const state = generateGame(["p1", "p2"])
    state.currentDrawnCard = "🐶"
    state.phase = "pick"
    state.playerHands["p2"] = ["🐱"] // Wrong card
    
    // Create an empty slot
    state.centerCards[0] = null

    logic.actions.pickCard({ type: "player", playerId: "p2", index: 0 }, { game: state, playerId: "p1" })
    
    // Penalty: "🐱" should move from p2 to center gap
    assert.strictEqual(state.playerHands["p2"].length, 0)
    assert.strictEqual(state.centerCards[0], "🐱")
    assert.strictEqual(state.lastResult?.to, "center")
  })

  it("handles center overflow when returning cards", () => {
    const state = generateGame(["p1", "p2"])
    state.currentDrawnCard = "🐶"
    state.phase = "pick"
    state.playerHands["p2"] = ["🐱"] // Wrong card
    
    // Fill center with no nulls
    state.centerCards = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]
    
    logic.actions.pickCard({ type: "player", playerId: "p2", index: 0 }, { game: state, playerId: "p1" })
    
    // Center should grow
    assert.strictEqual(state.centerCards.length, 10)
    assert.strictEqual(state.centerCards[9], "🐱")
  })

  it("ends game when deck is empty", () => {
    const state = generateGame(["p1"])
    state.deck = [] // Force empty deck
    state.currentDrawnCard = "🐶"
    state.centerCards[0] = "🐶"
    state.phase = "pick"
    
    let gameOverCalled = false
    globalThis.Rune.gameOver = () => { gameOverCalled = true }
    
    logic.actions.pickCard({ type: "center", index: 0 }, { game: state, playerId: "p1" })
    
    assert.ok(gameOverCalled)
  })

  it("ends game when center is empty", () => {
    const state = generateGame(["p1"])
    state.centerCards = [null, null, null, null, null, null, null, null, "🐶"]
    state.currentDrawnCard = "🐶"
    state.phase = "pick"
    
    let gameOverCalled = false
    globalThis.Rune.gameOver = () => { gameOverCalled = true }
    
    logic.actions.pickCard({ type: "center", index: 8 }, { game: state, playerId: "p1" })
    
    assert.ok(gameOverCalled)
  })

  it("handles game over with a tie", () => {
    const state = generateGame(["p1", "p2"])
    state.deck = []
    state.currentDrawnCard = "🐶"
    state.centerCards = ["🐶", null, null, null, null, null, null, null, null]
    state.phase = "pick"
    
    // Give p1 zero cards, p2 one card
    state.playerHands["p1"] = []
    state.playerHands["p2"] = ["🐹"]

    let gameOverData: any = null
    globalThis.Rune.gameOver = (data) => { gameOverData = data }
    
    logic.actions.pickCard({ type: "center", index: 0 }, { game: state, playerId: "p1" })
    
    // Now p1 has ["🐶"], p2 has ["🐹"] -> TIE
    assert.strictEqual(state.winner, null) 
    assert.strictEqual(gameOverData.players["p1"], "WON")
    assert.strictEqual(gameOverData.players["p2"], "WON")
  })

  it("handles playerJoined event", () => {
    const state = generateGame(["p1"])
    logic.events.playerJoined("p2", { game: state })
    
    assert.ok(state.playerIds.includes("p2"))
    assert.ok(Array.isArray(state.playerHands["p2"]))
  })

  it("handles playerLeft event", () => {
    const state = generateGame(["p1", "p2"])
    state.playerHands["p2"] = ["🐶"]
    state.centerCards[0] = null // Create a gap
    
    logic.events.playerLeft("p2", { game: state })
    
    assert.strictEqual(state.playerIds.length, 1)
    assert.strictEqual(state.centerCards[0], "🐶") // Hand moved to center gap
    assert.strictEqual(state.playerHands["p2"], undefined)
  })

  it("handles playerLeft when center is full", () => {
    const state = generateGame(["p1", "p2"])
    state.playerHands["p2"] = ["🐶"]
    state.centerCards = ["A", "B", "C", "D", "E", "F", "G", "H", "I"] // No nulls
    
    logic.events.playerLeft("p2", { game: state })
    
    assert.strictEqual(state.centerCards.length, 10)
    assert.strictEqual(state.centerCards[9], "🐶")
  })

  it("handles active player leaving", () => {
    const state = generateGame(["p1", "p2"])
    state.turn = "p1"
    state.phase = "pick"
    state.currentDrawnCard = "🐶"
    
    logic.events.playerLeft("p1", { game: state })
    
    assert.strictEqual(state.turn, "p2")
    assert.strictEqual(state.phase, "draw")
    assert.strictEqual(state.currentDrawnCard, null)
  })
})
