type FloorsPanelProps = {
  floorOptions: string[];
  selectedFloor: string;
  floorLabel: (id: string) => string;
  onSelectFloor: (floor: string) => void;
};

export function FloorsPanel({
  floorOptions,
  selectedFloor,
  floorLabel,
  onSelectFloor,
}: FloorsPanelProps) {
  return (
    <div className="sidePanel sidePanelLeft" aria-label="Этажи">
      <div className="floorButtons">
        {floorOptions.map((f) => {
          const selected = f === selectedFloor;
          const short = f.match(/floor(\d+)/i)?.[1] ?? f;
          return (
            <button
              key={f}
              type="button"
              className={selected ? 'floorButton floorButtonSelected' : 'floorButton'}
              aria-pressed={selected}
              title={floorLabel(f)}
              onClick={() => onSelectFloor(f)}
            >
              {short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
