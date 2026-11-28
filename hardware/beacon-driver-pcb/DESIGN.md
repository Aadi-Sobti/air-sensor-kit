# Help-First beacon driver board, spin 1: design package

Written 2026-11-27. **Status: drawn, routed and checked in KiCad 10.0.8; not ordered, not built.** `build.py` turns `design.json` into the schematic and board; KiCad's ERC (electrical rules) finds 0 problems and its DRC (design rules, with schematic parity) finds 0 errors, 0 warnings and 0 unconnected pads. Every symbol, footprint and pad number was checked against the KiCad 10.0.8 libraries. Ordering, accounts and payment are your steps.

## What this board is

It replaces the 5 × 7 cm hand-soldered "driver board" in the same 70 × 50 mm pocket. The case gained end stops and taller rails for the pocket (so plugging cables in can't push the board sideways, even on 1 mm foam tape) and the SILENCE button's hole on top (#48); both suit the perfboard too. It does five jobs:
- takes in the 10 Ah battery and protects everything if the battery is plugged in backwards;
- feeds the LilyGO, the 12 V booster and the amplifier from that protected battery;
- switches the siren, LED strip, red-button light and bed shaker on and off;
- passes the buttons and the green LED through to the LilyGO;
- carries the audio link to the amplifier.

JLCPCB makes the board and fits all the small parts on one side. You then solder on the Pololu booster, the Adafruit amplifier and 4 wires (plus the 4 connectors if you choose order option B). The 2 bench units stay on perfboard with **the same circuit**, so every block below can also be built by hand.

**Words used once and then freely:**
- **PCB:** a factory-made circuit board.
- **Spin:** one round of design, order and test.
- **MOSFET:** an electronic on/off switch. An N-FET switches the ground side of a load (**low-side**). A P-FET switches the + side (**high-side**).
- **PTC:** a resettable fuse. It heats up and cuts the current on a fault, then resets when cool.
- **TVS:** a diode that soaks up static zaps and voltage spikes.
- **Flyback diode:** catches the kick a motor or siren gives when it is switched off.
- **Shunt:** a tiny resistor used to measure current. Here 10 mV = 1 A.
- **I2S:** the 3-wire digital audio link to the amplifier.
- **Strapping pin:** a chip pin the ESP32 reads at every reset to decide how to start.
- **PMIC:** the LilyGO's power chip (AXP2101).
- **Brown-out:** a battery dip deep enough to reset or switch off the electronics.
- **IDC ribbon:** flat cable crimped into a plug in a vise.
- **Basic / Extended:** JLCPCB part classes. Each Extended part type adds a $3.07 fee.
- **Kelvin sense:** measuring a shunt from its inner pad edges.

## What changed after the two reviews

| # | Fix | Why |
|---|---|---|
| 1 | **R15 10 kΩ from the amp's SD pin to the battery rail.** The amp now runs in left-channel mode. | On one battery cell the old setup sat at or below the chip's *maximum* shutdown threshold (0.355 V), so some amps could stay silent. Now SD ≈ 0.9 × battery ≈ 2.7 V at 3.0 V, well above the 1.5 V needed. |
| 2 | **R21–R23: 100 kΩ pull-downs on the 3 I2S lines** at the amp. | Floating audio lines during a reset or sleep could make the amp push about 1 A of DC into the speaker. |
| 3 | **One shaker mode only: high-side.** The JP1–JP3 jumpers are gone. **Q16 is now an AON7421** (the same part as Q11), with **R12 = 4.7 kΩ**. | A single wrongly fitted jumper could latch the shaker on. The old AO3401A gate drive collapsed with the 12 V rail during a short, so the switch would run half-on and overheat. The AON7421 stays fully on down to about −2 V of gate drive. |
| 4 | **Pin change, decided (#46):** siren GPIO45→21, shaker GPIO21→18, amp DIN GPIO18→45. | GPIO45 is a strapping pin. If a reset hits while the siren gate is still charged, the flash can get the wrong voltage and the beacon won't boot until it is power-cycled. The shaker gets GPIO18, which has a 60 µs blip at power-up: a motor ignores that, a siren might chirp. |
| 5 | **Ribbon reordered** so it splits once: conductors 1–7 go to LilyGO row P1, 8–14 to row P2, each in hole order. | The old order alternated between rows 5 times, which invites off-by-one solder mistakes. One of those mistakes put the siren gate on GPIO0's pull-up, so the siren sounded at boot. |
| 6 | **Button series resistors 4.7 kΩ (was 1 kΩ), LED resistor 100 Ω (was 47 Ω), silence line 1 kΩ + 10 nF. J5 reordered** so no button line sits next to GND. | A battery plug, a slipped spade or a static zap on a harness line now can't hurt a GPIO. A solder bridge can't fake a permanent "help" press. |
| 7 | **J2 (LilyGO battery wires) and J6 (shaker wires) separated**: different pad sizes, opposite corners, big labels. | Identical side-by-side pads could be swapped, which would put switched 12 V on the LilyGO battery input. |
| 8 | **C5 = 10 µF ceramic** (was a 47–100 µF electrolytic); C6 removed. | Smaller energy dump into a shorted jack, and one fewer part type. The Pololu has its own output capacitors. |
| 9 | **F2 = 30 V-rated PTC** (BSMD1206-050-30V). | The first choice was rated only 13.2 V on a 12.48 V rail. |
| 10 | **13 mm height limit in the board's top 17 mm** (where the siren holder sits). Harness connectors moved out of that strip. | The holder's shelf, not the siren body, sets the limit. Foam tape lifts the board about 1 mm. |
| 11 | **Claims removed:** "a PTC keeps the beacon alive on battery" and "the LilyGO can report a tripped fuse". | Neither is true in spin 1. The bench tests below decide what is needed. |
| 13 | **J1 polarity corrected** (after a second sourcing check and a 3-agent investigation with a judge): pad 1 = pack +, pad 2 = GND. | Adafruit's and SparkFun's Eagle libraries number the two JST-PH pins mirror-image to JST and KiCad, so "pin 1 = GND" copied from them reversed the battery on KiCad's footprint. Q11 would have blocked it (no damage), but the beacon wouldn't have powered up. |
| 14 | **Drill files on the same origin as the Gerbers**, and `build.py` now checks every plated hole lands on a pad or via. | The first export put every hole 100 mm right of and 150 mm below its pad. |
| 15 | **TP1/TP2 read R1 from its pads' inner edges** on their own 0.25 mm traces; the battery path is 3 mm wide, the VBAT_PROT trunk 2.5 mm, and the big ground pads get 4 vias each. | The test points sat on the wide power copper, so the shunt reading included the joints. |
| 16 | **Silkscreen at 1.0 mm** (JLCPCB's minimum), with test-pad names, BATTERY ONLY + / −, and pin legends for J3, J4 and J5. | Builders plug cables by these labels. TP4, TP6 and TP10 have no room: they're named on `beacon-driver-assembly.pdf`. |
| 12 | **Bench gate before ordering** (list below), plus watchdog, alarm-resume and current-limit firmware rules. | A shorted shaker lead may trip the battery's own protection before any fuse acts, and an alarm can sag the battery enough to switch the LilyGO off. |

**Where the reviewers disagreed, and what I chose:**
- **Button connector family.** One reviewer wanted J5 moved off JST-PH; the other wanted separation and labels. I kept PH: it latches, is keyed, and you can buy pre-crimped leads. Instead every J5 line now survives a battery plug (4.7 kΩ / 100 Ω / 1 kΩ in series), J5 sits about 50 mm from the battery socket, and both get big labels. A 2.54 mm box header probably wouldn't block a PH-2 plug either (my estimate; test-fit).
- **Shaker mode.** High-side, with the stronger P-FET, so you get the safety benefit without the short-circuit weakness. You still confirm it, and the perfboard must match.
- **Current shunt R1.** Fitted on spin 1, because it is how the bench measures pack current. Use a 0 Ω part in later spins. It adds only 10 mΩ to a 75–130 mΩ battery path.
- **Copper weight.** 1 oz is enough. 2 oz isn't needed: the board's copper adds only a few mΩ.
- **Fuse in the battery lead.** None fitted. A 4–5 A fuse wouldn't clear a 1–3 Ω fault anyway. This is recorded as an accepted risk, plus an assembly check that the J2 lead isn't pinched.
- **Siren pin.** The reviewer suggested a straight swap of siren and DIN. I went one step further and put the shaker (not the siren) on GPIO18 because of its power-up blip.

## The circuit, block by block

### 1. Battery in and reverse-battery protection (J1, R1, Q11, R2, C1, C2, J2)
- **Path:** J1 (battery socket: pin 1 = battery +, pin 2 = GND; fix 13) → R1 10 mΩ shunt → Q11 AON7421 P-FET → **VBAT_PROT** (the protected battery rail). Q11's gate goes to GND through R2 10 kΩ.
- **What it does:**
  - With the battery the right way round, Q11 turns fully on (≤ 9 mΩ at −2.5 V of gate drive).
  - Plugged in backwards, Q11 stays off and nothing downstream sees a negative voltage.
  - Once on, Q11 conducts both ways, so the LilyGO can still charge the pack at up to 1 A back through it.
- **Losses:** ≈ 0.1 W at 3 A, ≤ 0.3 W at a 4.9 A peak (estimate). Drop ≤ 62 mV at 4.9 A.
- **J2 (soldered wires, not a connector):** VBAT_PROT goes to the LilyGO 18650 holder's + tab, and GND to its − tab (decision #45).
- **Battery reversed while USB is plugged in:** the LilyGO's charger only trickles (10 mA). Q11 holds the rail near 1 V and wastes about 50 mW. Nothing is damaged, but **the alarm can't run** (the booster needs 2.7 V to start). Firmware must treat this as "alarm not working".
- **PCB ground is the pack's −.**

### 2. Ground and signal ground (R20)
- The bottom copper layer is one solid ground.
- Three ribbon conductors (J3 pins 1, 8, 14) form **SGND**, which is soldered to LilyGO GND holes P1-15, P2-2 and P2-15 and joins GND through R20 (0 Ω).
- **Why:** this gives the audio lines a return path next to them. The LilyGO's own reverse-battery transistor still blocks a reversed J2 lead.
- The ribbon grounds carry about 0.2–0.5 A each of the LilyGO's battery current (estimate). That is fine for 28 AWG.

### 3. 12 V booster (U1 Pololu U3V40F12, C1, C2, C5, F2, C7)
- U1 sits flat on its straight 6-pin header, components up, about 8 mm tall. Pins left to right: OUT, GND, GND, VIN, VIN, EN.
- **EN is left unconnected:** the module's own 30 kΩ pull-up keeps it on, so the siren never waits on firmware. EN only goes to TP14.
- **Capacitors:**
  - C1 100 µF electrolytic and C2 10 µF at VIN.
  - C5 10 µF at OUT.
- **F2 (0.5 A hold, 1.0 A trip, 30 V)** feeds the internal loads (+12V_INT): siren, LED strip and red-button light. C7 1 µF sits at the harness.
- **Internal load ≈ 0.2 A:** siren 0.15 A + strip 33 mA + red light 20 mA.

### 4. Low-side switches: siren, LED strip, red light (Q12, Q13, Q15) and the shaker driver Q14
- All four are AO3400A.
- Each has 100 Ω in series from the GPIO and a 100 kΩ pull-down right at the MOSFET gate. Every output is therefore off on any reset, in deep sleep, and with the ribbon unplugged.
- D2 (SS14) clamps the siren's switch-off kick.

### 5. Shaker output (Q14, Q16, R11, R12, F1, D1, TVS1, J6)
- **How it switches:** GPIO high → Q14 on → Q16's gate is pulled to 8.5 V below its source → the shaker is on.
- **Gate drive:** R11 10 kΩ holds Q16 off. At the booster's 16.5 V over-voltage limit the gate sees −11.2 V, still inside its ±12 V rating.
- **Output path:** F1 (0.25 A hold, 0.5 A trip, 33 V) → jack tip.
- **Protection:** TVS1 SMAJ13A (clamps 21.5 V at 18.6 A) and D1 SS14 sit across the jack.
- **Jack wiring:** the sleeve and metal bushing are GND, so the jack is dead whenever the shaker is off.
- **Needs a tip-positive shaker. Measure your Sonic Alert's plug first.**
- **Limit:** with this PTC the shaker may draw at most about 0.15 A running in a 40 °C case (1.5 × rule). A bigger shaker needs a bigger PTC and the U3V50F12 (#42).

### 6. Amplifier (U2 Adafruit 3006 / MAX98357A)
- **Supply:** from VBAT_PROT, with C3 10 µF and C4 100 nF.
- **Gain:** R13 100 kΩ to GND sets 15 dB, the loudest setting. Set the volume in firmware.
- **Mode:** R15 10 kΩ to the battery rail selects left-channel mode.
- **Idle:** stopping the audio clock puts the amp in standby (340 µA typical).
- **Speaker:** it stays on the breakout's own screw terminal. Screw the speaker wires in before soldering U2 down.
- **Height:** about 11–12.6 mm (estimate; measure).

### 7. Buttons, green LED, silence (J5, R16–R19, R24, C8–C11)
- **Buttons:**
  - Each button switches to GND at the panel.
  - 10 nF to GND at the connector, then 4.7 kΩ in series to the GPIO, which uses its internal pull-up.
  - Pressed level is 0.31 V, comfortably below the 0.82 V threshold.
- **Green LED:** GPIO43 → 100 Ω → LED. Check the brightness on the bench; 47 Ω is the fallback.
- **Silence button (decided #48):** an Adafruit 1502 16 mm yellow push button on TOP of the case, like a snooze
  button, with a "SILENCE" sticker in front of it.
  - The button pulls SIL_J low.
  - C10 100 nF passes a short pulse through R24 1 kΩ to GPIO0. R19 1 MΩ bleeds C10, and C11 10 nF soaks up static zaps.
  - The pulse stays below the logic threshold for about 1.3 ms and is back high within about 6.4 ms (my calculation; the earlier "6 ms low" figure was wrong).
  - Holding the button through a reset still boots normally.

### 8. Signal cable J3 (2 × 7 IDC ribbon to the LilyGO header holes)

| J3 pin = ribbon wire | Net | LilyGO hole (recommended pin plan) |
|---|---|---|
| 1 | SGND | P1-15 GND |
| 2 | SIREN_IN | P1-14 (GPIO21) |
| 3 | I2S_BCLK | P1-13 (GPIO47) |
| 4 | I2S_LRC | P1-12 (GPIO48) |
| 5 | I2S_DIN | P1-11 (GPIO45) |
| 6 | SIL_IN | P1-10 (GPIO0, the silence button) |
| 7 | LED_OK | P1-5 (GPIO43, TXD) |
| 8 | SGND | P2-2 GND |
| 9 | REDLED_IN | P2-3 (GPIO14) |
| 10 | LIGHT_IN | P2-9 (GPIO46) |
| 11 | SHAKER_IN | P2-12 (GPIO18) |
| 12 | BTN_OK | P2-13 (GPIO17) |
| 13 | BTN_HELP | P2-14 (GPIO16) |
| 14 | SGND | P2-15 GND |

- **Splitting the ribbon:** peel it once. Wires 1–7 go to row P1 and wires 8–14 to row P2, each half in hole order with no crossings.
- **Never connect:** P1-1/2 and P2-16 (3.3 V), P2-1 (DCDC5), P1-16 (VSYS).
- **Length:** the ribbon is about 150–220 mm (measure).

## Connector pinouts
- **J1 battery:** JST S2B-PH-K-S, side entry, facing right.
  - 1 = VBAT_IN (pack +, red), 2 = GND (pack −, black). Pad 1 is JST's circuit No. 1, where Adafruit packs put the
    red wire ("Polarity matches all Adafruit LiPoly/LiIon chargers and boards", Adafruit 5035 page). Adafruit's and
    SparkFun's Eagle libraries number these pins the other way round, so don't copy "pin 1 = GND" from them.
  - **Meter-check the first pack:** Hold a bare JST S2B-PH-K-S as it sits on a board (its PCB pins pointing down, the opening facing you), plug the pack in and meter the two pins underneath: the LEFT pin is pin 1 and must read + (3.6–4.2 V). If it reads −, stop and don't plug that pack into a beacon.
  - Silkscreen: "BATTERY ONLY", with + beside pad 1 and − beside pad 2.
- **J2 LilyGO battery:** wire pads, 1.15 mm holes, 22 AWG.
  - 1 = VBAT_PROT → holder + tab (ESP32 end).
  - 2 = GND → holder − tab (antenna end).
  - Silkscreen: "LILYGO BATT + / −".
- **J3 signals:** 2 × 7 shrouded right-angle box header facing right (table above).
- **J4 12 V loads:** JST B6B-XH-A, top entry.
  - 1 = +12V_INT (siren +), 2 = SIREN_SW (siren −).
  - 3 = +12V_INT (strip +), 4 = LIGHT_SW (strip −).
  - 5 = +12V_INT (red light +), 6 = REDLED_SW (red light −).
  - There is no GND pin, so a bridge can never latch a load on.
- **J5 buttons:** JST B6B-PH-K-S, top entry. Silkscreen: "J5 NOT BATT".
  - 1 = GND (daisy-chain it to the green LED −, green COM, red COM and the silence button).
  - 2 = LED_OK_J (green LED +), 3 = BTN_OK_J (green switch NO), 4 = BTN_HELP_J (red switch NO), 5 = SIL_J (silence button), 6 = no connection.
- **J6 shaker:** wire pads, 0.85 mm holes, 24–26 AWG.
  - 1 = SHK_JACK → jack TIP.
  - 2 = GND → jack SLEEVE/bushing.
  - Silkscreen: "SHAKER", with "TIP" and "SLV" under the pads. Label the jack itself "Bed shaker only".
- **U1 pads (left to right):** OUT, GND, GND, VIN, VIN, EN. **U2 pads (left to right):** Vin, GND, SD, GAIN, DIN, BCLK, LRC.

## Layout (how it fits the case)
- **Coordinates:**
  - KiCad origin at the board's top-left corner, x to the right, y down, viewed from the parts side. That is the same as looking into the case from the front.
  - Case x = 4.3 + x. Case z = 120.3 − y.
- **Board:** 70.0 × 50.0 mm, 2 layers, 1.6 mm FR-4, 1 oz copper. All parts on the front.
- **Edges:**
  - **Cables leave only on the right.** J3 at y 8.9–34.3, J2 at y 37.7, J1 at y 41–48.
  - Nothing sticks out past the right edge above y 9: the LoRa SMA connector starts 1.2 mm past the top-right corner.
  - Left: 4.3 mm to the wall. Top: 9.7 mm to the wall, with the siren and SMA. Bottom: the battery is 4.8 mm below and the cradle wall 2.7 mm below. So no connectors on those edges.
- **Back side:**
  - The board rests on 1.5 mm ledges along the two long edges. No through-hole pad may come within 2.5 mm of the top or bottom edge (the checker passed this).
  - Trim every lead tail to 2 mm or less (the gap is 3 mm).
- **Heights:**
  - Top strip y 0–17 (x 5.5–57): 13 mm maximum, because the siren holder is in front of it.
  - Elsewhere: 15 mm, including plugs.
  - Tallest parts: U2 ≈ 12.6 mm (estimate), J4 with its plug ≈ 10–13 mm, J3 9 mm, U1 and C1 8 mm.
- **Where the main parts sit:**
  - Battery input (J1, R1, Q11): bottom right.
  - Booster (U1): bottom middle. The amp (U2): middle right, its audio pins 5–10 mm from J3.
  - 12 V harness (J4) with its 3 switches above it: middle left.
  - Button harness (J5) and its parts: far left.
  - Shaker parts and J6: bottom left.
- **Under the modules:** nothing is placed under U1 or U2 (rule areas), but tracks may run there.
- **Track widths:**
  - Battery path: 2–3 mm or copper pours.
  - 12 V: 0.6–1.0 mm.
  - Signals: 0.25 mm.
  - Vias: 0.3 mm hole, 0.6 mm pad.
  - Full list in the layout section of this package.

## Parts placed by JLCPCB (per board; prices read 2026-11-27, LCSC)

| Refs | Part | LCSC | Class | Qty | ≈ Unit |
|---|---|---|---|---|---|
| Q11, Q16 | AOS AON7421 P-FET | C115842 | Extended | 2 | $0.49–0.62 |
| Q12–Q15 | AOS AO3400A | C20917 | Basic | 4 | $0.06–0.08 |
| D1, D2 | MDD SS14 | C2480 | Basic | 2 | $0.02 |
| TVS1 | MDD SMAJ13A (alt. Littelfuse C148214) | C153724 | Extended | 1 | $0.04 |
| F1 | BHFUSE BSMD1206-025-33V | C2977524 | Extended | 1 | $0.055 |
| F2 | BHFUSE BSMD1206-050-30V | C883126 | Extended | 1 | $0.06 |
| R1 | Milliohm 10 mΩ 2512 3 W | C5375464 | Extended | 1 | $0.05 |
| C1 | ROQANG 100 µF 25 V 6.3 × 7.7 | C72477 | Extended | 1 | $0.03 |
| C2, C3, C5 | Samsung 10 µF 25 V X5R 0805 | C15850 | Basic | 3 | $0.03 |
| C7 | Samsung 1 µF 50 V X7R 0805 | C28323 | Basic | 1 | $0.03 |
| C4, C10 | YAGEO 100 nF 0603 | C14663 | Basic | 2 | $0.005 |
| C8, C9, C11 | FH 10 nF 0603 | C57112 | Basic | 3 | $0.004 |
| R2, R11, R15 | 10 kΩ 0603 | C25804 | Basic | 3 | $0.002 (LCSC retail showed 0 stock: check in JLCPCB's tool) |
| R12, R16, R17 | 4.7 kΩ 0603 | C23162 | Basic | 3 | $0.002 |
| R3, R5, R7, R9, R18 | 100 Ω 0603 | C22775 | Basic | 5 | $0.002 |
| R4, R6, R8, R10, R13, R21–R23 | 100 kΩ 0603 | C25803 | Basic | 8 | $0.003 |
| R24 | 1 kΩ 0603 | C21190 | Basic | 1 | $0.002 |
| R19 | 1 MΩ 0603 | C22935 | Basic | 1 | $0.002 |
| R20 | 0 Ω 1206 | C17888 | Basic | 1 | $0.005 |
| J1 | JST S2B-PH-K-S | C173752 | Extended (through-hole) | 1 | $0.04 |
| J3 | HCTL HC-JN254-2-07-W | C5372874 | Extended (through-hole) | 1 | $0.25 |
| J4 | JST B6B-XH-A | C144397 | Extended (through-hole) | 1 | $0.09 |
| J5 | JST B6B-PH-K-S | C131342 | Extended (through-hole) | 1 | $0.07 |

**You add:** U1 Pololu U3V40F12 ($9.15 each for 5), U2 Adafruit 3006 ($5.95; $5.36 for 10+), the J2/J6 wires, and the IDC socket plus ribbon. There are 15 test pads and 3 fiducials (camera alignment dots); they are bare copper and cost nothing.

## Cost (estimate: not a quote)
- **Fees:**
  - Economic assembly: setup $8.18, stencil $1.53, "confirm parts placement" $0.45.
  - $3.07 for each Extended type: 6 placed parts + 4 connectors.
  - $3.58 per order if JLCPCB solders the connectors.
- **Option A (JLCPCB fits everything except U1/U2):**
  - 5 boards ≈ **$64** before duty and shipping (≈ $12.70 per board).
  - 10 boards ≈ **$79** (≈ $7.90 per board).
- **With duty and shipping:** ≈ 35% US duty paid at checkout, plus $13–31 shipping (unverified). That gives ≈ $20–23 per board at 5 and ≈ $12–14 at 10.
- **Option B (you solder the 4 connectors):** ≈ $42 (5) or $54 (10) before duty and shipping.
- **Per beacon, driver section:**
  - With the modules (+$15.10 at 5, +$14.51 at 10), before duty and shipping: ≈ $27.80 (5) or $22.40 (10).
  - Perfboard: ≈ $24.
  - So at 5 boards the PCB costs a few dollars more and saves wiring time and mistakes. At 10 it roughly breaks even.
  - **Like for like, delivered:** a perfboard unit also needs the #45–#49 parts (≈ $8.40: Pololu #2810, TVS, genuine
    J1 socket, high-side parts, F2, silence button), which the PCB has on board or shares (the silence button). With
    those added, the PCB costs about $3–10 more per beacon at 5 boards delivered, and about the same at 10.
- **The review fixes cost** about +$0.40 per PCB, mostly the second AON7421.
- **Monthly cloud cost:** $0.

## Where to make it
- **JLCPCB Economic PCBA:** 2-layer, 1.6 mm, 1 oz, lead-free HASL finish, top-side assembly, 5 boards for spin 1, DDP (duty paid at checkout), "confirm parts placement" ticked.
  - It fits this board: 70 × 50 mm, single-sided placement, 2–50 boards. It has the lowest published fees and a 1–3 day build.
  - **Before paying, check every polarized part in JLCPCB's placement preview:** Q11/Q16 pin 1, the SOT-23s, the diode cathode bands and C1's +.
  - Under 18: JLCPCB's terms need a parent's or guardian's permission, or an adult officer of the nonprofit can order.
- **Not PCBWay's $29 offer:** it caps through-hole joints at 100 per order, and 5 boards × 28 joints = 140.
- **Fallback:** OSH Park bare boards (US-made, no tariff), hand-assembled. But the DFN AON7421 needs hot air, so that route would need SOT-23 swaps.
- **US duty:** an assembled board is classed under 8531.90.90 or 8543.90.88, not 8534 (which is bare boards). The legal rate is 25% + 12.5% = 37.5%; JLCPCB lists about 35%. A USTR proposal could add 0–7.5 points after its January hearing.

## Perfboard bench units (same circuit, hand-solderable)
See the buy-list rows in this package. In short:
- **Reverse-battery protection:** Pololu #2810 LV ($4.49), or Si2333DDS on a SparkFun SOT-23 adapter.
- **TVS:** P6KE15A.
- **Fuses:** shaker SparkFun COM-08357; internal 12 V Bourns MF-R050.
- **Battery socket:** genuine JST S2B-PH-K-S (2 A; SparkFun PRT-09749 is rated only 1 A).
- **If high-side:** AO3401A on an adapter with 10 kΩ / 4.7 kΩ.
- **Resistors to match the PCB:** R15, R21–R23, R16–R18 and the silence parts.
- **Cost:** this is above #45's +$1–3 estimate.

## Bench tests that must pass before ordering (run on the perfboard units)
1. **Shaker jack short.** Use a current-limited bench supply first, then the real 5035 pack with nothing on USB. Short the jack while the shaker is on, and also plug the shaker in while the output is live. Record:
   - whether the pack shuts off, and whether it recovers without USB;
   - whether the booster survives;
   - F1 trip time;
   - the lowest VBAT_PROT (TP3);
   - whether the LilyGO switches off.
2. **Soft overload:** a 2–3 Ω load on the jack (≈ 0.4–0.6 A).
3. **12 V harness short:** +12V_INT to GND.
4. **Battery sag:** run the worst alarm pattern at pack resting voltages of 3.4, 3.6 and 3.8 V. Scope TP3 and the LilyGO 3.3 V rail, and note the voltage at which the PMIC switches off.
5. **Plug-in inrush:** does plugging the pack in trip its protection?
6. **Reversed battery:** use a bench supply set to 100 mA, with and without USB plugged in.
7. **Shaker:** measure start and running current, and polarity (tip +?). Run a 10-minute pulsed test in the closed case and record the temperature near F1.
8. **Outputs off:**
   - TP9–TP12 must read about 0 V at power-up, through a reset, after firmware starts with buttons idle, and with J3
     unplugged. TP13 must read the same as TP4 (+12 V) within about 0.1 V, so Q16 is off; with the shaker commanded on,
     TP13 sits about 8.5 V below TP4.
   - The jack (TP6) must read 0 V.
9. **Audio** at a 3.0 V pack. **Idle current:** about 2.4 mA for the driver section (estimate).
10. **Test-fits:** try a battery PH-2 plug in J5 and a PH-6 plug in J4. Also check the U2 height, the ribbon and plug clearance in the 14 mm right-edge gap, and the 5035 lead length and polarity.

## Firmware notes
- **Pin plan:**
  - Siren 21, shaker 18, strip 46, red light 14.
  - BCLK 47, LRC 48, DIN 45.
  - Buttons OK 17 and HELP 16, green LED 43, silence 0.
  - Drive all gates low first thing at boot.
- **Watchdogs:** a task watchdog on every task (main loop included) with panic → reset, plus the RTC watchdog. On a hang the chip resets and the pull-downs switch everything off.
- **Alarm state:**
  - Keep it in RTC memory and flash, and resume after any reset.
  - After a brown-out reset, resume with fewer loads at once.
  - Set a "shaker on" flag before enabling the shaker. If the next boot is a brown-out or power-on with that flag set, keep the shaker off, report "shaker fault" and keep the siren and voice going.
- **Current rules (peak, not average):**
  - Never run siren + shaker + loud audio + modem transmit at once.
  - Aim for 2.5 A or less until the bench finds the pack's real trip point (TP1–TP2: 10 mV per amp).
  - **The pack's leads and the JST-PH J1 are each rated 2 A.** Keep sustained current at or below 2 A, and let the
    bench decide whether short peaks above that are acceptable.
  - Shed shaker duty first, then volume.
- **Low battery:** base "alarm at risk" on the measured PMIC switch-off point, not 3.0 V.
- **PMIC (AXP2101):**
  - Keep the buy-list charger settings, and leave precharge at its 125 mA default.
  - **Recommend clearing REG23H bit 0** (DCDC1 85% under-voltage power-off). A sag then causes an ESP32 reset that recovers on its own, instead of a PMIC shutdown that needs a button press or USB. Bench-verify this.
  - Also check VOFF (2.6 V) and the power-on options.
- **Battery missing or reversed while on USB:** report it as the top-priority "ALARM NOT WORKING".
- **Amplifier:**
  - It is in left-channel mode; send the same samples in both slots.
  - Stop BCLK when silent (standby 340 µA), stopping it first or together with LRCLK. Restart it 10 ms or more before sound.
  - Use a low I2S drive strength. Before deep sleep, drive the I2S pins low (the pull-downs also hold them).
  - Check the module marking: on an R8V module, GPIO47/48 are 1.8 V.
- **Buttons:**
  - Internal pull-ups, RTC pull-ups for waking from sleep, debounce of 20 ms or more.
  - At boot, toggle the green LED and check OK doesn't follow it (that catches a J5 bridge).
  - A button held at boot is a fault, not a press. OK and HELP together count as HELP, and the fault is flagged.
- **Silence (option A):** GPIO0 input with pull-up and a falling-edge interrupt. It is silence only: never OK, never help.
- **Logging:** never start UART0; log over USB.
- **Spin-1 limit:** firmware can't see a tripped F1/F2 or a missing 12 V, so plan a periodic audible self-test.

## Decisions for you
Decided 2026-11-27: pin plan (#46), high-side shaker (#47), silence button (#48), bench-unit protector (#49); case end stops added. Still open, in `docs/decisions.md`: #50 shaker fuse after measuring the shaker, #51 the order gate (and the fallback if a shorted jack trips the pack), #52 fault visibility, #53 a spin-2 12 V kill switch, #54 the JLCPCB order option and quantity. The LilyGO − lead follows #45 (the holder's − tab). Founder steps (in `docs/PLAN.md`): the bench tests, an engineer's review, and the JLCPCB account (under 18: a parent's permission, or an adult officer of the nonprofit orders).

## Not verified
- The routing was done by this repo's own small router (`route.py`), not by hand or by Freerouting: have an experienced engineer look over it before ordering (BEACON_PCB.md step 6).
- **Footprints and modules:**
  - The AON7421 land pattern against the KiCad PowerPAK 1212-8 footprint (compare with AOS drawing PO-00093).
  - U1 pin order and mirroring against the Pololu drawing.
  - U2 height with its terminal.
  - The HCTL header's pin-to-face distance against the KiCad footprint.
- **Behaviour:**
  - The pack's protection thresholds and recovery.
  - Every short, sag and inrush outcome above.
  - The AXP2101 register behaviour.
  - GPIO18's power-up blip on the shaker.
  - The 13 mm and 14 mm clearances, the ribbon and wire lengths, and the shaker's current and polarity.
- **Parts and cost:** JLCPCB stock and Basic status for C25804, all costs, duty base and shipping.
