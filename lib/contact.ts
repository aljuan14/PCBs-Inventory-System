/**
 * The admin's contact (NEXT_PUBLIC_KONTAK_ADMIN, set in Vercel, not in the
 * public repo): a WhatsApp number (08… / 62…), an email, or a link. Null when
 * unset, so the text stays plain.
 */
export function adminContactLink(message = 'Halo admin, saya butuh bantuan akun Sistem Inventarisasi PCBs.') {
  const contact = process.env.NEXT_PUBLIC_KONTAK_ADMIN?.trim();
  if (!contact) return null;
  if (/^https?:\/\//i.test(contact)) return contact;
  if (contact.includes('@')) return `mailto:${contact}`;
  const digits = contact.replace(/\D/g, '').replace(/^0/, '62');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}
