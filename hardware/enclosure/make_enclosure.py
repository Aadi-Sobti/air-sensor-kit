"""Generates the 3D-printable sensor housing (STL files) for the v1 kit.

Two printed parts, no screws or tools:
  * shell.stl  - roof + four walls + open-bottom rain skirt + mounting ears. Fits down over the insert.
  * insert.stl - floor plate holding the PMS5003 (air openings facing down) and the NodeMCU board
                 (in four corner cradles, pins down so the jumper wires fit underneath). Two side
                 catches click into windows in the shell.

Air path (PurpleAir pattern + Plantower's rule to separate inlet and outlet): outside air comes up
through the open bottom of the skirt, through a fully open window in the floor (no grille: inlet
restriction lowers readings), into the PMS5003 inlet. The exhaust leaves on the other side of a
divider rib. Rain can't fall upward into the open bottom; the electronics sit above the floor.

Run:  hardware/.venv/bin/python hardware/enclosure/make_enclosure.py [--preview DIR]
Needs: manifold3d (Apache-2.0), numpy (BSD); matplotlib only for --preview.
All sizes are in millimetres. Part sizes and their sources are in README.md -> "Part sizes".
"""

from __future__ import annotations

import argparse
import struct
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from manifold3d import CrossSection, JoinType, Manifold, set_circular_segments

set_circular_segments(48)
HERE = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Parts:
    # Plantower PMS5003 (datasheet V2.3: 50 x 38 x 21; the PMS5003S drawing gives the face as 21.2)
    pms_l: float = 50.0  # along X; the inlet/outlet face is pms_l x pms_t
    pms_tall: float = 38.0  # standing on its inlet/outlet face
    pms_t: float = 21.2  # along Y
    # Inlet holes span 4.75-19.25 mm from one end and the fan outlet 26.8-44.8 mm (or mirrored),
    # so a 2 mm divider centred at 25 mm separates them whichever way round the sensor sits.
    pms_divider_x: float = 25.0
    pms_cable_headroom: float = 14.0  # 8-pin plug on the top face + cable bend
    # NodeMCU V3 "LoLin": sources disagree (57-59 x 30.5-31.5 mm), so a loose pocket + corner cradles
    mcu_pocket_l: float = 60.0
    mcu_pocket_w: float = 32.5
    mcu_corner_free: float = 5.0  # header pins start ~10 mm from the short edges; pads stay in 5 mm
    mcu_under_clear: float = 25.0  # 2.5 header plastic + 14 Dupont housing + wire bend
    mcu_top_parts: float = 3.5  # ESP-12 can / USB jack above the PCB
    usb_plug_clear: float = 34.0  # micro-USB overmold (~26 mm) + bend before the cable turns down


@dataclass(frozen=True)
class Fit:
    wall: float = 2.4
    floor: float = 2.4
    roof: float = 3.0
    slide: float = 0.5  # gap per side between insert and shell (FDM snap-fit guidance: 0.5)
    part: float = 0.4  # gap around the PMS
    skirt: float = 10.0  # open plenum below the floor (PurpleAir's inlet sits ~7 mm up)
    overhang: float = 5.0  # roof overhang at front and sides
    ear: float = 14.0
    ear_t: float = 3.0


P, F = Parts(), Fit()

# ---- insert layout (x right, y back, z up; z=0 = floor top; floor front-left corner at x=y=0) ----
M = 4.0
PMS_X0, PMS_Y0 = 5.5, 4.0  # clear of the left catch's flex slot
PMS_X1, PMS_Y1 = PMS_X0 + P.pms_l, PMS_Y0 + P.pms_t
SEP_Y0 = PMS_Y1 + F.part / 2 + 0.6  # separator wall: the PMS can is GND, keep it off the board's pins
SEP_Y1 = SEP_Y0 + 1.2
MCU_X0 = P.usb_plug_clear + 2.0
MCU_Y0 = SEP_Y1 + 2.0
MCU_X1, MCU_Y1 = MCU_X0 + P.mcu_pocket_l, MCU_Y0 + P.mcu_pocket_w
MCU_Z = P.mcu_under_clear  # top of the support pads
FLOOR_X = max(MCU_X1 + 1.6 + 0.6 + 1.2 + 1.8, PMS_X1 + M)  # board lip + right catch
FLOOR_Y = MCU_Y1 + M
INNER_H = max(P.pms_tall + P.pms_cable_headroom, MCU_Z + 1.6 + P.mcu_top_parts + 8.0)
USB_Z = MCU_Z + 1.6 + 1.15  # micro-USB centre height
# side catches: in-plane flexure beams in the floor plate (they flex sideways, so print layers don't split)
BEAM_L, BEAM_W, BEAM_GAP, HOOK, HOOK_L = 22.0, 1.8, 1.2, 0.9, 7.0
BEAM_LEFT_Y0 = 6.0
BEAM_RIGHT_Y0 = MCU_Y0 + 2.0


