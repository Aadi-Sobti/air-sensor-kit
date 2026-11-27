# Partner view: what first responders see (Home Beacon, later phase)

Design only, written 2026-11-26. **Nothing here is built, and none of it adds cost or work to the v1 sensor kit.** It
expands `docs/HOME_BEACON.md` § 8 and `docs/PRODUCT_PLAN.md` § 6.

**How it was made:**
- **Research:** four researchers studied how 911 and crews handled help requests in fatal wildfires, which tools
  responders already use, why disaster registries mostly failed, and how screens hold up in chaos.
- **Checking:** each research angle was fact-checked against its sources.
- **Design:** two designers drafted the view independently, one for the command post and one for crews in the field,
  and reached the same answer.

## The short answer
**It never sends anyone a location by itself.** Nothing is pushed to a responder's phone, a dispatcher or 911. When a
partner agency opens an incident, its people can **pull** a short work list for each evacuation zone. An address
appears only if **all** of these are true:
- the household opted in to sharing it;
- the home is in a zone under an active warning or order;
- the viewer is a named account at the partner agency;
- the incident is open. Access ends automatically after 72 hours, unless the agency renews it.

Every view, print and export is logged, and the household can see who looked.

**Why pull, not push:** in every fatal fire reviewed, dispatch was already drowning:
- **Lahaina:** about 4,500 calls on all lines in one day, against about 360 911 calls on a normal day, with at most
  9 dispatchers. At one point a
  single dispatcher handled radio for 49 officers on a channel built for about 15.
- **Gatlinburg:** police took more than 600 calls, against about 150 on a normal day.

A feed that rings for every button press would add to the noise. A list they open when they're ready takes noise away.

## What makes it easier for them, not harder
1. **It takes homes off their list.**
   - "I'm OK" and "We left" presses collapse those homes into a count at the bottom, so crews can skip them.
   - "No word" homes stay listed.
   - After the fire, an opt-in "accounted for" lookup lets the missing-persons team clear names. Lahaina's list started
     with more than 3,000 names, and most of those people turned out to be safe.
2. **It's ready at the warning, not just in the middle of the fire.**
   - The most useful line is "these 6 homes in zone E005-A say they can't leave on their own". At the warning stage,
     buses, paratransit or CERT volunteers can still get there.
   - In the Camp Fire, crews reached 83% of people trapped by fire, but only 44% of people who asked for help to leave.
     Those requests lost out to life-or-death calls.
   - In Altadena, paratransit was ready at 4 a.m. but was never called.
3. **One row per home, sorted for them.**
   - **Duplicates merged:** repeat presses and relayed copies update one row ("pressed 3 times, last at 2:09").
     Hurricane Harvey's rescue requests roughly halved once duplicates were removed.
   - **Fixed sort:** needs help first, then can't leave alone, then no word.
   - **Rows never jump under your finger:** new items wait in a "2 new since you looked" strip.
4. **Their zones and their words.**
   - Rows are grouped by the agency's own evacuation zone ID (for example Genasys zones), with plain street names next
     to it.
   - Crews mark homes in the words door-to-door teams already use: out or leaving, staying, no answer, couldn't reach.
5. **It fits the tools they already use.**
   - **GIS map layer:** a secured layer (GeoJSON / OGC API) they add to their own ArcGIS map.
   - **Spreadsheet export:** a CSV file.
   - **Printed zone sheet:** for when networks fail.
   - **Our own screen** is only the fallback. After the 2025 LA fires the sheriff fell back to Microsoft Lists; in 2017
     Sonoma used a whiteboard.
6. **It's honest about what it doesn't know.**
   - **Silence shows as "unknown",** never "OK" or "missing".
   - **Two separate clocks:** "beacon last heard" and "last button press". A beacon that's off reads differently from a
     household that hasn't pressed.
   - **Every page carries a "data as of" stamp,** and the copy saved for offline use is clearly marked as old.
7. **It works with gloves, smoke and bad signal.**
   - Big buttons, at least 44 px, and 64 px for marking homes.
   - Every status is a word plus an icon, never color alone.
   - Short IDs crews can read over the radio, like "E5-07", so needs and addresses stay off open channels.
   - The phone saves taps offline and sends them when signal returns.

## The screens
1. **Incident board** (incident lead or EOC; laptop or tablet):
   - one tile per zone under warning or order, orders first, then by how many homes need help;
   - five counts per zone: needs help, can't leave alone, no word, left, done;
   - a large "data as of" stamp;
   - print all zones, and the **ride list**: everyone across all zones who can't leave alone, for buses and paratransit.
2. **Open or close an incident:** one tap when Fire Watch already has the official order for the agency's zones.
   - **Access** lasts 72 hours unless renewed.
   - **Closing** empties the feeds, locks offline copies, and reminds people to shred printouts.
3. **Zone sheet** (crew phone): sorted with help first, or in street order to walk a block.
4. **Home card:** everything needed at the door with no further taps:
   - the address with unit and floor (copy for CAD, open in Maps);
   - access notes;
   - people, needs (functional, not diagnoses), language and pets;
   - buttons to call the home or an outside contact;
   - a timeline (when pressed vs when it arrived, last heard, profile age);
   - four mark-done buttons with a 10-second undo.
5. **Printed zone sheet and ride list:**
   - black-and-white safe, 12–14 pt type;
   - checkboxes and a notes column;
   - "data as of" and "printed by" on every page;
   - "Destroy after the incident" footer.
6. **Planning view** (outside incidents): per-zone counts only, such as "14 homes say they can't leave on their own".
   Small numbers are hidden and there are no addresses. This follows the HHS emPOWER model. It's for planning buses
   and CERT before fire season.
