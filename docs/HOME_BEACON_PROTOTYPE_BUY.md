# Home Beacon prototype: what to buy (Amazon)

**What this is for:** one prototype of the **two-box design**. The air sensor stays outside; the beacon is the indoor
box, with no air sensor. The printed case in `hardware/beacon/` (`stl/front.stl`, `stl/back.stl`) is sized for
exactly these parts. It was updated on 2026-11-26 for the Amazon alarm, and its fit checks pass.

**How the parts were checked (2026-11-26):**
- Each part's size was checked against the case using the **maker's spec sheet or the listing's spec table**.
- **Amazon blocks automated tools**, so the links come from search results and the pages couldn't be opened to confirm
  title, price or stock. When you open each link, make sure the title matches before you buy. Prices below come from
  the maker's own store or search snapshots, marked "≈". Expect Amazon to be a bit higher.

## Parts
| # | Item | Amazon link | Qty | Fits the case? | Notes |
|---|---|---|---|---|---|
| 1 | **Heltec WiFi LoRa 32 V3**, **902–928 MHz** (USA) version, with antenna and battery lead in the box | [B0D1H1FN9Y](https://www.amazon.com/dp/B0D1H1FN9Y) · backup with a plastic case: [B0DHGZKCL1](https://www.amazon.com/dp/B0DHGZKCL1) | 1 | **Same part** (50.2 × 25.5 × 10.2 mm) | ≈ $18 at Heltec. Pick the 902–928 MHz option. **Don't buy the Heltec V4 for this case**: it's 1.5 mm longer. **Don't buy the "Wireless Stick"**: it's a different board |
| 2 | **Adafruit 354** Li-ion pack, 3.7 V 4400 mAh, protected, JST-PH plug | [B0137IRGHG](https://www.amazon.com/dp/B0137IRGHG) | 1 | **Same part** (69 × 37 × 18 mm) | ≈ $20 at Adafruit. Buy only from Adafruit or a known reseller. The battery must have protection built in, because the board has none |
| 3 | **Battery adapter**: JST-PH 2.0 pigtails (elechawk 10-pack) | [B07NWD5NTN](https://www.amazon.com/dp/B07NWD5NTN) | 1 pack | Fits (goes inside, no pocket) | Joined to the small battery lead that comes with the Heltec board. **Check + and − with a multimeter**: plug colours aren't standard between brands |
| 4 | **Alarm**: Wishiot 12 V mini piezo siren, 110 dB, 2-pack | [B0BJDL3G7T](https://www.amazon.com/dp/B0BJDL3G7T) | 1 pack (1 used) | **Fits the updated case** (47 × 39 × 23.5 mm) | The case was resized for this one. "110 dB at 1 m" is the seller's claim, so check it with a phone sound meter at 3 m |
| 5 | **12 V booster**: Pololu U3V12F12 | [B016VGT6Q0](https://www.amazon.com/dp/B016VGT6Q0) | 1 | Fits (13 × 8 × 3 mm, same footprint as the planned U3V16F12) | Starts at 2.5 V, so it runs from the battery during an outage |
| 6 | **Switching transistors**: IRLB8721 logic-level MOSFET, 10-pack | [B00R5C8XKU](https://www.amazon.com/dp/B00R5C8XKU) | 1 pack (2 used) | Fits **if laid flat** (legs bent 90°) | ≈ $7. This is the same chip as Adafruit 355. Test each one first: 3.3 V on the gate should turn a 12 V load on |
| 7 | **Resistor kit** (ELEGOO 525 pcs, 1/4 W) | [B072BL2VX1](https://www.amazon.com/dp/B072BL2VX1) | 1 kit | Fits | ≈ $9. Covers the 100 Ω, 10 kΩ and 100 kΩ the wiring needs |
| 8 | **Solder board**: Adafruit FeatherWing Proto | [B01BOD015U](https://www.amazon.com/dp/B01BOD015U) · backup: ELEGOO perfboard kit [B072Z7Y19F](https://www.amazon.com/dp/B072Z7Y19F) (cut a 2 × 8 cm board to 20 holes) | 1 | **Same part** (50.9 × 22.9 mm); the backup fits once cut | |
| 9 | **Two 30 mm arcade buttons with lights**: EG STARTS 5-pack, **5 V** version (has green and red) | [B01N11BDX9](https://www.amazon.com/dp/B01N11BDX9) | 1 pack (green + red used) | Fits (30 mm hole, 33 mm across) | **Get the 5 V version, not 12 V**: the board lights them from 3.3 V. Solder the wires and bend them sideways; the battery sits right behind the buttons |
| 10 | **12 V white LED strip** (HitLights, 8 mm wide) | [B005ST2I9O](https://www.amazon.com/dp/B005ST2I9O) | 1 reel (50 mm used) | Fits (8 mm in the 10.5 mm slot) | Cut a 50 mm piece only on the marked lines. **12 V**, not 5 V or 24 V. This is not a certified strobe |
| 11 | **USB-A wall charger, UL-listed** (e.g. Apple 12 W) | [B08J5GQTVF](https://www.amazon.com/dp/B08J5GQTVF) | 1 | Outside the case | Use USB-A, not a USB-C charger: Meshtastic warns the V3 may not charge its battery over C-to-C. Check for a UL or ETL mark on the label |
| 12 | **USB-A to USB-C cable** (Amazon Basics, USB-IF certified, 3 ft) | [B085SBKFJR](https://www.amazon.com/dp/B085SBKFJR) | 1 | Plug fits the 13 × 10 mm side opening | Avoid chunky braided or right-angle plugs |
| 13 | **M3 × 10 self-tapping screws** (uxcell 100-pack, pan head) | [B01M0P3EUK](https://www.amazon.com/dp/B01M0P3EUK) | 1 pack (4 used) | **Same part** | Not countersunk |
| 14 | **Hookup wire**, 22 AWG solid (TUOFENG 6 colours) | [B07TX6BX47](https://www.amazon.com/dp/B07TX6BX47) | 1 kit | Fits | |
| 15 | **Heat-shrink tubing** (Ginsco 580 pcs) | [B01MFA3OFA](https://www.amazon.com/dp/B01MFA3OFA) | 1 kit | Fits | Use the 1/16" or 3/32" sizes on 22 AWG |

**Already in the board's box:** the LoRa antenna (stick it to the inside top wall) and the board's small battery lead.

**Not needed for this prototype:** the air sensor (two-box design: your existing sensor stays outside).

## If you don't have them already
| Item | Amazon link | Why |
|---|---|---|
| Soldering iron (e.g. Weller WLC100 kit with solder) | [B0B3GQ3FCX](https://www.amazon.com/dp/B0B3GQ3FCX) | The alarm and light driver need a few solder joints |
| Multimeter (AstroAI AM33D) | [B01ISAMUA6](https://www.amazon.com/dp/B01ISAMUA6) | Check battery polarity (+/−), continuity, and the booster's 12 V output |
| Flush cutters, wire stripper, small zip ties, safety glasses | any | Zip ties hold the solder board in its pocket |
| PLA filament, **white**, 1.75 mm (Polymaker) | [B0CFQWM9T1](https://www.amazon.com/dp/B0CFQWM9T1) | Only if you print the case yourself. White lets the alarm light show through |

## Cost
- **Parts:** roughly **$140–180** for one prototype, unverified. That's higher than the ≈ $83 per beacon in the plan
  because most items come in packs (siren 2-pack, 10 transistors, a reel of LED strip, resistor and wire kits).
  Those leftovers cover the next 4 beacons, apart from boards, batteries, boosters and buttons.
- **Tools:** add about $20 (multimeter) to about $100 (soldering station) if needed.

## Size checks on the case (2026-11-26)
- **Updated for the Amazon siren:**
  - the siren holder is 47 × 39 × 23.5 mm (was the round 35.8 mm SparkFun alarm);
  - the board holders are deeper, so they grip the circuit board's edge;
  - a finger on the back plate presses the board forward.
  - Fit checks: OK. Outside size unchanged at 117 × 62 × 101 mm.
- **Measure before printing**, as in `hardware/beacon/README.md`: the OLED window position, and the buttons' depth behind the panel.
- **Heltec V4 or RAK3312 instead** (decision #30): neither fits this case as-is. The V4 needs `board_l` 51.7 and
  `board_t` 10.7.
