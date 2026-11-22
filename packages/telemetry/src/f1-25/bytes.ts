// Little-endian reads over a Uint8Array, so the parsers run in Node and in the browser.

export class Bytes {
  readonly view: DataView;

  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get length(): number {
    return this.data.length;
  }

  u8 = (o: number): number => this.view.getUint8(o);
  i8 = (o: number): number => this.view.getInt8(o);
  u16 = (o: number): number => this.view.getUint16(o, true);
  u32 = (o: number): number => this.view.getUint32(o, true);
  u64 = (o: number): bigint => this.view.getBigUint64(o, true);
  f32 = (o: number): number => this.view.getFloat32(o, true);
  f64 = (o: number): number => this.view.getFloat64(o, true);

  ascii(start: number, end: number): string {
    let s = '';
    for (let i = start; i < end; i++) s += String.fromCharCode(this.data[i] ?? 0);
    return s;
  }

  utf8z(start: number, maxLen: number): string {
    const raw = this.data.subarray(start, start + maxLen);
    const zero = raw.indexOf(0);
    return new TextDecoder().decode(zero < 0 ? raw : raw.subarray(0, zero));
  }
}
