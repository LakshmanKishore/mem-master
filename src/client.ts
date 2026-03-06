import "./styles.css"
import { PlayerId } from "rune-sdk"
import selectSoundAudio from "./assets/select.wav"
import { GameState } from "./logic.ts"

// DOM Elements
const playersRing = document.getElementById("players-ring")!
const guessCardsRing = document.getElementById("guess-cards-ring")!
const deckStack = document.getElementById("deck-stack")!
const drawnRevealContainer = document.getElementById("drawn-reveal-container")!
const turnIndicator = document.getElementById("turn-indicator")!
const helpBtn = document.getElementById("help-btn")!
const helpOverlay = document.getElementById("help-overlay")!
const closeHelpBtn = document.getElementById("close-help")!

const selectSound = new Audio(selectSoundAudio)

let playerNodes: Record<PlayerId, HTMLElement> = {}
let guessCardElements: HTMLElement[] = []
let currentDrawnEmoji: string | null = null

// --- Initialization ---

helpBtn.onclick = () => helpOverlay.classList.remove("hidden")
closeHelpBtn.onclick = () => helpOverlay.classList.add("hidden")

function initUI(game: GameState) {
  playersRing.innerHTML = ""
  guessCardsRing.innerHTML = ""
  guessCardElements = []
  playerNodes = {}

  // 1. Create Deck layers for 3D depth
  deckStack.innerHTML = `
    <div class="deck-layer"></div>
    <div class="deck-layer"></div>
    <div class="deck-layer"></div>
    <div class="deck-top">🎴</div>
  `

  // 2. Create 9 Guess Cards in a Circle
  const radius = 150
  for (let i = 0; i < 9; i++) {
    const angle = (i * 360) / 9
    const x = radius * Math.cos((angle - 90) * (Math.PI / 180))
    const y = radius * Math.sin((angle - 90) * (Math.PI / 180))

    const card = document.createElement("div")
    card.className = "guess-card"
    card.style.left = `calc(50% + ${x}px)`
    card.style.top = `calc(50% + ${y}px)`
    card.style.setProperty("--base-rotate", `${angle}deg`)
    
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-face back"></div>
        <div class="card-face front"></div>
      </div>
    `
    card.onclick = () => Rune.actions.pickCard({ type: "center", index: i })
    guessCardsRing.appendChild(card)
    guessCardElements.push(card)
  }

  // 3. Create Players around the edge
  game.playerIds.forEach((id, index) => {
    const info = Rune.getPlayerInfo(id)
    const node = document.createElement("div")
    node.className = "player-node"
    
    const angle = (index * 360) / game.playerIds.length
    const dist = 43
    const x = 50 + dist * Math.cos((angle - 90) * (Math.PI / 180))
    const y = 50 + dist * Math.sin((angle - 90) * (Math.PI / 180))
    
    node.style.left = `${x}%`
    node.style.top = `${y}%`
    node.style.transform = `translate(-50%, -50%)`

    node.innerHTML = `
      <div class="avatar-wrapper">
        <img class="avatar-image" src="${info.avatarUrl}" />
      </div>
      <div class="player-info">
        <div class="player-name">${info.displayName}</div>
        <div class="card-count">0 CARDS</div>
      </div>
      <div class="player-cards" style="display:flex; gap:3px; margin-top:5px; height:20px;"></div>
    `
    playersRing.appendChild(node)
    playerNodes[id] = node
  })

  deckStack.onclick = () => Rune.actions.drawCard()
}

// --- Particles VFX ---
function spawnParticles(x: number, y: number, color: string) {
  for (let i = 0; i < 15; i++) {
    const p = document.createElement("div")
    p.className = "particle"
    p.style.background = color
    p.style.width = `${Math.random() * 8 + 4}px`
    p.style.height = p.style.width
    p.style.left = `${x}px`
    p.style.top = `${y}px`
    
    const tx = (Math.random() - 0.5) * 200
    const ty = (Math.random() - 0.5) * 200
    p.style.setProperty("--tx", `${tx}px`)
    p.style.setProperty("--ty", `${ty}px`)
    
    document.body.appendChild(p)
    setTimeout(() => p.remove(), 800)
  }
}

// --- Update Logic ---

function updateUI(game: GameState, yourPlayerId: PlayerId | undefined) {
  const isMyTurn = game.turn === yourPlayerId

  // Determine Status Text
  let statusText = ""
  if (game.winner) {
    statusText = "🏆 GAME OVER!"
  } else if (isMyTurn) {
    statusText = game.phase === "draw" ? "DRAW A CARD!" : `FIND ${game.currentDrawnCard}!`
  } else {
    statusText = "WAITING..."
  }

  // Update Turn Indicator (Merged with Status)
  const turnPlayer = Rune.getPlayerInfo(game.turn)
  turnIndicator.innerHTML = `
    <img src="${turnPlayer.avatarUrl}" />
    <div class="turn-text-group">
      <div class="turn-player-name">${isMyTurn ? "YOUR TURN" : turnPlayer.displayName + "'S TURN"}</div>
      <div class="turn-action-text">${statusText}</div>
    </div>
  `
  turnIndicator.classList.toggle("my-turn", isMyTurn)

  // Update Center Cards
  game.centerCards.forEach((emoji, i) => {
    const el = guessCardElements[i]
    if (!el) return
    const front = el.querySelector(".front") as HTMLElement
    el.classList.toggle("empty", emoji === null)
    if (emoji) front.innerText = emoji
  })

  // Update Players
  game.playerIds.forEach((id) => {
    const node = playerNodes[id]
    if (!node) return
    node.classList.toggle("active-turn", id === game.turn)
    
    const countEl = node.querySelector(".card-count") as HTMLElement
    const hand = game.playerHands[id] || []
    countEl.innerText = `${hand.length} CARDS`

    const cardsContainer = node.querySelector(".player-cards") as HTMLElement
    if (cardsContainer.children.length !== hand.length) {
      cardsContainer.innerHTML = ""
      hand.forEach((_, idx) => {
        const mini = document.createElement("div")
        mini.className = "mini-card"
        mini.onclick = (e) => {
          e.stopPropagation()
          Rune.actions.pickCard({ type: "player", playerId: id, index: idx })
        }
        cardsContainer.appendChild(mini)
      })
    }
  })

  document.body.classList.toggle("can-draw", game.phase === "draw" && isMyTurn)
  
  if (game.currentDrawnCard !== currentDrawnEmoji) {
    currentDrawnEmoji = game.currentDrawnCard
    renderDrawnReveal(currentDrawnEmoji)
  }
}

function renderDrawnReveal(emoji: string | null) {
  drawnRevealContainer.innerHTML = ""
  if (!emoji) return
  const card = document.createElement("div")
  card.className = "revealed-card"
  card.innerText = emoji
  drawnRevealContainer.appendChild(card)
}

function animateAction(game: GameState, action: any) {
  if (action.name === "pickCard") {
    const res = game.lastResult
    if (!res) return

    let sourceEl: HTMLElement | null = null
    if (res.from.type === "center") {
      sourceEl = guessCardElements[res.from.index]
      if (sourceEl) {
        sourceEl.classList.add("flipped")
        if (!res.success) {
          sourceEl.classList.add("shake")
          setTimeout(() => sourceEl?.classList.remove("flipped", "shake"), 1000)
        } else {
          const rect = sourceEl.getBoundingClientRect()
          spawnParticles(rect.left + rect.width/2, rect.top + rect.height/2, "#22c55e")
        }
      }
    } else {
      const node = playerNodes[res.from.playerId]
      sourceEl = node?.querySelector(".avatar-wrapper") as HTMLElement
    }

    if (res.success || res.to === "center") {
      let destEl: HTMLElement | null = null
      if (res.to === "center") destEl = guessCardsRing
      else if (res.to) destEl = playerNodes[res.to]?.querySelector(".avatar-wrapper") as HTMLElement

      if (sourceEl && destEl) {
        const start = sourceEl.getBoundingClientRect()
        const end = destEl.getBoundingClientRect()
        flyCard(res.emoji, 
          { x: start.left + start.width/2, y: start.top + start.height/2 },
          { x: end.left + end.width/2, y: end.top + end.height/2 },
          res.success
        )
      }
    }
  }
}

function flyCard(emoji: string, from: {x:number, y:number}, to: {x:number, y:number}, success: boolean) {
  const fly = document.createElement("div")
  fly.className = "flying-card"
  fly.innerText = emoji
  fly.style.background = "white"
  fly.style.borderRadius = "8px"
  fly.style.width = "60px"
  fly.style.height = "80px"
  fly.style.display = "flex"
  fly.style.alignItems = "center"
  fly.style.justifyContent = "center"
  fly.style.fontSize = "30px"
  fly.style.position = "fixed"
  fly.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)"
  if (success) fly.style.border = "3px solid #22c55e"
  
  fly.style.left = `${from.x}px`
  fly.style.top = `${from.y}px`
  document.body.appendChild(fly)

  fly.offsetHeight // reflow
  fly.style.transition = "all 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)"
  fly.style.left = `${to.x}px`
  fly.style.top = `${to.y}px`
  fly.style.transform = "translate(-50%, -50%) scale(0.2) rotate(720deg)"
  fly.style.opacity = "0"

  setTimeout(() => {
    if (success) spawnParticles(to.x, to.y, "#8b5cf6")
    fly.remove()
  }, 700)
}

Rune.initClient({
  onChange: ({ game, yourPlayerId, action, event }) => {
    if (Object.keys(playerNodes).length !== game.playerIds.length || event?.name === "playerJoined" || event?.name === "playerLeft") {
      initUI(game)
    }
    updateUI(game, yourPlayerId)
    if (action) {
      selectSound.play()
      animateAction(game, action)
    }
  },
})
