import type { PlayerId, RuneClient } from "rune-sdk"

export const EMOJIS = [
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐮",
  "🐷",
  "🐸",
  "🐵",
  "🐔",
  "🐧",
  "🐦",
  "🐤",
  "🦆",
]

export interface GameState {
  playerIds: PlayerId[]
  turn: PlayerId
  phase: "draw" | "pick"
  deck: string[]
  centerCards: { id: number; emoji: string }[] // Stable IDs for animations
  nextCardId: number
  playerHands: Record<PlayerId, string[]>
  currentDrawnCard: string | null
  lastResult: {
    success: boolean
    emoji: string
    from:
      | { type: "center"; index: number; id: number }
      | { type: "player"; playerId: PlayerId; index: number }
    to?: PlayerId | "center"
    penalisedPlayerId?: PlayerId
    powerUpUsed?: string
    powerUpAwarded?: string
  } | null
  winner: PlayerId | null
  round: number
  streaks: Record<PlayerId, number>
  powerUps: Record<PlayerId, string[]> // e.g., ["shuffle", "peek", "shield"]
  shieldedPlayers: PlayerId[] // Temporary shield for one turn
  scores: Record<PlayerId, number>
}

type GameActions = {
  drawCard: () => void
  pickCard: (
    target:
      | { type: "center"; index: number }
      | { type: "player"; playerId: PlayerId; index: number }
  ) => void
  usePowerUp: (type: string) => void
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

export function shuffle<T>(array: T[]): T[] {
  const newArray = [...array]
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[newArray[i], newArray[j]] = [newArray[j], newArray[i]]
  }
  return newArray
}

export function generateGame(
  playerIds: PlayerId[],
  round: number = 1
): GameState {
  // Round-based difficulty: more emojis, more deck cards
  const emojiCount = Math.min(9, 3 + round)
  const gameEmojis = shuffle(EMOJIS).slice(0, emojiCount)

  // Center starts with exactly emojiCount cards, each with a unique ID
  let nextId = 1
  const centerCards = gameEmojis.map((emoji) => ({
    id: nextId++,
    emoji,
  }))

  // Deck count scales with round and players
  const deckSize = 5 + round * 5 + playerIds.length * 3
  const deckPool: string[] = []
  for (let i = 0; i < deckSize; i++) {
    deckPool.push(gameEmojis[i % gameEmojis.length])
  }
  const deck = shuffle(deckPool)

  const playerHands: Record<PlayerId, string[]> = {}
  const streaks: Record<PlayerId, number> = {}
  const powerUps: Record<PlayerId, string[]> = {}
  const scores: Record<PlayerId, number> = {}
  playerIds.forEach((id) => {
    playerHands[id] = []
    streaks[id] = 0
    powerUps[id] = []
    scores[id] = 0
  })

  return {
    playerIds,
    turn: playerIds[0],
    phase: "draw",
    deck,
    centerCards,
    nextCardId: nextId,
    playerHands,
    currentDrawnCard: null,
    lastResult: null,
    winner: null,
    round,
    streaks,
    powerUps,
    shieldedPlayers: [],
    scores,
  }
}

