# Page documentation template

A page is documented top-down: what it is for, what it is made of, how it behaves
as a whole. Components own their own docs — the page doc references them rather
than re-describing them. ⚑ = human-knowledge section: keep it empty when the
source is silent.

```markdown
# <PageName>

## Purpose ⚑         ← what this page exists to let the user do; primary audience. Route/URL if visible in source.
## Page anatomy      ← the sections in order, top to bottom, each in one line. Source: landmark structure, top-level blocks.
## Components used   ← table: Component · Where on the page · Notes. Source: imports / recognizable markup. Link names to their own docs when they exist.
## Layout            ← grid, max content width, column behavior. Source: CSS.
## Responsive behavior ← what changes per breakpoint. Source: media queries. Omit if none.
## Content model ⚑   ← what data/copy appears and where it comes from (static, CMS, API).
## Page states       ← loading / empty / error / signed-out, if the source shows them; ⚑ otherwise.
## SEO / Meta        ← title, description, og tags found in source. Omit if none.
## Accessibility     ← landmark structure and heading hierarchy (the page owns the single h1) + ⚑ guidance.
## Do ⚑
## Don't ⚑
```

Question bank for Rule 3:

* "Who is this page's primary user, and what one action should they complete?"
* "What must always be visible above the fold?"
* "Where does the content come from — static, CMS, an API?"
* "What should the page show while loading, when empty, and on error?"
* "Any rules about what must never appear on this page?"
