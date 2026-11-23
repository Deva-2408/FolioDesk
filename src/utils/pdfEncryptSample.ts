/**
 * Pure TypeScript PDF 1.4 Standard Security Handler (V=1, R=2, RC4-40)
 * Generates a genuinely password-protected multi-page PDF binary in both Node & Browser
 * so users and tests can exercise real password prompting, decryption, editing, and password removal.
 */

// Standard PDF Padding String (ISO 32000-1, Algorithm 2)
const PDF_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

// Compact RFC 1321 MD5 implementation (works in browser & Node without crypto polyfills)
function md5(input: Uint8Array): Uint8Array {
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }

  const bitLen = input.length * 8;
  const padLen = ((56 - ((input.length + 1) % 64)) + 64) % 64;
  const msg = new Uint8Array(input.length + 1 + padLen + 8);
  msg.set(input, 0);
  msg[input.length] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(msg.length - 8, bitLen >>> 0, true);
  view.setUint32(msg.length - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < msg.length; offset += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(offset + j * 4, true);
    }
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F = 0;
      let g = 0;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      const temp = D;
      D = C;
      C = B;
      const sum = (A + F + K[i] + M[g]) >>> 0;
      B = (B + (((sum << s[i]) | (sum >>> (32 - s[i]))) >>> 0)) >>> 0;
      A = temp;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}

function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }
  const out = new Uint8Array(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
    out[k] = data[k] ^ S[(S[i] + S[j]) & 0xff];
  }
  return out;
}

