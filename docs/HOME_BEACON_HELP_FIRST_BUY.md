# Help-First Home Beacon: what to buy for a bench prototype

For the version the founder adopted on 2026-11-26 (decision #39, `docs/BEACON_RECOMMENDATION.md`): one bedside box
with its own cell connection, LoRa, a louder alarm, a speaker for a low wake-up tone and voice, and big buttons. The
printed case is in `hardware/beacon-help-first/` (`stl/front.stl`, `stl/back.stl`). Its fit checks pass with exactly
these parts. The earlier list (`docs/HOME_BEACON_PROTOTYPE_BUY.md`) is for the older WiFi-plus-LoRa design.

**This is a bench prototype.** Before any home gets one:
- **A silence button** the household can reach (see the wiring plan).
- **The safety label** on the box (a recess is on the back).
- **The other gates** in `docs/BEACON_RECOMMENDATION.md`: an FCC and carrier opinion, insurance and a partner agreement.

**How this list was made (2026-11-27):**
- **Sizes and electrical specs** come from each maker's spec page or drawing. A second reviewer re-checked them, and a
  third checked this list and the case against both.
- **Stock** was checked on the seller's own page for every non-Amazon link marked "in stock today".
- **Amazon blocks automated tools,** so Amazon links come from search results. Open each one and check that the title,
  variant and "In Stock" match before you buy.
- **Prices** marked "≈" are snapshots.

## Fastest way to get everything
- **Amazon:** the rows marked Amazon below.
- **Adafruit,** one order:
  - the 10 Ah battery (5035), which isn't on Amazon. Amazon's 10 Ah packs have no maker datasheet or safety marks;
  - the flyback diodes (755);
  - optionally the UL-listed charger (501) and the 5 × 7 cm solder boards (4786).
- **Hologram.io:** the IoT SIM card ($3).
- **Mouser:** the Mallory siren (guaranteed 105 dB minimum at 1 m, the loudness that open decision #35 recommends). The
  Amazon one claims only about 99.5 dB at 1 m, from an unverified listing. The bedroom wake test itself needs at least
  75 dBA at the pillow with the door closed (`docs/BEACON_RECOMMENDATION.md`).
- **Pololu,** only if you pick the cheaper booster.

## Main parts
| # | Part | Buy | Backups | Qty per beacon | Fits the case? | Check before buying / notes |
|---|---|---|---|---|---|---|
| 1 | **LilyGO T-SIM7080G-S3**, the **"with PMU"** version (ESP32-S3 + SIM7080G cell modem + AXP2101 power chip) | Amazon [B0BW3NN54L](https://www.amazon.com/dp/B0BW3NN54L): pick the **with PMU** option | [lilygo.cc](https://lilygo.cc/products/t-sim7080-s3), variant "T-SIM7080G S3 [H606]", $36.41, available today, ships from China | 1 | **Yes:** 110.5 × 32.9 mm on 4 screw posts (holes 27.7 × 105.6 mm apart), LTE antenna end up, USB-C toward the right side | **The Amazon title says "Standard",** which is LilyGO's name for the *without*-PMU board (different pins, slower charging). Check that the board you get has the AXP2101 power chip. **Not** B0G3WNTH95. **The box also has:** an LTE antenna (use it); a GPS antenna (**leave it out**, and the firmware must never turn on GPS or cell-based location: the beacon must never produce coordinates); and a solar cable. **Never plug the battery into the small JST socket marked SOLAR:** a reversed pack would short. **Battery wiring:** before the board goes on its posts, solder the battery leads to the 18650 holder's tabs, and leave the holder empty (never fit an 18650 cell as well). Check + and − with a meter. Insert the SIM before mounting: its slot faces the LoRa module afterwards |
| 2 | **Waveshare Pico-LoRa-SX1262-915M** (LoRa radio, 915 MHz) | Amazon [B09W5P5HGQ](https://www.amazon.com/dp/B09W5P5HGQ) | TOP1 [B0B1M7WNGQ](https://www.amazon.com/dp/B0B1M7WNGQ); Coolwell [B09VGGG9BG](https://www.amazon.com/dp/B09VGGG9BG) (pick 915 MHz); Waveshare direct $14.99 | 1 | **Yes:** 21 × 52 mm, in its pocket on the back plate (hold with foam tape) | **Band:** must say **915M**, not 868M or 433M. **In the box:** a 2 dBi antenna and an IPEX-to-SMA lead; the SMA goes through the hole in the top of the case. **Wiring:** use only 3V3, GND and 7 signal pins (see the wiring plan), and **don't** use the small LiPo in the box. **Firmware:** the module wires DIO2 to its RF switch and DIO3 to its oscillator, so firmware must enable both or the radio won't work. **Power:** its power LED draws about 1.5 mA all the time; remove R15 (0 Ω) before battery tests |
| 3 | **IoT SIM** for LTE-M | [Hologram Hyper SIM](https://www.hologram.io/pricing/), $3 + $1/month + $0.03 per MB | Amazon: Soracom plan01s [B01M30ZYR5](https://www.amazon.com/dp/B01M30ZYR5) ($5; reported to work on AT&T LTE-M, not Verizon; card voltage not confirmed) | 1 | Goes in the board's slot | The board needs a **1.8 V-capable** SIM; Hologram's supports 1.62–5.5 V. Insert it **before** powering the modem. Expect AT&T coverage on the bench |
| 4 | **Battery: Adafruit 5035**, 10,050 mAh, protected | [adafruit.com/product/5035](https://www.adafruit.com/product/5035), $29.95, **in stock today** | None on Amazon recommended | 1 | **Yes:** cradle sized to the maker's max 69 × 56.5 × 19 mm, with a strap | **Protection:** over-charge, over-discharge and short protection built in. **Limits:** its leads are rated **2 A**, which limits what can run at once (see "Power budget"). **Charging:** no temperature sensor, so charge it indoors at room temperature (0–45 °C) |
| 5 | **12 V siren**, 47 × 39 × 23.5 mm body | **For loudness and wake tests:** Mallory Sonalert **PS-723BQ**, Mouser 539-PS723BQ, $12.51, in stock today (up to 20% tariff), **105 dB minimum at 1 m** | **For wiring tests only:** Wishiot 2-pack, Amazon [B0BJDL3G7T](https://www.amazon.com/dp/B0BJDL3G7T) | 1 | **Yes:** both share the body. The holder's end walls are 48.2 mm apart; a front stop keeps it under the grille, and a notch lets the Mallory's leads out | **Wishiot:** claims 110 dB **at 30 cm**, which is only about 99.5 dB at 1 m. **Open decision #35** recommends the Same Sky CPS-7560-110L450 ($9.15–9.37) instead. It's a 75 mm round siren, 54.5 mm deep, and **this case can't hold it**. The Mallory costs about $3 more. Which siren, and the case to match, is the founder's call |
| 6 | **12 V boost** | **Fastest:** Pololu U3V50F12, Amazon [B0GNRSTGF4](https://www.amazon.com/dp/B0GNRSTGF4) (seller should be Pololu; $29.95 at Pololu) | **Cheaper:** Pololu [U3V40F12](https://www.pololu.com/product/4016), $9.95, in stock today: 15 × 15 mm, solder it **flat** onto the driver board (upright it's too tall for the case); the boost posts then stay empty | 1 | **Yes:** U3V50F12 is 48 × 15 × 10.5 mm, on 2 posts (M2 screws) | **Capacity:** each can run the siren, the light and the red button's light (about 0.2 A at 12 V), plus a bed shaker of up to about 0.5 A. The U3V40F12 gives about 0.8 A at 12 V from a low pack. **The battery is the limit,** not the boost (see "Power budget"). **Measure 12 V with a meter before connecting anything.** The U3V50F12 needs at least 2.9 V in. The U3V40F12 has no short-circuit protection, so the shaker fuse is required |
| 7 | **I2S amplifier**, Adafruit MAX98357A | Amazon [B01K5GCFA6](https://www.amazon.com/dp/B01K5GCFA6) (brand Adafruit) | [Adafruit 3006](https://www.adafruit.com/product/3006), $5.95, in stock today | 1 | Solder it onto the driver board | Many generic "MAX98357" packs look alike: get the Adafruit one |
| 8 | **Speaker**, enclosed, 3 W 4 Ω, about 70 × 31 × 16 mm | CQRobot pair, Amazon [B0822Z4LPH](https://www.amazon.com/dp/B0822Z4LPH) (2 W rated, 3 W max) | [Adafruit 3351](https://www.adafruit.com/product/3351), $3.95, in stock today (3 W) | 1 | **Yes:** frame behind the front grille (a dab of hot glue holds it) | **The low 520 Hz wake-up tone will probably be too quiet on this speaker.** The fact-check estimates about 74–77 dBA total at 1 m, mostly from the square wave's higher harmonics. The 520 Hz part itself is only about 68–71 dB, and 1–2 dB less on a low pack. The bedroom test decides; a bigger speaker or two speakers is the fallback (not priced yet) |
| 9 | **1.3-inch OLED screen**, 128 × 64, I2C | Hosyond 5-pack (SH1106), Amazon [B0C3L7N917](https://www.amazon.com/dp/B0C3L7N917) | [Adafruit 938](https://www.adafruit.com/product/938) (SSD1306) | 1 | **Yes:** 4 posts fit both boards' hole patterns (30.4–30.5 × 28–28.5 mm) | **Screws:** M2 × 4–5 mm self-tapping into the posts (M2.5 is too tight for Adafruit's 2.5 mm holes). **Firmware:** the two brands use different chips (SH1106 vs SSD1306) |
| 10 | **Red 60 mm "I need help" button** with a 12 V light | BQLZR, Amazon [B00Z5PHRJM](https://www.amazon.com/dp/B00Z5PHRJM) (red) | [Adafruit 1190](https://www.adafruit.com/product/1190) | 1 | **Yes:** 26 mm hole; about 60 mm of room behind the panel | **Buying:** check the quantity and colour selected. **Fitting:** cut off the two small plastic alignment posts on the back of the bezel so it sits flat. **Light:** it runs from 12 V through a transistor. **Its polarity isn't marked:** find it at 3–5 V before connecting 12 V, because backwards at 12 V can destroy it |
| 11 | **Green 30 mm "I'm OK" button** with a 5 V light | EG STARTS 5-pack, Amazon [B01N11BDX9](https://www.amazon.com/dp/B01N11BDX9) (includes green) | [Adafruit 3487](https://www.adafruit.com/product/3487): documented to light dimly at 3.3 V | 1 | **Yes:** 30 mm hole | **Test its light at 3.3 V when it arrives.** Some sellers' listings say a 28 mm hole: test-fit. Its 4 tabs are 2.8 mm |
| 12 | **Bed shaker** (only for households that need it) | Sonic Alert Super Bed Shaker 12 V, Amazon [B005VFZR1G](https://www.amazon.com/dp/B005VFZR1G) | White version [B005GGQX7C](https://www.amazon.com/dp/B005GGQX7C) | 0–1 | Plugs into the jack on the back | **Plug:** retailers disagree on 3.5 vs 2.5 mm, and polarity isn't published. It has built-in electronics, so find + with a meter before wiring. **Current:** not published; measure it. **Thermal cut-out:** it stops after about 10 minutes of continuous running, so firmware should pulse it |
| 13 | **3.5 mm mono panel jack** for the shaker | CESS 2-pack, Amazon [B017CBO3C0](https://www.amazon.com/dp/B017CBO3C0) | [Adafruit 4361](https://www.adafruit.com/product/4361) | 1 | **Yes:** 6.4 mm hole; the back plate is thinned to 2 mm there so the nut grips | **Size:** measure the bushing before printing (M6 is typical). **Live bushing:** switched on the low side as planned, the jack's metal bushing is **live, not ground**. Making it ground needs a high-side switch (a P-channel MOSFET and a driver transistor, not on this list). That's a wiring choice for the founder. **Label** the jack "Bed shaker only": headphones fit it |

## Small parts
| Part | Buy | Qty | Notes |
|---|---|---|---|
| **Logic-level MOSFETs**, IRLZ44N | Amazon [B0BW8K31BF](https://www.amazon.com/dp/B0BW8K31BF) (10-pack) | 4 | Siren, light, bed shaker, red button's light. Must say **IRL**, not IRF. Test each: 3.3 V on the gate should switch 12 V on |
| **Flyback diode**, 1N4001 | [Adafruit 755](https://www.adafruit.com/product/755), $1.50 for 10, in stock today | 1 | Across the shaker jack (it's a motor), cathode to +12 V |
| **Resettable fuse** for the shaker output, through-hole, at least 16 V | not sourced yet (DigiKey or Mouser) | 1 | **Required:** the U3V40F12 has no short-circuit protection. Pick the hold current after measuring the shaker (about 1.5 × its running current), so it trips well below what the boost can give (about 0.8 A at 12 V from a low pack, minus the siren and light). A 1 A-hold part trips at about 2 A and would never protect anything |
| **Solder board**, 5 × 7 cm | ELEGOO kit, Amazon [B072Z7Y19F](https://www.amazon.com/dp/B072Z7Y19F) (has 5 × 7 boards) | 1 | Or [Adafruit 4786](https://www.adafruit.com/product/4786), $2.95 for 3, in stock today. Sits on ledges in its pocket, held with foam tape |
| **Resistor kit** | Amazon [B072BL2VX1](https://www.amazon.com/dp/B072BL2VX1) | 1 kit | 100 Ω gate resistors and 100 kΩ gate pull-downs |
| **12 V white LED strip** | HitLights, Amazon [B005ST2I9O](https://www.amazon.com/dp/B005ST2I9O) | 50 mm | **Check it's single-colour white, 12 V:** one search hinted this ASIN may be another strip. Or [Adafruit 5864](https://www.adafruit.com/product/5864) (1 m, $7.50; cut a 35 mm piece) |
| **Jumper wires**, male-to-female | ELEGOO 120-piece kit, Amazon [B01EV70C78](https://www.amazon.com/dp/B01EV70C78) | 9 | For the LoRa module's header. On the LilyGO, solder wires straight to the header holes; don't fit its header pins, which leaves room for the wires |
| **Screws for the board, screen and boost** | a small steel self-tapping assortment with M1.7 (or M1.6) and M2 | 4 + 4 + 2 | 4 × M1.7 × 5–6 mm for the LilyGO (its 2.0 mm holes are too tight for M2), 4 × M2 × 4–5 mm for the screen, and 2 × M2 × 5–6 mm for the boost. Nylon screws won't cut threads in plastic |
| **Case screws**, M3 × 10 self-tapping | Amazon [B01M0P3EUK](https://www.amazon.com/dp/B01M0P3EUK) | 4 | |
| **Battery strap**, hook-and-loop, 12 mm × 300 mm | Amazon [B0FQV8SRVL](https://www.amazon.com/dp/B0FQV8SRVL) | 1 | Goes through the slots beside the cradle, around the lower part of the pack |
| **Double-sided foam tape** | any | a strip | Holds the LoRa module and the driver board on their ledges |
| **Female spade terminals** | Twidec 2.8 + 4.8 mm, Amazon [B0H1KLDSV1](https://www.amazon.com/dp/B0H1KLDSV1), and 4.8 + 6.3 mm, Amazon [B08F784R9W](https://www.amazon.com/dp/B08F784R9W) | about 8 | Green button: 2.8 mm. Red button: 4.8 mm (switch) and 6.3 mm (light). Or solder |
| **2-pin screw terminals** | Amazon [B07P5T3D4Q](https://www.amazon.com/dp/B07P5T3D4Q) | 2–3 | Battery branch, siren |
| **Wire and heat shrink** | as on the earlier list | | |
| **UL-listed USB-A charger** | [Adafruit 501](https://www.adafruit.com/product/501), $5.95, in stock today | 1 | Or Apple 12 W, Amazon [B08J5GQTVF](https://www.amazon.com/dp/B08J5GQTVF), sold by Amazon only (fakes are common). Its UL listing isn't confirmed, so check for a UL or ETL mark on the charger itself |
| **USB-A to USB-C cable** | Amazon Basics [B085SBKFJR](https://www.amazon.com/dp/B085SBKFJR) | 1 | Slim plug; avoid braided or right-angle plugs |
| **Filament**, white PETG or PLA | as on the earlier list | about 200–250 g | White lets the alarm light show through |

**Already have from the earlier list?** These carry over:
- the MOSFETs, resistor kit, wire and heat shrink;
- the LED strip, charger, cable and M3 screws;
- the 4.8/6.3 mm spade terminals, the green button, and the Wishiot siren (for wiring tests).

## Things to set up on the bench (not optional)
- **Charging:**
  - **Charge current:** the board's charger (AXP2101) starts at 300 mA, with a 12-hour safety timer that would stop at
    about 3.6 Ah. Set it to 1 A in firmware.
  - **Input limit and timer:** set the USB input limit to 1,000 mA (the chip's default is 1,500 mA, more than the 1 A
    charger can give), and raise the timer to 20 h.
  - **Temperature check:** turn it off, because there's no sensor. So: charge at room temperature only.
  - **Time:** a full charge takes about 12–14 hours, and it may slow down when the charger gets warm in the closed case.
- **The board's power switch must be ON.** The battery connects through the 18650 holder.
- **Power budget, so the pack isn't overloaded:**
  - **Normal load:** siren, light and red light together draw about 1 A from a low (3.0 V) pack through the boost.
  - **With a shaker:** a 0.3 A shaker brings the boost to about 2.4 A. Add the amplifier (about 0.4–0.6 A) and the cell
    modem's short transmit bursts.
  - **Ratings:** the pack's leads are rated 2 A (3 A for the cells).
  - **So firmware must take turns on a low pack:** pulse the shaker and the siren in the gaps of the tone and voice.
    The bench test must measure pack current.
- **Idle drain:** the amplifier (about 2.4 mA), the U3V50F12 boost (1–5 mA) and the LoRa module's LED (1.5 mA, until R15
  is removed) draw even when silent. On a 10 Ah pack that's about 2% a day. Measure it; a later version can switch them
  off.
- **Serial port:** the chip's serial pins (UART0, GPIO 43/44) are used below. Firmware must log over USB (USB CDC) and
  never start UART0.

## Wiring plan (proposed: check against LilyGO's schematic before soldering)
All 20 free pins on the LilyGO board are used. So the "spare port for add-ons" in `docs/BEACON_RECOMMENDATION.md` can
only be the screen's I2C bus (GPIO 1/2, 3.3 V), and the case has no opening for one yet.

| What | GPIO (LilyGO) | Waveshare LoRa pin | Notes |
|---|---|---|---|
| LoRa SCK | 12 | GP10 (pin 14) | **The Waveshare's GP numbers are not ESP32 GPIO numbers: wire by function** |
| LoRa MOSI | 11 | GP11 (pin 15) | |
| LoRa MISO | 13 | GP12 (pin 16) | |
| LoRa NSS (chip select) | 10 | GP3 (pin 5) | |
| LoRa RESET | 9 | GP15 (pin 20) | |
| LoRa DIO1 | 8 | GP20 (pin 26) | |
| LoRa BUSY | 44 | GP2 (pin 4) | An input. Pin 44 has a weak pull-up at boot, which is harmless for an input |
| LoRa power | DC1 (the header's 3.3 V pin), GND | 3V3 (pin 36), GND | The LilyGO header has no pin marked 3V3: DC1 is its 3.3 V rail |
| Screen I2C SDA / SCL | 2 / 1 | | These already have pull-ups; set the board's ALDO2 rail to 3.3 V |
| Amplifier BCLK / LRC / DIN | 47 / 48 / 18 | | |
| "I'm OK" / "I need help" buttons | 17 / 16 | | To ground when pressed. They can wake the chip from sleep |
| Siren / light / shaker / red-button-light switches (MOSFET gates) | 45 / 46 / 21 / 14 | | Each with 100 Ω in series and 100 kΩ to ground. **Never put a gate on 43 or 44:** they float high at boot and would switch the siren on |
| Green button's light | 43 | | It glows briefly at boot, which is harmless |
| Silence / test | 0 (the board's BOOT button) | | **Bench only:** BOOT is shut inside the case. `docs/BEACON_RECOMMENDATION.md` needs a separate stop press that never marks the home OK. So before any home use, add a reachable silence control: a hole or plunger over BOOT, a panel button wired to GPIO0, or a defined press on an existing button. That's the founder's call (a household step). **Don't hold GPIO0 down while the board restarts:** it would start in download mode |
| **Don't connect** | 3, 35, 36, 37 | | 3 is the modem's wake line; 35–37 are memory lines |

## Measure when the parts arrive (then update the case before printing)
- **LilyGO:**
  - the height of the 18650 holder behind the board, which sets the posts (the case assumes 18.5 mm);
  - the height of parts on the front (10 mm assumed, with wires soldered straight on);
  - that the USB-C is where the maker drawing puts it: on the long edge that's on your left when the antenna end points
    down, 59.2 mm from that end, sticking out about 1.9 mm.
- **LTE antenna:** the length of its lead (126 mm on the spec sheet) and where it leaves the antenna.
- **Screen:**
  - glass thickness (the case assumes 2.5 mm);
  - the depth of the board and pins behind it;
  - how far the lit area sits off-centre in the glass. The window leaves only about 1.2 mm above and below it.
- **Siren:** the real body size, with or without its bracket.
- **Buttons:** the red button's depth with wires attached, and the green button's hole and nut size.
- **Jack:** its bushing diameter.
- **LoRa module:** its height with jumpers plugged in (the case allows 28 mm).

Change the numbers in `Parts` in `hardware/beacon-help-first/make_case.py`, rerun it, and print only when it says
"fit checks: OK".

## Cost (rough, prices unverified on Amazon)
- **Main parts for one beacon:** roughly $140–190 at single-unit prices. That covers the board, LoRa, SIM, battery,
  siren, boost, amplifier, speaker, screen and buttons, without the bed shaker. The biggest swing is the boost: $10 or
  $30.
- **Small parts and packs:** another $60–120 if you have nothing from the earlier list. Much less if you do, and the
  leftovers cover the next beacons.
- **Monthly:** about $1–1.30 per beacon for the SIM.
- **Per-beacon target:** this is above the ≈ $125–150 target in `docs/BEACON_RECOMMENDATION.md` because of single-unit
  prices and packs. Who pays the cell data is still open (#40).
