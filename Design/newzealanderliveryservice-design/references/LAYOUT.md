# Layout Reference

> Auto-extracted from live DOM. Use this to understand how the site is structured spatially.

## Spacing System

**Base grid:** 4px

**Scale:** `2, 4, 6, 8, 10, 12, 16, 18, 20, 22, 24, 30, 32, 36, 40` px

| Spacing | Semantic Use |
|---------|-------------|
| 4px | Tight — within a component |
| 8px | Medium — between sibling items |
| 16px | Wide — between sections |
| 32px | Vast — major section breaks |

## Flex Layouts

| Element | Direction | Justify | Align | Gap | Children |
|---------|-----------|---------|-------|-----|----------|
| `div.w-full.h-full` | row | center | center | — | 1 |
| `div#Home.w-full.flex` | column | — | — | — | 1 |
| `div.landing-recent-deliveries.mb-[5rem]` | column | — | — | 16.6667px | 1 |
| `div.w-full.mb-[5rem]` | column | start | start | 66.6667px | 2 |
| `div.landing-about.w-full` | row | start | center | 200px | 2 |
| `div.w-full.relative` | column | center | center | — | 1 |
| `div.desktop:absolute.desktop:top-0` | column | center | — | — | 3 |
| `div.desktop:absolute.desktop:top-0` | row | space-between | center | — | 2 |
| `div.absolute.left-[5%]` | row | space-between | center | — | 2 |
| `div.w-full.flex` | column | — | — | 80px | 2 |
| `div.w-full.flex` | row | space-between | start | 0px | 2 |
| `div.w-full.h-full` | column | center | — | — | 4 |
| `div.w-full.px-[1rem]` | row | space-between | end | 66.6667px | 2 |
| `div.px-[1rem].desktop:px-[2.5rem]` | row | space-between | center | — | 1 |
| `div.carousel.w-full` | row | — | — | — | 14 |

## Structural Containers

### `<article>` 

```
display:          block
children:         7
```

## Layout Rules

- Primary layout system: **Flexbox**
- Every spacing value must be a multiple of **4px**
- Never use arbitrary margin/padding values outside the spacing scale

