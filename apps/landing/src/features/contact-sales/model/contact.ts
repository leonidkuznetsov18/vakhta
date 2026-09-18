export const ContactIntent = { PILOT: 'pilot', DEMO: 'demo', INVESTOR: 'investor' } as const;
export type ContactIntent = (typeof ContactIntent)[keyof typeof ContactIntent];

export type SalesContact = { email: string; operator: string | null };

export function readSalesContact(email: unknown, operator: unknown): SalesContact | null {
  if (typeof email !== 'string') return null;
  const address = email.trim();
  const name = typeof operator === 'string' ? operator.trim() : null;
  if (!/^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}$/i.test(address)) {
    return null;
  }
  if (name && /[\r\n]/.test(name)) return null;
  return { email: address, operator: name };
}

export function contactHref(contact: SalesContact | null, subject: string, body: string): string {
  if (!contact) return '#contact';
  return `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
