// Every user-facing string lives here (EN + ES from day one). No hard-coded strings in pages.
// Wording source of truth: docs/USER_FLOW.md. Spanish needs review by a native speaker before launch.
export const LANGS = ["en", "es"] as const;
export type Lang = (typeof LANGS)[number];

export const STRINGS = {
  en: {
    "site.title": "ProseFire air sensors",
    "site.comingSoon": "Our community air map is coming soon.",
    "safety.notSmokeAlarm":
      "This is not a smoke alarm. It does not replace official warnings or evacuation orders.",
    "census.notice": "This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.",

    "setup.pageTitle": "Set up your sensor · ProseFire",
    "claim.pageTitle": "Finish setup · ProseFire",
    "setup.title": "Set up your air sensor",
    "setup.intro": "Plug the sensor into this computer with the USB cable from the kit. The small blue light blinks slowly.",
    "setup.connect": "Connect my sensor",
    "setup.pickerHint": "In the pop-up, click the one item listed, then click Connect.",
    "setup.connecting": "Talking to your sensor…",
    "setup.unsupported.title": "This browser can't talk to the sensor",
    "setup.unsupported.body": "Open this page in Chrome or Edge on a computer. Or use your phone instead:",
    "setup.phone.step1": "Put the sensor in its spot and plug it into a phone charger in the wall.",
    "setup.phone.step2": "Open your phone's camera, point it at the QR sticker on your card, and tap Join.",
    "setup.phone.step3": "A setup page opens by itself. Follow the steps there.",
    "setup.wifi.title": "Pick your WiFi",
    "setup.wifi.scanning": "Looking for WiFi networks…",
    "setup.wifi.other": "My WiFi isn't listed",
    "setup.wifi.name": "WiFi name",
    "setup.wifi.password": "WiFi password",
    "setup.wifi.show": "Show password",
    "setup.wifi.open": "open",
    "setup.wifi.hint": "If your WiFi name ends in \"5G\", pick the other one. WiFi that makes you log in on a web page won't work.",
    "setup.next": "Next",
    "setup.testing": "Connecting to your WiFi… This takes about 20 seconds.",
    "setup.connected": "Connected!",
    "setup.goingOn": "One more step…",
    "setup.err.badPassword": "That password didn't work. Try again. Capital letters matter.",
    "setup.err.timeout": "Your WiFi didn't answer. Make sure it's 2.4 GHz WiFi (most home WiFi is) and the sensor is close to your router.",
    "setup.err.noPick": "Nothing was picked. Click Connect my sensor and choose the item in the list.",
    "setup.err.emptyPicker": "Nothing in the list? Use the USB cable from the kit (some cables only charge). Close other programs using the sensor.",
    "setup.err.busy": "Another program or tab is using the sensor. Close it, then try again.",
    "setup.err.noAnswer": "The sensor didn't answer. Unplug it, plug it back in, and try again.",
    "setup.err.noNetworks": "No WiFi found. Move the sensor closer to your router, or type your WiFi name.",
    "setup.err.needName": "Type your WiFi name.",
    "setup.retry": "Try again",

    "claim.title": "Where is your sensor?",
    "claim.address": "Street address",
    "claim.addressHint": "Like 123 Main St, Apt 4. Only you and the project team can see your address. The public map only shows your block.",
    "claim.zip": "ZIP code",
    "claim.where": "Where will it go?",
    "claim.outside": "Outside",
    "claim.inside": "Inside",
    "claim.finish": "Finish",
    "claim.waiting": "Connecting your sensor… This can take up to 2 minutes.",
    "claim.done": "You're all set!",
    "claim.firstReading": "First reading: {value} µg/m³ of fine particles (PM2.5).",
    "claim.noReadingYet": "Your sensor is connected. Its first reading will show up in a few minutes.",
    "claim.nextSteps": "Unplug it, close the lid, put it in its spot, and plug it into a phone charger in the wall.",
    "claim.err.badLink": "This setup link is missing information. Plug in the sensor and go to the setup page again.",
    "claim.err.notYet": "We haven't heard from your sensor yet. Check that it's still plugged in, then click Finish again.",
    "claim.err.address": "We couldn't find that address. Check the street and ZIP code.",
    "claim.err.zip": "Type a 5-digit ZIP code.",
    "claim.err.expired": "This setup link is too old. Plug in the sensor and go to the setup page again.",
    "claim.err.tooMany": "Too many tries. Wait a few minutes, then try again.",
    "claim.err.network": "No internet connection? Check it and try again.",
    "claim.setupAgain": "Go to the setup page",
  },
  es: {
    "site.title": "Sensores de aire ProseFire",
    "site.comingSoon": "Nuestro mapa comunitario del aire llegará pronto.",
    "safety.notSmokeAlarm":
      "Esto no es una alarma de humo. No reemplaza los avisos oficiales ni las órdenes de evacuación.",
    // Kept verbatim in English: it is the attribution notice the Census Bureau terms ask for.
    "census.notice": "This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.",

    "setup.pageTitle": "Configura tu sensor · ProseFire",
    "claim.pageTitle": "Termina la configuración · ProseFire",
    "setup.title": "Configura tu sensor de aire",
    "setup.intro": "Conecta el sensor a esta computadora con el cable USB del kit. La lucecita azul parpadea despacio.",
    "setup.connect": "Conectar mi sensor",
    "setup.pickerHint": "En la ventana que aparece, haz clic en el único elemento de la lista y luego en Conectar.",
    "setup.connecting": "Hablando con tu sensor…",
    "setup.unsupported.title": "Este navegador no puede hablar con el sensor",
    "setup.unsupported.body": "Abre esta página en Chrome o Edge en una computadora. O usa tu teléfono:",
    "setup.phone.step1": "Pon el sensor en su lugar y conéctalo a un cargador de teléfono en la pared.",
    "setup.phone.step2": "Abre la cámara del teléfono, apunta al código QR de tu tarjeta y toca Unirse.",
    "setup.phone.step3": "Se abre una página de configuración. Sigue los pasos.",
    "setup.wifi.title": "Elige tu WiFi",
    "setup.wifi.scanning": "Buscando redes WiFi…",
    "setup.wifi.other": "Mi WiFi no aparece",
    "setup.wifi.name": "Nombre del WiFi",
    "setup.wifi.password": "Contraseña del WiFi",
    "setup.wifi.show": "Mostrar contraseña",
    "setup.wifi.open": "abierta",
    "setup.wifi.hint": "Si el nombre de tu WiFi termina en \"5G\", elige el otro. Las redes que piden iniciar sesión en una página web no funcionan.",
    "setup.next": "Siguiente",
    "setup.testing": "Conectando a tu WiFi… Tarda unos 20 segundos.",
    "setup.connected": "¡Conectado!",
    "setup.goingOn": "Un paso más…",
    "setup.err.badPassword": "Esa contraseña no funcionó. Inténtalo otra vez. Las mayúsculas importan.",
    "setup.err.timeout": "Tu WiFi no respondió. Asegúrate de que sea WiFi de 2.4 GHz (casi todos en casa lo son) y de que el sensor esté cerca del router.",
    "setup.err.noPick": "No elegiste nada. Haz clic en Conectar mi sensor y elige el elemento de la lista.",
    "setup.err.emptyPicker": "¿La lista está vacía? Usa el cable USB del kit (algunos cables solo cargan). Cierra otros programas que usen el sensor.",
    "setup.err.busy": "Otro programa o pestaña está usando el sensor. Ciérralo e inténtalo otra vez.",
    "setup.err.noAnswer": "El sensor no respondió. Desconéctalo, vuelve a conectarlo e inténtalo otra vez.",
    "setup.err.noNetworks": "No se encontró WiFi. Acerca el sensor al router o escribe el nombre de tu WiFi.",
    "setup.err.needName": "Escribe el nombre de tu WiFi.",
    "setup.retry": "Intentar otra vez",

    "claim.title": "¿Dónde está tu sensor?",
    "claim.address": "Dirección",
    "claim.addressHint": "Por ejemplo: 123 Main St, Apt 4. Solo tú y el equipo del proyecto pueden ver tu dirección. El mapa público solo muestra tu cuadra.",
    "claim.zip": "Código postal",
    "claim.where": "¿Dónde va a estar?",
    "claim.outside": "Afuera",
    "claim.inside": "Adentro",
    "claim.finish": "Terminar",
    "claim.waiting": "Conectando tu sensor… Puede tardar hasta 2 minutos.",
    "claim.done": "¡Todo listo!",
    "claim.firstReading": "Primera lectura: {value} µg/m³ de partículas finas (PM2.5).",
    "claim.noReadingYet": "Tu sensor está conectado. Su primera lectura aparecerá en unos minutos.",
    "claim.nextSteps": "Desconéctalo, cierra la tapa, ponlo en su lugar y conéctalo a un cargador de teléfono en la pared.",
    "claim.err.badLink": "A este enlace le falta información. Conecta el sensor y vuelve a la página de configuración.",
    "claim.err.notYet": "Todavía no sabemos nada de tu sensor. Revisa que siga conectado y haz clic en Terminar otra vez.",
    "claim.err.address": "No encontramos esa dirección. Revisa la calle y el código postal.",
    "claim.err.zip": "Escribe un código postal de 5 dígitos.",
    "claim.err.expired": "Este enlace ya es muy viejo. Conecta el sensor y vuelve a la página de configuración.",
    "claim.err.tooMany": "Demasiados intentos. Espera unos minutos e inténtalo otra vez.",
    "claim.err.network": "¿No hay internet? Revísalo e inténtalo otra vez.",
    "claim.setupAgain": "Ir a la página de configuración",
  },
} as const satisfies Record<Lang, Record<string, string>>;

export type Key = keyof (typeof STRINGS)["en"];

export function pickLang(navLangs: readonly string[]): Lang {
  for (const l of navLangs) {
    const base = l.toLowerCase().split("-")[0];
    if ((LANGS as readonly string[]).includes(base)) return base as Lang;
  }
  return "en";
}

export function t(lang: Lang, key: Key, vars: Record<string, string> = {}): string {
  let s: string = STRINGS[lang][key] ?? STRINGS.en[key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

/** Sets the page language and fills every [data-i18n] element. Returns the language. */
export function applyI18n(doc: Document = document): Lang {
  const lang = pickLang(navigator.languages ?? [navigator.language]);
  doc.documentElement.lang = lang;
  doc.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(lang, el.dataset.i18n as Key);
  });
  return lang;
}
