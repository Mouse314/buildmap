import { listGraphicsPresets, type GraphicsPresetId } from '../../map/graphicsPresets';

type GraphicsPanelProps = {
  graphicsOpen: boolean;
  onToggle: () => void;
  graphicsPreset: GraphicsPresetId;
  onSelectPreset: (preset: GraphicsPresetId) => void;
  showGraphOverlay: boolean;
  onToggleGraphOverlay: () => void;
  isAdminMode: boolean;
  onOpenPresetSettings: () => void;
};

export function GraphicsPanel({
  graphicsOpen,
  onToggle,
  graphicsPreset,
  onSelectPreset,
  showGraphOverlay,
  onToggleGraphOverlay,
  isAdminMode,
  onOpenPresetSettings,
}: GraphicsPanelProps) {
  const graphicsPresets = listGraphicsPresets();

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
            {graphicsPresets.map((p) => {
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
          <hr className="graphicsDivider" />
          <div className="graphicsExtraToggles">
            <button
              type="button"
              className={showGraphOverlay ? 'topButton graphicsButton graphicsButtonSelected' : 'topButton graphicsButton'}
              aria-pressed={showGraphOverlay}
              onClick={onToggleGraphOverlay}
              title="Показать или скрыть сетку графа"
            >
              Сетка графа
            </button>

            {isAdminMode ? (
              <button
                type="button"
                className="topButton graphicsButton graphicsPresetSettingsButton"
                onClick={onOpenPresetSettings}
                title="Открыть детальную настройку графических пресетов"
              >
                Тонкая настройка пресетов
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
