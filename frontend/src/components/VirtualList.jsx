// components/VirtualList.jsx
// Componente de virtual scrolling: solo renderiza los items visibles en pantalla
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

export function VirtualList({
  items,
  itemHeight = 64,
  renderItem,
  overscan = 5,
  onLoadMore,
  hasMore,
  isLoadingMore,
  className = "",
  style,
  emptyComponent,
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Medir el contenedor y observar cambios de tamaño
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      setContainerHeight(el.clientHeight);
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(
    (e) => {
      const target = e.target;
      setScrollTop(target.scrollTop);

      // Scroll infinito: cuando faltan < 3 items para el final
      if (onLoadMore && hasMore && !isLoadingMore) {
        if (
          target.scrollHeight - target.scrollTop - target.clientHeight <
          itemHeight * 3
        ) {
          onLoadMore();
        }
      }
    },
    [onLoadMore, hasMore, isLoadingMore, itemHeight]
  );

  // Cargar más si el contenido inicial es menor que el contenedor
  useEffect(() => {
    if (
      onLoadMore &&
      hasMore &&
      !isLoadingMore &&
      items.length > 0 &&
      containerHeight > 0
    ) {
      const totalHeight = items.length * itemHeight;
      if (totalHeight <= containerHeight + scrollTop + itemHeight * 2) {
        onLoadMore();
      }
    }
  }, [items.length, containerHeight, itemHeight, scrollTop]);

  const totalHeight = items.length * itemHeight;

  const { startIndex, endIndex, visibleItems } = useMemo(() => {
    const start = Math.max(
      0,
      Math.floor(scrollTop / itemHeight) - overscan
    );
    const end = Math.min(
      items.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    const result = [];
    for (let i = start; i < end; i++) {
      result.push({
        item: items[i],
        index: i,
        offsetY: i * itemHeight,
      });
    }

    return { startIndex: start, endIndex: end, visibleItems: result };
  }, [items, scrollTop, containerHeight, itemHeight, overscan]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto ${className}`}
      style={{ position: "relative", ...style }}
    >
      {items.length === 0 ? (
        emptyComponent || null
      ) : (
        <>
          <div style={{ height: totalHeight, position: "relative" }}>
            {visibleItems.map(({ item, index, offsetY }) => (
              <div
                key={item.id || index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: itemHeight,
                  transform: `translateY(${offsetY}px)`,
                }}
              >
                {renderItem(item, index)}
              </div>
            ))}
          </div>
          {isLoadingMore && (
            <div
              className="py-4 text-center"
              style={{ color: "#a7a7a7", fontSize: 13 }}
            >
              Cargando más canciones...
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <div
              className="py-4 text-center"
              style={{ color: "#535353", fontSize: 12 }}
            >
              {items.length} {items.length === 1 ? "canción" : "canciones"} en
              tu biblioteca
            </div>
          )}
        </>
      )}
    </div>
  );
}
