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
          // like WhatsApp: fit the subject in 512x512 and give it a white outline
          let side = max(masked.extent.width, masked.extent.height)
          let scale = min(1, 470 / side)
          let small = masked.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
          let moved = small.transformed(by: CGAffineTransform(translationX: -small.extent.minX + 21, y: -small.extent.minY + 21))
          let canvas = CGRect(x: 0, y: 0, width: moved.extent.width + 42, height: moved.extent.height + 42)
          let grown = moved.applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: 10]).cropped(to: canvas)
          let white = CIImage(color: CIColor.white).cropped(to: canvas)
          let ring = white.applyingFilter("CIBlendWithAlphaMask", parameters: [kCIInputBackgroundImageKey: CIImage.empty(), kCIInputMaskImageKey: grown])
          let scaled = moved.composited(over: ring).cropped(to: canvas)
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
