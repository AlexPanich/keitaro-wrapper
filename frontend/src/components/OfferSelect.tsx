import type { OfferShort } from '../api';

interface Props {
  offers: OfferShort[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  'aria-label'?: string;
}

export default function OfferSelect({ offers, value, onChange, ...rest }: Props) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required {...rest}>
      {offers.map((o) => (
        <option key={o.id} value={o.id}>
          {o.id} — {o.name}
        </option>
      ))}
    </select>
  );
}
