from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
KIT_DIR = ROOT / "public" / "kits" / "generated"
TARGETS = ("bre", "eve", "lee")


def is_background(pixel: tuple[int, int, int]) -> bool:
    red, green, blue = pixel
    return min(pixel) >= 232 and max(pixel) - min(pixel) <= 8


def remove_background(path: Path) -> None:
    source = Image.open(path).convert("RGB")
    width, height = source.size
    pixels = source.load()
    outside = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def add(x: int, y: int) -> None:
        index = y * width + x
        if not outside[index] and is_background(pixels[x, y]):
            outside[index] = 1
            queue.append((x, y))

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(height):
        add(0, y)
        add(width - 1, y)

    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= next_x < width and 0 <= next_y < height:
                add(next_x, next_y)

    output = source.convert("RGBA")
    alpha = Image.new("L", (width, height), 255)
    alpha.putdata([0 if value else 255 for value in outside])
    output.putalpha(alpha)
    output.save(path, optimize=True)


def main() -> None:
    for code in TARGETS:
        path = KIT_DIR / f"{code}.png"
        remove_background(path)
        print(f"removed baked background from {code}")


if __name__ == "__main__":
    main()
