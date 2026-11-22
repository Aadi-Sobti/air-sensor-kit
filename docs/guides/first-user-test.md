# First-time-user test (M10): how to run it

**Goal (PLAN.md M10 "Done when"):** at least 3 people who have never seen the kit build it and set it up **alone**,
**without scanning the wrong QR code**, and can find their sensor afterward on `/my`. Then we fix the top issues.

## Before the tests (founder)
- [ ] One kit per tester, prepared with `tools/provision.py` (both stickers on the card). Reuse kits between testers
      only after a FLASH long-press + re-provisioning, so each person starts from a fresh, unconfigured sensor.
- [ ] Mix of kit versions if #12 is still open: at least one "separate parts" kit.
- [ ] Mix of paths: at least one person with a computer (Chrome/Edge), at least one with a phone only. Ideally one
      iPhone and one Android user, and one Spanish speaker using the Spanish card and guide.
- [ ] Testers who fit the recipients: no electronics experience; ideally not tech-savvy.
- [ ] A home-like setting with 2.4 GHz WiFi you know the password for (the tester types it, as a recipient would).
- [ ] Print this page's observation sheet (one per tester) and the card draft (`docs/guides/card.md`).
- [ ] Optional: ask the tester if you may film their hands (no faces, no screens with passwords).

## During the test (observer)
Say only: "Please build and set up this air sensor using the card. Think out loud. I can't help, but you can stop
any time." Then **stay silent**. Don't point, don't explain, don't help unless something could break or the tester
asks to stop. Note the time at each milestone and every hesitation.

If the tester is stuck for more than 3 minutes, give the smallest hint you can, and write down exactly what you said.
A test that needed a hint counts as "not alone" for that step.

## Observation sheet (one per tester)
Tester # ____  · Path: computer / phone · Phone: iPhone / Android / – · Language: EN / ES · Kit: parts / pre-wired / built

| Milestone | Time (mm:ss) | Alone? | Notes (what they did, said, re-read, got wrong) |
|---|---|---|---|
| Opened the box, started reading the card | | | |
| Sensor cable into adapter | | | |
| 4 wires on the adapter (if needed) | | | |
| 4 wires on the WiFi board (colors right?) | | | |
| Light on (plugged in) | | | |
| Found the setup method (computer / phone) | | | |
| **Scanned the right QR** (SETUP for phone setup; OWNER only at the end) | | | Wrong one scanned? Y / N |
| Picked WiFi + typed password | | | Wrong password first? Y / N |
| Address + Outside/Inside | | | |
| "Connected!" / "You're all set!" | | | |
| Found their sensor on `/my` (OWNER sticker or typed code) | | | |
| Total build time (target ~10 min) | | | |
| Total setup time (target ~3 min) | | | |

**After the test, ask:** What was the most confusing moment? What did you expect to happen that didn't? Was any
word on the card or page unclear? Would you know what to do if the light double-blinks?

## After all tests (founder → agent)
Send the sheets (photos are fine) to the agent. The agent records results in PLAN.md M10, lists the top issues by
how many testers hit them, and proposes fixes (card wording, guide, setup pages). Wording changes need your approval.

**Privacy:** testers' addresses go into the system like any recipient's. If a tester doesn't want that, use the
FLASH long-press + "Delete my data" on `/my` after the test, or give them a public place's address (e.g. a library).
