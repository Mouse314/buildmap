import * as React from 'react';
import { GlassDropdown } from '../GlassDropdown';
import { listGraphicsPresets, type GraphicsPresetId } from '../../map/graphicsPresets';
import { HudButton, HudModal } from '../ui/hud';

type SearchIndexedRoom = {
    key: string;
    buildId: string;
    floorId: string;
    roomNo: string;
    description: string;
    category: string;
};

type TopBarProps = {
    selectedBuild: string;
    buildOptions: string[];
    buildLabel: (id: string) => string;
    onBuildChange: (next: string) => void;

    selectedCategory: string;
    categoryOptions: string[];
    selectedCategoryColor: string | null;
    onCategoryChange: (next: string) => void;

    matchedRooms: number;
    totalRooms: number;

    searchText: string;
    onSearchTextChange: (text: string) => void;
    onClearSearch: () => void;
    searchInputRef: React.RefObject<HTMLInputElement | null>;
    smartSearchData: {
        currentBuildMatches: SearchIndexedRoom[];
        otherBuildMatches: SearchIndexedRoom[];
        categoryMatches: string[];
    };
    floorLabel: (id: string) => string;
    onPickSearchRoom: (item: SearchIndexedRoom) => void;
    onPickSearchCategory: (category: string) => void;

    graphicsPreset: GraphicsPresetId;
    onSelectPreset: (preset: GraphicsPresetId) => void;

    theme: 'light' | 'dark';
    onToggleTheme: () => void;

    isAdminMode: boolean;
    onToggleAdminMode: () => void;

    isLocationTracking: boolean;
    onLocateUser: () => void;
    locationStatusText: string | null;
};