7. **Accounted-for lookup** (missing-persons team, after the fire front): exact-address search only, plus a bulk check
   of an address list. It says "the household reported in", which is not proof everyone is safe.
8. **Who saw my info** (household, at `/my`): a plain summary per incident, from the access log.
9. **Household sharing settings** (at `/my`):
   - **Consent:** off by default, field by field.
   - **Preview:** "this is exactly what a crew would see".
   - **Freshness:** reconfirm every 6 months.
   - **Required wording:** "This does not call 911. Signing up does not guarantee rescue. Leave at the warning if you
     can. Plan to manage on your own for 72 hours."

A mockup of the incident board, the zone sheet and the home card was shown to the founder on 2026-11-26. It used
example data only.

## Confirming a request without slowing it down
- **The circle hears first:** "I need help" goes to the household's own circle first, as already decided.
- **Automatic check:** the server then tries the household phone and a second contact. The row shows how it was
  confirmed ("Confirmed by daughter 2:01") or says "Unconfirmed press".
- **Unconfirmed rows still show up at once, labeled.** Waiting can be fatal: in Altadena the address reached crews
  35 minutes after the first call.
- **The evidence behind it:** alarm companies cut false dispatches a lot by confirming before calling police.

## Things to avoid
- Paging, ringing or creating a 911/CAD incident by itself.
- Calling it a "registry". Static sign-up lists go stale, few people join, they're often unused in the event, and they
  create false expectations of rescue.
- Marking a home "OK" or "evacuated" from silence.
- Showing an "OK" from before the current order. A check-in only counts if it came after the order for that zone.
- Shared logins, or creating accounts during a fire. Partners are set up before fire season.

## Integration
- **First:** a link, the printed sheets and a CSV. Then a secured map layer for the agency's own ArcGIS.
- **Address format:** the FCC "dispatchable location" shape plus NENA field names, so it pastes into CAD.
- **Later, only with an agency that opts in:** delivery to 911 centers through an established company with human
  verification, such as RapidSOS. RapidSOS is free to agencies, but its price to us is unpublished.
- **Genasys zones:** use the agency's zone IDs. A live link to Genasys needs the agency's data agreement.

## Privacy and legal (check with a lawyer before any pilot)
- **Minimum fields:** share only what each household chose, only during a declared incident, only for active zones,
  through a written agreement (an MOU). The agreement should require deletion after the incident and say whether the
  data may go into the agency's CAD files.
- **An agency's copy may become a public record** unless state law exempts it, as Florida's registry law does. Check
  California, Colorado and New York.
- **Likely not covered:** HIPAA probably doesn't apply to us, and California's CCPA generally doesn't cover
  nonprofits.
- **Colorado's privacy law** covers nonprofits only above 100,000 Colorado consumers a year.
- **The FTC's health-breach rule** can apply to nonprofits. Whether it applies depends on whether this counts as a
  "personal health record", so ask a lawyer.
- **Gate codes** are the most sensitive field: hidden until tapped, and each reveal is logged. Founder decides.

## Cost
- **v1 sensor kit:** nothing added.
- **What it takes:** server and web work on the existing Fire Watch backend (a list page, print views, a status table,
  feeds). Its monthly cloud cost isn't estimated yet.
- **ArcGIS Online:** about $100 a year for a nonprofit, if we host layers ourselves; agencies usually use their own.
- **RapidSOS:** costs to us are unknown and need a quote.

## Founder decisions
- **#38** (new): build the partner view as designed, pull-only and per incident, for the partner pilot?
- **Household-facing wording** for the sharing settings and the beacon's order-mode prompt. The prompt would read
  "Leaving? Press I'M OK twice. Can't leave on your own? Hold I NEED HELP." That adds a recipient step.
- **"We left" as its own status** (a second press, or a phone link).
- **Gate codes:** collect them or not.
- **Planning-view counts outside incidents:** show them to partners or not.
- **Address-check tool for hotline staff:** offer it or not.
- **How long until a check-in turns into "unknown":** agree the hours with partners.
- **The data agreement:** its terms and the 72-hour default.

## Pilot tests (with one partner agency)
- **Drill with fake households:** a tabletop exercise using the "Run a drill" mode.
- **Time it:** how long it takes the incident lead to go from opening an incident to a printed ride list.
- **Measure the noise:** count presses that were false, duplicates, or resolved by the circle before reaching the
  partner. If it's noisy, responders will tune it out.
- **Ask crews:** did it save door knocks? Was anything on the card missing or not needed?

## Main sources
- **Maui Police Department,** preliminary after-action report, Maui wildfires (Jan 2024).
- **FSRI/UL,** Lahaina Fire Incident Analysis Report for the Hawaii Attorney General (2024).
- **NIST,** Camp Fire NETTRA case study (TN 2252), via its module slides: notification, evacuations, rescues.
- **LA County independent after-action review** of the Eaton and Palisades fires (2025). LAist's analysis of the Eaton
  911 calls (news).
- **The Marshall Fire, Woolsey Fire and Gatlinburg after-action reports;** Sonoma and Marin County evacuation-tag
  practice.
- **California State Auditor 2019-103;** Cal OES guidance on voluntary registries; National Council on Disability
  (2023).
- **FCC dispatchable location** (47 CFR 9.3); NENA CLDXF; WCAG 1.4.1; NIST SP 1286 (first-responder interface
  research); HHS emPOWER.
- **RapidSOS, Genasys and Esri ArcGIS** product documentation (product details change; recheck before relying on them).
