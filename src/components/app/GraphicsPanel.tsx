import { GRAPHICS_PRESETS, type GraphicsPresetId } from '../../map/graphicsPresets';

type GraphicsPanelProps = {
  graphicsOpen: boolean;
  onToggle: () => void;
  graphicsPreset: GraphicsPresetId;
  onSelectPreset: (preset: GraphicsPresetId) => void;
};

export function GraphicsPanel({ graphicsOpen, onToggle, graphicsPreset, onSelectPreset }: GraphicsPanelProps) {
  return (
    <div className="sidePanel sidePanelRight" aria-label="Настройки графики">
      <div className="sidePanelHeader">
        <div className="sidePanelTitle">Настройки графики</div>
        <button
          type="button"
          className="sidePanelToggle"
          aria-expanded={graphicsOpen}
          aria-controls="graphics-panel-body"
          title={graphicsOpen ? 'Свернуть' : 'Развернуть'}
          onClick={onToggle}
        >
          {graphicsOpen ? '▾' : '▸'}
        </button>
      </div>

      {graphicsOpen ? (
        <div className="sidePanelBody" id="graphics-panel-body">
          <div className="graphicsButtons">
            {GRAPHICS_PRESETS.map((p) => {
              const selected = graphicsPreset === p.id;
              const needsWarning = p.id === 'medium' || p.id === 'max';
              return (
                <button
                  key={p.id}
                  type="button"
                  className={
                    selected ? 'topButton graphicsButton graphicsButtonSelected' : 'topButton graphicsButton'
                  }
                  aria-pressed={selected}
                  onClick={() => onSelectPreset(p.id)}
                  title={p.title}
                >
                  {p.label}
                  {needsWarning ? <span className="graphicsWarningMark" aria-hidden> ⚠️</span> : null}
                </button>
              );
            })}
          </div>
          <div className="graphicsWarningText">
            <span className="graphicsWarningMark" aria-hidden>⚠️</span>
            Возможно снижение плавности
          </div>
        </div>
      ) : null}
    </div>
  );
}
