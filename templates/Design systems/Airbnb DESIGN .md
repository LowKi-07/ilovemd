# Airbnb

## Overview

**Product:** Airbnb
**URL:** https://www.airbnb.co.in/
**Surface type:** marketing
**Audience:** Business decision-makers and potential customers
**Brand character:** Conversion-focused marketing presence with a rich, diverse color palette and single-typeface typography.

> **Note:** Surface detection confidence is low. Verify the inferred audience and brand context before relying on this file.

### Design Principles

- Consistency over novelty — reuse existing patterns before inventing new ones.
- Token-driven — every visual decision references a token, not a magic number.
- Accessible by default — compliance is a baseline, not a feature.

## Colors

| Token | Value | Role |
|-------|-------|------|
| --brand-primary | `#914669` | Text Primary |
| --brand-active | `#773152` | Accent |
| --brand-disabled | `#E3D4E1` | Accent |
| color-9 | `#F2F2F2` | Background |
| color-10 | `#F7F7F7` | Background |
| color-11 | `#FFFFFF` | Background |
| color-1 | `#222222` | Text Primary |
| color-4 | `#6C6C6C` | Text Primary |
| color-5 | `#FF385C` | Accent |
| color-8 | `#DDDDDD` | Border |
| color-6 | `#C1C1C1` | Text Light |

## Typography

**Font stack:** Airbnb Cereal VF

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 11px | Captions, metadata |
| text-sm | 13px | Labels, secondary text |
| text-base | 16px | Body text (default) |
| text-lg | 20px | Subheadings, emphasis |
| text-xl | 22px | Section headings |
| text-2xl | 28px | Section headings |

**Weight scale:** 400 · 500 · 600 · 700
**Line heights:** 40.04px · 20.02px · 26px · 30.03px · 18px · 24px · 13px · 20px · 16px

## Spacing

**Base unit:** 4px

`space-1: 2px` · `space-2: 4px` · `space-3: 5px` · `space-4: 6px` · `space-5: 8px` · `space-6: 10px` · `space-7: 11px` · `space-8: 12px` · `space-9: 15px` · `space-10: 16px` · `space-11: 24px` · `space-12: 29px` · `space-13: 48px` · `space-14: 49px` · `space-15: 80px` · `space-16: 131px`

## Shapes

**Border radius:** `radius-sm: 0px 1.5px 1.5px 0px` · `radius-md: 1.5px 0px 0px 1.5px` · `radius-lg: 4px` · `radius-xl: 8px` · `radius-full: 14px` · `radius-6: 20px` · `radius-7: 32px` · `radius-8: 50px` · `radius-full: 50%` · `radius-10: 100px`

## Elevation

- **shadow-sm:** `color(srgb 0 0 0 / 0.02) 0px 0px 0px 1px, color(srgb 0 0 0 / 0.04) 0px 2px 6px 0px, color(srgb 0 0 0 / 0.1) 0px 4px 8px 0px`
- **shadow-md:** `color(srgb 0 0 0 / 0.02) 0px 0px 0px 1px, color(srgb 0 0 0 / 0.1) 0px 8px 24px 0px`

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-fast:** `0.15s cubic-bezier(0, 0, 1, 1) 0.1s both kf-h0qfv9`
- **duration-base:** `box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1), transform 0.25s cubic-bezier(0.2, 0, 0, 1), background-color 0.3s cubic-bezier(0.2, 0, 0, 1), border-color 0.3s cubic-bezier(0.2, 0, 0, 1), color 0.3s cubic-bezier(0.2, 0, 0, 1)`
- **duration-base:** `box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1), transform 0.1s cubic-bezier(0.2, 0, 0, 1)`
- **duration-base:** `transform 0.25s cubic-bezier(0.2, 0, 0, 1)`
- **duration-base:** `background-color 0.25s cubic-bezier(0.2, 0, 0, 1), transform 0.25s cubic-bezier(0.2, 0, 0, 1)`
- **duration-base:** `color 0.25s cubic-bezier(0.2, 0, 0, 1)`
- **duration-base:** `transform 0.3s cubic-bezier(0.2, 0, 0, 1), height 0.3s cubic-bezier(0.2, 0, 0, 1)`
- **duration-base:** `text-decoration-thickness 0.3s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.3s cubic-bezier(0.2, 0, 0, 1), background-color 0.3s cubic-bezier(0.2, 0, 0, 1)`
- **duration-slow:** `transform 0.451754s linear(0 0%, 0.185572 10%, 0.465306 20%, 0.682334 30%, 0.822325 40%, 0.904974 50%, 0.951289 60%, 0.976364 70%, 0.989612 80%, 0.996485 90%, 1 100%)`

