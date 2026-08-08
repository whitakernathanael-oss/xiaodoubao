Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot

function New-ThemeWallpaper {
  param(
    [Parameter(Mandatory)] [string] $OutputPath,
    [Parameter(Mandatory)] [string] $StartColor,
    [Parameter(Mandatory)] [string] $EndColor,
    [Parameter(Mandatory)] [string] $AccentColor,
    [Parameter(Mandatory)] [int] $Seed
  )

  $directory = Split-Path -Parent $OutputPath
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  $bitmap = [System.Drawing.Bitmap]::new(2560, 1440, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $rectangle = [System.Drawing.Rectangle]::new(0, 0, 2560, 1440)
  $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $rectangle,
    [System.Drawing.ColorTranslator]::FromHtml($StartColor),
    [System.Drawing.ColorTranslator]::FromHtml($EndColor),
    24.0
  )
  $graphics.FillRectangle($gradient, $rectangle)

  $accent = [System.Drawing.ColorTranslator]::FromHtml($AccentColor)
  $random = [System.Random]::new($Seed)
  for ($index = 0; $index -lt 22; $index += 1) {
    $size = $random.Next(130, 620)
    $x = $random.Next(-200, 2500)
    $y = $random.Next(-180, 1380)
    $alpha = $random.Next(10, 42)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($alpha, $accent.R, $accent.G, $accent.B))
    $graphics.FillEllipse($brush, $x, $y, $size, $size)
    $brush.Dispose()
  }

  for ($index = 0; $index -lt 700; $index += 1) {
    $x = $random.Next(0, 2560)
    $y = $random.Next(0, 1440)
    $alpha = $random.Next(8, 24)
    $radius = $random.Next(1, 4)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
    $graphics.FillEllipse($brush, $x, $y, $radius, $radius)
    $brush.Dispose()
  }

  $linePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(30, $accent.R, $accent.G, $accent.B), 2)
  for ($index = 0; $index -lt 8; $index += 1) {
    $offset = 180 + ($index * 145)
    $graphics.DrawArc($linePen, 1350 - $offset, 180 - $offset, 1450 + ($offset * 2), 1000 + ($offset * 2), 195, 82)
  }
  $linePen.Dispose()
  $gradient.Dispose()
  $graphics.Dispose()

  $temporary = "$OutputPath.tmp.png"
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
  $bitmap.Save($temporary, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Move-Item -LiteralPath $temporary -Destination $OutputPath -Force
}

New-ThemeWallpaper -OutputPath (Join-Path $projectRoot 'assets\themes\clean-light\wallpaper.png') -StartColor '#f3eadf' -EndColor '#d8e8ff' -AccentColor '#7864d8' -Seed 1103
New-ThemeWallpaper -OutputPath (Join-Path $projectRoot 'assets\themes\midnight-ink\wallpaper.png') -StartColor '#10131f' -EndColor '#29334e' -AccentColor '#6d8dff' -Seed 2207
New-ThemeWallpaper -OutputPath (Join-Path $projectRoot 'assets\themes\glass-blue\wallpaper.png') -StartColor '#b9def4' -EndColor '#e8ddf7' -AccentColor '#2f91d4' -Seed 3301
