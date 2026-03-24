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
const roundIndicator = document.getElementById("round-indicator")!
const streakIndicator = document.getElementById("streak-indicator")!
const streakCount = document.getElementById("streak-count")!
const powerupsWrapper = document.getElementById("powerups-wrapper")!
const powerupsContainer = document.getElementById("powerups-container")!
const statusToast = document.getElementById("status-toast")!

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

function playSound(type: "draw" | "success" | "fail" | "steal" | "powerup") {
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
  } else if (type === "powerup") {
    osc.type = "triangle"
    osc.frequency.setValueAtTime(800, now)
    osc.frequency.exponentialRampToValueAtTime(1600, now + 0.4)
    gain.gain.setValueAtTime(0.2, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4)
    osc.start(now)
    osc.stop(now + 0.4)
  }
}

let playerNodes: Record<PlayerId, HTMLElement> = {}
const guessCardMap: Map<number, HTMLElement> = new Map() // cardId -> element
let currentDrawnEmoji: string | null = null
let lastClickPos: { x: number; y: number } | null = null
let currentGame: GameState | null = null
let currentRound: number = 0

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
  guessCardMap.clear()
  playerNodes = {}

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
    node.innerHTML = `<div class="player-name">${info.displayName}</div><div class="avatar-wrapper"><img class="avatar-image" src="${info.avatarUrl}" /><div class="score-badge">0</div><div class="player-cards"></div><div class="shield-icon hidden">🛡️</div></div>`
    if (!isMe) {
      node.onclick = () => {
        if (currentGame?.phase !== "pick" || currentGame.turn !== yourPlayerId)
          return
        const hand = currentGame.playerHands[id] || []
        if (hand.length >= 1)
          openStealModal(id, hand.length, hand, yourPlayerId)
      }
    }
    playersRing.appendChild(node)
    playerNodes[id] = node
  })
  // Re-create deck structure with count
  deckStack.innerHTML = `<div class="deck-top">🎴</div><div id="deck-count">${game.deck.length}</div>`
  deckStack.onclick = () => {
    if (currentGame?.phase === "draw" && currentGame.turn === yourPlayerId) {
      Rune.actions.drawCard()
    }
  }
}

function openStealModal(
  targetPlayerId: PlayerId,
  cardCount: number,
  emojis: string[],
  yourPlayerId: PlayerId | undefined
) {
  const player = Rune.getPlayerInfo(targetPlayerId)
  if (!player) return
  stealOverlay.querySelector("h2")!.textContent =
    `Steal from ${player.displayName}`
  stealGrid.innerHTML = ""
  for (let i = 0; i < cardCount; i++) {
    const card = document.createElement("div")
    card.className = "steal-option"
    card.innerHTML = ``
    card.onclick = () => {
      if (currentGame?.phase === "pick" && currentGame.turn === yourPlayerId) {
        Rune.actions.pickCard({
          type: "player",
          playerId: targetPlayerId,
          index: i,
        })
        stealOverlay.classList.add("hidden")
      }
    }
    stealGrid.appendChild(card)
  }
  stealOverlay.classList.remove("hidden")
}

