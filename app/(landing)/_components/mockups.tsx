/**
 * Inline SVG mockups replacing the template's phone screenshots.
 *
 * Drawn at 384 × 762 — the exact size of the images they stand in for — so the
 * alternating benefit sections keep their original rhythm and the scroll
 * animations trigger at the same points.
 *
 * They use theme tokens rather than fixed colours, so they follow the Contravo
 * palette in both light and dark mode. Purely decorative: each is marked
 * `aria-hidden`, since the adjacent copy already carries the meaning.
 */

const W = 384;
const H = 762;

/** Phone frame shared by every mockup. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
      aria-hidden
      className="h-auto w-full max-w-[384px]"
    >
      <defs>
        <linearGradient id="cv-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        <clipPath id="cv-screen">
          <rect x="28" y="34" width="328" height="694" rx="30" />
        </clipPath>
      </defs>

      {/* Soft halo behind the device */}
      <ellipse cx={W / 2} cy="300" rx="180" ry="240" fill="url(#cv-glow)" />

      {/* Device body */}
      <rect
        x="20"
        y="26"
        width="344"
        height="710"
        rx="38"
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <rect x="150" y="44" width="84" height="7" rx="3.5" fill="var(--border)" />

      <g clipPath="url(#cv-screen)">
        <rect x="28" y="34" width="328" height="694" fill="var(--background)" />
        {children}
      </g>
    </svg>
  );
}

/** Reusable primitives so each screen reads as the same design system. */
function Bar({
  x,
  y,
  w,
  h = 10,
  fill = 'var(--muted)',
  opacity = 1,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  fill?: string;
  opacity?: number;
}) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} opacity={opacity} />;
}

function Card({
  x,
  y,
  w,
  h,
  accent = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  accent?: boolean;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx="14"
      fill="var(--card)"
      stroke={accent ? 'var(--primary)' : 'var(--border)'}
      strokeWidth={accent ? 1.5 : 1}
    />
  );
}

function ScreenHeader({ label }: { label: string }) {
  return (
    <>
      <Bar x={52} y={80} w={90} h={8} opacity={0.5} />
      <text x="52" y="118" fill="var(--foreground)" fontSize="19" fontWeight="600">
        {label}
      </text>
    </>
  );
}

/** Quote screen: line items and a total. */
export function QuoteMockup() {
  return (
    <Frame>
      <ScreenHeader label="Devis DEV-0042" />

      <Card x={52} y={140} w={280} h={92} />
      <Bar x={72} y={162} w={120} h={9} opacity={0.7} />
      <Bar x={72} y={182} w={200} h={7} opacity={0.35} />
      <Bar x={72} y={200} w={160} h={7} opacity={0.35} />

      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Bar x={52} y={264 + i * 46} w={150} h={9} opacity={0.55} />
          <Bar x={244} y={264 + i * 46} w={88} h={9} fill="var(--primary)" opacity={0.5} />
          <rect x="52" y={290 + i * 46} width="280" height="1" fill="var(--border)" />
        </g>
      ))}

      <Card x={52} y={420} w={280} h={70} accent />
      <text x="72" y="452" fill="var(--muted-foreground)" fontSize="12">
        Total
      </text>
      <text x="312" y="452" fill="var(--primary)" fontSize="20" fontWeight="700" textAnchor="end">
        1 290 000
      </text>
      <text x="312" y="472" fill="var(--muted-foreground)" fontSize="11" textAnchor="end">
        XOF
      </text>

      <rect x="52" y="520" width="280" height="44" rx="12" fill="var(--primary)" />
      <text
        x={W / 2}
        y="548"
        fill="var(--primary-foreground)"
        fontSize="13"
        fontWeight="600"
        textAnchor="middle"
      >
        Envoyer le devis
      </text>
    </Frame>
  );
}

/** Signature screen: the drawn stroke and its certificate line. */
export function SignatureMockup() {
  return (
    <Frame>
      <ScreenHeader label="Signature du contrat" />

      <Card x={52} y={140} w={280} h={120} />
      {[0, 1, 2, 3].map((i) => (
        <Bar key={i} x={72} y={164 + i * 22} w={i === 3 ? 140 : 240} h={7} opacity={0.3} />
      ))}

      <rect
        x="52"
        y="288"
        width="280"
        height="130"
        rx="14"
        fill="var(--card)"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeDasharray="6 5"
      />
      {/* Handwritten stroke */}
      <path
        d="M96 372 C 118 330, 138 402, 160 356 S 200 316, 222 366 S 262 392, 288 340"
        stroke="var(--foreground)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />

      <circle cx="68" cy="452" r="11" fill="var(--success)" opacity="0.15" />
      <path
        d="M63 452 l4 4 l7 -8"
        stroke="var(--success)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <text x="88" y="456" fill="var(--foreground)" fontSize="12" fontWeight="600">
        Signature horodatée
      </text>

      <Bar x={52} y={484} w={280} h={7} opacity={0.28} />
      <text x="52" y="516" fill="var(--muted-foreground)" fontSize="9" fontFamily="monospace">
        SHA-256 · 9f2a…c4e1
      </text>

      <rect x="52" y="546" width="280" height="44" rx="12" fill="var(--primary)" />
      <text
        x={W / 2}
        y="574"
        fill="var(--primary-foreground)"
        fontSize="13"
        fontWeight="600"
        textAnchor="middle"
      >
        Signer
      </text>
    </Frame>
  );
}

