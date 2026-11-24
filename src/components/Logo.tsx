// Marca NecesitoYa: una N dentro de un globo de pedido, con el punto amarillo del "Ya".

export function Isotipo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="NecesitoYa">
      <path d="M12 4h24a10 10 0 0 1 10 10v16a10 10 0 0 1-10 10H22l-9 7v-7.3A10 10 0 0 1 2 30V14A10 10 0 0 1 12 4Z" fill="#0b6fd6" />
      <path d="M15 30V14l14 16V14" fill="none" stroke="#ffffff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36.5" cy="29" r="3" fill="#ffc93c" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Isotipo size={size} />
      <span className="text-[19px] font-extrabold tracking-tight text-ink">
        Necesito<span className="text-brand">Ya</span>
      </span>
    </span>
  );
}
