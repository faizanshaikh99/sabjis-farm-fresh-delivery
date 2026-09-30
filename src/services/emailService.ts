import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

// Check if production email sending is configured
export function isEmailConfigured(): boolean {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return Boolean(host && user && pass);
}

// Get or build nodemailer transporter
function getTransporter() {
  if (!isEmailConfigured()) return null;

  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    // Safe timeout for serverless/containerized deployments
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000
  });
}

/**
 * Send an email with automatic graceful fallback if credentials are not configured.
 * Never throws an uncaught error.
 */
export async function sendEmail(options: EmailOptions): Promise<EmailSendResult> {
  const { to, subject, html, text } = options;

  if (!isEmailConfigured()) {
    console.info(`ℹ️ [Email Service Notice] SMTP not configured. Simulated email to <${to}>: "${subject}"`);
    return {
      success: true,
      simulated: true
    };
  }

  try {
    const transporter = getTransporter();
    if (!transporter) {
      return { success: true, simulated: true };
    }

    const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER || 'Sabjies Fresh <noreply@sabjies.in>';
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ' ')
    });

    console.log(`✅ [Email Service] Dispatched email to <${to}> (Message ID: ${info.messageId})`);
    return {
      success: true,
      messageId: info.messageId,
      simulated: false
    };
  } catch (err: any) {
    console.error(`❌ [Email Service Error] Failed sending to <${to}>:`, err?.message || err);
    return {
      success: false,
      error: err?.message || 'SMTP transmission failure'
    };
  }
}

/**
 * Send secure password reset link to customer
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  data: {
    userName?: string;
    resetUrl: string;
    token: string;
    requestId: string;
  }
): Promise<EmailSendResult> {
  const name = data.userName || 'Valued Customer';
  const subject = '🔒 Sabjies - Secure Password Reset Link';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #16a34a; font-size: 26px; margin: 0; font-weight: 800;">🥬 Sabjies</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Direct Farm Fresh Produce</p>
      </div>

      <div style="padding: 20px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
        <p style="font-size: 16px; color: #1e293b; margin: 0 0 16px 0;">Hello <strong>${name}</strong>,</p>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
          We received a request to reset your password for your Sabjies account. Click the secure button below to set a new password. This link is valid for 1 hour.
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${data.resetUrl}" style="background-color: #16a34a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.2);">
            Reset My Password
          </a>
        </div>

        <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0 0 12px 0;">
          If the button does not work, copy and paste this link into your browser:<br/>
          <a href="${data.resetUrl}" style="color: #16a34a; word-break: break-all;">${data.resetUrl}</a>
        </p>
      </div>

      <div style="margin-top: 20px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
        <p style="margin: 0 0 6px 0;"><strong>Security Notice:</strong> If you did not request this password reset, please ignore this email or contact support. Your password has not been changed.</p>
        <p style="margin: 0;">Request ID: <code>${data.requestId}</code></p>
      </div>
    </div>
  `;

  return sendEmail({
    to: toEmail,
    subject,
    html
  });
}

/**
 * Send order confirmation email
 */
export async function sendOrderConfirmationEmail(
  toEmail: string,
  order: any
): Promise<EmailSendResult> {
  const subject = `🎉 Order #${order.id} Confirmed - Sabjies Fresh`;
  const itemsHtml = (order.items || [])
    .map(
      (it: any) =>
        `<tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${it.emoji || '🥬'} ${it.name} (${it.weight || it.weightLabel || ''})</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; text-align: center;">${it.quantity || it.qty || 1}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600;">₹${it.itemTotal || it.lineTotal || it.price}</td>
        </tr>`
    )
    .join('');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #16a34a; font-size: 26px; margin: 0; font-weight: 800;">🥬 Sabjies</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Farm Fresh Vegetable Delivery</p>
      </div>

      <div style="background-color: #f0fdf4; border-radius: 12px; padding: 16px; margin-bottom: 20px; text-align: center;">
        <h2 style="color: #15803d; font-size: 18px; margin: 0 0 6px 0;">Order #${order.id} Confirmed!</h2>
        <p style="color: #166534; font-size: 13px; margin: 0;">Payment: <strong>${order.paymentStatus || 'Confirmed'}</strong> | Total: <strong>₹${order.total}</strong></p>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
        <thead>
          <tr style="color: #64748b; text-align: left; border-bottom: 2px solid #e2e8f0;">
            <th style="padding-bottom: 8px;">Item</th>
            <th style="padding-bottom: 8px; text-align: center;">Qty</th>
            <th style="padding-bottom: 8px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="font-size: 14px; color: #334155; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        <p style="margin: 0;"><strong>Delivery Address:</strong> ${order.address || 'Standard Delivery'}</p>
        <p style="margin: 4px 0 0 0;"><strong>Estimated Delivery:</strong> Within 12-24 hours</p>
      </div>

      <div style="margin-top: 24px; text-align: center; font-size: 12px; color: #94a3b8;">
        Thank you for choosing farm fresh healthy eating! 🥬
      </div>
    </div>
  `;

  return sendEmail({
    to: toEmail,
    subject,
    html
  });
}