/** Invoice screen: amount due and payment methods. */
export function InvoiceMockup() {
  return (
    <Frame>
      <ScreenHeader label="Facture FAC-0117" />

      <Card x={52} y={140} w={280} h={104} accent />
      <text x="72" y="176" fill="var(--muted-foreground)" fontSize="12">
        Reste à payer
      </text>
      <text x="72" y="212" fill="var(--foreground)" fontSize="26" fontWeight="700">
        450 000
      </text>
      <text x="196" y="212" fill="var(--muted-foreground)" fontSize="13">
        XOF
      </text>

      {['Mobile Money', 'Carte bancaire'].map((label, i) => (
        <g key={label}>
          <Card x={52} y={276 + i * 68} w={280} h={56} />
          <rect x={72} y={294 + i * 68} width="34" height="20" rx="5" fill="var(--primary)" opacity="0.22" />
          <text x="120" y={309 + i * 68} fill="var(--foreground)" fontSize="12.5">
            {label}
          </text>
          <circle cx="308" cy={304 + i * 68} r="8" stroke="var(--border)" strokeWidth="1.5" fill="none" />
          {i === 0 ? <circle cx="308" cy="304" r="4" fill="var(--primary)" /> : null}
        </g>
      ))}

      <rect x="52" y="424" width="280" height="1" fill="var(--border)" />

      {[
        ['Sous-total', '1 200 000'],
        ['TVA (18 %)', '216 000'],
        ['Déjà réglé', '-966 000'],
      ].map(([label, value], i) => (
        <g key={label}>
          <text x="52" y={456 + i * 26} fill="var(--muted-foreground)" fontSize="11">
            {label}
          </text>
          <text x="332" y={456 + i * 26} fill="var(--foreground)" fontSize="11" textAnchor="end">
            {value}
          </text>
        </g>
      ))}

      <rect x="52" y="556" width="280" height="44" rx="12" fill="var(--primary)" />
      <text
        x={W / 2}
        y="584"
        fill="var(--primary-foreground)"
        fontSize="13"
        fontWeight="600"
        textAnchor="middle"
      >
        Payer maintenant
      </text>
    </Frame>
  );
}

/** Client portal screen: the document list a recipient sees. */
export function PortalMockup() {
  return (
    <Frame>
      <ScreenHeader label="Espace client" />

      {[
        ['Devis DEV-0042', 'Accepté', 'var(--success)'],
        ['Contrat CTR-0031', 'À signer', 'var(--warning)'],
        ['Livrable v2', 'À valider', 'var(--warning)'],
        ['Facture FAC-0117', 'En attente', 'var(--info)'],
      ].map(([label, status, colour], i) => (
        <g key={label as string}>
          <Card x={52} y={150 + i * 84} w={280} h={68} accent={i === 1} />
          <rect
            x={72}
            y={170 + i * 84}
            width="28"
            height="28"
            rx="7"
            fill="var(--primary)"
            opacity="0.16"
          />
          <text x="114" y={182 + i * 84} fill="var(--foreground)" fontSize="12.5" fontWeight="600">
            {label}
          </text>
          <rect
            x={114}
            y={192 + i * 84}
            width={String(status).length * 7 + 16}
            height="18"
            rx="9"
            fill={colour as string}
            opacity="0.14"
          />
          <text x={122} y={205 + i * 84} fill={colour as string} fontSize="10" fontWeight="600">
            {status}
          </text>
        </g>
      ))}

      <text
        x={W / 2}
        y="536"
        fill="var(--muted-foreground)"
        fontSize="11"
        textAnchor="middle"
      >
        Aucun compte requis
      </text>
    </Frame>
  );
}

/** Hero visual: a wider composition at the template's 384 × 340. */
export function HeroMockup() {
  return (
    <svg
      width="384"
      height="340"
      viewBox="0 0 384 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
      aria-hidden
      className="h-auto w-full max-w-[384px]"
    >
      <defs>
        <linearGradient id="cv-hero-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <ellipse cx="192" cy="170" rx="180" ry="140" fill="url(#cv-hero-glow)" />

      {/* Back card: the quote */}
      <rect
        x="24"
        y="46"
        width="228"
        height="250"
        rx="16"
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <Bar x={46} y={74} w={72} h={8} opacity={0.5} />
      <text x="46" y="110" fill="var(--foreground)" fontSize="15" fontWeight="600">
        Devis DEV-0042
      </text>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Bar x={46} y={136 + i * 30} w={110} h={8} opacity={0.4} />
          <Bar x={182} y={136 + i * 30} w={48} h={8} fill="var(--primary)" opacity={0.45} />
        </g>
      ))}
      <rect x="46" y="238" width="184" height="1" fill="var(--border)" />
      <text x="46" y="266" fill="var(--muted-foreground)" fontSize="11">
        Total
      </text>
      <text x="230" y="266" fill="var(--primary)" fontSize="16" fontWeight="700" textAnchor="end">
        1 290 000
      </text>

      {/* Front card: the signature confirmation */}
      <rect
        x="176"
        y="164"
        width="188"
        height="132"
        rx="16"
        fill="var(--card)"
        stroke="var(--primary)"
        strokeWidth="1.5"
      />
      <path
        d="M198 232 C 214 208, 228 254, 244 224 S 274 200, 290 232 S 322 244, 342 214"
        stroke="var(--foreground)"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="200" cy="266" r="9" fill="var(--success)" opacity="0.16" />
      <path
        d="M196 266 l3 3 l6 -6"
        stroke="var(--success)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <text x="218" y="270" fill="var(--foreground)" fontSize="11" fontWeight="600">
        Contrat signé
      </text>
    </svg>
  );
}
