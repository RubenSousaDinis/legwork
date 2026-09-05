export function Wordmark({ className }: { className?: string }) {
  return <span className={className ? `wordmark ${className}` : 'wordmark'}>Legwork</span>;
}
