// Web Serial transport for the Improv client. Always close() it: a held port blocks flashing tools and tabs.
import type { Transport } from "./improvClient";

// USB-serial chips found on NodeMCU boards (decision 2026-11-21): CH340 (WCH), FTDI, CP210x (Silicon Labs).
export const USB_FILTERS: SerialPortFilter[] = [{ usbVendorId: 0x1a86 }, { usbVendorId: 0x0403 }, { usbVendorId: 0x10c4 }];

export class SerialTransport implements Transport {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor(private port: SerialPort) {}

  async open(): Promise<void> {
    await this.port.open({ baudRate: 115200 });
    // Opening can reset the NodeMCU through DTR/RTS; set both explicitly, then let it boot (~2 s).
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 2000));
    this.reader = this.port.readable!.getReader();
    this.writer = this.port.writable!.getWriter();
  }

  async write(bytes: Uint8Array): Promise<void> {
    await this.writer!.write(bytes);
  }

  async read(): Promise<Uint8Array | null> {
    if (!this.reader) return null;
    const { value, done } = await this.reader.read();
    return done ? null : value ?? new Uint8Array();
  }

  async close(): Promise<void> {
    try { await this.reader?.cancel(); } catch { /* already closed */ }
    try { this.reader?.releaseLock(); } catch { /* ignore */ }
    try { this.writer?.releaseLock(); } catch { /* ignore */ }
    this.reader = null;
    this.writer = null;
    try { await this.port.close(); } catch { /* ignore */ }
  }
}
