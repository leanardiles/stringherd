import styles from './Logo.module.css'

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className={styles.mark} style={{ inlineSize: size, blockSize: size, fontSize: size * 0.6 }} aria-hidden="true">
      S
    </span>
  )
}
