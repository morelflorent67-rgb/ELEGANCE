// Fichier d'agenda (.ics, RFC 5545) pour « Ajouter à l'agenda » (R-60).

export interface IcsEvent {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string;
  location?: string;
  /** Instant de création du fichier ; paramétrable pour des tests déterministes. */
  stamp?: Date;
  /** Numéro de version (0 au départ, +1 à chaque déplacement) : un agenda remplace l'ancien événement au lieu d'en ajouter un. */
  sequence?: number;
}

const utc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Les lignes de plus de 75 octets sont repliées : CRLF suivi d'une espace. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Ne coupe pas au milieu d'un caractère UTF-8 (octets de continuation 10xxxxxx).
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // la ligne de continuation commence par une espace
  }
  return parts.join("\r\n ");
}

const eventLines = (event: IcsEvent) => [
  "BEGIN:VEVENT",
  `UID:${event.uid}`,
  `SEQUENCE:${event.sequence ?? 0}`,
  `DTSTAMP:${utc(event.stamp ?? new Date())}`,
  `DTSTART:${utc(event.startsAt)}`,
  `DTEND:${utc(event.endsAt)}`,
  `SUMMARY:${escapeText(event.summary)}`,
  ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
  ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
  "STATUS:CONFIRMED",
  "END:VEVENT",
];

/** Un fichier pour un ou plusieurs RDV : une série s'ajoute à l'agenda en une fois (D-91). */
export function buildIcs(events: IcsEvent | IcsEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Elegance Strasbourg//Reservation//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(Array.isArray(events) ? events : [events]).flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
