/**
 * SMS Dispatch Service for Sabjies OTP System
 * Supports Fast2SMS, MSG91, and Twilio SMS gateways with graceful fallbacks.
 */

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  provider?: string;
  simulated?: boolean;
  error?: string;
  unconfigured?: boolean;
}

import { saveEncryptedOtp, retrieveDecryptedOtp, resetTestOtpStore } from '../utils/testOtpVault';

export function isSmsConfigured(): boolean {
  if (process.env.NODE_ENV !== 'production' && (process.env.SMS_PROVIDER === 'test' || process.env.ALLOW_TEST_OTP_SIMULATION === 'true')) {
    return true;
  }
  if (process.env.FAST2SMS_API_KEY) return true;
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) return true;
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) return true;
  return false;
}

/**
 * Record test OTP for server-side test harness only using AES-256-GCM encryption.
 * Plaintext OTP is never stored on disk or exposed.
 */
export function recordTestOtp(identifier: string, otp: string) {
  saveEncryptedOtp(identifier, otp);
}

/**
 * Retrieve decrypted OTP strictly for automated test verification in test runners.
 */
export function getTestOtpForRunner(identifier: string): string | null {
  return retrieveDecryptedOtp(identifier);
}

/**
 * Clear test OTP records.
 */
export function clearTestOtpStore() {
  resetTestOtpStore();
}

/**
 * Send SMS OTP using configured gateway.
 * Never claims OTP was sent if provider is unconfigured or returns an error.
 */
export async function sendSmsOtp(
  rawPhone: string,
  otp: string
): Promise<SmsSendResult> {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  const cleanPhone = digits.length > 10 ? digits.slice(-10) : digits;
  if (!cleanPhone || cleanPhone.length !== 10) {
    return {
      success: false,
      error: 'Invalid 10-digit mobile number format.'
    };
  }

  // 1. Check for automated test simulation mode (strictly non-production)
  if (process.env.NODE_ENV !== 'production' && (process.env.SMS_PROVIDER === 'test' || process.env.ALLOW_TEST_OTP_SIMULATION === 'true')) {
    recordTestOtp(cleanPhone, otp);
    return {
      success: true,
      messageId: `test_sms_${Date.now()}`,
      provider: 'TestSimulator',
      simulated: true
    };
  }

  // 2. Fast2SMS Provider
  if (process.env.FAST2SMS_API_KEY) {
    try {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': process.env.FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: otp,
          numbers: cleanPhone
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.return === true) {
        return {
          success: true,
          messageId: data.request_id || `f2s_${Date.now()}`,
          provider: 'Fast2SMS'
        };
      } else {
        const errorDetail = Array.isArray(data?.message) ? data.message.join(', ') : (data?.message || 'Fast2SMS gateway error');
        console.error('Fast2SMS dispatch error:', errorDetail);
        return {
          success: false,
          error: `SMS transmission failed: ${errorDetail}`,
          provider: 'Fast2SMS'
        };
      }
    } catch (err: any) {
      console.error('Fast2SMS network error:', err?.message || err);
      return {
        success: false,
        error: `Fast2SMS network failure: ${err?.message || 'Connection error'}`,
        provider: 'Fast2SMS'
      };
    }
  }

  // 3. MSG91 Provider
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) {
    try {
      const url = new URL('https://api.msg91.com/api/v5/otp');
      url.searchParams.set('template_id', process.env.MSG91_TEMPLATE_ID);
      url.searchParams.set('mobile', `91${cleanPhone}`);
      url.searchParams.set('authkey', process.env.MSG91_AUTH_KEY);
      url.searchParams.set('otp', otp);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && (data?.type === 'success' || data?.message === 'OTP sent successfully')) {
        return {
          success: true,
          messageId: data.request_id || `msg91_${Date.now()}`,
          provider: 'MSG91'
        };
      } else {
        const errorMsg = data?.message || 'MSG91 rejection';
        console.error('MSG91 error:', errorMsg);
        return {
          success: false,
          error: `SMS transmission failed: ${errorMsg}`,
          provider: 'MSG91'
        };
      }
    } catch (err: any) {
      console.error('MSG91 network error:', err?.message || err);
      return {
        success: false,
        error: `MSG91 network failure: ${err?.message || 'Connection error'}`,
        provider: 'MSG91'
      };
    }
  }

  // 4. Twilio Provider
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_FROM_NUMBER;
      const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

      const formattedTo = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
      const params = new URLSearchParams();
      params.append('To', formattedTo);
      params.append('From', fromNumber);
      params.append('Body', `Your Sabjies OTP verification code is ${otp}. This code expires in 5 minutes. Do not share it with anyone.`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.sid) {
        return {
          success: true,
          messageId: data.sid,
          provider: 'Twilio'
        };
      } else {
        const errorMsg = data?.message || 'Twilio delivery error';
        console.error('Twilio SMS error:', errorMsg);
        return {
          success: false,
          error: `SMS transmission failed: ${errorMsg}`,
          provider: 'Twilio'
        };
      }
    } catch (err: any) {
      console.error('Twilio network error:', err?.message || err);
      return {
        success: false,
        error: `Twilio network failure: ${err?.message || 'Connection error'}`,
        provider: 'Twilio'
      };
    }
  }

  // Provider not configured - return honest unconfigured state
  return {
    success: false,
    unconfigured: true,
    error: 'SMS verification is currently unavailable because the SMS gateway is not configured. Please contact support at greensabjies@gmail.com or 99203 24172 for assistance.'
  };
}
