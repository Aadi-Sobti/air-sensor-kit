// Minimal Web Serial typings (Chrome/Edge on desktop). https://wicg.github.io/serial/
interface SerialPortFilter { usbVendorId?: number; usbProductId?: number }
interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
}
interface Serial { requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort> }
interface Navigator { readonly serial?: Serial }
