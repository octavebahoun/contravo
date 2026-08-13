# Webhook Troubleshooting Guide

This guide helps you debug and verify GeniusPay webhook deliveries and resolve processing errors.

## Examining Webhook Event Logs

All incoming webhook attempts are stored in the `payment_webhook_events` database table. Run the following SQL query to inspect the status of recent webhooks:

```sql
SELECT 
  id, 
  event_type, 
  signature_valid, 
  processed_at, 
  processing_error, 
  received_from_ip 
FROM payment_webhook_events 
ORDER BY received_at DESC 
LIMIT 10;
```

---

## Troubleshooting Processing Errors

Below are common error values logged in `processing_error` and how to resolve them:

### 1. `timestamp_expired`
- **Cause**: The `x-webhook-timestamp` header indicates that the request was generated more than 300 seconds ago.
- **Remedy**: Ensure the webhook sender server time is synchronized with NTP. If debugging locally with old mocked webhooks, regenerate the timestamp using the current unix time (`Math.floor(Date.now() / 1000)`).

### 2. `org_not_found`
- **Cause**: The metadata object in the payload does not contain a valid `organization_id` or `org_id`.
- **Remedy**: Check that the `metadata` sent during payment intent creation includes the correct `organization_id`.

### 3. `credentials_not_found`
- **Cause**: The organization does not have active GeniusPay credentials matching the event environment (`sandbox` or `live`).
- **Remedy**: Verify gateway configuration in settings.

### 4. `invalid_signature`
- **Cause**: The HMAC signature verification failed.
- **Remedy**:
  - Check if the correct Webhook Secret Key is configured for the organization.
  - Verify that the signed payload matches the exact raw HTTP request body (any white space changes will invalidate the signature).

### 5. `duplicate` (early DB constraint trigger)
- **Cause**: The webhook `event_id` has already been processed.
- **Remedy**: No action needed. The server returns HTTP 200 to acknowledge.

### 6. `amount_mismatch`
- **Cause**: The payment amount in the remote lookup `GET /payments/{ref}` does not match the local intent amount.
- **Remedy**: CRITICAL security warning. This suggests payload tampering. Verify details on the GeniusPay merchant dashboard.

---

## Testing & Replaying Webhooks

To manually test the webhook handler, construct a request to `POST /api/v1/webhooks/geniuspay`:

1. Set headers:
   - `Content-Type: application/json`
   - `X-Webhook-Event: payment.success`
   - `X-Webhook-Timestamp: <current_unix_timestamp>`
   - `X-Webhook-Signature: <hmac_sha256(timestamp + '.' + raw_body, webhook_secret)>`
   - `X-Webhook-Environment: sandbox`

2. Send the raw payload JSON.
