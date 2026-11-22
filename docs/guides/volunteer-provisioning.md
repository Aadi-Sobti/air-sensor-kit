# Preparing kits: packing-laptop instructions (DRAFT; M9)

Print this page and keep it next to the packing laptop. About 2 minutes per board. You never type a password or code.

## Once per laptop (the founder does this)
1. Install Python 3.12, then in the project folder:
   `python3.12 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt`
2. Put this laptop's key file in `secrets/` (the founder makes it with `python3 tools/factory_station.py new <laptop-name>`).
3. Put the release firmware file at `firmware/.pio/build/release/firmware.bin` (the founder builds it).
4. Load the printer with a sheet of 4" × 2" sticker labels (10 per sheet, 2 across; print at 100% / "actual size").

## For each board
1. Plug a **new** WiFi board into the laptop with a **data** USB cable.
2. Run: `python3 tools/provision.py`
3. Wait for a colored line (about 2 minutes):
   - **Green "DONE"**: open the PDF it names and print it. Stick **SETUP** on the front of this kit's card and
     **OWNER** on the back. Then delete the PDF (it contains private codes).
   - **Red "SET ASIDE"**: put the board in the "problem" box with a note of the message. Don't print anything.
4. Unplug the board and pack it with its card: board, air sensor, adapter, 4 wires, USB cable, box, and card.

**Never mix cards between kits.** Each card's stickers belong to exactly one board.

## Several boards at once
Plug in up to 4 boards, run `python3 tools/provision.py` once. Each board gets its own line and its own PDF.
Print each PDF on its own row of the sticker sheet (`--row 2`, `--row 3`, … to use the next empty row).

## If something goes wrong
| Message | What to do |
|---|---|
| No board found | Use a data cable (some cables only charge). Check the board's light. |
| USB port problem | Close other programs using the board (another terminal, Arduino, a browser tab), then try again. |
| flash is smaller than 4 MB | Wrong board type. Set it aside. |
| couldn't reach the server | Check the laptop's internet, then run it again for that board. |
| station key isn't accepted | Tell the founder (the laptop's key may have been revoked). |
| already used in the field / previous owner's data | A returned or used board. Set it aside for the founder. |
| The label didn't print | Run `python3 tools/provision.py --port <that board's port> --no-flash` and print the new PDF. The old card's owner code stops working, so throw the old stickers away. |
