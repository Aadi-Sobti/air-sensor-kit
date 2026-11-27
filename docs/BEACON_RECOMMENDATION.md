# Which Home Beacon version best gets people the alert, on time, and gets them help?

Written 2026-11-26. **Adopted by the founder on 2026-11-26 (decision #39).** Cabins: count them first, not in the first
pilot. Who pays the cell data is still open (#40). Nothing here starts before v1 ships or adds cost or steps to the v1
kit (decision #27).

**How it was made:**
- **Research:** two researchers covered homes with no cell signal (satellite options and prices, weather-radio gaps,
  mountain relays) and ways to get alerts out earlier than official orders.
- **Design:** four designers each proposed a version: most reliable, lean, remote cabins first, and getting help first.
- **Judging:** two skeptical judges scored them, one against the fatal-fires evidence
  (`docs/reference/WILDFIRE_DEATHS_AND_ALERTS.md`) and one on what a student nonprofit can actually do. Both ranked
  "getting help first" highest and "lean" second.
- **Synthesis:** a final reviewer combined the two and added the best ideas from the others.

## The recommendation in one paragraph
Build the **Help-First Home Beacon: a plan first, then a box.** Every pilot home gets two things:
- **A Leave-Early Plan in Fire Watch.** 2–3 named helpers (one within walking distance) get every alert for the home
  at the same moment, and are asked to come at the *warning* stage, not after the order, only if it's safe (draft wording for the founder: "Go only if it's safe. If officials tell you to leave, leave. Call 911 if someone is in danger.").
- **One beacon at the bedside of the person most at risk,** on a single board with its own **cell connection**, WiFi,
  and a LoRa chip. It wakes people with a loud siren, a low tone and a spoken message, a light, and a bed shaker where
  needed. An alert only counts as heard when someone presses a button; if nobody does, the helpers are told.

A volunteer sets it up with the household in a visit of about 30 minutes. After that, the household re-confirms its helpers twice a year. Both are new household steps, so the founder decides. Pilot cost is about **$125–150 per beacon** (*estimate*; some parts not priced), plus $18 for a bed shaker where needed. For 2 bench and 5 pilot beacons: about $875–1,050 once, about $7–21 a month in cell data, plus a relay ($150–385) and insurance (not priced). The household
pays **$0 a month**; the nonprofit pays about **$1–3 a month** per beacon for cell data.

## Why this version
The deaths research showed three gaps, and this version aims at all three:
1. **The alert reached a phone, not the person.**
   - **Bedside placement.** A closed door costs 10–20 dBA, and each floor about 20 dBA (CPSC 2005).
   - **A low 520 Hz tone with a spoken message, and a bed shaker.** One study of hard-of-hearing sleepers found a
     520 Hz square-wave tone woke 92% of them at 75 dBA, against 56% for a high-pitched alarm; bed and pillow shakers woke 80–84% and strobes 27% (*Bruck & Thomas 2009, Ear and Hearing 30(1):73–80; 38 adults with mild to moderately severe hearing loss, tested in deep sleep*).
   - **Proof that a person heard it.** If the alarm isn't acknowledged within 10 minutes, the helpers are told.
   - **Helpers as a second alarm,** who call or come over. A call or visit from someone they know is more likely to reach older
     people who don't watch phones.
2. **People couldn't leave alone.**
   - **Rides start at the warning, not the order.** Helpers answer "On my way" or "Can't", and their answer shows on
     the beacon. With no answer in 10–15 minutes, the request moves to the next helper. Opted-in homes are on the partner's ride list from the start of the warning, marked "ride confirmed" or "no ride yet", and helpers' answers update that row.
   - **The partner's ride list is the "can't leave alone" list** in `docs/PARTNER_VIEW.md`.
3. **People couldn't get help.**
   - **A buddy inside the area.** Roadblocks stopped family in Carr and Eaton; a nearby buddy is less likely to be turned back, but may be blocked or ordered out too.
   - **A family member who can't get there** taps "I can't get there", and the request goes straight to the buddy and, if the household opted in, onto the partner's ride list (partners pull the list; nothing is pushed to them).
   - **"I need help" goes out by cell, WiFi or LoRa,** including straight to opted-in neighbors with no internet at all
     (decision #37).
   - **"I'm OK" moves the home into the "OK" count for the current alert** (an OK from before the latest order doesn't count, as in `docs/PARTNER_VIEW.md`), so responders go to silent homes first. Stopping the siren is a separate press from "I'm OK", and it never marks the home OK.

**Why cell is in every beacon (a change from the WiFi-plus-LoRa design: ≈ $84 as first written, ≈ $93–104 with the board, battery and siren already recommended in #30, #33 and #35):** routers died with the power in
Lahaina, North Complex, Tubbs and Gatlinburg. A WiFi-only beacon goes blind exactly then. Cell keeps working while
towers have power. In California's 2019 power shutoffs most cell outages came from lost power, not damage, and up to 57% of a county's sites went down (Marin). It failed in several of the same fires (West Maui: 19 of 21 sites out; North Bay 2017: more than 70 towers lost; poor phone service in North Complex and Gatlinburg), so the LoRa chip stays
on the board for relays and neighbors. We found no Colorado rule requiring backup power at cell sites (the state's utility commission doesn't regulate cell service), and California's 72-hour rule doesn't apply there.

## The biggest lever isn't hardware: getting an alert at all
- **The free FEMA alert feed (IPAWS) would have had nothing, or only a late alert for part of the area, to send** for the victims' areas in the fires that account
  for about 60% of the 366 deaths (central Lahaina, Camp, the October 2017 fires and Gatlinburg): no IPAWS evacuation alert covered the areas where those victims died. Lahaina's one early phone alert, at 4:16 p.m., named only the Kelawea Mauka area. A beacon can't relay an
  alert that was never sent.
- **What could fix it, in order:**
  1. **A direct, signed feed from the county's own alert system** (CodeRED, Everbridge or Genasys), or a way for a
     partner agency to sign and send orders straight to beacons. **This should be the top ask in the first county
     conversation.**
  2. **Later, Fire Watch's own confirmed-fire alerts,** but only after a silent test season with published counts. The
     panel estimated possible head starts of about 9 hours in Eaton, 1–2½ hours in Camp and about an hour in Lahaina. That assumes Fire
     Watch confirms a fire within about 15 minutes, which is unproven.

## Three alert levels (wording and timers are the founder's call)
Every level, every helper text and every Cabin Watch notice carries the safety lines in `docs/HOME_BEACON.md` § 1: this is not a smoke alarm, it does not call 911, and it doesn't replace official alerts or evacuation orders.
1. **Plan ahead** (daytime only; screen plus a soft chime).
   - **Who gets it:** opted-in homes that need extra time to leave, and cabin owners.
   - **Trigger:** only the rare "Particularly Dangerous Situation" Red Flag Warning. Ordinary Red Flag days get a silent
     screen line.
   - **Honest:** among the fatal fires studied, only LA 2025 is believed to have had one (*not verified*: the fatal-fires research didn't check Red Flag Warnings; confirm with NWS records before quoting).
2. **Get ready** (a distinct chime and the light, not the siren).
   - **Triggers:**
     - an official evacuation *warning* for the zone or a neighboring zone;
     - later, a confirmed Fire Watch fire nearby and upwind, during a Red Flag Warning, only after the silent test.
   - **At night** it wakes only opted-in extra-time homes. It starts the ride plan.
   - **Slow fires:** for fires that burn for days, it sounds once, then stays as a silent status, and expires unless
     renewed. It sounds again only if things get worse, at most once a day.
3. **Leave now** (full siren, low tone, voice, shaker and light, at any hour).
   - **Triggers:** a signed official evacuation order for the zone; later, and only after its own silent test, a Fire Watch confirmed fire that meets the rule in `docs/HOME_BEACON.md` § 1 (confirmed, never "possible"). For a confirmed fire with no official order, the proposed voice says "Fire confirmed near you. Get ready to leave and follow official orders", not "Leave now" (founder decides the wording).
   - **Never a trigger:** a county-wide weather-radio code, one sensor's spike, a "possible" fire, or a single
     satellite hotspot.

**Avoiding crying wolf:**
- run all three levels silently for one fire season and publish how often warnings became orders;
- cap night wake-ups from "Get ready" (for example 2 a year). "Leave now" for an official order always sounds, at any hour, with no cap;
- explain every miss the next morning;
- never show our smoke readings as a reason to wait.

## The lineup
| Tier | For | What's in it | Cost once | Monthly |
|---|---|---|---|---|
| **0. Leave-Early Plan and Cabin Watch** | Every pilot home; anyone caring for a parent's home; cabin owners. Seasonal and rental cabins get only this | No hardware. A printed plan card (helpers, the county's evacuation-help number, how to release the garage door by hand, and the safety lines, wording for the founder: "This is not a smoke alarm. It does not call 911. It doesn't replace official alerts or evacuation orders: if officials tell you to leave, or you feel unsafe, leave right away. Signing up does not guarantee rescue. Plan to manage on your own for 72 hours."). Helper roles and escalation in Fire Watch. Cabins: "Before you go" fire-weather notices and an "at the cabin" flag that only the household's helpers see (and, if the household opted in, the partner during an incident) | $0 (about 30 min of volunteer time) | A texting number and carrier registration (a few dollars a month for the whole program, plus one-time fees; price the provider first), plus a few cents of texts per incident. Founder decides the provider, its cost, and sharing helpers' phone numbers with it |
| **1. Home Beacon** | Every pilot home with cell signal at the bedside; "needs extra time" homes first | One board with LTE-M cell, WiFi, Bluetooth and a LoRa chip. Protected 10 Ah battery, UL charger, louder siren, speaker for the low tone and voice, light, 1.3-inch screen, green "I'm OK" and red 60 mm "I need help" buttons, bed-shaker jack, a spare port for add-ons. Our own firmware, not Meshtastic | About $125–150 hand-built (some parts estimated); about $50–80 at volume (needs quotes) | $0 for the household; about $1–3 per beacon for the nonprofit |
| **2. Extra-time add-ons** | Wheelchair, oxygen, no car, depends on a caregiver; deaf, hard of hearing or heavy sleepers; sleepers on two floors | Bed shaker ($17.99); a second beacon for another floor (they check on each other); a weather radio only where the county uses it for fires (light and "listen to the radio", never the full siren) | +$18 up to about +$195–220 (shaker $18, second beacon $125–150, weather radio about $50) | $0, or about $1–3 more for a second beacon |
| **3. Neighborhood relay or base station** (shared, after the base pilot) | Homes that can see a fire station, school, water tower or ridge | A solar LoRa relay running our own firmware (the priced Meshtastic relays would need reflashing: check each one can be, and keep it run as certified) plus a gateway at the host: the host's internet, cell, and optionally an Iridium satellite modem that the server can push alerts to | Relay about $150–385, gateway estimated and relay batteries extra at the low end (about $15–40 a home across 10); satellite base station about $520–900 (about $10–18 a home across 50) | $0 with host internet; satellite about $19–20 for the whole group |
| **4. Remote cabin** (year-round homes with no signal, only after counting them) | Homes where the signal check fails, with no relay in sight | Cheapest first: move to a window or add an outdoor cell antenna; WiFi; a relay; then a satellite add-on (Iridium modem, roof antenna, solar); a weather radio with a high outdoor antenna where a transmitter reaches and the county uses it | Antenna +$20–50; satellite version about $500–800 in all | Satellite about $18–21 a month (HOME_BEACON § 2a says ≈ $15; recheck line rental plus message credits), case by case, grant-funded; who pays it, and Tier 3's group fee, is the founder's call |

**What happens when the beacon has no path:** after 30 minutes with no connection, the screen says "Not receiving
alerts", it chirps, and the helpers are told. Every alert gets a receipt. If none comes back within 1–2 minutes, the
server tries the next path and texts a helper.

## Mountain cabins: yes, but as their own later step, after counting them
- **Why they matter:** at a cabin with no signal, both a beacon and a phone receive nothing. Mountain deaths are real:
  the North Complex around Berry Creek and Feather Falls (16), Gatlinburg (14, several of them visitors, including a couple in a rental cabin), Concow.
- **Why not first:** most documented deaths were older people in connected towns, so the town pilot comes first.
- **How many homes are affected is unknown.** The FCC coverage map is modeled, outdoors only, and leaves out indoor
  signal. Fast 5G (35/3 Mbps) reached about 91% of people but only about 25% of US land at the end of 2022 (FCC). Slower 4G and voice reach more land, so this shows the gap is real but not how big it is. In the pilot county, Gold Hill has
  spotty cell service and landlines that die in outages (news).
- **Free first step (founder):** get an FCC map account and count wildland-edge homes without coverage in Boulder,
  Larimer and Jefferson counties. Spot-check indoors with phones, and ask the county how it warns no-signal addresses
  today.
- **Then, cheapest first:**
  1. Cabin Watch notices while the phone still has signal ("If anyone needs extra time, don't go this weekend"). At a
     cabin, leaving early is the biggest lever, because rescuers may not get in.
  2. An outdoor cell antenna, because many "no signal" homes are only weak indoors.
  3. A shared ridge relay or satellite base station for groups of cabins.
  4. A satellite add-on only for isolated year-round homes.
- **Seasonal and rental cabins:** a plan card, not a box that would look like it works when it can't. Recommend keeping
  a satellite-capable phone or messenger by the door (iPhone 14 or later, Pixel 9 or later except the 9a, T-Mobile T-Satellite, ZOLEO,
  inReach); these work outdoors only.
- **Watch, don't buy yet:** chips that do cell plus satellite in one (for example the Nordic nRF9151 on Skylo). Revisit
  in 2027, once Iridium's satellite service for this chip has a US price and it's clear whether the network can wake a sleeping beacon. (Skylo through Soracom already costs $1.80 a month plus $0.80 per KB, with each session rounded up to 1 KB.) Never have a satellite modem check in every hour: on Skylo that would cost hundreds
  of dollars a month.

## Build order (all after v1 ships)
0. **Founder, $0: one county conversation and one partner conversation.**
   - **County:** do you send warnings (not just orders) through IPAWS? Which alert system do you use, and would you give
     us a signed feed or let a partner agency sign orders straight to beacons? Do you use NOAA Weather Radio for fires?
     How do you warn addresses with no signal?
   - **Partner (CERT or paratransit):** would you act on a warning-stage ride list?
   - **Accounts:** register for FEMA's IPAWS feed, and get an FCC map account for the cabin count.
1. **Software first, $0 hardware: the Leave-Early Plan** in Fire Watch.
   - **What it includes:** helper accept links, escalation timers, "On my way / Can't / I can't get there", the
     stand-down message to helpers once an order is in effect, "Picked up", statuses that turn to "unknown", and a
     "helper away" switch.
   - **Business texting:** register it, and collect each helper's consent to texts.
   - **Test:** a tabletop drill with 5 households.
2. **A silent alert log for one fire season:** what each level would have done, published. Nothing sounds.
3. **Two bench beacons on the single board.**
   - **Measure:** check-in delay, data use, wake-up by text, battery life, receipts and resending, "Not receiving
     alerts", and the shaker output.
   - **Bedroom wake test:** door closed, at least 75 dBA at the pillow, comparing the piezo alone with piezo plus low
     tone and voice.
4. **Gates before any home:**
   - an FCC and carrier opinion on hand-built units with cell and LoRa radios (extends #23);
   - product liability insurance (cost not priced yet; the founder decides, with the other costs). The FCC and carrier opinion is the founder's outside contact;
   - a written agreement with the partner, and a lawyer's review of sharing household data with it (public-records exposure, decision #38). If those aren't ready, run the 5-home pilot with helpers only and add the partner ride list after it, as #38 says.
5. **A 5-home pilot** with the partner: homes with cell signal, "needs extra time" homes first, drills sent as signed
   test orders.
6. **Switch on "Get ready"** from official warnings, after the founder approves the silent-log numbers. The
   confirmed-fire trigger comes only after its own silent test.
7. **Switch on LoRa** (relays and the neighbors' "Someone nearby needs help", decision #37) with one shared relay or base station at the partner site, and range-test to real indoor spots. #37's "test it in the pilot" moves to this step.
8. **Cabins,** only if the count shows year-round no-signal homes in the pilot area.

## Don't
- Start any of this before v1 ships, or add cost or steps to the v1 kit.
- Let a county-wide weather-radio alert set off the full siren, or put a weather radio in every box.
- Build the many-device version for the pilot: two boards, pendants, separate bedside units. It's too much to build and
  support.
- Ship stock Meshtastic for help presses with a shared channel key: anyone with the key could fake a press.
- Install a box in a no-signal seasonal or rental cabin that would look like it works.
- Buy satellite hardware before counting no-signal homes.
- Auto-dial 911, page dispatch, or create 911 incidents.
- Sound anything for one sensor's spike, a "possible" fire or a single satellite hotspot.
- Show a ride as coming before a helper confirms it, or show "OK" from silence.
- Put addresses in LoRa or satellite messages.

## Honest limits (what no version fixes)
- **No alert to send:** it can't create an alert that officials never send and Fire Watch can't confirm. Where orders
  themselves were late (Camp), a faster feed doesn't fix that.
- **No full coverage:** no path covers every outage, and LoRa only helps where relays or neighbors with beacons exist.
- **Roads:** it can't clear gridlock, burnovers, blocked roads or locked gates.
- **People who stay:** it can't make people leave. The helpers can only see that nobody checked in.
- **No guaranteed rescue:** helpers may be blocked, partners may decline, and 911 may be swamped. A frail person with no
  helper and no partner nearby gets only the beacon; those homes are counted, not fixed.
- **Only homes with one:** it only helps homes that have a beacon. Reaching older and disabled residents (grants,
  volunteer installs) matters more than adding receive paths.

## Decisions for the founder (also in `docs/decisions.md`)
- **#39:** adopt this as the beacon pilot design. It replaces the WiFi-plus-LoRa design (≈ $84 as written, ≈ $93–104 with today's picks). It updates #29, #30 and
  #36, and keeps #37:
  - **#29:** our own firmware;
  - **#30:** bench-test the single-board candidates;
  - **#36:** cell in every beacon; a weather radio only where the county uses it for fires, and never in every box; a weather-radio alert never sets off the full siren (light and "listen to the radio" only), which replaces "then the beacon may sound for it"; satellite later, case by case (it was "Not satellite"); say whether the Fire Watch app's Bluetooth bridge stays;
  - **#37:** kept, since the LoRa chip is on every board.
- **Who pays monthly cell fees:** recommended $0 for households, about $12–36 per beacon a year from grants, with a plan
  so beacons don't go dark without warning.
- **Alert levels:** wording, sounds, night behavior, the night-wake budget and the "Get ready" duration rule.
  Recommended: switch on only after a silent season.
- **#31:** bed shaker plus low tone and spoken message instead of a strobe, after the bedroom wake test.
- **#32:** include an opt-in warning-stage ride list for the partner.
- **Escalation timers** and the helper stand-down wording.
- **New household steps:** a volunteer-led setup visit of about 30 minutes, and a re-confirm twice a year.
- **Cabins:** keep them out of the first pilot and count them first.
- **The county ask:** make a direct signed alert feed the top priority.

## Unverified items to check
- The single-board candidates: LilyGO T-SIM7080G-S3 plus a LoRa module, or RAK3312 plus RAK5860. A forum report says
  that second pair didn't talk to each other.
- The costs marked as estimates: the LoRa module, speaker, screen, cell antenna and gateway.
- The possible head-start times for confirmed-fire alerts.
