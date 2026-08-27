/**
 * Renders a URL as a QR code for a terminal.
 *
 * The `qrcode` package does the encoding — Reed-Solomon, masking and the format
 * words are an ISO standard nobody should reimplement — but not the drawing. Its
 * own terminal renderer has two faults that matter when the reader is a phone
 * camera at an angle:
 *
 *   - It emits a 2-module quiet zone. The specification asks for 4, and the
 *     quiet zone is what lets a scanner find the finder patterns at all.
 *   - Its last row resets to the terminal's own background and paints a white
 *     upper half-block, so when the module count is odd — and a QR is always an
 *     odd number of modules square — the bottom module row and a half take the
 *     terminal's colour. On a dark theme that is a dark band along the bottom
 *     edge, eating the quiet zone it was supposed to be drawing.
 *
 * So this asks for the module matrix and draws it: two module rows per line as
 * half-blocks, padded to an even number of rows so the last line is never a
 * half one, with the light/dark colours stated explicitly rather than inherited
 * from whatever theme the terminal happens to have.
 */
import QRCode from 'qrcode';

/** Black on white, stated outright: a QR read against a dark theme is not a QR. */
const LIGHT_ON_DARK = '\x1b[47m\x1b[30m';
const RESET = '\x1b[0m';

/** The specification's quiet zone. Four light modules on every side. */
const QUIET = 4;

/**
 * Error correction stays at level M. A terminal QR is never scuffed the way a
 * printed one is, but it is photographed handheld, at an angle, against screen
 * glare — which is the same problem from the decoder's side.
 */
export async function renderQr(url: string, small = true): Promise<string> {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const { size, data } = modules;

  // Quiet zone included, then rounded up to an even number of module rows so
  // that every output line is a full pair and none is half-drawn.
  const span = size + QUIET * 2;
  const rows = small && span % 2 !== 0 ? span + 1 : span;

  /** True where a module is dark. Everything outside the matrix is quiet zone. */
  const dark = (x: number, y: number): boolean => {
    const mx = x - QUIET;
    const my = y - QUIET;
    if (mx < 0 || my < 0 || mx >= size || my >= size) return false;
    return data[my * size + mx] === 1;
  };

  const lines: string[] = [];

  if (small) {
    // Two module rows per line. A terminal cell is about twice as tall as it is
    // wide, so one cell per module would render the code stretched to twice its
    // height — and a QR that is not square does not scan.
    for (let y = 0; y < rows; y += 2) {
      let line = '';
      for (let x = 0; x < span; x++) {
        const top = dark(x, y);
        const bottom = dark(x, y + 1);
        line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
      }
      lines.push(`${LIGHT_ON_DARK}${line}${RESET}`);
    }
  } else {
    // One line per module row, two characters wide, so the code stays square
    // without half-blocks. Larger, and the fallback for terminals or fonts that
    // render half-blocks with a seam a camera reads as a broken module.
    for (let y = 0; y < span; y++) {
      let line = '';
      for (let x = 0; x < span; x++) line += dark(x, y) ? '██' : '  ';
      lines.push(`${LIGHT_ON_DARK}${line}${RESET}`);
    }
  }

  return lines.join('\n');
}
