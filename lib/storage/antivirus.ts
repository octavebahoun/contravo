export interface ScanResult {
  status: 'clean' | 'infected' | 'failed';
  virusName?: string;
  scannedAt: Date;
}

const EICAR_STRING = `X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`;

/**
 * Perform heuristic scans for PDFs and Office documents to detect potential exploits and macro execution vectors.
 */
export function performHeuristicScan(buffer: Buffer): { status: 'infected' | 'clean'; virusName?: string } {
  const fileContent = buffer.toString('utf-8');
  if (fileContent.includes(EICAR_STRING)) {
    return {
      status: 'infected',
      virusName: 'EICAR-Test-Signature',
    };
  }

  // 1. PDF detection & check
  // PDF magic bytes: %PDF- (hex: 25 50 44 46 2d)
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') {
    const pdfAscii = buffer.toString('ascii');
    
    // Check for suspicious auto-executable launch actions
    if (pdfAscii.includes('/Launch')) {
      return {
        status: 'infected',
        virusName: 'Heuristic.PDF.SuspiciousLaunch',
      };
    }
    
    // Check for embedded files inside the PDF (can carry malware)
    if (pdfAscii.includes('/EmbeddedFiles')) {
      return {
        status: 'infected',
        virusName: 'Heuristic.PDF.EmbeddedFiles',
      };
    }
    
    // Check for embedded scripts (JavaScript or JS keywords in object definitions)
    if (pdfAscii.includes('/JavaScript') || pdfAscii.includes('/JS')) {
      return {
        status: 'infected',
        virusName: 'Heuristic.PDF.EmbeddedJavaScript',
      };
    }
  }

  // 2. Modern Office OpenXML ZIP detection & check (.docx, .xlsx, .pptx)
  // ZIP magic bytes: PK\x03\x04 (hex: 50 4b 03 04)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    const zipAscii = buffer.toString('ascii');
    // VBA macros are stored inside a file named vbaProject.bin in the zip structure
    if (zipAscii.includes('vbaProject.bin') || zipAscii.includes('vbaProject')) {
      return {
        status: 'infected',
        virusName: 'Heuristic.Office.VBA.MacroEnabled',
      };
    }
  }

  // 3. Legacy OLE Office Document detection & check (.doc, .xls, .ppt)
  // OLE magic bytes: D0 CF 11 E0 1A E1 1A E1
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0x1a &&
    buffer[5] === 0xe1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  ) {
    const oleAscii = buffer.toString('ascii');
    if (
      oleAscii.includes('_VBA_PROJECT') ||
      oleAscii.includes('VBA') ||
      oleAscii.includes('vbaProject')
    ) {
      return {
        status: 'infected',
        virusName: 'Heuristic.OfficeLegacy.VBA.MacroEnabled',
      };
    }
  }

  return {
    status: 'clean',
  };
}

/**
 * Scans a file buffer for malware using heuristic checks and signature matching.
 */
export async function scanFileBuffer(buffer: Buffer): Promise<ScanResult> {
  try {
    const scan = performHeuristicScan(buffer);
    return {
      status: scan.status,
      virusName: scan.virusName,
      scannedAt: new Date(),
    };
  } catch (error) {
    console.error('Antivirus scan error:', error);
    return {
      status: 'failed',
      scannedAt: new Date(),
    };
  }
}

/**
 * Scans a file stream for malware. Reads stream in chunks to run heuristic checks.
 */
export async function scanFileStream(stream: NodeJS.ReadableStream): Promise<ScanResult> {
  return new Promise((resolve) => {
    const chunks: any[] = [];
    
    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    stream.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const scan = performHeuristicScan(buffer);
        resolve({
          status: scan.status,
          virusName: scan.virusName,
          scannedAt: new Date(),
        });
      } catch (err) {
        console.error('Antivirus stream scan processing error:', err);
        resolve({
          status: 'failed',
          scannedAt: new Date(),
        });
      }
    });

    stream.on('error', (err) => {
      console.error('Antivirus stream scan error:', err);
      resolve({
        status: 'failed',
        scannedAt: new Date(),
      });
    });
  });
}