export const logic = {
  minPlayers: 1,
  maxPlayers: 6,
  setup: (allPlayerIds: PlayerId[]) => generateGame(allPlayerIds),
  actions: {
    drawCard: (
      _: unknown,
      { game, playerId }: { game: GameState; playerId: PlayerId }
    ) => {
      if (
        game.phase !== "draw" ||
        game.turn !== playerId ||
        game.deck.length === 0
      ) {
        return
      }

      // Single player improvement: favor cards that are still in the center
      if (game.playerIds.length === 1) {
        const hand = game.playerHands[playerId]
        const centerEmojis = game.centerCards.map((c) => c.emoji)

        if (centerEmojis.length > 0) {
          const topIndex = game.deck.length - 1
          const topCard = game.deck[topIndex]

          // If the top card is already in the player's hand, it's "taken"
          if (hand.includes(topCard)) {
            // Try to find a card in the deck that is still in the center
            let swapIndex = -1
            for (let i = topIndex - 1; i >= 0; i--) {
              if (centerEmojis.includes(game.deck[i])) {
                swapIndex = i
                break
              }
            }

            // If we found a better card, swap it with high probability (80%)
            // This reduces the frequency of "already taken" cards
            if (swapIndex !== -1 && Math.random() < 0.8) {
              const temp = game.deck[topIndex]
              game.deck[topIndex] = game.deck[swapIndex]
              game.deck[swapIndex] = temp
            }
          }
        }
      }

      game.currentDrawnCard = game.deck.pop() || null
      game.phase = "pick"
      game.lastResult = null
    },
    pickCard: (
      target:
        | { type: "center"; index: number }
        | { type: "player"; playerId: PlayerId; index: number },
      { game, playerId }: { game: GameState; playerId: PlayerId }
    ) => {
      if (game.phase !== "pick" || game.turn !== playerId) {
        return
      }

      let pickedEmoji: string | null = null
      let pickedId: number | null = null

      if (target.type === "center") {
        const card = game.centerCards[target.index]
        pickedEmoji = card?.emoji || null
        pickedId = card?.id || null
      } else {
        const targetHand = game.playerHands[target.playerId]
        pickedEmoji = targetHand ? targetHand[target.index] : null

        // Check for SHIELD
        if (
          target.type === "player" &&
          game.shieldedPlayers.includes(target.playerId)
        ) {
          // You can't steal from a shielded player!
          game.lastResult = {
            success: false,
            emoji: "🛡️",
            from: target,
          }
          // Turn passes
          const currentIndex = game.playerIds.indexOf(playerId)
          game.turn = game.playerIds[(currentIndex + 1) % game.playerIds.length]
          game.phase = "draw"
          game.currentDrawnCard = null
          game.streaks[playerId] = 0
          return
        }
      }

      if (!pickedEmoji) return

      const isMatch = pickedEmoji === game.currentDrawnCard

      if (isMatch) {
        // SUCCESS: Card goes to current player
        if (target.type === "center") {
          game.centerCards.splice(target.index, 1)
        } else {
          game.playerHands[target.playerId].splice(target.index, 1)
        }

        game.playerHands[playerId].push(pickedEmoji)

        game.streaks[playerId] = (game.streaks[playerId] || 0) + 1

        const shouldAward = game.streaks[playerId] === 3
        const powerUpAwarded = shouldAward
          ? ["shuffle", "peek", "shield"][Math.floor(Math.random() * 3)]
          : undefined

        if (powerUpAwarded) {
          game.powerUps[playerId].push(powerUpAwarded)
          game.streaks[playerId] = 0 // Reset after reward
        }

        game.lastResult = {
          success: true,
          emoji: pickedEmoji,
          from:
            target.type === "center"
              ? { ...target, id: pickedId || -1 }
              : target,
          to: playerId,
          powerUpAwarded,
        }
      } else {
        // FAIL: Streak reset
        game.streaks[playerId] = 0

        const hand = game.playerHands[playerId]
        const matchIndex = hand.indexOf(game.currentDrawnCard!)

        if (matchIndex !== -1) {
          const emoji = hand.splice(matchIndex, 1)[0]
          // Return to center with a new ID
          game.centerCards.push({
            id: game.nextCardId++,
            emoji,
          })
          game.centerCards = shuffle(game.centerCards)

          game.lastResult = {
            success: false,
            emoji: pickedEmoji,
            from:
              target.type === "center"
                ? { ...target, id: pickedId || -1 }
                : target,
            to: "center",
            penalisedPlayerId: playerId,
          }
        } else {
          game.lastResult = {
            success: false,
            emoji: pickedEmoji,
            from:
              target.type === "center"
                ? { ...target, id: pickedId || -1 }
                : target,
          }
        }
      }

      // Check for Round Over: deck is empty OR center is empty
      const isCenterEmpty = game.centerCards.length === 0
      if (game.deck.length === 0 || isCenterEmpty) {
        if (game.round < 3) {
          // Transition to next round
          const nextRound = game.round + 1
          const currentStreaks = { ...game.streaks }
          const currentPowerUps = JSON.parse(JSON.stringify(game.powerUps))

          // Calculate and store scores
          const currentScores = { ...game.scores }
          game.playerIds.forEach((id) => {
            currentScores[id] =
              (currentScores[id] || 0) + game.playerHands[id].length
          })

          // Reset game state for new round (this resets hands, deck, center)
          const newState = generateGame(game.playerIds, nextRound)
          Object.assign(game, newState)

          // Restore persistent state
          game.streaks = currentStreaks
          game.powerUps = currentPowerUps
          game.scores = currentScores
        } else {
          // Final Game Over
          const finalScores: Record<PlayerId, number> = {}
          game.playerIds.forEach((id) => {
            finalScores[id] =
              (game.scores[id] || 0) + game.playerHands[id].length
          })

          const maxScore = Math.max(...Object.values(finalScores))
          const winners = game.playerIds.filter(
            (id) => finalScores[id] === maxScore
          )

          if (winners.length === 1) game.winner = winners[0]

          Rune.gameOver({
            players: Object.fromEntries(
              game.playerIds.map((id) => [
                id,
                winners.includes(id) ? "WON" : "LOST",
              ])
            ),
          })
        }
      } else {
        const currentIndex = game.playerIds.indexOf(playerId)
        const nextPlayerId =
          game.playerIds[(currentIndex + 1) % game.playerIds.length]
        game.turn = nextPlayerId
        game.phase = "draw"
        game.currentDrawnCard = null

        // Clear shield for the player who is about to start their turn
        game.shieldedPlayers = game.shieldedPlayers.filter(
          (id) => id !== nextPlayerId
        )
      }
    },
    usePowerUp: (
      type: string,
      { game, playerId }: { game: GameState; playerId: PlayerId }
    ) => {
      const idx = game.powerUps[playerId].indexOf(type)
      if (idx === -1) return

      game.powerUps[playerId].splice(idx, 1)

      if (type === "shuffle") {
        game.centerCards = shuffle(game.centerCards)
      } else if (type === "peek") {
        // Peek logic will be handled visually by client using this state
        game.lastResult = {
          success: true,
          emoji: "👁️",
          from: { type: "center", index: 0, id: -1 },
          powerUpUsed: "peek",
        }
      } else if (type === "shield") {
        game.shieldedPlayers.push(playerId)
      }
    },
  },
  events: {
    playerJoined: (playerId: PlayerId, { game }: { game: GameState }) => {
      game.playerIds.push(playerId)
      game.playerHands[playerId] = []
      if (game.scores[playerId] === undefined) {
        game.scores[playerId] = 0
      }
      if (game.powerUps[playerId] === undefined) {
        game.powerUps[playerId] = []
      }
      if (game.streaks[playerId] === undefined) {
        game.streaks[playerId] = 0
      }
    },
    playerLeft: (playerId: PlayerId, { game }: { game: GameState }) => {
      const hand = game.playerHands[playerId] || []
      hand.forEach((emoji) => {
        game.centerCards.push({
          id: game.nextCardId++,
          emoji,
        })
      })
      game.centerCards = shuffle(game.centerCards)
      delete game.playerHands[playerId]
      // scores, streaks, powerUps can remain or be deleted depending on game rules
      // For now, we'll keep them in case of re-join logic, but removing them is also fine.
      // Typical Rune implementation removes player from arrays.

      const playerIndex = game.playerIds.indexOf(playerId)
      if (playerIndex !== -1) {
        game.playerIds.splice(playerIndex, 1)
        if (game.turn === playerId && game.playerIds.length > 0) {
          game.turn = game.playerIds[playerIndex % game.playerIds.length]
          game.phase = "draw"
          game.currentDrawnCard = null
        }
      }
    },
  },
}
if (typeof Rune !== "undefined") {
  Rune.initLogic(logic)
}
