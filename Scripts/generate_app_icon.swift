#!/usr/bin/env swift

// Generates the Slop Miles app icon: a cartoon cream-colored dog face
// on a teal-to-blue gradient background.
// Usage: swift Scripts/generate_app_icon.swift
// Output: SlopMiles/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png

import CoreGraphics
import Foundation
#if canImport(ImageIO)
import ImageIO
#endif

let size = 1024
let S = CGFloat(size)

guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
      let ctx = CGContext(
          data: nil,
          width: size,
          height: size,
          bitsPerComponent: 8,
          bytesPerRow: 0,
          space: colorSpace,
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ) else {
    fatalError("Could not create CGContext")
}

// Flip so y=0 is top
ctx.translateBy(x: 0, y: S)
ctx.scaleBy(x: 1, y: -1)

// MARK: - Helpers

func fill(_ path: CGPath, color: CGColor) {
    ctx.saveGState()
    ctx.addPath(path)
    ctx.setFillColor(color)
    ctx.fillPath()
    ctx.restoreGState()
}

func stroke(_ path: CGPath, color: CGColor, width: CGFloat) {
    ctx.saveGState()
    ctx.addPath(path)
    ctx.setStrokeColor(color)
    ctx.setLineWidth(width)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.strokePath()
    ctx.restoreGState()
}

func ellipse(_ rect: CGRect) -> CGMutablePath {
    let p = CGMutablePath(); p.addEllipse(in: rect); return p
}

// MARK: - Colors

let cream      = CGColor(srgbRed: 0.96, green: 0.93, blue: 0.86, alpha: 1.0)
let creamLight = CGColor(srgbRed: 0.98, green: 0.96, blue: 0.91, alpha: 1.0)
let creamDark  = CGColor(srgbRed: 0.88, green: 0.84, blue: 0.76, alpha: 1.0)
let nose       = CGColor(srgbRed: 0.25, green: 0.20, blue: 0.18, alpha: 1.0)
let eyeColor   = CGColor(srgbRed: 0.18, green: 0.15, blue: 0.13, alpha: 1.0)
let tongue     = CGColor(srgbRed: 0.92, green: 0.45, blue: 0.52, alpha: 1.0)
let tongueDark = CGColor(srgbRed: 0.82, green: 0.35, blue: 0.42, alpha: 1.0)
let mouthLine  = CGColor(srgbRed: 0.35, green: 0.28, blue: 0.25, alpha: 1.0)
let white      = CGColor(srgbRed: 1.0, green: 1.0, blue: 1.0, alpha: 1.0)
let earInner   = CGColor(srgbRed: 0.93, green: 0.88, blue: 0.78, alpha: 1.0)

// Center of the face
let cx = S * 0.50
let cy = S * 0.48

// MARK: - Background: Rounded rect with teal-to-blue gradient

let cornerRadius = S * 0.22
let bgPath = CGMutablePath()
bgPath.addRoundedRect(
    in: CGRect(x: 0, y: 0, width: S, height: S),
    cornerWidth: cornerRadius,
    cornerHeight: cornerRadius
)
ctx.addPath(bgPath)
ctx.clip()

let gradColors = [
    CGColor(srgbRed: 0.176, green: 0.831, blue: 0.749, alpha: 1.0),
    CGColor(srgbRed: 0.231, green: 0.510, blue: 0.965, alpha: 1.0),
]
guard let gradient = CGGradient(
    colorsSpace: colorSpace,
    colors: gradColors as CFArray,
    locations: [0.0, 1.0]
) else { fatalError("Could not create gradient") }

ctx.drawLinearGradient(
    gradient,
    start: CGPoint(x: 0, y: 0),
    end: CGPoint(x: S, y: S),
    options: []
)

// MARK: - Ears (drawn behind the head)

// Left ear — floppy, folding down and slightly outward
let leftEar = CGMutablePath()
leftEar.move(to: CGPoint(x: cx - S * 0.16, y: cy - S * 0.18))
leftEar.addQuadCurve(
    to: CGPoint(x: cx - S * 0.30, y: cy + S * 0.05),
    control: CGPoint(x: cx - S * 0.34, y: cy - S * 0.15)
)
leftEar.addQuadCurve(
    to: CGPoint(x: cx - S * 0.14, y: cy - S * 0.04),
    control: CGPoint(x: cx - S * 0.26, y: cy + S * 0.10)
)
leftEar.closeSubpath()
fill(leftEar, color: creamDark)
// Inner ear
let leftEarInner = CGMutablePath()
leftEarInner.move(to: CGPoint(x: cx - S * 0.17, y: cy - S * 0.14))
leftEarInner.addQuadCurve(
    to: CGPoint(x: cx - S * 0.27, y: cy + S * 0.01),
    control: CGPoint(x: cx - S * 0.30, y: cy - S * 0.10)
)
leftEarInner.addQuadCurve(
    to: CGPoint(x: cx - S * 0.15, y: cy - S * 0.05),
    control: CGPoint(x: cx - S * 0.23, y: cy + S * 0.05)
)
leftEarInner.closeSubpath()
fill(leftEarInner, color: earInner)

