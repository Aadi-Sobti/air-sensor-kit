# Home Beacon case (indoor pilot prototype)

Two printed parts held together by 4 M3 screws. **Status: designed and fit-checked in software only. Not printed.**
The plan is in [`docs/HOME_BEACON.md`](../../docs/HOME_BEACON.md).

| File | What | Print orientation |
|---|---|---|
| `stl/front.stl` | Front panel and walls: OLED window, two 30 mm button holes, a thin light window for the alarm LED, label recesses, siren grille on top, USB-C opening on the right. Inside: board holders, siren holder | Front panel flat on the bed (already oriented). No supports. |
| `stl/back.stl` | Back plate: 2 wall-mount keyholes, a battery cradle with strap slots, a pocket for the driver board, 2 fingers that keep the radio board against the front | Outer face flat on the bed (already oriented). No supports. |

**Size:** 117 wide × 62 deep × 101 tall mm, about the size of a small clock radio. It stands on a shelf or hangs on a wall.

## Printing
- **Material:** PETG or PLA (it's indoors). Print the front in **white** so the alarm light shows through the 0.8 mm
  "skin" over the LED strip.
- **Settings:** 0.2 mm layers, 3 walls, 20% infill.
- **Plastic:** about 137 cm³ of solid volume, so roughly 75–95 g at typical settings. Your slicer gives the exact
  amount.
- **Screws:** 4 × M3 × 10 mm self-tapping (into 2.5 mm pilot holes). Use M3 heat-set inserts if you'll open it often.

## Part sizes (sources)
| Part | Size used | Source |
|---|---|---|
| Heltec WiFi LoRa 32 V3 | 50.2 × 25.5 × 10.2 mm | [Heltec product page](https://heltec.org/project/wifi-lora-32-v3/), [datasheet V3.2](https://resource.heltec.cn/download/WiFi_LoRa_32_V3/HTIT-WB32LA_V3.2.pdf) |
| OLED window position | 7 mm from the antenna end, 27 × 15 mm window | **Not in the datasheet text. Measure before printing** (`Parts.oled_*`) |
| SparkFun COM-13939 piezo alarm | Ø35.8 × 35.7 mm | [SparkFun listing](https://www.sparkfun.com/large-piezo-alarm-16-tone.html) |
| Adafruit 30 mm arcade button | 30 mm hole; panel up to ~20 mm | [Adafruit 3487](https://www.adafruit.com/product/3487) |
| Arcade button body behind the panel | Ø33 × 33 mm | **Not published. Measure before printing** (`Parts.button_body_*`) |
| Adafruit 354 battery pack (2 × 18650) | 69 × 37 × 18 mm | [Adafruit 354](https://www.adafruit.com/product/354) |
| Adafruit FeatherWing Proto (driver board) | 50.9 × 22.9 mm, parts up to 15 mm | [Adafruit 2884](https://www.adafruit.com/product/2884) |
| 12 V LED strip segment | 50 × 10.5 × 3 mm | [Adafruit 12 V flexi-strip spec](https://www.adafruit.com/product/887) |
| Pololu U3V16F12 12 V boost | 13.1 × 8.1 × 3 mm (sits on the driver board) | [Pololu 4945](https://www.pololu.com/product/4945) |

## Regenerating
```bash
hardware/.venv/bin/python hardware/beacon/make_beacon_case.py --preview /tmp/beacon-preview
```
It prints the size and the fit checks, and exits with an error if anything overlaps. The checks use stand-in blocks
for every part in the table, and also check that no two parts collide.

## Before you print a batch
1. **Print the front panel only and test-fit:**
   - Does the OLED line up with the window?
   - Do the buttons screw in?
   - Does the siren sit on its shelf?
   - Does a USB-C plug reach the board's socket through the side opening?
2. **Measure the 3 unpublished sizes** (OLED position, button body, siren solder-pin length) and update `Parts`.
3. **Fit the LoRa antenna:** it comes with the board on a small cable. Stick it to the inside top wall, away from the
   battery and the siren.