def box(x0, y0, z0, x1, y1, z1) -> Manifold:
    return Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def rounded_box(x0, y0, z0, x1, y1, z1, r) -> Manifold:
    cs = CrossSection.square([x1 - x0 - 2 * r, y1 - y0 - 2 * r]).translate([r, r]).offset(r, JoinType.Round)
    return cs.extrude(z1 - z0).translate([x0, y0, z0])


def cyl(x, y, z0, z1, d) -> Manifold:
    return Manifold.cylinder(z1 - z0, d / 2).translate([x, y, z0])


def hook(x_edge: float, y0: float, outward: int) -> Manifold:
    """Catch bump on a beam: ramp on top (the shell slides past it), flat underneath (it locks)."""
    prof = CrossSection([[(0, -F.floor), (HOOK, -F.floor), (HOOK, -F.floor + 0.6), (0, 0)]])  # (out, z)
    h = prof.extrude(HOOK_L).rotate([90, 0, 0]).translate([0, y0 + HOOK_L, 0])
    if outward < 0:
        h = h.mirror([1, 0, 0])
    return h.translate([x_edge, 0, 0])


def flexure_cut(x_edge: float, y0: float, inward: int) -> Manifold:
    """Slot that frees a beam along the floor edge (fixed at y0, free at y0 + BEAM_L)."""
    xa = x_edge + inward * BEAM_W
    xb = xa + inward * BEAM_GAP
    slot = box(min(xa, xb), y0, -F.floor - 1, max(xa, xb), y0 + BEAM_L + BEAM_GAP, 1)
    end = box(min(x_edge - inward, xb), y0 + BEAM_L, -F.floor - 1, max(x_edge - inward, xb),
              y0 + BEAM_L + BEAM_GAP, 1)
    return slot + end


def mcu_corners():
    return [(MCU_X0, MCU_Y0, 1, 1), (MCU_X1, MCU_Y0, -1, 1), (MCU_X0, MCU_Y1, 1, -1), (MCU_X1, MCU_Y1, -1, -1)]


