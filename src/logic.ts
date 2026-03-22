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
  centerCards: (string | null)[] // 9 slots, can be null
  playerHands: Record<PlayerId, string[]>
  currentDrawnCard: string | null
  lastResult: {
    success: boolean
    emoji: string
    from:
      | { type: "center"; index: number }
      | { type: "player"; playerId: PlayerId; index: number }
    to?: PlayerId | "center"
    penalisedPlayerId?: PlayerId
  } | null
  winner: PlayerId | null
}

type GameActions = {
  drawCard: () => void
  pickCard: (
    target:
      | { type: "center"; index: number }
      | { type: "player"; playerId: PlayerId; index: number }
  ) => void
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

export function generateGame(playerIds: PlayerId[]): GameState {
  const gameEmojis = shuffle(EMOJIS).slice(0, 9)

  // Center starts with 9 cards
  const centerCards = [...gameEmojis]

  // Deck count scales
  const deckSize = 10 + playerIds.length * 5
  const deckPool: string[] = []
  // Use a balanced pool to ensure all emojis appear somewhat equally
  for (let i = 0; i < deckSize; i++) {
    deckPool.push(gameEmojis[i % gameEmojis.length])
  }
  const deck = shuffle(deckPool)

  const playerHands: Record<PlayerId, string[]> = {}
  playerIds.forEach((id) => {
    playerHands[id] = []
  })

  return {
    playerIds,
    turn: playerIds[0],
    phase: "draw",
    deck,
    centerCards,
    playerHands,
    currentDrawnCard: null,
    lastResult: null,
    winner: null,
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
        const centerEmojis = game.centerCards.filter(
          (c): c is string => c !== null
        )

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

      if (target.type === "center") {
        pickedEmoji = game.centerCards[target.index]
      } else {
        const targetHand = game.playerHands[target.playerId]
        pickedEmoji = targetHand ? targetHand[target.index] : null
      }

      if (!pickedEmoji) return

      const isMatch = pickedEmoji === game.currentDrawnCard

      if (isMatch) {
        // SUCCESS: Card goes to current player
        if (target.type === "center") {
          game.centerCards[target.index] = null
        } else {
          game.playerHands[target.playerId].splice(target.index, 1)
          // Shuffle the target player's hand since they lost a card
          game.playerHands[target.playerId] = shuffle(
            game.playerHands[target.playerId]
          )
        }

        game.playerHands[playerId].push(pickedEmoji)
        game.playerHands[playerId] = shuffle(game.playerHands[playerId])

        game.lastResult = {
          success: true,
          emoji: pickedEmoji,
          from: target,
          to: playerId,
        }
      } else {
        // FAIL: Only penalty if the CURRENT player had the matching card
        const hand = game.playerHands[playerId]
        const matchIndex = hand.indexOf(game.currentDrawnCard!)

        if (matchIndex !== -1) {
          const emoji = hand.splice(matchIndex, 1)[0]

          // Find first empty slot in center
          const emptyIndex = game.centerCards.indexOf(null)
          if (emptyIndex !== -1) {
            game.centerCards[emptyIndex] = emoji
          } else {
            game.centerCards.push(emoji)
          }

          game.playerHands[playerId] = shuffle(game.playerHands[playerId])

          game.lastResult = {
            success: false,
            emoji: pickedEmoji,
            from: target,
            to: "center",
            penalisedPlayerId: playerId,
          }
        } else {
          // No match in hand, just a normal fail
          game.lastResult = {
            success: false,
            emoji: pickedEmoji,
            from: target,
          }
        }
      }

      // Check for game over: deck is empty OR center is empty
      const isCenterEmpty = game.centerCards.every((c) => c === null)
      if (game.deck.length === 0 || isCenterEmpty) {
        const winners = game.playerIds.filter((id) => {
          const score = game.playerHands[id].length
          const maxScore = Math.max(
            ...game.playerIds.map((pid) => game.playerHands[pid].length)
          )
          return score === maxScore
        })

        if (winners.length === 1) game.winner = winners[0]

        Rune.gameOver({
          players: Object.fromEntries(
            game.playerIds.map((id) => [
              id,
              winners.includes(id) ? "WON" : "LOST",
            ])
          ),
        })
      } else {
        const currentIndex = game.playerIds.indexOf(playerId)
        game.turn = game.playerIds[(currentIndex + 1) % game.playerIds.length]
        game.phase = "draw"
        game.currentDrawnCard = null
      }
    },
  },
  events: {
    playerJoined: (playerId: PlayerId, { game }: { game: GameState }) => {
      game.playerIds.push(playerId)
      game.playerHands[playerId] = []
    },
    playerLeft: (playerId: PlayerId, { game }: { game: GameState }) => {
      const hand = game.playerHands[playerId] || []
      hand.forEach((emoji) => {
        const nullIndex = game.centerCards.indexOf(null)
        if (nullIndex !== -1) game.centerCards[nullIndex] = emoji
        else game.centerCards.push(emoji)
      })
      delete game.playerHands[playerId]

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
