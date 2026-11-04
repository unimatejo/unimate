import ExpoModulesCore
import Vision
import CoreImage
import UIKit

// Cuts the person / object out of a photo, like long-pressing a photo in iOS Photos (iOS 17+).
// Gives back a PNG with a transparent background, trimmed to the subject.
public class SubjectLiftModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SubjectLift")

    Function("isAvailable") { () -> Bool in
      if #available(iOS 17.0, *) { return true }
      return false
    }

    AsyncFunction("lift") { (uri: String, promise: Promise) in
      guard #available(iOS 17.0, *) else { promise.reject("unavailable", "iOS 17 or newer is needed"); return }
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          guard let url = URL(string: uri), let data = try? Data(contentsOf: url),
                let input = CIImage(data: data, options: [.applyOrientationProperty: true]) else {
            promise.reject("bad_image", "Could not read the photo"); return
          }
          let handler = VNImageRequestHandler(ciImage: input)
          let request = VNGenerateForegroundInstanceMaskRequest()
          try handler.perform([request])
          guard let result = request.results?.first, !result.allInstances.isEmpty else {
            promise.reject("no_subject", "No person or object found"); return
          }
          let buffer = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
          let masked = CIImage(cvPixelBuffer: buffer)
          // fit in 512x512 like WhatsApp stickers
          let side = max(masked.extent.width, masked.extent.height)
          let scale = min(1, 512 / side)
          let scaled = masked.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
          let ctx = CIContext()
          guard let cg = ctx.createCGImage(scaled, from: scaled.extent), let png = UIImage(cgImage: cg).pngData() else {
            promise.reject("render", "Could not make the sticker"); return
          }
          let out = FileManager.default.temporaryDirectory.appendingPathComponent("sticker-\(UUID().uuidString).png")
          try png.write(to: out)
          promise.resolve(["uri": out.absoluteString, "width": cg.width, "height": cg.height])
        } catch {
          promise.reject("failed", error.localizedDescription)
        }
      }
    }
  }
}
