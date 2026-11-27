"""Generates the 3D-printable case for the Help-First Home Beacon bench prototype (STL files).

Decision #39 (docs/BEACON_RECOMMENDATION.md): one bedside box with its own cell connection. Two printed parts, closed
with 4 x M3 self-tapping screws:
  * front.stl - front panel + four walls. Front: screen window, speaker grille, light window for the LED strip, a 30 mm
                green "I'm OK" button hole and a 60 mm red "I need help" button hole, label recesses. Top: siren grille
                and a hole for the LoRa antenna's SMA connector. Right side: USB-C opening. Right wall inside: a frame
                for the stick-on LTE antenna, in front of the main board. Inside: screen posts, speaker frame, siren
                holder (with a wire notch and a front stop).
  * back.stl  - back plate: battery cradle with strap slots, screw posts for the LilyGO board, a pocket for the LoRa module,
                a pocket for the 5 x 7 cm driver board, posts for the 12 V boost, the bed-shaker jack hole. It stands on
                a nightstand (no wall keyholes: the driver board covers that area). Outside: a recess for the safety label.

Every size comes from a maker's drawing or spec page (README.md -> "Part sizes"). Sizes marked MEASURE aren't
published: measure the parts when they arrive and change Parts before printing.

Run:  hardware/.venv/bin/python hardware/beacon-help-first/make_case.py [--preview DIR]
Needs: manifold3d (Apache-2.0), numpy (BSD); matplotlib only for --preview. Shared helpers come from
hardware/enclosure/make_enclosure.py. All sizes in millimetres.
Coordinates: x right, y back (front panel inner face at y = 0), z up (inside floor at z = 0).
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
    # LilyGO T-SIM7080G-S3 (PMU version): 110.5 x 32.9 mm outline, 4 x 2.0 mm holes 27.7 x 105.6 mm apart (maker DXF).
    # The 18650 holder on the back makes it about 20 mm thick overall (CNX); split below. MEASURE both heights.
    lily_l: float = 110.5
    lily_w: float = 32.9
    lily_hole_dx: float = 27.7
    lily_hole_dz: float = 105.6
    lily_hole_d: float = 2.0
    lily_back_h: float = 18.5   # 18650 holder behind the circuit board (MEASURE)
    lily_pcb: float = 1.6
    lily_front_h: float = 10.0  # ESP32 module, modem, SIM slot and soldered wires on the front side (MEASURE)
    lily_usb_from_ant_end: float = 59.2  # ESP32 USB-C (maker DXF TYPE_C): on the long edge that's on your LEFT with the
    # antenna end pointing down (parts side up), 59.2 mm from that end, sticking ~1.9 mm out past the board edge
    lily_usb_protrude: float = 1.9
    lily_ipex_from_ant_end: float = 14.0  # LTE ('NBIOT') IPEX socket, on the same edge as the USB-C (maker DXF)
    lily_screw_pilot: float = 1.5  # M1.7 (or M1.6) self-tapping screws: the DXF holes are exactly 2.00 mm, too tight for M2.
                                   # Small vertical holes print ~0.2-0.3 mm under size, so 1.5 prints near 1.2-1.3
    lily_hdr_from_ant: tuple = (67.0, 105.0)  # 16-pin header rows run 67-105 mm from the antenna end
    lily_hdr_pitch: float = 30.2  # the two header rows are 30.2 mm apart
    # Waveshare Pico-LoRa-SX1262-915M: 21 x 52 mm board (Pico layout); height not published, ~12 mm with headers.
    lora_l: float = 52.0
    lora_w: float = 21.0
    lora_h: float = 28.0  # board + female headers + jumper plugs pointing to the front (MEASURE)
    # Adafruit 5035 10,050 mAh pack: maker drawing MAX 69.0 x 56.5 x 19.0 mm (Adafruit lists 66.6 x 55.3 x 18.7)
    batt_l: float = 69.0
    batt_w: float = 56.5
    batt_t: float = 19.0
    # Square 12 V piezo siren, 47 x 39 x 23.5 mm: the Amazon Wishiot (listing) and the Mallory Sonalert PS-723BQ
    # (datasheet 47 x 39 x 23, 105 dB min at 1 m) share this body. The PS-723BQ has no ears (its screw holes are in bosses
    # inside the outline) and its leads leave one 39 mm end face at the base. MEASURE the one you get.
    siren_l: float = 47.0
    siren_w: float = 39.0
    siren_h: float = 23.5
    siren_port_from_end: float = 16.0  # PS-723BQ rev B: the round sound port (26.3 mm) on the top face is centred 16.0 mm
                                       # from the end WITHOUT the leads; the leads go out of the right-hand slot
    # Pololu U3V50F12 12 V boost (Amazon): 48 x 15 x 10.5 mm, 2 M2 holes ~43.2 x 10.2 mm apart (Pololu). The smaller
    # U3V40F12 (15.2 x 15.2 mm) sits on the driver board instead.
    boost_l: float = 48.0
    boost_w: float = 15.0
    boost_h: float = 10.5
    boost_hole_dx: float = 43.2
    boost_hole_dz: float = 10.2
    # Driver board: a 5 x 7 cm perfboard (70 x 50 mm; Adafruit 4786 / ELEGOO kit) for 4 MOSFETs laid flat, resistors,
    # the flyback diode, the shaker fuse, screw terminals and the MAX98357A amp (19.4 x 17.8 mm). Parts up to 15 mm.
    proto_l: float = 70.0
    proto_w: float = 50.0
    proto_parts: float = 15.0
    # Enclosed 3 W 4 ohm speaker (CQRobot on Amazon, 70 x 31 x 16 listing; Adafruit 3351 drawing 70.11 x 30.72 x 16.54)
    spk_l: float = 70.2
    spk_w: float = 31.0
    spk_h: float = 16.6
    # 1.3-inch 128x64 OLED: Adafruit 938 board 35.6 x 33.0, holes 2.5 mm on 30.5 x 28 mm; Hosyond (Amazon) 35.4 x 33.5,
    # holes 3.0 mm on 30.4 x 28.5. Active area 29.42 x 14.70 mm. Glass position on the board: MEASURE.
    oled_bw: float = 35.6
    oled_bh: float = 33.5
    oled_hole_dx: float = 30.45
    oled_hole_dz: float = 28.25
    oled_glass_t: float = 2.5   # glass in front of the board (MEASURE)
    oled_glass_h: float = 23.2  # glass 34.5 x 23.1 mm, centred on the board (Adafruit 938 fab print)
    oled_back: float = 12.0     # board + header pins + wires behind the glass (MEASURE)
    oled_win_w: float = 32.0    # window: the 29.42 x 14.70 active area plus margin
    oled_win_h: float = 20.0    # the DSP-9's lit area sits 2.05 mm off the board centre (ProtoSupplies drawing), so
                                # a taller window shows all 64 rows whichever way up the screen is mounted
    # Green 30 mm arcade button (EG STARTS 5 V / Adafruit 3487): 30 mm hole; body behind the panel ~33 x 33 (MEASURE)
    green_hole: float = 30.0
    green_body_d: float = 36.0     # the nut is ~35 mm across (Adafruit drawing), wider than the 33.3 mm flange
    green_body_depth: float = 33.0  # 28.6 mm thread - 3 mm panel + 4.7 mm tabs = ~30.3 mm
    # Red 60 mm arcade button (Adafruit 1190 drawing / BQLZR on Amazon): M24 thread, 26 mm clearance hole, bezel
    # 60.8 mm, panel up to 12.7 mm, 52.5 mm behind the panel with the switch, a ~37.7 mm part just under the panel.
    red_hole: float = 26.0
    red_bezel: float = 60.8
    red_behind_d: float = 38.0     # the nut/collar just behind the panel (~37.7 mm on the drawing)
    red_collar_depth: float = 8.0
    red_body_d: float = 32.0       # threaded body + microswitch further back (MEASURE)
    red_behind_depth: float = 60.0  # ~49.4 mm behind a 3 mm panel + ~10 mm for crimped spades and wire bends
    # 12 V LED strip segment: 50 mm long, 8 mm wide (HitLights), window sized for strips up to 10.5 mm, 3 mm thick
    led_l: float = 50.0
    led_w: float = 10.5
    led_t: float = 3.0
    # 3.5 mm mono panel jack for the bed shaker (Adafruit 4361 drawing: M6 thread ~3.6-4 mm long, 8 mm shoulder,
    # body 11.8 mm deep): needs a wall no thicker than ~2 mm at the jack.
    jack_hole: float = 6.4
    jack_body_d: float = 12.5      # the solder lugs span up to 11.4 mm
    jack_body_depth: float = 12.5
    jack_wall: float = 2.0
    # LTE antenna included with the LilyGO: flexible, 110.5 x 19.9 mm, stick-on (LilyGO antenna sheet)
    lte_l: float = 110.5
    lte_w: float = 19.9
    lte_lead: float = 126.0      # 1.13 mm coax, ~126 mm long (LilyGO antenna sheet XY03-NB)
    lte_feed_from_end: float = 18.0  # where the lead leaves the antenna, from one end (antenna sheet)
    # LoRa antenna: the Waveshare's 2 dBi stick on its IPEX-to-SMA lead, through a 6.5 mm SMA bulkhead hole
    sma_hole: float = 6.6
    sma_body_d: float = 11.0
    sma_body_len: float = 16.0


@dataclass(frozen=True)
class Fit:
    wall: float = 2.4
    front: float = 3.0
    back: float = 3.0
    gap: float = 0.5
    led_skin: float = 0.8  # light shows through ~4 layers of white plastic
    inner_w: float = 150.0
    inner_h: float = 130.0
    inner_d: float = 75.0
    boss_d: float = 7.8      # centred 3.5 mm from each wall, so it overlaps both walls by 0.4 mm: a 7.0 boss only
                             # touched them along a line (weak corner, and slicers report non-manifold edges)
    screw_pilot: float = 2.5  # M3 self-tapping into plastic
    screw_clear: float = 3.4
    pilot_m2: float = 1.6     # M2 self-tapping (screen and boost posts)


P, F = Parts(), Fit()
W, H, D = F.inner_w, F.inner_h, F.inner_d

# ---- layout (front view: x across, z up) ----
OLED_X, OLED_Z = 34.0, 74.0                        # screen centre (left, under the light window)
LED_X0, LED_Z0 = 10.0, 92.0                        # light window above the screen, under the siren
SPK_X, SPK_Z = 100.0, 104.0                        # speaker centre (top right)
GREEN = (36.0, 38.0)                               # "I'm OK" button centre (x, z)
RED = (97.0, 44.0)                                 # "I need help" button centre (its switch clears the board)
SIREN_X0, SIREN_Y0 = 12.0, 14.0                    # siren footprint corner (lying flat under the top wall)
SIREN_Z0 = H - P.siren_h - 0.6
BATT_X0, BATT_Z0 = 11.0, 9.0
BATT_Y0 = D - P.batt_t - F.gap
LILY_X1 = W - 0.8 - P.lily_usb_protrude            # USB-C edge toward the right wall; the receptacle stops 0.8 mm short
LILY_X0 = LILY_X1 - P.lily_w
LILY_Z0 = 9.0                                      # ESP32 (WiFi antenna) end at the bottom, LTE antenna end at the TOP: that
                                                   # puts the USB-C edge on the right (maker DXF, parts side forward)
LILY_Z1 = LILY_Z0 + P.lily_l
LILY_POST_H = P.lily_back_h + 0.5                  # posts hold the board off the plate, past the 18650 holder
LILY_PCB_BACK = D - LILY_POST_H
LILY_PCB_FRONT = LILY_PCB_BACK - P.lily_pcb
LILY_HOLES = [((LILY_X0 + LILY_X1) / 2 + sx * P.lily_hole_dx / 2, z)  # DXF hole centres: 2.29 mm from the antenna end,
              for sx in (-1, 1) for z in (LILY_Z1 - 107.87, LILY_Z1 - 2.29)]  # 107.87 mm from it (not centred)
USB_Z = LILY_Z1 - P.lily_usb_from_ant_end
IPEX = (LILY_X1 - 4.0, LILY_Z1 - P.lily_ipex_from_ant_end)  # approximate LTE socket position (x, z)
LORA_X0, LORA_Z0 = 88.0, 73.0                      # LoRa module standing upright, pins toward the front
PROTO_X0, PROTO_Z0 = 4.0, 70.0                     # driver board above the battery
BOOST_X0, BOOST_Z0 = 92.0, 20.0                    # 12 V boost standing upright under the LoRa module
JACK = (100.0, 11.0)                               # bed-shaker jack on the back plate, under the boost
SMA = (81.0, 62.0)                                 # LoRa antenna connector through the top wall (x, y)
LTE_Y0, LTE_Z0 = 5.0, 9.0                          # LTE antenna on the RIGHT wall's inside face, in front of the main
                                                   # board, lead end at the top (near the board's LTE socket)
BOSSES = [(3.5, 3.5), (W - 3.5, 3.5), (3.5, H - 3.5), (W - 3.5, H - 3.5)]  # (x, z)
TIE_SLOT_H, BACK_GROOVE = 3.3, 1.5


def xz_rounded(x0, z0, y0, x1, z1, y1, r) -> Manifold:
    """Box rounded on its x/z corners (rounded_box rounds x/y): build in (x, z, y) and swap axes."""
    return rounded_box(x0, z0, y0, x1, z1, y1, r).rotate([90, 0, 0]).mirror([0, 1, 0])


def ycyl(x, z, y0, y1, d) -> Manifold:
    """Cylinder along y (through the front or back panel)."""
    return Manifold.cylinder(y1 - y0, d / 2).rotate([-90, 0, 0]).translate([x, y0, z])


def xcyl(y, z, x0, x1, d) -> Manifold:
    """Cylinder along x (through a side wall)."""
    return Manifold.cylinder(x1 - x0, d / 2).rotate([0, 90, 0]).translate([x0, y, z])


def pocket(x0, z0, l, w, ties_along_x=True, ties=True):
    """A board pocket on the back plate's inside face: ledges the board rests on (3 mm up, for solder joints), rails
    that rise to its front face, and zip-tie slots outside the rails. Returns (added, cut, tie_paths, rail_top_y)."""
    face = D - 3 - 1.6
    if ties_along_x:   # long side along x; ties go across it in z
        x1, z1 = x0 + l + 0.6, z0 + w + 0.6
        add = (box(x0 - 1.6, face, z0 - 1.6, x1 + 1.6, D, z0) + box(x0 - 1.6, face, z1, x1 + 1.6, D, z1 + 1.6)
               + box(x0, D - 3, z0, x1, D, z0 + 1.5) + box(x0, D - 3, z1 - 1.5, x1, D, z1))
        tx = ((x0 + x1) / 2 - l * 0.3, (x0 + x1) / 2 + l * 0.3) if ties else ()
        cut = Manifold()
        paths = []
        for x in tx:
            lo = (z0 - 1.6 - 0.5 - TIE_SLOT_H, z0 - 1.6 - 0.5)
            hi = (z1 + 1.6 + 0.5, z1 + 1.6 + 0.5 + TIE_SLOT_H)
            for a, b in (lo, hi):
                cut += box(x - 1.5, D - 1, a, x + 1.5, D + F.back + 1, b)
            cut += box(x - 1.5, D + F.back - BACK_GROOVE, lo[0], x + 1.5, D + F.back + 1, hi[1])
            paths.append(box(x - 1.4, face - 1.5, lo[0] + 0.1, x + 1.4, face - 0.1, hi[1] - 0.1)
                         + box(x - 1.4, face - 0.1, lo[0] + 0.1, x + 1.4, D + F.back + 0.5, lo[1] - 0.1)
                         + box(x - 1.4, face - 0.1, hi[0] + 0.1, x + 1.4, D + F.back + 0.5, hi[1] - 0.1))
    else:              # long side along z; ties go across it in x
        x1, z1 = x0 + w + 0.6, z0 + l + 0.6
        add = (box(x0 - 1.6, face, z0 - 1.6, x0, D, z1 + 1.6) + box(x1, face, z0 - 1.6, x1 + 1.6, D, z1 + 1.6)
               + box(x0, D - 3, z0, x0 + 1.5, D, z1) + box(x1 - 1.5, D - 3, z0, x1, D, z1))
        tz = ((z0 + z1) / 2 - l * 0.3, (z0 + z1) / 2 + l * 0.3) if ties else ()
        cut = Manifold()
        paths = []
        for z in tz:
            lo = (x0 - 1.6 - 0.5 - TIE_SLOT_H, x0 - 1.6 - 0.5)
            hi = (x1 + 1.6 + 0.5, x1 + 1.6 + 0.5 + TIE_SLOT_H)
            for a, b in (lo, hi):
                cut += box(a, D - 1, z - 1.5, b, D + F.back + 1, z + 1.5)
            cut += box(lo[0], D + F.back - BACK_GROOVE, z - 1.5, hi[1], D + F.back + 1, z + 1.5)
            paths.append(box(lo[0] + 0.1, face - 1.5, z - 1.4, hi[1] - 0.1, face - 0.1, z + 1.4)
                         + box(lo[0] + 0.1, face - 0.1, z - 1.4, lo[1] - 0.1, D + F.back + 0.5, z + 1.4)
                         + box(hi[0] + 0.1, face - 0.1, z - 1.4, hi[1] - 0.1, D + F.back + 0.5, z + 1.4))
    return add, cut, paths


def make_front() -> Manifold:
    ox0, ox1 = -F.wall, W + F.wall
    oz0, oz1 = -F.wall, H + F.wall
    shell = xz_rounded(ox0, oz0, -F.front, ox1, oz1, D, 5.0)
    shell -= box(0, 0, 0, W, D + 1, H)
    # screen window (chamfered outside so it's readable at an angle) and 4 posts for the screen board
    shell -= box(OLED_X - P.oled_win_w / 2, -F.front - 1, OLED_Z - P.oled_win_h / 2,
                 OLED_X + P.oled_win_w / 2, 0.5, OLED_Z + P.oled_win_h / 2)
    shell -= Manifold.batch_hull([
        box(OLED_X - P.oled_win_w / 2, -0.6, OLED_Z - P.oled_win_h / 2, OLED_X + P.oled_win_w / 2, -0.59,
            OLED_Z + P.oled_win_h / 2),
        box(OLED_X - P.oled_win_w / 2 - 2, -F.front - 0.01, OLED_Z - P.oled_win_h / 2 - 2,
            OLED_X + P.oled_win_w / 2 + 2, -F.front, OLED_Z + P.oled_win_h / 2 + 2)])
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = OLED_X + sx * P.oled_hole_dx / 2, OLED_Z + sz * P.oled_hole_dz / 2
            shell += ycyl(x, z, 0, P.oled_glass_t, 4.0)
            shell -= ycyl(x, z, -F.front + 1.0, P.oled_glass_t + 0.1, F.pilot_m2)  # M2 x 4-5 mm; leaves a 1 mm skin
    # speaker grille: 3 mm holes over the cone, and a frame the speaker sits in (hold it with a dab of hot glue)
    for i in range(-8, 9):
        for j in range(-2, 3):
            x, z = SPK_X + i * 3.6, SPK_Z + j * 4.4 + (2.2 if i % 2 else 0)
            if abs(x - SPK_X) <= 29 and abs(z - SPK_Z) <= 10:
                shell -= ycyl(x, z, -F.front - 1, 1, 2.6)
    g = F.gap
    sx0, sx1 = SPK_X - P.spk_l / 2 - g, SPK_X + P.spk_l / 2 + g
    sz0, sz1 = SPK_Z - P.spk_w / 2 - g, SPK_Z + P.spk_w / 2 + g
    for (a, b, c, d) in ((sx0 - 1.6, sz0 - 1.6, sx1 + 1.6, sz0), (sx0 - 1.6, sz1, sx1 + 1.6, sz1 + 1.6),
                         (sx0 - 1.6, sz0, sx0, sz1), (sx1, sz0, sx1 + 1.6, sz1)):
        shell += box(a, 0, b, c, 10.0, d)
    for x in (sx0 - 1.7, sx1 - 0.1):  # open-topped notches in both end walls for the speaker's leads
        shell -= box(x, 4.0, SPK_Z - 4.5, x + 1.8, 10.1, SPK_Z + 4.5)
    # LED light window: the panel is thinned to a skin; the strip sticks to the inside
    shell -= box(LED_X0 - 1, -F.front + F.led_skin, LED_Z0 - 1, LED_X0 + P.led_l + 1, 0.5, LED_Z0 + P.led_w + 1)
    # buttons, with label recesses (stickers: "I'M OK" under green, "I NEED HELP" over red)
    shell -= ycyl(GREEN[0], GREEN[1], -F.front - 1, 1, P.green_hole)
    shell -= box(GREEN[0] - 22, -F.front - 1, GREEN[1] - P.green_hole / 2 - 15, GREEN[0] + 22, -F.front + 0.6,
                 GREEN[1] - P.green_hole / 2 - 4)
    shell -= ycyl(RED[0], RED[1], -F.front - 1, 1, P.red_hole)
    shell -= box(RED[0] - 27, -F.front - 1, RED[1] + P.red_bezel / 2 + 2, RED[0] + 27, -F.front + 0.6,
                 RED[1] + P.red_bezel / 2 + 11)
    # siren grille on top, a hole for the LoRa antenna's SMA connector, USB-C opening on the right wall
    scx, scy = SIREN_X0 + P.siren_l / 2, SIREN_Y0 + P.siren_w / 2
    port_x = SIREN_X0 + P.siren_port_from_end   # grille over the sound port, not the body centre
    for r, n in ((0.0, 1), (6.0, 6), (12.0, 12)):
        for i in range(n):
            a = 2 * np.pi * i / n
            shell -= cyl(port_x + r * np.cos(a), scy + r * np.sin(a), H - 1, H + F.wall + 1, 3.5)
    shell -= cyl(SMA[0], SMA[1], H - 1, H + F.wall + 1, P.sma_hole)
    usb_y = LILY_PCB_FRONT - 1.6
    shell -= box(W - 1, usb_y - 6.0, USB_Z - 8.0, W + F.wall + 1, usb_y + 6.0, USB_Z + 8.0)
    # screw bosses (M3 self-tapping from the back)
    for (x, z) in BOSSES:
        shell += ycyl(x, z, 0, D, F.boss_d)
        shell -= ycyl(x, z, 6, D + 1, F.screw_pilot)
    # siren holder: a shelf under it and two side walls (printable: they rise from the front panel)
    hx0, hx1 = SIREN_X0 - 0.6, SIREN_X0 + P.siren_l + 0.6
    hy1 = SIREN_Y0 + P.siren_w + 1.0
    shell += box(hx0 - 1.6, 0, SIREN_Z0 - 2.0, hx1 + 1.6, hy1, SIREN_Z0)
    for x in (hx0 - 1.6, hx1):
        shell += box(x, 0, SIREN_Z0 - 2.0, x + 1.6, hy1, H)  # up to the top wall, so the part above the slot is held
    shell -= cyl(scx, scy, SIREN_Z0 - 3, SIREN_Z0 + 0.1, 12.0)
    for x in (hx0 - 1.7, hx1 - 0.1):  # wire notches: the PS-723BQ's leads leave an end face at its base
        # a slot open at the back, so the leads ride in it while the siren slides forward onto the shelf
        shell -= box(x, SIREN_Y0 + 8.0, SIREN_Z0 - 0.1, x + 1.8, hy1 + 0.1, SIREN_Z0 + 5.0)
    shell += box(hx0, 0, SIREN_Z0 - 0.1, hx1, SIREN_Y0 - 0.5, SIREN_Z0 + 4.0)  # front stop: keeps it under the grille
    # LTE antenna frame on the right wall: two low rails above and below the 110.5 x 19.9 mm sticker
    for z in (LTE_Z0 - 1.6, LTE_Z0 + P.lte_l + 0.6):
        shell += box(W - 1.2, LTE_Y0 - 0.5, z, W, LTE_Y0 + P.lte_w + 0.5, z + 1.6)
    return shell


def make_back() -> tuple[Manifold, dict[str, list[Manifold]]]:
    ox0, ox1 = -F.wall, W + F.wall
    oz0, oz1 = -F.wall, H + F.wall
    plate = xz_rounded(ox0, oz0, D, ox1, oz1, D + F.back, 5.0)
    lip = xz_rounded(0.3, 0.3, D - 2.0, W - 0.3, H - 0.3, D, 2.0) - box(2.0, D - 3, 2.0, W - 2.0, D + 0.01, H - 2.0)
    plate += lip
    paths: dict[str, list[Manifold]] = {}
    for (x, z) in BOSSES:
        plate -= ycyl(x, z, D - 3, D + F.back + 1, F.screw_clear)
        plate -= ycyl(x, z, D + F.back - 1.6, D + F.back + 1, 6.2)
        plate -= box(x - 4.5, D - 2.5, z - 4.5, x + 4.5, D + 0.01, z + 4.5)
    # battery cradle (walls on three sides; the lead exits on the open right end toward the board) + one strap
    bx0, bx1 = BATT_X0 - F.gap, BATT_X0 + P.batt_l + F.gap
    bz0, bz1 = BATT_Z0, BATT_Z0 + P.batt_w + F.gap
    plate += box(bx0 - 1.6, BATT_Y0 - 0.01, bz0, bx0, D, bz1)
    plate += box(bx0 - 1.6, BATT_Y0 - 0.01, bz1, bx1 - 20, D, bz1 + 1.6)
    plate += box(bx0 - 1.6, BATT_Y0 - 0.01, bz0 - F.gap - 1.6, bx1 - 20, D, bz0 - F.gap)
    strap_zc, strap_w = BATT_Z0 + 16.0, 13.0  # low on the pack: the red button's switch sits beside its upper half
    s0 = (bx0 - 1.6 - 0.5 - 3.5, bx0 - 1.6 - 0.5)
    s1 = (bx1 + 0.5, bx1 + 4.0)
    for (a, b) in (s0, s1):
        plate -= box(a, D - 1, strap_zc - strap_w / 2, b, D + F.back + 1, strap_zc + strap_w / 2)
    plate -= box(s0[0], D + F.back - BACK_GROOVE, strap_zc - strap_w / 2, s1[1], D + F.back + 1, strap_zc + strap_w / 2)
    za, zb = strap_zc - strap_w / 2 + 0.1, strap_zc + strap_w / 2 - 0.1
    paths["battery strap"] = [box(s0[0] + 0.1, BATT_Y0 - 1.6, za, s0[1] - 0.1, D + F.back + 0.5, zb)
                              + box(s1[0] + 0.1, BATT_Y0 - 1.6, za, s1[1] - 0.1, D + F.back + 0.5, zb)
                              + box(s0[0] + 0.1, BATT_Y0 - 1.6, za, s1[1] - 0.1, BATT_Y0 - 0.1, zb)]
    # LilyGO posts: 5 mm posts past the 18650 holder; 4 x M1.7 self-tapping screws through the board's 2.0 mm holes
    for (x, z) in LILY_HOLES:
        plate += ycyl(x, z, LILY_PCB_BACK, D, 5.0)
        plate -= ycyl(x, z, LILY_PCB_BACK - 0.1, LILY_PCB_BACK + 8.0, P.lily_screw_pilot)
    # LoRa module pocket (standing upright; rails locate it, a strip of double-sided foam tape holds it: a tie
    # would have to cross its pin headers) and driver-board pocket (horizontal, ledges, rails and two ties)
    add, cut, p = pocket(LORA_X0, LORA_Z0, P.lora_l, P.lora_w, ties_along_x=False, ties=False)
    plate += add
    add, cut, p = pocket(PROTO_X0, PROTO_Z0, P.proto_l, P.proto_w, ties_along_x=True, ties=False)
    plate += add  # held on its ledges with double-sided foam tape (it's light; ties would cross its parts)
    # 12 V boost (Pololu U3V50F12, standing upright): two posts for M2 self-tapping screws, diagonal corners
    bcx, bcz = BOOST_X0 + P.boost_w / 2, BOOST_Z0 + P.boost_l / 2
    for (sx, sz) in ((-1, 1), (1, -1)):  # U3V50Fx holes: top-left and bottom-right when upright, parts forward (Pololu)
        x, z = bcx + sx * P.boost_hole_dz / 2, bcz + sz * P.boost_hole_dx / 2
        plate += ycyl(x, z, D - 4, D, 4.5)
        plate -= ycyl(x, z, D - 4.1, D, F.pilot_m2)
    # bed-shaker jack: hole, and the wall thinned to 2 mm around it from the outside so the nut can grip
    plate -= ycyl(JACK[0], JACK[1], D - 1, D + F.back + 1, P.jack_hole)
    plate -= ycyl(JACK[0], JACK[1], D + P.jack_wall, D + F.back + 1, 13.0)
    # recess on the outside for the safety label. Draft wording per docs/HOME_BEACON.md section 1: "Not a smoke alarm.
    # Does not call 911. Doesn't replace official alerts or evacuation orders." The wording and where the label goes are
    # the founder's call (not approved yet: docs/PLAN.md, waiting on founder)
    plate -= box(25.0, D + F.back - 0.6, 92.0, 125.0, D + F.back + 1, 122.0)
    return plate, paths


def ghosts() -> dict[str, Manifold]:
    sx = SIREN_X0
    g = {
        # front parts (soldered wires, no header pins), the circuit board (with its 4 holes), the 18650 holder in the
        # middle of the back, and the USB-C receptacle sticking out past the right edge
        "main board": box(LILY_X0, LILY_PCB_FRONT - P.lily_front_h, LILY_Z0, LILY_X1, LILY_PCB_FRONT, LILY_Z1)
        + box(LILY_X1, LILY_PCB_FRONT - 3.2, USB_Z - 4.5, LILY_X1 + P.lily_usb_protrude, LILY_PCB_FRONT, USB_Z + 4.5)
        + (box(LILY_X0, LILY_PCB_FRONT, LILY_Z0, LILY_X1, LILY_PCB_BACK, LILY_Z1)
           - Manifold.batch_boolean([ycyl(x, z, LILY_PCB_FRONT - 1, LILY_PCB_BACK + 1, P.lily_hole_d)
                                     for (x, z) in LILY_HOLES], __import__('manifold3d').OpType.Add))
        + box(LILY_X0 + 5.2, LILY_PCB_BACK, LILY_Z0 + 5.0, LILY_X1 - 5.2, LILY_PCB_BACK + P.lily_back_h,
              LILY_Z1 - 5.0),
        "USB-C plug": box(LILY_X1 + P.lily_usb_protrude + 0.01, LILY_PCB_FRONT - 1.6 - 5.0, USB_Z - 6.5, W + F.wall + 30,
                          LILY_PCB_FRONT - 1.6 + 5.0, USB_Z + 6.5),
        "LoRa module": box(LORA_X0 + 0.3, D - 3 - P.lora_h, LORA_Z0 + 0.3, LORA_X0 + 0.3 + P.lora_w, D - 3,
                           LORA_Z0 + 0.3 + P.lora_l),
        "battery": box(BATT_X0, BATT_Y0, BATT_Z0, BATT_X0 + P.batt_l, BATT_Y0 + P.batt_t, BATT_Z0 + P.batt_w),
        "siren": box(sx, SIREN_Y0, SIREN_Z0, sx + P.siren_l, SIREN_Y0 + P.siren_w, SIREN_Z0 + P.siren_h),
        "driver board": box(PROTO_X0 + 0.3, D - 3 - P.proto_parts - 1.6, PROTO_Z0 + 0.3, PROTO_X0 + 0.3 + P.proto_l,
                            D - 3, PROTO_Z0 + 0.3 + P.proto_w),
        "12 V boost (U3V50F12 only)": box(BOOST_X0, D - 4 - P.boost_h, BOOST_Z0, BOOST_X0 + P.boost_w, D - 4, BOOST_Z0 + P.boost_l),
        "speaker": box(SPK_X - P.spk_l / 2, 0.0, SPK_Z - P.spk_w / 2, SPK_X + P.spk_l / 2, P.spk_h,
                       SPK_Z + P.spk_w / 2),
        "screen": box(OLED_X - P.oled_bw / 2, P.oled_glass_t, OLED_Z - P.oled_bh / 2, OLED_X + P.oled_bw / 2,
                      P.oled_glass_t + P.oled_back, OLED_Z + P.oled_bh / 2)
                  + box(OLED_X - 17.25, 0.0, OLED_Z - P.oled_glass_h / 2, OLED_X + 17.25, P.oled_glass_t,
                        OLED_Z + P.oled_glass_h / 2),
        # stuck to the inside of the 0.8 mm light-window skin
        "LED strip": box(LED_X0, -F.front + F.led_skin, LED_Z0, LED_X0 + P.led_l, -F.front + F.led_skin + P.led_t,
                         LED_Z0 + P.led_w),
        "green button": ycyl(GREEN[0], GREEN[1], 0.0, P.green_body_depth, P.green_body_d),
        "red button": ycyl(RED[0], RED[1], 0.0, P.red_collar_depth, P.red_behind_d)
        + ycyl(RED[0], RED[1], P.red_collar_depth, P.red_behind_depth, P.red_body_d),
        "shaker jack": ycyl(JACK[0], JACK[1], D - P.jack_body_depth, D, P.jack_body_d),
        "LoRa SMA connector": cyl(SMA[0], SMA[1], H - P.sma_body_len, H, P.sma_body_d),
        "LTE antenna": box(W - 0.4, LTE_Y0, LTE_Z0, W, LTE_Y0 + P.lte_w, LTE_Z0 + P.lte_l),
    }
    return g


def checks(front: Manifold, back: Manifold, paths: dict[str, list[Manifold]]) -> list[str]:
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
    owner = {"battery strap": "battery"}
    for label, ps in paths.items():
        others = [front, back] + [m for n, m in gs.items() if n != owner[label]]
        for k, pth in enumerate(ps):
            for m in others:
                v = (pth ^ m).volume()
                if v > 0.01:
                    problems.append(f"{label} #{k + 1}: path blocked ({v:.1f} mm^3)")
    # the battery cradle's free space must hold the pack plus 0.4 mm
    probe = box(BATT_X0, BATT_Y0, BATT_Z0 - 0.4, BATT_X0 + P.batt_l, BATT_Y0 + P.batt_t, BATT_Z0 + P.batt_w + 0.4)
    v = (probe ^ back).volume()
    if v > 0.01:
        problems.append(f"battery cradle tighter than the pack + 0.4 mm ({v:.1f} mm^3)")
    # antennas: keep the LTE antenna >= 10 mm from metal (battery, boost, speaker magnet, siren)
    lte = gs["LTE antenna"]
    for metal in ("battery", "12 V boost (U3V50F12 only)", "speaker", "siren"):
        gap = Manifold.min_gap(lte, gs[metal], 20.0)
        if gap < 10.0:
            problems.append(f"LTE antenna only {gap:.1f} mm from the {metal} (want >= 10 mm)")
    # the LTE antenna's lead must reach the board's socket with slack to open the case (feed at the antenna's top end)
    feed = np.array([W, LTE_Y0 + P.lte_w / 2, LTE_Z0 + P.lte_l - P.lte_feed_from_end])
    sock = np.array([IPEX[0], LILY_PCB_FRONT - 1.0, IPEX[1]])
    reach = float(np.linalg.norm(feed - sock))
    if reach + 40.0 > P.lte_lead:
        problems.append(f"LTE lead: socket {reach:.0f} mm from the feed; needs >= 40 mm slack in a {P.lte_lead:.0f} mm lead")
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
    _draw(fig.add_subplot(221, projection="3d"), [(_tris(front), white, 1)], 15, -75, "Front: screen, speaker, light, buttons")
    _draw(fig.add_subplot(222, projection="3d"), [(_tris(back), grey, 1)], 25, 110, "Back plate (inside face)")
    _draw(fig.add_subplot(223, projection="3d"), [(_tris(back), grey, 1)] + gt, 25, 110,
          "Parts on the back plate side")
    _draw(fig.add_subplot(224, projection="3d"), [(_tris(front), white, 1)], 60, -60, "Top: siren grille, antenna hole")
    fig.tight_layout()
    fig.savefig(out / "case_overview.png")
    plt.close(fig)
    layout_drawing(out / "case_layout.png")
    section_drawing(front, back, gs, out / "case_sections.png")


SECTIONS = [(20.0, "battery, jack, main board"), (44.0, "both buttons, battery, main board"),
            (74.0, "screen, driver board, LoRa, main board"), (104.0, "speaker, driver board, LoRa"),
            (118.0, "siren, speaker, driver board")]


def section_drawing(front: Manifold, back: Manifold, gs: dict[str, Manifold], path: Path) -> None:
    """Top-down cuts through the closed case at several heights: where each part sits and how close things come."""
    import matplotlib.pyplot as plt
    from matplotlib.patches import PathPatch
    from matplotlib.path import Path as MPath

    colors = plt.get_cmap("tab20").colors
    fig, axes = plt.subplots(2, 3, figsize=(16, 9), dpi=110)

    def patch(ax, m, z, fc, ec, alpha, label=None):
        cs = m.slice(z)
        if cs.is_empty():
            return
        polys = [p for p in cs.to_polygons() if len(p) >= 3]
        mp = MPath.make_compound_path(*[MPath(np.vstack([p, p[:1]]), closed=True) for p in polys])
        ax.add_patch(PathPatch(mp, fc=fc, ec=ec, alpha=alpha, lw=0.8))
        if label:
            b = cs.bounds()
            ax.text((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, label, ha="center", va="center", fontsize=6.5)

    for ax, (z, what) in zip(axes.flat, SECTIONS):
        patch(ax, front, z, (0.85, 0.85, 0.82), "k", 1.0)
        patch(ax, back, z, (0.6, 0.62, 0.66), "k", 1.0)
        for i, (name, m) in enumerate(gs.items()):
            patch(ax, m, z, colors[i % len(colors)], colors[i % len(colors)], 0.55, name)
        ax.set_title(f"{z:.0f} mm up: {what}", fontsize=9)
        ax.set_xlim(-6, W + 6)
        ax.set_ylim(D + F.back + 4, -F.front - 6)   # front of the case at the bottom of each drawing
        ax.set_aspect("equal")
        ax.text(W / 2, -F.front - 3, "front panel", ha="center", va="center", fontsize=7)
        ax.text(W / 2, D + F.back + 2, "back plate", ha="center", va="center", fontsize=7)
    a = axes.flat[-1]
    a.axis("off")
    a.text(0.0, 0.95, "Top-down cuts through the closed case.\nLight grey: front part. Dark grey: back plate.\n"
           "Coloured: the parts (stand-ins at the\nsizes in make_case.py `Parts`).\nAll sizes in mm.",
           va="top", fontsize=9, transform=a.transAxes)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def layout_drawing(path: Path) -> None:
    """A flat, labelled drawing of the front panel and the back plate (inside view), from the layout constants."""
    import matplotlib.pyplot as plt
    from matplotlib.patches import Circle, Rectangle

    fig, axes = plt.subplots(1, 2, figsize=(14, 6.6), dpi=110)

    def rect(ax, x0, z0, w, h, label, color, fill=False, size=8):
        ax.add_patch(Rectangle((x0, z0), w, h, fill=fill, alpha=0.25 if fill else 1, ec=color, fc=color, lw=1.5))
        ax.text(x0 + w / 2, z0 + h / 2, label, ha="center", va="center", fontsize=size)

    def circ(ax, x, z, d, label, color, size=8):
        ax.add_patch(Circle((x, z), d / 2, fill=False, ec=color, lw=1.5))
        ax.text(x, z, label, ha="center", va="center", fontsize=size)

    a = axes[0]
    a.set_title("Front panel (as you face it)")
    rect(a, OLED_X - P.oled_win_w / 2, OLED_Z - P.oled_win_h / 2, P.oled_win_w, P.oled_win_h, "screen", "k")
    rect(a, LED_X0, LED_Z0, P.led_l, P.led_w, "light (LED strip)", "orange", fill=True)
    rect(a, SPK_X - 29, SPK_Z - 10, 58, 20, "speaker grille", "steelblue")
    circ(a, GREEN[0], GREEN[1], P.green_hole, "I'M OK\n30 mm", "green")
    circ(a, RED[0], RED[1], P.red_bezel, "I NEED HELP\n60 mm", "red")
    a.text(SIREN_X0 + P.siren_port_from_end, H - 3, "siren grille on top", ha="center", va="top", fontsize=8)
    a.text(W - 2, USB_Z, "USB-C\n(right side)", ha="right", va="center", fontsize=8)
    a = axes[1]
    a.set_title("Back plate, inside face (seen from the front)")
    rect(a, BATT_X0, BATT_Z0, P.batt_l, P.batt_w, "10 Ah battery", "purple", fill=True)
    rect(a, PROTO_X0, PROTO_Z0, P.proto_l, P.proto_w, "driver board\n5 x 7 cm\n(MOSFETs, amp,\nU3V40F12 boost)", "brown", fill=True)
    rect(a, LORA_X0, LORA_Z0, P.lora_w, P.lora_l, "LoRa", "teal", fill=True)
    rect(a, BOOST_X0, BOOST_Z0, P.boost_w, P.boost_l, "posts for\nU3V50F12\n(empty\nwith\nU3V40F12)", "olive", fill=True, size=6)
    rect(a, LILY_X0, LILY_Z0, P.lily_w, P.lily_l, "LilyGO\nT-SIM7080G-S3\n(cell + WiFi)", "navy", fill=True)
    circ(a, JACK[0], JACK[1], 9, "", "k")
    a.text(JACK[0] + 6, JACK[1], "shaker jack", va="center", fontsize=7)
    a.text(W + 1.5, LTE_Z0 + P.lte_l / 2, "LTE antenna (right wall, in front)", rotation=90, va="center", ha="left",
           fontsize=7)
    for ax in axes:
        ax.add_patch(Rectangle((0, 0), W, H, fill=False, ec="grey", lw=1))
        ax.set_xlim(-8, W + 8)
        ax.set_ylim(-8, H + 8)
        ax.set_aspect("equal")
        ax.set_xlabel("mm")
    fig.tight_layout()
    fig.savefig(path)
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
    front = make_front()
    back, paths = make_back()
    problems = checks(front, back, paths)
    for p in problems:
        print("PROBLEM:", p)
    args.out.mkdir(parents=True, exist_ok=True)
    write_stl(for_printing(front, 90), args.out / "front.stl", "help-first beacon front")
    write_stl(for_printing(back, -90), args.out / "back.stl", "help-first beacon back")
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
