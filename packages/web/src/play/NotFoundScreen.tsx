import styles from './NotFoundScreen.module.css';

export function NotFoundScreen({ message }: { readonly message: string }) {
  return (
    <div className={styles.page}>
      <p>{message}</p>
    </div>
  );
}
