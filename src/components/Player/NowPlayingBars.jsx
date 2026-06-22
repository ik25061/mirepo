export default function NowPlayingBars({ playing = true }) {
  return (
    <div className="flex h-4 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-primary"
          style={{
            height: '100%',
            animation: playing ? `eq 0.9s ease-in-out ${i * 0.18}s infinite` : 'none',
          }}
        />
      ))}
    </div>
  );
}