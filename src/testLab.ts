/**
 * Rune Test Lab (V8 - Sandbox Isolation)
 * Runs tests in an isolated iframe to protect the main game session.
 */
export interface TestLabConfig {
  logic: {
    setup: (ids: string[]) => unknown
    actions: Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (params: any, context: { game: any; playerId: string }) => void
    >
  }
  scenarios: Record<string, (lab: LabRunner) => Promise<void>>
  defaultPlayerId?: string
}

export interface LabRunner {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispatch: (actionName: string, params: any, playerId?: string) => void
  setState: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newState: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action?: { name: string; params: any; playerId: string }
  ) => void
  wait: (ms: number) => Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getState: () => any
  reset: (playerIds?: string[]) => void
  click: (element: HTMLElement | string, label?: string) => Promise<void>
  log: (msg: string) => void
  mode: "REAL" | "LOCAL"
}

interface RuneMock {
  getPlayerInfo: (id: string) => {
    playerId: string
    displayName: string
    avatarUrl: string
  }
  initClient: (params: {
    onChange: (data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      game: any
      yourPlayerId: string | undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      action?: { name: string; params: any; playerId: string }
      event?: { name: string }
    }) => void
  }) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: Record<string, (params: any) => void>
  gameOver: (res: unknown) => void
  invalidAction: () => void
}

declare global {
  interface Window {
    Rune?: RuneMock
  }
}

export function initTestLab(config: TestLabConfig) {
  const isSandbox =
    new URLSearchParams(window.location.search).get("rune_lab") === "true"

  if (isSandbox) {
    // --- CHILD: We are inside the Sandbox ---
    // Force Mock immediately before any other code runs
    runSandboxMode(config)
  } else {
    // --- PARENT: We are the Main Game ---
    // Just show the button to open the Sandbox
    setupLauncherUI()
  }
}

// ==========================================
// PARENT: Launcher UI
// ==========================================
function setupLauncherUI() {
  if (typeof document === "undefined") return

  const styleId = "rune-lab-launcher-style"
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style")
    style.id = styleId
    style.textContent = `
      #rune-lab-launcher { position: fixed; bottom: 10px; right: 10px; background: #334155; color: white; border: none; border-radius: 12px; padding: 8px 12px; font-size: 12px; font-weight: bold; cursor: pointer; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: transform 0.2s; }
      #rune-lab-launcher:hover { transform: translateY(-2px); }
      #rune-lab-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; flex-direction: column; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
      #rune-lab-modal.visible { opacity: 1; pointer-events: auto; }
      #rune-lab-frame { flex: 1; border: none; width: 100%; height: 100%; background: white; }
      #rune-lab-header { background: #1e293b; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; color: white; border-bottom: 1px solid #334155; }
      #rune-lab-title { font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 8px; }
      #rune-lab-close { background: #ef4444; border: none; color: white; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; }
      #rune-lab-close:hover { background: #dc2626; }
    `
    document.head.appendChild(style)
  }

  const btn = document.createElement("button")
  btn.id = "rune-lab-launcher"
  btn.textContent = "🧪 Test Lab"
  btn.title = "Open Isolation Sandbox"

  const modal = document.createElement("div")
  modal.id = "rune-lab-modal"
  modal.innerHTML = `
    <div id="rune-lab-header">
      <div id="rune-lab-title">🧪 Integration Sandbox</div>
      <button id="rune-lab-close">Close Sandbox</button>
    </div>
    <iframe id="rune-lab-frame"></iframe>
  `

  document.body.appendChild(btn)
  document.body.appendChild(modal)

  const frame = modal.querySelector("iframe") as HTMLIFrameElement

  btn.onclick = () => {
    modal.classList.add("visible")
    // Load the same game, but with the ?rune_lab=true flag
    if (!frame.src)
      frame.src = window.location.href.split("?")[0] + "?rune_lab=true"
  }

  modal.querySelector("#rune-lab-close")!.addEventListener("click", () => {
    modal.classList.remove("visible")
    // Optional: Reset frame to save memory, or keep it to save state?
    // Let's keep it running so you can toggle back and forth.
  })
}

