$ErrorActionPreference = "Stop"

$Cli = "C:\Nexon\MabinogiMobile\MabinogiMobile_CLI.exe"
$Port = 17891
$AllowedOrigins = @(
    "https://stardust-repo.github.io"
)

function JsonError([string]$code,[string]$message) {
    return (@{ error=$code; message=$message } | ConvertTo-Json -Compress)
}

if (-not (Test-Path $Cli)) {
    Write-Host "MabinogiMobile_CLI.exe 를 찾을 수 없습니다." -ForegroundColor Red
    Write-Host $Cli
    Read-Host "Enter 키를 누르면 종료합니다"
    exit 1
}

function Invoke-Mabi([string]$Command) {
    $out = & $Cli $Command 2>&1 | Out-String
    return [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output = $out.Trim()
    }
}

function Send-Response {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$Code,
        [string]$Text,
        [byte[]]$BodyBytes,
        [string]$ContentType,
        [string]$Origin = "*"
    )

    if ([string]::IsNullOrWhiteSpace($Origin)) { $Origin = "*" }

    $head =
        "HTTP/1.1 $Code $Text`r`n" +
        "Content-Type: $ContentType`r`n" +
        "Content-Length: $($BodyBytes.Length)`r`n" +
        "Access-Control-Allow-Origin: $Origin`r`n" +
        "Access-Control-Allow-Methods: GET, OPTIONS`r`n" +
        "Access-Control-Allow-Headers: Content-Type`r`n" +
        "Access-Control-Allow-Private-Network: true`r`n" +
        "Cache-Control: no-store`r`n" +
        "X-Content-Type-Options: nosniff`r`n" +
        "Connection: close`r`n`r`n"

    $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
    $Stream.Write($headBytes,0,$headBytes.Length)
    if ($BodyBytes.Length -gt 0) {
        $Stream.Write($BodyBytes,0,$BodyBytes.Length)
    }
    $Stream.Flush()
}

function Send-Json {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$Code,
        [string]$Text,
        [string]$Json,
        [string]$Origin = "*"
    )
    $bytes = [Text.Encoding]::UTF8.GetBytes($Json)
    Send-Response $Stream $Code $Text $bytes "application/json; charset=utf-8" $Origin
}

function Send-Html {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [string]$Html
    )
    $bytes = [Text.Encoding]::UTF8.GetBytes($Html)
    Send-Response $Stream 200 "OK" $bytes "text/html; charset=utf-8" "*"
}

function Parse-Query([string]$target) {
    $result = @{}
    $qIndex = $target.IndexOf("?")
    if ($qIndex -lt 0) { return $result }

    $query = $target.Substring($qIndex + 1)
    foreach ($part in $query.Split("&")) {
        if (-not $part) { continue }
        $kv = $part.Split("=",2)
        $key = [Uri]::UnescapeDataString($kv[0].Replace("+"," "))
        $value = if ($kv.Length -gt 1) {
            [Uri]::UnescapeDataString($kv[1].Replace("+"," "))
        } else { "" }
        $result[$key] = $value
    }
    return $result
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$Port)

try {
    $listener.Start()
} catch {
    Write-Host "127.0.0.1:$Port 를 열 수 없습니다." -ForegroundColor Red
    Write-Host $_.Exception.Message
    Read-Host "Enter 키를 누르면 종료합니다"
    exit 2
}

