# Instruction card (DRAFT for founder approval: M10)

Source of truth: `docs/USER_FLOW.md`. This file is only the printed wording. `<site>` = the project's domain (TBD).
The two per-kit stickers (SETUP, OWNER) come from `tools/provision.py`; the card has a blank spot for each.
Spanish needs a native speaker's review before printing. Wire colors wait on decision #2.

Changes vs USER_FLOW (need approval):
- Phone step 3 adds a fallback for the founder's 2026-11-22 iPhone run, where the page didn't open by itself:
  "If no page opens, open your web browser and go to any website."

---

## FRONT: Set up your air sensor

**[ SETUP sticker here ]**

**1. Build (10 min, no tools)**
1. Plug the sensor's cable into the small adapter board. It only fits one way.
2. Connect the 4 wires, matching colors: **VCC → VIN** (red) · **GND → G** (black) · **TXD → D1** · **RXD → D2**.
3. Put the parts in the box, USB cable through the hole. Leave the lid open.

**2. Connect it to your WiFi (3 min). Pick ONE:**

**With a computer (Chrome or Edge):** plug the USB cable into the computer → go to **<site>/setup** →
click **Connect my sensor** and follow the page.

**With a phone:** plug the sensor into a phone charger → point your camera at the **SETUP** sticker → tap **Join** →
a setup page opens. Pick your WiFi, type its password and your address, tap **Connect**.
If no page opens, open your web browser and go to any website.

**3. Done!** Close the lid and plug it into a wall charger outside (or inside). A quick blink every few seconds means
it's working. Your readings: **<site>/s/<your sensor code>** (on the sticker).

*This is not a smoke alarm. It does not replace official warnings or evacuation orders.*

---

## BACK: Keep this card

**[ OWNER sticker here ]**

Scan the code to check on your sensor, see its readings, get a notice if it goes offline, or delete your data.
Tap **Add to Home Screen** to keep it like an app. No account needed. **Keep this code private.**

**If something goes wrong**
- **No light:** try another charger or USB port.
- **Computer: nothing in the pop-up:** use the kit's USB cable (some cables only charge); close other programs.
- **Phone: setup page doesn't open:** in WiFi settings, pick the network on the SETUP sticker; then open your browser.
  Still nothing? Turn off mobile data for a minute.
- **Your WiFi isn't listed:** move closer to the router. If its name ends in "5G", pick the other one.
- **"That password didn't work":** retype it. Capital letters matter.
- **Light double-blinks later:** your WiFi or internet is down. It reconnects by itself.
- **Moving or new WiFi:** do step 2 again. With a phone, first hold the board's FLASH button for 5 seconds.
- **Lost this card:** plug the sensor into a computer, go to <site>/setup, and choose **Get a new owner code**.

---

## FRENTE: Configura tu sensor de aire (revisión pendiente)

**[ etiqueta SETUP aquí ]**

**1. Ármalo (10 min, sin herramientas)**
1. Conecta el cable del sensor a la placa adaptadora pequeña. Solo entra de una manera.
2. Conecta los 4 cables según los colores: **VCC → VIN** (rojo) · **GND → G** (negro) · **TXD → D1** · **RXD → D2**.
3. Pon las piezas en la caja, con el cable USB por el agujero. Deja la tapa abierta.

**2. Conéctalo a tu WiFi (3 min). Elige UNA opción:**

**Con una computadora (Chrome o Edge):** conecta el cable USB a la computadora → ve a **<site>/setup** →
haz clic en **Conectar mi sensor** y sigue la página.

**Con un teléfono:** conecta el sensor a un cargador → apunta la cámara a la etiqueta **SETUP** → toca **Unirse** →
se abre una página. Elige tu WiFi, escribe su contraseña y tu dirección, y toca **Conectar**.
Si no se abre ninguna página, abre tu navegador y entra a cualquier sitio web.

**3. ¡Listo!** Cierra la tapa y conéctalo a un cargador de pared. Un parpadeo corto cada pocos segundos significa que
funciona. Tus lecturas: **<site>/s/<código de tu sensor>** (en la etiqueta).

*Esto no es una alarma de humo. No reemplaza los avisos oficiales ni las órdenes de evacuación.*

## REVERSO: Guarda esta tarjeta

**[ etiqueta OWNER aquí ]**

Escanea el código para ver tu sensor y sus lecturas, recibir un aviso si se desconecta o borrar tus datos.
Toca **Agregar a pantalla de inicio** para tenerlo como una app. No necesitas cuenta. **Mantén este código en privado.**
