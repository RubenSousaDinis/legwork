/** Legwork's own icon — dashed ring around the two-mark footprint. */
export function LogoMark({ size }: { size: number }) {
  return (
    <img
      className="logo-mark"
      src="/icon.png"
      alt=""
      width={size}
      height={size}
    />
  );
}
