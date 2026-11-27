# Help-First beacon: should we design a circuit board?

Written 2026-11-27 from a research run:
- **Approaches:** 3 researchers, each checked by an adversarial reviewer.
- **Judging:** 3 judges, looking at cost, founder time and build quality.

**This is a recommendation.** The founder decides (open decision #44). Nothing here is designed or ordered. All hour figures
are estimates, and PCB costs come from JLCPCB's published fee table and part-price snapshots, not real quotes.

**Terms:**
- **PCB:** printed circuit board, a factory-made board with copper tracks instead of hand-soldered wires.
- **Perfboard:** a board with a grid of holes that you solder parts and wires onto by hand. It's today's plan.
- **Spin:** one round of design, order and test.
- **Driver section:** the parts on today's 5 × 7 cm hand-soldered board: the 4 switches and their resistors, the fuse,
  the 12 V boost and the amplifier.

## Short answer
- **For the 2 bench units and the 5-home pilot: not yet.**
  - Build on perfboard first. The bench units settle the circuit: shaker current, silence button, ground layout, and
    peak and idle battery current.
  - If v1 has shipped and the bench units have passed, a small **through-hole driver board** ("A0" below) is a good first
    PCB. It costs about the same as perfboard, makes every board identical, and removes most wiring mistakes.
  - Never let it hold up the pilot: if the boards aren't tested by build day, use perfboard.
- **For 50 or more beacons: yes.**
  - A factory-assembled driver board ("A2") that keeps the LilyGO as the brain saves about $14–17 per beacon (estimate).
  - It also turns a 4–6 hour soldering job into plugging in cables. At 500 beacons, hand-wiring isn't realistic.
- **Don't design the full board** (cell modem and radios on it) yourself. Only with funding, certification money, written
  carrier answers and an experienced engineer's review.
- **Money in context:** at pilot scale, the cheaper parts in the buy list save $28–49 per beacon; any PCB saves about $0.
  Certification for a product that's sold (about $8–32k, estimate) costs far more than any PCB saves at 50 units.

## The approaches
| Approach | Per beacon vs perfboard, at 5 / 50 / 500 | One-time cost | Founder effort (first-timer) | Risk |
|---|---|---|---|---|
| **Perfboard** (today) | Driver section about $24 / $22 / $21; at 500, about 1,000–1,500 volunteer-hours | $0 | No design; 4–6 h to build each beacon | Each unit is its own hand-built circuit: a wrong part type, flipped pins, or a missing pull-down that sounds the siren at boot |
| **A0:** bare 2-layer driver PCB, same through-hole parts, volunteers solder | +$2 (JLCPCB) to +$8 (OSH Park, US-made) / about the same / not suitable | About $15–55 of boards + a $50–100 current-limited bench power supply | About 20–40 h, usually 1 spin | Low: fixable with an iron, but a design mistake repeats on every board |
| **A1:** driver PCB with the small surface-mount parts placed by the factory; boost and amp modules soldered on | +$1–5 / −$4–5 / use A2 | $60–140 for 1–2 spins + the bench supply | 40–80 h over 6–19 weeks | Low–medium: tiny parts can't be hand-fixed |
| **A2:** driver PCB with the bare amp chip, boost chip and switches placed by the factory | Not worth it / −$14–17 / driver section about $5–6 vs $20–22 | +$130–270 for more spins | 80–150 h in all, 3–5 more months | Medium–high: the 12 V boost layout (heat, noise reaching the radios) |
| **B:** full custom board (processor, cell modem, LoRa, charger) | No saving at 5; parts about $115–170 at 50 and $85–130 at 500 (not proven cheaper) | $250–1,100 in spins + certification | 150–300+ h over 3–6 months, as a floor | High: antenna track design, the modem's 1.8 V signals, carriers' radio tests |
| **C1:** no PCB; Adafruit 6318 plug-in 8-channel driver | +$13 / +$12 / never cheaper | About $25 of spares | 12–20 h + new safety firmware | Medium: its outputs **stay on through a chip crash or reset**, so a siren could sound that firmware can't stop |

**What the judges said:**
- **They agree:** no PCB work until v1 ships and the 2 perfboard bench units have settled the circuit; A2 for volume;
  B only as a funded, mentored project; C1 is not the pilot default.
- **They disagree on the 5 home units:** two say perfboard by default with A0 as the optional PCB; one says A1, for
  identical boards with built-in protections. A0 gets most of that for about half the hours, with parts you can fix by
  hand, and the protections can be added by hand on perfboard (#45).

## Certification: the radios decide, not the board
- **A PCB doesn't make the pilot more or less legal.**
  - LilyGO's certification page lists only European CE marks for this board. Its SIM7080G modem has FCC ID
    2AJYU-8VC0002 and PTCRB (the cell industry's device test program that carriers require).
  - No FCC ID was found for the Waveshare LoRa module. The Seeed Wio-SX1262 has FCC ID Z4T-WIO-SX1262 (902.3–914.9 MHz).
- **Questions for the #23 expert before any home gets a beacon:**
  - The home-built exemption (47 CFR 15.23) covers five or fewer units for personal use. The pilot is 7 units in other
    people's homes, and it can't cover the cell modem anyway.
  - The evaluation route (47 CFR 2.805) covers the LoRa and WiFi side; the cell modem needs the carrier's permission
    or an FCC experimental licence.
  - Is a LoRa module with no FCC ID acceptable for a 5-home pilot?
- **Carriers:** Hologram requires PTCRB or GCF certification, and AT&T's flyer says FCC and PTCRB. Ask Hologram and
  AT&T in writing.
- **For selling or giving out widely:** FCC Part 15B testing (one lab quotes $1,900–10,000 as starting points), CTIA IoT
  Network Certified ($1,500 plus lab fees), and a review of three radios working side by side: about $8–32k in total
  (estimate). Only a fixed design (a PCB) can be tested and kept certified.
- **Antenna distance:** the module approvals assume people stay 20 cm from the antenna. Whether a bedside box counts is
  a lab question.

## If the founder says yes: first steps
1. **Now:** no PCB work. Finish v1 (#27 recommends the beacon waits for v1).
2. **After v1 ships:** build the 2 bench units on perfboard with a test sheet per unit. Check that the siren and shaker
   stay off at power-up, through a chip reset and through a low-battery dip, and measure 12 V before connecting anything.
3. **Settle the circuit** from the bench results (shaker current, silence button, ground layout, peak and idle current,
   the #23 answer).
4. **Draw it in KiCad** (free circuit-board software; its "Getting Started" guide takes about 10–15 h). The schematic
   helps volunteers even if no PCB follows.
5. **Lay out A0 at exactly 70 × 50 mm** so it sits on the existing ledges with no case change:
   - switches driven straight from the chip's pins, with 100 Ω in series and a 100 kΩ pull-down, so every output turns
     off on any reset;
   - reverse-battery protection, a resettable fuse on every output that leaves the box, a TVS diode (absorbs static
     zaps) on the shaker jack, and wide copper for the battery and 12 V paths;
   - labelled test points; parts no taller than 15 mm; a 2 mm strip clear along each long edge on the back for the
     ledges; screw terminals facing right or down (the left wall is about 4 mm away).
6. **Get an experienced engineer to review it,** then compare quotes from JLCPCB, OSH Park and PCBWay. Accounts and
   payment are the founder's steps.
7. **Order one spin and test every board** on a current-limited bench supply. No board that needed a patch wire goes into
   a home.
8. **At 50+ funded beacons:** real quotes for A2 (JLCPCB at both tariff ends), a Part 15B lab and IoT Network Certified,
   plus written answers from Hologram and AT&T.

## Not verified
- Every PCB cost (fee-table estimates; tariffs anywhere from 35% to 92.5%; no real quote).
- Every hour figure.
- Lab fees beyond published starting points; Hologram's and AT&T's pilot rules; which FCC pilot route applies.
- Whether the Waveshare LoRa module has any FCC approval.
