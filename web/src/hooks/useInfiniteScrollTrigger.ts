/**
 * Хук IntersectionObserver для бесконечного скролла: вызывает onIntersect,
 * когда sentinel-элемент попадает во вьюпорт.
 */

import { useEffect, useRef } from 'react'

export function useInfiniteScrollTrigger(onIntersect: () => void, enabled: boolean) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled) return
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onIntersect()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onIntersect, enabled])

  return sentinelRef
}
