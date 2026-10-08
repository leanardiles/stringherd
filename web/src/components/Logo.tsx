import { PRODUCT_NAME } from '../lib/product'

// The Stringherd logo files live in web/public. The lockup (mark and name) has a
// 596 x 130 viewBox; the mark alone is square.
const LOCKUP_RATIO = 596 / 130

/** Mark and product name, for light backgrounds. The name is in the image, so alt text carries it. */
export function LogoLockup({ height = 26 }: { height?: number }) {
  return (
    <img
      src="/stringherd-lockup.svg"
      alt={PRODUCT_NAME}
      height={height}
      width={Math.round(height * LOCKUP_RATIO)}
      style={{ display: 'block' }}
    />
  )
}
