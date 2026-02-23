import * as React from 'react';
import { GlassDropdown } from '../GlassDropdown';

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

  theme: 'light' | 'dark';
  onToggleTheme: () => void;
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
  theme,
  onToggleTheme,
}: TopBarProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchWrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onDocPointerDown = (e: MouseEvent) => {
      const root = searchWrapRef.current;
      const target = e.target as Node | null;
      if (!root || !target) return;
      if (!root.contains(target)) setSearchOpen(false);
    };

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
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

  return (
    <div className="topBar">
      <GlassDropdown
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
        <GlassDropdown
          value={selectedCategory}
          onChange={onCategoryChange}
          buttonClassName="topSelect topSelectCategory"
          options={[
            { value: '__all__', label: 'Все категории' },
            ...categoryOptions.map((c) => ({ value: c, label: c })),
          ]}
        />
      </div>

      <div className="topCountBadge" aria-label="Найдено помещений">
        {matchedRooms}/{totalRooms}
      </div>

      <div className="topSearchWrap" ref={searchWrapRef}>
        {searchText.length > 0 ? (
          <button className="topSearchClear" type="button" aria-label="Очистить поиск" onClick={onClearSearch}>
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
          placeholder="Поиск по номеру или описанию"
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
                          {[
                            item.roomNo.length > 0 ? `№ ${item.roomNo}` : 'Без номера',
                            item.category,
                            item.description,
                          ]
                            .filter((v) => v.length > 0)
                            .join(' · ')}
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
                            {[
                              item.roomNo.length > 0 ? `№ ${item.roomNo}` : 'Без номера',
                              item.category,
                              item.description,
                            ]
                              .filter((v) => v.length > 0)
                              .join(' · ')}
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

      <button className="topButton topThemeButton" type="button" onClick={onToggleTheme}>
        {theme === 'light' ? 'Ночная тема 🌃' : 'Дневная тема 🌞'}
      </button>

      <button className="topButton" type="button">
        Сообщить об ошибке
      </button>
    </div>
  );
}
