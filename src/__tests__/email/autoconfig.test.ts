/**
 * @jest-environment node
 */
import { parseISPDBXml } from '@/lib/email/autoconfig';

describe('parseISPDBXml', () => {
  it('parses a standard Mozilla ISPDB doc with IMAP + SMTP', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="example.com">
    <domain>example.com</domain>
    <displayName>Example Mail</displayName>
    <incomingServer type="imap">
      <hostname>imap.example.com</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.example.com</hostname>
      <port>587</port>
      <socketType>STARTTLS</socketType>
      <authentication>password-cleartext</authentication>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;
    const result = parseISPDBXml(xml);
    expect(result).not.toBeNull();
    expect(result!.imap).toEqual({ host: 'imap.example.com', port: 993, secure: true });
    expect(result!.smtp.host).toBe('smtp.example.com');
    expect(result!.smtp.port).toBe(587);
    expect(result!.source).toBe('ispdb');
    expect(result!.providerName).toBe('Example Mail');
  });

  it('returns null when the XML is missing an IMAP incoming server', () => {
    const xml = `<?xml version="1.0"?><clientConfig>
      <emailProvider><outgoingServer type="smtp"><hostname>smtp.x</hostname><port>587</port></outgoingServer></emailProvider>
    </clientConfig>`;
    expect(parseISPDBXml(xml)).toBeNull();
  });

  it('returns null when the XML is empty / malformed', () => {
    expect(parseISPDBXml('')).toBeNull();
    expect(parseISPDBXml('<html>not config</html>')).toBeNull();
  });

  it('infers secure=true for port 993/465 even if socketType missing', () => {
    const xml = `<clientConfig>
      <emailProvider>
        <incomingServer type="imap"><hostname>a</hostname><port>993</port></incomingServer>
        <outgoingServer type="smtp"><hostname>b</hostname><port>465</port></outgoingServer>
      </emailProvider>
    </clientConfig>`;
    const r = parseISPDBXml(xml);
    expect(r).not.toBeNull();
    expect(r!.imap.secure).toBe(true);
    expect(r!.smtp.secure).toBe(true);
  });
});
