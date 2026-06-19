# MVP delivery plan

## Implementation phases

### Phase 1: Repository setup

- Create pnpm workspace
- Add Turborepo
- Add TypeScript config
- Add Vitest
- Add ESLint and Prettier
- Create package structure
- Create placeholder README, plan and roadmap

Done when:

- `pnpm install` works
- `pnpm test` works
- Packages compile

### Phase 2: Schema and core

- Implement Zod schemas
- Implement TypeScript types
- Implement recipe writer
- Implement Markdown writer
- Implement normalised text validator
- Add tests for schema validation

Done when:

- A valid session writes JSON and Markdown
- Invalid sessions are rejected
- Validation utility is tested

### Phase 3: MCP server

- Create MCP server
- Add `create_guided_session`
- Add `create_pr_review_session`
- Add `get_guided_session`
- Add `update_step_status`
- Write recipe files into `.guided-implementation`
- Add tests for tool handlers

Done when:

- A harness can call MCP tools
- Recipe files are created correctly
- Schema validation errors are returned clearly

### Phase 4: VS Code extension recipe loading

- Create extension shell
- Register commands
- Load `.guided-implementation/current.recipe.json`
- Watch recipe file changes
- Render sidebar with step list
- Display active step details

Done when:

- Opening a workspace with a recipe shows the session in the sidebar
- Clicking a step activates it

### Phase 5: Navigation

- Open file for active step
- Move cursor to target location
- Highlight target range
- Support next and previous step
- Handle missing files
- Create empty files when allowed

Done when:

- User can move through a multi-file recipe
- Missing files are handled cleanly

### Phase 6: Ghost code

- Render ghost code using decorations
- Track user typing
- Update ghost text progress
- Hide ghost text when complete
- Show validation status

Done when:

- User can type through a guided step
- The extension detects completion
- The user can advance to the next step

### Phase 7: PR review playback

- Load `pr_review` sessions
- Render review sidebar
- Jump to changed range
- Highlight changed range
- Add play, pause, next and previous
- Display what, why, impact and risk

Done when:

- User can play through a review session step by step

### Phase 8: Polish

- Improve error messages
- Add status bar item
- Add empty states
- Add recipe examples
- Add docs for Codex prompt usage
- Add basic extension tests

Done when:

- MVP is usable end to end on a real repository

## First manual test scenario

Use a small Fastify repo.

Prompt Codex:

```txt
Use the DuckWalk MCP server.

Do not edit source files directly.

Inspect this repository and create a guided implementation session for adding basic auth middleware.

Call create_guided_session with an ordered implementation recipe.

Each step must include:
- file path
- whether the file exists
- whether the file should be created
- target location strategy
- what the change does
- why the change is needed
- exact ghost code
- validation type
```

Expected result:

- MCP writes `current.recipe.json`
- VS Code extension loads it
- Sidebar shows steps
- Step 1 creates or opens the target file
- Ghost code appears
- User types implementation
- Step validates
- Next step opens the next file
