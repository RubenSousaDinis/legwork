'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type MiniKitState = { installed: boolean };

/** `installed` is false during SSR: World App is only detectable in the webview. */
const MiniKitContext = createContext<MiniKitState>({ installed: false });

export function useMiniKit(): MiniKitState {
  return useContext(MiniKitContext);
}

export function MiniKitProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    try {
      MiniKit.install();
      setInstalled(MiniKit.isInstalled());
    } catch {
      setInstalled(false);
    }
  }, []);

  return <MiniKitContext.Provider value={{ installed }}>{children}</MiniKitContext.Provider>;
}
