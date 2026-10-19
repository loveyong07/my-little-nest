"""Regenerate the small UI font; requires fonttools (only for regeneration)."""
from pathlib import Path
import re
import sys
from fontTools import subset

root = Path(__file__).resolve().parent.parent
text = "".join(p.read_text(encoding="utf-8") for p in (root / "src").rglob("*") if p.suffix in {".js", ".jsx"})
# Include UI strings, basic punctuation and digits. Timeline text can load the
# original segmented font lazily on /posts; the homepage needs only this subset.
text += "".join(chr(i) for i in range(32, 127)) + "年月日时分秒上午下午中英文日本語初咏的小窝"
letter_only = "--letter" in sys.argv
if letter_only:
    # Keep new display glyphs scoped to the letter heading instead of changing
    # the existing UI font and the typography of other routes.
    locales = (root / "src/constants/locales.js").read_text(encoding="utf-8")
    text = "".join(re.findall(r"homeGreeting: \[(.*?)\]", locales))
options = subset.Options()
options.flavor = "woff"
font = subset.load_font(str(root / "archive/fonts/ZCOOLKuaiLe-Regular.ttf"), options)
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
filename = "nest-letter-2026-10-19.woff" if letter_only else "nest-ui-2026-09-30.woff"
subset.save_font(font, str(root / "public/assets/fonts" / filename), options)
print(f"Font subset saved: {filename}")
