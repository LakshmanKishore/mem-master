# Gemini Project Instructions

## Post-Code Change Workflow
After making ANY code changes (modifying, adding, or deleting files in `src/` or `tests/`), you MUST strictly follow this sequence:

1.  **Run Tests:** Execute `npm test` (or `npx vitest run`) to verify the changes.
2.  **Fix Regressions:** If tests fail, you MUST fix them before proceeding. Do not ask for permission to fix broken tests caused by your changes.
3.  **Lint & Format:** Run `npm run lint` and check for warnings/errors.
    -   If there are fixable linting errors, use `eslint --fix` or manual edits to resolve them.
    -   Address all warnings if possible.
4.  **Verify Build:** Run `npm run build` to ensure the project compiles without errors.
    -   If the build fails, fix the underlying issues (often type errors or missing exports).

## Quality Gates
-   **Do not** declare a task complete until `npm test` passes AND `npm run build` succeeds.
