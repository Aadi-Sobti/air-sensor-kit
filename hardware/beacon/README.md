# Home Beacon case (indoor pilot prototype)

Two printed parts held together by 4 M3 screws. **Status: designed and fit-checked in software only. Not printed.**
The plan is in [`docs/HOME_BEACON.md`](../../docs/HOME_BEACON.md).

| File | What | Print orientation |
|---|---|---|
| `stl/front.stl` | Front panel and walls: OLED window, two 30 mm button holes, a thin light window for the alarm LED, label recesses, siren grille on top, USB-C opening on the right. Inside: board holders, siren holder | Front panel flat on the bed (already oriented). No supports. |
| `stl/back.stl` | Back plate: 2 wall-mount keyholes, a battery cradle (free height 38 mm) with a strap slot beside each side wall, shallow grooves on the outside for the strap and ties, a pocket for the driver board (ledges it rests on, rails that stop it sliding sideways, and zip-tie slots outside the rails), 2 fingers that keep the radio board against the front | Outer face flat on the bed (already oriented). No supports. |

**Size:** 117 wide × 62 deep × 101 tall mm, about the size of a small clock radio. It stands on a shelf or hangs on a wall.

## Printing
- **Material:** PETG or PLA (it's indoors). Print the front in **white** so the alarm light shows through the 0.8 mm
  "skin" over the LED strip.
- **Settings:** 0.2 mm layers, 3 walls, 20% infill.
- **Plastic:** about 139 cm³ of solid volume, so roughly 75–95 g at typical settings. Your slicer gives the exact
  amount.
- **Screws:** 4 × M3 × 10 mm self-tapping (into 2.5 mm pilot holes). Use M3 heat-set inserts if you'll open it often.

## Part sizes (sources)
| Part | Size used | Source |
|---|---|---|
| Heltec WiFi LoRa 32 V3 | 50.2 × 25.5 × 10.2 mm | [Heltec product page](https://heltec.org/project/wifi-lora-32-v3/), [datasheet V3.2](https://resource.heltec.cn/download/WiFi_LoRa_32_V3/HTIT-WB32LA_V3.2.pdf) |
| OLED window position | 7 mm from the antenna end, 27 × 15 mm window | **Not in the datasheet text. Measure before printing** (`Parts.oled_*`) |
| Alarm (prototype, Amazon): Wishiot 12 V mini piezo siren | 47 × 39 × 23.5 mm (`Parts.siren_l/w/h`) | Amazon B0BJDL3G7T listing spec; seller claims 110 dB at 1 m. For the round SparkFun COM-13939 (Ø35.8 × 35.7 mm, [SparkFun](https://www.sparkfun.com/large-piezo-alarm-16-tone.html)) set 35.8 / 35.8 / 35.7 |
| Circuit board depth inside the Heltec V3 | front 5.5 mm, back 7.1 mm behind the OLED face; battery socket near the USB end reaches 10.2 | Heltec datasheet V3.2 §4 drawing (board holders are 9 mm deep so they grip the board's edge) |
| Adafruit 30 mm arcade button | 30 mm hole; panel up to ~20 mm | [Adafruit 3487](https://www.adafruit.com/product/3487) |
| Arcade button body behind the panel | Ø33 × 33 mm | **Not published. Measure before printing** (`Parts.button_body_*`) |
| Adafruit 354 battery pack (2 × 18650) | 69 × 37 × 18 mm (the cradle's free height is 38 mm, so other packs must be 37.5 mm wide or less) | [Adafruit 354](https://www.adafruit.com/product/354) |
| Driver board: 2 × 8 cm perfboard cut to 50–53 mm long | 20 × 53 mm max, parts up to 15 mm; first hole row ~3.6 mm from each long edge | [Adafruit 4858](https://www.adafruit.com/product/4858) (6 × 28 holes, 2.54 mm). The FeatherWing Proto (50.9 × 22.9, [Adafruit 2884](https://www.adafruit.com/product/2884)) is out of stock, and changing `proto_l/w` alone doesn't fit it: at 22.9 mm the lower zip-tie slot hits the battery cradle, so the pocket would also have to move |
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
2. **Measure the 3 unpublished sizes** (OLED position, button body depth, and the siren's real size: 47 × 39 × 23.5 mm or smaller) and update `Parts`.
3. **Fit the LoRa antenna:** it comes with the board on a small cable. Stick it to the inside top wall, away from the
   battery and the siren.
