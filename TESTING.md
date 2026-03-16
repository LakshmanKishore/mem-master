# Testing Infrastructure: Mem Master

This project uses a two-tier testing strategy optimized for **Termux/Mobile** environments where full headless browsers (like Playwright/Cypress) are unavailable.

## 1. Test Architecture

### A. Logic Tests (`tests/logic.test.ts`)
- **Environment:** Node.js (Standard)
- **Purpose:** Verifies the "Brain" of the game.
- **Scope:** 100% coverage of `src/logic.ts`.
- **How it works:** Mocks the `Rune` global object and directly executes actions (e.g., `logic.actions.drawCard`) against a generated state, asserting that the data changes correctly.

### B. Integration Tests (`tests/integration.test.ts`)
- **Environment:** Vitest + JSDOM
- **Purpose:** Verifies the "Body" (UI/UX) of the game.
- **Scope:** Simulates real user interactions (clicks, modal opening) and UI updates (score badges, turn indicators).
- **How it works:**
    - **JSDOM:** Simulates a browser window, document, and DOM.
    - **SDK Mocking:** Intercepts `Rune.initClient` to capture the `onChange` callback.
    - **State Injection:** The test manually calls the `onChange` function with specific mock states to trigger UI renders.
    - **Event Simulation:** Uses standard DOM `.click()` events to ensure event listeners in `client.ts` are correctly calling SDK actions.

## 2. Configuration Files

- **`vitest.config.ts`**: Configures the Vitest runner to use the JSDOM environment and the setup file.
- **`tests/setup.ts`**: 
    - Inject the initial `index.html` structure into the JSDOM document.
    - Mock standard browser APIs not fully supported by JSDOM (Audio, Animation API, `requestAnimationFrame`).
    - Provide a global mock of the `Rune` SDK.

## 3. Key Patterns for Future Tests

### Module Isolation
When testing `client.ts`, use `vi.resetModules()` and re-import the client inside `beforeEach` if you need to test fresh DOM lookups (since `client.ts` captures elements at the top level).

### Async Flushing
Since UI renders may be triggered via `requestAnimationFrame` or other async cycles, always "flush" the cycle before asserting on the DOM:
```typescript
onChangeCallback({ game: newState, yourPlayerId: 'p1' });
await new Promise(r => setTimeout(r, 0)); // Flush render cycle
expect(document.getElementById('element').textContent).toBe('Expected');
```

## 4. Running Tests

```bash
# Run logic tests (fast)
node --test tests/logic.test.ts

# Run integration tests (comprehensive)
npx vitest run tests/integration.test.ts

# Run with coverage
npx vitest run --coverage
```
