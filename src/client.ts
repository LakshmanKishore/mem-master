import "./styles.css"
import { PlayerId } from "rune-sdk"
import { GameState, logic } from "./logic.ts"
import { initTestLab } from "./testLab"
import { scenarios } from "./scenarios"

// DOM Elements
const playersRing = document.getElementById("players-ring")!
const guessCardsRing = document.getElementById("guess-cards-ring")!
const deckStack = document.getElementById("deck-stack")!
const drawnRevealContainer = document.getElementById("drawn-reveal-container")!
const myHandContainer = document.getElementById("my-hand-container")!
const turnIndicator = document.getElementById("turn-indicator")!
const helpBtn = document.getElementById("help-btn")!
const helpOverlay = document.getElementById("help-overlay")!
const closeHelpBtn = document.getElementById("close-help")!

// Steal Modal Elements
const stealOverlay = document.getElementById("steal-overlay")!
const stealGrid = document.getElementById("steal-grid")!
const cancelStealBtn = document.getElementById("cancel-steal")!

// --- Audio Synthesizer ---
interface WindowWithAudio extends Window {
  webkitAudioContext: typeof AudioContext
}
const audioCtx = new (
  window.AudioContext ||
  (window as unknown as WindowWithAudio).webkitAudioContext
)()

function playSound(type: "draw" | "success" | "fail" | "steal") {
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  const now = audioCtx.currentTime
  if (type === "draw") {
    osc.type = "sine"
    osc.frequency.setValueAtTime(400, now)
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1)
    gain.gain.setValueAtTime(0.2, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
    osc.start(now)
    osc.stop(now + 0.1)
  } else if (type === "success") {
    osc.type = "sine"
    osc.frequency.setValueAtTime(600, now)
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2)
    gain.gain.setValueAtTime(0.3, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
    osc.start(now)
    osc.stop(now + 0.3)
  } else if (type === "fail") {
    osc.type = "sawtooth"
    osc.frequency.setValueAtTime(200, now)
    osc.frequency.linearRampToValueAtTime(100, now + 0.2)
    gain.gain.setValueAtTime(0.1, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
    osc.start(now)
    osc.stop(now + 0.3)
  } else if (type === "steal") {
    osc.type = "square"
    osc.frequency.setValueAtTime(500, now)
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.2)
    gain.gain.setValueAtTime(0.1, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
    osc.start(now)
    osc.stop(now + 0.2)
  }
}

let playerNodes: Record<PlayerId, HTMLElement> = {}
let guessCardElements: HTMLElement[] = []
let currentDrawnEmoji: string | null = null
let lastClickPos: { x: number; y: number } | null = null
let currentGame: GameState | null = null

// --- Initialization ---
helpBtn.onclick = () => helpOverlay.classList.remove("hidden")
closeHelpBtn.onclick = () => helpOverlay.classList.add("hidden")
cancelStealBtn.onclick = () => stealOverlay.classList.add("hidden")

document.addEventListener(
  "click",
  (e) => {
    lastClickPos = { x: e.clientX, y: e.clientY }
    setTimeout(() => (lastClickPos = null), 100)
  },
  true
)

function initUI(game: GameState, yourPlayerId: PlayerId | undefined) {
  playersRing.innerHTML = ""
  guessCardsRing.innerHTML = ""
  guessCardElements = []
  playerNodes = {}
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
    card.innerHTML = `<div class="card-inner"><div class="card-face back"></div><div class="card-face front"></div></div>`
    card.onclick = () => Rune.actions.pickCard({ type: "center", index: i })
    guessCardsRing.appendChild(card)
    guessCardElements.push(card)
  }
  const playerRadius = 45
  game.playerIds.forEach((id, index) => {
    const info = Rune.getPlayerInfo(id)
    if (!info) return
    const isMe = id === yourPlayerId
    const node = document.createElement("div")
    node.className = `player-node ${isMe ? "is-me" : ""}`
    const angle = (index * 360) / game.playerIds.length
    const x = 50 + playerRadius * Math.cos((angle - 90) * (Math.PI / 180))
    const y = 50 + playerRadius * Math.sin((angle - 90) * (Math.PI / 180))
    node.style.left = `${x}%`
    node.style.top = `${y}%`
    node.style.transform = `translate(-50%, -50%)`
    node.innerHTML = `<div class="avatar-wrapper"><img class="avatar-image" src="${info.avatarUrl}" /><div class="score-badge">0</div><div class="player-cards"></div></div><div class="player-name">${info.displayName}</div>`
    if (!isMe) {
      node.onclick = () => {
        if (!currentGame) return
        const hand = currentGame.playerHands[id] || []
        if (hand.length >= 1) openStealModal(id, hand.length, hand)
      }
    }
    playersRing.appendChild(node)
    playerNodes[id] = node
  })
  // Re-create deck structure with count
  deckStack.innerHTML = `<div class="deck-top">🎴</div><div id="deck-count">${game.deck.length}</div>`
  deckStack.onclick = () => Rune.actions.drawCard()
}

