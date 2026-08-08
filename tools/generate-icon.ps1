Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeIcon {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool DestroyIcon(IntPtr handle);
}
'@

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $projectRoot 'assets\icon.ico'
$bitmap = [System.Drawing.Bitmap]::new(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$path.AddArc(12, 12, 64, 64, 180, 90)
$path.AddArc(180, 12, 64, 64, 270, 90)
$path.AddArc(180, 180, 64, 64, 0, 90)
$path.AddArc(12, 180, 64, 64, 90, 90)
$path.CloseFigure()
$gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(12, 12, 232, 232),
  [System.Drawing.Color]::FromArgb(114, 82, 226),
  [System.Drawing.Color]::FromArgb(155, 91, 221),
  38.0
)
$graphics.FillPath($gradient, $path)

$white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(242, 255, 255, 255))
$soft = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(118, 255, 255, 255))
$graphics.FillEllipse($soft, 57, 50, 142, 142)
$graphics.FillEllipse($white, 82, 71, 92, 114)
$cutout = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(155, 91, 221))
$graphics.FillEllipse($cutout, 105, 91, 68, 74)
$graphics.FillEllipse($white, 77, 153, 102, 36)

$temporary = "$outputPath.tmp"
$handle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Open($temporary, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Dispose()
$icon.Dispose()
[NativeIcon]::DestroyIcon($handle) | Out-Null
$cutout.Dispose()
$soft.Dispose()
$white.Dispose()
$gradient.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
Move-Item -LiteralPath $temporary -Destination $outputPath -Force
