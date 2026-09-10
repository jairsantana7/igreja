export function buildPublicEventUrl(origin: string, publicId: string): string {
  return `${origin.replace(/\/+$/, '')}/e/${encodeURIComponent(publicId)}`;
}

export function publicEventQrFilename(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'evento';
  return `qrcode-${slug}.png`;
}
