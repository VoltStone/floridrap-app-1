'use strict';

// These templates interpolate user-supplied data (names, addresses)
// outside of EJS's automatic escaping, so it's done by hand here. Same
// principle as the rest of the app: never trust stored text to be safe
// to drop into HTML as-is.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BRAND_COLOR = '#a37797';

function wrapper(bodyHtml) {
  return `
  <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #17141a;">
    <div style="text-align:center; margin-bottom: 24px;">
      <span style="font-size: 20px; font-weight: 700; color: ${BRAND_COLOR};">Floridrap Plus</span>
    </div>
    ${bodyHtml}
    <p style="margin-top: 32px; font-size: 12px; color: #8a8590; text-align: center;">
      Floridrap Plus — Linge de maison, Tunisie
    </p>
  </div>`;
}

function verificationEmail({ name, verifyUrl }) {
  const safeName = escapeHtml(name);
  const html = wrapper(`
    <h1 style="font-size: 20px; margin-bottom: 12px;">Bonjour ${safeName},</h1>
    <p style="font-size: 15px; line-height: 1.6;">
      Merci de vous être inscrit(e) sur Floridrap Plus. Veuillez confirmer votre adresse e-mail
      en cliquant sur le bouton ci-dessous pour activer votre compte.
    </p>
    <div style="text-align:center; margin: 28px 0;">
      <a href="${verifyUrl}" style="background:${BRAND_COLOR}; color:#fff; text-decoration:none; padding: 14px 28px; border-radius: 999px; font-size: 14px; display:inline-block;">
        Confirmer mon adresse e-mail
      </a>
    </div>
    <p style="font-size: 13px; color: #5c5763; line-height: 1.6;">
      Ce lien est valable 24 heures. Si vous n'avez pas créé de compte sur Floridrap Plus,
      vous pouvez ignorer cet e-mail.
    </p>
  `);
  const text = `Bonjour ${name},\n\nConfirmez votre adresse e-mail en ouvrant ce lien (valable 24h) :\n${verifyUrl}\n\nSi vous n'avez pas créé de compte, ignorez cet e-mail.`;
  return { subject: 'Confirmez votre adresse e-mail — Floridrap Plus', html, text };
}

function orderConfirmationEmail({ order, items }) {
  const safeName = escapeHtml(order.full_name);
  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #efe9ec; font-size: 14px;">
          ${escapeHtml(item.product_name)} × ${item.quantity}<br>
          <span style="color:#8a8590; font-size:12px;">${escapeHtml(item.size)} · ${escapeHtml(item.color)}</span>
        </td>
        <td style="padding: 8px 0; border-bottom: 1px solid #efe9ec; font-size: 14px; text-align:right;">
          ${((item.unit_price_cents * item.quantity) / 100).toFixed(3)} DT
        </td>
      </tr>`
    )
    .join('');

  const html = wrapper(`
    <h1 style="font-size: 20px; margin-bottom: 12px;">Merci pour votre commande, ${safeName} !</h1>
    <p style="font-size: 15px;">Commande n° <strong>${escapeHtml(order.order_number)}</strong></p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      ${itemRows}
    </table>
    <table style="width:100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="padding: 4px 0; color:#5c5763;">Sous-total</td>
        <td style="padding: 4px 0; text-align:right;">${(order.subtotal_cents / 100).toFixed(3)} DT</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color:#5c5763;">Livraison</td>
        <td style="padding: 4px 0; text-align:right;">+${((order.total_cents - order.subtotal_cents) / 100).toFixed(3)} DT</td>
      </tr>
    </table>
    <p style="font-size: 16px; font-weight: 700; text-align:right;">
      Total : ${(order.total_cents / 100).toFixed(3)} DT
    </p>
    <p style="font-size: 14px; color:#5c5763; line-height:1.6; margin-top: 20px;">
      Livraison à : ${escapeHtml(order.address)}, ${escapeHtml(order.city)}, ${escapeHtml(order.governorate)}<br>
      Paiement à la livraison (espèces) — vous serez livré(e) sous 2 à 4 jours.
    </p>
  `);

  const text = `Merci pour votre commande, ${order.full_name} !\nCommande n° ${order.order_number}\nSous-total : ${(order.subtotal_cents / 100).toFixed(3)} DT\nLivraison : +${((order.total_cents - order.subtotal_cents) / 100).toFixed(3)} DT\nTotal : ${(order.total_cents / 100).toFixed(3)} DT\nLivraison à : ${order.address}, ${order.city}, ${order.governorate}\nPaiement à la livraison.`;

  return { subject: `Confirmation de commande ${order.order_number} — Floridrap Plus`, html, text };
}

module.exports = { verificationEmail, orderConfirmationEmail };
