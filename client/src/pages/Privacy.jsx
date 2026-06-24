export default function Privacy() {
  return (
    <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 24px', fontFamily: 'sans-serif', color: '#111' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#555', marginBottom: 32 }}>Last updated: June 2026</p>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>What this app is</h2>
      <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
        This is a private internal CRM tool built for BeerBozo. It is not a public product and has no end users
        other than the owner.
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Data collected</h2>
      <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
        This app connects to the Buffer API on behalf of the owner to read channel stats, schedule posts,
        and view analytics. No data is collected from third parties, shared with anyone, or stored beyond
        what is needed to display information within the app.
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Data sharing</h2>
      <p style={{ marginBottom: 24, lineHeight: 1.6 }}>
        No data is shared with any third party. This tool is used solely by the owner of the BeerBozo account.
      </p>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Contact</h2>
      <p style={{ lineHeight: 1.6 }}>
        For any questions, contact <a href="mailto:hello@beerbozo.com.au" style={{ color: '#1A5C0E' }}>hello@beerbozo.com.au</a>.
      </p>
    </div>
  )
}
