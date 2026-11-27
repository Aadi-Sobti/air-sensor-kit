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
- **Amazon stock couldn't be checked by the agent** (2026-11-27). If an Amazon item is out of stock, use the non-Amazon
  link in the Backups column or the notes. Stock shown there was read on the seller's own page on 2026-11-27.
- **Prices** marked "≈" are snapshots.

## Fastest way to get everything
- **Amazon:** the rows marked Amazon below.
- **Adafruit,** one order:
  - the 10 Ah battery (5035), which isn't on Amazon. Amazon's 10 Ah packs have no maker datasheet or safety marks;
  - the flyback diodes (755);
  - optionally the UL-listed charger (501) and the 5 × 7 cm solder boards (4786).
- **Hologram.io:** the IoT SIM card ($3).
- **Mouser:** the Mallory siren (guaranteed 105 dB minimum at 1 m, the founder's pick for decision #35 on 2026-11-27). The
  Amazon one claims only about 99.5 dB at 1 m, from an unverified listing. The bedroom wake test itself needs at least
  75 dBA at the pillow with the door closed (`docs/BEACON_RECOMMENDATION.md`).
- **Pololu,** if you pick the cheaper booster, or for the U3V50F12 if Amazon is out.
- **If Mouser is out of the Mallory siren:** Master Electronics (minimum order 5; see row 5).

## Without Amazon (stock read on each shop's own page, 2026-11-27)
If many Amazon rows are out of stock, everything except the screws has a non-Amazon source (links in the rows below):

| Shop | What | Rough subtotal before shipping |
|---|---|---|
| **Adafruit** (Brooklyn, NY) | Battery 5035, amp 3006, speaker 3351, buttons 1190 and 3487, jack 4361, diodes 755, solder boards 4786, LED strip 5864, jumpers 826, spade kit 4748, charger 501, cable 4474 | ≈ $83.55 |
| **ProtoSupplies** (Lake Stevens, WA) | Screen DSP-9 (SH1106) | ≈ $5.95 |
| **SparkFun** | 5 × IRLZ34N (instead of IRLZ44N), 0.25 A fuse, resistor kit, 3 screw terminals | ≈ $22.50 |
| **Pololu** | U3V40F12 | $9.95 |
| **Hologram** | Hyper SIM, part G3-F | $3 + $1/month |
| **LILYGO's Tindie store** | LilyGO H606 (ships from China, about 7–10 business days; duty possible) | ≈ $29.04 + shipping |
| **RobotShop** | Waveshare LoRa 915M (confirm the antenna and lead are included) | ≈ $15.74 |
| **Master Electronics** (or Mouser for one) | Mallory siren, minimum 5 | ≈ $62.95 |
| **Secure Cable Ties** | Strap roll (cut 300 mm) | ≈ $4.87 |
| Diglo (only with a shaker) | Sonic Alert SS12V, black, 3.5 mm plug | ≈ $17.99, free shipping |

- **Total:** about $238 before shipping without a shaker, or about $256 with one, for **one** beacon plus leftover
  packs. Parts you already have from the earlier list cut the Adafruit and SparkFun orders a lot.
- **Not found outside Amazon:** the M1.7, M2 and M3 × 10 self-tapping screws.
- **Not confirmed:** stock at Mouser and DigiKey (both blocked automated checks); check them in a browser. lilygo.cc's
  China warehouse has the board too ($36.41): compare its checkout total with Tindie's.

## Cheaper options (checked 2026-11-27)
Prices from each seller's own page, at an order of 5. **Decided 2026-11-27:** the U3V40F12 boost (#42) and the
ProtoSupplies screen (#43) are now the picks in the parts table below. The other rows are optional swaps.

| Part | Now | Cheaper option | Saves per beacon | Catch |
|---|---|---|---|---|
| Main board | $36.41 (lilygo.cc) | Same H606 board from [LILYGO's Tindie store](https://www.tindie.com/products/lilygo/t-sim7080g-s3-development-board/), $29.04 | $7.37 before shipping and duty | Both ship from China; compare checkout totals. Check for the AXP2101 ("PMU") chip on arrival |
| 12 V boost (#42) | $29.95 (U3V50F12) | [Pololu U3V70F12](https://www.pololu.com/product/2895), $25.95 | $4.00 | **Safer:** short-circuit protection that restarts on its own, under 1 mA idle. **Not a drop-in:** 40.6 × 15.2 mm with different holes, so the back plate changes and is reprinted. Pololu marks it "Rationed" |
| 12 V boost (#42) | $29.95 | [Pololu U3V40F12](https://www.pololu.com/product/4016), $9.15 each for 5 | $20.80 | No short-circuit or reverse-battery protection; the shaker fuse is required and limits the shaker to about 0.2 A; solders flat on the driver board |
| Screen (#43) | $19.95 (Adafruit 938) | [ProtoSupplies DSP-9](https://protosupplies.com/product/oled-1-3-128x64-i2c-blue-display/), $5.95 (SH1106) | $14.00 | Blue only. Its drawing matches the case posts (holes 30.40 × 28.50 mm, board 35.40 × 33.50 mm). Firmware drives the SH1106 chip |
| Resistors | $1.99 (SparkFun kit ÷ 5) | [Adafruit 4293](https://www.adafruit.com/product/4293) (100 Ω) + [2787](https://www.adafruit.com/product/2787) (100 kΩ), 25 each | $1.65 | Buy 2 of each for 7 beacons ($3.40). Only 9 packs of 100 Ω were left |
| Button connectors | $1.50 (spade kit ÷ 5) | Solder wires to the button tabs | $1.50 | Find the red light's + and − first; keep iron time short |
| Charger + cable | $10.90 (Adafruit 501 + 4474) | [Raspberry Pi 15 W USB-C supply](https://www.adafruit.com/product/4298), $8.74, cable built in | $2.16 | On Raspberry Pi's compliance list, but charging the LilyGO from a USB-C-only supply isn't tested: try one on a bench unit first |

**Checked and kept:**
- **The 10 Ah battery:** the cheapest protected pack of this size that fits.
- **The Mallory siren (#35):** nothing else guarantees 105 dB at 1 m and fits.
- **The Waveshare LoRa radio:** bare modules save at most about $3 once you add an antenna and cable, and need fine soldering.
- **The amplifier, speaker, buttons and jack.**

**Totals per beacon** (order of 5; without shipping, duty, screws, wire or a shaker):
- **Today's list:** about $201.
- **With the board, U3V70F12, screen, resistor and button-wire swaps:** about $173.
- **Also with the U3V40F12, the Raspberry Pi charger and cheaper filament:** about $152.
- **Against the target:** all are still above the ≈ $125–150 estimate in `docs/BEACON_RECOMMENDATION.md`.

**SIM plans** (decide after the bench measures data use, #40): Hologram $3 + about $1.03 a month at 1 MB; Soracom
plan-US $5 + $0.60 a month (carrier and 1.8 V support not stated); 1NCE about $17.31 once for 10 years and 500 MB
(the nonprofit signs up as a business).

## Main parts
| # | Part | Buy | Backups | Qty per beacon | Fits the case? | Check before buying / notes |
|---|---|---|---|---|---|---|
| 1 | **LilyGO T-SIM7080G-S3**, the **"with PMU"** version (ESP32-S3 + SIM7080G cell modem + AXP2101 power chip) | Amazon [B0BW3NN54L](https://www.amazon.com/dp/B0BW3NN54L): pick the **with PMU** option | LILYGO's own [Tindie store](https://www.tindie.com/products/lilygo/t-sim7080g-s3-development-board/), "T-SIM7080G-S3 [H606]", $29.04, showed 100 in stock on 2026-11-27 (seen once), ships from China (check US shipping and import duty at checkout); [lilygo.cc](https://lilygo.cc/products/t-sim7080-s3), variant "T-SIM7080G S3 [H606]", $36.41, available from its China warehouse on 2026-11-27 (the page's "Sold out" text is a button label; the US and Germany warehouses are out), ships from China; compare both checkout totals; [Abra Electronics](https://abra-electronics.com/robotics-embedded-electronics/lilygo-ttgo/t-sim7080g-s3.html), $79.95, in stock today, but the page doesn't say which version: ask Abra in writing to confirm the H606 board with the AXP2101 first | 1 | **Yes:** 110.5 × 32.9 mm on 4 screw posts (holes 27.7 × 105.6 mm apart), LTE antenna end up, USB-C toward the right side | **The Amazon title says "Standard",** which is LilyGO's name for the *without*-PMU board (different pins, slower charging). Check that the board you get has the AXP2101 power chip. **Not** B0G3WNTH95. **The box also has:** an LTE antenna (use it); a GPS antenna (**leave it out**, and the firmware must never turn on GPS or cell-based location: the beacon must never produce coordinates); and a solar cable (LilyGO's box list calls it "Power cable"; it is **not** a battery lead). **Never plug the battery into the small JST socket marked SOLAR:** the pack's plug fits it, and a reversed pack would short. **Battery wiring:** before the board goes on its posts, solder the battery leads to the 18650 holder's tabs, and leave the holder empty (never fit an 18650 cell as well). **The holder is for one 18650 lithium cell, not AA:** never put AA batteries or any loose battery in it. + is the tab at the ESP32 end (marked "+"), − the tab at the LTE-antenna end; check them with a meter. **The tabs stay live with the switch OFF:** they connect before it. **The − tab isn't board ground:** it reaches GND through a small transistor (Q1) that blocks a reversed battery, so the boost and amplifier return straight to the − tab, not to board GND (decision #45), and their heavy current skips Q1. Insert the SIM before mounting: its slot faces the LoRa module afterwards |
| 2 | **Waveshare Pico-LoRa-SX1262-915M** (LoRa radio, 915 MHz) | Amazon [B09W5P5HGQ](https://www.amazon.com/dp/B09W5P5HGQ) | TOP1 [B0B1M7WNGQ](https://www.amazon.com/dp/B0B1M7WNGQ); Coolwell [B09VGGG9BG](https://www.amazon.com/dp/B09VGGG9BG) (pick 915 MHz); Waveshare direct $14.99 (stock not shown; likely ships from China); [RobotShop](https://www.robotshop.com/products/sx1262-lora-node-module-rpi-pico-lorawan-frequency-band-915m-902930mhz-1), $15.74, in stock today; [Abra Electronics](https://abra-electronics.com/robotics-embedded-electronics/raspberry-pi-pico/waveshare-21667-sx1262-lora-node-module-for-raspberry-pi-pico-lorawan-choice-of-frequency-band.html) (WAVE-21667), $27.45, in stock today. Neither store lists the antenna or IPEX-to-SMA lead, and Abra's page also says "Choice Of Frequency Band": confirm 915M and the antenna before ordering | 1 | **Yes:** 21 × 52 mm, in its pocket on the back plate (hold with foam tape) | **Band:** must say **915M**, not 868M or 433M. **In the box:** a 2 dBi antenna and an IPEX-to-SMA lead; the SMA goes through the hole in the top of the case. **Wiring:** use only 3V3, GND and 7 signal pins (see the wiring plan), and **don't** use the small LiPo in the box. **Firmware:** the module wires DIO2 to its RF switch and DIO3 to its oscillator, so firmware must enable both or the radio won't work. **Power:** its power LED draws about 1.5 mA all the time; remove R15 (0 Ω) before battery tests |
| 3 | **IoT SIM** for LTE-M | [Hologram Hyper SIM](https://www.hologram.io/pricing/), $3 + $1/month + $0.03 per MB | Amazon: Soracom plan01s [B01M30ZYR5](https://www.amazon.com/dp/B01M30ZYR5) ($5; reported to work on AT&T LTE-M, not Verizon; card voltage not confirmed) | 1 | Goes in the board's slot | The board needs a **1.8 V-capable** SIM; Hologram's supports 1.62–5.5 V. Insert it **before** powering the modem. Expect AT&T coverage on the bench. **Order** the standard triple-cut Hyper card (part G3-F); the free pilot-SIM promo may send a different card. Store stock not confirmed today |
| 4 | **Battery: Adafruit 5035**, 10,050 mAh, protected | [adafruit.com/product/5035](https://www.adafruit.com/product/5035), $29.95, **in stock today** | None on Amazon recommended | 1 | **Yes:** cradle sized to the maker's max 69 × 56.5 × 19 mm, with a strap | **Protection:** over-charge, over-discharge and short protection built in. **Limits:** its leads are rated **2 A**, which limits what can run at once (see "Power budget"). **Charging:** no temperature sensor, so charge it indoors at room temperature (0–45 °C) |
| 5 | **12 V siren**, 47 × 39 × 23.5 mm body | **The pick (#35), for loudness and wake tests:** Mallory Sonalert **PS-723BQ**, Mouser 539-PS723BQ, $12.51, in stock today (up to 20% tariff), **105 dB minimum at 1 m** | **For wiring tests only:** Wishiot 2-pack, Amazon [B0BJDL3G7T](https://www.amazon.com/dp/B0BJDL3G7T); **the Mallory, if Mouser is out:** [Master Electronics](https://www.masterelectronics.com/en/productdetail/mallory-sonalert/ps723bq-39589346.html), $12.59 each but a **minimum of 5** ($62.95), 250 in stock today; the 4 spares can be the wiring-test sirens. It's marked "no longer manufactured", so buy spares now | 1 | **Yes:** both share the body. The holder's end walls are 48.2 mm apart; a front stop keeps it under the grille, and a notch lets the Mallory's leads out | **Wishiot:** claims 110 dB **at 30 cm**, which is only about 99.5 dB at 1 m. **Decided 2026-11-27 (#35): the Mallory.** The Same Sky CPS-7560-110L450 that #35 first recommended is a 75 mm round siren, 54.5 mm deep, which **this case can't hold**; the Mallory costs about $3 more |
| 6 | **12 V boost** | **The pick (#42, 2026-11-27):** Pololu [U3V40F12](https://www.pololu.com/product/4016), $9.95 ($9.15 each for 5): 15 × 15 mm, solder it **flat** onto the driver board (upright it's too tall for the case); the boost posts stay empty | **For a shaker over about 0.2 A:** Pololu U3V50F12, Amazon [B0GNRSTGF4](https://www.amazon.com/dp/B0GNRSTGF4) (seller should be Pololu; $29.95 at [Pololu 2568](https://www.pololu.com/product/2568), in stock today), on the 2 boost posts; or the [U3V70F12](https://www.pololu.com/product/2895) ($25.95, needs a back-plate change) | 1 | **Yes:** flat on the driver board. The U3V50F12 is 48 × 15 × 10.5 mm, on 2 posts (M2 screws) | **Capacity:** each can run the siren, the light and the red button's light (about 0.2 A at 12 V), plus a bed shaker of up to about 0.5 A on the U3V50F12. The U3V40F12 gives about 0.8 A at 12 V from a low pack, and **its required fuse limits the shaker to about 0.2 A running:** after the siren and light, about 0.6 A is left; the fuse must trip below that, these fuses trip at about twice their hold current, and the hold current is 1.5 × the shaker's. Measure the shaker; for a bigger one, use the U3V50F12. **The battery is the limit,** not the boost (see "Power budget"). **Measure 12 V with a meter before connecting anything.** The U3V50F12 needs at least 2.9 V in. The U3V40F12 has no short-circuit protection, so the shaker fuse is required |
| 7 | **I2S amplifier**, Adafruit MAX98357A | Amazon [B01K5GCFA6](https://www.amazon.com/dp/B01K5GCFA6) (brand Adafruit) | [Adafruit 3006](https://www.adafruit.com/product/3006), $5.95, in stock today | 1 | Solder it onto the driver board | Many generic "MAX98357" packs look alike: get the Adafruit one |
| 8 | **Speaker**, enclosed, 3 W 4 Ω, about 70 × 31 × 16 mm | CQRobot pair, Amazon [B0822Z4LPH](https://www.amazon.com/dp/B0822Z4LPH) (2 W rated, 3 W max) | [Adafruit 3351](https://www.adafruit.com/product/3351), $3.95, in stock today (3 W) | 1 | **Yes:** frame behind the front grille (a dab of hot glue holds it) | **The low 520 Hz wake-up tone will probably be too quiet on this speaker.** The fact-check estimates about 74–77 dBA total at 1 m, mostly from the square wave's higher harmonics. The 520 Hz part itself is only about 68–71 dB, and 1–2 dB less on a low pack. The bedroom test decides; a bigger speaker or two speakers is the fallback (not priced yet) |
| 9 | **1.3-inch OLED screen**, 128 × 64, I2C | **The pick (#43, 2026-11-27):** [ProtoSupplies DSP-9](https://protosupplies.com/product/oled-1-3-128x64-i2c-blue-display/) (SH1106, blue only), $5.95, in stock today (Lake Stevens, WA) | Hosyond 5-pack (SH1106), Amazon [B0C3L7N917](https://www.amazon.com/dp/B0C3L7N917); [Adafruit 938](https://www.adafruit.com/product/938) (SSD1306), $19.95, in stock today | 1 | **Yes:** 4 posts fit both boards' hole patterns (30.4–30.5 × 28–28.5 mm) | **Screws:** M2 × 4–5 mm self-tapping into the posts (M2.5 is too tight for Adafruit's 2.5 mm holes). The ProtoSupplies board's holes are 3 mm across, so use M2 pan-head screws (head about 3.8 mm) or add a small washer. **Firmware:** the two brands use different chips (SH1106 vs SSD1306) |
| 10 | **Red 60 mm "I need help" button** with a 12 V light | BQLZR, Amazon [B00Z5PHRJM](https://www.amazon.com/dp/B00Z5PHRJM) (red) | [Adafruit 1190](https://www.adafruit.com/product/1190), $5.95, in stock today | 1 | **Yes:** 26 mm hole; about 60 mm of room behind the panel | **Buying:** check the quantity and colour selected. **Fitting:** cut off the two small plastic alignment posts on the back of the bezel so it sits flat. **Light:** it runs from 12 V through a transistor. **Its polarity isn't marked:** find it at 3–5 V before connecting 12 V, because backwards at 12 V can destroy it |
| 11 | **Green 30 mm "I'm OK" button** with a 5 V light | EG STARTS 5-pack, Amazon [B01N11BDX9](https://www.amazon.com/dp/B01N11BDX9) (includes green) | [Adafruit 3487](https://www.adafruit.com/product/3487), $2.50, in stock today: documented to light dimly at 3.3 V | 1 | **Yes:** 30 mm hole | **Test its light at 3.3 V when it arrives.** Some sellers' listings say a 28 mm hole: test-fit. Its 4 tabs are 2.8 mm |
| 12 | **Bed shaker** (only for households that need it) | Sonic Alert Super Bed Shaker 12 V, Amazon [B005VFZR1G](https://www.amazon.com/dp/B005VFZR1G) | [Diglo SA-SS12V](https://www.diglo.com/sonic-alert-super-shaker-12v-black-bed-shaker;sku=SA-SS12V;s=516;p=SA-SS12V) (black, maker part SS12V-AUX), $17.99 with free US ground shipping, in stock today: its photo shows a 3.5 mm audio plug. White version [B005GGQX7C](https://www.amazon.com/dp/B005GGQX7C): **probably the wrong plug** (Diglo's photo of the white SS12VW shows a DC barrel plug) | 0–1 | Plugs into the jack on the back | **Plug:** retailers disagree on 3.5 vs 2.5 mm, and polarity isn't published. Only the black SS12V / SS12V-AUX has a 3.5 mm audio plug; the white SS12VW and the Sonic Bomb SS12VB have a DC barrel plug. All are labelled "Model #SS 12V", so check the plug, not the label. It has built-in electronics, so find + with a meter before wiring. **Current:** not published; measure it. **Thermal cut-out:** it stops after about 10 minutes of continuous running, so firmware should pulse it |
| 13 | **3.5 mm mono panel jack** for the shaker | CESS 2-pack, Amazon [B017CBO3C0](https://www.amazon.com/dp/B017CBO3C0) | [Adafruit 4361](https://www.adafruit.com/product/4361), $0.95, in stock today (comes with one hex nut) | 1 | **Yes:** 6.4 mm hole; the back plate is thinned to 2 mm there so the nut grips | **Size:** measure the bushing before printing (M6 is typical). **Live bushing:** switched on the low side as planned, the jack's metal bushing is **live, not ground**. Making it ground needs a high-side switch (a P-channel MOSFET and a driver transistor, not on this list). That's a wiring choice for the founder. **Label** the jack "Bed shaker only": headphones fit it |

## Small parts
| Part | Buy | Qty | Notes |
|---|---|---|---|
| **Logic-level MOSFETs**, IRLZ44N | Amazon [B0BW8K31BF](https://www.amazon.com/dp/B0BW8K31BF) (10-pack) | 4 | Siren, light, bed shaker, red button's light. Must say **IRL**, not IRF. Test each: 3.3 V on the gate should switch 12 V on. **Non-Amazon:** [SparkFun COM-24144](https://www.sparkfun.com/products/24144), $1.50, in stock today, is the similar **IRLZ34N** (also logic-level, same TO-220 package; buy 5). No in-stock non-Amazon IRLZ44N was confirmed |
| **Flyback diode**, 1N4001 | [Adafruit 755](https://www.adafruit.com/product/755), $1.50 for 10, in stock today | 1 | Across the shaker jack (it's a motor), cathode to +12 V |
| **Resettable fuse** for the shaker output, through-hole, at least 16 V | [SparkFun COM-08357](https://www.sparkfun.com/resettable-fuse-ptc.html), 0.25 A hold / 0.5 A trip, $1.75, in stock today: only for a shaker that runs at about 0.17 A or less. For a bigger shaker: Bourns MF-R050 (0.5 A hold, $0.47) or MF-R075 (0.75 A hold, $0.47; lay it flat, it's 16 mm tall) at DigiKey, stock not confirmed | 1 | **Required:** the U3V40F12 has no short-circuit protection. Pick the hold current after measuring the shaker (about 1.5 × its running current), so it trips well below what the boost can give (about 0.8 A at 12 V from a low pack, minus the siren and light). A 1 A-hold part trips at about 2 A and would never protect anything |
| **Solder board**, 5 × 7 cm | ELEGOO kit, Amazon [B072Z7Y19F](https://www.amazon.com/dp/B072Z7Y19F) (has 5 × 7 boards) | 1 | Or [Adafruit 4786](https://www.adafruit.com/product/4786), $2.95 for 3, in stock today. Sits on ledges in its pocket, held with foam tape |
| **Resistor kit** | Amazon [B072BL2VX1](https://www.amazon.com/dp/B072BL2VX1) | 1 kit | 100 Ω gate resistors and 100 kΩ gate pull-downs. Or [SparkFun COM-10969](https://www.sparkfun.com/resistor-kit-1-4w-500-total.html), $9.95, in stock today |
| **12 V white LED strip** | HitLights, Amazon [B005ST2I9O](https://www.amazon.com/dp/B005ST2I9O) | 50 mm | **Check it's single-colour white, 12 V:** one search hinted this ASIN may be another strip. Or [Adafruit 5864](https://www.adafruit.com/product/5864) (1 m, $7.50, in stock today; cut a 35 mm piece) |
| **Jumper wires**, male-to-female | ELEGOO 120-piece kit, Amazon [B01EV70C78](https://www.amazon.com/dp/B01EV70C78) | 9 | For the LoRa module's header. On the LilyGO, solder wires straight to the header holes; don't fit its header pins, which leaves room for the wires. Or [Adafruit 826](https://www.adafruit.com/product/826) (40 wires, $3.95, in stock today) |
| **Screws for the board, screen and boost** | a small steel self-tapping assortment with M1.7 (or M1.6) and M2 | 4 + 4 + 2 | 4 × M1.7 × 5–6 mm for the LilyGO (its 2.0 mm holes are too tight for M2), 4 × M2 × 4–5 mm for the screen, and 2 × M2 × 5–6 mm for the boost. Nylon screws won't cut threads in plastic |
| **Case screws**, M3 × 10 self-tapping | Amazon [B01M0P3EUK](https://www.amazon.com/dp/B01M0P3EUK) | 4 | |
| **Battery strap**, hook-and-loop, 12 mm × 300 mm | Amazon [B0FQV8SRVL](https://www.amazon.com/dp/B0FQV8SRVL) | 1 | Goes through the slots beside the cradle, around the lower part of the pack. Or [Secure Cable Ties VW-38010-BK](https://www.securecableties.com/38-inch-continuous-black-hook-and-loop-wrap-10-yards), a 9.5 mm (3/8 in) roll, $4.87, in stock today: cut a 300 mm piece and check it sticks to itself |
| **Double-sided foam tape** | any | a strip | Holds the LoRa module and the driver board on their ledges |
| **Female spade terminals** | Twidec 2.8 + 4.8 mm, Amazon [B0H1KLDSV1](https://www.amazon.com/dp/B0H1KLDSV1), and 4.8 + 6.3 mm, Amazon [B08F784R9W](https://www.amazon.com/dp/B08F784R9W) | about 8 | Green button: 2.8 mm. Red button: 4.8 mm (switch) and 6.3 mm (light). Or [Adafruit 4748](https://www.adafruit.com/product/4748), all three sizes, $7.50, in stock today. Or solder |
| **2-pin screw terminals** | Amazon [B07P5T3D4Q](https://www.amazon.com/dp/B07P5T3D4Q) | 2–3 | Battery branch, siren. Or [SparkFun PRT-08432](https://www.sparkfun.com/screw-terminals-5mm-pitch-2-pin.html), 5 mm pitch, $1.10 each, in stock today (not Adafruit 724: its 3.5 mm pitch doesn't match the board's holes) |
| **Wire and heat shrink** | as on the earlier list | | |
| **UL-listed USB-A charger** | [Adafruit 501](https://www.adafruit.com/product/501), $5.95, in stock today | 1 | Or Apple 12 W, Amazon [B08J5GQTVF](https://www.amazon.com/dp/B08J5GQTVF), sold by Amazon only (fakes are common). Its UL listing isn't confirmed, so check for a UL or ETL mark on the charger itself |
| **USB-A to USB-C cable** | Amazon Basics [B085SBKFJR](https://www.amazon.com/dp/B085SBKFJR) | 1 | Slim plug; avoid braided or right-angle plugs. Or [Adafruit 4474](https://www.adafruit.com/product/4474), $4.95, in stock today (straight, not braided; measure its plug against the case's 13 × 10 mm) |
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
- **The board's power switch must be ON.** The battery connects through the 18650 holder. The switch sits between the
  holder and the power chip, so the holder tabs, the boost and the amplifier stay live when it's OFF.
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
  - the height of the 18650 holder behind the board, which sets the posts (the case assumes 18.5 mm; LilyGO's photos
    suggest about 15 mm empty);
  - the height of parts on the front (10 mm assumed, with wires soldered straight on);
  - that the USB-C is where the maker drawing puts it: on the long edge that's on your left when the antenna end points
    down, 59.2 mm from that end, sticking out about 1.9 mm.
- **LTE antenna:** the length of its lead (126 mm on the spec sheet) and where it leaves the antenna.
- **Screen:**
  - glass thickness (the case assumes 2.5 mm);
  - the depth of the board and pins behind it;
  - how far the lit area sits off-centre in the glass. The window leaves only about 1.2 mm above and below it.
- **Siren:** the real body size, with or without its bracket.
- **Speaker:** its length and depth. The frame allows 70.2 × 16.6 mm; the maker's tolerance allows up to 70.3 × 17.0 mm.
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
