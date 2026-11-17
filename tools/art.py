"""Cut the painted art out of its cream background and pack it as small webp files.

python3 tools/art.py   (reads art-src/, writes docs/art/)
Border-connected cream pixels fade to transparent, so soft floor shadows stay soft.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = 'art-src', 'docs/art'
CUT = {  # name: max height of the packed image
    'kid-thinking': 720, 'kid-sweating': 720, 'kid-guessing': 720, 'kid-boom': 720,
    'kid-victory': 720, 'kid-ready': 720, 'mine': 256, 'flag': 256,
}

def cutout(path, height):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(float)
    h, w, _ = a.shape
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(edge, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(-1))
    loose = dist < 70
    lab, _ = ndimage.label(loose)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(border))
    alpha = np.ones((h, w))
    ramp = np.clip((dist - 14) / (70 - 14), 0, 1)
    alpha[outside] = ramp[outside] ** 1.4
    alpha = ndimage.gaussian_filter(alpha, 0.6)
    # Un-mix the cream from half-transparent edge pixels.
    al = np.clip(alpha, 1e-3, 1)[..., None]
    rgb = np.clip((a - bg * (1 - al)) / al, 0, 255)
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    out = Image.fromarray(rgba, 'RGBA')
    box = out.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    out = out.crop(box)
    if out.height > height:
        out = out.resize((round(out.width * height / out.height), height), Image.LANCZOS)
    return out

os.makedirs(OUT, exist_ok=True)
for name, hgt in CUT.items():
    p = f'{SRC}/{name}.png'
    if not os.path.exists(p):
        continue
    img = cutout(p, hgt)
    img.save(f'{OUT}/{name}.webp', quality=88, method=6)
    print(name, img.size)
bg = Image.open(f'{SRC}/bg-desk.png').convert('RGB')
bg = bg.resize((1600, round(bg.height * 1600 / bg.width)), Image.LANCZOS)
bg.save(f'{OUT}/bg-desk.webp', quality=80, method=6)
print('bg-desk', bg.size)
