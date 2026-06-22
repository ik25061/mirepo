export default function Carousel({ title, children, action }) {
  return (
    <section className="animate-fade-in w-full">
      <div className="mb-1.5 flex items-end justify-between px-1 sm:mb-3">
        <h2 className="text-base font-600 tracking-tight text-white sm:text-xl">{title}</h2>
        {action}
      </div>
      <div 
        className="flex gap-2 overflow-x-auto overflow-y-visible pb-2 no-scrollbar sm:gap-3 sm:pb-2"
        style={{
          scrollbarWidth: 'none',
          scrollbarColor: '#535353 transparent',
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x proximity',
          paddingLeft: 4,
          paddingRight: 4,
          msOverflowStyle: 'none',
        }}
      >
        {children}
      </div>
    </section>
  );
}