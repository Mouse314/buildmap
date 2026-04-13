import { listGraphicsPresets, type GraphicsPresetId } from '../../map/graphicsPresets';
import { HudButton, HudPanel } from '../ui/hud';

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
    <HudPanel
      title="Настройки графики"
      className="sidePanel sidePanelRight"
      headerClassName="sidePanelHeader"
      titleClassName="sidePanelTitle"
      bodyClassName="sidePanelBody"
      collapsible
      expanded={graphicsOpen}
      onToggle={onToggle}
      toggleButtonClassName="sidePanelToggle"
    >
          <div className="graphicsButtons">
            {graphicsPresets.map((p) => {
              const selected = graphicsPreset === p.id;
              const needsWarning = p.id === 'medium' || p.id === 'max';
              return (
                <HudButton
                  key={p.id}
                  title={p.label}
                  context={needsWarning ? 'Только для мощных устройств' : undefined}
                  data={{ presetId: p.id }}
                  hint={p.title}
                  className={
                    selected ? 'topButton graphicsButton graphicsButtonSelected' : 'topButton graphicsButton'
                  }
                  aria-pressed={selected}
                  onClick={() => onSelectPreset(p.id)}
                >
                  {p.label}
                  {needsWarning ? <span className="graphicsWarningMark" aria-hidden> ⚠️</span> : null}
                </HudButton>
              );
            })}
          </div>
          <div className="graphicsWarningText">
            <span className="graphicsWarningMark" aria-hidden>⚠️</span>
            Возможно снижение плавности
          </div>
          <hr className="graphicsDivider" />
          <div className="graphicsExtraToggles">
            <HudButton
              title="Сетка графа"
              data={{ action: 'toggle-graph-overlay' }}
              hint="Показать или скрыть сетку графа"
              className={showGraphOverlay ? 'topButton graphicsButton graphicsButtonSelected' : 'topButton graphicsButton'}
              aria-pressed={showGraphOverlay}
              onClick={onToggleGraphOverlay}
            >
              Сетка графа
            </HudButton>

            {isAdminMode ? (
              <HudButton
                title="Тонкая настройка пресетов"
                context="Админ-режим"
                data={{ action: 'open-preset-settings' }}
                hint="Открыть детальную настройку графических пресетов"
                className="topButton graphicsButton graphicsPresetSettingsButton"
                onClick={onOpenPresetSettings}
              >
                Тонкая настройка пресетов
              </HudButton>
            ) : null}
          </div>
    </HudPanel>
  );
}