export function TopBar({
    selectedBuild,
    buildOptions,
    buildLabel,
    onBuildChange,
    selectedCategory,
    categoryOptions,
    selectedCategoryColor,
    onCategoryChange,
    matchedRooms,
    totalRooms,
    searchText,
    onSearchTextChange,
    onClearSearch,
    searchInputRef,
    smartSearchData,
    floorLabel,
    onPickSearchRoom,
    onPickSearchCategory,
    graphicsPreset,
    onSelectPreset,
    theme,
    onToggleTheme,
    isAdminMode,
    onToggleAdminMode,
    isLocationTracking,
    onLocateUser,
    locationStatusText,
}: TopBarProps) {
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [mobileControlsOpen, setMobileControlsOpen] = React.useState(false);
    const [bugReportOpen, setBugReportOpen] = React.useState(false);
    const [bugReportText, setBugReportText] = React.useState('');
    const graphicsPresets = listGraphicsPresets();
    const searchWrapRef = React.useRef<HTMLDivElement | null>(null);
    function formatSearchPrimary(item: SearchIndexedRoom): string {
        const roomPart = item.roomNo.length > 0 ? `№ ${item.roomNo}` : 'Без номера';
        const details = item.description.length > 0 ? item.description : item.category;
        return details.length > 0 ? `${roomPart} · ${details}` : roomPart;
    }

    React.useEffect(() => {
        const onDocPointerDown = (e: MouseEvent) => {
            const root = searchWrapRef.current;
            const target = e.target as Node | null;
            if (!root || !target) return;
            if (!root.contains(target)) setSearchOpen(false);
        };

        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSearchOpen(false);
                setMobileControlsOpen(false);
            }
        };

        document.addEventListener('mousedown', onDocPointerDown);
        window.addEventListener('keydown', onEsc);

        return () => {
            document.removeEventListener('mousedown', onDocPointerDown);
            window.removeEventListener('keydown', onEsc);
        };
    }, []);

    const hasCurrent = smartSearchData.currentBuildMatches.length > 0;
    const hasOther = smartSearchData.otherBuildMatches.length > 0;
    const hasCategories = smartSearchData.categoryMatches.length > 0;
    const hasAnyBlock = hasCurrent || hasOther || hasCategories;

    const groupsCount = Number(hasCurrent) + Number(hasOther) + Number(hasCategories);

    const submitBugReport = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const message = bugReportText.trim();
        if (message.length === 0) return;

        const selectedCategoryLabel = selectedCategory === '__all__' ? 'Не выбрано' : selectedCategory;
        const subject = encodeURIComponent('Сообщение об ошибке BuildMap');
        const body = encodeURIComponent(
            `Описание проблемы:\n${message}\n\nКонтекст:\nКорпус: ${buildLabel(selectedBuild)}\nКатегория: ${selectedCategoryLabel}`,
        );

        window.location.href = `mailto:andryuhich2009@gmail.com?subject=${subject}&body=${body}`;
        setBugReportOpen(false);
        setBugReportText('');
    };

    return (
        <>
            <div className="topBar">
                <GlassDropdown className='buildSelector topDesktopOnly'
                    value={selectedBuild}
                    onChange={onBuildChange}
                    buttonClassName="topSelect"
                    options={buildOptions.map((b) => ({ value: b, label: buildLabel(b) }))}
                />

            <div
                className="topSelectAccentWrap"
                data-active={selectedCategory !== '__all__' && selectedCategoryColor ? 'true' : 'false'}
                style={
                    selectedCategory !== '__all__' && selectedCategoryColor
                        ? ({ ['--accent-color']: selectedCategoryColor } as React.CSSProperties)
                        : undefined
                }
            >
                <div className="topCountBadge" title="Показано помещений / всего помещений">
                    {matchedRooms}/{totalRooms}
                </div>




                <div className="topSearchWrap" ref={searchWrapRef}>
                    <div className='searchWrapper'>
                        <GlassDropdown
                            value={selectedCategory}
                            onChange={onCategoryChange}
                            buttonClassName="topSelect topSelectCategory"
                            options={[
                                { value: '__all__', label: 'Не выбрано' },
                                ...categoryOptions.map((c) => ({ value: c, label: c })),
                            ]}
                        />
                    </div>
                    {searchText.length > 0 || selectedCategory !== '__all__' ? (
                        <HudButton
                            title="×"
                            data={{ action: 'clear-search' }}
                            className="topSearchClear"
                            aria-label="Очистить категорию и поле поиска"
                            hint="очистить категорию и поле поиска"
                            onClick={onClearSearch}
                        >
                            ×
                        </HudButton>
                    ) : null}
                    <input
                        ref={searchInputRef}
                        className="topSearch"
                        value={searchText}
                        onChange={(e) => onSearchTextChange(e.target.value)}
                        onFocus={() => setSearchOpen(true)}
                        onClick={() => setSearchOpen(true)}
                        placeholder="Поиск по номеру кабинета или категории / описанию помещения в ВятГУ"
                    />

                    <div className={searchOpen ? 'smartSearchPanel smartSearchPanelOpen' : 'smartSearchPanel'}>
                        {hasAnyBlock ? (
                            <>
                                {hasCurrent ? (
                                    <div className="smartSearchGroup">
                                        <div className="smartSearchGroupTitle">В текущем корпусе</div>
                                        <div className="smartSearchItems">
                                            {smartSearchData.currentBuildMatches.map((item) => (
                                                <HudButton
                                                    key={`cur-${item.buildId}-${item.floorId}-${item.key}`}
                                                    title={formatSearchPrimary(item)}
                                                    context={floorLabel(item.floorId)}
                                                    data={{ action: 'pick-current-build-room', roomKey: item.key }}
                                                    className="smartSearchItem"
                                                    onClick={() => {
                                                        onPickSearchRoom(item);
                                                        setSearchOpen(false);
                                                        searchInputRef.current?.blur();
                                                    }}
                                                >
                                                    <span className="smartSearchPrimary">
                                                            {formatSearchPrimary(item)}
                                                    </span>
                                                    <span className="smartSearchSecondary">{floorLabel(item.floorId)}</span>
                                                </HudButton>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                {hasOther ? (
                                    <>
                                        {groupsCount > 1 && hasCurrent ? <div className="smartSearchDivider" /> : null}
                                        <div className="smartSearchGroup">
                                            <div className="smartSearchGroupTitle">В других корпусах</div>
                                            <div className="smartSearchItems">
                                                {smartSearchData.otherBuildMatches.map((item) => (
                                                    <HudButton
                                                        key={`oth-${item.buildId}-${item.floorId}-${item.key}`}
                                                        title={formatSearchPrimary(item)}
                                                        context={`${buildLabel(item.buildId)} · ${floorLabel(item.floorId)}`}
                                                        data={{ action: 'pick-other-build-room', roomKey: item.key }}
                                                        className="smartSearchItem"
                                                        onClick={() => {
                                                            onPickSearchRoom(item);
                                                            setSearchOpen(false);
                                                            searchInputRef.current?.blur();
                                                        }}
                                                    >
                                                        <span className="smartSearchPrimary">
                                                                {formatSearchPrimary(item)}
                                                        </span>
                                                        <span className="smartSearchSecondary">{buildLabel(item.buildId)} · {floorLabel(item.floorId)}</span>
                                                    </HudButton>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : null}

                                {hasCategories ? (
                                    <>
                                        {groupsCount > 1 && (hasCurrent || hasOther) ? <div className="smartSearchDivider" /> : null}
                                        <div className="smartSearchGroup">
                                            <div className="smartSearchGroupTitle">Категории</div>
                                            <div className="smartSearchItems smartSearchItemsCategories">
                                                {smartSearchData.categoryMatches.map((category) => (
                                                    <HudButton
                                                        key={`cat-${category}`}
                                                        title={category}
                                                        data={{ action: 'pick-category', category }}
                                                        className="smartSearchCategoryItem"
                                                        onClick={() => {
                                                            onPickSearchCategory(category);
                                                            setSearchOpen(false);
                                                            searchInputRef.current?.blur();
                                                        }}
                                                    >
                                                        {category}
                                                    </HudButton>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : null}
                            </>
                        ) : (
                            <div className="smartSearchEmpty">
                                {searchText.trim().length === 0 ? 'Начните вводить запрос' : 'Ничего не найдено'}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <HudButton
                title={theme === 'light' ? 'Тёмная тема 🌃' : 'Светлая тема 🌞'}
                data={{ action: 'toggle-theme' }}
                className="topButton topThemeButton topDesktopOnly"
                onClick={onToggleTheme}
            >
                {theme === 'light' ? 'Тёмная тема 🌃' : 'Светлая тема 🌞'}
            </HudButton>

                <HudButton
                    title={isAdminMode ? 'Админ: ВКЛ' : 'админ'}
                    data={{ action: 'toggle-admin' }}
                    className={isAdminMode ? 'topButton topDesktopOnly adminModeButton adminModeButtonActive' : 'topButton topDesktopOnly adminModeButton'}
                    onClick={onToggleAdminMode}
                >
                    {isAdminMode ? 'Админ: ВКЛ' : 'админ'}
                </HudButton>

                <HudButton
                    title="Сообщить об ошибке"
                    data={{ action: 'open-bug-report' }}
                    className="topButton topDesktopOnly"
                    onClick={() => setBugReportOpen(true)}
                >
                    Сообщить об ошибке
                </HudButton>

                <HudButton
                    title="☰"
                    data={{ action: 'open-mobile-controls' }}
                    className="topButton mobileControlsButton"
                    aria-label="Открыть боковое меню"
                    onClick={() => setMobileControlsOpen(true)}
                >
                    ☰
                </HudButton>
            </div>

            {mobileControlsOpen ? (
                <div className="mobileControlsOverlay" onClick={() => setMobileControlsOpen(false)}>
                    <aside
                        className="mobileControlsPanel"
                        aria-label="Мобильное боковое меню"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mobileControlsHeader">
                            <div className="mobileControlsTitle">Меню</div>
                            <HudButton
                                title="×"
                                data={{ action: 'close-mobile-controls' }}
                                className="roomModalClose mobileControlsClose"
                                onClick={() => setMobileControlsOpen(false)}
                            >
                                ×
                            </HudButton>
                        </div>

                        <div className="mobileControlsBody">
                            <div className="mobileControlsRow">
                                <GlassDropdown
                                    value={selectedBuild}
                                    onChange={onBuildChange}
                                    buttonClassName="topSelect"
                                    options={buildOptions.map((b) => ({ value: b, label: buildLabel(b) }))}
                                />
                            </div>

                            <div className="mobileControlsRow">
                                <GlassDropdown
                                    value={selectedCategory}
                                    onChange={onCategoryChange}
                                    buttonClassName="topSelect"
                                    options={[
                                        { value: '__all__', label: 'Не выбрано' },
                                        ...categoryOptions.map((c) => ({ value: c, label: c })),
                                    ]}
                                />
                            </div>

                            <div className="mobileControlsRow">
                                <div className="topCountBadge" title="Показано помещений / всего помещений">
                                    {matchedRooms}/{totalRooms}
                                </div>
                            </div>

                            <div className="mobileControlsRow">
                                <div className="mobileControlsSectionTitle">Настройки графики</div>
                                <div className="graphicsButtons mobileGraphicsButtons">
                                    {graphicsPresets.map((p) => {
                                        const selected = graphicsPreset === p.id;
                                        const needsWarning = p.id === 'medium' || p.id === 'max';
                                        return (
                                            <HudButton
                                                key={p.id}
                                                title={p.label}
                                                context={needsWarning ? 'Требует мощное устройство' : undefined}
                                                data={{ action: 'select-graphics-preset', presetId: p.id }}
                                                hint={p.title}
                                                className={
                                                    selected
                                                        ? 'topButton graphicsButton graphicsButtonSelected'
                                                        : 'topButton graphicsButton'
                                                }
                                                aria-pressed={selected}
                                                onClick={() => onSelectPreset(p.id)}
                                            >
                                                {p.label}
                                                {needsWarning ? <span className="graphicsWarningMark" aria-hidden>⚠️</span> : null}
                                            </HudButton>
                                        );
                                    })}
                                </div>
                                <div className="graphicsWarningText">
                                    <span className="graphicsWarningMark" aria-hidden>⚠️</span>
                                    Только для мощных устройств, возможно снижение плавности
                                </div>
                            </div>

                            <div className="mobileControlsRow">
                                <HudButton
                                    title={theme === 'light' ? 'Тёмная тема 🌃' : 'Светлая тема 🌞'}
                                    data={{ action: 'toggle-theme-mobile' }}
                                    className="topButton"
                                    onClick={onToggleTheme}
                                >
                                    {theme === 'light' ? 'Тёмная тема 🌃' : 'Светлая тема 🌞'}
                                </HudButton>
                            </div>

                            <div className="mobileControlsRow">
                                <HudButton
                                    title={isLocationTracking ? 'GPS: ВКЛ' : 'Моё местоположение'}
                                    data={{ action: 'toggle-location' }}
                                    className={isLocationTracking
                                        ? 'topButton locationButton locationButtonActive'
                                        : 'topButton locationButton'}
                                    onClick={onLocateUser}
                                    aria-pressed={isLocationTracking}
                                >
                                    {isLocationTracking ? 'GPS: ВКЛ' : 'Моё местоположение'}
                                </HudButton>
                            </div>

                            {locationStatusText ? (
                                <div className="mobileControlsRow">
                                    <div className="locationStatusText" aria-live="polite">{locationStatusText}</div>
                                </div>
                            ) : null}

                            <div className="mobileControlsRow">
                                <HudButton
                                    title={isAdminMode ? 'Админ: ВКЛ' : 'админ'}
                                    data={{ action: 'toggle-admin-mobile' }}
                                    className={isAdminMode ? 'topButton adminModeButton adminModeButtonActive' : 'topButton adminModeButton'}
                                    onClick={onToggleAdminMode}
                                >
                                    {isAdminMode ? 'Админ: ВКЛ' : 'админ'}
                                </HudButton>
                            </div>

                            <div className="mobileControlsRow">
                                <HudButton
                                    title="Сообщить об ошибке"
                                    data={{ action: 'open-bug-report-mobile' }}
                                    className="topButton"
                                    onClick={() => {
                                        setMobileControlsOpen(false);
                                        setBugReportOpen(true);
                                    }}
                                >
                                    Сообщить об ошибке
                                </HudButton>
                            </div>
                        </div>
                    </aside>
                </div>
            ) : null}

            <HudModal
                isOpen={bugReportOpen}
                onClose={() => {
                    setBugReportOpen(false);
                    setBugReportText('');
                }}
                title="Сообщение об ошибке"
                overlayClassName="bugReportOverlay"
                surfaceClassName="bugReportModal"
                titleClassName="bugReportTitle"
                bodyClassName="bugReportBody"
            >
                    <form className="bugReportForm" onSubmit={submitBugReport}>
                        <textarea
                            className="bugReportInput"
                            value={bugReportText}
                            onChange={(event) => setBugReportText(event.target.value)}
                            placeholder="Опишите проблему"
                            required
                            autoFocus
                        />
                        <div className="bugReportActions">
                            <HudButton
                                title="Отмена"
                                data={{ action: 'cancel-bug-report' }}
                                className="topButton bugReportButton"
                                onClick={() => {
                                    setBugReportOpen(false);
                                    setBugReportText('');
                                }}
                            >
                                Отмена
                            </HudButton>
                            <HudButton title="Отправить" data={{ action: 'submit-bug-report' }} className="topButton bugReportButton" type="submit">
                                Отправить
                            </HudButton>
                        </div>
                    </form>
            </HudModal>
        </>
    );
}
