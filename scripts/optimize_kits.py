from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "public" / "kits" / "generated"
OUTPUT_DIR = ROOT / "public" / "kits" / "optimized"
CANVAS_SIZE = 512
CONTENT_SIZE = 500


def optimize(source: Path) -> None:
    image = Image.open(source).convert("RGBA")
    image.thumbnail((CONTENT_SIZE, CONTENT_SIZE), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    x = (CANVAS_SIZE - image.width) // 2
    y = (CANVAS_SIZE - image.height) // 2
    canvas.alpha_composite(image, (x, y))
    canvas.save(OUTPUT_DIR / f"{source.stem}.webp", "WEBP", lossless=True, method=6)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = sorted(SOURCE_DIR.glob("*.png"))
    for source in sources:
        optimize(source)
        print(f"optimized {source.stem}")


if __name__ == "__main__":
    main()