def make_insert() -> Manifold:
    floor = rounded_box(0, 0, -F.floor, FLOOR_X, FLOOR_Y, 0, 2.0)
    # fully open window under the PMS inlet/outlet face; it rests on 2 mm ledges at each end
    floor -= box(PMS_X0 + 2.0, PMS_Y0, -F.floor - 1, PMS_X1 - 2.0, PMS_Y1, 1)
    # slot for the shell's divider rib
    dx = PMS_X0 + P.pms_divider_x
    floor -= box(dx - 1.5, -1, -F.floor - 1, dx + 1.5, PMS_Y1 + 0.5, 1)
    # USB cable slot, open to the left edge so the cable drops in sideways
    cy = (MCU_Y0 + MCU_Y1) / 2
    floor -= box(-1, cy - 4.5, -F.floor - 1, P.usb_plug_clear - 6.0, cy + 4.5, 1)
    # future humidity sensor: wire hole into the plenum (sensor taped under the floor, in outside air)
    floor -= cyl(FLOOR_X - 9, PMS_Y0 + 5, -F.floor - 1, 1, 6.0)
    # zip-tie slots for the PMS adapter board (front-right bay)
    ax, ay = (PMS_X1 + FLOOR_X) / 2, PMS_Y0 + 8
    for sx in (-1, 1):
        floor -= box(ax + sx * 5 - 1.5, ay - 2, -F.floor - 1, ax + sx * 5 + 1.5, ay + 2, 1)
    # side catches
    floor -= flexure_cut(0.0, BEAM_LEFT_Y0, +1)
    floor -= flexure_cut(FLOOR_X, BEAM_RIGHT_Y0, -1)
    parts = floor + hook(0.0, BEAM_LEFT_Y0 + BEAM_L - HOOK_L - 1, -1) + \
        hook(FLOOR_X, BEAM_RIGHT_Y0 + BEAM_L - HOOK_L - 1, +1)

    # PMS cradle: four L-brackets, 18 mm tall (the shell's hold-down post keeps it seated)
    c, t, leg, h = F.part / 2, 1.8, 8.0, 18.0
    for (x, y, sx, sy) in ((PMS_X0 - c, PMS_Y0 - c, -1, -1), (PMS_X1 + c, PMS_Y0 - c, 1, -1),
                           (PMS_X0 - c, PMS_Y1 + c, -1, 1), (PMS_X1 + c, PMS_Y1 + c, 1, 1)):
        parts += box(min(x, x + sx * t), min(y, y - sy * leg), 0, max(x, x + sx * t), max(y, y - sy * leg), h)
        parts += box(min(x + sx * t, x - sx * leg), min(y, y + sy * t), 0,
                     max(x + sx * t, x - sx * leg), max(y, y + sy * t), h)
    # separator wall between the PMS can (GND) and the board's pins / jumper wires
    parts += box(MCU_X0 - 2, SEP_Y0, 0, MCU_X1, SEP_Y1, 20.0)
    # NodeMCU corner cradles: a support pad under each corner + an L-lip around the outside corner
    for (x, y, sx, sy) in mcu_corners():
        pad = box(min(x, x + sx * P.mcu_corner_free), min(y, y + sy * P.mcu_corner_free), 0,
                  max(x, x + sx * P.mcu_corner_free), max(y, y + sy * P.mcu_corner_free), MCU_Z)
        lip = box(min(x, x - sx * 1.6), min(y, y + sy * 8), 0, max(x, x - sx * 1.6), max(y, y + sy * 8), MCU_Z + 2.6)
        lip += box(min(x, x + sx * 8), min(y, y - sy * 1.6), 0, max(x, x + sx * 8), max(y, y - sy * 1.6), MCU_Z + 2.6)
        parts += pad + lip
    return parts


# ---- shell (same coordinates as the insert when assembled) ----
IX0, IY0 = -F.slide, -F.slide
IX1, IY1 = FLOOR_X + F.slide, FLOOR_Y + F.slide
OX0, OY0 = IX0 - F.wall, IY0 - F.wall
OX1, OY1 = IX1 + F.wall, IY1 + F.wall
Z_BOT = -F.floor - F.skirt
Z_CEIL = INNER_H
Z_TOP = Z_CEIL + F.roof


