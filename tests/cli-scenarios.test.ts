import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { logic } from '../src/logic'
import { scenarios } from '../src/scenarios'
import { LabRunner } from '../src/testLab'
// Import client to trigger the real UI initialization against the DOM setup in setup.ts
import '../src/client'

// Access the spies defined in setup.ts
const runeInitSpy = global.Rune.initClient as any
const actionSpies = {
  drawCard: global.Rune.actions.drawCard as any,
  pickCard: global.Rune.actions.pickCard as any,
  usePowerUp: global.Rune.actions.usePowerUp as any,
}

class IntegrationRunner implements LabRunner {
  game: any
  onChangeCallback: any
  localPlayerId = 'p1'
  mode = 'LOCAL' as const

  constructor() {
    // Capture the onChange callback that client.ts registered
    if (runeInitSpy.mock.calls.length === 0) {
      throw new Error("Rune.initClient was not called! Is client.ts imported?")
    }
    // The first argument to initClient is { onChange: ... }
    this.onChangeCallback = runeInitSpy.mock.calls[0][0].onChange
  }

  log(msg: string) {
    // console.log(`[Test] ${msg}`)
  }

  reset(playerIds = ['p1', 'p2']) {
    this.game = logic.setup(playerIds)
    this.localPlayerId = 'p1'
    
    // Reset spies
    actionSpies.drawCard.mockClear()
    actionSpies.pickCard.mockClear()

    // Initial render
    this.refreshUI()
  }

  refreshUI(action?: any) {
    this.onChangeCallback({
      game: JSON.parse(JSON.stringify(this.game)), // Pass copy to simulate network boundary
      yourPlayerId: this.localPlayerId,
      action: action,
      event: action ? undefined : { name: 'stateSync' }
    })
  }

  getState() {
    return JSON.parse(JSON.stringify(this.game))
  }

  setState(newState: any) {
    this.game = JSON.parse(JSON.stringify(newState))
    this.refreshUI()
  }

  async wait(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms / 10)) // Speed up tests
  }

  dispatch(actionName: string, params: any, playerId = 'p1') {
    // Execute logic directly
    if (logic.actions[actionName]) {
      logic.actions[actionName](params, { game: this.game, playerId })
      this.refreshUI({ name: actionName, params, playerId })
    } else {
      throw new Error(`Unknown action: ${actionName}`)
    }
  }

  async click(element: HTMLElement | string, label?: string) {
    const el = typeof element === 'string' ? document.querySelector(element) : element
    if (!el) throw new Error(`Element not found: ${element} (${label})`)

    // Clear spies before click to detect new actions
    actionSpies.drawCard.mockClear()
    actionSpies.pickCard.mockClear()
    actionSpies.usePowerUp.mockClear()

    // Perform click
    if ((el as any).click) {
        (el as HTMLElement).click()
    } else {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    }

    // Detect if an action was triggered
    let triggered = null
    
    if (actionSpies.drawCard.mock.calls.length > 0) {
      triggered = { name: 'drawCard', params: actionSpies.drawCard.mock.calls[0][0] }
    } else if (actionSpies.pickCard.mock.calls.length > 0) {
      triggered = { name: 'pickCard', params: actionSpies.pickCard.mock.calls[0][0] }
    } else if (actionSpies.usePowerUp.mock.calls.length > 0) {
      triggered = { name: 'usePowerUp', params: actionSpies.usePowerUp.mock.calls[0][0] }
    }

    // If action triggered, run logic
    if (triggered) {
      this.dispatch(triggered.name, triggered.params, this.localPlayerId)
    }

    // Allow UI updates (promises, animations) to settle
    await new Promise(r => setTimeout(r, 0))
  }
}

describe('Integration Scenarios', () => {
  // Initialize runner once; client.ts is already loaded
  let runner: IntegrationRunner

  beforeEach(() => {
    // Ensure we have a fresh runner wrapper (though client.ts singleton persists)
    runner = new IntegrationRunner()
    // Reset DOM if needed? client.ts usually rebuilds on reset() via refreshUI -> initUI
  })

  // Iterate over all exported scenarios
  for (const [name, runScenario] of Object.entries(scenarios)) {
    it(`runs scenario: ${name}`, async () => {
      await runScenario(runner)
    })
  }
})
