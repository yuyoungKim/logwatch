Get-Content "$PSScriptRoot\.env" |
  Where-Object { $_ -match '^\s*[^#]\S+=\S+' } |
  ForEach-Object {
    $k, $v = $_ -split '=', 2
    [System.Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), 'Process')
  }
Write-Host "Environment loaded from .env"