def make_shell() -> Manifold:
    shell = rounded_box(OX0, OY0, Z_BOT, OX1, OY1, Z_CEIL, 3.0) - box(IX0, IY0, Z_BOT - 1, IX1, IY1, Z_CEIL)
    # roof with overhang at front and sides (flush at the back for wall mounting) + drip lip
    o = F.overhang
    shell += rounded_box(OX0 - o, OY0 - o, Z_CEIL, OX1 + o, OY1, Z_TOP, 4.0)
    shell += rounded_box(OX0 - o, OY0 - o, Z_CEIL - 1.5, OX1 + o, OY1, Z_CEIL, 4.0) - \
        rounded_box(OX0 - o + 1.5, OY0 - o + 1.5, Z_CEIL - 2, OX1 + o - 1.5, OY1 + 1, Z_CEIL + 1, 2.5)
    # stop ribs in the four corners: the insert's floor stops against them (45 deg on top for printing)
    for (x0, x1) in ((IX0, IX0 + 8), (IX1 - 8, IX1)):
        for (y0, y1, back) in ((IY0, IY0 + 1.6, False), (IY1 - 1.6, IY1, True)):
            yw = y1 if back else y0
            shell += Manifold.batch_hull([box(x0, y0, 0.0, x1, y1, 1.0),
                                          box(x0, yw - 0.005, 1.0, x1, yw + 0.005, 2.6)])
    # divider rib in the plenum, from the front wall to the back of the PMS
    dx = PMS_X0 + P.pms_divider_x
    shell += box(dx - 1.0, IY0, Z_BOT, dx + 1.0, PMS_Y1, 0.0)
    # hold-down posts: on top of the PMS (between the two possible connector spots) and on the board corners
    shell += box(dx - 2.5, PMS_Y0 + 6, P.pms_tall + 0.6, dx + 2.5, PMS_Y1 - 6, Z_CEIL)
    for (x, y, sx, sy) in mcu_corners():
        px, py = x + sx * 2.5, y + sy * 2.5
        shell += box(px - 1.6, py - 1.6, MCU_Z + 1.6 + 0.8, px + 1.6, py + 1.6, Z_CEIL)
    # windows for the side catches (press the catch in here to release)
    for (x0, x1, y0) in ((OX0 - 1, IX0 + 0.1, BEAM_LEFT_Y0), (IX1 - 0.1, OX1 + 1, BEAM_RIGHT_Y0)):
        yh = y0 + BEAM_L - HOOK_L - 1
        shell -= box(x0, yh - 0.6, -F.floor - 0.4, x1, yh + HOOK_L + 0.6, 0.4)
    # air notches at the bottom of the skirt so it breathes when standing on a shelf
    for xc in (FLOOR_X * 0.3, FLOOR_X * 0.72):
        shell -= box(xc - 8, OY0 - 1, Z_BOT - 1, xc + 8, OY1 + 1, Z_BOT + 4)
    shell -= box(OX0 - 1, FLOOR_Y / 2 - 8, Z_BOT - 1, OX1 + 1, FLOOR_Y / 2 + 8, Z_BOT + 4)
    # label recess on the front for the sensor-code sticker (52 x 22 mm, 0.6 deep)
    lx = (OX0 + OX1) / 2
    shell -= box(lx - 26, OY0 - 1, Z_CEIL - 32, lx + 26, OY0 + 0.6, Z_CEIL - 10)
    # mounting ears: screw holes (#8 / 4 mm) + a strap slot for a pole or railing
    for side in (-1, 1):
        x0, x1 = (OX0 - F.ear, OX0 + 1) if side < 0 else (OX1 - 1, OX1 + F.ear)
        ear = rounded_box(x0, OY1 - F.ear_t, Z_BOT, x1, OY1, Z_TOP, 1.5)
        ex = (x0 + x1) / 2 - side * 0.5
        for z in (Z_BOT + 9, Z_TOP - 9):
            ear -= Manifold.cylinder(F.ear_t + 2, 2.3).rotate([-90, 0, 0]).translate([ex, OY1 - F.ear_t - 1, z])
        zm = (Z_BOT + Z_TOP) / 2
        ear -= box(ex - 2, OY1 - F.ear_t - 1, zm - 7, ex + 2, OY1 + 1, zm + 7)
        shell += ear
    return shell


# ---- stand-in parts for fit checks ----
def ghosts() -> dict[str, Manifold]:
    pms = box(PMS_X0, PMS_Y0, 0.0, PMS_X1, PMS_Y1, P.pms_tall)
    # the biggest board the sources allow (59 x 31.5), centred in the pocket
    bx0, by0 = MCU_X0 + (P.mcu_pocket_l - 59) / 2, MCU_Y0 + (P.mcu_pocket_w - 31.5) / 2
    mcu = box(bx0, by0, MCU_Z, bx0 + 59, by0 + 31.5, MCU_Z + 1.6) + \
        box(bx0 + 8, by0 + 4, MCU_Z + 1.6, bx0 + 59 - 6, by0 + 31.5 - 4, MCU_Z + 1.6 + P.mcu_top_parts)
    # header pins + Dupont housings under the board (rows ~1.5 mm in from the long edges, 15 pins centred)
    pins = Manifold()
    for yy in (by0 + 1.5, by0 + 31.5 - 1.5):
        pins += box(bx0 + 29.5 - 19.05, yy - 1.27, MCU_Z - 16.5, bx0 + 29.5 + 19.05, yy + 1.27, MCU_Z)
    # micro-USB plug overmold (Molex 68784: 10.8 x 6.4 x 25.6) + metal plug, on the left short edge
    plug = box(bx0 - 0.5 - 25.6 - 2.0, (by0 + 15.75) - 5.4, USB_Z - 3.2, bx0 - 0.5 - 2.0, (by0 + 15.75) + 5.4, USB_Z + 3.2)
    return {"PMS5003": pms, "NodeMCU": mcu, "jumpers": pins, "USB plug": plug}


