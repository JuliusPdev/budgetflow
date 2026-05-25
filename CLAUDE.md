## About this project

BudgetFlow is a personal forward-looking expense planner. It maximizes the user's monthly free budget while guaranteeing every future expense is fully funded by its deadline. The full product spec is in `docs/product-spec.md` and the core algorithm is in `docs/algorithm.md`. Read both before making any changes.

## About me (the developer)

I am a Product Manager learning to code. I have basic programming knowledge (CS50x level). I understand variables, functions, loops, and data structures, but I am not fluent in reading or writing code yet.

**This project is a learning exercise as much as it is a product build.**

## How you should work with me

### Assume zero prior knowledge

Always write as if I have never written a line of code and do not know any programming or computer science concepts. This means:

- Never use a technical term without explaining it first in plain language
- Never assume I know what a function, a type, a hook, a component, an array, a loop, or any other concept is — explain it every time it comes up, even if you've explained it before
- If you catch yourself writing a sentence that a non-programmer might not understand, stop and rewrite it
- Treat every concept as if you're explaining it to a smart person who just happens to have never opened a code editor

This is a learning exercise as much as it is a product build. The goal is not just to ship working software — it is for me to understand what was built and why.

### Always explain what you're doing and why

For every change you make, explain:

1. WHAT you're changing (which file, which function)
2. WHY you're making this change (what problem it solves)
3. HOW the code works (walk through the logic in plain language, line by line if needed)

Do not just write code and say "done." I want to understand what happened.

### Explain before you write code — always

Before making any code change, no matter how small, first write out in plain language:

1. What you are about to do
2. Why it is the right approach
3. What the code will look like conceptually, before showing the actual code

Only after that explanation should you write or edit any code. The explanation comes first, the code comes second, every single time. Never open with a code block.

### Go deep on explanations

More detail is always better than less. If you're unsure whether to explain something, explain it. Do not summarize when you could elaborate. A longer, clearer explanation is always preferable to a short one that leaves gaps.

### Use simple analogies

When introducing a new concept (hooks, state management, types, etc.), explain it with a real-world analogy first, then show the code. The analogy should come before the code, not after.

### Show me the data flow

When building a feature, explain how data moves: where it starts (user input), how it's stored (state), how it's transformed (engine), and where it ends up (UI).

### One thing at a time

Build one feature, explain it, make sure it works, then move to the next. Ask me if I'm ready to proceed.

### When I ask you to fix a bug

1. Explain what you think is causing the bug and why
2. Show the relevant code and point to the problem
3. Explain the fix before implementing it
4. After fixing, explain what changed and why it works now

### When I ask a question

Answer directly using the actual project code, not abstract examples. If my question reveals a misunderstanding, correct it gently and thoroughly — do not just give the correct answer, explain why the misunderstanding happened.

### Always cite the exact lines of code

When explaining a bug, a behavior, or a code change, always quote the specific lines involved. Include:

- The file path (e.g. `src/components/MonthCard.tsx`)
- The line number (e.g. line 310)
- The actual code snippet

Example format: "In `MonthCard.tsx`, line 310, the condition `result.setAsideRecommended > 0` means the entire section is hidden when the recommendation drops to zero — even if there is still a locked amount."

This lets me follow along in my editor and build a real mental map of where things live.

## Tech stack

- React 18+ with TypeScript
- Vite for build tooling
- localStorage for persistence (no backend)
- No UI framework — plain CSS or Tailwind
- No external state management — React built-in (useState, useReducer, useContext)

## Project structure

```
budgetflow/
├── CLAUDE.md
├── docs/
│   ├── algorithm.md
│   └── product-spec.md
├── src/
│   ├── engine/            # Pure logic, no React
│   │   ├── types.ts       # All data model types
│   │   ├── smoothing.ts   # The smoothing algorithm
│   │   └── engine.test.ts # Tests with verification examples
│   ├── components/        # React components
│   │   ├── Briefing.tsx
│   │   ├── MonthlyGrid.tsx
│   │   ├── MonthCard.tsx
│   │   ├── Chat.tsx
│   │   ├── Onboarding.tsx
│   │   ├── Settings.tsx
│   │   └── FAB.tsx
│   ├── hooks/
│   │   └── useBudgetState.ts
│   ├── utils/
│   │   ├── storage.ts     # localStorage read/write
│   │   └── formatting.ts  # Date and number formatting
│   ├── App.tsx
│   └── main.tsx
├── package.json
└── index.html
```

## Key architectural decisions

1. **Engine is pure TypeScript, no React.** Takes data in, returns results. Testable independently.
2. **Engine runs on every state change.** Any financial data change triggers full recalculation.
3. **Locked amounts are facts, not algorithm constraints.** Current month participates in equalization. Locked amounts tell the app what's been transferred. App shows the delta.
4. **Free budget = locked reality.** Based on actual locked amount, not theoretical set-aside. Surplus doesn't increase free budget until user explicitly frees it up.

## Code style

- Strict TypeScript. No `any`.
- Named functions for top-level declarations.
- Comments explain WHY, not WHAT.
- Descriptive variable names: `monthlySetAside` not `msa`.

## Frontend design guidelines

---

name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt

---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:

- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:

- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

## Design Skills

For ANY visual, styling, layout, or UI-related work, always use both design skills:

- **bencium-controlled-ux-designer**: Use for interaction design decisions, information hierarchy, feedback patterns, progressive disclosure, accessibility, and responsive design. Follow its guidelines for focus states, touch targets, motion specs, and forgiveness patterns.

- **ui-ux-pro-max**: Use for visual design decisions: color application, typography choices, spacing, component styling, and overall aesthetic consistency. Run --design-system when establishing or updating the visual direction.

Apply both skills automatically — do not wait to be asked. Bencium guides how things work, Pro Max guides how things look. Both apply simultaneously to every UI change.

When these skills conflict with each other, prioritize Bencium (UX fundamentals over aesthetics). When either conflicts with the existing BudgetFlow design spec in docs/product-spec.md, the product spec takes precedence.
