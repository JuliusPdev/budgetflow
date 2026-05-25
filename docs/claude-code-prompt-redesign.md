# Claude Code Prompt — Visual Redesign

**CRITICAL: Do NOT change any files in src/engine/, any hooks, any state management, any calculations, or any TypeScript types. This prompt is purely about visual styling. If anything seems to require a logic change, flag it but do not implement it.**

Read the bencium-controlled-ux-designer skill and the ui-ux-pro-max skill before starting. Apply both throughout this redesign.

---

## Design Direction

Redesign BudgetFlow's visual style inspired by modern fintech aesthetics. The reference is a clean, calm, trustworthy fintech app using a blue-purple (periwinkle) accent palette on a light background.

---

## Color System

Replace the current color system with this new palette:

**Background:**
- App background: #F4F5FF (very light periwinkle tint, not pure white)
- Card background: #FFFFFF (pure white cards sitting on the tinted background)
- Secondary card / subtle sections: #F0F1FF

**Accent (blue-purple / periwinkle):**
- Primary accent: #6B6FD4 (medium blue-purple, used for the free budget number and primary interactive elements)
- Accent light: #B8C0FF (lighter periwinkle, used for large card backgrounds like the briefing card)
- Accent dark: #4A4D9E (darker shade for hover states and active elements)

**Text:**
- Primary text (all numbers, labels, expense names): #111111 (near black)
- Secondary text (supporting labels, dates, subtitles): #6B7280
- Tertiary text (placeholders, muted): #9CA3AF

**Number styling rules (important):**
- ALL numbers are black (#111111) by default
- Group totals (e.g., total fixed expenses, total set-aside, total spent this month) are black AND bold
- Individual line item amounts are black and regular weight
- The free budget number ONLY uses the primary accent color (#6B6FD4), large and bold
- Do NOT use green/yellow/red for numbers. Reserve status colors only for small indicator dots or badges.

**Status indicators (dots and badges only, not numbers):**
- Healthy/on track: #22C55E
- Tight/warning: #EAB308
- Critical/at risk: #EF4444

**Savings and pot:**
- Savings-related elements: #8B5CF6 (purple, keep as is)
- Pot balance: #6B6FD4 (same as primary accent)

---

## Typography

**Font pairing:**
- Numbers and amounts: use a clean geometric sans-serif or the current monospace if it reads well at all sizes
- All other text: DM Sans or Inter (whichever is already loaded, or add DM Sans from Google Fonts)

**Type scale:**
- Free budget number: 48-56px, bold, accent color (#6B6FD4)
- Section headers (e.g., "Currently saving for", "Spent this month"): 14px, semibold, #111111, uppercase with letter-spacing: 0.05em
- Card titles / month labels: 18px, bold, #111111
- Line item labels: 14px, regular, #111111
- Line item amounts (individual): 14px, regular, #111111
- Group total amounts: 14px, bold, #111111
- Supporting text / dates / subtitles: 13px, regular, #6B7280

---

## Card Design

**Card style:**
- Background: #FFFFFF
- Border: none (no borders)
- Border radius: 20px on all cards
- Box shadow: 0 2px 12px rgba(0, 0, 0, 0.06) — subtle, not dramatic
- Padding: 24px

**Briefing card (special treatment):**
- Background: #B8C0FF (the accent light periwinkle fill, like the main card in the reference)
- Border radius: 24px
- The free budget number sits prominently on this colored background in #6B6FD4 (darkened slightly for contrast — verify minimum 4.5:1 contrast ratio against the #B8C0FF background, adjust if needed)
- All text on the briefing card: #111111 for labels, #6B6FD4 for the big number

**Management card:**
- Standard white card (#FFFFFF)
- Left border accent: 4px solid #6B6FD4 (to visually distinguish it as "active this month")
- Or alternatively: a subtle "Current Month" pill badge in accent light (#B8C0FF with #4A4D9E text)

**Monthly grid cards:**
- Standard white card (#FFFFFF)
- Past month cards: background #F8F8F8, text slightly muted
- Current month card in the grid: thin accent border (1px solid #B8C0FF)

---

## Layout and Spacing

**Overall layout:**
- Max width for content: 900px on desktop, centered
- Section spacing (gap between briefing, management card, monthly grid): 24px
- Mobile: single column, cards full width with 16px horizontal padding

**Monthly grid:**
- Card min-width: 200px on desktop, full-width when single column on mobile
- Gap between cards: 16px

**Within cards:**
- Section dividers: use 1px #F0F0F0 lines between sections, not heavy dividers
- Row spacing within sections: 12px gap between line items
- Label and amount on the same row: space-between layout

---

## Interactive Elements

**Primary buttons (Lock in, Settle, Actualize):**
- Background: #6B6FD4
- Text: #FFFFFF
- Border radius: 12px
- Padding: 10px 20px
- Hover: #4A4D9E
- No box shadow on buttons

**Secondary buttons (Free up, Cancel, Skip):**
- Background: transparent
- Border: 1.5px solid #6B6FD4
- Text: #6B6FD4
- Border radius: 12px
- Hover: background #F0F1FF

**Destructive buttons (Delete, Remove):**
- Text: #EF4444
- No background, no border (text-only)
- Hover: background #FEF2F2

**FAB (floating action button):**
- Background: #6B6FD4
- Icon: white
- Size: 56px circle
- Box shadow: 0 4px 16px rgba(107, 111, 212, 0.4)

**Status badges / pills:**
- On track: background #F0FDF4, text #16A34A, border #BBF7D0
- Tight: background #FEFCE8, text #CA8A04, border #FDE68A
- At risk: background #FEF2F2, text #DC2626, border #FECACA
- Border radius: 999px (pill shape)
- Font size: 11px, semibold
- Padding: 2px 8px

---

## Specific Component Updates

**Progress bars (savings goals, pot accumulation):**
- Track: #E5E7EB
- Fill: #6B6FD4 for pot/set-aside progress, #8B5CF6 for savings goals
- Height: 6px
- Border radius: 999px

**Section headers within cards:**
Use a consistent pattern: 14px uppercase label in #6B7280 with letter-spacing, followed by content. No heavy borders or boxes around section headers.

**Amounts with +/- indicators:**
- Income: black, regular weight (no green color — just the number)
- Expenses / set-aside: black, regular weight (no red color — just the number)
- Only the sign (+/-) can optionally be in secondary text color (#6B7280) if needed for clarity

**Modals (settle, actualize, free-up, add expense):**
- Background: #FFFFFF
- Border radius: 24px
- Overlay: rgba(0, 0, 0, 0.3)
- Max width: 480px on desktop, full screen on mobile
- Padding: 32px

---

## What NOT to change

- No logic, calculations, state management, engine files, or types
- Do not change the layout structure (three sections: briefing, management card, monthly grid)
- Do not remove or reorder any content sections
- Do not change any interaction behavior — only the visual appearance
- Maintain all accessibility requirements: minimum 4.5:1 contrast for text, visible focus rings, touch targets minimum 44px

---

## Delivery

Apply the design system globally. Work through components in this order:

1. Global styles (CSS variables / Tailwind config for the new color and type system)
2. Briefing card
3. Current month management card
4. Monthly grid cards
5. Modals
6. FAB and header
7. Buttons and badges globally

After each component, confirm what changed before moving to the next.
