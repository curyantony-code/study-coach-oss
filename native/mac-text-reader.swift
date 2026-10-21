// Reads the text in a picture with the Mac's own recogniser (the Vision framework) and prints
// one line per piece of text: x, y, width, height (0 to 1, measured from the top left), then
// the text, separated by tabs. Runs entirely on this Mac.
//
// Build: npm run build:reader
import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 2 else {
  FileHandle.standardError.write("usage: mac-text-reader <picture>\n".data(using: .utf8)!)
  exit(2)
}
guard let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let picture = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("could not open the picture\n".data(using: .utf8)!)
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
// Language correction "fixes" numbers and symbols it should leave alone.
request.usesLanguageCorrection = false

do {
  try VNImageRequestHandler(cgImage: picture).perform([request])
} catch {
  FileHandle.standardError.write("reading failed: \(error.localizedDescription)\n".data(using: .utf8)!)
  exit(1)
}

for found in request.results ?? [] {
  guard let best = found.topCandidates(1).first else { continue }
  let box = found.boundingBox
  let text = best.string.replacingOccurrences(of: "\t", with: " ").replacingOccurrences(of: "\n", with: " ")
  print(String(format: "%.4f\t%.4f\t%.4f\t%.4f\t%@", box.minX, 1 - box.maxY, box.width, box.height, text))
}
