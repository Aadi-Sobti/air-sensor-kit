"""Generates the 3D-printable indoor Home Beacon case (STL files). Pilot prototype, not a product.

Two printed parts, closed with 4 x M3 self-tapping screws:
  * front.stl - front panel + four walls. Front: OLED window, two 30 mm button holes ("I'm OK" / "I need
                help"), a thin light window for the alarm LED strip, label recesses. Top: siren grille.
                Right side: USB-C opening. Inside: holders for the board, the siren and the LED strip.
  * back.stl  - back plate: wall-mount keyholes, a cradle for the battery pack, a driver-board pocket with ledges
                and zip-tie slots outside its rails
                for the small driver board, and two fingers that keep the radio board pressed forward.

Run:  hardware/.venv/bin/python hardware/beacon/make_beacon_case.py [--preview DIR]
Needs: manifold3d (Apache-2.0), numpy (BSD); matplotlib only for --preview. Shared helpers come from
hardware/enclosure/make_enclosure.py. All sizes in millimetres; sources are in README.md -> "Part sizes".
Coordinates: x right, y back (front face inner surface at y = 0), z up (inside floor at z = 0).
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from manifold3d import Manifold

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "enclosure"))
from make_enclosure import box, cyl, rounded_box, write_stl  # noqa: E402  (shared helpers)


@dataclass(frozen=True)
class Parts:
    # Heltec WiFi LoRa 32 V3: 50.2 x 25.5 x 10.2 mm (Heltec datasheet V3.2, "Dimensions")
    board_l: float = 50.2
    board_w: float = 25.5
    board_t: float = 10.2
    # From the OLED face: the circuit board's front is ~5.5 mm back and its back ~7.1 mm back (datasheet drawing,
    # section 4); only the battery socket near the USB end sticks out further behind it (to board_t).
    pcb_front: float = 5.5
    pcb_back: float = 7.1
    back_parts_from_usb_end: float = 14.0  # conservative zone for the battery socket on the back
    # OLED window, measured along the board from its antenna end (opposite USB-C). NOT in the datasheet text:
    # measure before printing (the window is deliberately generous).
    oled_from_end: float = 7.0
    oled_len: float = 27.0
    oled_h: float = 15.0
    # Alarm: the Amazon prototype part, a square 12 V piezo siren with mounting ears, 47 x 39 x 23.5 mm (Wishiot
    # listing, 6-15 V, 110 dB claimed at 1 m). For the round SparkFun COM-13939 use 35.8 x 35.8 x 35.7.
    siren_l: float = 47.0  # along the width of the case
    siren_w: float = 39.0  # front to back
    siren_h: float = 23.5
    # Adafruit 30 mm arcade button (3487/3489): needs a 30 mm hole (Adafruit listing). Body size behind the panel is
    # not published: measure before printing.
    button_hole_d: float = 30.0
    button_body_d: float = 33.0
    button_body_depth: float = 33.0
    # Adafruit 354 Li-ion pack 2 x 18650: 69 x 37 x 18 mm (Adafruit listing)
    batt_l: float = 69.0
    batt_w: float = 37.0
    batt_t: float = 18.0
    # Driver board: a 2 x 8 cm perfboard (Adafruit 4858 / Sscon, 6 x 28 holes, 2.54 mm pitch) cut down to 50-53 mm
    # long; 20 mm wide, 1.6 mm thick; parts on it up to ~15 mm tall. The first row of holes is ~3.6 mm in from each
    # long edge, so the 1.5 mm support ledges under those edges stay clear of solder joints. (The FeatherWing Proto,
    # 50.9 x 22.9 mm, is out of stock, and changing proto_l/w alone doesn't fit it: at 22.9 mm the lower zip-tie slot
    # hits the battery cradle, so the pocket would also have to move.)
    proto_l: float = 53.0
    proto_w: float = 20.0
    proto_parts: float = 15.0
    # 12 V LED strip segment: 50 mm long, 10.5 mm wide, 3 mm thick (Adafruit 12 V flexi-strip spec)
    led_l: float = 50.0
    led_w: float = 10.5
    led_t: float = 3.0


@dataclass(frozen=True)
class Fit:
    wall: float = 2.4
    front: float = 3.0  # arcade buttons clamp panels up to ~20 mm thick
    back: float = 3.0
    gap: float = 0.5
    led_skin: float = 0.8  # light shows through ~4 layers of white plastic
    inner_w: float = 112.0
    inner_h: float = 96.0
    inner_d: float = 56.0
    boss_d: float = 7.0
    screw_pilot: float = 2.5  # M3 self-tapping into plastic
    screw_clear: float = 3.4


P, F = Parts(), Fit()
W, H, D = F.inner_w, F.inner_h, F.inner_d

# ---- layout ----
BOARD_X1 = W - 0.8  # USB-C end close to the right wall so the plug reaches the socket
BOARD_X0 = BOARD_X1 - P.board_l
BOARD_Z0, BOARD_Z1 = 62.0, 62.0 + P.board_w
BOARD_Y0, BOARD_Y1 = F.gap, F.gap + P.board_t  # OLED side against the front panel
SIREN_X, SIREN_Y = 31.0, 25.0  # centre of the siren's footprint (clear of the top-left screw boss)
RIB_DEPTH = 9.0  # board holders reach past the circuit board's edge (it sits ~5.5-7.1 mm behind the OLED face)
SIREN_Z0 = H - P.siren_h - 0.5
LED_X0, LED_Z0 = BOARD_X0, 49.0
BTN = [(30.0, 26.0), (82.0, 26.0)]  # (x, z) centres: left = "I'm OK" (green), right = "I need help" (red)
BATT_X0 = (W - P.batt_l) / 2
BATT_Y0 = D - P.batt_t - F.gap
BATT_Z0 = 2.5  # above the back plate's alignment lip
PROTO_X0 = 52.0
PROTO_Z1 = 68.5  # top edge of the pocket, kept 2 mm under the radio board's back finger
PROTO_Z0 = PROTO_Z1 - P.proto_w - 0.6
PROTO_X1 = PROTO_X0 + P.proto_l + 0.6
PROTO_FACE = D - 3 - 1.6  # front face of the driver board; the rails come up to this level so they hold it sideways
# two zip ties, centred on the pocket and 39.6 mm apart: on a ~51 mm board centred in the pocket each sits ~6 mm from an end
TIE_X = ((PROTO_X0 + PROTO_X1) / 2 - 19.8, (PROTO_X0 + PROTO_X1) / 2 + 19.8)
TIE_SLOT_H = 3.3
# battery strap: one strap around the middle of the pack, through slots just outside the cradle's side walls
BATT_BX0, BATT_BX1 = BATT_X0 - F.gap, BATT_X0 + P.batt_l + F.gap
STRAP_ZC, STRAP_W = BATT_Z0 + P.batt_w / 2, 13.0  # slot fits a hook-and-loop strap up to 12 mm wide, or a long zip tie
STRAP_SLOTS = ((BATT_BX0 - 1.6 - 0.5 - 3.5, BATT_BX0 - 1.6 - 0.5), (BATT_BX1 + 1.6 + 0.5, BATT_BX1 + 1.6 + 0.5 + 3.5))
BACK_GROOVE = 1.5  # depth of the grooves on the outside face that the strap and ties lie in
BOSSES = [(3.5, 3.5), (W - 3.5, 3.5), (3.5, H - 3.5), (W - 3.5, H - 3.5)]  # (x, z)


def xz_rounded(x0, z0, y0, x1, z1, y1, r) -> Manifold:
    """Box rounded on its x/z corners (rounded_box rounds x/y): build in (x, z, y) and swap axes."""
    # rotate 90 deg about x maps (x, y, z) -> (x, -z, y); the mirror then gives (x, z, y) -> (x, y, z)
    return rounded_box(x0, z0, y0, x1, z1, y1, r).rotate([90, 0, 0]).mirror([0, 1, 0])


def ycyl(x, z, y0, y1, d) -> Manifold:
    """Cylinder along y (through the front or back panel)."""
    return Manifold.cylinder(y1 - y0, d / 2).rotate([-90, 0, 0]).translate([x, y0, z])


def make_front() -> Manifold:
    ox0, ox1 = -F.wall, W + F.wall
    oz0, oz1 = -F.wall, H + F.wall
    # rounded_box rounds its x/y corners; build it in (x, z, y) space and swap axes so the front outline is rounded.
    shell = xz_rounded(ox0, oz0, -F.front, ox1, oz1, D, 4.0)
    shell -= box(0, 0, 0, W, D + 1, H)
    # OLED window (chamfered outside so the screen is readable at an angle)
    ow0 = BOARD_X0 + P.oled_from_end
    oz = (BOARD_Z0 + BOARD_Z1) / 2
    shell -= box(ow0, -F.front - 1, oz - P.oled_h / 2, ow0 + P.oled_len, 0.5, oz + P.oled_h / 2)
    shell -= Manifold.batch_hull([box(ow0, -0.6, oz - P.oled_h / 2, ow0 + P.oled_len, -0.59, oz + P.oled_h / 2),
                                  box(ow0 - 2, -F.front - 0.01, oz - P.oled_h / 2 - 2, ow0 + P.oled_len + 2,
                                      -F.front, oz + P.oled_h / 2 + 2)])
    # button holes + label recesses below them (stickers: "I'M OK" / "I NEED HELP")
    for (x, z) in BTN:
        shell -= ycyl(x, z, -F.front - 1, 1, P.button_hole_d)
        shell -= box(x - 22, -F.front - 1, z - P.button_hole_d / 2 - 15, x + 22, -F.front + 0.6,
                     z - P.button_hole_d / 2 - 4)
    # LED light window: the panel is thinned to a skin; the strip sticks to the inside
    shell -= box(LED_X0 - 1, -F.front + F.led_skin, LED_Z0 - 1, LED_X0 + P.led_l + 1, 0.5,
                 LED_Z0 + P.led_w + 1)
    # siren grille on top: a ring of 3 mm holes over the siren
    for r, n in ((0.0, 1), (6.0, 6), (12.0, 12)):
        for i in range(n):
            a = 2 * np.pi * i / n
            shell -= cyl(SIREN_X + r * np.cos(a), SIREN_Y + r * np.sin(a), H - 1, H + F.wall + 1, 3.0)
    # USB-C opening on the right wall, in line with the board's socket
    bz = (BOARD_Z0 + BOARD_Z1) / 2
    shell -= Manifold.batch_hull([box(W - 1, BOARD_Y0, bz - 6.5, W + F.wall + 1, BOARD_Y1, bz + 6.5)])
    # screw bosses (M3 self-tapping from the back)
    for (x, z) in BOSSES:
        shell += ycyl(x, z, 0, D, F.boss_d)
        shell -= ycyl(x, z, 6, D + 1, F.screw_pilot)
    # board holders: L-shaped corner ribs around the board outline, deep enough to hold the circuit board's edge
    # (corners only: header pins run along the long edges)
    g = F.gap / 2
    for (x, z, sx, sz) in ((BOARD_X0 - g, BOARD_Z0 - g, -1, -1), (BOARD_X1 + g, BOARD_Z0 - g, 1, -1),
                           (BOARD_X0 - g, BOARD_Z1 + g, -1, 1), (BOARD_X1 + g, BOARD_Z1 + g, 1, 1)):
        if sx > 0:
            continue  # the right wall itself holds the USB end
        shell += box(min(x, x + sx * 1.6), 0, min(z, z - sz * 6), max(x, x + sx * 1.6), RIB_DEPTH,
                     max(z, z - sz * 6))
        shell += box(min(x + sx * 1.6, x - sx * 6), 0, min(z, z + sz * 1.6), max(x + sx * 1.6, x - sx * 6), RIB_DEPTH,
                     max(z, z + sz * 1.6))
    shell += box(BOARD_X1 - 12, 0, BOARD_Z0 - g - 1.6, BOARD_X1 - 4, RIB_DEPTH, BOARD_Z0 - g)  # ledge under the USB end
    # siren holder: a shelf under it and two side walls (printable: they rise from the front panel)
    sx0, sx1 = SIREN_X - P.siren_l / 2 - g, SIREN_X + P.siren_l / 2 + g
    sy1 = SIREN_Y + P.siren_w / 2 + 1
    shell += box(sx0 - 1.6, 0, SIREN_Z0 - 2.0, sx1 + 1.6, sy1, SIREN_Z0)
    for x in (sx0 - 1.6, sx1):
        shell += box(x, 0, SIREN_Z0 - 2.0, x + 1.6, sy1, SIREN_Z0 + min(14.0, P.siren_h - 2.0))
    # a hole through the shelf for the siren's wires
    shell -= cyl(SIREN_X, SIREN_Y, SIREN_Z0 - 3, SIREN_Z0 + 0.1, 12.0)
    return shell


def make_back() -> Manifold:
    ox0, ox1 = -F.wall, W + F.wall
    oz0, oz1 = -F.wall, H + F.wall
    plate = xz_rounded(ox0, oz0, D, ox1, oz1, D + F.back, 4.0)
    # a 2 mm lip that sits just inside the walls keeps the plate aligned
    lip = xz_rounded(0.3, 0.3, D - 2.0, W - 0.3, H - 0.3, D, 2.0) - box(2.0, D - 3, 2.0, W - 2.0, D + 0.01, H - 2.0)
    plate += lip
    for (x, z) in BOSSES:
        plate -= ycyl(x, z, D - 3, D + F.back + 1, F.screw_clear)
        plate -= ycyl(x, z, D + F.back - 1.6, D + F.back + 1, 6.2)  # head recess
        plate -= box(x - 4.5, D - 2.5, z - 4.5, x + 4.5, D + 0.01, z + 4.5)  # boss clearance in the lip
    # wall-mount keyholes (for #6 / 3.5 mm screw heads up to 7.5 mm)
    for x in (W * 0.25, W * 0.75):
        z = H - 22
        plate -= ycyl(x, z, D - 1, D + F.back + 1, 8.0)
        plate -= box(x - 2.1, D - 1, z, x + 2.1, D + F.back + 1, z + 9)
        plate -= ycyl(x, z + 9, D - 1, D + F.back + 1, 4.2)
    # battery cradle: walls around the pack (free height 38 mm: the alignment lip sits under it) + a strap slot
    # outside each side wall, so one strap goes up through the plate, across the pack's front and back down
    bx0, bx1 = BATT_BX0, BATT_BX1
    bz0, bz1 = BATT_Z0, BATT_Z0 + P.batt_w + F.gap
    for (x0, x1) in ((bx0 - 1.6, bx0), (bx1, bx1 + 1.6)):
        plate += box(x0, BATT_Y0 - 0.01, bz0, x1, D, bz1)
    plate += box(bx0 - 1.6, BATT_Y0 - 0.01, bz1, bx1 + 1.6, D, bz1 + 1.6)
    for (x0, x1) in STRAP_SLOTS:
        plate -= box(x0, D - 1, STRAP_ZC - STRAP_W / 2, x1, D + F.back + 1, STRAP_ZC + STRAP_W / 2)
    # driver board pocket: a 1.5 mm ledge under each long edge that the board rests on (leaving 3 mm under it for
    # solder joints), rails outside the ledges that rise to the board's front face so it can't slide sideways, and a
    # zip-tie slot just OUTSIDE each rail at both tie positions: a tie goes up through one slot, across the board's
    # front and back down through the other
    px0, pz0, px1 = PROTO_X0, PROTO_Z0, PROTO_X1
    pz1 = pz0 + P.proto_w + 0.6
    plate += box(px0 - 1.6, PROTO_FACE, pz0 - 1.6, px1 + 1.6, D, pz0)
    plate += box(px0 - 1.6, PROTO_FACE, pz1, px1 + 1.6, D, pz1 + 1.6)
    plate += box(px0, D - 3, pz0, px1, D, pz0 + 1.5)
    plate += box(px0, D - 3, pz1 - 1.5, px1, D, pz1)
    for x in TIE_X:
        plate -= box(x - 1.5, D - 1, pz0 - 1.6 - 0.5 - TIE_SLOT_H, x + 1.5, D + F.back + 1, pz0 - 1.6 - 0.5)
        plate -= box(x - 1.5, D - 1, pz1 + 1.6 + 0.5, x + 1.5, D + F.back + 1, pz1 + 1.6 + 0.5 + TIE_SLOT_H)
    # shallow grooves on the outside face join each pair of slots, so the ties and the battery strap lie flush and the
    # case still hangs flat on a wall
    for x in TIE_X:
        plate -= box(x - 1.5, D + F.back - BACK_GROOVE, pz0 - 1.6 - 0.5 - TIE_SLOT_H, x + 1.5, D + F.back + 1,
                     pz1 + 1.6 + 0.5 + TIE_SLOT_H)
    (sa0, _), (_, sb1) = STRAP_SLOTS
    plate -= box(sa0, D + F.back - BACK_GROOVE, STRAP_ZC - STRAP_W / 2, sb1, D + F.back + 1, STRAP_ZC + STRAP_W / 2)
    # two fingers that keep the radio board against the front panel: one presses the back of the circuit board at
    # the antenna end; the one above the USB end stops just behind the battery socket there
    pcb_back_y = BOARD_Y0 + P.pcb_back
    plate += box(BOARD_X0 + 0.5, pcb_back_y + 0.3, (BOARD_Z0 + BOARD_Z1) / 2 - 2,
                 BOARD_X0 + 4.5, D, (BOARD_Z0 + BOARD_Z1) / 2 + 2)
    plate += box(BOARD_X1 - 4.5, BOARD_Y1 + 0.5, BOARD_Z1 - 5.0, BOARD_X1 - 0.5, D, BOARD_Z1 - 1.0)
    return plate


def ghosts() -> dict[str, Manifold]:
    sx, sy = SIREN_X, SIREN_Y
    g = {
        # the board as three layers: front parts + OLED, the circuit board, and the battery socket near the USB end
        "radio board": box(BOARD_X0, BOARD_Y0, BOARD_Z0, BOARD_X1, BOARD_Y0 + P.pcb_back, BOARD_Z1)
        + box(BOARD_X1 - P.back_parts_from_usb_end, BOARD_Y0 + P.pcb_back, BOARD_Z0, BOARD_X1, BOARD_Y1, BOARD_Z1),
        "siren": box(sx - P.siren_l / 2, sy - P.siren_w / 2, SIREN_Z0, sx + P.siren_l / 2, sy + P.siren_w / 2,
                     SIREN_Z0 + P.siren_h),
        "battery": box(BATT_X0, BATT_Y0, BATT_Z0, BATT_X0 + P.batt_l, BATT_Y0 + P.batt_t, BATT_Z0 + P.batt_w),
        "driver board": box(PROTO_X0 + 0.3, D - 3 - P.proto_parts - 1.6, PROTO_Z0 + 0.3,
                            PROTO_X0 + 0.3 + P.proto_l, D - 3, PROTO_Z0 + 0.3 + P.proto_w),
        "LED strip": box(LED_X0, 0.0, LED_Z0, LED_X0 + P.led_l, P.led_t, LED_Z0 + P.led_w),
    }
    for i, (x, z) in enumerate(BTN):
        g[f"button {i + 1}"] = ycyl(x, z, 0.0, P.button_body_depth, P.button_body_d)
    return g


def checks(front: Manifold, back: Manifold) -> list[str]:
    problems = []
    gs = ghosts()
    for name, gm in gs.items():
        for other, label in ((front, "front"), (back, "back")):
            v = (gm ^ other).volume()
            if v > 0.01:
                problems.append(f"{name} overlaps the {label} part by {v:.1f} mm^3")
    names = list(gs)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            v = (gs[a] ^ gs[b]).volume()
            if v > 0.01:
                problems.append(f"{a} and {b} overlap by {v:.1f} mm^3")
    v = (front ^ back).volume()
    if v > 0.01:
        problems.append(f"front and back overlap by {v:.1f} mm^3")
    # each zip tie's path must be open: through the plate (both slots), up beside the rails, and across the rail tops
    # and the board's front. The driver board ghost is left out: the builder keeps these two strips free of tall parts.
    others = [front, back] + [m for n, m in gs.items() if n != "driver board"]
    pz0, pz1 = PROTO_Z0, PROTO_Z0 + P.proto_w + 0.6
    zlo, zhi = pz0 - 1.6 - 0.6 - TIE_SLOT_H + 0.1, pz1 + 1.6 + 0.6 + TIE_SLOT_H - 0.1
    for x in TIE_X:
        slots = (box(x - 1.4, PROTO_FACE - 0.1, zlo, x + 1.4, D + F.back + 0.5, pz0 - 1.6 - 0.6)
                 + box(x - 1.4, PROTO_FACE - 0.1, pz1 + 1.6 + 0.6, x + 1.4, D + F.back + 0.5, zhi))
        over = box(x - 1.4, PROTO_FACE - 1.5, zlo, x + 1.4, PROTO_FACE - 0.1, zhi)
        for label, path in (("slots", slots), ("path over the board", over)):
            for m in others:
                v = (path ^ m).volume()
                if v > 0.01:
                    problems.append(f"zip tie at x={x:.1f}: {label} blocked ({v:.1f} mm^3)")
    # the battery strap's path: through both slots, along the outside of the cradle walls and across the pack's front
    others = [front, back] + [m for n, m in gs.items() if n != "battery"]
    za, zb = STRAP_ZC - STRAP_W / 2 + 0.1, STRAP_ZC + STRAP_W / 2 - 0.1
    (sa0, sa1), (sb0, sb1) = STRAP_SLOTS
    strap = (box(sa0 + 0.1, BATT_Y0 - 1.6, za, sa1 - 0.1, D + F.back + 0.5, zb)
             + box(sb0 + 0.1, BATT_Y0 - 1.6, za, sb1 - 0.1, D + F.back + 0.5, zb)
             + box(sa0 + 0.1, BATT_Y0 - 1.6, za, sb1 - 0.1, BATT_Y0 - 0.1, zb))
    for m in others:
        v = (strap ^ m).volume()
        if v > 0.01:
            problems.append(f"battery strap path blocked ({v:.1f} mm^3)")
    # the cradle's free height must hold the pack (the lip under it and the top wall above it)
    probe = box(BATT_X0, BATT_Y0, BATT_Z0 - 0.4, BATT_X0 + P.batt_l, BATT_Y0 + P.batt_t, BATT_Z0 + P.batt_w + 0.4)
    v = (probe ^ back).volume()
    if v > 0.01:
        problems.append(f"battery cradle tighter than the pack + 0.4 mm ({v:.1f} mm^3)")
    return problems


def render(front: Manifold, back: Manifold, gs: dict[str, Manifold], out: Path) -> None:
    """PNG previews (matplotlib), reusing the sensor case's renderer."""
    import matplotlib.pyplot as plt
    from preview import _draw, _tris  # hardware/enclosure/preview.py

    out.mkdir(parents=True, exist_ok=True)
    white, grey = np.array([0.93, 0.93, 0.9]), np.array([0.6, 0.62, 0.66])
    palette = [np.array(c) for c in ((0.25, 0.6, 0.35), (0.35, 0.55, 0.85), (0.9, 0.7, 0.2), (0.6, 0.3, 0.7),
                                     (0.95, 0.95, 0.5), (0.3, 0.75, 0.3), (0.85, 0.2, 0.2))]
    gt = [(_tris(m), palette[i % len(palette)], 0.8) for i, m in enumerate(gs.values())]
    fig = plt.figure(figsize=(14, 10), dpi=100)
    _draw(fig.add_subplot(221, projection="3d"), [(_tris(front), white, 1)], 20, -70, "Front (OLED, buttons, light)")
    _draw(fig.add_subplot(222, projection="3d"), [(_tris(back), grey, 1)], 25, 110, "Back plate (inside face)")
    _draw(fig.add_subplot(223, projection="3d"), [(_tris(back), grey, 1)] + gt, 25, 110,
          "Parts on the back plate side: board, siren, battery, driver, LED, buttons")
    _draw(fig.add_subplot(224, projection="3d"), [(_tris(front), white, 1)], 60, -60, "Top: siren grille")
    fig.tight_layout()
    fig.savefig(out / "beacon_overview.png")
    plt.close(fig)


