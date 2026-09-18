$ErrorActionPreference = "Stop"
$Cli = "C:\Nexon\MabinogiMobile\MabinogiMobile_CLI.exe"
$Port = 17891

if (-not (Test-Path $Cli)) {
    Write-Host "MabinogiMobile_CLI.exe 를 찾을 수 없습니다." -ForegroundColor Red
    Write-Host $Cli
    Read-Host "Enter"
    exit 1
}

function Send-Http {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$Code,
        [string]$Text,
        [string]$Body,
        [string]$Origin="*"
    )
    if ([string]::IsNullOrWhiteSpace($Origin)) { $Origin="*" }
    $bb=[Text.Encoding]::UTF8.GetBytes($Body)
    $h="HTTP/1.1 $Code $Text`r`n" +
       "Content-Type: application/json; charset=utf-8`r`n" +
       "Content-Length: $($bb.Length)`r`n" +
       "Access-Control-Allow-Origin: $Origin`r`n" +
       "Access-Control-Allow-Methods: GET, OPTIONS`r`n" +
       "Access-Control-Allow-Headers: Content-Type`r`n" +
       "Access-Control-Allow-Private-Network: true`r`n" +
       "Cache-Control: no-store`r`n" +
       "Connection: close`r`n`r`n"
    $hb=[Text.Encoding]::ASCII.GetBytes($h)
    $Stream.Write($hb,0,$hb.Length)
    if($bb.Length){$Stream.Write($bb,0,$bb.Length)}
    $Stream.Flush()
}

function Invoke-Mabi([string]$Command) {
    $out = & $Cli $Command 2>&1 | Out-String
    [pscustomobject]@{ Code=$LASTEXITCODE; Out=$out.Trim() }
}

$listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$Port)
try{$listener.Start()}catch{
    Write-Host "127.0.0.1:$Port 를 열 수 없습니다: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Enter"; exit 2
}

Write-Host ""
Write-Host "Mabinogi Web Bridge" -ForegroundColor Green
Write-Host "http://127.0.0.1:$Port" -ForegroundColor Yellow
Write-Host "GET /api/status"
Write-Host "GET /api/music-scores"
Write-Host "종료: Ctrl+C"
Write-Host ""

try{
while($true){
    $client=$listener.AcceptTcpClient()
    try{
        $stream=$client.GetStream()
        $reader=New-Object IO.StreamReader($stream,[Text.Encoding]::UTF8,$false,4096,$true)
        $line=$reader.ReadLine()
        if(-not $line){continue}
        $headers=@{}
        while($true){
            $x=$reader.ReadLine()
            if($null -eq $x -or $x -eq ""){break}
            $i=$x.IndexOf(":")
            if($i -gt 0){$headers[$x.Substring(0,$i).Trim()]=$x.Substring($i+1).Trim()}
        }
        $parts=$line.Split(" ")
        $method=$parts[0].ToUpperInvariant()
        $path=($parts[1] -split "\?")[0]
        $origin="*"
        foreach($k in $headers.Keys){if($k -ieq "Origin"){$origin=[string]$headers[$k]}}
        Write-Host "[$(Get-Date -Format HH:mm:ss)] $method $path Origin=$origin"

        if($method -eq "OPTIONS"){
            Send-Http $stream 204 "No Content" "" $origin
            continue
        }
        if($method -ne "GET"){
            Send-Http $stream 405 "Method Not Allowed" '{"error":"method_not_allowed"}' $origin
            continue
        }

        if($path -eq "/api/status"){
            $r=Invoke-Mabi "status"
            if($r.Code -eq 0){Send-Http $stream 200 "OK" $r.Out $origin}
            else{
                $j=@{error="cli_status_failed";exitCode=$r.Code;response=$r.Out}|ConvertTo-Json -Compress
                Send-Http $stream 503 "Service Unavailable" $j $origin
            }
        }
        elseif($path -eq "/api/music-scores"){
            $r=Invoke-Mabi "get_music_scores"
            if($r.Code -eq 0){Send-Http $stream 200 "OK" $r.Out $origin}
            else{
                $j=@{error="get_music_scores_failed";exitCode=$r.Code;response=$r.Out}|ConvertTo-Json -Compress
                Send-Http $stream 502 "Bad Gateway" $j $origin
            }
        }
        else{Send-Http $stream 404 "Not Found" '{"error":"not_found"}' $origin}
    }catch{
        try{
            $j=@{error="bridge_error";message=$_.Exception.Message}|ConvertTo-Json -Compress
            Send-Http $stream 500 "Internal Server Error" $j "*"
        }catch{}
    }finally{try{$client.Close()}catch{}}
}
}finally{try{$listener.Stop()}catch{}}
