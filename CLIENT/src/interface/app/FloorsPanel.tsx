import { HudButton, HudPanel } from '../ui/hud';

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
    <HudPanel
      title="Этажи"
      className="sidePanel sidePanelLeft"
      bodyClassName="floorButtons"
      showHeader={false}
    >
        {floorOptions.map((f) => {
          const selected = f === selectedFloor;
          const short = f.match(/floor(\d+)/i)?.[1] ?? f;
          return (
            <HudButton
              key={f}
              title={short}
              context={floorLabel(f)}
              hint={floorLabel(f)}
              className={selected ? 'floorButton floorButtonSelected' : 'floorButton'}
              aria-pressed={selected}
              onClick={() => onSelectFloor(f)}
            >
              {short}
            </HudButton>
          );
        })}
    </HudPanel>
  );
}
