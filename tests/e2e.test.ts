import { test, expect } from '@playwright/test';

test.describe('Memory Master E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Intercept Rune initialization and mock the SDK
    await page.addInitScript(() => {
      (window as any).Rune = {
        initClient: (config: any) => {
          (window as any).RuneClientConfig = config;
        },
        actions: {
          drawCard: () => {
             // Mock state change: p1 draws a card
             const currentGameState = (window as any).mockGameState;
             currentGameState.phase = "pick";
             currentGameState.currentDrawnCard = "🐶";
             (window as any).RuneClientConfig.onChange({
               game: currentGameState,
               yourPlayerId: "p1",
               action: { name: "drawCard", playerId: "p1", params: {} }
             });
          },
          pickCard: (target: any) => {
             // Mock state change: p1 picks the card correctly
             const currentGameState = (window as any).mockGameState;
             currentGameState.phase = "draw";
             currentGameState.playerHands["p1"].push("🐶");
             currentGameState.centerCards[0] = null;
             (window as any).RuneClientConfig.onChange({
               game: currentGameState,
               yourPlayerId: "p1",
               action: { name: "pickCard", playerId: "p1", params: target }
             });
          }
        },
        getPlayerInfo: (id: string) => ({
          playerId: id,
          displayName: id === "p1" ? "You" : "Opponent",
          avatarUrl: ""
        })
      };

      // Initial mock state
      (window as any).mockGameState = {
        playerIds: ["p1", "p2"],
        turn: "p1",
        phase: "draw",
        deck: ["🐶", "🐱"],
        centerCards: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨"],
        playerHands: { p1: [], p2: [] },
        currentDrawnCard: null,
        lastResult: null,
        winner: null
      };
    });

    // 2. Load the app (using the dev server URL or local path)
    // For this to work in Termux, we'll assume the dev server is running on 5173
    await page.goto('http://localhost:5173');
  });

  test('should allow a player to draw and pick a card', async ({ page }) => {
    // Trigger the initial onChange
    await page.evaluate(() => {
      (window as any).RuneClientConfig.onChange({
        game: (window as any).mockGameState,
        yourPlayerId: "p1"
      });
    });

    // 1. Click the deck to draw
    const deck = page.locator('#deck-stack');
    await expect(deck).toBeVisible();
    await deck.click();

    // 2. Check if the revealed card appears
    const revealed = page.locator('.revealed-card');
    await expect(revealed).toBeVisible();
    await expect(revealed).toHaveText('🐶');

    // 3. Click the first guess card (the matching one)
    const firstCard = page.locator('.guess-card').first();
    await firstCard.click();

    // 4. Verify score update (p1's score badge should be 1)
    const myScore = page.locator('.player-node.is-me .score-badge');
    await expect(myScore).toHaveText('1');
  });
});
