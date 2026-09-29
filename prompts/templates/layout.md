# Template / Layout documentation template

A template is documented by its contract: the regions it provides and the rules
for filling them. It has no content of its own, so the doc is mostly about
constraints. ⚑ = human-knowledge section: keep it empty when the source is silent.

```markdown
# <TemplateName>

## Intended use ⚑    ← which kinds of pages this layout is for ("all marketing pages", "settings screens").
## Regions           ← table: Region/Slot · Purpose · Required?. Source: {children}, named slots, placeholder blocks.
## Allowed content ⚑ ← per region, what belongs there and what does not.
## Layout rules      ← grid, spacing scale, max widths, sticky/fixed elements. Source: CSS.
## Responsive behavior ← how regions reflow per breakpoint. Source: media queries.
## Variants          ← only if the source shows layout variants (with/without sidebar, wide/narrow).
## Pages using it    ← list, if discoverable from imports/usage. Omit otherwise.
## Do ⚑
## Don't ⚑
```

Question bank for Rule 3:

* "Which page types should use this layout — and which should not?"
* "Per region: what is allowed in it, and what is explicitly not?"
* "Are any regions required on every page, or can some be omitted?"
* "Any layout-level rules a page author must never break?" (e.g. one CTA band, nav always present)
