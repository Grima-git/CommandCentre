import fs from "node:fs";
import path from "node:path";

export type Contact = {
  name: string;
  phone: string;
};

const CONTACTS_PATH = path.join(process.cwd(), "data", "contacts.json");

function normalizePhone(phone: string): string {
  return phone.trim().replace(/\s+/g, "");
}

function ensureContactsFile() {
  if (!fs.existsSync(path.dirname(CONTACTS_PATH))) {
    fs.mkdirSync(path.dirname(CONTACTS_PATH), { recursive: true });
  }
  if (!fs.existsSync(CONTACTS_PATH)) {
    fs.writeFileSync(
      CONTACTS_PATH,
      JSON.stringify([{ name: "Thomas", phone: "07493758474" }], null, 2),
    );
  }
}

export function getContacts(): Contact[] {
  ensureContactsFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(CONTACTS_PATH, "utf8")) as Contact[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((contact) => contact.name && contact.phone)
      .map((contact) => ({ name: contact.name.trim(), phone: normalizePhone(contact.phone) }));
  } catch {
    return [];
  }
}

export function findContactByName(name: string): Contact | null {
  const normalized = name.trim().toLowerCase();
  return getContacts().find((contact) => contact.name.toLowerCase() === normalized) ?? null;
}

export function upsertContact(contact: Contact): Contact {
  const next = { name: contact.name.trim(), phone: normalizePhone(contact.phone) };
  const contacts = getContacts();
  const existing = contacts.findIndex((item) => item.name.toLowerCase() === next.name.toLowerCase());
  if (existing >= 0) contacts[existing] = next;
  else contacts.push(next);
  ensureContactsFile();
  fs.writeFileSync(CONTACTS_PATH, JSON.stringify(contacts, null, 2));
  return next;
}
