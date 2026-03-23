import * as React from 'react';

export function useSearchAutoFit(searchText: string | undefined) {
  const [autoFitTrigger, setAutoFitTrigger] = React.useState(0);
  const [isSearchTyping, setIsSearchTyping] = React.useState(false);
  const typingTimeoutRef = React.useRef<number | null>(null);
  const didMountRef = React.useRef(false);

  React.useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setAutoFitTrigger((v) => v + 1);

    if (typingTimeoutRef.current != null) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if ((searchText ?? '').length === 0) {
      setIsSearchTyping(false);
      return;
    }

    setIsSearchTyping(true);
    typingTimeoutRef.current = window.setTimeout(() => {
      setIsSearchTyping(false);
      typingTimeoutRef.current = null;
    }, 250);
  }, [searchText]);

  return { autoFitTrigger, isSearchTyping };
}
