import * as React from 'react';
import {
  cloneGraphicsPresetsById,
  getDefaultGraphicsPresetsById,
  type GraphicsPresetConfig,
  type GraphicsPresetId,
  type GraphicsPresetsById,
} from '../../map/graphicsPresets';

type GraphicsPresetAdminModalProps = {
  isOpen: boolean;
  presetsById: GraphicsPresetsById;
  activeGraphicsPreset: GraphicsPresetId;
  isSaving: boolean;
  statusText: string | null;
  onClose: () => void;
  onActivePresetChange: (presetId: GraphicsPresetId) => void;
  onDraftChange: (nextPresets: GraphicsPresetsById) => void;
};

function parseNumberInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (normalized.length === 0) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export function GraphicsPresetAdminModal({
  isOpen,
  presetsById,
  activeGraphicsPreset,
  isSaving,
  statusText,
  onClose,
  onActivePresetChange,
  onDraftChange,
}: GraphicsPresetAdminModalProps) {
  const defaultPresetsById = React.useMemo(() => getDefaultGraphicsPresetsById(), []);
  const [activePresetId, setActivePresetId] = React.useState<GraphicsPresetId>(activeGraphicsPreset);
  const [draftById, setDraftById] = React.useState<GraphicsPresetsById>(() => cloneGraphicsPresetsById(presetsById));
  const skipInitialDraftEmitRef = React.useRef(true);

  React.useEffect(() => {
    if (!isOpen) return;
    skipInitialDraftEmitRef.current = true;
    setActivePresetId(activeGraphicsPreset);
    setDraftById(cloneGraphicsPresetsById(presetsById));
  }, [activeGraphicsPreset, isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    onActivePresetChange(activePresetId);
  }, [activePresetId, isOpen, onActivePresetChange]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (skipInitialDraftEmitRef.current) {
      skipInitialDraftEmitRef.current = false;
      return;
    }
    onDraftChange(draftById);
  }, [draftById, isOpen, onDraftChange]);

  React.useEffect(() => {
    if (!isOpen) return;

    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, isSaving, onClose]);

  const updatePreset = React.useCallback(
    (presetId: GraphicsPresetId, updater: (current: GraphicsPresetConfig) => GraphicsPresetConfig) => {
      setDraftById((prev) => {
        const next = cloneGraphicsPresetsById(prev);
        next[presetId] = updater(next[presetId]);
        return next;
      });
    },
    [],
  );

  if (!isOpen) return null;

  const active = draftById[activePresetId];
  const defaultActive = defaultPresetsById[activePresetId];

  return (
    <div
      className="graphicsPresetAdminOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Подробная настройка графики"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        onClose();
      }}
    >
      <div className="graphicsPresetAdminModal">
        <div className="graphicsPresetAdminHeader">
          <div>
            <div className="graphicsPresetAdminTitle">Подробная настройка графики</div>
            <div className="graphicsPresetAdminMeta">Изменения применяются сразу, сохранение фиксирует их в файле для следующих запусков</div>
          </div>
          <button
            type="button"
            className="graphicsPresetAdminClose"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="graphicsPresetAdminBody">
          <aside className="graphicsPresetAdminTabs" aria-label="Выбор пресета">
            {(['min', 'medium', 'max'] as GraphicsPresetId[]).map((id) => {
              const selected = id === activePresetId;
              return (
                <button
                  key={id}
                  type="button"
                  className={selected ? 'graphicsPresetAdminTab graphicsPresetAdminTabActive' : 'graphicsPresetAdminTab'}
                  onClick={() => setActivePresetId(id)}
                >
                  <span>{draftById[id].label}</span>
                  <small>{id}</small>
                </button>
              );
            })}
          </aside>

          <section className="graphicsPresetAdminForm" aria-label="Форма пресета">
            <div className="graphicsPresetAdminGrid">
              <label className="graphicsPresetAdminField">
                <span>Название кнопки</span>
                <input
                  value={active.label}
                  onChange={(event) =>
                    updatePreset(activePresetId, (current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="graphicsPresetAdminField">
                <span>Подсказка (title)</span>
                <input
                  value={active.title}
                  onChange={(event) =>
                    updatePreset(activePresetId, (current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="graphicsPresetAdminField">
                <span>DPR режим</span>
                <select
                  value={active.dpr.mode}
                  onChange={(event) => {
                    const mode = event.target.value === 'adaptive' ? 'adaptive' : 'fixed';
                    updatePreset(activePresetId, (current) => ({
                      ...current,
                      dpr:
                        mode === 'fixed'
                          ? {
                              mode: 'fixed',
                              value: current.dpr.mode === 'fixed' ? current.dpr.value : 1,
                            }
                          : {
                              mode: 'adaptive',
                              baseMax: current.dpr.mode === 'adaptive' ? current.dpr.baseMax : 1.5,
                              declineTo: current.dpr.mode === 'adaptive' ? current.dpr.declineTo : 1,
                            },
                    }));
                  }}
                >
                  <option value="fixed">Фиксированный</option>
                  <option value="adaptive">Адаптивный</option>
                </select>
              </label>

              {active.dpr.mode === 'fixed' ? (
                <label className="graphicsPresetAdminField">
                  <span>DPR value</span>
                  <input
                    type="number"
                    step="0.05"
                    value={active.dpr.value}
                    onChange={(event) => {
                      const value = parseNumberInput(event.target.value);
                      if (value == null) return;
                      updatePreset(activePresetId, (current) => ({
                        ...current,
                        dpr: { mode: 'fixed', value },
                      }));
                    }}
                  />
                </label>
              ) : (
                <>
                  <label className="graphicsPresetAdminField">
                    <span>DPR baseMax</span>
                    <input
                      type="number"
                      step="0.05"
                      value={active.dpr.baseMax}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (current.dpr.mode !== 'adaptive') return current;
                          return {
                            ...current,
                            dpr: {
                              ...current.dpr,
                              baseMax: value,
                            },
                          };
                        });
                      }}
                    />
                  </label>

                  <label className="graphicsPresetAdminField">
                    <span>DPR declineTo</span>
                    <input
                      type="number"
                      step="0.05"
                      value={active.dpr.declineTo}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (current.dpr.mode !== 'adaptive') return current;
                          return {
                            ...current,
                            dpr: {
                              ...current.dpr,
                              declineTo: value,
                            },
                          };
                        });
                      }}
                    />
                  </label>
                </>
              )}

              <label className="graphicsPresetAdminCheckbox">
                <input
                  type="checkbox"
                  checked={active.shadowsEnabled}
                  onChange={(event) =>
                    updatePreset(activePresetId, (current) => ({
                      ...current,
                      shadowsEnabled: event.target.checked,
                    }))
                  }
                />
                <span>Тени</span>
              </label>

              <label className="graphicsPresetAdminCheckbox">
                <input
                  type="checkbox"
                  checked={active.mouseLampEnabled}
                  onChange={(event) =>
                    updatePreset(activePresetId, (current) => ({
                      ...current,
                      mouseLampEnabled: event.target.checked,
                    }))
                  }
                />
                <span>Mouse lamp</span>
              </label>

              <label className="graphicsPresetAdminCheckbox">
                <input
                  type="checkbox"
                  checked={active.postFx.enabled}
                  onChange={(event) =>
                    updatePreset(activePresetId, (current) => ({
                      ...current,
                      postFx: {
                        ...current.postFx,
                        enabled: event.target.checked,
                      },
                    }))
                  }
                />
                <span>Post FX включены</span>
              </label>

              <label className="graphicsPresetAdminField">
                <span>Post FX multisampling</span>
                <input
                  type="number"
                  step="1"
                  value={active.postFx.multisampling}
                  onChange={(event) => {
                    const value = parseNumberInput(event.target.value);
                    if (value == null) return;
                    updatePreset(activePresetId, (current) => ({
                      ...current,
                      postFx: {
                        ...current.postFx,
                        multisampling: value,
                      },
                    }));
                  }}
                />
              </label>
            </div>

            <div className="graphicsPresetAdminGroup">
              <div className="graphicsPresetAdminGroupHeader">
                <strong>N8AO</strong>
                <button
                  type="button"
                  className="graphicsPresetAdminToggle"
                  onClick={() =>
                    updatePreset(activePresetId, (current) => ({
                      ...current,
                      postFx: {
                        ...current.postFx,
                        n8ao: current.postFx.n8ao
                          ? null
                          : {
                              ...(defaultActive.postFx.n8ao ?? {
                                aoRadius: 2.5,
                                distanceFalloff: 1.2,
                                intensity: 4.5,
                                screenSpaceRadius: false,
                              }),
                            },
                      },
                    }))
                  }
                >
                  {active.postFx.n8ao ? 'Отключить' : 'Включить'}
                </button>
              </div>

              {active.postFx.n8ao ? (
                <div className="graphicsPresetAdminGrid">
                  <label className="graphicsPresetAdminField">
                    <span>aoRadius</span>
                    <input
                      type="number"
                      step="0.05"
                      value={active.postFx.n8ao.aoRadius}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.n8ao) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              n8ao: {
                                ...current.postFx.n8ao,
                                aoRadius: value,
                              },
                            },
                          };
                        });
                      }}
                    />
                  </label>

                  <label className="graphicsPresetAdminField">
                    <span>distanceFalloff</span>
                    <input
                      type="number"
                      step="0.05"
                      value={active.postFx.n8ao.distanceFalloff}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.n8ao) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              n8ao: {
                                ...current.postFx.n8ao,
                                distanceFalloff: value,
                              },
                            },
                          };
                        });
                      }}
                    />
                  </label>

                  <label className="graphicsPresetAdminField">
                    <span>intensity</span>
                    <input
                      type="number"
                      step="0.05"
                      value={active.postFx.n8ao.intensity}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.n8ao) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              n8ao: {
                                ...current.postFx.n8ao,
                                intensity: value,
                              },
                            },
                          };
                        });
                      }}
                    />
                  </label>

                  <label className="graphicsPresetAdminCheckbox">
                    <input
                      type="checkbox"
                      checked={active.postFx.n8ao.screenSpaceRadius}
                      onChange={(event) =>
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.n8ao) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              n8ao: {
                                ...current.postFx.n8ao,
                                screenSpaceRadius: event.target.checked,
                              },
                            },
                          };
                        })
                      }
                    />
                    <span>screenSpaceRadius</span>
                  </label>
                </div>
              ) : null}
            </div>

            <div className="graphicsPresetAdminGroup">
              <div className="graphicsPresetAdminGroupHeader">
                <strong>Bloom</strong>
                <button
                  type="button"
                  className="graphicsPresetAdminToggle"
                  onClick={() =>
                    updatePreset(activePresetId, (current) => ({
                      ...current,
                      postFx: {
                        ...current.postFx,
                        bloom: current.postFx.bloom
                          ? null
                          : {
                              ...(defaultActive.postFx.bloom ?? {
                                intensity: 0.16,
                                luminanceThreshold: 0.48,
                                luminanceSmoothing: 0.72,
                                radius: 0.28,
                                mipmapBlur: true,
                              }),
                            },
                      },
                    }))
                  }
                >
                  {active.postFx.bloom ? 'Отключить' : 'Включить'}
                </button>
              </div>

              {active.postFx.bloom ? (
                <div className="graphicsPresetAdminGrid">
                  <label className="graphicsPresetAdminField">
                    <span>intensity</span>
                    <input
                      type="number"
                      step="0.01"
                      value={active.postFx.bloom.intensity}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.bloom) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              bloom: {
                                ...current.postFx.bloom,
                                intensity: value,
                              },
                            },
                          };
                        });
                      }}
                    />
                  </label>

                  <label className="graphicsPresetAdminField">
                    <span>luminanceThreshold</span>
                    <input
                      type="number"
                      step="0.01"
                      value={active.postFx.bloom.luminanceThreshold}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.bloom) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              bloom: {
                                ...current.postFx.bloom,
                                luminanceThreshold: value,
                              },
                            },
                          };
                        });
                      }}
                    />
                  </label>

                  <label className="graphicsPresetAdminField">
                    <span>luminanceSmoothing</span>
                    <input
                      type="number"
                      step="0.01"
                      value={active.postFx.bloom.luminanceSmoothing}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.bloom) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              bloom: {
                                ...current.postFx.bloom,
                                luminanceSmoothing: value,
                              },
                            },
                          };
                        });
                      }}
                    />
                  </label>

                  <label className="graphicsPresetAdminField">
                    <span>radius</span>
                    <input
                      type="number"
                      step="0.01"
                      value={active.postFx.bloom.radius}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.bloom) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              bloom: {
                                ...current.postFx.bloom,
                                radius: value,
                              },
                            },
                          };
                        });
                      }}
                    />
                  </label>

                  <label className="graphicsPresetAdminCheckbox">
                    <input
                      type="checkbox"
                      checked={active.postFx.bloom.mipmapBlur}
                      onChange={(event) =>
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.bloom) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              bloom: {
                                ...current.postFx.bloom,
                                mipmapBlur: event.target.checked,
                              },
                            },
                          };
                        })
                      }
                    />
                    <span>mipmapBlur</span>
                  </label>
                </div>
              ) : null}
            </div>

            <div className="graphicsPresetAdminGroup">
              <div className="graphicsPresetAdminGroupHeader">
                <strong>Vignette</strong>
                <button
                  type="button"
                  className="graphicsPresetAdminToggle"
                  onClick={() =>
                    updatePreset(activePresetId, (current) => ({
                      ...current,
                      postFx: {
                        ...current.postFx,
                        vignette: current.postFx.vignette
                          ? null
                          : {
                              ...(defaultActive.postFx.vignette ?? {
                                offset: 0.32,
                                darkness: 0.62,
                              }),
                            },
                      },
                    }))
                  }
                >
                  {active.postFx.vignette ? 'Отключить' : 'Включить'}
                </button>
              </div>

              {active.postFx.vignette ? (
                <div className="graphicsPresetAdminGrid">
                  <label className="graphicsPresetAdminField">
                    <span>offset</span>
                    <input
                      type="number"
                      step="0.01"
                      value={active.postFx.vignette.offset}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.vignette) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              vignette: {
                                ...current.postFx.vignette,
                                offset: value,
                              },
                            },
                          };
                        });
                      }}
                    />
                  </label>

                  <label className="graphicsPresetAdminField">
                    <span>darkness</span>
                    <input
                      type="number"
                      step="0.01"
                      value={active.postFx.vignette.darkness}
                      onChange={(event) => {
                        const value = parseNumberInput(event.target.value);
                        if (value == null) return;
                        updatePreset(activePresetId, (current) => {
                          if (!current.postFx.vignette) return current;
                          return {
                            ...current,
                            postFx: {
                              ...current.postFx,
                              vignette: {
                                ...current.postFx.vignette,
                                darkness: value,
                              },
                            },
                          };
                        });
                      }}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="graphicsPresetAdminFooter">
          <button
            type="button"
            className="graphicsPresetAdminAction"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>

        {statusText ? <div className="graphicsPresetAdminStatus">{statusText}</div> : null}
      </div>
    </div>
  );
}