function renderCenterCards(
  game: GameState,
  isPickPhase: boolean,
  yourPlayerId: PlayerId | undefined
) {
  const count = game.centerCards.length
  const cardRadius = 25

  // 1. Identify which cards stayed, which are new, and which are gone
  const currentIds = new Set(game.centerCards.map((c) => c.id))

  // 2. Remove DOM elements for cards that are gone
  for (const [id, el] of guessCardMap.entries()) {
    if (!currentIds.has(id)) {
      // Small delay to allow flip animation to finish if it was just picked
      setTimeout(() => {
        if (el.parentNode === guessCardsRing) {
          guessCardsRing.removeChild(el)
        }
      }, 500)
      guessCardMap.delete(id)
    }
  }

  // 3. Update positions and content for current cards
  game.centerCards.forEach((card, i) => {
    let el = guessCardMap.get(card.id)

    if (!el) {
      // Create new element for new card (e.g. penalty return)
      el = document.createElement("div")
      el.className = "guess-card"
      el.innerHTML = `<div class="card-inner"><div class="card-face back"></div><div class="card-face front"></div></div>`
      guessCardsRing.appendChild(el)
      guessCardMap.set(card.id, el)
    }

    // Calculate position based on current count and index
    const angle = (i * 360) / count
    const x = 50 + cardRadius * Math.cos((angle - 90) * (Math.PI / 180))
    const y = 50 + cardRadius * Math.sin((angle - 90) * (Math.PI / 180))

    // Set stable styles (transitions are in CSS)
    el.style.left = `${x}%`
    el.style.top = `${y}%`
    el.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`

    // Ensure no stale state
    el.classList.remove("flipped", "shake")

    // Update click handler with fresh index
    el.onclick = () => {
      if (currentGame?.phase === "pick" && currentGame.turn === yourPlayerId) {
        Rune.actions.pickCard({ type: "center", index: i })
      }
    }

    // Update content
    const front = el.querySelector(".front") as HTMLElement
    const back = el.querySelector(".back") as HTMLElement
    el.classList.toggle("interactive", isPickPhase)
    front.textContent = card.emoji
    back.innerHTML = ``
  })
}

function updateUI(game: GameState, yourPlayerId: PlayerId | undefined) {
  const isMyTurn = game.turn === yourPlayerId
  const isPickPhase = game.phase === "pick" && isMyTurn
  const turnPlayer = Rune.getPlayerInfo(game.turn)

  if (currentRound !== game.round) {
    currentRound = game.round
    roundIndicator.textContent = `ROUND ${game.round}`
    roundIndicator.classList.add("pop")
    setTimeout(() => roundIndicator.classList.remove("pop"), 1000)
    // Dynamic BG based on round
    const colors = ["#a5f3fc", "#c4b5fd", "#f9a8d4"]
    document.body.style.setProperty(
      "--bg-gradient",
      `linear-gradient(135deg, ${colors[game.round - 1]} 0%, #c4b5fd 100%)`
    )
  }

  // Update Streak
  const myStreak = yourPlayerId ? game.streaks[yourPlayerId] || 0 : 0
  if (myStreak > 0) {
    streakIndicator.classList.remove("hidden")
    streakCount.textContent = myStreak.toString()
  } else {
    streakIndicator.classList.add("hidden")
  }

  // Update Power-ups
  powerupsContainer.innerHTML = ""
  const myPowerUps = yourPlayerId ? game.powerUps[yourPlayerId] || [] : []
  if (myPowerUps.length > 0) {
    powerupsWrapper.classList.remove("hidden")
    myPowerUps.forEach((type) => {
      const btn = document.createElement("button")
      btn.className = "powerup-btn"
      const emoji = type === "shuffle" ? "🌀" : type === "peek" ? "👁️" : "🛡️"
      btn.innerHTML = `<span>${emoji}</span> ${type.toUpperCase()}`
      btn.onclick = () => Rune.actions.usePowerUp(type)
      powerupsContainer.appendChild(btn)
    })
  } else {
    powerupsWrapper.classList.add("hidden")
  }

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

  renderCenterCards(game, isPickPhase, yourPlayerId)

  myHandContainer.innerHTML = ""
  game.playerIds.forEach((id) => {
    const node = playerNodes[id]
    if (!node) return
    node.classList.toggle("active-turn", id === game.turn)

    // Shield
    const shieldIcon = node.querySelector(".shield-icon")
    if (shieldIcon) {
      shieldIcon.classList.toggle("hidden", !game.shieldedPlayers.includes(id))
    }

    const scoreBadge = node.querySelector(".score-badge") as HTMLElement
    const hand = game.playerHands[id] || []
    if (scoreBadge) {
      const currentScore = (game.scores[id] || 0) + hand.length
      scoreBadge.textContent = currentScore.toString()
      if (scoreBadge.getAttribute("data-prev") !== currentScore.toString()) {
        scoreBadge.style.transform = "scale(1.5)"
        setTimeout(() => (scoreBadge.style.transform = "scale(1)"), 200)
        scoreBadge.setAttribute("data-prev", currentScore.toString())
      }
    }
    const cardsDiv = node.querySelector(".player-cards") as HTMLElement
    if (cardsDiv)
      cardsDiv.innerHTML = hand
        .map(
          (_, idx) =>
            `<div class="mini-card ${idx === hand.length - 1 ? "newest" : ""}"></div>`
        )
        .join("")
    if (id === yourPlayerId) {
      const totalCards = hand.length
      const cardSpacing = 60
      const startOffset = -((totalCards - 1) * cardSpacing) / 2
      hand.forEach((emoji, idx) => {
        const card = document.createElement("div")
        card.className = "hand-card"
        card.innerHTML = ``
        const xPos = startOffset + idx * cardSpacing
        card.style.transform = `translateX(-50%) translateX(${xPos}px)`
        card.style.zIndex = `${idx + 10}`
        card.onclick = (e) => {
          e.stopPropagation()
          if (
            currentGame?.phase === "pick" &&
            currentGame.turn === yourPlayerId
          ) {
            Rune.actions.pickCard({ type: "player", playerId: id, index: idx })
          }
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

function showToast(text: string, duration = 2000) {
  statusToast.textContent = text
  statusToast.classList.add("visible")
  setTimeout(() => statusToast.classList.remove("visible"), duration)
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
  if (action.name === "usePowerUp") {
    playSound("powerup")
    const type = action.params as string
    const player = Rune.getPlayerInfo(action.playerId)
    showToast(`${player?.displayName || "Player"} used ${type.toUpperCase()}!`)
    if (type === "peek") {
      guessCardMap.forEach((el) => {
        el.classList.add("flipped")
        setTimeout(() => el.classList.remove("flipped"), 1500)
      })
    }
    return
  }

  if (action.name === "pickCard") {
    // Cast params to access properties if needed in future, but for now just validate type
    void (action.params as {
      type: "center" | "player"
      index: number
      playerId?: PlayerId
    })
    const res = game.lastResult
    if (!res) return

    if (res.powerUpAwarded) {
      const player = Rune.getPlayerInfo(action.playerId)
      showToast(
        `${player?.displayName || "Player"} earned ${res.powerUpAwarded.toUpperCase()}!`
      )
      playSound("powerup")
    }

    let startPos = { x: 0, y: 0 }
    let startFaceUp = false
    const isLocalAction = action.playerId === yourPlayerId

    if (res.emoji === "🛡️") {
      // Shield block animation
      const targetNode =
        playerNodes[(action.params as { playerId: PlayerId }).playerId]
      if (targetNode) {
        targetNode.classList.add("shake")
        showToast("SHIELDED! 🛡️")
        setTimeout(() => targetNode.classList.remove("shake"), 500)
      }
      return
    }

    if (res.from.type === "center") {
      const sourceEl = guessCardMap.get(res.from.id)
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
  fly.innerHTML = `<div class="card-inner"><div class="card-face back"></div><div class="card-face front">${emoji}</div></div>`
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
