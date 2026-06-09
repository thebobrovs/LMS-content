# Image prompt template (Hyperstack house style)

Copy the **STYLE block** verbatim, write a fresh **SUBJECT block**, set the aspect
ratio, and attach the anchor image. Proofread every label in the output.

---

## STYLE block — paste verbatim, never edit

```
Style: Editorial technical diagram in the "Hyperstack" house style — a clean, modern, semi-3D dimensional illustration with the polish of a Google Cloud keynote slide or premium developer documentation.
Palette: deep navy-to-slate background gradient (#0F172A → #1E293B); the brand blue→teal gradient (electric blue #2563EB → emerald-teal #10B981) as the signature accent; cool white / light-slate (#E2E8F0) for text. Use only these colors plus one warm accent (amber #F59E0B) reserved for "slow / secondary" elements.
Rendering: matte dark hardware/abstract modules with glossy edges and a soft cyan rim-light glow; glowing connection lines between components; gentle ambient depth and subtle reflections on a dark studio stage; crisp and uncluttered, not photorealistic.
Composition: generous negative space, strong reading flow, evenly spaced elements each clearly labelled, rounded 12–16px panels, translucent-blue callout boxes for captions.
Typography: clean geometric sans-serif (Inter / Google Sans style); UPPERCASE for section/tier labels, sentence case for captions; perfectly spelled, high legibility.
Mood: authoritative, calm, premium, educational — "rich but clean," soft studio key light with cyan rim accents on dark.
Avoid: photorealism, stock-photo people, neon overload, heavy lens flare, busy textures, watermarks, garbled or misspelled text, any colors outside the palette above.
```

## SUBJECT block — write fresh per image (skeleton)

```
Subject: <what the diagram shows, in one line>.
Layout / flow: <bottom→top | left→right | center-out>, <N> elements, <how they connect>.
Title across the top: "<EXACT TITLE TEXT>".
Elements (each a labelled 3D-rendered module with a translucent-blue caption box):
  1. <LABEL> — <exact caption, lifted from the lesson>.
  2. ...
Color coding: <e.g. blue = ICI, amber = DCN> — match the matching simulation.
```

---

## Worked example — Topic 1.1, "From one chip to tens of thousands"

```
Subject: a vertical 5-rung "scale ladder" showing TPU hardware scaling up, each rung physically larger than the one below, with an upward flow arrow on the left and a 3D-rendered hardware module on the right of each rung.
Layout / flow: bottom→top, 5 tiers, an upward arrow on the left threading them together.
Title across the top: "FROM ONE CHIP TO TENS OF THOUSANDS".
Elements (each a labelled 3D-rendered module with a translucent-blue caption box):
  1. CHIP — "one or more TensorCores + HBM." (a single glossy TPU chip package with a glowing die)
  2. HOST — "the VM you SSH into; it drives the chips attached to it." (a server tray holding ~4 chips)
  3. SLICE — "a block of chips wired by ICI." (a 3D cube of many chips with bright blue links)
  4. POD — "a contiguous set of chips on one ICI network — a 3D torus for training, or Boardfly for inference." (a large rack/array of slices, dense blue mesh)
  5. MULTISLICE — "multiple pods joined over the slower Data-Center Network for jobs bigger than one Pod." (several pods connected by distinct amber DCN links)
Color coding: bright blue = ICI (binds chips up to a pod); amber = DCN (only between pods) — matches the scale-hierarchy simulation.
```

**Aspect ratio:** 16:9 · **Anchor:** attach the approved scale-ladder render.
