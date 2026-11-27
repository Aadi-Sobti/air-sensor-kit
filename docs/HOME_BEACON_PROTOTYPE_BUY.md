# Home Beacon prototype: what to buy

> **Newer version (2026-11-27):** the founder adopted the Help-First beacon (decision #39). Its parts list is
> `docs/HOME_BEACON_HELP_FIRST_BUY.md` and its case is `hardware/beacon-help-first/`. This page is for the earlier
> WiFi-plus-LoRa design; many of its small parts carry over.

**What this is for:** one prototype of the **two-box design**. The air sensor stays outside; the beacon is the indoor
box, with no air sensor. The printed case in `hardware/beacon/` (`stl/front.stl`, `stl/back.stl`) is sized for
exactly these parts, and its fit checks pass. The outdoor sensor's parts are in [their own section](#the-outdoor-sensor-the-other-box)
at the end.

**How the parts were checked (2026-11-26):**
- Each part's size was checked against the case using the **maker's spec sheet or the listing's spec table**.
- **Stock was checked on the seller's own page** for every non-Amazon link marked "in stock today".
- **Amazon blocks automated tools**, so Amazon links come from search results and their pages couldn't be opened.
  When you open an Amazon link, check that the title matches and that it says "In Stock" before you buy.
- Prices marked "≈" are from search snapshots. Expect Amazon to be a bit higher.

## Out of stock? Buy these instead (checked 2026-11-26)
| You couldn't get | Buy this instead | Stock today | Fits the case? |
|---|---|---|---|
| **Battery**, Adafruit 354 (the "345" you mentioned) | **The same pack straight from Adafruit:** [adafruit.com/product/354](https://www.adafruit.com/product/354), $19.95 | In stock | Same part (69 × 37 × 18 mm) |
| **12 V booster**, Pololu U3V12F12 | **Pololu U3V16F12:** [pololu.com/product/4945](https://www.pololu.com/product/4945), $7.95. The U3V12F12 has been **discontinued**, so every listing for it is empty. The U3V16F12 is the part the beacon plan was designed around | In stock (579) | Fits (13.1 × 8.1 × 3 mm) |
| **Switching transistors**, IRLB8721 | **IRLZ44N, 10-pack:** [B0BW8K31BF](https://www.amazon.com/dp/B0BW8K31BF) or [B0D3Q24JH6](https://www.amazon.com/dp/B0D3Q24JH6). Off Amazon: [SparkFun COM-24144](https://www.sparkfun.com/n-channel-mosfet-55v-30a.html), $1.50 each (that one is the IRLZ34N, also logic-level and fine here). The IRLB8721 is obsolete at DigiKey and out of stock at Adafruit | SparkFun: in stock | Same TO-220 shape: fits laid flat |
| **Solder board**, FeatherWing Proto (the link was dead; it's out of stock at Adafruit too) | **2 × 8 cm perfboard, cut to 50–53 mm long:** [adafruit.com/product/4858](https://www.adafruit.com/product/4858), $2.25 for 3. Amazon: [Sscon 20-pack, B07VBD12S9](https://www.amazon.com/dp/B07VBD12S9) | Adafruit: 64 in stock | **Yes: the case was updated for it today** (20 mm wide instead of 22.9) |

**Easiest way to get them:** one Adafruit order (battery 354, battery adapter 1131, perfboard 4858, and a UL-listed
charger 501 if you need one) plus one Pololu order (the booster). Both ship from the US; shipping is extra. Get the
transistors on Amazon with the rest.

## Parts
| # | Item | Buy | Backups | Qty | Fits the case? | Notes |
|---|---|---|---|---|---|---|
| 1 | **Heltec WiFi LoRa 32 V3**, **902–928 MHz** (USA) version, antenna and battery lead in the box | Amazon [B0D1H1FN9Y](https://www.amazon.com/dp/B0D1H1FN9Y) | [Rokland](https://store.rokland.com/products/heltec-wifi-lora-32v3), $26.97, **in stock today**, free US shipping over $20 (pick "Without Plastic Shell"). Amazon: MakerFocus [B076MSLFC9](https://www.amazon.com/dp/B076MSLFC9), DIYmalls [B086ZFCV7F](https://www.amazon.com/dp/B086ZFCV7F) | 1 | **Same part** (50.2 × 25.5 × 10.2 mm) | Pick the 915 MHz / V3 option on the page: some listings mix V2 and other bands. **Not the Heltec V4** (1.5 mm too long) or the "Wireless Stick" (different board). Screw the antenna on before powering it |
| 2 | **Li-ion pack**, 3.7 V 4400 mAh, protected, JST-PH plug | [Adafruit 354](https://www.adafruit.com/product/354), $19.95, **in stock today** | Amazon, both 2-pin JST-PH with protection: XINLANTECH 5200 mAh [B0C2VFTDPY](https://www.amazon.com/dp/B0C2VFTDPY) (68 × 37 × 19), GYMIN 5200 mAh [B0FX4MMPLV](https://www.amazon.com/dp/B0FX4MMPLV) (68 × 37 × 19). **Not** the Xain B0D5W6SKC6: at 39 mm wide it's too big | 1 | Same part; backups fit (the cradle is 70 long × 38 tall × about 22 deep) | **The battery must have protection built in**: the board has none. Adafruit is the safest source; I found no safety marks for the no-name packs. On Amazon make sure it says **PH2.0 2P**: the same brands sell 3-pin and XH plugs that look the same |
| 3 | **Battery adapter**, JST-PH 2-pin | elechawk 10-pack [B07NWD5NTN](https://www.amazon.com/dp/B07NWD5NTN) | [Adafruit 1131](https://www.adafruit.com/product/1131) extension cable, $1.95, **in stock today** (cut it and use the socket end) | 1 | Goes inside, no pocket | Joined to the small battery lead in the Heltec box. **Check + and − with a multimeter**: wire colours aren't standard |
| 4 | **Alarm**: 12 V mini piezo siren, 47 × 39 × 23.5 mm | Wishiot 2-pack [B0BJDL3G7T](https://www.amazon.com/dp/B0BJDL3G7T) | Same body, other sellers: Wishiot 5-pack [B086YKYKL7](https://www.amazon.com/dp/B086YKYKL7), ShangHJ [B097PYQDBD](https://www.amazon.com/dp/B097PYQDBD), DKARDU [B0B82QH85S](https://www.amazon.com/dp/B0B82QH85S) | 1 | Fits, **with almost no spare room** (0.25 mm each side) | **Measure it when it arrives** (47 × 39 × 23.5 or smaller) and take off any metal bracket. Prefer "110 dB at 1 m" over "at 30 cm" listings. Check loudness with a phone sound meter at 3 m |
| 5 | **12 V booster**: Pololu U3V16F12 | [Pololu 4945](https://www.pololu.com/product/4945), $7.95, **in stock today** | Generic "3.7 V to 12 V mini boost" 10-pack, Amazon [B0B4TB9QNY](https://www.amazon.com/dp/B0B4TB9QNY) (22 × 11 mm, fits on the solder board but crowds it) | 1 | Fits (sits on the solder board) | Starts at 2.7 V, so it runs from the battery during an outage. **If you use the generic one:** remove its little LED (it would drain the battery in about a month) and measure 12 V before connecting the siren |
| 6 | **Switching transistors**: IRLZ44N, 10-pack | [B0BW8K31BF](https://www.amazon.com/dp/B0BW8K31BF) | [B0D3Q24JH6](https://www.amazon.com/dp/B0D3Q24JH6); [SparkFun COM-24144](https://www.sparkfun.com/n-channel-mosfet-55v-30a.html), $1.50 each, **in stock today** | 2 used | Fits laid flat (legs bent 90°) | **Must start with IRL**: IRLZ44N on Amazon, or SparkFun's COM-24144, which is the IRLZ34N (also logic-level and fine here). **Not IRF**Z44N: that one needs 10 V to switch on, even if the listing claims 3.3 V. Test each: 3.3 V on the gate should turn a 12 V load on |
| 7 | **Resistor kit**, 1/4 W | ELEGOO 525 pcs [B072BL2VX1](https://www.amazon.com/dp/B072BL2VX1) | [SparkFun COM-10969](https://www.sparkfun.com/resistor-kit-1-4w-500-total.html), $9.95, **in stock today** | 1 kit | Fits | Covers the 100 Ω, 10 kΩ and 100 kΩ the wiring needs |
| 8 | **Solder board**: 2 × 8 cm perfboard | [Adafruit 4858](https://www.adafruit.com/product/4858), $2.25 for 3, **in stock today** | Sscon 20-pack [B07VBD12S9](https://www.amazon.com/dp/B07VBD12S9) (same 2 × 8 cm, 6 × 28 holes) | 1 | **Fits once cut** to 50–53 mm long | Score both sides along a row of holes, snap, and file the edge. Leave two 3 mm strips free of tall parts, **39.6 mm apart** centre to centre, each about 6 mm from its end: the zip ties cross there (build step 2 in `docs/HOME_BEACON.md`) |
| 9 | **Two 30 mm arcade buttons with lights**, **5 V** version (green + red) | EG STARTS 5-pack [B01N11BDX9](https://www.amazon.com/dp/B01N11BDX9) | Tiaoifaer 5-pack [B0BJ1FP431](https://www.amazon.com/dp/B0BJ1FP431); green alone: [Adafruit 3487](https://www.adafruit.com/product/3487), in stock today | 1 pack | Fits (30 mm hole) | **Get 5 V, not 12 V.** **Test both LEDs at 3.3 V when they arrive, red first**: see [the red button check](#check-the-red-button-as-soon-as-it-arrives) |
| 10 | **12 V white LED strip**, 8 mm wide | HitLights [B005ST2I9O](https://www.amazon.com/dp/B005ST2I9O) | Lepro [B00HSF65MC](https://www.amazon.com/dp/B00HSF65MC) (dimmer), TUNICHX **12 V** version [B0D9QJ7575](https://www.amazon.com/dp/B0D9QJ7575) | 1 reel (50 mm used) | Fits (8 mm in the 10.5 mm slot) | Cut only on the marked lines; the piece must be **52 mm or shorter**. **12 V**, not 5 V or 24 V. Not a certified strobe |
| 11 | **USB-A wall charger, UL-listed** | [Adafruit 501](https://www.adafruit.com/product/501), $5.95, **in stock today** (its page links the UL certificate) | Apple 12 W [B08J5GQTVF](https://www.amazon.com/dp/B08J5GQTVF): Apple no longer sells it itself, so buy only if it's sold by Amazon (fakes are common); Amazon Basics 12 W [B0773J79KC](https://www.amazon.com/dp/B0773J79KC) | 1 | Outside the case | USB-A, not USB-C: Meshtastic warns the V3 may not charge its battery over C-to-C. Look for a UL or ETL mark **on the charger itself** |
| 12 | **USB-A to USB-C cable**, slim plug | Amazon Basics [B085SBKFJR](https://www.amazon.com/dp/B085SBKFJR) | White version [B085SBGMHV](https://www.amazon.com/dp/B085SBGMHV); [Adafruit 4474](https://www.adafruit.com/product/4474), in stock today | 1 | The plug's moulded part must be ≤ 13 × 10 mm | No maker publishes plug sizes: avoid braided, right-angle or "reinforced" plugs |
| 13 | **M3 × 10 self-tapping screws**, pan head | uxcell [B01M0P3EUK](https://www.amazon.com/dp/B01M0P3EUK) | uxcell [B0CCRSNKRT](https://www.amazon.com/dp/B0CCRSNKRT), YOUYIDUN assortment [B0BPM8J5F5](https://www.amazon.com/dp/B0BPM8J5F5) | 4 used | Head must be ≤ 6.2 mm across | **Not** Glvaner B09NPKCYKW: its 7 mm washer head sticks out. Any length from 8 to 16 mm works. The recess is 1.6 mm deep, so pan heads sit slightly proud. The ties and the battery strap lie in 1.5 mm grooves on the back, so with a thin strap the case still hangs flat |
| 14 | **Hookup wire**, 22 AWG solid | TUOFENG [B07TX6BX47](https://www.amazon.com/dp/B07TX6BX47) | Remington UL1007 kit [B010IBY5QU](https://www.amazon.com/dp/B010IBY5QU); [Adafruit 1311](https://www.adafruit.com/product/1311), in stock today | 1 kit | Fits | |
| 15 | **Heat-shrink tubing** | Ginsco 580 pcs [B01MFA3OFA](https://www.amazon.com/dp/B01MFA3OFA) | 3M FP-301 kit [B0002SR3BO](https://www.amazon.com/dp/B0002SR3BO); [Adafruit 1649](https://www.adafruit.com/product/1649), in stock today | 1 kit | Fits | Use 3/32" over insulated 22 AWG wire; 1/16" only over bare joints |
| 16 | **Small zip ties**, 2.5 mm wide or less (the slots are 3 mm) and about 150 mm (6 in) long: each loop is about 70–75 mm, too much for 100 mm ties | any | | 2 used | Through the slots beside the solder board | Hold the solder board on its ledges. Close each with the lock head on the board's side, not the outside of the case |
| 17 | **Battery strap**: a thin hook-and-loop strap up to 12 mm wide and at least 250 mm long, or a zip tie about 300 mm (12 in) long (the loop around the pack and through the plate is about 200 mm) | any | | 1 | Through the slots beside the battery cradle | Goes around the front of the pack |
| 18 | **Quick-connect (female spade) terminals**, insulated, for the buttons' tabs | any | | about 8 | Inside | Measure the tabs when the buttons arrive (often 4.8 mm). Or solder the wires to the tabs |
| 19 | **2-pin screw terminal** for the battery branch on the solder board | any | | 1 | On the solder board | Or use a spare JST-PH socket from row 3 |

**Already in the board's box:** the LoRa antenna (stick it to the inside top wall) and the board's small battery lead.

### Check the red button as soon as it arrives
Adafruit says its red 30 mm LED buttons have two LEDs in series and won't light from 3.3 V, which is what the
beacon's pin gives. Generic green ones can also be dim or dark at 3.3 V; only Adafruit's own green (3487) is documented
to light. The Amazon 5 V buttons look like the same generic part. **Test:** put 3.3 V and GND on the red
button's two LED terminals (swap them once if it stays dark). If it lights, you're fine. If it stays dark, tell me:
the fix changes the wiring, so it's your call (`docs/HOME_BEACON.md` § 4 has the two options). Either option uses parts
already on this list.

## If you don't have them already
| Item | Amazon link | Why |
|---|---|---|
| Soldering iron (e.g. Weller WLC100 kit with solder) | [B0B3GQ3FCX](https://www.amazon.com/dp/B0B3GQ3FCX) | The alarm and light driver need a few solder joints |
| Multimeter (AstroAI AM33D) | [B01ISAMUA6](https://www.amazon.com/dp/B01ISAMUA6) | Check battery polarity (+/−), continuity, and the booster's 12 V output |
| Flush cutters, wire stripper, safety glasses | any | |
| PLA filament, **white**, 1.75 mm (Polymaker) | [B0CFQWM9T1](https://www.amazon.com/dp/B0CFQWM9T1) | Only if you print the case yourself. White lets the alarm light show through |

## Cost
- **Parts:** roughly **$140–180** for one prototype, unverified, plus shipping from Adafruit and Pololu. That's higher
  than the ≈ $84 per beacon in the plan because most items come in packs (sirens, transistors, LED strip, resistor and
  wire kits).
- **The leftovers cover most of the next 4 beacons.** Still buy per beacon: board, battery, booster, buttons, charger
  and USB cable. The siren 2-pack covers 2 beacons (the Wishiot 5-pack B086YKYKL7 covers 5), and the perfboard 3-pack
  covers 3.
- **Not included:** a weather radio for alerts when the internet is down (about $20–100+ each, `docs/HOME_BEACON.md`
  § 2a). That's decision #36.
- **Tools:** add about $20 (multimeter) to about $100 (soldering station) if needed.

## Size checks on the case (2026-11-26)
- **Solder board pocket, changed today:**
  - resized for the 20 mm wide perfboard;
  - two ledges it rests on, so the solder joints underneath stay off the plastic;
  - rails that rise to the board's front face, so it can't slide sideways;
  - the zip-tie slots moved outside the rails, 39.6 mm apart. Before, they sat under the board, so a tie couldn't go
    around it.
- **Battery cradle, changed today:** the strap slots moved beside the cradle's side walls. Before, a strap through them
  could only loop around the cradle's top wall, not the pack. The cradle's free height is 38 mm, so a replacement pack
  must be 37.5 mm wide or less.
- **Shallow grooves on the back** hold the ties and the strap, so the case still hangs flat on a wall.
- **New fit checks** confirm both zip ties and the battery strap have a clear path, and that the cradle holds the pack.
  Fit checks: OK. Outside size unchanged at 117 × 62 × 101 mm.
- **Earlier today, for the Amazon siren:** the siren holder is 47 × 39 × 23.5 mm, the board holders are deeper, and a
  finger on the back plate presses the radio board forward.
- **Measure before printing**, as in `hardware/beacon/README.md`: the OLED window position, and the buttons' depth
  behind the panel.
- **Heltec V4 or RAK3312 instead** (decision #30): neither fits this case as-is. The V4 needs `board_l` 51.7 and
  `board_t` 10.7.

## The outdoor sensor (the other box)
**The beacon list above doesn't include it.** You already have a working sensor (your NodeMCU V3 + PMS5003, plugged in
at home), so to move it outside you only need the case and power.

### To put your current sensor outside
| Item | Buy | Backups | Fits the case? | Notes |
|---|---|---|---|---|
| **Printed case**: `hardware/enclosure/stl/shell.stl` + `insert.stl` | Polymaker **PETG** white, 1 kg: [B0FG3FHG29](https://www.amazon.com/dp/B0FG3FHG29) | [Polymaker store](https://shop.polymaker.com/products/petg?variant=45079221141561), $18.99, in stock today; **ASA** white [B09DKN3S9J](https://www.amazon.com/dp/B09DKN3S9J) if your printer is enclosed | It's the case | **Not PLA** outdoors: it softens in the sun. About 60–80 g per case. Light colours stay cooler |
| **10 ft micro-USB cable** that carries data | CableWholesale 10U2-03110BK, Amazon [B002I8MUJG](https://www.amazon.com/dp/B002I8MUJG) | [cablewholesale.com](https://www.cablewholesale.com/products/usb-firewire/usb-2.0-cables/product-10u2-03110bk.php), $4.36, in stock today (closed for Thanksgiving: ships about Monday 11/30); StarTech [B0017JY5F4](https://www.amazon.com/dp/B0017JY5F4) (thicker wires, $12) | Plug confirmed by the maker's drawing (26 mm) | Not outdoor-rated: leave a drip loop below the plug and keep it out of window and door jambs |
| **UL-listed USB charger** | [Adafruit 501](https://www.adafruit.com/product/501), $5.95, in stock today | Amazon Basics 12 W [B0773BHCV1](https://www.amazon.com/dp/B0773BHCV1) (check the label for a UL mark) | Stays indoors or under cover | Adafruit's gives 5.25 V on purpose, which makes up for the voltage lost in a 10 ft cable |

**Before you rely on it:**
- **Measure your NodeMCU** (already on your to-do list). The case fits the wide board, about 58 × 31 mm. The narrow
  49 × 26 mm board won't stay in its holders.
- **Measure the voltage at the end of the 10 ft cable** (the VIN pin, with the sensor running). The air sensor needs
  at least 4.5 V. A plain 5.0 V charger plus a thin 10 ft cable can drop close to that.

### For a second complete sensor
| Item | Buy | Backups | Qty | Notes |
|---|---|---|---|---|
| **NodeMCU V3, wide "LoLin" board** (CH340, micro-USB) | [Envistia Mall](https://envistiamall.com/products/nodemcu-lua-esp8266-esp-12e-ch340g-wireless-wifi-iot-development-board-v3), $4.39 + $5.95 shipping, available today, seller states 58 × 31 mm | Amazon: ACEIRMC 3-pack [B0828L4743](https://www.amazon.com/dp/B0828L4743) (about 60 × 32 mm: zero spare, measure), HiLetgo 2-pack [B0832MLXH3](https://www.amazon.com/dp/B0832MLXH3) (size not stated) | 1 | Look for "LoLin" in the photos. **Not** the narrow CP2102 "Amica" boards (e.g. HiLetgo B010O1G1ES) |
| **Plantower PMS5003 + cable + adapter board** | [Adafruit 3686](https://www.adafruit.com/product/3686), $39.95, in stock today. Check on arrival whether the adapter's header comes soldered (if not, that's a soldering step) | Amazon: whiteeeen [B09BQZP2CY](https://www.amazon.com/dp/B09BQZP2CY) | 1 | Amazon has clones and relabelled sensors. If you try a cheap one, run it next to a genuine one for 24 h first (test 2 in the sensor case README). Skip "PMS5003 compatible", PMS7003 and PMSA003 listings: different shape and plug |
| **Female-to-female jumper wires**, 15–20 cm | [Adafruit 266](https://www.adafruit.com/product/266), $3.95 for 40, in stock today | ELEGOO 120-piece kit [B01EV70C78](https://www.amazon.com/dp/B01EV70C78) (20 cm) | 4 | **Not 10 cm**: the power wires need about 8–12 cm. Wiring: adapter VCC → VIN, GND → G, TXD → D1, RXD → D2 |
| Case, cable and charger | as above | | | |

**Cost of a second sensor:** about **$57 in parts** at these prices (sensor $39.95, board $4.39, cable $4.36, charger
$5.95, filament about $2, jumpers about $0.40 for the 4, from a $3.95 pack of 40), plus shipping. This is prototype sourcing only. It doesn't change the
kit's planned cost, which assumes bulk buying (the long cable and charger are still open decision #11).
