from pathlib import Path

from prepare_kits import prepare


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "kits" / "generated-gk"
OUTPUT = ROOT / "public" / "kits" / "optimized-gk"
OUTPUT.mkdir(parents=True, exist_ok=True)
for source in sorted(SOURCE.glob("*.png")):
    prepare(source, OUTPUT / f"{source.stem}.webp")
    print(f"Prepared {source.name}")