function openStealModal(
  targetPlayerId: PlayerId,
  cardCount: number,
  emojis: string[]
) {
  const player = Rune.getPlayerInfo(targetPlayerId)
  if (!player) return
  stealOverlay.querySelector("h2")!.textContent =
    `Steal from ${player.displayName}`
  stealGrid.innerHTML = ""
  for (let i = 0; i < cardCount; i++) {
    const card = document.createElement("div")
    card.className = "steal-option"
    card.innerHTML = `<span class="debug-hint">${emojis[i]}</span>`
    card.onclick = () => {
      Rune.actions.pickCard({
        type: "player",
        playerId: targetPlayerId,
        index: i,
      })
      stealOverlay.classList.add("hidden")
    }
    stealGrid.appendChild(card)
  }
  stealOverlay.classList.remove("hidden")
}

function updateUI(game: GameState, yourPlayerId: PlayerId | undefined) {
  const isMyTurn = game.turn === yourPlayerId
  const isPickPhase = game.phase === "pick" && isMyTurn
  const turnPlayer = Rune.getPlayerInfo(game.turn)
  let statusText = ""
  if (game.winner) statusText = "WINNER!"
  else if (isMyTurn)
    statusText =
      game.phase === "draw" ? "DRAW!" : `FIND ${game.currentDrawnCard}!`
  else statusText = "WAITING..."
  if (turnPlayer) {
    turnIndicator.innerHTML = `<img src="${turnPlayer.avatarUrl}" /><div><div class="turn-player-name">${isMyTurn ? "YOU" : turnPlayer.displayName}</div><div class="turn-action-text">${statusText}</div></div>`
  } else {
    turnIndicator.innerHTML = `<div><div class="turn-action-text">${statusText}</div></div>`
  }
  turnIndicator.classList.toggle("my-turn", isMyTurn)

  // Re-query deck count as it might be recreated by initUI
  const currentDeckCount = document.getElementById("deck-count")
  if (currentDeckCount)
    currentDeckCount.textContent = game.deck.length.toString()

  game.centerCards.forEach((emoji, i) => {
    const el = guessCardElements[i]
    if (!el) return
    const front = el.querySelector(".front") as HTMLElement
    const back = el.querySelector(".back") as HTMLElement
    const isEmpty = emoji === null
    const wasEmpty = el.classList.contains("empty")
    if (wasEmpty && !isEmpty) el.classList.remove("flipped", "shake")
    el.classList.toggle("empty", isEmpty)
    el.classList.toggle("interactive", isPickPhase && !isEmpty)
    if (emoji) {
      front.textContent = emoji
      back.innerHTML = `<span class="debug-hint">${emoji}</span>`
    } else {
      back.innerHTML = ""
    }
  })
  myHandContainer.innerHTML = ""
  game.playerIds.forEach((id) => {
    const node = playerNodes[id]
    if (!node) return
    node.classList.toggle("active-turn", id === game.turn)
    const scoreBadge = node.querySelector(".score-badge") as HTMLElement
    const hand = game.playerHands[id] || []
    if (scoreBadge) {
      scoreBadge.textContent = hand.length.toString()
      if (scoreBadge.getAttribute("data-prev") !== hand.length.toString()) {
        scoreBadge.style.transform = "scale(1.5)"
        setTimeout(() => (scoreBadge.style.transform = "scale(1)"), 200)
        scoreBadge.setAttribute("data-prev", hand.length.toString())
      }
    }
    const cardsDiv = node.querySelector(".player-cards") as HTMLElement
    if (cardsDiv)
      cardsDiv.innerHTML = hand
        .map((emoji) => `<span class="debug-hint-inline">${emoji}</span>`)
        .join("")
    if (id === yourPlayerId) {
      const totalCards = hand.length
      const cardSpacing = 60
      const startOffset = -((totalCards - 1) * cardSpacing) / 2
      hand.forEach((emoji, idx) => {
        const card = document.createElement("div")
        card.className = "hand-card"
        card.innerHTML = `<span class="debug-hint">${emoji}</span>`
        const xPos = startOffset + idx * cardSpacing
        card.style.transform = `translateX(-50%) translateX(${xPos}px)`
        card.style.zIndex = `${idx + 10}`
        card.onclick = (e) => {
          e.stopPropagation()
          Rune.actions.pickCard({ type: "player", playerId: id, index: idx })
        }
        myHandContainer.appendChild(card)
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
  card.textContent = emoji
  drawnRevealContainer.appendChild(card)
}

function getGhostCardPos(
  playerId: PlayerId,
  yourPlayerId: PlayerId | undefined
): { x: number; y: number } {
  if (playerId === yourPlayerId) {
    const rect = myHandContainer.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }
  const node = playerNodes[playerId]
  if (!node) return { x: 0, y: 0 }
  const avatar = node.querySelector(".avatar-wrapper") as HTMLElement
  if (!avatar) return { x: 0, y: 0 }
  const rect = avatar.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function spawnParticles(x: number, y: number, color: string) {
  for (let i = 0; i < 12; i++) {
    const p = document.createElement("div")
    p.className = "particle"
    p.style.position = "fixed"
    p.style.pointerEvents = "none"
    p.style.zIndex = "1000"
    p.style.background = color
    p.style.borderRadius = "50%"
    p.style.width = `${Math.random() * 8 + 6}px`
    p.style.height = p.style.width
    p.style.left = `${x}px`
    p.style.top = `${y}px`
    const speed = Math.random() * 100 + 50
    const angle = Math.random() * Math.PI * 2
    const tx = Math.cos(angle) * speed
    const ty = Math.sin(angle) * speed
    p.animate(
      [
        { transform: `translate(0, 0) scale(1)`, opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 },
      ],
      { duration: 600, easing: "ease-out" }
    ).onfinish = () => p.remove()
    document.body.appendChild(p)
  }
}

interface RuneAction {
  name: string
  playerId: PlayerId
  params: unknown
}

function animateAction(
  game: GameState,
  action: RuneAction,
  yourPlayerId: PlayerId | undefined
) {
  if (action.name === "pickCard") {
    // Cast params to access properties if needed in future, but for now just validate type
    void (action.params as {
      type: "center" | "player"
      index: number
      playerId?: PlayerId
    })
    const res = game.lastResult
    if (!res) return
    let startPos = { x: 0, y: 0 }
    let startFaceUp = false
    const isLocalAction = action.playerId === yourPlayerId
    if (res.from.type === "center") {
      const sourceEl = guessCardElements[res.from.index]
      if (sourceEl) {
        sourceEl.classList.add("flipped")
        startFaceUp = true
        if (!res.success) {
          sourceEl.classList.add("shake")
          setTimeout(() => sourceEl?.classList.remove("flipped", "shake"), 1000)
          if (res.to === "center" && res.penalisedPlayerId) {
            const emoji = game.currentDrawnCard
            if (emoji) {
              const pStart = getGhostCardPos(
                res.penalisedPlayerId,
                yourPlayerId
              )
              const ringRect = guessCardsRing.getBoundingClientRect()
              flyCard(
                emoji,
                pStart,
                {
                  x: ringRect.left + ringRect.width / 2,
                  y: ringRect.top + ringRect.height / 2,
                },
                false,
                false
              )
            }
          }
        } else {
          const rect = sourceEl.getBoundingClientRect()
          startPos = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          }
          spawnParticles(startPos.x, startPos.y, "#4ade80")
          setTimeout(() => sourceEl.classList.remove("flipped"), 500)
        }
      }
    } else {
      startFaceUp = false
      startPos =
        isLocalAction && lastClickPos
          ? lastClickPos
          : getGhostCardPos(res.from.playerId, yourPlayerId)
    }
    if (res.success || res.to === "center") {
      let destEl: HTMLElement | null = null
      if (res.to === "center") destEl = guessCardsRing
      else if (res.to)
        destEl = playerNodes[res.to as PlayerId]?.querySelector(
          ".avatar-wrapper"
        ) as HTMLElement
      if (startPos.x !== 0 && destEl) {
        const endRect = destEl.getBoundingClientRect()
        flyCard(
          res.emoji,
          startPos,
          {
            x: endRect.left + endRect.width / 2,
            y: endRect.top + endRect.height / 2,
          },
          !!res.success,
          startFaceUp
        )
      }
    }
  }
}

function flyCard(
  emoji: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  success: boolean,
  startFaceUp: boolean
) {
  const fly = document.createElement("div")
  fly.className = "flying-card"
  fly.innerHTML = `<div class="card-inner"><div class="card-face back"><span class="debug-hint">${emoji}</span></div><div class="card-face front">${emoji}</div></div>`
  fly.style.border = "none"
  fly.style.background = "transparent"
  fly.style.boxShadow = "none"
  fly.style.left = `${from.x}px`
  fly.style.top = `${from.y}px`
  document.body.appendChild(fly)
  const startRot = startFaceUp ? 180 : 0
  fly.firstElementChild!.animate(
    [
      { transform: `rotateY(${startRot}deg)` },
      { transform: `rotateY(180deg)`, offset: 0.2 },
      { transform: `rotateY(180deg)`, offset: 0.8 },
      { transform: `rotateY(0deg)` },
    ],
    { duration: 700, fill: "forwards" }
  )
  fly.animate(
    [
      {
        transform: `translate(-50%, -50%) scale(1)`,
        left: `${from.x}px`,
        top: `${from.y}px`,
      },
      { transform: `translate(-50%, -50%) scale(1.2)`, offset: 0.5 },
      {
        transform: `translate(-50%, -50%) scale(0.5)`,
        left: `${to.x}px`,
        top: `${to.y}px`,
      },
    ],
    { duration: 700, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }
  ).onfinish = () => {
    if (success) spawnParticles(to.x, to.y, "#facc15")
    fly.remove()
  }
}

// --- Test Lab Integration (Dev Only) ---
if (import.meta.env.DEV) {
  initTestLab({
    logic: logic,
    defaultPlayerId: "p1",
    scenarios: scenarios,
  })
}

Rune.initClient({
  onChange: ({ game, yourPlayerId, action, event }) => {
    currentGame = game
    if (
      Object.keys(playerNodes).length !== game.playerIds.length ||
      event?.name === "playerJoined" ||
      event?.name === "playerLeft"
    ) {
      initUI(game, yourPlayerId)
    }
    updateUI(game, yourPlayerId)
    if (action) {
      if (action.name === "drawCard") playSound("draw")
      else if (action.name === "pickCard") {
        if (game.lastResult?.success) playSound("success")
        else playSound("fail")
      }
      animateAction(game, action as RuneAction, yourPlayerId)
    }
  },
})
