$ErrorActionPreference = "Stop"

$secureToken = Read-Host "Telegram bot token" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "Telegram bot token cannot be empty."
    }

    $webhookSecret = [Convert]::ToHexString(
        [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    ).ToLowerInvariant()

    $token | npx wrangler secret put TELEGRAM_BOT_TOKEN
    if ($LASTEXITCODE -ne 0) { throw "Could not store TELEGRAM_BOT_TOKEN." }

    $webhookSecret | npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
    if ($LASTEXITCODE -ne 0) { throw "Could not store TELEGRAM_WEBHOOK_SECRET." }

    $webhookUrl = "https://farmisarja-fpl-api.vetoliiga.workers.dev/telegram/webhook"
    $result = Invoke-RestMethod -Method Post `
        -Uri "https://api.telegram.org/bot$token/setWebhook" `
        -ContentType "application/json" `
        -Body (@{
            url = $webhookUrl
            secret_token = $webhookSecret
            allowed_updates = @("message", "edited_message")
            drop_pending_updates = $true
        } | ConvertTo-Json)

    if (-not $result.ok) { throw "Telegram rejected the webhook registration." }
    Write-Host "Telegram webhook registered successfully: $webhookUrl" -ForegroundColor Green
    Write-Host "Automatic notifications remain disabled." -ForegroundColor Yellow
}
finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    Remove-Variable token -ErrorAction SilentlyContinue
    Remove-Variable webhookSecret -ErrorAction SilentlyContinue
}