def for_printing(m: Manifold, rot_x: float) -> Manifold:
    m = m.rotate([rot_x, 0, 0])
    bb = m.bounding_box()
    return m.translate([-bb[0], -bb[1], -bb[2]])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=HERE / "stl")
    ap.add_argument("--preview", type=Path, help="write PNG previews into this folder")
    args = ap.parse_args()
    front, back = make_front(), make_back()
    problems = checks(front, back)
    for p in problems:
        print("PROBLEM:", p)
    args.out.mkdir(parents=True, exist_ok=True)
    write_stl(for_printing(front, 90), args.out / "front.stl", "home beacon front")  # front panel on the bed
    write_stl(for_printing(back, -90), args.out / "back.stl", "home beacon back")  # outer face on the bed
    both = front + back
    bb = both.bounding_box()
    print(f"assembled: {bb[3]-bb[0]:.1f} wide x {bb[4]-bb[1]:.1f} deep x {bb[5]-bb[2]:.1f} tall mm")
    for name, m in (("front", front), ("back", back)):
        print(f"{name}: solid volume {m.volume()/1000:.1f} cm^3, genus {m.genus()}, {m.num_tri()} triangles")
    print("fit checks:", "OK" if not problems else f"{len(problems)} problem(s)")
    if args.preview:
        render(front, back, ghosts(), args.preview)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
