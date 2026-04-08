import * as React from 'react';
import { GlassDropdown } from '../GlassDropdown';
import { GRAPHICS_PRESETS, type GraphicsPresetId } from '../../map/graphicsPresets';

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
                        <button
                            className="topSearchClear"
                            type="button"
                            aria-label="Очистить категорию и поле поиска"
                            title="очистить категорию и поле поиска"
                            onClick={onClearSearch}
                        >
                            ×
                        </button>
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
                                                <button
                                                    key={`cur-${item.buildId}-${item.floorId}-${item.key}`}
                                                    type="button"
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
                                                </button>
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
                                                    <button
                                                        key={`oth-${item.buildId}-${item.floorId}-${item.key}`}
                                                        type="button"
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
                                                    </button>
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
                                                    <button
                                                        key={`cat-${category}`}
                                                        type="button"
                                                        className="smartSearchCategoryItem"
                                                        onClick={() => {
                                                            onPickSearchCategory(category);
                                                            setSearchOpen(false);
                                                            searchInputRef.current?.blur();
                                                        }}
                                                    >
                                                        {category}
                                                    </button>
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

            <button className="topButton topThemeButton topDesktopOnly" type="button" onClick={onToggleTheme}>
                {theme === 'light' ? 'Тёмная тема 🌃' : 'Светлая тема 🌞'}
            </button>

                <button
                    className={isAdminMode ? 'topButton topDesktopOnly adminModeButton adminModeButtonActive' : 'topButton topDesktopOnly adminModeButton'}
                    type="button"
                    onClick={onToggleAdminMode}
                >
                    {isAdminMode ? 'Админ: ВКЛ' : 'админ'}
                </button>

                <button className="topButton topDesktopOnly" type="button" onClick={() => setBugReportOpen(true)}>
                    Сообщить об ошибке
                </button>

                <button
                    className="topButton mobileControlsButton"
                    type="button"
                    aria-label="Открыть боковое меню"
                    onClick={() => setMobileControlsOpen(true)}
                >
                    ☰
                </button>
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
                            <button
                                className="topButton mobileControlsClose"
                                type="button"
                                onClick={() => setMobileControlsOpen(false)}
                            >
                                ×
                            </button>
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
                                    {GRAPHICS_PRESETS.map((p) => {
                                        const selected = graphicsPreset === p.id;
                                        const needsWarning = p.id === 'medium' || p.id === 'max';
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                className={
                                                    selected
                                                        ? 'topButton graphicsButton graphicsButtonSelected'
                                                        : 'topButton graphicsButton'
                                                }
                                                aria-pressed={selected}
                                                onClick={() => onSelectPreset(p.id)}
                                                title={p.title}
                                            >
                                                {p.label}
                                                {needsWarning ? <span className="graphicsWarningMark" aria-hidden>⚠️</span> : null}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="graphicsWarningText">
                                    <span className="graphicsWarningMark" aria-hidden>⚠️</span>
                                    Только для мощных устройств, возможно снижение плавности
                                </div>
                            </div>

                            <div className="mobileControlsRow">
                                <button className="topButton" type="button" onClick={onToggleTheme}>
                                    {theme === 'light' ? 'Тёмная тема 🌃' : 'Светлая тема 🌞'}
                                </button>
                            </div>

                            <div className="mobileControlsRow">
                                <button
                                    className={isLocationTracking
                                        ? 'topButton locationButton locationButtonActive'
                                        : 'topButton locationButton'}
                                    type="button"
                                    onClick={onLocateUser}
                                    aria-pressed={isLocationTracking}
                                >
                                    {isLocationTracking ? 'GPS: ВКЛ' : 'Моё местоположение'}
                                </button>
                            </div>

                            {locationStatusText ? (
                                <div className="mobileControlsRow">
                                    <div className="locationStatusText" aria-live="polite">{locationStatusText}</div>
                                </div>
                            ) : null}

                            <div className="mobileControlsRow">
                                <button
                                    className={isAdminMode ? 'topButton adminModeButton adminModeButtonActive' : 'topButton adminModeButton'}
                                    type="button"
                                    onClick={onToggleAdminMode}
                                >
                                    {isAdminMode ? 'Админ: ВКЛ' : 'админ'}
                                </button>
                            </div>

                            <div className="mobileControlsRow">
                                <button
                                    className="topButton"
                                    type="button"
                                    onClick={() => {
                                        setMobileControlsOpen(false);
                                        setBugReportOpen(true);
                                    }}
                                >
                                    Сообщить об ошибке
                                </button>
                            </div>
                        </div>
                    </aside>
                </div>
            ) : null}

            {bugReportOpen ? (
                <div className="bugReportOverlay" role="dialog" aria-modal="true" aria-label="Сообщение об ошибке">
                    <form className="bugReportModal" onSubmit={submitBugReport}>
                        <div className="bugReportTitle">Сообщение об ошибке</div>
                        <textarea
                            className="bugReportInput"
                            value={bugReportText}
                            onChange={(event) => setBugReportText(event.target.value)}
                            placeholder="Опишите проблему"
                            required
                            autoFocus
                        />
                        <div className="bugReportActions">
                            <button
                                className="topButton bugReportButton"
                                type="button"
                                onClick={() => {
                                    setBugReportOpen(false);
                                    setBugReportText('');
                                }}
                            >
                                Отмена
                            </button>
                            <button className="topButton bugReportButton" type="submit">
                                Отправить
                            </button>
                        </div>
                    </form>
                </div>
            ) : null}
        </>
    );
}
