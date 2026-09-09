'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthFlow } from '../AuthFlow';

/**
 * `/verify` keeps the auth flow on its own URL for histories and for anyone who still
 * lands here. The machine itself lives in `AuthFlow`, which the login modal also hosts.
 */
export default function AuthPage() {
  const router = useRouter();
  const onDone = useCallback(() => {
    router.replace('/tasks');
  }, [router]);
  return <AuthFlow onDone={onDone} />;
}
