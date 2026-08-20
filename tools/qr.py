#!/usr/bin/env python3
"""
Dependency-free QR code generator — prints a scannable code to the terminal.

    ./qr.py "http://192.168.0.30:8000/aphelion.html"
    ./qr.py --big URL          # 2 chars per module (bigger, basic ANSI colours)
    ./qr.py --svg out.svg URL  # also write an SVG you can open full-screen

Byte mode, error-correction level M, versions 1-10 (up to 216 bytes) — plenty
for a LAN URL. No pip install, no network round-trip to a QR web service.

Implements ISO/IEC 18004: Reed-Solomon over GF(256), the eight mask patterns
with the standard penalty scoring, and BCH-protected format/version info.
"""

import sys

# --- GF(256) arithmetic, primitive polynomial 0x11D --------------------------
EXP = [0] * 512
LOG = [0] * 256
_x = 1
for _i in range(255):
    EXP[_i] = _x
    LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    EXP[_i] = EXP[_i - 255]


def gf_mul(a, b):
    if a == 0 or b == 0:
        return 0
    return EXP[LOG[a] + LOG[b]]


def rs_generator(n):
    """Generator polynomial for n EC codewords, highest degree first."""
    g = [1]
    for i in range(n):
        ng = [0] * (len(g) + 1)
        for j, c in enumerate(g):
            ng[j] ^= c                      # c * x
            ng[j + 1] ^= gf_mul(c, EXP[i])  # c * alpha^i
        g = ng
    return g


def rs_encode(data, n):
    gen = rs_generator(n)
    res = list(data) + [0] * n
    for i in range(len(data)):
        coef = res[i]
        if coef:
            for j in range(1, len(gen)):
                res[i + j] ^= gf_mul(gen[j], coef)
    return res[len(data):]


# --- Version tables ----------------------------------------------------------
# (ec_codewords_per_block, g1_blocks, g1_data, g2_blocks, g2_data) per version.
EC_TABLE = {
    'L': {1: (7, 1, 19, 0, 0), 2: (10, 1, 34, 0, 0), 3: (15, 1, 55, 0, 0),
          4: (20, 1, 80, 0, 0), 5: (26, 1, 108, 0, 0), 6: (18, 2, 68, 0, 0),
          7: (20, 2, 78, 0, 0), 8: (24, 2, 97, 0, 0), 9: (30, 2, 116, 0, 0),
          10: (18, 2, 68, 2, 69)},
    'M': {1: (10, 1, 16, 0, 0), 2: (16, 1, 28, 0, 0), 3: (26, 1, 44, 0, 0),
          4: (18, 2, 32, 0, 0), 5: (24, 2, 43, 0, 0), 6: (16, 4, 27, 0, 0),
          7: (18, 4, 31, 0, 0), 8: (22, 2, 38, 2, 39), 9: (22, 3, 36, 2, 37),
          10: (26, 4, 43, 1, 44)},
}
ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
         7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]}
# Remainder bits appended after the interleaved codewords.
REMAINDER = {1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0}
EC_BITS = {'L': 0b01, 'M': 0b00, 'Q': 0b11, 'H': 0b10}


def data_capacity(version, ec):
    ecw, g1, d1, g2, d2 = EC_TABLE[ec][version]
    return g1 * d1 + g2 * d2


def count_bits(version):
    """Byte-mode character-count indicator width: 8 bits for v1-9, 16 for v10+."""
    return 8 if version <= 9 else 16