Write-Host ""
Write-Host "Mabinogi Web Bridge v2" -ForegroundColor Green
Write-Host "http://127.0.0.1:$Port" -ForegroundColor Yellow
Write-Host ""
Write-Host "GET /api/ping"
Write-Host "GET /api/status"
Write-Host "GET /api/music-scores"
Write-Host "GET /relay?origin=https%3A%2F%2Fstardust-repo.github.io"
Write-Host ""
Write-Host "종료: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 5000
            $client.SendTimeout = 15000

            $stream = $client.GetStream()
            $reader = New-Object IO.StreamReader($stream,[Text.Encoding]::UTF8,$false,4096,$true)

            $requestLine = $reader.ReadLine()
            if (-not $requestLine) { continue }

            $headers = @{}
            while ($true) {
                $line = $reader.ReadLine()
                if ($null -eq $line -or $line -eq "") { break }
                $idx = $line.IndexOf(":")
                if ($idx -gt 0) {
                    $headers[$line.Substring(0,$idx).Trim()] = $line.Substring($idx+1).Trim()
                }
            }

            $parts = $requestLine.Split(" ")
            $method = if ($parts.Length -gt 0) { $parts[0].ToUpperInvariant() } else { "" }
            $target = if ($parts.Length -gt 1) { $parts[1] } else { "/" }
            $path = ($target -split "\?")[0]

            $origin = "*"
            foreach ($k in $headers.Keys) {
                if ($k -ieq "Origin") {
                    $origin = [string]$headers[$k]
                    break
                }
            }

            Write-Host "[$(Get-Date -Format HH:mm:ss)] $method $target Origin=$origin"

            if ($method -eq "OPTIONS") {
                Send-Json $stream 204 "No Content" "" $origin
                continue
            }

            if ($method -ne "GET") {
                Send-Json $stream 405 "Method Not Allowed" (JsonError "method_not_allowed" "GET only") $origin
                continue
            }

            switch ($path) {
                "/api/ping" {
                    Send-Json $stream 200 "OK" '{"ok":true,"bridge":"mabinogi-web-bridge-v2"}' $origin
                }

                "/api/status" {
                    $r = Invoke-Mabi "status"
                    if ($r.ExitCode -eq 0) {
                        Send-Json $stream 200 "OK" $r.Output $origin
                    } else {
                        $j = @{error="cli_status_failed";exitCode=$r.ExitCode;response=$r.Output} | ConvertTo-Json -Compress
                        Send-Json $stream 503 "Service Unavailable" $j $origin
                    }
                }

                "/api/music-scores" {
                    $r = Invoke-Mabi "get_music_scores"
                    if ($r.ExitCode -eq 0) {
                        Send-Json $stream 200 "OK" $r.Output $origin
                    } else {
                        $j = @{error="get_music_scores_failed";exitCode=$r.ExitCode;response=$r.Output} | ConvertTo-Json -Compress
                        Send-Json $stream 502 "Bad Gateway" $j $origin
                    }
                }

                "/relay" {
                    $q = Parse-Query $target
                    $returnOrigin = [string]$q["origin"]

                    if ($AllowedOrigins -notcontains $returnOrigin) {
                        $html = "<!doctype html><meta charset='utf-8'><title>연결 거부</title><body style='font-family:system-ui;padding:30px'><h2>연결 거부</h2><p>허용되지 않은 웹사이트입니다.</p></body>"
                        Send-Html $stream $html
                        continue
                    }

                    $r = Invoke-Mabi "get_music_scores"

                    if ($r.ExitCode -eq 0) {
                        $payload = @{
                            type = "mabi-music-scores"
                            ok = $true
                            data = ($r.Output | ConvertFrom-Json)
                        } | ConvertTo-Json -Depth 50 -Compress
                    } else {
                        $payload = @{
                            type = "mabi-music-scores"
                            ok = $false
                            error = @{
                                code = "get_music_scores_failed"
                                exitCode = $r.ExitCode
                                response = $r.Output
                            }
                        } | ConvertTo-Json -Depth 20 -Compress
                    }

                    $payloadBytes = [Text.Encoding]::UTF8.GetBytes($payload)
                    $payloadB64 = [Convert]::ToBase64String($payloadBytes)

                    $html = @"
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>마비노기 모바일 연결</title>
<style>
body{font-family:system-ui;background:#111318;color:#f5f7fa;padding:32px}
.box{max-width:520px;margin:auto;background:#1b2029;border:1px solid #303846;border-radius:16px;padding:22px}
</style>
</head>
<body>
<div class="box">
<h2>마비노기 모바일</h2>
<p id="msg">악보 목록을 원래 페이지로 전달하고 있습니다...</p>
</div>
<script>
(() => {
  try {
    const bytes = Uint8Array.from(atob("$payloadB64"), c => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const data = JSON.parse(text);

    if (!window.opener) {
      document.getElementById('msg').textContent =
        '원래 웹페이지 창을 찾지 못했습니다. 팝업 차단 설정을 확인하세요.';
      return;
    }

    window.opener.postMessage(data, "$returnOrigin");
    document.getElementById('msg').textContent =
      data.ok ? '전달 완료. 이 창은 자동으로 닫힙니다.' : '호출 결과를 원래 페이지로 전달했습니다.';

    setTimeout(() => window.close(), 500);
  } catch (e) {
    document.getElementById('msg').textContent = '전달 실패: ' + e.message;
  }
})();
</script>
</body>
</html>
"@
                    Send-Html $stream $html
                }

                default {
                    Send-Json $stream 404 "Not Found" '{"error":"not_found"}' $origin
                }
            }
        }
        catch {
            try {
                $j = @{error="bridge_error";message=$_.Exception.Message} | ConvertTo-Json -Compress
                Send-Json $stream 500 "Internal Server Error" $j "*"
            } catch {}
        }
        finally {
            try { $client.Close() } catch {}
        }
    }
}
finally {
    try { $listener.Stop() } catch {}
}
