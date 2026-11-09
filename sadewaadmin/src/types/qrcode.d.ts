declare module 'qrcode' {
  export interface QRCodeToCanvasOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    color?: { dark?: string; light?: string };
  }
  export function toCanvas(
    canvas: HTMLCanvasElement | string,
    text: string,
    options?: QRCodeToCanvasOptions,
  ): Promise<void>;
  const QRCode: { toCanvas: typeof toCanvas };
  export default QRCode;
}
