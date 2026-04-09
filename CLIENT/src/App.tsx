import './App.css'
import { FloorPlanCanvas } from './map/FloorPlanCanvas'
import { RoomInfoModal } from './map/rooms/components/RoomInfoModal'
import { RoomHoverTooltip } from './map/rooms/components/RoomHoverTooltip'
import { TopBar } from './components/app/TopBar'
import { FloorsPanel } from './components/app/FloorsPanel'
import { GraphicsPanel } from './components/app/GraphicsPanel'
import { GraphicsPresetAdminModal } from './components/app/GraphicsPresetAdminModal'
import { OfficesDirectory } from './components/app/OfficesDirectory'
import { buildLabel, floorLabel } from './app/utils/roomLabels'
import { useBuildMapApp } from './app/hooks/useBuildMapApp'
import gpsButtonIcon from '../assets/icon/free-icon-gps-navigation-4398552.png'

function App() {
  const {
    error,
    rooms,
    selectedRoomKey,
    hoveredRoom,
    hoverAnchor,
    searchInputRef,
    theme,
    graphicsPreset,
    graphicsPresetRefreshToken,
    graphicsOpen,
    isGraphicsPresetsModalOpen,
    graphicsPresetsById,
    isSavingGraphicsPresets,
    graphicsPresetsStatusText,
    selectedBuild,
    selectedFloor,
    titleAnchor,
    selectedCategory,
    searchText,
    searchResultJumpTrigger,
    roomGraph,
    mapMode,
    routeFrom,
    routeTo,
    activeRouteEndpoint,
    routeDistanceM,
    routeSegments,
    routeFloorJumps,
    routeHints,
    showGraphOverlay,
    officesHierarchy,
    isAdminMode,
    geoFileStatusText,
    isLocationTracking,
    isLocating,
    locationStatusText,
    modalAnchor,
    isTouchDevice,
    selectedRoom,
    buildOptions,
    floorOptions,
    titleText,
    categoryOptions,
    selectedCategoryColor,
    selectedGeoDraft,
    selectedGeoFilledCount,
    selectedGeoRealCardinalLabels,
    selectedGeoMarkers,
    activeUserLocationOverlay,
    matchedKeys,
    smartSearchData,
    totalRooms,
    matchedRooms,
    geoCornerIds,

    setSelectedFloor,
    setGraphicsPreset,
    setSearchText,
    setSelectedCategory,

    onBuildChange,
    onClearSearch,
    onPickSearchRoom,
    onPickSearchCategory,
    onToggleTheme,
    toggleAdminMode,
    locateUserOnMap,
    onToggleGraphicsPanel,
    onGraphicsPresetsEditorActivePresetChange,
    previewGraphicsPresetsDraft,
    openGraphicsPresetsModal,
    closeGraphicsPresetsModal,
    onToggleGraphOverlay,
    onRouteFloorJump,
    onSelectRoomKey,
    onOpenRoom,
    onHoverRoom,
    onSaveSelectedRoomChanges,
    onBuildRouteFromRoom,
    onCloseRoomModal,
    updateGeoCornerInput,
    clearSelectedBuildGeoInputs,
    saveSelectedBuildGeoToFile,
    openOfficeOnMap,
    onSetRouteModeNormal,
    onSetRouteModeRoutes,
    onSetActiveRouteFrom,
    onSetActiveRouteTo,
    onSetMainEntrance,
  } = useBuildMapApp()

  if (error) {
    return (
      <div className="appError">
        <div className="appErrorTitle">Failed to load room data</div>
        <pre className="appErrorDetails">{error}</pre>
      </div>
    )
  }

  return (
    <div className="appRoot" data-theme={theme}>
      <TopBar
        selectedBuild={selectedBuild}
        buildOptions={buildOptions}
        buildLabel={buildLabel}
        onBuildChange={onBuildChange}
        selectedCategory={selectedCategory}
        categoryOptions={categoryOptions}
        selectedCategoryColor={selectedCategoryColor}
        onCategoryChange={setSelectedCategory}
        matchedRooms={matchedRooms}
        totalRooms={totalRooms}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        onClearSearch={onClearSearch}
        searchInputRef={searchInputRef}
        smartSearchData={smartSearchData}
        floorLabel={floorLabel}
        onPickSearchRoom={onPickSearchRoom}
        onPickSearchCategory={onPickSearchCategory}
        graphicsPreset={graphicsPreset}
        onSelectPreset={setGraphicsPreset}
        theme={theme}
        onToggleTheme={onToggleTheme}
        isAdminMode={isAdminMode}
        onToggleAdminMode={toggleAdminMode}
        isLocationTracking={isLocationTracking}
        onLocateUser={locateUserOnMap}
        locationStatusText={locationStatusText}
      />

      <FloorsPanel
        floorOptions={floorOptions}
        selectedFloor={selectedFloor}
        floorLabel={floorLabel}
        onSelectFloor={setSelectedFloor}
      />

      <GraphicsPanel
        graphicsOpen={graphicsOpen}
        onToggle={onToggleGraphicsPanel}
        graphicsPreset={graphicsPreset}
        onSelectPreset={setGraphicsPreset}
        showGraphOverlay={showGraphOverlay}
        onToggleGraphOverlay={onToggleGraphOverlay}
        isAdminMode={isAdminMode}
        onOpenPresetSettings={openGraphicsPresetsModal}
      />

      <GraphicsPresetAdminModal
        isOpen={isGraphicsPresetsModalOpen}
        presetsById={graphicsPresetsById}
        activeGraphicsPreset={graphicsPreset}
        isSaving={isSavingGraphicsPresets}
        statusText={graphicsPresetsStatusText}
        onClose={closeGraphicsPresetsModal}
        onActivePresetChange={onGraphicsPresetsEditorActivePresetChange}
        onDraftChange={previewGraphicsPresetsDraft}
      />

      <div className="appMain">
        <FloorPlanCanvas
          rooms={rooms}
          roomGraph={roomGraph}
          theme={theme}
          isAdminMode={isAdminMode}
          graphicsPreset={graphicsPreset}
          graphicsPresetConfig={graphicsPresetsById[graphicsPreset]}
          graphicsPresetRefreshToken={graphicsPresetRefreshToken}
          searchText={searchText}
          matchedKeys={matchedKeys}
          searchResultJumpTrigger={searchResultJumpTrigger}
          routeSegments={routeSegments}
          routeFloorJumps={routeFloorJumps}
          onRouteFloorJump={onRouteFloorJump}
          showGraphOverlay={showGraphOverlay}
          userLocationOverlay={activeUserLocationOverlay}
          geoAnchorMarkers={selectedGeoMarkers}
          titleText={titleText}
          titleAnchor={titleAnchor}
          selectedRoomKey={selectedRoomKey}
          onSelectRoomKey={onSelectRoomKey}
          onOpenRoom={onOpenRoom}
          onHoverRoom={onHoverRoom}
        />
      </div>

      {!isTouchDevice && !selectedRoom && hoveredRoom && hoverAnchor ? (
        <RoomHoverTooltip room={hoveredRoom} anchor={hoverAnchor} />
      ) : null}

      {mapMode !== 'routes' && selectedRoom && modalAnchor ? (
        <RoomInfoModal
          room={selectedRoom}
          anchor={modalAnchor}
          isAdminMode={isAdminMode}
          onSaveRoom={onSaveSelectedRoomChanges}
          onBuildRoute={onBuildRouteFromRoom}
          onClose={onCloseRoomModal}
        />
      ) : null}

      {mapMode === 'routes' && routeHints.length > 0 ? (
        <div className="routeHintsWrap" aria-live="polite">
          {routeHints.map((hint, idx) => (
            <div key={`route-hint-${idx}`} className="routeHintItem">{hint}</div>
          ))}
        </div>
      ) : null}

      {locationStatusText ? (
        <div className="locationStatusFloating" aria-live="polite">{locationStatusText}</div>
      ) : null}

      {isAdminMode && selectedGeoDraft ? (
        <div className="geoAdminPanel">
          <div className="geoAdminHeader">
            <div className="geoAdminTitle">Геопривязка: {buildLabel(selectedBuild)}</div>
            <div className="geoAdminMeta">Этаж: {floorLabel(selectedGeoDraft.floorId)} · заполнено: {selectedGeoFilledCount}/4</div>
            {selectedFloor !== selectedGeoDraft.floorId ? (
              <div className="geoAdminWarn">Для наглядности точек переключитесь на {floorLabel(selectedGeoDraft.floorId)}</div>
            ) : null}
          </div>

          <div className="geoAdminRows">
            {geoCornerIds.map((id) => {
              const corner = selectedGeoDraft.corners[id]
              return (
                <div key={`geo-${id}`} className="geoAdminRow">
                  <div className="geoAdminCornerLabelWrap">
                    <div className="geoAdminCornerLabel">{corner.label}</div>
                    <div className="geoAdminCornerGeoLabel">
                      По карте: {selectedGeoRealCardinalLabels[id] ?? 'определится после ввода координат'}
                    </div>
                  </div>
                  <input
                    className="geoAdminInput"
                    placeholder="Широта"
                    value={corner.latInput}
                    onChange={(e) => updateGeoCornerInput(id, 'latInput', e.target.value)}
                  />
                  <input
                    className="geoAdminInput"
                    placeholder="Долгота"
                    value={corner.lonInput}
                    onChange={(e) => updateGeoCornerInput(id, 'lonInput', e.target.value)}
                  />
                  <div className="geoAdminMapCoord" title="Координаты точки на плане">
                    x: {corner.mapX.toFixed(2)} · y: {corner.mapY.toFixed(2)}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="geoAdminActions">
            <button type="button" className="geoAdminClearBtn" onClick={clearSelectedBuildGeoInputs}>
              Очистить 
            </button>
            <button type="button" className="geoAdminSaveBtn" onClick={saveSelectedBuildGeoToFile}>
              Сохранить
            </button>
            <div className="geoAdminHint">
              Для позиционирования заполните минимум 3 угла, рекомендуется все 4.
            </div>
          </div>
          {geoFileStatusText ? <div className="geoAdminFileStatus" aria-live="polite">{geoFileStatusText}</div> : null}
        </div>
      ) : null}

      <OfficesDirectory
        data={officesHierarchy}
        buildLabel={buildLabel}
        floorLabel={floorLabel}
        onOpenCabinet={openOfficeOnMap}
      />

      <div className="mapModeDock" aria-label="Режим карты">
        <button
          type="button"
          className={mapMode === 'normal' ? 'mapModeBtn mapModeBtnActive' : 'mapModeBtn'}
          onClick={onSetRouteModeNormal}
        >
          Обычный
        </button>
        <button
          type="button"
          className={mapMode === 'routes' ? 'mapModeBtn mapModeBtnActive' : 'mapModeBtn'}
          onClick={onSetRouteModeRoutes}
        >
          Маршруты
        </button>
        <button
          type="button"
          className={'mapModeBtn'}
        >
          Расписание
        </button>
      </div>

      <button
        type="button"
        className={isLocationTracking ? 'gpsFab gpsFabActive' : 'gpsFab'}
        onClick={locateUserOnMap}
        aria-label={isLocationTracking ? 'Выключить позиционирование' : 'Включить позиционирование'}
        title={isLocationTracking
          ? (isLocating ? 'GPS: идёт уточнение местоположения' : 'Выключить GPS')
          : 'Включить GPS'}
      >
        <img className="gpsFabIcon" src={gpsButtonIcon} alt="" aria-hidden="true" />
      </button>

      {mapMode === 'routes' ? (
        <div className="routeBottomCluster">
          <div className="routeInfoBlock routeInfoBlockLeft" aria-hidden>
            <div className="routeInfoText">
              ℹ️Выберите пункты (откуда / куда), укажите нужное помещение на карте, либо воспользуйтесь поиском сверху.
              Указатели на лестницах говорят о том, что нужно перейти с этажа на этаж
            </div>
          </div>

          <div className="mapModeSwitchWrap">
            <div className="mapModeRouteMeta">
              <div className="routeEndpointSwitch">
                <button
                  type="button"
                  className={activeRouteEndpoint === 'from' ? 'routeEndpointBtn routeEndpointBtnActive' : 'routeEndpointBtn'}
                  onClick={onSetActiveRouteFrom}
                >
                  Откуда
                </button>
                <button
                  type="button"
                  className={activeRouteEndpoint === 'to' ? 'routeEndpointBtn routeEndpointBtnActive' : 'routeEndpointBtn'}
                  onClick={onSetActiveRouteTo}
                >
                  Куда
                </button>
                <button
                  type="button"
                  className="routeMainEntranceBtn"
                  onClick={onSetMainEntrance}
                  title="Сбросить точку старта к главному входу"
                >
                  От главного входа
                </button>
              </div>
              <div className="routeMetaLine">Откуда: {routeFrom ? routeFrom.label : 'Главный вход'}</div>
              <div className="routeMetaLine">Куда: {routeTo ? routeTo.label : 'Выберите кабинет или воспользуйтесь поиском'}</div>
              {routeDistanceM != null ? <div className="routeMetaDistance">Длина: {routeDistanceM.toFixed(1)} м</div> : null}
            </div>
          </div>

          <div className="routeInfoBlock routeInfoBlockRight" aria-hidden>
            <div className="routeInfoTitle">⚠️Внимание!</div>
            <div className="routeInfoText">
              Система очень пытается всё учесть, но в редких случаях маршрут может строиться сквозь закрытые двери
              и технические помещения( Просьба обращать внимание на локальные особенности внутри зданий
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
