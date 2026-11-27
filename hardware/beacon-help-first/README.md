# Help-First Home Beacon case (bench prototype)

Two printed parts held together by 4 M3 screws. **Status: designed and fit-checked in software only. Not printed.** The
version and why are in [`docs/BEACON_RECOMMENDATION.md`](../../docs/BEACON_RECOMMENDATION.md) (decision #39). The parts
are in [`docs/HOME_BEACON_HELP_FIRST_BUY.md`](../../docs/HOME_BEACON_HELP_FIRST_BUY.md). The earlier, smaller case for
the WiFi-plus-LoRa design is in `hardware/beacon/`.

![Front panel and back plate layout](case_layout.png)

| File | What | Print orientation |
|---|---|---|
| `stl/front.stl` | Front panel and walls. **Front:** screen window, speaker grille, light window, 30 mm green and 60 mm red button holes, label recesses. **Top:** siren grille and the LoRa antenna's SMA hole. **Right side:** USB-C opening, and inside it a frame for the stick-on LTE antenna in front of the main board. **Inside:** screen posts, speaker frame, siren holder (with a wire notch and a front stop) | Front panel flat on the bed (already oriented). No supports |
| `stl/back.stl` | Back plate. **Battery:** cradle with a strap. **Boards:** 4 screw posts for the LilyGO board; pockets for the LoRa module and the 5 × 7 cm driver board. **Also:** posts for the 12 V boost, and the bed-shaker jack hole (plate thinned to 2 mm there). **Outside:** a 0.6 mm recess for the safety label | Outer face flat on the bed (already oriented). No supports; the label recess's floor prints as a 30 mm bridge, so it may sag a little (the label covers it) |

**Size:** 155 wide × 81 deep × 135 tall mm, about the size of a small bedside speaker. It stands on a nightstand. There
are no wall keyholes, because the driver board covers that part of the back.

## Printing
- **Material:** PETG or PLA, in **white** so the alarm light shows through the 0.8 mm skin over the LED strip.
- **Settings:** 0.2 mm layers, 3 walls, 20% infill.
- **Plastic:** about 247 cm³ of solid volume, roughly 200–250 g at typical settings; your slicer gives the exact amount.
- **Bed:** about 155 × 135 mm, so it needs a printer bed at least 160 mm square.
- **Screws (self-tapping):**
  - **Case:** 4 × M3 × 10 mm.
  - **LilyGO board:** 4 × M1.7 × 5–6 mm. Its holes are exactly 2.0 mm, too tight for M2.
  - **Screen:** 4 × M2 × 4–5 mm.
  - **Boost:** 2 × M2 × 5–6 mm.

## Part sizes (sources)
| Part | Size used | Source |
|---|---|---|
| LilyGO T-SIM7080G-S3 (with PMU) | 110.5 × 32.9 mm; holes Ø2.0 on 27.7 × 105.6 mm. USB-C on the long edge that's on your left with the antenna end down (parts side up), 59.2 mm from that end, sticking out ~1.9 mm. LTE socket ~14 mm from the antenna end, same edge. ~20 mm thick with the 18650 holder. Mounted antenna end **up**, so the USB-C edge faces the right wall | Maker DXF and README ([GitHub](https://github.com/Xinyuan-LilyGO/LilyGo-T-SIM7080G)); thickness from CNX. **Measure the holder height** (`lily_back_h`, 18.5 assumed) |
| LTE antenna (in the LilyGO box) | 110.5 × 19.9 mm flexible, stick-on; 126 mm lead leaving ~18 mm from one end | LilyGO antenna sheet (XY03-NB). **Measure** |
| Waveshare Pico-LoRa-SX1262-915M | 21 × 52 mm; 28 mm allowed for headers and jumper plugs | [Waveshare wiki](https://www.waveshare.com/wiki/Pico-LoRa-SX1262). **Measure the height** |
| Adafruit 5035 battery | Max 69.0 × 56.5 × 19.0 mm | Maker drawing (PKCELL, p. 8) via [Adafruit](https://www.adafruit.com/product/5035) |
| 12 V square siren: Mallory PS-723BQ (the pick, decision #35); Wishiot for wiring tests only | 47 × 39 × 23.5 mm; the Mallory's leads leave a 39 mm end face at the base | Mallory datasheet 47 × 39 × 23 (rev B drawing); Wishiot listing. **Measure** |
| Pololu U3V50F12 | 48 × 15 × 10.5 mm; M2 holes ~43.2 × 10.2 mm apart, top-left and bottom-right when stood upright with parts forward | [Pololu 2568](https://www.pololu.com/product/2568) |
| Driver board (5 × 7 cm perfboard) | 70 × 50 mm, parts up to 15 mm | Adafruit 4786 / ELEGOO kit |
| Speaker 3 W 4 Ω | 70.2 × 31 × 16.6 mm | Adafruit 3351 drawing; CQRobot listing |
| 1.3-inch OLED | Board up to 35.6 × 33.5 mm; holes ~30.45 × 28.25 mm; glass 34.5 × 23.1 mm centred; active area 29.42 × 14.70 mm | Adafruit 938 fab print; Hosyond listing. **Measure the glass thickness and the lit area's position** |
| Red 60 mm button | 26 mm hole; 60.8 mm bezel; ~38 mm collar, then ~32 mm body to 60 mm deep with wires | [Adafruit 1190](https://www.adafruit.com/product/1190) drawing and guide. **Measure** |
| Green 30 mm button | 30 mm hole; nut ~35 mm across; ~30 mm deep | Adafruit 3487 drawing |
| 3.5 mm panel jack | M6 thread, ~2.5 mm max panel; body 12.5 mm deep, lugs up to 11.4 mm wide | Adafruit 4361 (Kaweei PJ-314M-1) drawing |

## What the fit checks cover
`make_case.py` places a stand-in ("ghost") for every part and checks for overlaps:
- **Parts:** no part collides with the case or with any other part. That includes the USB-C receptacle sticking out of
  the board's edge and the plug in front of it.
- **Front and back:** the two printed parts don't overlap each other.
- **Battery:** the strap has a clear path around the pack, and the cradle holds the pack with 0.4 mm to spare.
- **LTE antenna:** at least 10 mm from metal (battery, boost, speaker, siren), and its 126 mm lead reaches the board's
  socket with at least 40 mm of slack to open the case. It now needs about 39 mm; from the left wall it would have
  needed about 145 mm.

A test that deliberately blocks the strap slot, or moves the red button onto the main board, makes the checks fail as
they should.

**Assumptions to confirm on the bench:** the 18650 holder sits in the middle of the board's back, clear of the 4 mounting
holes; and the wires soldered to the board's left header row (about 1.5–4 mm right of the red button's body, from 13 to
54 mm up) can be routed past the red button's body and switch without pressing on them.

## Assembly order
1. **Measure** the parts listed in the buy list's "Measure when the parts arrive", update `Parts`, rerun, then print.
2. **Before any home use:** the box must carry the safety wording from `docs/HOME_BEACON.md` § 1: not a smoke alarm;
   does not call 911; doesn't replace official alerts or evacuation orders. Put the label in the recess on the back,
   with wording the founder approves. It also needs a reachable silence control (see the buy list's wiring plan).
3. **Main board,** before it's mounted, with its power switch OFF:
   - Insert the SIM.
   - Solder wires straight to the header holes you need (no header pins).
   - Last, solder the battery leads to the 18650 holder's tabs: + is the tab at the ESP32 end, − the one at the LTE-antenna
     end (check with a meter). Leave the holder empty: it's for one 18650 lithium cell, and AA batteries must never go in.
   - **The OFF switch doesn't make the tabs safe:** they connect before the switch, so once the pack is on, the tabs and
     everything wired to them are live.
4. **Back plate:**
   - Strap the battery into its cradle, with the lead toward the right.
   - Screw the LilyGO board onto its 4 posts with M1.7 screws: 18650 holder facing the plate, antenna end up, USB-C
     toward the right wall.
   - Fix the LoRa module and the driver board on their ledges with foam tape.
   - Screw the boost onto its posts.
   - Fit the shaker jack.
5. **Front:**
   - Mount the screen on its posts (glass toward the window), the speaker in its frame, and the LED strip behind the
     light window.
   - Fit the two buttons; cut the two alignment posts off the red one first.
   - Set the siren on its shelf, against the front stop, with its leads out through the notch, and fix it with a dab of
     hot glue: nothing else stops it sliding back about 2.4 mm onto the driver board's parts.
   - Stick the LTE antenna between the rails on the right wall, lead end at the top.
6. **Wiring:**
   - Follow the proposed wiring plan in the buy list, and check every connection against LilyGO's schematic.
   - First checks: battery polarity with a meter, and 12 V at the boost output.
   - Plug the LTE antenna into the board's LTE ("NBIOT") socket.
7. **Close up:** fit the SMA connector through the top hole and screw the antenna on. Close the case with the 4 M3
   screws.

## Regenerating
```
hardware/.venv/bin/python hardware/beacon-help-first/make_case.py --preview hardware/beacon-help-first
```
It writes `stl/front.stl` and `stl/back.stl` and prints "fit checks: OK" (or the problems). With `--preview` it also
writes `case_layout.png` and `case_overview.png`.
