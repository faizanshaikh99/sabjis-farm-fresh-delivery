import jsPDF from 'jspdf';
import { Order } from '../types';

interface BusinessSettings {
  businessName?: string;
  address?: string;
  supportPhone?: string;
  supportEmail?: string;
  website?: string;
  gstNumber?: string;
  fssaiLicense?: string;
  businessRegistrationNumber?: string;
}

/**
 * Fast, lightweight, black-and-white receipt/invoice PDF generator.
 * Operates purely in vector space via jsPDF in under 50ms without DOM rasterization.
 */
export const generateInvoicePdf = async (
  order: Order,
  businessSettings?: BusinessSettings
): Promise<void> => {
  if (!order || !order.id) {
    throw new Error('Invalid order data provided for PDF generation');
  }

  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2; // 180mm

  // Ensure solid black text and crisp lines
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  let y = margin;

  // Auto page break helper
  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`INVOICE INV-${order.id.toUpperCase()} (Contd.)`, margin, y);
      y += 5;
      doc.setLineWidth(0.2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
      return true;
    }
    return false;
  };

  // Header - Company Name
  const companyName = (businessSettings?.businessName || 'Sabjies').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(companyName, pageWidth / 2, y, { align: 'center' });
  y += 5.5;

  // Header Contact Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const supportPhone = businessSettings?.supportPhone || '99203 24172';
  const supportEmail = businessSettings?.supportEmail || 'greensabjies@gmail.com';
  doc.text(`Phone: ${supportPhone}  |  Email: ${supportEmail}`, pageWidth / 2, y, { align: 'center' });
  y += 4;

  // Subtitle / Address
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const addressText = businessSettings?.address || 'Ghatkopar East, Mumbai, Maharashtra 400075';
  const addressLines = doc.splitTextToSize(addressText, 160);
  addressLines.forEach((line: string) => {
    doc.text(line, pageWidth / 2, y, { align: 'center' });
    y += 3.5;
  });

  if (businessSettings?.gstNumber || businessSettings?.fssaiLicense) {
    const creds = [
      businessSettings.gstNumber ? `GSTIN: ${businessSettings.gstNumber}` : '',
      businessSettings.fssaiLicense ? `FSSAI: ${businessSettings.fssaiLicense}` : ''
    ].filter(Boolean).join('  |  ');
    doc.text(creds, pageWidth / 2, y, { align: 'center' });
    y += 3.5;
  }

  y += 1.5;

  // Double Divider Line
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 1.2;
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Metadata Grid
  const formattedDate = new Date(order.createdAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const invoiceNo = `INV-${order.id.toUpperCase()}`;

  // Customer Name Extraction with full fallback chain
  const customerName = (
    order.userName ||
    (order as any).customerName ||
    (order as any).name ||
    (order as any).customer ||
    order.userEmail ||
    'Walk-in Customer'
  ).trim();

  doc.setFontSize(8.5);

  // Line 1: Invoice No & Order No
  doc.setFont('helvetica', 'bold');
  doc.text(`Invoice No : ${invoiceNo}`, margin, y);
  doc.text(`Order No   : #${order.id}`, pageWidth - margin, y, { align: 'right' });
  y += 4.5;

  // Line 2: Date & Payment Method/Status
  doc.setFont('helvetica', 'normal');
  doc.text(`Date       : ${formattedDate}`, margin, y);
  doc.text(`Payment    : ${order.payment || 'COD'} (${order.paymentStatus || 'Paid'})`, pageWidth - margin, y, { align: 'right' });
  y += 4.5;

  // Line 3+: Customer Name (Wrapped onto next line if long)
  doc.setFont('helvetica', 'bold');
  doc.text('Customer   : ', margin, y);
  doc.setFont('helvetica', 'normal');
  const custLabelWidth = 22;
  const custLines = doc.splitTextToSize(customerName, contentWidth - custLabelWidth);
  custLines.forEach((line: string, idx: number) => {
    if (idx === 0) {
      doc.text(line, margin + custLabelWidth, y);
    } else {
      y += 4.2;
      doc.text(line, margin + custLabelWidth, y);
    }
  });
  y += 4.5;

  // Phone Number
  if (order.phone) {
    doc.setFont('helvetica', 'bold');
    doc.text('Phone      : ', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(order.phone, margin + custLabelWidth, y);
    y += 4.5;
  }

  // Delivery Address
  if (order.address) {
    doc.setFont('helvetica', 'bold');
    doc.text('Address    : ', margin, y);
    doc.setFont('helvetica', 'normal');
    const addrLines = doc.splitTextToSize(order.address, contentWidth - custLabelWidth);
    addrLines.forEach((line: string, idx: number) => {
      if (idx === 0) {
        doc.text(line, margin + custLabelWidth, y);
      } else {
        y += 4.2;
        doc.text(line, margin + custLabelWidth, y);
      }
    });
    y += 4.5;
  }

  // Cashier / Source
  const cashierName = (order as any).cashier || 'Online Order';
  doc.setFont('helvetica', 'bold');
  doc.text('Cashier    : ', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(cashierName, margin + custLabelWidth, y);
  y += 4.5;

  y += 1;
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Items Table Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  const colQty = margin;
  const colItem = margin + 14;
  const colRate = margin + 125;
  const colTotal = pageWidth - margin;

  doc.text('QTY', colQty, y);
  doc.text('ITEM DESCRIPTION', colItem, y);
  doc.text('PRICE (Rs.)', colRate, y, { align: 'right' });
  doc.text('TOTAL (Rs.)', colTotal, y, { align: 'right' });
  y += 2.5;

  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4.5;

  // Items Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  const items = order.items || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    checkPageBreak(10);

    const qtyStr = `${item.qty || 1}`;
    const rateStr = `${item.sp || 0}`;
    const totalStr = `${(item.sp || 0) * (item.qty || 1)}`;

    // Safe extraction of product name across any data structure
    const rawName = (
      item.name ??
      (item as any).productName ??
      (item as any).product_name ??
      (item as any).title ??
      (item as any).productTitle ??
      (item as any).itemName ??
      (item as any).item_name ??
      ''
    );

    let cleanName = typeof rawName === 'string' ? rawName.trim() : String(rawName || '').trim();

    // Safely remove emoji characters so jsPDF default fonts render clean vector text without distortion
    if (cleanName) {
      const strippedEmoji = cleanName
        .replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/gu, '')
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (strippedEmoji && strippedEmoji !== '()' && strippedEmoji !== '( )') {
        cleanName = strippedEmoji;
      }
    }

    if (!cleanName || cleanName === '()' || cleanName === '( )') {
      cleanName = 'Product unavailable';
    }

    const itemNameLines = doc.splitTextToSize(cleanName, 105);

    doc.text(qtyStr, colQty, y);
    doc.text(itemNameLines[0], colItem, y);
    doc.text(rateStr, colRate, y, { align: 'right' });
    doc.text(totalStr, colTotal, y, { align: 'right' });

    y += 4.5;

    for (let j = 1; j < itemNameLines.length; j++) {
      doc.text(itemNameLines[j], colItem, y);
      y += 4;
    }
  }

  y += 1;
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Totals Section
  checkPageBreak(32);

  const rightAlignX = pageWidth - margin;
  const labelAlignX = pageWidth - margin - 50;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  doc.text('Subtotal:', labelAlignX, y);
  doc.text(`Rs. ${order.subtotal}`, rightAlignX, y, { align: 'right' });
  y += 4.5;

  if (order.discountApplied && order.discountApplied > 0) {
    doc.text(`Discount (${order.couponApplied || 'SAVINGS'}):`, labelAlignX, y);
    doc.text(`- Rs. ${order.discountApplied}`, rightAlignX, y, { align: 'right' });
    y += 4.5;
  }

  doc.text('Delivery Fee:', labelAlignX, y);
  doc.text(order.delivery === 0 ? 'FREE' : `Rs. ${order.delivery}`, rightAlignX, y, { align: 'right' });
  y += 4.5;

  doc.setLineWidth(0.3);
  doc.line(labelAlignX - 5, y, pageWidth - margin, y);
  y += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Grand Total:', labelAlignX, y);
  doc.text(`Rs. ${order.total}`, rightAlignX, y, { align: 'right' });
  y += 5;

  doc.setLineWidth(0.3);
  doc.line(labelAlignX - 5, y, pageWidth - margin, y);
  y += 7;

  // Footer / Thank you
  checkPageBreak(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Thank You! Visit Again.', pageWidth / 2, y, { align: 'center' });
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('This is a computer generated tax receipt.', pageWidth / 2, y, { align: 'center' });
  y += 3.5;

  const phoneStr = businessSettings?.supportPhone || '99203 24172';
  const emailStr = businessSettings?.supportEmail || 'greensabjies@gmail.com';
  const supportParts = `Sabjies  |  Phone: ${phoneStr}  |  Email: ${emailStr}`;
  doc.text(supportParts, pageWidth / 2, y, { align: 'center' });

  // File output name format: Invoice_INV-000123.pdf
  const filename = `Invoice_${invoiceNo}.pdf`;
  doc.save(filename);
};
