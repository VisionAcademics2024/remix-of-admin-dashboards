"""
Placeholder visionOS-style environments.

These stand in until real HD photography is dropped into public/environments/.
They are deliberately abstract — soft depth, a horizon, a light source and film
grain — because glass only reads as glass when there is something behind it with
tonal range. A flat colour makes the whole material look like grey plastic.

Regenerate with:  python3 scripts/generate-environments.py
"""

import numpy as np
from PIL import Image, ImageFilter

W, H = 2560, 1440
rng = np.random.default_rng(7)


def value_noise(shape, octaves=3, persistence=0.5):
    """Smooth multi-octave noise, upsampled from coarse grids."""
    h, w = shape
    total = np.zeros(shape, dtype=np.float32)
    amplitude, norm = 1.0, 0.0
    for octave in range(octaves):
        res = 2 ** (octave + 1)
        grid = rng.random((res + 1, int(res * w / h) + 1)).astype(np.float32)
        layer = np.array(
            Image.fromarray((grid * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC),
            dtype=np.float32,
        ) / 255.0
        total += layer * amplitude
        norm += amplitude
        amplitude *= persistence
    return total / norm


def vertical_ramp(h, w, stops):
    """stops: [(position 0-1, (r,g,b))] blended down the frame."""
    ys = np.linspace(0.0, 1.0, h, dtype=np.float32)
    out = np.zeros((h, 3), dtype=np.float32)
    positions = [s[0] for s in stops]
    colours = np.array([s[1] for s in stops], dtype=np.float32)
    for channel in range(3):
        out[:, channel] = np.interp(ys, positions, colours[:, channel])
    return np.repeat(out[:, None, :], w, axis=1)


def radial_glow(h, w, cx, cy, radius, colour, strength):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx / w) - cx) ** 2 + (((yy / h) - cy) * (h / w)) ** 2)
    falloff = np.clip(1.0 - d / radius, 0.0, 1.0) ** 2.2
    return falloff[..., None] * np.array(colour, dtype=np.float32) * strength


def build(name, ramp_stops, glows, noise_tint, noise_amount, grain=5.0, vignette=0.55):
    base = vertical_ramp(H, W, ramp_stops)

    # Large soft clouds of tint give the frame depth without reading as texture.
    n = value_noise((H, W), octaves=3)
    n = (n - n.mean()) / (n.std() + 1e-6)
    base += n[..., None] * np.array(noise_tint, dtype=np.float32) * noise_amount

    for cx, cy, radius, colour, strength in glows:
        base += radial_glow(H, W, cx, cy, radius, colour, strength)

    # Vignette keeps attention centre-frame, the way a real lens would.
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx / W) - 0.5) ** 2 + (((yy / H) - 0.5) * (H / W)) ** 2)
    base *= (1.0 - np.clip(d / 0.78, 0, 1) ** 2 * vignette)[..., None]

    base += rng.normal(0, grain, (H, W, 1)).astype(np.float32)

    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    img = img.filter(ImageFilter.GaussianBlur(radius=6))
    img.save(f"public/environments/{name}.jpg", quality=82, optimize=True, progressive=True)

    # A tiny blurred twin loads first so the frame is never empty.
    img.resize((64, 36), Image.LANCZOS).save(
        f"public/environments/{name}-thumb.jpg", quality=60, optimize=True
    )
    print(f"  {name}.jpg")


print("environments →")

# The default. Near-black with a slow indigo bloom — glass reads brightest here.
build(
    "observatory",
    [(0.0, (7, 9, 20)), (0.45, (14, 17, 38)), (0.78, (23, 25, 54)), (1.0, (9, 10, 24))],
    [
        (0.26, 0.16, 0.78, (58, 74, 168), 0.78),
        (0.84, 0.78, 0.62, (96, 48, 138), 0.42),
    ],
    noise_tint=(18, 20, 42),
    noise_amount=0.22,
)

# Warm horizon, for people who find the dark one severe.
build(
    "sunrise",
    [(0.0, (18, 20, 46)), (0.42, (52, 38, 74)), (0.72, (128, 74, 82)), (1.0, (36, 26, 48))],
    [
        (0.60, 0.74, 0.70, (214, 132, 82), 0.80),
        (0.20, 0.28, 0.45, (60, 62, 128), 0.30),
    ],
    noise_tint=(30, 24, 30),
    noise_amount=0.20,
)

# Cool and quiet — the calmest of the four to read dense tables against.
build(
    "glacier",
    [(0.0, (12, 22, 38)), (0.40, (22, 42, 66)), (0.75, (36, 66, 92)), (1.0, (14, 26, 42))],
    [
        (0.72, 0.20, 0.74, (86, 140, 178), 0.62),
        (0.22, 0.78, 0.46, (40, 78, 112), 0.34),
    ],
    noise_tint=(20, 32, 44),
    noise_amount=0.20,
)

# Daylight, for the light theme. Pale enough that dark text stays readable.
build(
    "daylight",
    [(0.0, (196, 212, 236)), (0.45, (214, 224, 242)), (0.8, (226, 226, 238)), (1.0, (198, 204, 224))],
    [
        (0.30, 0.24, 0.60, (255, 252, 246), 0.40),
        (0.78, 0.76, 0.52, (206, 214, 240), 0.30),
    ],
    noise_tint=(16, 16, 22),
    noise_amount=0.14,
    grain=3.0,
    vignette=0.28,
)

print("done")
