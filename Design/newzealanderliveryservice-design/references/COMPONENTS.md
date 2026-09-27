# Component Reference

> Repeated DOM patterns detected by structural analysis. Each component appeared 3+ times.

## Detected Components

| Component | Category | Instances | Key Classes |
|-----------|----------|-----------|-------------|
| **Carousel Snap** | unknown | 11× | `.carousel-snap`, `.desktop:pl-[2.5rem]`, `.desktop:w-[23rem]` |
| **Aspect Square** | unknown | 11× | `.aspect-square`, `.h-full`, `.object-center` |
| **!Mb 0** | unknown | 11× | `.!mb-0`, `.!mt-[0.75rem]`, `.leading-none` |
| **!Mb 0** | unknown | 11× | `.!mb-0`, `.!mt-[0.37rem]`, `.font-secondary` |
| **Flex** | unknown | 11× | `.flex`, `.flex-col`, `.gap-[0.25rem]` |
| **Whitespace Pre Line** | unknown | 11× | `.whitespace-pre-line` |
| **Absolute** | unknown | 6× | `.absolute`, `.duration-200`, `.h-full` |
| **Jsx D06c553568f5d942** | unknown | 3× | `.jsx-d06c553568f5d942` |

## Other Components

### Carousel Snap

**Instances found:** 11

**CSS classes:** `.carousel-snap` `.desktop:pl-[2.5rem]` `.desktop:w-[23rem]` `.flex` `.flex-col` `.pl-[2rem]`

**HTML structure:**

```html
<div class="carousel-snap w-[16rem] desktop:w-[23rem] pl-[2rem] desktop:pl-[2.5rem] flex flex-col" style="position: absolute; left: 0px; top: 0px; transition: none; user-select: none; transform: translateX(-142.969px);"><img src="/images/landing/recent-deliveries/home/Emma1.jpg" alt="Image" class="w-full h-full aspect-square object-cover object-center rounded-sm select-none pointer-events-none" style="transition: none;"><p class="type-body leading-none text-[1rem] md:text-[2rem] !mt-[0.75rem] !mb-0 uppercase">Emma</p><p class="type-body leading-none text-[1rem] md:text-[2.125rem] text-orange f
```

**Base styles (from design tokens):**

```css
.carousel-snap {
  background: #10174a;
  padding: 4px;
}```

### Aspect Square

**Instances found:** 11

**CSS classes:** `.aspect-square` `.h-full` `.object-center` `.object-cover` `.pointer-events-none` `.rounded-sm`

**HTML structure:**

```html
<img src="/images/landing/recent-deliveries/home/Emma1.jpg" alt="Image" class="w-full h-full aspect-square object-cover object-center rounded-sm select-none pointer-events-none" style="transition: none;">
```

**Base styles (from design tokens):**

```css
.aspect-square {
  background: #10174a;
  padding: 4px;
}```

### !Mb 0

**Instances found:** 11

**CSS classes:** `.!mb-0` `.!mt-[0.75rem]` `.leading-none` `.text-[1rem]` `.type-body` `.uppercase`

**HTML structure:**

```html
<p class="type-body leading-none text-[1rem] md:text-[2rem] !mt-[0.75rem] !mb-0 uppercase">Emma</p>
```

**Base styles (from design tokens):**

```css
.!mb-0 {
  background: #10174a;
  padding: 4px;
}```

### !Mb 0

**Instances found:** 11

**CSS classes:** `.!mb-0` `.!mt-[0.37rem]` `.font-secondary` `.leading-none` `.text-[1rem]` `.text-orange`

**HTML structure:**

```html
<p class="type-body leading-none text-[1rem] md:text-[2.125rem] text-orange font-secondary !mt-[0.37rem] !mb-0 uppercase">AKL → LHR</p>
```

**Base styles (from design tokens):**

```css
.!mb-0 {
  background: #10174a;
  padding: 4px;
}```

### Flex

**Instances found:** 11

**CSS classes:** `.flex` `.flex-col` `.gap-[0.25rem]` `.leading-snug` `.mt-[0.5rem]` `.text-[0.8rem]`

**HTML structure:**

```html
<div class="flex flex-col gap-[0.25rem] mt-[0.5rem] text-[0.8rem] md:text-[1rem] leading-snug"><p class="whitespace-pre-line">Emma is flying to London to surprise her…</p></div>
```

**Base styles (from design tokens):**

```css
.flex {
  background: #10174a;
  padding: 4px;
}```

### Whitespace Pre Line

**Instances found:** 11

**CSS classes:** `.whitespace-pre-line`

**HTML structure:**

```html
<p class="whitespace-pre-line">Emma is flying to London to surprise her long-distance best friend, Tasha, at her University graduation. After years of airport goodbyes, FaceTime calls and a well-overdue matching friendship anklet revamp, this reunion means the world.</p>
```

**Base styles (from design tokens):**

```css
.whitespace-pre-line {
  background: #10174a;
  padding: 4px;
}```

### Absolute

**Instances found:** 6

**CSS classes:** `.absolute` `.duration-200` `.h-full` `.jsx-d06c553568f5d942` `.left-0` `.object-cover`

**HTML structure:**

```html
<img src="/images/where/world-africa-hover.png" alt="World Map" class="jsx-d06c553568f5d942 absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-200 opacity-0">
```

**Base styles (from design tokens):**

```css
.absolute {
  background: #10174a;
  padding: 4px;
}```

### Jsx D06c553568f5d942

**Instances found:** 3

**CSS classes:** `.jsx-d06c553568f5d942`

**HTML structure:**

```html
<path id="HoverAfrica" fill="#ffffff" fill-opacity="0" fill-rule="evenodd" stroke="none" d="M 450 403 L 482 373 L 531 366 L 570 382 L 598 388 L 628 452 L 652 450 L 652 517 L 651 558 L 625 576 L 595 590 L 566 600 L 548 593 L 523 539 L 523 505 L 508 479 L 469 479 L 443 463 L 434 428 L 450 403 Z" class="jsx-d06c553568f5d942"></path>
```

**Base styles (from design tokens):**

```css
.jsx-d06c553568f5d942 {
  background: #10174a;
  padding: 4px;
}```

## Component Rules

- Match class names exactly from the patterns above
- Each component instance must be visually identical to others of its type
- Do not add extra wrappers or change the DOM structure
- Use `#1e1e1e` for all dividers within components
- Use `#cb840e` for all interactive/active states

