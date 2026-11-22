---
inclusion: always
---

# Layout, access and words

## Layout numbers (measured, not estimated)

| Rule | Value |
|---|---|
| Edge inset to viewport and to any clipping edge | at least 16 px |
| Gap between distinct interactive targets | at least 12 px, shortest straight line between rectangles |
| Interactive target size | at least 44 by 44 px |
| Smallest visible text | 12 px |
| Body text and inputs | 16 px |
| Labels | 14 px |
| Contrast, normal text | at least 4.5 to 1 |
| Contrast, meaningful graphics and focus rings | at least 3 to 1 |
| Required sizes | 360 by 640 and 1920 by 1080 |

- No horizontal page scroll. No sticky overlay or decoration over text. Actions follow their form in normal flow.
- Dense maps are never grids of tiny buttons. Every map selection has an equal list selection.
- Churchyard ink `#22252C` on `#FAF5E9`. Garden ink `#1B312A` on `#F7F5E8`. Test every theme state, including high contrast.
- Map key sits directly below the map: Free (open outline), Reserved (slash), Taken (solid centre), Unusable (cross). The word always appears with its symbol. "Needs checking" uses a dotted outline.

## Motion

- Honour the system reduced motion setting and the app setting. The app setting wins when set.
- With reduced motion, nothing animates: no mist, no transitions, no smooth scroll.
- High contrast removes decorative mist.

## Keyboard and focus

- Every action works by keyboard. Drawing has a keyboard form ("East", "North", "Add point").
- Escape closes the top dialog and focus returns to its trigger.
- On an error, focus moves to the first invalid field.
- Browser Back keeps the filter, highlighted plot and scroll position.

## Words

- Plain short words. Direct verbs. One main action per screen.
- No dashes between words in any text a user sees. Write "read only", "half open", "set up". Use a full stop or a comma instead of a dash between clauses. The middle dot `·` is the only separator in summaries such as "Y07 · Yew Walk · Taken".
- No mystery icons, no "Do it", no hidden phone only instructions, no development words in the register.
- Input labels are the accessible names.
- Use only words from the copy catalog. Braces in the catalog are escaped values from committed data.
- Never claim a page physically printed. Never say "Saved" before the transaction completes.