def checks(insert: Manifold, shell: Manifold) -> list[str]:
    problems = []
    for name, g in ghosts().items():
        for other, label in ((insert, "insert"), (shell, "shell")):
            v = (g ^ other).volume()
            if v > 0.01:
                problems.append(f"{name} overlaps the {label} by {v:.1f} mm^3")
    v = (insert ^ shell).volume()
    if v > 0.01:
        problems.append(f"insert overlaps shell by {v:.1f} mm^3")
    # the catches must be free to flex: nothing may bridge their slots
    for x_edge, y0, inward in ((0.0, BEAM_LEFT_Y0, 1), (FLOOR_X, BEAM_RIGHT_Y0, -1)):
        xa, xb = x_edge + inward * BEAM_W, x_edge + inward * (BEAM_W + BEAM_GAP)
        gap = box(min(xa, xb) + 0.05, y0, -F.floor, max(xa, xb) - 0.05, y0 + BEAM_L, INNER_H)
        if (gap ^ insert).volume() > 0.01:
            problems.append(f"something bridges the catch slot at x={x_edge:.0f}")
    if PMS_X0 + P.pms_divider_x - 1.0 < PMS_X0 + 19.25 or PMS_X0 + P.pms_divider_x + 1.0 > PMS_X0 + 26.8:
        problems.append("divider rib hits the PMS inlet holes or fan")
    return problems


def write_stl(m: Manifold, path: Path, name: str) -> None:
    mesh = m.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3].astype(np.float32)
    tri = v[np.asarray(mesh.tri_verts).astype(np.int64)]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    rec = np.zeros(len(tri), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
    rec["n"], rec["v"] = n.astype(np.float32), tri
    with open(path, "wb") as fh:
        fh.write(name.encode().ljust(80, b" ")[:80])
        fh.write(struct.pack("<I", len(tri)))
        fh.write(rec.tobytes())


def for_printing(m: Manifold, flip: bool) -> Manifold:
    """Shell prints roof-down (no supports); insert prints floor-down."""
    if flip:
        m = m.rotate([180, 0, 0])
    bb = m.bounding_box()
    return m.translate([-bb[0], -bb[1], -bb[2]])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=HERE / "stl")
    ap.add_argument("--preview", type=Path, help="write PNG previews into this folder")
    args = ap.parse_args()
    insert, shell = make_insert(), make_shell()
    problems = checks(insert, shell)
    for p in problems:
        print("PROBLEM:", p)
    args.out.mkdir(parents=True, exist_ok=True)
    write_stl(for_printing(insert, flip=False), args.out / "insert.stl", "air sensor insert")
    write_stl(for_printing(shell, flip=True), args.out / "shell.stl", "air sensor shell")
    bb = shell.bounding_box()
    body = (OX1 - OX0, OY1 - OY0, Z_TOP - Z_BOT)
    print(f"body: {body[0]:.1f} x {body[1]:.1f} x {body[2]:.1f} mm; with ears and roof overhang: "
          f"{bb[3]-bb[0]:.1f} x {bb[4]-bb[1]:.1f} mm")
    print(f"insert floor: {FLOOR_X:.1f} x {FLOOR_Y:.1f} mm; inside height {INNER_H:.1f} mm")
    for name, m in (("insert", insert), ("shell", shell)):
        print(f"{name}: solid volume {m.volume()/1000:.1f} cm^3, watertight genus {m.genus()}, {m.num_tri()} triangles")
    print("fit checks:", "OK" if not problems else f"{len(problems)} problem(s)")
    if args.preview:
        sys.path.insert(0, str(HERE))
        from preview import render

        render(insert, shell, ghosts(), args.preview)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