function padPassword(password: string): Uint8Array {
  const raw = new TextEncoder().encode(password);
  const out = new Uint8Array(32);
  const copyLen = Math.min(32, raw.length);
  out.set(raw.subarray(0, copyLen), 0);
  if (copyLen < 32) {
    out.set(PDF_PADDING.subarray(0, 32 - copyLen), copyLen);
  }
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) {
    out.set(a, pos);
    pos += a.length;
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapePdfString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Creates a genuinely RC4-40 password-protected 2-page PDF binary that standard PDF
 * readers and pdfjs-dist require `userPassword` to decrypt and view.
 */
export function buildEncryptedSamplePdf(
  userPassword: string,
  ownerPassword = `${userPassword}-owner`,
): Uint8Array {
  const fileId = new Uint8Array([
    0x46, 0x6f, 0x6c, 0x69, 0x6f, 0x44, 0x65, 0x73,
    0x6b, 0x32, 0x30, 0x32, 0x36, 0x50, 0x44, 0x46,
  ]);
  // Permissions: allow print & copy (P = -44 in signed 32-bit int -> 0xffffffd4)
  const P = -44;
  const pBytes = new Uint8Array(4);
  new DataView(pBytes.buffer).setInt32(0, P, true);

  // Algorithm 3 (R=2): Compute O entry
  const ownerKey = md5(padPassword(ownerPassword)).subarray(0, 5);
  const O = rc4(ownerKey, padPassword(userPassword));

  // Algorithm 2 (R=2): Compute 5-byte file encryption key
  const fileKey = md5(concatBytes(padPassword(userPassword), O, pBytes, fileId)).subarray(0, 5);

  // Algorithm 4 (R=2): Compute U entry
  const U = rc4(fileKey, PDF_PADDING);

  // Encrypt stream for object number `objNum` (Algorithm 1)
  const encryptObjectBytes = (objNum: number, data: Uint8Array): Uint8Array => {
    const ext = new Uint8Array(5);
    ext[0] = objNum & 0xff;
    ext[1] = (objNum >> 8) & 0xff;
    ext[2] = (objNum >> 16) & 0xff;
    ext[3] = 0;
    ext[4] = 0;
    const objKey = md5(concatBytes(fileKey, ext)).subarray(0, 10);
    return rc4(objKey, data);
  };

  const makePageStream = (title: string, subtitle: string, lines: string[], footer: string) => {
    const ops: string[] = [
      // White page background + clean indigo header rule
      "1 1 1 rg 0 0 612 792 re f",
      "0.145 0.388 0.922 rg 48 730 516 3 re f",
      "BT /F2 10 Tf 0.145 0.388 0.922 rg 48 742 Td (PROTECTED DOCUMENT · UNLOCKED IN FOLIODESK) Tj ET",
      `BT /F2 21 Tf 0.06 0.09 0.16 rg 48 690 Td (${escapePdfString(title)}) Tj ET`,
      `BT /F1 12 Tf 0.35 0.42 0.52 rg 48 666 Td (${escapePdfString(subtitle)}) Tj ET`,
    ];
    lines.forEach((line, idx) => {
      const y = 620 - idx * 28;
      ops.push(`BT /F1 12 Tf 0.12 0.16 0.24 rg 48 ${y} Td (${escapePdfString(line)}) Tj ET`);
    });
    ops.push(`BT /F1 10 Tf 0.45 0.5 0.58 rg 48 42 Td (${escapePdfString(footer)}) Tj ET`);
    return new TextEncoder().encode(ops.join("\n"));
  };

  const page1Stream = encryptObjectBytes(
    6,
    makePageStream(
      "Midterm Exam Solutions — Confidential",
      "Course: Applied Linear Systems  |  Password-Protected Release",
      [
        "Problem 1: Eigenvalue Decomposition of Symmetric Matrix A",
        "  Given A = [[4, 1], [1, 4]], characteristic polynomial is (4 - L)^2 - 1 = 0.",
        "  Eigenvalues: L1 = 5 (v1 = [1, 1]^T / sqrt(2)), L2 = 3 (v2 = [1, -1]^T / sqrt(2)).",
        "",
        "Problem 2: Least Squares Projection",
        "  Normal equations: (X^T X) beta = X^T y.",
        "  Residual vector r = y - X*beta is strictly orthogonal to col(X).",
        "",
        "Tip: Click 'Remove Password' in FolioDesk to save a permanently unlocked PDF.",
      ],
      "Page 1 of 2  |  Encrypted with PDF Standard Security Handler",
    ),
  );

  const page2Stream = encryptObjectBytes(
    7,
    makePageStream(
      "Grading Rubric & Formula Appendix",
      "Instructor Reference Sheet  |  Page 2",
      [
        "Scoring Breakdown (100 Points Total):",
        "  - Section A (Theory & Proofs): 35 pts",
        "  - Section B (Matrix Factorizations): 40 pts",
        "  - Section C (Applied Numerical Conditioning): 25 pts",
        "",
        "Key Condition Number Identity:",
        "  kappa_2(A) = sigma_max(A) / sigma_min(A) = ||A||_2 * ||A^-1||_2",
        "  Well-conditioned systems satisfy kappa_2(A) << 1 / eps_machine.",
      ],
      "Page 2 of 2  |  Encrypted with PDF Standard Security Handler",
    ),
  );

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0]; // index 0 unused
  let cursor = 0;

  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    cursor += b.length;
  };
  const pushStr = (s: string) => pushBytes(enc.encode(s));

  pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  const addObj = (id: number, body: string | Uint8Array[]) => {
    offsets[id] = cursor;
    pushStr(`${id} 0 obj\n`);
    if (typeof body === "string") {
      pushStr(body);
    } else {
      for (const part of body) pushBytes(part);
    }
    pushStr("\nendobj\n");
  };

  addObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObj(2, "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>");
  addObj(
    3,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 8 0 R >> >> /Contents 6 0 R >>",
  );
  addObj(
    4,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 8 0 R >> >> /Contents 7 0 R >>",
  );
  addObj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObj(6, [
    enc.encode(`<< /Length ${page1Stream.length} >>\nstream\n`),
    page1Stream,
    enc.encode("\nendstream"),
  ]);
  addObj(7, [
    enc.encode(`<< /Length ${page2Stream.length} >>\nstream\n`),
    page2Stream,
    enc.encode("\nendstream"),
  ]);
  addObj(8, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  addObj(
    9,
    `<< /Filter /Standard /V 1 /R 2 /O <${toHex(O)}> /U <${toHex(U)}> /P ${P} >>`,
  );

  const xrefPos = cursor;
  const totalObjs = 9;
  pushStr(`xref\n0 ${totalObjs + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (let i = 1; i <= totalObjs; i++) {
    pushStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }

  const fileIdHex = toHex(fileId);
  pushStr(
    `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R /Encrypt 9 0 R /ID [<${fileIdHex}> <${fileIdHex}>] >>\nstartxref\n${xrefPos}\n%%EOF\n`,
  );

  return concatBytes(...chunks);
}
