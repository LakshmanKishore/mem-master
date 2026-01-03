import type { PlayerId, RuneClient } from "rune-sdk"

const EMOJIS = [
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
  sequence: string[]
  board: string[]
  revealed: boolean[]
  currentStep: number
  playerIds: PlayerId[]
  turn: PlayerId
  lastWrongMove: { cardIndex: number; player: PlayerId } | null
  winner: PlayerId | null
}

type GameActions = {
  flipCard: (cardIndex: number) => void
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

function shuffle<T>(array: T[]): T[] {
  const newArray = [...array]
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[newArray[i], newArray[j]] = [newArray[j], newArray[i]]
  }
  return newArray
}

function generateGame(playerIds: PlayerId[]) {
  const gameEmojis = shuffle(EMOJIS).slice(0, 9)
  // sequence is the order they must be found
  const sequence = [...gameEmojis]
  // board is the physical location (shuffled)
  const board = shuffle(gameEmojis)

  return {
    sequence,
    board,
    revealed: new Array(9).fill(false),
    currentStep: 0,
    playerIds,
    turn: playerIds[0],
    lastWrongMove: null,
    winner: null,
  }
}

Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 6,
  setup: (allPlayerIds) => generateGame(allPlayerIds),
  actions: {
    flipCard: (cardIndex, { game, playerId }) => {
      if (game.winner || game.revealed[cardIndex] || game.turn !== playerId) {
        return
      }

      // Clear previous wrong move state on new valid action
      game.lastWrongMove = null

      const clickedEmoji = game.board[cardIndex]
      const targetEmoji = game.sequence[game.currentStep]

      if (clickedEmoji === targetEmoji) {
        // Correct guess
        game.revealed[cardIndex] = true
        game.currentStep++

        if (game.currentStep === 9) {
          game.winner = playerId
          Rune.gameOver({
            players: {
              [playerId]: "WON",
              ...Object.fromEntries(
                game.playerIds
                  .filter((id) => id !== playerId)
                  .map((id) => [id, "LOST"])
              ),
            },
          })
        }
        // Player keeps turn on success
      } else {
        // Wrong guess
        game.lastWrongMove = { cardIndex, player: playerId }

        // Reset progress on failure
        game.revealed.fill(false)
        game.currentStep = 0

        // Pass turn
        const currentIndex = game.playerIds.indexOf(playerId)
        const nextIndex = (currentIndex + 1) % game.playerIds.length
        game.turn = game.playerIds[nextIndex]
      }
    },
  },
  events: {
    playerJoined: (playerId, { game }) => {
      game.playerIds.push(playerId)
    },
    playerLeft: (playerId, { game }) => {
      const playerIndex = game.playerIds.indexOf(playerId)
      if (playerIndex === -1) return

      game.playerIds.splice(playerIndex, 1)

      // If the current turn player left, pass to next
      if (game.turn === playerId) {
        // The index we just removed is now occupied by the next player (or we need to wrap)
        // Since splice shifted elements, playerIds[playerIndex] is the next player.
        // We just need to handle wrap around if they were the last one.
        if (game.playerIds.length > 0) {
          game.turn = game.playerIds[playerIndex % game.playerIds.length]
        }
      }
    },
  },
})
