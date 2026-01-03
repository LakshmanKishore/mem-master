import "./styles.css"
import { PlayerId } from "rune-sdk"
import selectSoundAudio from "./assets/select.wav"
import { GameState } from "./logic.ts"

const board = document.getElementById("board")!
const sequenceContainer = document.getElementById("sequence")!
const playersSection = document.getElementById("playersSection")!

const selectSound = new Audio(selectSoundAudio)

let cards: HTMLDivElement[] = []
let sequenceElements: HTMLDivElement[] = []
let playerElements: HTMLLIElement[] = []

function initUI(game: GameState) {
  // Clear existing
  board.innerHTML = ""
  sequenceContainer.innerHTML = ""
  playersSection.innerHTML = ""

  // Build Sequence
  sequenceElements = game.sequence.map((emoji) => {
    const el = document.createElement("div")
    el.className = "seq-item"
    el.innerText = emoji
    sequenceContainer.appendChild(el)
    return el
  })

  // Build Board (3x3)
  cards = game.board.map((emoji, index) => {
    const card = document.createElement("div")
    card.className = "card"
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-front">?</div>
        <div class="card-back">${emoji}</div>
      </div>
    `
    card.addEventListener("click", () => {
      // Prevent clicking if already revealed or not my turn (visual feedback only, logic protects too)
      // We rely on Rune.actions to handle validity
      Rune.actions.flipCard(index)
    })
    board.appendChild(card)
    return card
  })
}

function updatePlayers(game: GameState, yourPlayerId: PlayerId | undefined) {
  // Re-render players if list changed or just update classes
  // For simplicity, let's re-render if count differs, otherwise update
  if (playerElements.length !== game.playerIds.length) {
    playersSection.innerHTML = ""
    playerElements = game.playerIds.map((playerId) => {
      const player = Rune.getPlayerInfo(playerId)
      const li = document.createElement("li")
      li.innerHTML = `
        <div class="avatar-container">
           <img src="${player.avatarUrl}" />
        </div>
        <span class="name">${
          player.displayName +
          (player.playerId === yourPlayerId ? ` <br>${Rune.t("(You)")}` : "")
        }</span>
      `
      playersSection.appendChild(li)
      return li
    })
  }

  // Update Turn styling
  game.playerIds.forEach((id, i) => {
    const li = playerElements[i]
    if (li) {
      if (id === game.turn && !game.winner) {
        li.classList.add("active-turn")
      } else {
        li.classList.remove("active-turn")
      }
    }
  })
}

Rune.initClient({
  onChange: ({ game, yourPlayerId, action }) => {
    // Initialize if needed (or if game restarted/desynced drastically)
    if (cards.length === 0) {
      initUI(game)
    }

    // Update Sequence UI
    sequenceElements.forEach((el, i) => {
      el.classList.remove("found", "target")
      if (i < game.currentStep) {
        el.classList.add("found")
      } else if (i === game.currentStep) {
        el.classList.add("target")
      }
    })

    // Update Board UI
    cards.forEach((card, i) => {
      const isRevealed = game.revealed[i]
      const isWrong = game.lastWrongMove?.cardIndex === i

      if (isRevealed || isWrong) {
        card.classList.add("flipped")
      } else {
        card.classList.remove("flipped")
      }

      if (isWrong) {
        card.classList.add("wrong")
      } else {
        card.classList.remove("wrong")
      }

      // Interaction cues
      const isMyTurn = game.turn === yourPlayerId
      if (isMyTurn && !isRevealed && !game.winner) {
        card.style.cursor = "pointer"
      } else {
        card.style.cursor = "default"
      }
    })

    // Update Players
    updatePlayers(game, yourPlayerId)

    // Play Sound
    if (action && action.name === "flipCard") {
      selectSound.play()
    }
  },
})
