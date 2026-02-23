type FloorsPanelProps = {
  floorsOpen: boolean;
  onToggle: () => void;
  floorOptions: string[];
  selectedFloor: string;
  floorLabel: (id: string) => string;
  onSelectFloor: (floor: string) => void;
};

export function FloorsPanel({
  floorsOpen,
  onToggle,
  floorOptions,
  selectedFloor,
  floorLabel,
  onSelectFloor,
}: FloorsPanelProps) {
  return (
    <div className="sidePanel sidePanelLeft" aria-label="Этажи">
      <div className="sidePanelHeader">
        <div className="sidePanelTitle">Этажи</div>
        <button
          type="button"
          className="sidePanelToggle"
          aria-expanded={floorsOpen}
          aria-controls="floors-panel-body"
          title={floorsOpen ? 'Свернуть' : 'Развернуть'}
          onClick={onToggle}
        >
          {floorsOpen ? '▾' : '▸'}
        </button>
      </div>

      {floorsOpen ? (
        <div className="sidePanelBody" id="floors-panel-body">
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
      ) : null}
    </div>
  );
}
