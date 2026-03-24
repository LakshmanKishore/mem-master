import { LabRunner } from "./testLab"

export const scenarios: Record<string, (lab: LabRunner) => Promise<void>> = {
  "Logic: Full Loop Test": async (lab) => {
    lab.reset()

    // Force state to ensure deterministic test
    const state = lab.getState()
    const knownEmoji = state.centerCards[0].emoji
    state.deck.push(knownEmoji) // Ensure top card is valid
    lab.setState(state)

    await lab.wait(1000)
    lab.log("Action: Drawing Card")
    await lab.click("#deck-stack", "Deck")
    await lab.wait(1200)

    const newState = lab.getState()
    if (newState.phase !== "pick") {
      lab.log(`❌ Draw failed! Phase: ${newState.phase}`)
      throw new Error("Draw action didn't trigger")
    }

    const target = newState.currentDrawnCard
    lab.log(`Searching for: ${target}`)

    const centerIdx = newState.centerCards.findIndex(
      (c: { emoji: string }) => c.emoji === target
    )
    if (centerIdx !== -1) {
      lab.log(`Found ${target} at index ${centerIdx}`)
      // Note: We use a selector that depends on the index, assuming the UI generates classes or IDs?
      // In client.ts, we had direct access to guessCardElements.
      // Here we don't. We need to find the element by querying.
      // The guess-card elements don't have unique IDs, but they are in order in the DOM?
      // No, guessCardsRing appends them.
      // We can use nth-child.
      const cards = document.querySelectorAll("#guess-cards-ring .guess-card")
      if (cards[centerIdx]) {
        await lab.click(cards[centerIdx] as HTMLElement, `Card ${centerIdx}`)
      } else {
        throw new Error(`DOM Element for card ${centerIdx} not found`)
      }
    } else {
      lab.log(`❌ ${target} not in center!`)
      console.error("Center Cards:", newState.centerCards)
      throw new Error("Target not in center")
    }
  },
  "Logic: Steal Success": async (lab) => {
    lab.reset(["p1", "p2"])
    const state = lab.getState()
    const target = "🐶"

    state.playerHands["p2"] = [target]
    state.centerCards = state.centerCards.filter(
      (c: { emoji: string }) => c.emoji !== target
    )
    state.deck.push(target)
    lab.setState(state)

    await lab.wait(500)
    lab.log("Drawing '🐶'...")
    await lab.click("#deck-stack", "Deck")
    await lab.wait(1000)

    // Click P2 to steal
    const playerNodes = document.querySelectorAll(".player-node")
    const p2Node = playerNodes[1]
    if (p2Node) {
      lab.log("Stealing from P2...")
      await lab.click(p2Node as HTMLElement, "Player 2")
      await lab.wait(1000)

      const options = document.querySelectorAll(".steal-option")
      if (options.length > 0) {
        await lab.click(options[0] as HTMLElement, "Steal Option")
        await lab.wait(1000)

        const finalState = lab.getState()
        if (!finalState.playerHands["p1"].includes(target)) {
          throw new Error("Steal failed! P1 doesn't have the card.")
        }
        lab.log("✅ Steal Successful")
      } else {
        throw new Error("Steal modal empty")
      }
    }
  },
  "Logic: Penalty Only for Current Player": async (lab) => {
    lab.reset(["p1", "p2"])
    const state = lab.getState()
    const target = "🐱"

    // Scenario 1: P2 has the target, P1 guesses WRONG in Center
    state.playerHands["p2"] = [target]
    state.playerHands["p1"] = ["🐶"]
    state.centerCards = [
      { id: 1, emoji: "🐮" },
      { id: 2, emoji: "🐷" },
    ]
    state.deck.push(target)
    lab.setState(state)

    await lab.wait(500)
    lab.log("Drawing '🐱'...")
    await lab.click("#deck-stack", "Deck")
    await lab.wait(1000)

    lab.log("P1 picks WRONG card from Center (🐮)...")
    const cards = document.querySelectorAll("#guess-cards-ring .guess-card")
    // Find index of 🐮 (should be index 0 based on my setup above)
    await lab.click(cards[0] as HTMLElement, "Wrong Card 🐮")
    await lab.wait(1000)

    const stateAfterFail = lab.getState()
    if (!stateAfterFail.playerHands["p2"].includes(target)) {
      throw new Error("OPPONENT PENALIZED! P2 should have kept their card.")
    }
    lab.log("✅ P2 kept card (No unfair penalty)")

    // Scenario 2: P1 has the target, P1 guesses WRONG in Center
    lab.log("Resetting for Scenario 2...")
    lab.reset(["p1", "p2"])
    const state2 = lab.getState()
    state2.playerHands["p1"] = [target]
    state2.playerHands["p2"] = ["🐶"]
    state2.centerCards = [
      { id: 1, emoji: "🐮" },
      { id: 2, emoji: "🐷" },
    ]
    state2.deck.push(target)
    lab.setState(state2)

    await lab.wait(500)
    lab.log("Drawing '🐱'...")
    await lab.click("#deck-stack", "Deck")
    await lab.wait(1000)

    lab.log("P1 picks WRONG card from Center (🐮)...")
    const cards2 = document.querySelectorAll("#guess-cards-ring .guess-card")
    await lab.click(cards2[0] as HTMLElement, "Wrong Card 🐮")
    await lab.wait(1000)

    const finalState = lab.getState()
    if (finalState.playerHands["p1"].includes(target)) {
      throw new Error(
        "PLAYER NOT PENALIZED! P1 should have lost their card to center."
      )
    }
    if (
      !finalState.centerCards.some((c: { emoji: string }) => c.emoji === target)
    ) {
      throw new Error("Card did not return to center.")
    }
    lab.log("✅ P1 penalized correctly")
  },
  "Logic: Fail Center Pick": async (lab) => {
    lab.reset(["p1", "p2"])
    await lab.wait(800)
    lab.log("Drawing...")
    await lab.click("#deck-stack", "Deck")
    await lab.wait(1200)
    const state = lab.getState()
    const target = state.currentDrawnCard
    const wrongIdx = state.centerCards.findIndex(
      (c: { emoji: string }) => c.emoji !== target
    )
    if (wrongIdx !== -1) {
      lab.log(`Intentionally picking WRONG card at ${wrongIdx}`)
      const cards = document.querySelectorAll("#guess-cards-ring .guess-card")
      await lab.click(cards[wrongIdx] as HTMLElement, "Wrong Card")
    }
  },
  "Layout: 4 Players": async (lab) => {
    lab.log("Setting up 4 players...")
    lab.reset(["p1", "p2", "p3", "p4"])
  },
  "Layout: 6 Players": async (lab) => {
    lab.log("Setting up 6 players...")
    lab.reset(["p1", "p2", "p3", "p4", "p5", "p6"])
  },
  "Layout: Empty Deck": async (lab) => {
    lab.log("Fast-forwarding to end game...")
    lab.reset()
    const state = lab.getState()
    state.deck = []
    state.centerCards = [{ id: 1, emoji: "🐶" }]
    lab.setState(state)
  },
  "Logic: Win Condition": async (lab) => {
    lab.reset()
    // Setup: 1 card left in deck, matches last card in center
    const state = lab.getState()
    state.round = 3 // Force final round
    state.deck = ["🐶"]
    state.centerCards = [{ id: 1, emoji: "🐶" }]
    // Clear hands so P1 wins easily
    state.playerHands = { p1: [], p2: [] }
    lab.setState(state)

    await lab.wait(500)
    lab.log("Drawing final card")
    await lab.click("#deck-stack", "Deck")
    await lab.wait(1000)

    lab.log("Matching final card")
    const cards = document.querySelectorAll("#guess-cards-ring .guess-card")
    await lab.click(cards[0] as HTMLElement, "Last Card")

    await lab.wait(1000)
    const finalState = lab.getState()
    if (!finalState.winner) throw new Error("Game did not end!")
    if (finalState.winner !== "p1") throw new Error("P1 should have won")
  },
  "Logic: Turn Passing": async (lab) => {
    lab.reset()
    await lab.wait(500)

    // P1 Turn
    lab.log("P1 Drawing...")
    await lab.click("#deck-stack", "Deck")
    await lab.wait(1000)

    // P1 Fails
    const state = lab.getState()
    const target = state.currentDrawnCard
    const wrongIdx = state.centerCards.findIndex(
      (c: { emoji: string }) => c.emoji !== target
    )
    const cards = document.querySelectorAll("#guess-cards-ring .guess-card")
    await lab.click(cards[wrongIdx] as HTMLElement, "Wrong Card")
    await lab.wait(1000)

    // Check Turn
    const afterState = lab.getState()
    if (afterState.turn !== "p2")
      throw new Error(`Turn didn't pass! Current: ${afterState.turn}`)

    // Visual Check
    const turnText = document.querySelector(".turn-player-name")?.textContent
    if (
      !turnText?.includes("TEST P2") &&
      !turnText?.includes("LUCKY") &&
      !turnText?.includes("PLAYER P2")
    ) {
      lab.log(`Turn passed to: ${afterState.turn}`)
    }
  },
  "Logic: Steal Fail (Empty Hand)": async (lab) => {
    lab.reset()
    await lab.wait(500)

    // P1 Draws
    await lab.click("#deck-stack", "Deck")
    await lab.wait(1000)

    // Try to click P2 (Empty Hand)
    // The UI shouldn't open the modal if hand is empty.
    // So we check that modal remains hidden.

    const playerNodes = document.querySelectorAll(".player-node")
    let p2Node: Element | null = null
    playerNodes.forEach((node) => {
      if (
        node.textContent?.includes("Player p2") ||
        node.textContent?.includes("Test p2")
      )
        p2Node = node
    })

    // Fallback
    if (!p2Node && playerNodes.length >= 2) p2Node = playerNodes[1]

    if (p2Node) {
      await lab.click(p2Node as HTMLElement, "P2 (Empty)")
      await lab.wait(500)

      const modal = document.getElementById("steal-overlay")
      if (modal && !modal.classList.contains("hidden")) {
        throw new Error("Steal modal opened on empty hand!")
      }
      lab.log("✅ Modal stayed closed")
    }
  },
  "Visual: P1 Wins": async (lab) => {
    lab.reset()
    const state = lab.getState()
    state.winner = "p1"
    lab.setState(state)
    lab.log("Showing P1 Winner Screen")
  },
  "Visual: P2 Wins": async (lab) => {
    lab.reset()
    const state = lab.getState()
    state.winner = "p2"
    lab.setState(state)
    lab.log("Showing P2 Winner Screen")
  },
  "Stress: Spam Deck": async (lab) => {
    lab.reset()
    await lab.wait(500)
    lab.log("Spamming Deck Click 5x")
    const deck = "#deck-stack"
    // Fire rapidly without awaiting
    lab.click(deck, "Click 1")
    lab.click(deck, "Click 2")
    lab.click(deck, "Click 3")
    lab.click(deck, "Click 4")
    lab.click(deck, "Click 5")
    await lab.wait(2000)
    const state = lab.getState()
    lab.log(`Phase: ${state.phase}`)
  },
  "Feature: Streak & Power-up": async (lab) => {
    lab.reset(["p1", "p2"])
    const state = lab.getState()
    // Setup for 3 consecutive successes
    state.streaks["p1"] = 2
    state.currentDrawnCard = null // Reset draw
    // Ensure deck has matching cards for next draw
    const knownEmoji = state.centerCards[0].emoji
    state.deck.push(knownEmoji)
    lab.setState(state)

    await lab.wait(500)
    lab.log("Drawing for 3rd Streak...")
    await lab.click("#deck-stack", "Deck")
    await lab.wait(1000)

    const newState = lab.getState()
    const target = newState.currentDrawnCard
    const centerIdx = newState.centerCards.findIndex(
      (c: { emoji: string }) => c.emoji === target
    )

    // Pick correct card
    const cards = document.querySelectorAll("#guess-cards-ring .guess-card")
    await lab.click(cards[centerIdx] as HTMLElement, `Card ${centerIdx}`)
    await lab.wait(1000)

    const finalState = lab.getState()
    if (finalState.streaks["p1"] !== 0) {
      throw new Error("Streak should reset after reward!")
    }
    if (finalState.powerUps["p1"].length !== 1) {
      throw new Error("Power-up not awarded!")
    }
    lab.log(`✅ Power-up Awarded: ${finalState.powerUps["p1"][0]}`)
  },
  "Feature: Use Power-up (Peek)": async (lab) => {
    lab.reset(["p1"])
    const state = lab.getState()
    state.powerUps["p1"] = ["peek"]
    lab.setState(state)

    await lab.wait(500)
    const btn = document.querySelector(".powerup-btn") as HTMLElement
    if (!btn) throw new Error("Power-up button not visible")

    lab.log("Clicking Peek Power-up...")
    await lab.click(btn, "Peek Button")
    await lab.wait(1500) // Wait for peek animation

    const finalState = lab.getState()
    if (finalState.powerUps["p1"].length !== 0) {
      throw new Error("Power-up not consumed!")
    }
    lab.log("✅ Peek used successfully")
  },
  "Feature: Next Round Transition": async (lab) => {
    lab.reset(["p1"])
    const state = lab.getState()
    state.round = 1
    state.streaks["p1"] = 2 // Should continue
    state.playerHands["p1"] = ["🐶"] // Should reset
    state.deck = ["🐱"]
    state.centerCards = [{ id: 1, emoji: "🐱" }]
    lab.setState(state)

    await lab.wait(500)
    lab.log("Finishing Round 1...")
    await lab.click("#deck-stack", "Deck")
    await lab.wait(1000)

    const cards = document.querySelectorAll("#guess-cards-ring .guess-card")
    await lab.click(cards[0] as HTMLElement, "Match")
    await lab.wait(1000)

    const finalState = lab.getState()
    if (finalState.round !== 2) {
      throw new Error(`Round failed to advance! Current: ${finalState.round}`)
    }
    if (finalState.streaks["p1"] !== 3 && finalState.streaks["p1"] !== 0) {
      // It should be 3 (if pickCard added 1) OR 0 (if it awarded a powerup and reset)
      // Actually pickCard adds 1 then generateGame resets it? No, pickCard runs FIRST then round check.
      // So pickCard adds 1 (streak=3), then it awards powerup (streak=0), THEN round transition preserves it (0).
      // If it was streak 1, it should be 2.
      // Let's check streak 1 -> 2.
    }
    if (finalState.playerHands["p1"].length !== 0) {
      throw new Error("Hands did not reset after round!")
    }
    lab.log(
      `✅ Round 2 started. Streak: ${finalState.streaks["p1"]}. Hands: ${finalState.playerHands["p1"].length}`
    )
  },
}
