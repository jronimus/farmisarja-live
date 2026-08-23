from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "kits" / "generated-gk"
OUTPUT = ROOT / "public" / "kits" / "optimized-gk"
CANVAS = 512
TARGET_WIDTH = 430
TARGET_HEIGHT = 470

OUTPUT.mkdir(parents=True, exist_ok=True)
for source in sorted(SOURCE.glob("*.png")):
    image = Image.open(source).convert("RGBA")
    bounds = image.getbbox()
    if bounds is None:
        raise ValueError(f"No visible shirt content in {source.name}")
    shirt = image.crop(bounds)
    scale = min(TARGET_WIDTH / shirt.width, TARGET_HEIGHT / shirt.height)
    size = (round(shirt.width * scale), round(shirt.height * scale))
    shirt = shirt.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(shirt, ((CANVAS - shirt.width) // 2, (CANVAS - shirt.height) // 2))
    canvas.save(OUTPUT / f"{source.stem}.webp", "WEBP", lossless=True, method=6)
    print(f"Prepared {source.name}")