// Right ear — floppy, mirrored
let rightEar = CGMutablePath()
rightEar.move(to: CGPoint(x: cx + S * 0.16, y: cy - S * 0.18))
rightEar.addQuadCurve(
    to: CGPoint(x: cx + S * 0.30, y: cy + S * 0.05),
    control: CGPoint(x: cx + S * 0.34, y: cy - S * 0.15)
)
rightEar.addQuadCurve(
    to: CGPoint(x: cx + S * 0.14, y: cy - S * 0.04),
    control: CGPoint(x: cx + S * 0.26, y: cy + S * 0.10)
)
rightEar.closeSubpath()
fill(rightEar, color: creamDark)
let rightEarInner = CGMutablePath()
rightEarInner.move(to: CGPoint(x: cx + S * 0.17, y: cy - S * 0.14))
rightEarInner.addQuadCurve(
    to: CGPoint(x: cx + S * 0.27, y: cy + S * 0.01),
    control: CGPoint(x: cx + S * 0.30, y: cy - S * 0.10)
)
rightEarInner.addQuadCurve(
    to: CGPoint(x: cx + S * 0.15, y: cy - S * 0.05),
    control: CGPoint(x: cx + S * 0.23, y: cy + S * 0.05)
)
rightEarInner.closeSubpath()
fill(rightEarInner, color: earInner)

// MARK: - Head shape (broad, slightly rounded — Lab-like)

let headW = S * 0.38
let headH = S * 0.34
fill(ellipse(CGRect(x: cx - headW/2, y: cy - headH/2, width: headW, height: headH)), color: cream)

// Lighter muzzle area (wider lower face)
let muzzleW = S * 0.22
let muzzleH = S * 0.18
let muzzleY = cy + S * 0.02
fill(ellipse(CGRect(x: cx - muzzleW/2, y: muzzleY - muzzleH * 0.3, width: muzzleW, height: muzzleH)), color: creamLight)

// MARK: - Eyes (happy squinty — curved lines, not dots)
// The dog in the photo has relaxed, happy, slightly squinted eyes

let eyeSpacing = S * 0.085
let eyeY = cy - S * 0.06
let eyeW = S * 0.055

// Left eye — happy squint (upside-down arc)
let leftEyePath = CGMutablePath()
leftEyePath.move(to: CGPoint(x: cx - eyeSpacing - eyeW, y: eyeY))
leftEyePath.addQuadCurve(
    to: CGPoint(x: cx - eyeSpacing + eyeW, y: eyeY),
    control: CGPoint(x: cx - eyeSpacing, y: eyeY - S * 0.028)
)
stroke(leftEyePath, color: eyeColor, width: S * 0.022)

// Right eye
let rightEyePath = CGMutablePath()
rightEyePath.move(to: CGPoint(x: cx + eyeSpacing - eyeW, y: eyeY))
rightEyePath.addQuadCurve(
    to: CGPoint(x: cx + eyeSpacing + eyeW, y: eyeY),
    control: CGPoint(x: cx + eyeSpacing, y: eyeY - S * 0.028)
)
stroke(rightEyePath, color: eyeColor, width: S * 0.022)

// MARK: - Nose (dark, rounded triangle)

let noseW = S * 0.065
let noseH = S * 0.045
let noseY = cy + S * 0.04

let nosePath = CGMutablePath()
nosePath.move(to: CGPoint(x: cx, y: noseY - noseH * 0.3))
nosePath.addQuadCurve(
    to: CGPoint(x: cx - noseW/2, y: noseY + noseH * 0.5),
    control: CGPoint(x: cx - noseW/2, y: noseY - noseH * 0.3)
)
nosePath.addQuadCurve(
    to: CGPoint(x: cx + noseW/2, y: noseY + noseH * 0.5),
    control: CGPoint(x: cx, y: noseY + noseH * 0.9)
)
nosePath.addQuadCurve(
    to: CGPoint(x: cx, y: noseY - noseH * 0.3),
    control: CGPoint(x: cx + noseW/2, y: noseY - noseH * 0.3)
)
fill(nosePath, color: nose)

// Nose highlight
let noseHighlight = CGMutablePath()
noseHighlight.addEllipse(in: CGRect(x: cx - S * 0.012, y: noseY - noseH * 0.1, width: S * 0.018, height: S * 0.010))
fill(noseHighlight, color: CGColor(srgbRed: 0.45, green: 0.40, blue: 0.38, alpha: 0.6))

