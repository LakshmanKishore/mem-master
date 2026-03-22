# Testing Infrastructure: Mem Master

This project uses a unified **Scenario-First** testing strategy. Instead of maintaining separate unit tests and manual test plans, we define game scenarios once and run them everywhere.

## 1. The Strategy: "One Scenario, Two Runners"

We define user flows (e.g., "Draw a card", "Steal from opponent") in **`src/scenarios.ts`**. These scenarios are the single source of truth for how the game should behave.

### Runner A: The Test Lab (Visual)
- **What it is:** An interactive sandbox inside your browser.
- **Goal:** Visual verification. Does it *look* right? Are animations smooth?
- **How to use:**
  1. Run `npm run dev`
  2. Click **🧪 Test Lab** in the bottom-right.
  3. Click any scenario to watch it play out in an isolated environment.

### Runner B: The CLI Runner (Automated)
- **What it is:** A headless test runner (using Vitest + JSDOM).
- **Goal:** CI/CD and Logic verification. Does the code *work* without crashing?
- **How to use:**
  1. Run `npm test`
  2. The runner executes the exact same scenarios from `src/scenarios.ts` in a simulated DOM.

## 2. Configuration Files

- **`src/scenarios.ts`**: **The most important file.** This is where you write your tests.
- **`src/testLab.ts`**: The engine that powers the Sandbox.
- **`tests/cli-scenarios.test.ts`**: The adapter that lets Vitest run your scenarios.
- **`vitest.config.ts`**: Runner configuration.

## 3. How to Add a New Test

1. Open `src/scenarios.ts`.
2. Add a new entry to the `scenarios` object:
   ```typescript
   "My New Feature": async (lab) => {
     lab.reset() // Start fresh (2 players)
     
     // 1. Perform Actions
     await lab.click("#deck-stack", "Deck")
     
     // 2. Verify State
     const state = lab.getState()
     if (state.phase !== "pick") throw new Error("Phase didn't change!")
     
     // 3. Interact with DOM
     await lab.click(".some-card", "Card")
   }
   ```
3. Run `npm test` to verify it passes.
4. Open the browser to verify it looks good.

## 4. Running Tests

```bash
# Run all automated scenarios
npm test
```
