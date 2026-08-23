# Premier League kit assets

Outfield source PNGs live in `generated/`; their dashboard WebP files live in
`optimized/`. Goalkeeper source PNGs live in `generated-gk/`; their dashboard
WebP files live in `optimized-gk/`.

Use the lowercase three-letter FPL club code as the filename:

```text
ars.png
avl.png
bou.png
bre.png
bha.png
bur.png
che.png
cry.png
eve.png
ful.png
lee.png
liv.png
mci.png
mun.png
new.png
nfo.png
sun.png
tot.png
whu.png
wol.png
```

Keep the source PNGs unchanged. Goalkeeper shirts are deliberately long-sleeved.
`src/App.tsx` selects `optimized-gk/` only when the FPL player position is `GK`.
Run `python scripts/prepare_gk_kits.py` after changing a goalkeeper source PNG.
