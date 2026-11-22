# User flow: exactly what people do

This is the UX spec. Firmware, web pages, and printed guides must match it word for word in meaning.
Changes need founder approval. `<site>` = the project's domain (TBD). `[color]` = wire colors (decision #2).

## Recipient (no tech knowledge assumed)

**In the box:** air sensor (blue box) with its cable · small adapter board · WiFi board · 4 colored wires ·
USB cable · weatherproof box + tubing · instruction card. **Front:** setup steps + the setup QR sticker + the
sensor's code (e.g. `K7Q2MX`). **Back:** "Keep this card": the **Manage my sensor** QR + the private owner code
(e.g. `7KQ2-MX4P-R9`) + troubleshooting.
**They need:** home WiFi (2.4 GHz, like almost every home router) and either a computer with Chrome or
Edge, or any smartphone. A phone charger plug for the final spot (decision #11).

### Part 1: Build (~10 min, no tools, no soldering)
1. Plug the sensor's cable into the adapter board. It only fits one way, so don't force it.
2. Connect the 4 wires from the adapter to the WiFi board, matching the colors on the card:
   **VCC → VIN** [red] · **GND → G** [black] · **TXD → D1** [color] · **RXD → D2** [color].
3. Put the parts in the box with the USB cable coming out through the hole. Leave the lid open for now
   so you can see the small blue light.

### Part 2: Set up (~3 min). Pick ONE

**A. With a computer (Chrome or Edge)**
1. Plug the USB cable into the computer. The small blue light blinks slowly.
2. Go to **`<site>/setup`**.
3. Click **Connect my sensor**. In the pop-up, click the one item listed, then **Connect**.
4. Pick your WiFi and type its password. Click **Next**. After about 20 seconds you'll see **Connected!**
5. Type your address (or tap your home on the map) and choose **Outside** or **Inside**. Click **Finish**.
   You'll see your sensor's first reading.
6. Unplug it, close the lid, put it in its spot, and plug it into a phone charger in the wall.

**B. With a phone (any phone, no app)**
1. Put the sensor in its spot and plug it into a phone charger in the wall. The light blinks slowly.
2. Open your phone's camera, point it at the QR sticker, and tap **Join**.
3. A setup page opens by itself. Pick your WiFi, type its password, type your address, and choose
   **Outside** or **Inside**. Tap **Connect**.
4. After about 20 seconds you'll see **You're all set!** Close the lid.

### Part 3: Done
- A quick blink every few seconds means it's working (decision #3).
- See your air any time at **`<site>/s/<your code>`** (printed on the card). It appears on the public map,
  rounded to your block, within about 10 minutes.
- **Check on or manage your sensor:** scan the **Manage my sensor** QR on the back of the card (or go to
  `<site>/my` and type the owner code). You'll see whether it's working, its readings over time, and its WiFi
  signal. You can rename it, mark it inside/outside, update its address, turn on "tell me if it goes offline",
  or delete your data. Tap **Add to Home Screen** to keep it like an app. No account needed.
- **Later: Fire Watch.** When linking is available, open Fire Watch → *Add my air sensor* → scan the same
  Manage QR. (Phase 3; nothing to do now.)
- Never needed: installing software, creating an account, filling out a form, or writing down an ID.
- Shown during setup (both paths): "Your sensor's readings (never your address) appear on our public map and are
  shared as open data with Sensor.Community." (founder decision 2026-11-22)
- **Moving or new WiFi?** Do Part 2 again. With a computer, just plug in and go to `<site>/setup`.
  With a phone, first hold the board's **FLASH** button for 5 seconds while it's running (the light starts blinking slowly).

### If something goes wrong (printed on the card's back)
| What you see | What to do |
|---|---|
| No light at all | Try another phone charger or USB port. If you held FLASH while plugging in, unplug and replug. |
| (Computer) nothing in the pop-up | Use the USB cable from the kit (some cables only charge). Close other programs using the sensor. On some Windows computers, wait a minute for Windows to set up the device. |
| (Computer) the page says your browser won't work | Open the page in Chrome or Edge, or use the phone method. |
| (Phone) setup page doesn't open | Open your phone's WiFi settings and pick `<Prefix>-Setup-<code>`. If it still doesn't open, turn off mobile data for a minute. |
| Your WiFi isn't in the list | Move closer to the router. If your WiFi name ends in "5G", pick the other one. WiFi that makes you log in on a web page (some apartments, schools) won't work. |
| "That password didn't work" | Retype it. Capital letters matter. |
| Light double-blinks later | The sensor lost WiFi or internet. Check your router; it reconnects by itself. |
| Lost the card / owner code | Plug the sensor into a computer, go to `<site>/setup`, and choose **Get a new owner code**. The old code stops working. |
| Still stuck | Contact info on the card. |

## Volunteer: preparing kits (before shipping)
1. Plug a bare WiFi board into the provisioning laptop with a data cable.
2. The provisioning tool flashes, registers, and prints **two labels** automatically (~2 min): SETUP (front of
   card) and OWNER (back of card). Green = done, red = set the board aside.
3. Stick both labels on that kit's card, and pack the board, sensor, adapter, wires, cable, box, and card together.
Boards must be flashed **before** packing. Both labels belong to exactly one board, so never mix cards between kits.

## Founder: ongoing
- Watch the dashboard for offline sensors. Approve software updates (they roll out over WiFi; nothing to collect).
