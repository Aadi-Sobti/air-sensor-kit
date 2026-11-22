// Independent QR check for kit labels (macOS only): renders a PDF page with PDFKit at 4x and decodes every QR code
// with Apple's CoreImage detector, printing one decoded message per line. Used by tools/tests (skipped elsewhere).
//   swift tools/qr_decode_pdf.swift labels.pdf
import AppKit
import CoreImage
import PDFKit

guard CommandLine.arguments.count == 2, let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])),
      let page = doc.page(at: 0) else {
  FileHandle.standardError.write("usage: qr_decode_pdf <file.pdf>\n".data(using: .utf8)!)
  exit(2)
}
let box = page.bounds(for: .mediaBox)
let img = page.thumbnail(of: NSSize(width: box.width * 4, height: box.height * 4), for: .mediaBox)
guard let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(3) }
let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
for f in detector.features(in: CIImage(cgImage: cg)) {
  if let q = f as? CIQRCodeFeature, let m = q.messageString { print(m) }
}