def pick_version(nbytes, ec):
    for v in range(1, 11):
        # 4 mode bits + length indicator + payload must fit the data capacity
        if 4 + count_bits(v) + nbytes * 8 <= data_capacity(v, ec) * 8:
            return v
    raise ValueError("payload too long for versions 1-10 (max %d bytes)"
                     % ((data_capacity(10, ec) * 8 - 4 - 16) // 8))


# --- Bitstream ---------------------------------------------------------------
def build_codewords(data, version, ec):
    cap_bits = data_capacity(version, ec) * 8
    bits = []

    def put(val, n):
        for i in range(n - 1, -1, -1):
            bits.append((val >> i) & 1)

    put(0b0100, 4)                          # byte mode
    put(len(data), count_bits(version))     # character count indicator
    for b in data:
        put(b, 8)

    put(0, min(4, cap_bits - len(bits)))        # terminator
    while len(bits) % 8:                        # pad to a byte boundary
        bits.append(0)
    codewords = [int(''.join(map(str, bits[i:i + 8])), 2)
                 for i in range(0, len(bits), 8)]
    pads = [0xEC, 0x11]                         # alternate, always starting 0xEC
    p = 0
    while len(codewords) < data_capacity(version, ec):
        codewords.append(pads[p % 2])
        p += 1

    # split into blocks, compute EC per block, then interleave
    ecw, g1, d1, g2, d2 = EC_TABLE[ec][version]
    blocks, pos = [], 0
    for _ in range(g1):
        blocks.append(codewords[pos:pos + d1]); pos += d1
    for _ in range(g2):
        blocks.append(codewords[pos:pos + d2]); pos += d2
    ecblocks = [rs_encode(b, ecw) for b in blocks]

    out = []
    for i in range(max(len(b) for b in blocks)):
        for b in blocks:
            if i < len(b):
                out.append(b[i])
    for i in range(ecw):
        for b in ecblocks:
            out.append(b[i])

    stream = []
    for cw in out:
        for i in range(7, -1, -1):
            stream.append((cw >> i) & 1)
    stream.extend([0] * REMAINDER[version])
    return stream


# --- Matrix ------------------------------------------------------------------
def build_matrix(version):
    """Returns (modules, is_function) with all function patterns placed."""
    size = 4 * version + 17
    m = [[0] * size for _ in range(size)]
    f = [[False] * size for _ in range(size)]

    def finder(r0, c0):
        for r in range(-1, 8):
            for c in range(-1, 8):
                rr, cc = r0 + r, c0 + c
                if not (0 <= rr < size and 0 <= cc < size):
                    continue
                inner = (0 <= r < 7 and 0 <= c < 7)
                dark = inner and (
                    r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4))
                m[rr][cc] = 1 if dark else 0
                f[rr][cc] = True

    finder(0, 0)
    finder(0, size - 7)
    finder(size - 7, 0)

    for i in range(size):                       # timing patterns
        if not f[6][i]:
            m[6][i] = 1 if i % 2 == 0 else 0
            f[6][i] = True
        if not f[i][6]:
            m[i][6] = 1 if i % 2 == 0 else 0
            f[i][6] = True

    centers = ALIGN[version]                    # alignment patterns
    last = centers[-1] if centers else 0
    for r in centers:
        for c in centers:
            if (r, c) in ((6, 6), (6, last), (last, 6)):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    m[r + dr][c + dc] = 1 if (
                        max(abs(dr), abs(dc)) != 1) else 0
                    f[r + dr][c + dc] = True

    m[size - 8][8] = 1                          # dark module
    f[size - 8][8] = True

    for i in range(9):                          # reserve format info
        if not f[8][i]:
            f[8][i] = True
        if not f[i][8]:
            f[i][8] = True
    for i in range(8):
        f[8][size - 1 - i] = True
        f[size - 1 - i][8] = True

    if version >= 7:                            # reserve version info
        for i in range(18):
            a, b = i // 3, i % 3
            f[a][size - 11 + b] = True
            f[size - 11 + b][a] = True
    return m, f, size


def place_data(m, f, size, stream):
    i = 0
    upward = True
    col = size - 1
    while col >= 1:
        if col == 6:
            col -= 1
        rows = range(size - 1, -1, -1) if upward else range(size)
        for row in rows:
            for c in (col, col - 1):
                if not f[row][c]:
                    m[row][c] = stream[i] if i < len(stream) else 0
                    i += 1
        upward = not upward
        col -= 2


MASKS = [
    lambda r, c: (r + c) % 2 == 0,
    lambda r, c: r % 2 == 0,
    lambda r, c: c % 3 == 0,
    lambda r, c: (r + c) % 3 == 0,
    lambda r, c: (r // 2 + c // 3) % 2 == 0,
    lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
    lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
    lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
]


_N3_PATTERN = bytearray((1, 0, 1, 1, 1, 0, 1))


def _n3_line(seq, size):
    """N3: the 1:1:3:1:1 dark/light pattern with a 4-module light run on either
    side. The light run may be TRUNCATED by the edge of the symbol — a pattern
    flush against the border still counts. Missing that was silently
    under-penalising edge-heavy masks (notably mask 2's vertical stripes)."""
    total = 0
    idx = seq.find(_N3_PATTERN)
    while idx != -1:
        offset = idx + 7
        if idx in (0, size - 7) \
                or not any(seq[max(idx - 4, 0):min(idx, size)]) \
                or not any(seq[max(offset, 0):min(offset + 4, size)]):
            total += 40
        else:
            # Overlapping match: the next possible start is 4 modules along.
            offset = idx + 4
        idx = seq.find(_N3_PATTERN, offset)
    return total


def penalty(m, size):
    """ISO/IEC 18004 section 7.8.3, Table 11: N1=3, N2=3, N3=40, N4=10."""
    n1 = n2 = n3 = 0
    dark = 0
    rng = range(size)
    last_row = None
    col = bytearray(size)
    for i in rng:
        row = m[i]
        row_prev = col_prev = -1
        run_row = run_col = 0
        for j in rng:
            rb = row[j]
            cb = m[j][i]
            col[j] = cb
            dark += rb
            # N1, row-wise and column-wise
            if rb == row_prev:
                run_row += 1
            else:
                if run_row >= 5:
                    n1 += run_row - 2
                run_row = 1
            if cb == col_prev:
                run_col += 1
            else:
                if run_col >= 5:
                    n1 += run_col - 2
                run_col = 1
            # N2, 2x2 blocks of one colour
            if last_row and j and rb == row_prev == last_row[j] == last_row[j - 1]:
                n2 += 3
            row_prev, col_prev = rb, cb
        last_row = row
        if run_row >= 5:
            n1 += run_row - 2
        if run_col >= 5:
            n1 += run_col - 2
        # N3, over this row and this column
        n3 += _n3_line(bytearray(row), size)
        n3 += _n3_line(col, size)
    # N4, proportion of dark modules
    pct = float(dark) / (size * size)
    n4 = 10 * int(abs(pct * 100 - 50) / 5)
    return n1 + n2 + n3 + n4


def format_bits(ec, mask):
    data = (EC_BITS[ec] << 3) | mask
    rem = data << 10
    for i in range(4, -1, -1):
        if rem & (1 << (i + 10)):
            rem ^= 0x537 << i
    return ((data << 10) | rem) ^ 0x5412


def version_bits(version):
    rem = version << 12
    for i in range(5, -1, -1):
        if rem & (1 << (i + 12)):
            rem ^= 0x1F25 << i
    return (version << 12) | rem


def place_version(m, size, version):
    """Version information (versions 7+): the 18-bit BCH word in two 6x3 blocks.

    `version_bits()` existed but was never called, so v7+ symbols reserved this
    area and left it blank — unscannable by a spec-compliant reader. Versions 1-6
    carry no version block, so this is a no-op for them and cannot change any
    output this project actually produces (a LAN URL is version 2).
    """
    if version < 7:
        return
    bits = version_bits(version)
    for i in range(18):
        b = (bits >> i) & 1
        a, c = i // 3, i % 3
        m[a][size - 11 + c] = b
        m[size - 11 + c][a] = b


def place_format(m, size, ec, mask):
    fmt = format_bits(ec, mask)
    for i in range(15):
        # i counts along the placement path, which runs MSB (bit 14) first.
        b = (fmt >> (14 - i)) & 1
        if i < 6:
            m[8][i] = b
        elif i == 6:
            m[8][7] = b
        elif i == 7:
            m[8][8] = b
        elif i == 8:
            m[7][8] = b
        else:
            m[14 - i][8] = b
        if i < 7:
            m[size - 1 - i][8] = b
        else:
            m[8][size - 15 + i] = b
    m[size - 8][8] = 1


def encode(text, ec='M'):
    data = text.encode('utf-8')
    version = pick_version(len(data), ec)
    stream = build_codewords(data, version, ec)
    m, f, size = build_matrix(version)
    place_data(m, f, size, stream)

    best, best_score = None, None
    for mask in range(8):
        cand = [row[:] for row in m]
        for r in range(size):
            for c in range(size):
                if not f[r][c] and MASKS[mask](r, c):
                    cand[r][c] ^= 1
        place_format(cand, size, ec, mask)
        place_version(cand, size, version)
        s = penalty(cand, size)
        if best_score is None or s < best_score:
            best, best_score = cand, s
    return best, size, version


# --- Rendering ---------------------------------------------------------------
def pad(matrix, size, quiet=4):
    n = size + 2 * quiet
    g = [[0] * n for _ in range(n)]
    for r in range(size):
        for c in range(size):
            g[r + quiet][c + quiet] = matrix[r][c]
    return g, n


def render_halfblock(matrix, size, quiet=4):
    """One character per module horizontally, two modules per row vertically."""
    g, n = pad(matrix, size, quiet)
    BLACK, WHITE = "0;0;0", "255;255;255"
    lines = []
    for r in range(0, n, 2):
        out, cur = [], None
        for c in range(n):
            top = g[r][c]
            bot = g[r + 1][c] if r + 1 < n else 0
            fg = BLACK if top else WHITE
            bg = BLACK if bot else WHITE
            if (fg, bg) != cur:
                out.append("\033[38;2;%sm\033[48;2;%sm" % (fg, bg))
                cur = (fg, bg)
            out.append("▀")
        out.append("\033[0m")
        lines.append("".join(out))
    return "\n".join(lines)


def render_big(matrix, size, quiet=4):
    """Two characters per module, basic ANSI colours — bigger and more portable."""
    g, n = pad(matrix, size, quiet)
    lines = []
    for r in range(n):
        out, cur = [], None
        for c in range(n):
            code = "\033[40m" if g[r][c] else "\033[47m"
            if code != cur:
                out.append(code)
                cur = code
            out.append("  ")
        out.append("\033[0m")
        lines.append("".join(out))
    return "\n".join(lines)


def render_svg(matrix, size, quiet=4, scale=8):
    g, n = pad(matrix, size, quiet)
    px = n * scale
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
             'viewBox="0 0 %d %d" shape-rendering="crispEdges">' % (px, px, n, n),
             '<rect width="%d" height="%d" fill="#fff"/>' % (n, n)]
    for r in range(n):
        for c in range(n):
            if g[r][c]:
                parts.append('<rect x="%d" y="%d" width="1" height="1" fill="#000"/>'
                             % (c, r))
    parts.append('</svg>')
    return ''.join(parts)


def main(argv):
    args, mode, svg_path = [], 'half', None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--big':
            mode = 'big'
        elif a == '--svg':
            i += 1
            svg_path = argv[i]
        elif a in ('-h', '--help'):
            print(__doc__)
            return 0
        else:
            args.append(a)
        i += 1
    if not args:
        print("usage: qr.py [--big] [--svg FILE] TEXT", file=sys.stderr)
        return 2

    text = args[0]
    matrix, size, version = encode(text, 'M')
    print(render_big(matrix, size) if mode == 'big'
          else render_halfblock(matrix, size))
    if svg_path:
        with open(svg_path, 'w') as fh:
            fh.write(render_svg(matrix, size))
        print("  SVG written to %s" % svg_path)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
