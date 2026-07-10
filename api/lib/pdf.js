import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { uploadBuffer as uploadS3Buffer, isS3Configured } from './s3.js';
import { uploadBase64, isCloudinaryConfigured } from './cloudinary.js';
import crypto from 'crypto';

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

export async function generateSignedContractPdf(contract, tenantName, clientName) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 48;

  page.drawText('VERELI SIGNED AGREEMENT', {
    x: 48,
    y,
    size: 22,
    font: boldFont,
    color: rgb(0.04, 0.31, 0.32)
  });
  y -= 36;

  page.drawText(`Contract: ${contract.title || 'Untitled'}`, {
    x: 48,
    y,
    size: 14,
    font: boldFont
  });
  y -= 22;

  page.drawText(`Client: ${clientName || '—'}`, { x: 48, y, size: 11, font });
  y -= 16;
  page.drawText(`Workspace: ${tenantName || '—'}`, { x: 48, y, size: 11, font });
  y -= 16;
  page.drawText(`Sent: ${formatDate(contract.sent_at)}`, { x: 48, y, size: 11, font });
  y -= 16;
  page.drawText(`Signed by: ${contract.signed_by || '—'}`, { x: 48, y, size: 11, font });
  y -= 16;
  page.drawText(`Signed at: ${formatDate(contract.signed_at)}`, { x: 48, y, size: 11, font });
  y -= 16;
  page.drawText(`IP address: ${contract.signed_ip || '—'}`, { x: 48, y, size: 11, font });
  y -= 36;

  page.drawText('Agreement Content', { x: 48, y, size: 12, font: boldFont });
  y -= 18;

  const content = contract.content || '';
  const maxWidth = width - 96;
  const lines = page.drawText ? [] : [];
  // Use simple word wrapping
  const words = content.split(/\s+/);
  const lineHeight = 14;
  let currentLine = '';
  for (const word of words) {
    const test = currentLine ? currentLine + ' ' + word : word;
    const textWidth = font.widthOfTextAtSize(test, 10);
    if (textWidth > maxWidth) {
      if (currentLine) page.drawText(currentLine, { x: 48, y, size: 10, font });
      currentLine = word;
      y -= lineHeight;
      if (y < 60) {
        page = pdfDoc.addPage();
        y = page.getSize().height - 48;
      }
    } else {
      currentLine = test;
    }
  }
  if (currentLine) page.drawText(currentLine, { x: 48, y, size: 10, font });

  y -= 40;
  if (y < 120) {
    page = pdfDoc.addPage();
    y = page.getSize().height - 48;
  }

  page.drawText('Signature Acknowledgement', { x: 48, y, size: 12, font: boldFont });
  y -= 18;
  page.drawText(
    `I, ${contract.signed_by || 'the undersigned'}, acknowledge that I have read, understood, and agree to the terms above.`,
    { x: 48, y, size: 10, font, maxWidth }
  );
  y -= 50;

  if (contract.signature_data && contract.signature_type === 'drawn') {
    try {
      const sigImage = await pdfDoc.embedPng(contract.signature_data);
      page.drawImage(sigImage, { x: 48, y: y - 40, width: 160, height: 60 });
    } catch (e) {
      page.drawText('[Signature image]', { x: 48, y, size: 10, font });
    }
  } else if (contract.signature_data && contract.signature_type === 'typed') {
    page.drawText(`Typed signature: ${contract.signature_data}`, { x: 48, y, size: 12, font: boldFont });
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

export async function uploadSignedPdf(tenantId, contractId, pdfBytes, name) {
  const buffer = Buffer.from(pdfBytes);
  const ext = 'pdf';
  const fileName = name || `contract-${contractId}-signed.pdf`;

  if (isCloudinaryConfigured()) {
    return await uploadBase64(fileName, buffer.toString('base64'), 'application/pdf');
  }

  if (isS3Configured()) {
    const key = `tenants/${tenantId}/contracts/${contractId}-${crypto.randomUUID()}.${ext}`;
    return await uploadS3Buffer(key, buffer, 'application/pdf');
  }

  throw new Error('File storage is not configured');
}
