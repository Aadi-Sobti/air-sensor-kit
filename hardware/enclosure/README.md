# Printed sensor case (v1 kit)

Two printed parts, no screws or tools. **Status: designed and fit-checked in software only. Not printed or
tested yet.** Print one, run the test list at the bottom, then adjust the sizes in `make_enclosure.py`.

| File | What | Print orientation |
|---|---|---|
| `stl/shell.stl` | Roof, four walls, open-bottom rain skirt, mounting ears | Roof flat on the bed (it's already oriented). No supports. |
| `stl/insert.stl` | Tray that holds the air sensor and the WiFi board | Floor flat on the bed. No supports. |

Size: body 107 × 72 × 67 mm (135 mm wide with the mounting ears). Inside: 52 mm tall.

## How it works
- **The air sensor stands on its air-opening face** over a fully open window in the tray floor. Air comes up
  through the open bottom, where rain can't fall in. This is the same idea as PurpleAir's outdoor units.
- **A divider rib** separates the sensor's inlet (4 small holes) from its fan outlet, so it doesn't re-breathe
  its own exhaust. Plantower asks for this when the sensor isn't flush against a wall. The rib sits 25 mm from
  the end, which works whichever way round the sensor is placed.
- **No grille or mesh over the inlet.** A study found that a 1 Pa restriction at the inlet lowered readings by
  30%, and the sensor's fan only makes about 3.5 Pa (Ouimette et al. 2024). PurpleAir also says not to cover the
  open base, even against insects.
- **The WiFi board sits in four corner holders** 25 mm up, pins down, so the jumper wires fit underneath. A thin
  wall keeps the wires off the sensor's metal case, which is connected to ground.
- **Two side catches click into windows in the cover.** They bend sideways inside the tray floor rather than
  standing up, because printed clips that bend upward split along their layers. To open the case, press both
  catches in through the windows and pull the tray down.
- **Posts inside the roof** rest just above the sensor and the board, so nothing rattles loose once it's closed.
- **The USB cable** drops through a slot that's open to the side, so it can be laid in without threading the plug.
- **Extras:**
  - a 6 mm hole and a spot under the floor for the phase-2 humidity sensor, which needs outside air;
  - zip-tie slots for the small adapter board;
  - notches in the bottom edge so it still breathes when standing on a shelf;
  - a recess on the front for the sensor-code sticker.

## Printing
- **Material.**
  - **Outdoors:** ASA if you have an enclosed printer. It handles heat up to 92–100 °C and is UV-rated, but it
    needs ventilation for fumes. Otherwise use PETG (heat limit 62–71 °C). In one 24-hour UV test, printed PETG
    lost about 36% of its strength, so print it in a **light color**, mount it in **shade**, and check it yearly.
  - **Not PLA.** It softens near 57–60 °C and breaks down in sunlight. It's fine for indoor-only cases.
- **Settings:** 0.2 mm layers, 3–4 walls, 20–25% infill.
- **Clearances:** 0.5 mm between the tray and the cover, 0.4 mm around the sensor. If your printer runs tight or
  loose, change `Fit.slide` / `Fit.part` and regenerate.
- **Material and time:** about 107 cm³ of solid volume, so roughly 60–80 g and $1.50–2.00 of filament per case
  at typical settings (an estimate). Check the exact grams and print time in your slicer.

## Build steps with the case (proposed; needs the founder's OK before it replaces the guide)
1. Stand the air sensor in its four corner holders, **round fan grille facing down** (the cable socket faces up).
2. Plug the sensor's small cable into its top and into the adapter board. Lay the adapter board in the front-right
   bay (an optional zip tie goes through the two slots).
3. Connect the 4 colored wires as on the card.
4. Set the WiFi board in its four corner holders, **USB socket toward the cable slot**. Plug in the USB cable and
   drop the cable into the slot.
5. Set it up (unchanged), then slide the cover down over the tray until **both sides click**.
6. Mount it **open side down**, 3–6 ft up (EPA's breathing-height range), with screws or zip ties through the
   ears. Keep it away from grills, dryer vents, AC units and building exhausts, and in shade if you can.

## Regenerating
```bash
python3.12 -m venv hardware/.venv && hardware/.venv/bin/pip install -r hardware/requirements.txt
hardware/.venv/bin/python hardware/enclosure/make_enclosure.py --preview /tmp/case-preview
```
It prints the size and fit checks, and exits with an error if a part overlaps. The checks use stand-in blocks for:
- the sensor;
- the largest board size any source lists;
- the jumper wires under the board;
- a Molex micro-USB plug.

## Part sizes (sources)
| Part | Size used | Source |
|---|---|---|
| PMS5003 body | 50 × 38 × 21.2 mm | [Plantower manual V2.3](https://cdn-shop.adafruit.com/product-files/3686/plantower-pms5003-manual_v2-3.pdf) (50×38×21); the PMS5003S drawing gives the face as 21.20 |
| PMS5003 openings | Inlet: 4 × Ø2.5 holes, 6–18 mm from one end. Outlet: Ø18 fan, centred 35.8 mm from that end. Cable socket on the opposite face | Same manuals. The fan is the exhaust ([Ouimette et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11236278/)) |
| PMS5003 install rules | Openings flush to the wall, or a shield between inlet and outlet; outlet kept clear; ≥20 cm above the floor; ≥30 s warm-up | Manual V2.3 |
| NodeMCU V3 LoLin | 57–59 × 30.5–31.5 mm (sources disagree), so the pocket is 60 × 32.5 | [fritzing forum](https://forum.fritzing.org/t/nodemcu-v3-parts-library/3422), [make-it.ca](https://www.make-it.ca/nodemcu-details-specifications/), KiCad and OpenSCAD community models |
| Under-board space | 2.5 mm header plastic + 14 mm Dupont housing + wire bend → 25 mm | [Pololu 1900](https://www.pololu.com/product/1900), [Pololu 965](https://www.pololu.com/product/965) |
| Micro-USB plug | Overmold 10.8 × 6.4 × 25.6 mm (Molex 68784) → 34 mm left free | Molex flyer |
| Printing rules | 0.5 mm snap-fit clearance, 2 mm walls, clips not built along Z | [Protolabs Network (Hubs)](https://www.hubs.com/knowledge-base/how-design-snap-fit-joints-3d-printing/) |

## Test list for the first print (needed before kits use it)
1. **Fit:** the sensor drops into its holders, and a real board from *our supplier* sits in its corner holders.
   Measure 3 boards with calipers. The USB plug and cable fit, and the cover clicks on and comes off again.
2. **Air:** run two sensors side by side for 24 h, one in the case and one bare. Readings should match within the
   sensor's own spec (±10 µg/m³ below 100). Do the same comparison for the **current kit's box + tubing**: the
   research suggests tubing may lower readings.
3. **Rain:** spray it from above and from the side for 5 minutes with a hose on "shower". The inside of the cover
   above the tray must be dry.
4. **Heat:** a day in direct sun in summer. The PMS5003 is rated to 60 °C, so the inside must stay well below that.
   The firmware's health data shows whether the board restarts.
5. **Outdoor soak:** 2–4 weeks outside. Check for insects, warping, and the catches still clicking.

## Not covered
- **Other boards:** the narrow NodeMCU "Amica" (CP2102, 49 × 26 mm) doesn't fit the LoLin holders. Kits buy LoLin
  CH340 boards.
- **The FLASH button** is inside the case. For "new WiFi with a phone", open the case first.
- **The status light** isn't visible once the case is closed. The setup page and `/my` show the status instead.
