import { useState, useRef, useEffect, useCallback } from 'react';
import type { PointerEvent } from 'react';
import { AppTab } from '@/types';
import { Stock } from './useStocks';

export const SWIPE_TABS: AppTab[] = ['home', 'prices', 'chart', 'rankings', 'shop', 'profile'];

export function useSwipeGesture({
  activeTab,
  selectedStreamer,
  isDesktopLayout,
  onSwipeToTab,
}: {
  activeTab: AppTab;
  selectedStreamer: Stock | null;
  isDesktopLayout: boolean;
  onSwipeToTab: (tab: AppTab) => void;
}) {
  const swipeViewportRef = useRef<HTMLDivElement | null>(null);
  const swipeStartRef = useRef({ x: 0, y: 0, tabIndex: 0, pointerId: -1, horizontal: false });
  const [swipeViewportWidth, setSwipeViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 390
  );
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const activeSwipeIndex = Math.max(0, SWIPE_TABS.indexOf(activeTab));
  const isSwipeTab = SWIPE_TABS.includes(activeTab);

  useEffect(() => {
    setSwipeOffset(0);
    setIsSwiping(false);
  }, [activeTab]);

  useEffect(() => {
    if (isDesktopLayout) return;
    const viewport = swipeViewportRef.current;
    if (!viewport) return;
    const updateWidth = () => setSwipeViewportWidth(viewport.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isDesktopLayout]);

  const handleSwipePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!isSwipeTab || event.pointerType === 'mouse') return;
    if (swipeStartRef.current.pointerId !== -1) return;
    if (event.nativeEvent.composedPath().some(
      el => el instanceof HTMLElement &&
        el.classList.contains('tv-lightweight-charts') &&
        el.dataset.swipeIgnore === 'true'
    )) return;
    swipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      tabIndex: activeSwipeIndex,
      pointerId: event.pointerId,
      horizontal: false,
    };
  }, [isSwipeTab, activeSwipeIndex]);

  const handleSwipePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    if (start.pointerId !== event.pointerId || !swipeViewportWidth) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.horizontal && Math.abs(dx) < 8) return;
    if (!start.horizontal && Math.abs(dy) > Math.abs(dx)) return;
    start.horizontal = true;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setIsSwiping(true);
    const isFirst = start.tabIndex === 0 && dx > 0;
    const isLast = start.tabIndex === SWIPE_TABS.length - 1 && dx < 0;
    setSwipeOffset(dx * (isFirst || isLast ? 0.28 : 1));
  }, [swipeViewportWidth]);

  const finishSwipe = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    if (start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const threshold = Math.min(90, Math.max(48, swipeViewportWidth * 0.18));
    let nextIndex = start.tabIndex;
    if (start.horizontal && dx <= -threshold) {
      nextIndex = Math.min(SWIPE_TABS.length - 1, start.tabIndex + 1);
    } else if (start.horizontal && dx >= threshold) {
      nextIndex = Math.max(0, start.tabIndex - 1);
    }
    setSwipeOffset(0);
    setIsSwiping(false);
    swipeStartRef.current.pointerId = -1;
    if (nextIndex !== start.tabIndex) {
      onSwipeToTab(SWIPE_TABS[nextIndex]);
    }
  }, [swipeViewportWidth, selectedStreamer?.id, onSwipeToTab]);

  const cancelSwipe = useCallback(() => {
    setSwipeOffset(0);
    setIsSwiping(false);
    swipeStartRef.current.pointerId = -1;
    swipeStartRef.current.horizontal = false;
  }, []);

  return {
    swipeViewportRef,
    swipeViewportWidth,
    swipeOffset,
    isSwiping,
    activeSwipeIndex,
    isSwipeTab,
    handleSwipePointerDown,
    handleSwipePointerMove,
    finishSwipe,
    cancelSwipe,
  };
}
