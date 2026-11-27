# Product plan: from kit to a finished sensor people can buy

Written 2026-11-25 from the founder's goals:
- setup works **with or without an app**;
- owners can **manage** their sensor after setup (replacement notices, "higher than usual" notices);
- a **printed case**;
- eventually **sell a finished product**, not just a kit;
- **first responders** learn who needs help.

Facts were checked against primary sources on 2026-11-25. Links are inline. Nothing here changes v1. Items
marked **(decision)** are the founder's call and are listed in `docs/decisions.md` → Open.

## 0. Order of work (the v1 kit stays first)
1. **Now (v1 kit):** finish M10/M11 as planned. Test the printed case (`hardware/enclosure/`) alongside the
   current box. Add the two owner notices to `/my`, which needs no hardware change.
2. **Next (v1.5):** an optional phone app **only if** the first-user tests show setup is hard. It would use the
   same setup and `/my` features.
3. **Later (v2, sellable product):** a custom circuit board with a certified WiFi + Bluetooth module, a molded or
   printed case, FCC testing, insurance.
4. **Later (Home Beacon):** alarms, "I'm OK / I need help", family and responder sharing (section 6).

## 1. The exact build (v1 kit with the printed case)
**Parts:**
- PMS5003 + its 8-pin cable + adapter board;
- NodeMCU V3 LoLin (CH340);
- 4 jumper wires (red VIN, black G, blue D1, yellow D2);
- USB cable;
- phone charger (decision #11);
- printed cover + tray;
- card with the two QR codes.

**Steps:** see `hardware/enclosure/README.md` → "Build steps with the case". They're the same as today's
`docs/USER_FLOW.md` Part 1, except "put the parts in the box with the tubing" becomes:
- stand the sensor in its holders, fan side down;
- set the board in its holders;
- click the cover on.

**(decision #20)** Replacing the box + tubing changes recipient steps and wording. It's proposed only, and the
guide and `/my` text stay as they are until you approve it.

**Cost per kit (estimate):**
- **Printed case:** about 60–80 g of PETG/ASA ≈ **$1.50–2.00** of plastic, plus 3–5 h of printer time (check in
  a slicer).
- **Current box + tubing:** no kit cost sheet yet (PLAN → waiting on founder), so the difference can't be
  computed. Get the box price from the old supplier list.
- **Printing for many kits:** a volunteer printer farm or a print service. Get a quote per unit before choosing.

**Why replace the tubing:** Plantower says the housing opening must be no smaller than the inlet. A study found a
1 Pa restriction at the inlet lowered readings by about 30%
([Ouimette et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11236278/)). Test the current tubing against an
open sensor either way (case test list, step 2).

## 2. Managing a sensor after setup (no app needed)
`/my` already shows:
- whether it's working;
- readings over time;
- WiFi signal and firmware;
- rename, inside/outside, address and offline alerts.

Two new notices, both in `/my` and in web push, with no hardware change:

### 2a. "Your sensor may need a replacement"
The PMS5003 has no fan or laser status (its data frame's spare field is "reserved"), so we infer health:
| Signal | Rule (starting point; tune with real data) | Source |
|---|---|---|
| Age | Gentle reminder at **3 years** of runtime (hot, dusty outdoor sites: ~2.5). The datasheet MTTF is ≥3 years. PurpleAir says ~2 years, and an EPA-co-authored study found ~2% of sensors permanently degraded and suggests servicing after ~4 years (~3 in hot-dry climates) | [Plantower V2.3](https://cdn-shop.adafruit.com/product-files/3686/plantower-pms5003-manual_v2-3.pdf), [deSouza 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10208317/) |
| Stuck | The same value for **≥3 hours** while neighbors move | [EPA Enhanced Air Sensor Guidebook (2022)](https://cfpub.epa.gov/si/si_public_file_download.cfm?p_download_id=545843&Lab=CEMM), QC table 3-2 |
| Near zero | Near 0 for hours while neighbors read normal: often a failed fan | PurpleAir maintenance guidance |
| Raised baseline | Clean-air readings **~10+ µg/m³ above neighbors** for days. A loose fan caused this in a 320-day study | [Sayahi et al. 2019](https://par.nsf.gov/servlets/purl/10110838) |
| Neighbor disagreement | Off from the average of nearby sensors by more than both **10 µg/m³** (the sensor's own spec) and a percentage, for most hours of a week. With one PMS per unit we can't do PurpleAir's A/B check, so neighbors stand in | EPA "buddy" check |
| Sensor not answering | The firmware's existing `sensor_ok` health flag stays 0 | our firmware |

**Wording:**
- Say "may need a replacement". Never "broken".
- Say what to try first: check for insects or spider webs at the bottom opening, then unplug and replug.
- Never suggest canned air: in one study it didn't help and may have damaged a fan (PurpleAir's guide differs).
- **Spare parts:** a replacement PMS5003 costs about $10–20 and fits the same holders without tools.

**Cost:**
- **Runtime:** a daily job over data we already store, so effectively $0 at pilot scale.
- **Cost to add:** a little backend work in `backend/`, then a section on `/my`.

### 2b. "Your indoor air is a bit higher than usual"
For **indoor** sensors only. It compares each home with its **own** normal level, which competitors don't do: they
use fixed thresholds such as Airthings' 25 µg/m³.
- **Baseline:** the median for that hour of day over the past 14 days.
- **Trigger:**
  - at least **+10 µg/m³** above that baseline (the sensor's ±10 spec, so noise doesn't trigger it);
  - and at least 2× the baseline;
  - for ≥20 minutes;
  - but still under the EPA "unhealthy for sensitive groups" level (35.5 µg/m³).

  Above that level, it's a normal air-quality alert.
- **Why it's useful:** a study of 3,977 US homes found typical indoor PM2.5 is low (mean ~3.3 µg/m³), and
  cooking-type events are a large share of what people breathe indoors
  ([Lunderberg 2023, PNAS](https://pmc.ncbi.nlm.nih.gov/articles/PMC10723120/)).
- **Wording (draft, needs approval):** "Your indoor air is higher than usual right now. This is common while
  cooking. It's not at an unhealthy level. Tip: turn on the range hood (if it vents outside) and keep it on for
  10–20 minutes after cooking." The tip is from
  [EPA's cooking guidance](https://www.epa.gov/indoor-air-quality-iaq/strategies-improving-indoor-air-quality-while-cooking-infographic).
- **Limits:**
  - at most once per event;
  - quiet hours;
  - off by default? **(decision #21)**
- **Placement advice for indoor sensors:**
  - not directly over the stove or in steam (Plantower says kitchens need extra protection);
  - 3–6 ft up;
  - away from doors, windows and vents (EPA).
- **AQI numbers:** use the **2024 EPA breakpoints** (Good ends at 9.0 µg/m³, not 12). Check `backend/` uses them.

## 3. Setup with or without an app
Setup must always work with no app. That's what PurpleAir and IQAir's indoor monitor do; Awair, Airthings and
Amazon require an app and an account. An app is an **optional extra**:
| Path | Works today | With the optional app |
|---|---|---|
| Computer + USB (Chrome/Edge) | Yes | same |
| Phone, no app (QR → setup hotspot) | Yes | same |
| Phone app | none | **v1 board (no Bluetooth):** the app joins the sensor's setup hotspot by itself and skips the "Join network" step. **v2 board (Bluetooth):** iRobot-style tap-to-set-up |
| Manage (`/my`) | Yes, installable web app | Same features, plus app notifications |

**The app** would be a Flutter app (the same skills as Fire Watch) under the nonprofit's own developer accounts.
**(decision #22)** Build it only if the M10 first-user tests show setup trouble. It adds store reviews, a second
codebase and privacy labels.

## 4. The finished product (v2, sellable)
### Hardware
| Choice | Why | Source |
|---|---|---|
| **ESP32-C3-MINI-1 module** (WiFi + Bluetooth LE) on our own circuit board | Already FCC modular-approved (FCC ID 2AC7Z-ESPC3MINI1), so the radio needs no certification of its own; Bluetooth allows app setup; Espressif promises ≥12 years of supply from 2021 | [Espressif FCC certificate](https://documentation.espressif.com/ESP32-C3-MINI-1%20FCC%20Certification.pdf), [longevity commitment](https://www.espressif.com/en/products/longevity-commitment) |
| Not NodeMCU dev boards | Espressif marked the ESP8266 "not recommended for new designs" in 2025. The ESP-12 modules on clones have vendor-specific or unverifiable FCC IDs | [ESP8266EX datasheet v7.1](https://documentation.espressif.com/0a-esp8266ex_datasheet_en.html) |
| PMS5003 (same sensor), on its 8-pin socket on the board | No jumper wires; same holders | n/a |
| Humidity sensor on the board, placed in outside air | Needed for EPA's correction formula. Calibrate first: the published formula used PurpleAir's internal, warmer and drier humidity reading | [Barkjohn 2021](https://amt.copernicus.org/articles/14/4617/2021/) |
| USB-C, and the charger included | PurpleAir ships without one, which adds a purchase step for buyers | maker's store pages |
| Status light visible through the case, and a reset button reachable from outside | Today both are hidden inside | n/a |

**Cost per unit (estimate, needs quotes):** module, board, assembly, PMS5003 ($10–20), case and charger,
roughly **$30–45** at a few hundred units. The case is printed, or injection-molded at volume (a mold is a one-time
cost of thousands of dollars; get quotes). The Home Beacon section of `FUTURE.md` has comparable part prices.

### Rules for selling it (US)
- **FCC:**
  - **The radio:** use the certified module unchanged (antenna, layout and 20 cm separation, as in its grant).
  - **The product:** still needs **Part 15 Class B testing** with a **Supplier's Declaration of Conformity
    (SDoC)**. You test it yourself at a lab, with no FCC filing.
  - **The lab:** one US lab lists $1,900–5,000 for SDoC and $4,900–10,000 when a certified module is involved
    ([compliancetesting.com](https://compliancetesting.com/how-much-does-fcc-testing-cost/)). Get 2–3 quotes.
    FCC rules bar labs owned by "prohibited entities" (47 CFR 2.902/2.948).
  - **Label:** "Contains FCC ID: 2AC7Z-ESPC3MINI1", the Part 15 two-condition statement, and a model number.
  - **Manual:** the Class B notice and the modification warning.
  - **Responsible party:** a US-based responsible party keeps records for 2 years. Nothing may ship before the
    SDoC is done, though pre-orders with disclosure are OK (47 CFR 2.803).
- **⚠ The current kit:**
  - The FCC treats a kit as a device once assembled (47 CFR 15.3(p)).
  - The home-built exemption excludes kits (15.23).
  - The "evaluation kit" exception only covers sales to developers.
  - So **giving the assembled kit to the public may need its own FCC authorization.** Get a professional opinion
    from an FCC test lab (TCB) or a communications lawyer **before scaling kit distribution** **(decision #23)**.
- **Charger:** buy a branded charger that already has its own FCC authorization, DOE efficiency marking and
  UL/ETL listing. A UL listing for the 5 V sensor itself isn't federally required. Many retailers, and workplaces
  (OSHA), want it, so plan for UL/IEC 62368-1 if selling through stores or to schools and agencies.
- **Laser:** the PMS5003 contains a laser. Ask Plantower whether it's an FDA-certified laser component, which
  decides whether we file an FDA laser report or only keep records (21 CFR 1040.10/1002).
- **Claims (FTC):**
  - Every advertised claim needs evidence first.
  - **Never** call it a smoke, fire or life-safety alarm: smoke alarms are a separate certified product type
    (UL 217).
  - Keep the "not a smoke alarm; follow official orders" line on the box, the listing and the manual.
  - There's no EPA approval for consumer sensors, so never claim "EPA approved".
- **Other:**
  - **Prop 65:** businesses with fewer than 10 employees are exempt, but retailers may still ask.
  - **Warranties:** written warranties on products over $15 must publish their terms (Magnuson-Moss).
  - **Insurance and reporting:** product liability insurance, and a complaint log for CPSC's 24-hour reporting
    duty.
  - **Security:** California's connected-device law wants a unique credential per unit, which the owner code
    already covers.
- **Supply chain:** Espressif isn't on the FCC "Covered List" (checked 2026-11-25, list updated 2026-08-20).
  Re-check before each production run.

### Where it fits in the market
- **Every finished monitor that posts to a public map costs $209 or more:** PurpleAir Touch $209 (indoor),
  Classic Plus $239 (outdoor, two PMS5003s), Flex $289, Zen $299; IQAir AirVisual Outdoor $299.99. Cheap monitors
  ($36–104, e.g. Temtop) don't publish to a public map.
- **Our angle:** a ~**$60–90** retail sensor that:
  - needs no app or account;
  - has no monthly fee;
  - goes on a community map;
  - warns before the sensor wears out;
  - gives "higher than your usual" notices.

  It should keep working on its own if our server ever goes away. Awair turned off the cloud for older devices in
  2022 and left owners with only the display. **(decision #24: price.)**
- **Gap vs. PurpleAir:** one PMS5003 instead of two means the EPA AirNow Fire and Smoke Map can't run its A/B
  check on our data. Either use **two sensors in the outdoor product** (about +$10–20 per unit) or meet EPA's data
  acceptance protocol another way. **(decision #25)**

## 5. Family and "loved ones" alerts
**(decision #26.)** Recommended: build it into Fire Watch first, and make a separate nonprofit app later with the Home Beacon.
- **"Places I watch":** extra places in Fire Watch, such as a parent's home.
- **"Let my family know":** confirmed fires near my home, plus "I'm OK / I need help", go to invited family.
- **Text messages** for family without the app.
- **Rules:**
  - sensor smoke alone never says "fire";
  - both people agree before a place is shared;
  - family see "near Mom's home", never the address.

## 6. First responders: "who needs help" (Home Beacon phase)
This could save lives. In the Camp Fire, 60% of entrapments (35 of 58) happened between 8:00 and noon. Crews
responded to 83% of entrapments but only 44% of non-urgent "help me leave" requests. At least 42% of the people who
died had a mobility or medical condition, and 87% were found at home
([NIST TN 2252](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.2252.pdf), via NIST's summary slides). It
must be built **with** agencies, not around them. The partner view's design is in `docs/PARTNER_VIEW.md`.

**What the rules and experience say:**
- **Never auto-dial 911.** Some states ban devices that call 911 by themselves (Illinois 50 ILCS 750/15.2a, a
  criminal offense; Arkansas 12-10-314). Federal law (TCPA) also covers automated calls to fire and police lines.
  Industry practice: a person verifies first (RapidSOS's "Emergency Verification"; IETF RFC 8876).
- **Agencies are wary of registries.**
  - California's emergency agency strongly discourages voluntary disaster registries: they go stale, few people
    sign up, and they create false expectations of rescue.
  - The National Council on Disability (2023) reports that in Houston during Hurricane Harvey, fewer than 5% of
    registrants were contacted.
  - **NYC uses its Advance Warning System** (alerts to organizations that serve people with disabilities) and
    door-to-door canvassing after emergencies, rather than a registry.
- **What helps:** current, time-stamped information that agencies can **pull** during an incident. After the
  2025 Eaton fire, the LA County Sheriff built a "Citizen Evacuation Tracker" of who has and hasn't evacuated.
  Plans that work go through **CERT teams, independent-living centers and neighborhood groups**.

**Plan (each step adds to the one before; all opt-in):**
1. **Household circle:** "I need help" goes only to people the owner picks (family, a neighbor, a CERT buddy).
   - **Press:** a long press, then a cancel window.
   - **Every screen and the device say:** "This does not call 911. If you need help now, call or text 911."
2. **Partner pull:** a partner fire department, emergency-management office or CERT team can view or export the
   current list during an incident:
   - street address with apartment/floor (the FCC's "dispatchable location" format);
   - number of people;
   - mobility needs;
   - language;
   - phone;
   - **last check-in time**.

   Old statuses show as "unknown", never "OK". Include a printable encrypted export for when networks fail.
3. **911 integration** only through an established intermediary with human verification (RapidSOS or an alarm
   monitoring center using the ASAP-to-PSAP standard), after legal review.

**Privacy:**
- Treat mobility and medical information as sensitive, with field-by-field consent.
- Delete it easily.
- Encrypt it.
- Have a breach plan: the FTC Health Breach Notification Rule may apply.
- Keep addresses only in private storage, as with `private_locations` today.
- Sign-up text must say that signing up doesn't guarantee rescue and that people should plan to be
  self-sufficient for 72 hours (California's registry guidance requires this).

**First founder-only steps:**
- talk to NYC Emergency Management and a Boulder-area fire department or CERT program about what fields they'd
  use;
- ask RapidSOS about partner eligibility.

## 7. Sources not yet checked (from the research)
- **No manufacturer drawing exists for the NodeMCU LoLin.** Measure our supplier's boards.
- **Which end of the PMS5003 the cable socket sits at, and the adapter board's size:** measure a real unit.
- **No long-term outdoor UV data for printed PETG or ASA:** that's why the outdoor soak test matters.
- **The FCC status of the ESP-12F modules on our boards:** read the FCC ID printed on the module's metal can.