// MARK: - Mouth and tongue

// Line down from nose
let mouthStartY = noseY + noseH * 0.5
let mouthMidY = mouthStartY + S * 0.03
let mouthCenter = CGMutablePath()
mouthCenter.move(to: CGPoint(x: cx, y: mouthStartY))
mouthCenter.addLine(to: CGPoint(x: cx, y: mouthMidY))
stroke(mouthCenter, color: mouthLine, width: S * 0.012)

// Open smile — two curves going outward from center
let smileW = S * 0.08
let leftSmile = CGMutablePath()
leftSmile.move(to: CGPoint(x: cx, y: mouthMidY))
leftSmile.addQuadCurve(
    to: CGPoint(x: cx - smileW, y: mouthMidY - S * 0.01),
    control: CGPoint(x: cx - smileW * 0.5, y: mouthMidY + S * 0.02)
)
stroke(leftSmile, color: mouthLine, width: S * 0.012)

let rightSmile = CGMutablePath()
rightSmile.move(to: CGPoint(x: cx, y: mouthMidY))
rightSmile.addQuadCurve(
    to: CGPoint(x: cx + smileW, y: mouthMidY - S * 0.01),
    control: CGPoint(x: cx + smileW * 0.5, y: mouthMidY + S * 0.02)
)
stroke(rightSmile, color: mouthLine, width: S * 0.012)

// Tongue hanging out
let tongueW = S * 0.055
let tongueH = S * 0.10
let tongueTop = mouthMidY + S * 0.005
let tonguePath = CGMutablePath()
tonguePath.move(to: CGPoint(x: cx - tongueW * 0.4, y: tongueTop))
tonguePath.addLine(to: CGPoint(x: cx + tongueW * 0.4, y: tongueTop))
tonguePath.addQuadCurve(
    to: CGPoint(x: cx + tongueW * 0.15, y: tongueTop + tongueH),
    control: CGPoint(x: cx + tongueW * 0.5, y: tongueTop + tongueH * 0.7)
)
tonguePath.addQuadCurve(
    to: CGPoint(x: cx - tongueW * 0.15, y: tongueTop + tongueH),
    control: CGPoint(x: cx, y: tongueTop + tongueH * 1.1)
)
tonguePath.addQuadCurve(
    to: CGPoint(x: cx - tongueW * 0.4, y: tongueTop),
    control: CGPoint(x: cx - tongueW * 0.5, y: tongueTop + tongueH * 0.7)
)
fill(tonguePath, color: tongue)

// Tongue center line
let tongueLinePath = CGMutablePath()
tongueLinePath.move(to: CGPoint(x: cx, y: tongueTop + S * 0.01))
tongueLinePath.addLine(to: CGPoint(x: cx, y: tongueTop + tongueH * 0.7))
stroke(tongueLinePath, color: tongueDark, width: S * 0.006)

// MARK: - Small motion lines (to hint at running)

let lineAlpha = CGColor(srgbRed: 1.0, green: 1.0, blue: 1.0, alpha: 0.40)
let motionBaseX = cx - S * 0.32
let motionLen = S * 0.06

for i in 0..<3 {
    let ly = cy - S * 0.04 + CGFloat(i) * S * 0.055
    let m = CGMutablePath()
    m.move(to: CGPoint(x: motionBaseX, y: ly))
    m.addLine(to: CGPoint(x: motionBaseX - motionLen, y: ly))
    stroke(m, color: lineAlpha, width: S * 0.010)
}

// MARK: - Export PNG

guard let image = ctx.makeImage() else { fatalError("Could not create image") }

let scriptDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let projectRoot = scriptDir.deletingLastPathComponent()
let outputDir = projectRoot
    .appendingPathComponent("SlopMiles/Resources/Assets.xcassets/AppIcon.appiconset")
let outputPath = outputDir.appendingPathComponent("AppIcon.png")

try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

guard let dest = CGImageDestinationCreateWithURL(
    outputPath as CFURL,
    "public.png" as CFString,
    1,
    nil
) else { fatalError("Could not create image destination") }

CGImageDestinationAddImage(dest, image, nil)
guard CGImageDestinationFinalize(dest) else { fatalError("Could not write PNG") }

print("App icon written to: \(outputPath.path)")

let contentsJSON = """
{
  "images" : [
    {
      "filename" : "AppIcon.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
"""
let contentsPath = outputDir.appendingPathComponent("Contents.json")
try! contentsJSON.write(to: contentsPath, atomically: true, encoding: .utf8)
print("Contents.json updated")