// ==========================================
// CHILD: Sandbox Logic
// ==========================================
function runSandboxMode(config: TestLabConfig) {
  console.log(
    "%c[Test Lab] Sandbox Mode Active",
    "background: #22c55e; color: black; padding: 4px; font-weight: bold"
  )

  // 1. Force Mock Rune
  let currentState: unknown = null
  let onChangeCallback: (data: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    game: any
    yourPlayerId: string | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action?: { name: string; params: any; playerId: string }
    event?: { name: string }
  }) => void = () => {}
  const currentMe = config.defaultPlayerId || "p1"
  const players = ["p1", "p2", "p3", "p4", "p5", "p6"]

  const avatars = [
    "https://jiffy-production.rune.ai/avatar/336-334-350-344-364-356-273-570-566-310-112.png?v=3&cachebust=1",
    "https://jiffy-production.rune.ai/avatar/336-333-351-339-359-356-269-570-564-283-117-108.png?v=3&cachebust=1",
    "https://jiffy-production.rune.ai/avatar/107-336-333-349-340-360-356-276-575-569-281.png?v=3&cachebust=1",
    "https://jiffy-production.rune.ai/avatar/106-336-333-302-348-339-365-356-272-582-564-118.png?v=3&cachebust=1",
    "https://jiffy-production.rune.ai/avatar/103-336-335-670-339-362-356-271-578-569-480-477-280.png?v=3&cachebust=1",
    "https://jiffy-production.rune.ai/avatar/103-336-333-666-341-361-357-273-308-570-564-480-477.png?v=3&cachebust=1",
  ]

  const mockRune: RuneMock = {
    getPlayerInfo: (id: string) => {
      const idx = players.indexOf(id) % avatars.length
      return {
        playerId: id,
        displayName: id === currentMe ? "You (Tester)" : `Player ${id}`,
        avatarUrl: avatars[idx >= 0 ? idx : 0],
      }
    },
    initClient: ({
      onChange,
    }: {
      onChange: (data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        game: any
        yourPlayerId: string | undefined
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action?: { name: string; params: any; playerId: string }
        event?: { name: string }
      }) => void
    }) => {
      onChangeCallback = onChange
      currentState = config.logic.setup(players.slice(0, 2))
      setTimeout(
        () => onChange({ game: currentState, yourPlayerId: currentMe }),
        0
      )
    },
    actions: {},
    gameOver: (res: unknown) => console.log("[Sandbox] Game Over", res),
    invalidAction: () => {},
  }

  // Bind Actions
  Object.keys(config.logic.actions).forEach((name) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRune.actions[name] = (params: any) => {
      config.logic.actions[name](params, {
        game: currentState,
        playerId: currentMe,
      })
      onChangeCallback({
        game: currentState,
        yourPlayerId: currentMe,
        action: { name, params, playerId: currentMe },
      })
    }
  })

  // OVERWRITE Rune Global
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.Rune = mockRune as any

  // 2. Setup Runner
  let statusEl: HTMLElement | null = null

  const runner: LabRunner = {
    mode: "LOCAL",
    log: (msg) => {
      if (statusEl) statusEl.textContent = msg
    },
    dispatch: (name, params, pId) => {
      const p = pId || currentMe
      config.logic.actions[name](params, { game: currentState, playerId: p })
      onChangeCallback({
        game: currentState,
        yourPlayerId: currentMe,
        action: { name, params, playerId: p },
      })
    },
    setState: (newState, action) => {
      currentState = JSON.parse(JSON.stringify(newState))
      onChangeCallback({ game: currentState, yourPlayerId: currentMe, action })
    },
    getState: () => JSON.parse(JSON.stringify(currentState)),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    reset: (pIds) => {
      currentState = config.logic.setup(pIds || players.slice(0, 2))
      onChangeCallback({ game: currentState, yourPlayerId: currentMe })
    },
    click: async (target, label) => {
      runner.log(`Clicking ${label || "element"}...`)
      const el =
        typeof target === "string" ? document.querySelector(target) : target
      if (!el) throw new Error(`Element not found: ${target}`)

      const rect = (el as HTMLElement).getBoundingClientRect()
      const tap = document.createElement("div")
      tap.style.cssText = `position:fixed; left:${rect.left + rect.width / 2}px; top:${rect.top + rect.height / 2}px; width:50px; height:50px; border:5px solid #ef4444; border-radius:50%; background:rgba(239,68,68,0.3); transform:translate(-50%,-50%) scale(0.1); pointer-events:none; z-index:20000; transition:all 0.5s;`
      document.body.appendChild(tap)
      requestAnimationFrame(() => {
        tap.style.transform = "translate(-50%,-50%) scale(1)"
        tap.style.opacity = "0"
      })
      setTimeout(() => tap.remove(), 600)

      if ((el as HTMLElement).click) (el as HTMLElement).click()
      else
        el.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          })
        )

      await new Promise((r) => setTimeout(r, 800))
    },
  }

  // 3. Inject Control Panel
  if (typeof document !== "undefined") {
    const style = document.createElement("style")
    style.textContent = `
      #lab-panel { position: fixed; top: 10px; right: 10px; width: 240px; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(8px); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); z-index: 20000; font-family: -apple-system, system-ui, sans-serif; padding: 12px; border: 1px solid #cbd5e1; max-height: 90vh; display: flex; flex-direction: column; transition: all 0.2s ease; }
      #lab-panel.minimized { width: 120px; padding: 8px 12px; }
      #lab-panel.minimized .lab-controls, 
      #lab-panel.minimized #lab-scenarios, 
      #lab-panel.minimized #lab-status, 
      #lab-panel.minimized .lab-error-copy { display: none; }
      #lab-panel h3 { margin: 0; color: #1e293b; font-size: 13px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; min-height: 24px; }
      #lab-panel:not(.minimized) h3 { margin-bottom: 10px; }
      #lab-scenarios { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; padding-right: 4px; }
      .lab-btn { background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px; text-align: left; font-size: 11px; font-weight: 500; color: #475569; cursor: pointer; transition: all 0.1s; display: flex; justify-content: space-between; align-items: center; }
      .lab-btn:hover { background: #f1f5f9; border-color: #cbd5e1; transform: translateX(2px); }
      .lab-btn.running { border-color: #6366f1; background: #eef2ff; }
      #lab-status { margin-top: 10px; font-size: 10px; font-weight: 500; color: #64748b; min-height: 1.4em; border-top: 1px solid #f1f5f9; padding-top: 8px; white-space: pre-wrap; word-break: break-all; max-height: 120px; overflow-y: auto; }
      #lab-status.error { color: #ef4444; background: #fef2f2; padding: 4px; border-radius: 4px; border: 1px solid #fee2e2; }
      #lab-status.success { color: #10b981; }
      .lab-controls { display: flex; gap: 4px; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
      .lab-ctrl-btn { flex: 1; background: #334155; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer; }
      .lab-ctrl-btn:hover { background: #1e293b; }
      .lab-ctrl-btn.play-all { background: #6366f1; }
      #lab-toggle { background: none; border: none; padding: 0; cursor: pointer; font-size: 16px; display: flex; align-items: center; }
      .lab-error-copy { margin-top: 4px; font-size: 9px; text-decoration: underline; color: #6366f1; cursor: pointer; display: none; }
    `
    document.head.appendChild(style)

    const panel = document.createElement("div")
    panel.id = "lab-panel"
    panel.innerHTML = `
      <h3>
        <span>🧪 Test Lab</span>
        <button id="lab-toggle" title="Minimize/Maximize">↔️</button>
      </h3>
      <div class="lab-controls">
        <button class="lab-ctrl-btn play-all" id="lab-play-all">▶ Run All</button>
        <button class="lab-ctrl-btn" id="lab-reset">🔄 Reset</button>
      </div>
      <div id="lab-scenarios"></div>
      <div id="lab-status">Ready</div>
      <div id="lab-error-copy" class="lab-error-copy">Copy Error to Clipboard</div>
    `
    document.body.appendChild(panel)
    statusEl = panel.querySelector("#lab-status")
    const list = panel.querySelector("#lab-scenarios")!
    const toggleBtn = panel.querySelector("#lab-toggle") as HTMLElement
    const playAllBtn = panel.querySelector("#lab-play-all") as HTMLButtonElement
    const resetBtn = panel.querySelector("#lab-reset") as HTMLElement
    const copyErrorBtn = panel.querySelector("#lab-error-copy") as HTMLElement

    toggleBtn.onclick = () => panel.classList.toggle("minimized")
    resetBtn.onclick = () => {
      runner.reset()
      runner.log("Game Reset")
    }

    copyErrorBtn.onclick = () => {
      const text = statusEl?.textContent || ""
      navigator.clipboard.writeText(text).then(() => {
        const oldText = copyErrorBtn.textContent
        copyErrorBtn.textContent = "Copied!"
        setTimeout(() => (copyErrorBtn.textContent = oldText), 2000)
      })
    }

    const runScenario = async (name: string) => {
      const btn = Array.from(list.children).find((b) =>
        b.textContent?.startsWith(name)
      ) as HTMLElement
      btn?.classList.add("running")
      try {
        runner.log(`Running ${name}...`)
        statusEl?.classList.remove("error", "success")
        copyErrorBtn.style.display = "none"

        await config.scenarios[name](runner)

        runner.log(`✅ ${name} Success`)
        statusEl?.classList.add("success")
      } catch (e: unknown) {
        console.error(e)
        const errorMsg = `❌ ${name} Failed:\n${e instanceof Error ? e.message : String(e)}\n${e instanceof Error ? e.stack : ""}`
        runner.log(errorMsg)
        statusEl?.classList.add("error")
        copyErrorBtn.style.display = "block"
        throw e // Re-throw for "Run All" to catch
      } finally {
        btn?.classList.remove("running")
      }
    }

    Object.keys(config.scenarios).forEach((name) => {
      const btn = document.createElement("button")
      btn.className = "lab-btn"
      btn.innerHTML = `<span>${name}</span>`
      btn.onclick = () => runScenario(name).catch(() => {})
      list.appendChild(btn)
    })

    playAllBtn.onclick = async () => {
      playAllBtn.disabled = true
      playAllBtn.textContent = "⌛ Running..."
      const names = Object.keys(config.scenarios)

      try {
        for (const name of names) {
          await runScenario(name)
          await runner.wait(500) // Small gap between tests
        }
        runner.log(`🎉 All ${names.length} tests passed!`)
      } catch {
        // Error already logged by runScenario
      } finally {
        playAllBtn.disabled = false
        playAllBtn.textContent = "▶ Run All"
      }
    }
  }
}