## Components

- **Buttons:** 54 detected
- **Links:** 175 detected
- **Inputs:** 1 detected
- **Navigation:** 1 elements
- **Lists:** 15 detected
- **Forms:** 1 detected
- **Images:** 139 detected

## Do's and Don'ts

### Do

- Reference tokens by name, not raw values — agents and developers should use `color.text.primary`, not `#171717`.
- Define all interactive states: default, hover, focus-visible, active, disabled.
- Use the spacing scale for all padding, margin, and gap values.
- Write content in sentence case. Reserve ALL CAPS for acronyms only.
- Test every component at the smallest and largest breakpoint before shipping.

### Don't

- Do not introduce colors outside the extracted palette.
- Do not use arbitrary spacing values — stick to the scale.
- Do not mix border-radius values. Pin to the detected set (0px 1.5px 1.5px 0px, 1.5px 0px 0px 1.5px, 4px, 8px, 14px, 20px, 32px, 50px, 50%, 100px).
- Do not use full-uppercase text for body or paragraph content.
- Do not nest interactive elements (e.g. buttons inside links).
- Do not ship components without defining hover, focus-visible, and disabled states.

## Writing Tone

Concise, confident, implementation-focused. Avoid filler preambles.

## Authoring Workflow

When creating or updating a component guideline for this system, follow this sequence:

1. **State the intent** — one sentence on what the component does and why it exists.
2. **Map tokens** — list every color, spacing, typography, and radius token the component uses. No raw values.
3. **Define anatomy** — break the component into named parts (container, label, icon, etc.) with their token assignments.
4. **Specify states** — document every state: default, hover, focus-visible, active, disabled, loading, error, empty.
5. **Describe interactions** — keyboard, pointer, and touch behavior, including edge cases (long content, overflow, truncation).
6. **Add accessibility criteria** — write testable pass/fail checks (e.g. "focus ring must be visible at 3:1 contrast").
7. **List anti-patterns** — concrete examples of misuse with a brief explanation of why each is wrong.
8. **Close with a QA checklist** — a mechanical list of verifiable items (see Definition of Done below).

## Required Output Structure

Every component guideline produced from this system must contain these sections, in order:

1. Overview — purpose, when to use, when not to use.
2. Tokens and foundations — all referenced tokens from the tables above.
3. Anatomy and variants — named parts, variant matrix, responsive behavior.
4. States and interactions — full state table, keyboard/pointer/touch behavior.
5. Accessibility — ARIA attributes, contrast requirements, focus management, screen reader behavior.
6. Content guidelines — copy length, tone, capitalisation, placeholder text rules.
7. Anti-patterns — explicit examples of what not to build, with reasoning.

## Component Requirements

Every component built against this system must:

- Reference only tokens defined in the tables above — no hardcoded hex, px, or font values.
- Define all interactive states: default, hover, focus-visible, active, disabled, loading, error.
- Specify responsive behavior at the smallest and largest supported breakpoint.
- Handle edge cases: empty state, overflow / truncation, maximum content length.
- Include keyboard navigation (Tab, Enter, Escape, Arrow keys where applicable).
- Document ARIA roles, labels, and live-region behavior where relevant.
- Include known page component density: - **Buttons:** 54 detected
- **Links:** 175 detected
- **Inputs:** 1 detected
- **Navigation:** 1 elements
- **Lists:** 15 detected
- **Forms:** 1 detected
- **Images:** 139 detected

## Definition of Done

A component is not complete until every item below is checked:

- Renders correctly in its default state (smoke test).
- All states documented and visually verified (hover, focus, disabled, loading, error, empty).
- All visual values use design tokens — zero hardcoded values.
- Keyboard navigation works without a pointer.
- No critical accessibility violations (contrast, ARIA, focus order).
- Tested at smallest and largest breakpoint.
- Anti-patterns section lists at least one concrete misuse example.
- Documentation covers purpose, usage, props/API, and limitations.
