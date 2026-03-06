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

  // 1. Create 9 Guess Cards in a Circle (Inner Ring)
  // Radius is 25% of the 95vmin container
  const cardRadius = 25 
  for (let i = 0; i < 9; i++) {
    const angle = (i * 360) / 9
    const x = 50 + cardRadius * Math.cos((angle - 90) * (Math.PI / 180))
    const y = 50 + cardRadius * Math.sin((angle - 90) * (Math.PI / 180))

    const card = document.createElement("div")
    card.className = "guess-card"
    card.style.left = `${x}%`
    card.style.top = `${y}%`
    card.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`
    
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

  // 2. Create Players Ring (Outer Ring)
  // Radius is 45% of the 95vmin container (just inside edge)
  const playerRadius = 45
  game.playerIds.forEach((id, index) => {
    const info = Rune.getPlayerInfo(id)
    const node = document.createElement("div")
    node.className = "player-node"
    
    const angle = (index * 360) / game.playerIds.length
    const x = 50 + playerRadius * Math.cos((angle - 90) * (Math.PI / 180))
    const y = 50 + playerRadius * Math.sin((angle - 90) * (Math.PI / 180))
    
    node.style.left = `${x}%`
    node.style.top = `${y}%`
    node.style.transform = `translate(-50%, -50%)`

    node.innerHTML = `
      <div class="avatar-wrapper">
        <img class="avatar-image" src="${info.avatarUrl}" />
      </div>
      <div class="player-name">${info.displayName}</div>
      <div class="player-cards"></div>
    `
    playersRing.appendChild(node)
    playerNodes[id] = node
  })

  // Deck visual setup
  deckStack.innerHTML = `<div class="deck-top">🎴</div>`
  deckStack.onclick = () => Rune.actions.drawCard()
}

// --- Particles VFX ---
function spawnParticles(x: number, y: number, color: string) {
  for (let i = 0; i < 12; i++) {
    const p = document.createElement("div")
    p.style.position = "fixed"
    p.style.pointerEvents = "none"
    p.style.zIndex = "1000"
    p.style.background = color
    p.style.borderRadius = "50%"
    p.style.width = `${Math.random() * 8 + 6}px`
    p.style.height = p.style.width
    p.style.left = `${x}px`
    p.style.top = `${y}px`
    
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 100 + 50
    const tx = Math.cos(angle) * speed
    const ty = Math.sin(angle) * speed
    
    p.animate([
      { transform: `translate(0, 0) scale(1)`, opacity: 1 },
      { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 }
    ], { duration: 600, easing: 'ease-out' }).onfinish = () => p.remove()
    
    document.body.appendChild(p)
  }
}

// --- Update Logic ---

function updateUI(game: GameState, yourPlayerId: PlayerId | undefined) {
  const isMyTurn = game.turn === yourPlayerId

  // Status & Turn
  const turnPlayer = Rune.getPlayerInfo(game.turn)
  let statusText = ""
  if (game.winner) statusText = "WINNER!"
  else if (isMyTurn) statusText = game.phase === "draw" ? "DRAW!" : `FIND ${game.currentDrawnCard}!`
  else statusText = "WAITING..."

  turnIndicator.innerHTML = `
    <img src="${turnPlayer.avatarUrl}" />
    <div>
      <div class="turn-player-name">${isMyTurn ? "YOU" : turnPlayer.displayName}</div>
      <div class="turn-action-text">${statusText}</div>
    </div>
  `
  turnIndicator.classList.toggle("my-turn", isMyTurn)

  // Center Cards
  game.centerCards.forEach((emoji, i) => {
    const el = guessCardElements[i]
    if (!el) return
    const front = el.querySelector(".front") as HTMLElement
    el.classList.toggle("empty", emoji === null)
    if (emoji) front.innerText = emoji
  })

  // Players & Hands
  game.playerIds.forEach((id) => {
    const node = playerNodes[id]
    if (!node) return
    node.classList.toggle("active-turn", id === game.turn)
    
    const cardsContainer = node.querySelector(".player-cards") as HTMLElement
    const hand = game.playerHands[id] || []

    // Re-render hand if count changes
    if (cardsContainer.children.length !== hand.length) {
      cardsContainer.innerHTML = ""
      const totalCards = hand.length
      // Calculate Fan Angle
      const fanSpread = Math.min(totalCards * 15, 60) // Max 60 deg spread
      const startAngle = -fanSpread / 2

      hand.forEach((_, idx) => {
        const card = document.createElement("div")
        card.className = "hand-card"
        
        // Fan Logic
        const step = totalCards > 1 ? fanSpread / (totalCards - 1) : 0
        const angle = startAngle + (step * idx)
        const yOffset = Math.abs(angle) * 0.4
        
        card.style.transform = `translateX(-50%) rotate(${angle}deg) translateY(${yOffset}px)`
        card.style.zIndex = `${idx}`

        card.onclick = (e) => {
          e.stopPropagation()
          Rune.actions.pickCard({ type: "player", playerId: id, index: idx })
        }
        cardsContainer.appendChild(card)
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
          spawnParticles(rect.left + rect.width/2, rect.top + rect.height/2, "#4ade80")
        }
      }
    } else {
      // Animate from player hand
      const node = playerNodes[res.from.playerId]
      const handContainer = node?.querySelector(".player-cards")
      sourceEl = handContainer?.children[res.from.index] as HTMLElement
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
  fly.style.border = success ? "4px solid #4ade80" : "4px solid white"
  
  fly.style.left = `${from.x}px`
  fly.style.top = `${from.y}px`
  document.body.appendChild(fly)

  // Force reflow
  fly.offsetHeight

  fly.animate([
    { transform: `translate(-50%, -50%) scale(1) rotate(0deg)`, left: `${from.x}px`, top: `${from.y}px` },
    { transform: `translate(-50%, -50%) scale(0.5) rotate(360deg)`, left: `${to.x}px`, top: `${to.y}px` }
  ], { duration: 600, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }).onfinish = () => {
    if (success) spawnParticles(to.x, to.y, "#facc15")
    fly.remove()
  }
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
