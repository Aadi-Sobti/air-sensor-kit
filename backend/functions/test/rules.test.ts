// Firestore rules: deny-by-default (backend.md -> Privacy tests).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

describe("firestore rules (emulator)", () => {
  before(async () => {
    env = await initializeTestEnvironment({
      projectId: process.env.GCLOUD_PROJECT ?? "demo-prosefire",
      firestore: {
        rules: readFileSync(resolve(__dirname, "../../../firestore.rules"), "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });

  after(async () => {
    await env?.cleanup();
  });

  for (const path of ["private_locations/esp8266-1", "devices/esp8266-1", "public_sensors/esp8266-1", "anything/x"]) {
    it(`unauthenticated client cannot read or write ${path}`, async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { a: 1 }));
    });
  }

  it("signed-in client cannot read private_locations", async () => {
    const db = env.authenticatedContext("someone").firestore();
    await assertFails(getDoc(doc(db, "private_locations/esp8266-1")));
  });
});
